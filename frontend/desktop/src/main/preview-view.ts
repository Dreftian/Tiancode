import { BrowserWindow, WebContentsView, ipcMain } from "electron"
import type { WebContents } from "electron"
import type { PreviewViewEvent, PreviewViewSelection, PreviewViewState } from "../preload/types"
import { write as writeLog } from "./logging"

// Vista en vivo real del panel "Vista en vivo" de la sesión: un
// WebContentsView con la partición "persist:live-view" (misma sesión de
// cookies/localStorage que usaba el <webview>, y mismo hardening por
// partición). Sustituye al webview tag: el renderer no contiene el guest,
// el main crea/posiciona/controla la vista con bounds reportados por el
// contenedor real del panel (getBoundingClientRect → IPC → setBounds).
//
// El WebContentsView no puede ocupar la ventana completa: sus bounds son los
// del pane "App" del panel, escalados por el zoom factor de la ventana para
// convertir CSS px → DIP.

const PREVIEW_PARTITION = "persist:live-view"
const MIN_ZOOM = 0.25
const MAX_ZOOM = 5

// Solo páginas locales del preview: el navegador interno navega a cualquier
// http(s) (como el webview anterior), más la página de bienvenida data:.
// Cualquier otro esquema (file:, custom:, …) se rechaza.
function isPreviewUrl(value: string) {
  try {
    const protocol = new URL(value).protocol
    return protocol === "http:" || protocol === "https:" || protocol === "data:" || protocol === "about:"
  } catch {
    return false
  }
}

// Script de selección de elementos inyectado con executeJavaScript (no lo
// bloquea la CSP de la página): overlay de crosshair que resalta el elemento
// bajo el cursor y al hacer clic guarda su descripción en
// window.__tiancode_selection. Un clic de tecla Escape sale del modo.
// El resultado se lee después con getSelection (executeJavaScript del main).
const SELECT_ENTER_SCRIPT = `(() => {
  if (window.__tiancodeSelectActive) return "active"
  const overlay = document.createElement("div")
  overlay.style.cssText = "position:fixed;inset:0;z-index:2147483647;cursor:crosshair;"
  const outline = document.createElement("div")
  outline.style.cssText = "position:fixed;display:none;z-index:2147483646;pointer-events:none;border:2px solid #4f8cff;background:rgba(79,140,255,.12);border-radius:2px;box-shadow:0 0 0 1px rgba(0,0,0,.35);"
  document.documentElement.appendChild(overlay)
  document.documentElement.appendChild(outline)
  const selectorFor = (el) => {
    if (el.id) return "#" + CSS.escape(el.id)
    const parts = []
    let node = el
    while (node && node.nodeType === 1 && node !== document.body && node !== document.documentElement) {
      let part = node.tagName.toLowerCase()
      if (node.id) { parts.unshift("#" + CSS.escape(node.id)); break }
      const cls = Array.from(node.classList).slice(0, 2).map((c) => "." + CSS.escape(c)).join("")
      if (cls) part += cls
      const parent = node.parentElement
      if (parent) {
        const sameTag = Array.from(parent.children).filter((s) => s.tagName === node.tagName)
        if (sameTag.length > 1) part += ":nth-child(" + (Array.from(parent.children).indexOf(node) + 1) + ")"
      }
      parts.unshift(part)
      node = parent
    }
    return parts.join(" > ")
  }
  const pick = (x, y) => {
    overlay.style.pointerEvents = "none"
    const el = document.elementFromPoint(x, y)
    overlay.style.pointerEvents = "auto"
    return el
  }
  const describe = (el) => {
    const r = el.getBoundingClientRect()
    const text = (el.innerText || el.textContent || "").replace(/\\s+/g, " ").trim().slice(0, 200)
    const className = typeof el.className === "string" ? el.className : ""
    return {
      tag: el.tagName.toLowerCase(),
      text,
      className,
      id: el.id || "",
      selector: selectorFor(el),
      url: location.href,
      pathname: location.pathname,
      dims: { width: Math.round(r.width), height: Math.round(r.height) },
      rect: { x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) },
    }
  }
  const move = (e) => {
    const el = pick(e.clientX, e.clientY)
    if (!el || el === overlay || el === outline) { outline.style.display = "none"; return }
    const r = el.getBoundingClientRect()
    outline.style.display = "block"
    outline.style.left = r.x + "px"
    outline.style.top = r.y + "px"
    outline.style.width = r.width + "px"
    outline.style.height = r.height + "px"
  }
  const click = (e) => {
    e.preventDefault()
    e.stopPropagation()
    const el = pick(e.clientX, e.clientY)
    if (el && el !== overlay && el !== outline) {
      window.__tiancode_selection = describe(el)
      console.log("[tiancode-selection]", "selected")
    }
    exit()
  }
  const key = (e) => { if (e.key === "Escape") exit() }
  const exit = () => {
    overlay.remove()
    outline.remove()
    overlay.removeEventListener("mousemove", move)
    overlay.removeEventListener("click", click, true)
    document.removeEventListener("keydown", key, true)
    window.__tiancodeSelectActive = false
    console.log("[tiancode-selection]", "exit")
  }
  window.__tiancodeSelectActive = true
  overlay.addEventListener("mousemove", move)
  overlay.addEventListener("click", click, true)
  document.addEventListener("keydown", key, true)
  return "ok"
})()`

const SELECT_EXIT_SCRIPT = `(() => {
  if (!window.__tiancodeSelectActive) return "inactive"
  document.querySelectorAll("[style*='z-index:2147483647']").forEach((el) => el.remove())
  document.querySelectorAll("[style*='z-index:2147483646']").forEach((el) => el.remove())
  window.__tiancodeSelectActive = false
  return "ok"
})()`

const SELECT_GET_SCRIPT = "window.__tiancode_selection ?? null"

type PreviewViewEntry = {
  view: WebContentsView
  win: BrowserWindow
  state: PreviewViewState
}

// Por ventana host (webContents.id del renderer): cada ventana tiene su
// propia vista del preview, como tenía su propio <webview>.
const previewViews = new Map<number, PreviewViewEntry>()

function sendState(entry: PreviewViewEntry) {
  const contents = entry.view.webContents
  entry.state = {
    url: contents.getURL(),
    loading: contents.isLoading(),
    canGoBack: contents.navigationHistory.canGoBack(),
    canGoForward: contents.navigationHistory.canGoForward(),
    visible: entry.view.getVisible(),
    selectMode: entry.state.selectMode,
  }
  if (!entry.win.isDestroyed() && !entry.win.webContents.isDestroyed()) {
    entry.win.webContents.send("preview-view-event", { type: "state", state: entry.state } satisfies PreviewViewEvent)
  }
}

function destroyPreviewView(hostId: number) {
  const entry = previewViews.get(hostId)
  if (!entry) return
  previewViews.delete(hostId)
  if (!entry.view.webContents.isDestroyed()) entry.view.webContents.close()
}

function getOrCreatePreviewView(hostId: number, win: BrowserWindow) {
  const existing = previewViews.get(hostId)
  if (existing && !existing.view.webContents.isDestroyed()) return existing

  const view = new WebContentsView({
    webPreferences: {
      partition: PREVIEW_PARTITION,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })
  const entry: PreviewViewEntry = { view, win, state: { url: "", loading: false, canGoBack: false, canGoForward: false, visible: false, selectMode: false } }
  previewViews.set(hostId, entry)

  view.setVisible(false)
  win.contentView.addChildView(view)

  // Las ventanas nuevas de las páginas del preview se deniegan (el webview
  // anterior tampoco tenía allowpopups); abrir fuera del preview es decisión
  // del usuario con el botón "abrir en externo".
  view.webContents.setWindowOpenHandler(({ url }) => {
    if (isPreviewUrl(url)) writeLog("preview-view", "blocked popup", { url }, "warn")
    return { action: "deny" }
  })

  const contents = view.webContents
  contents.on("did-start-loading", () => sendState(entry))
  contents.on("did-stop-loading", () => {
    sendState(entry)
    // La navegación resetea el estado de la página; si el modo seleccionar
    // sigue activo se vuelve a inyectar en la página nueva.
    if (entry.state.selectMode) void injectSelectScript(entry, true)
  })
  contents.on("did-navigate", () => sendState(entry))
  contents.on("did-navigate-in-page", () => sendState(entry))
  contents.on("did-fail-load", (_event, code, description, url, isMainFrame) => {
    sendState(entry)
    if (entry.win.isDestroyed() || entry.win.webContents.isDestroyed()) return
    entry.win.webContents.send("preview-view-event", {
      type: "fail",
      fail: { code, description, url, isMainFrame },
    } satisfies PreviewViewEvent)
  })
  contents.on("console-message", (_event, level, message, line, sourceId) => {
    if (entry.win.isDestroyed() || entry.win.webContents.isDestroyed()) return
    entry.win.webContents.send("preview-view-event", {
      type: "console",
      message: { level, message, line, sourceId },
    } satisfies PreviewViewEvent)
  })

  // La vista muere con su ventana (también al salir de la app).
  win.once("closed", () => destroyPreviewView(hostId))

  return entry
}

function previewFor(sender: WebContents) {
  const win = BrowserWindow.fromWebContents(sender)
  if (!win) return null
  return getOrCreatePreviewView(sender.id, win)
}

async function injectSelectScript(entry: PreviewViewEntry, enabled: boolean) {
  const contents = entry.view.webContents
  if (contents.isDestroyed()) return
  try {
    await contents.executeJavaScript(enabled ? SELECT_ENTER_SCRIPT : SELECT_EXIT_SCRIPT, true)
    entry.state.selectMode = enabled
    sendState(entry)
  } catch (error) {
    writeLog("preview-view", "select script failed", { error }, "warn")
  }
}

function clampZoom(value: number) {
  return Math.min(Math.max(value, MIN_ZOOM), MAX_ZOOM)
}

export function registerPreviewViewIpc() {
  // El renderer reporta el rect del contenedor real del panel (CSS px); el
  // main lo escala por el zoom factor de la ventana para los DIP del view.
  ipcMain.handle("preview-view:set-bounds", (event, bounds: { x: number; y: number; width: number; height: number }) => {
    const entry = previewFor(event.sender)
    if (!entry || bounds.width <= 0 || bounds.height <= 0) return
    const zoom = entry.win.webContents.getZoomFactor()
    entry.view.setBounds({
      x: Math.round(bounds.x * zoom),
      y: Math.round(bounds.y * zoom),
      width: Math.round(bounds.width * zoom),
      height: Math.round(bounds.height * zoom),
    })
  })

  ipcMain.handle("preview-view:set-visible", (event, visible: boolean) => {
    const entry = previewFor(event.sender)
    if (!entry) return
    entry.view.setVisible(visible)
    sendState(entry)
  })

  ipcMain.handle("preview-view:navigate", (event, url: string) => {
    const entry = previewFor(event.sender)
    if (!entry) return
    if (!isPreviewUrl(url)) {
      writeLog("preview-view", "blocked navigation", { url }, "warn")
      return
    }
    void entry.view.webContents.loadURL(url)
  })

  ipcMain.handle("preview-view:reload", (event) => {
    const entry = previewFor(event.sender)
    entry?.view.webContents.reload()
  })

  ipcMain.handle("preview-view:back", (event) => {
    const entry = previewFor(event.sender)
    if (!entry || !entry.view.webContents.navigationHistory.canGoBack()) return
    entry.view.webContents.navigationHistory.goBack()
  })

  ipcMain.handle("preview-view:forward", (event) => {
    const entry = previewFor(event.sender)
    if (!entry || !entry.view.webContents.navigationHistory.canGoForward()) return
    entry.view.webContents.navigationHistory.goForward()
  })

  ipcMain.handle("preview-view:set-zoom", (event, factor: number) => {
    const entry = previewFor(event.sender)
    if (!entry) return
    entry.view.webContents.setZoomFactor(clampZoom(factor))
  })

  ipcMain.handle("preview-view:get-state", (event) => {
    const entry = previewFor(event.sender)
    return entry?.state ?? null
  })

  ipcMain.handle("preview-view:capture", async (event) => {
    const entry = previewFor(event.sender)
    if (!entry || !entry.view.getVisible() || entry.view.webContents.isDestroyed()) {
      throw new Error("Preview not found")
    }
    const image = await entry.view.webContents.capturePage()
    const size = image.getSize()
    const resized = size.width > 2400 ? image.resize({ width: 2400 }) : image
    const out = resized.getSize()
    return { buffer: resized.toPNG(), width: out.width, height: out.height }
  })

  ipcMain.handle("preview-view:set-select-mode", (event, enabled: boolean) => {
    const entry = previewFor(event.sender)
    if (!entry) return
    void injectSelectScript(entry, enabled)
  })

  ipcMain.handle("preview-view:get-selection", async (event) => {
    const entry = previewFor(event.sender)
    if (!entry || entry.view.webContents.isDestroyed()) return null
    try {
      const value: unknown = await entry.view.webContents.executeJavaScript(SELECT_GET_SCRIPT, true)
      return parseSelection(value)
    } catch {
      return null
    }
  })
}

// El script inyectado es nuestro (misma app), pero la página del usuario
// podría haber reescrito window.__tiancode_selection: se valida la forma
// campo a campo antes de devolverlo al renderer.
function parseSelection(value: unknown): PreviewViewSelection | null {
  if (typeof value !== "object" || value === null) return null
  const tag = readString(value, "tag")
  const text = readString(value, "text")
  const className = readString(value, "className")
  const id = readString(value, "id")
  const selector = readString(value, "selector")
  const url = readString(value, "url")
  const pathname = readString(value, "pathname")
  const rect = readRect(value, "rect")
  if (
    tag === null ||
    text === null ||
    className === null ||
    id === null ||
    selector === null ||
    url === null ||
    pathname === null ||
    rect === null
  ) {
    return null
  }
  return { tag, text, className, id, selector, url, pathname, dims: { width: rect.width, height: rect.height }, rect }
}

function readString(source: object, key: string): string | null {
  for (const [entryKey, entryValue] of Object.entries(source)) {
    if (entryKey === key) return typeof entryValue === "string" ? entryValue : null
  }
  return null
}

function readNumber(source: object, key: string): number | null {
  for (const [entryKey, entryValue] of Object.entries(source)) {
    if (entryKey === key) return typeof entryValue === "number" ? entryValue : null
  }
  return null
}

function readRect(source: object, key: string): { x: number; y: number; width: number; height: number } | null {
  for (const [entryKey, entryValue] of Object.entries(source)) {
    if (entryKey !== key) continue
    if (typeof entryValue !== "object" || entryValue === null) return null
    const x = readNumber(entryValue, "x")
    const y = readNumber(entryValue, "y")
    const width = readNumber(entryValue, "width")
    const height = readNumber(entryValue, "height")
    if (x === null || y === null || width === null || height === null) return null
    return { x, y, width, height }
  }
  return null
}

// Para la captura al chat: la vista WCV del preview (si existe) o null para
// que capture.ts siga con su fallback de guest del webview.
export function getPreviewViewWebContents(hostWebContentsId: number): WebContents | null {
  const entry = previewViews.get(hostWebContentsId)
  if (!entry || entry.view.webContents.isDestroyed()) return null
  return entry.view.webContents
}
