import { BrowserWindow, WebContentsView, ipcMain } from "electron"
import type { WebContents } from "electron"
import type { PreviewViewEvent, PreviewViewSelection, PreviewViewState } from "../preload/types"
import { write as writeLog } from "./logging"
import { EMPTY_PREVIEW_VIEW_BOUNDS, isUsablePreviewViewBounds, type PreviewViewBounds } from "./preview-view-bounds"

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

// Chromium emite `will-navigate` y abre la ventana nueva después de que
// `executeJavaScript` haya devuelto, así que la marca sobrevive un momento al
// script: sin ese margen el clic del agente ya no está "en vuelo" cuando llega
// la navegación que ese mismo clic provocó.
const AGENT_ACTION_GRACE_MS = 1_500
let agentActionDepth = 0
let agentActionEndedAt = 0

/**
 * Marca el tramo en el que un script del agente corre dentro de una página del preview.
 *
 * Hace falta porque `navigate` está bloqueado a mismo origen dentro del script pero `click` no:
 * un `el.click()` sobre un `<a href="https://…">` navega igual, y esa navegación llega al proceso
 * principal indistinguible de un clic del usuario. Con esta marca los guardias de navegación
 * (aquí y en windows.ts) pueden rechazar justo lo que el modelo inició.
 *
 * Devuelve la función que cierra el tramo; hay que llamarla siempre (finally).
 */
export function beginAgentAction(): () => void {
  agentActionDepth += 1
  return () => {
    agentActionDepth = Math.max(0, agentActionDepth - 1)
    agentActionEndedAt = Date.now()
  }
}

/** True mientras una acción del agente puede estar causando una navegación. */
export function isAgentActionInFlight() {
  return agentActionDepth > 0 || Date.now() - agentActionEndedAt < AGENT_ACTION_GRACE_MS
}

// Dos URLs del mismo sitio. `about:blank` y `data:` dan origen "null", que nunca
// cuenta como "el mismo": una vista descargada no autoriza ir a ninguna parte.
function sameOrigin(current: string, next: string) {
  try {
    const from = new URL(current)
    const to = new URL(next)
    return from.origin !== "null" && from.origin === to.origin
  } catch {
    return false
  }
}

// Solo páginas del preview: http(s) (dev servers y webs), la página de
// bienvenida data: y archivos locales file: (el agente suele generar HTML
// estático que el panel abre directamente desde el disco, p. ej.
// file:///C:/proyecto/index.html). Cualquier otro esquema se rechaza.
function isPreviewUrl(value: string) {
  try {
    const protocol = new URL(value).protocol
    return protocol === "http:" || protocol === "https:" || protocol === "data:" || protocol === "about:" || protocol === "file:"
  } catch {
    return false
  }
}

// Modo diseño: script inyectado con executeJavaScript (no lo bloquea la CSP de
// la página). Un overlay con cruz resalta el elemento bajo el cursor; cada clic
// guarda su descripción en window.__tiancode_selection y lo avisa por consola
// con SELECTION_MARKER, que el main intercepta. Sigue activo hasta Escape o
// hasta que la app lo apaga.
const SELECTION_MARKER = "[tiancode-selection]"
const SELECT_ENTER_SCRIPT = `(() => {
  if (window.__tiancodeSelectActive) return "active"
  const overlay = document.createElement("div")
  overlay.id = "__tiancode_inspect_overlay"
  overlay.style.cssText = "position:fixed;inset:0;z-index:2147483647;cursor:crosshair;"
  const outline = document.createElement("div")
  outline.id = "__tiancode_inspect_outline"
  outline.style.cssText = "position:fixed;display:none;z-index:2147483646;pointer-events:none;border:2px solid #38bdf8;background:rgba(56,189,248,.08);border-radius:2px;box-shadow:0 0 0 1px rgba(0,0,0,.35);"
  document.documentElement.appendChild(overlay)
  document.documentElement.appendChild(outline)
  const selectorFor = (el) => {
    const parts = []
    let node = el
    while (node && node.nodeType === 1 && node !== document.body && node !== document.documentElement) {
      if (node.id) { parts.unshift("#" + CSS.escape(node.id)); break }
      let part = node.tagName.toLowerCase() + Array.from(node.classList).slice(0, 2).map((c) => "." + CSS.escape(c)).join("")
      const parent = node.parentElement
      if (parent && Array.from(parent.children).filter((s) => s.tagName === node.tagName).length > 1) {
        part += ":nth-child(" + (Array.from(parent.children).indexOf(node) + 1) + ")"
      }
      parts.unshift(part)
      node = parent
    }
    return parts.join(" > ") || el.tagName.toLowerCase()
  }
  const pick = (x, y) => {
    overlay.style.pointerEvents = "none"
    const el = document.elementFromPoint(x, y)
    overlay.style.pointerEvents = "auto"
    return el
  }
  const STYLE_KEYS = ["display", "position", "color", "background-color", "font-family", "font-size", "font-weight", "line-height", "border-radius", "gap"]
  const describe = (el) => {
    const r = el.getBoundingClientRect()
    const cs = getComputedStyle(el)
    const read = (key) => cs.getPropertyValue(key).trim()
    const html = el.outerHTML
    return {
      tag: el.tagName.toLowerCase(),
      id: el.id || "",
      classes: typeof el.className === "string" ? el.className.trim() : "",
      selector: selectorFor(el),
      text: (el.textContent || "").replace(/\\s+/g, " ").trim().slice(0, 200),
      html: html.length > 1200 ? html.slice(0, 1200) + "\u2026" : html,
      styles: STYLE_KEYS.map((key) => [key, read(key)]).filter((entry) => entry[1] && entry[1] !== "normal" && entry[1] !== "none").map((entry) => entry[0] + ": " + entry[1]).join("; "),
      margin: ["margin-top", "margin-right", "margin-bottom", "margin-left"].map(read).join(" "),
      padding: ["padding-top", "padding-right", "padding-bottom", "padding-left"].map(read).join(" "),
      url: location.href,
      rect: { x: r.x, y: r.y, width: r.width, height: r.height },
      viewport: { width: innerWidth, height: innerHeight },
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
    if (!el || el === overlay || el === outline || el === document.documentElement || el === document.body) return
    window.__tiancode_selection = describe(el)
    // The outline must be off the page before the main process captures it.
    outline.style.display = "none"
    requestAnimationFrame(() => requestAnimationFrame(() => console.log("${SELECTION_MARKER}", "selected")))
  }
  const key = (e) => { if (e.key === "Escape") exit() }
  const exit = () => {
    overlay.remove()
    outline.remove()
    overlay.removeEventListener("mousemove", move)
    overlay.removeEventListener("click", click, true)
    document.removeEventListener("keydown", key, true)
    window.__tiancodeSelectActive = false
    window.__tiancodeSelectExit = undefined
    console.log("${SELECTION_MARKER}", "exit")
  }
  window.__tiancodeSelectActive = true
  window.__tiancodeSelectExit = exit
  overlay.addEventListener("mousemove", move)
  overlay.addEventListener("click", click, true)
  document.addEventListener("keydown", key, true)
  return "ok"
})()`

// Only our own nodes: pages may legitimately use the maximum z-index too.
const SELECT_EXIT_SCRIPT = `(() => {
  if (typeof window.__tiancodeSelectExit === "function") window.__tiancodeSelectExit()
  document.getElementById("__tiancode_inspect_overlay")?.remove()
  document.getElementById("__tiancode_inspect_outline")?.remove()
  window.__tiancodeSelectActive = false
  return "ok"
})()`

const SELECT_GET_SCRIPT = "window.__tiancode_selection ?? null"

type PreviewViewEntry = {
  view: WebContentsView
  win: BrowserWindow
  state: PreviewViewState
  bounds?: PreviewViewBounds
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

// A WebContentsView is drawn above the renderer. Clearing its bounds before
// hiding guarantees a stale native surface cannot cover a resized or closed
// live-view panel.
function hidePreview(entry: PreviewViewEntry, clearBounds = false) {
  if (clearBounds) {
    entry.bounds = undefined
    entry.view.setBounds(EMPTY_PREVIEW_VIEW_BOUNDS)
  }
  entry.view.setVisible(false)
  sendState(entry)
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
  view.setBackgroundColor("#ffffff")
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
  // La Vista en vivo es un navegador con sesión persistente: un clic del agente sobre un enlace
  // externo la sacaría de la app del proyecto y la dejaría en un sitio donde el usuario está
  // identificado. El script ya limita `navigate` al mismo origen; esto cierra la vía del `click`.
  contents.on("will-navigate", (event, url) => {
    if (!isAgentActionInFlight()) return
    const current = contents.getURL()
    if (sameOrigin(current, url)) return
    event.preventDefault()
    writeLog("preview-view", "blocked agent cross-origin navigation", { from: current, url }, "warn")
  })
  contents.on("did-start-loading", () => sendState(entry))
  contents.on("did-stop-loading", () => {
    sendState(entry)
    // La navegación resetea el estado de la página; si el modo seleccionar
    // sigue activo se vuelve a inyectar en la página nueva.
    if (entry.state.selectMode) void injectSelectScript(entry, true)
  })
  contents.on("did-finish-load", () => {
    if (entry.win.isDestroyed() || entry.win.webContents.isDestroyed()) return
    entry.win.webContents.send("preview-view-event", {
      type: "loaded",
      url: contents.getURL(),
    } satisfies PreviewViewEvent)
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
    if (message.startsWith(SELECTION_MARKER)) {
      void handleSelectionMarker(entry, message)
      return
    }
    if (isBenignPreviewConsole(message)) return
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

// The marker only tells the main process to look: a page that prints it on its
// own gets its window.__tiancode_selection validated like any other.
async function handleSelectionMarker(entry: PreviewViewEntry, message: string) {
  const contents = entry.view.webContents
  if (contents.isDestroyed() || entry.win.isDestroyed() || entry.win.webContents.isDestroyed()) return
  if (message.endsWith("exit")) {
    entry.state.selectMode = false
    sendState(entry)
    return
  }
  if (!entry.state.selectMode) return
  const value: unknown = await contents.executeJavaScript(SELECT_GET_SCRIPT, true).catch(() => null)
  const selection = parseSelection(value)
  if (!selection || entry.win.webContents.isDestroyed()) return
  entry.win.webContents.send("preview-view-event", { type: "selection", selection } satisfies PreviewViewEvent)
}

function clampZoom(value: number) {
  return Math.min(Math.max(value, MIN_ZOOM), MAX_ZOOM)
}

export function registerPreviewViewIpc() {
  // El renderer reporta el rect del contenedor real del panel (CSS px); el
  // main lo escala por el zoom factor de la ventana para los DIP del view.
  ipcMain.handle("preview-view:set-bounds", (event, bounds: PreviewViewBounds) => {
    const entry = previewFor(event.sender)
    if (!entry) return
    if (!isUsablePreviewViewBounds(bounds)) {
      hidePreview(entry, true)
      return
    }
    const zoom = entry.win.webContents.getZoomFactor()
    const next = {
      x: Math.round(bounds.x * zoom),
      y: Math.round(bounds.y * zoom),
      width: Math.round(bounds.width * zoom),
      height: Math.round(bounds.height * zoom),
    }
    if (!isUsablePreviewViewBounds(next)) {
      hidePreview(entry, true)
      return
    }
    if (
      entry.bounds?.x === next.x &&
      entry.bounds.y === next.y &&
      entry.bounds.width === next.width &&
      entry.bounds.height === next.height
    ) {
      return
    }
    entry.bounds = next
    entry.view.setBounds(next)
  })

  ipcMain.handle("preview-view:set-visible", (event, visible: boolean) => {
    const entry = previewFor(event.sender)
    if (!entry) return
    if (visible && !isUsablePreviewViewBounds(entry.bounds)) {
      hidePreview(entry, true)
      return
    }
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

function isBenignPreviewConsole(message: string) {
  return /resizeobserver loop (?:completed with undelivered notifications|limit exceeded)/i.test(message)
}

// El script inyectado es nuestro (misma app), pero la página del usuario
// podría haber reescrito window.__tiancode_selection: se valida la forma
// campo a campo antes de devolverlo al renderer.
function parseSelection(value: unknown): PreviewViewSelection | null {
  if (typeof value !== "object" || value === null) return null
  const tag = readString(value, "tag")
  const id = readString(value, "id")
  const classes = readString(value, "classes")
  const selector = readString(value, "selector")
  const text = readString(value, "text")
  const html = readString(value, "html")
  const styles = readString(value, "styles")
  const margin = readString(value, "margin")
  const padding = readString(value, "padding")
  const url = readString(value, "url")
  const rect = readRect(value, "rect")
  const viewport = readSize(value, "viewport")
  if (
    tag === null ||
    id === null ||
    classes === null ||
    selector === null ||
    text === null ||
    html === null ||
    styles === null ||
    margin === null ||
    padding === null ||
    url === null ||
    rect === null ||
    viewport === null
  ) {
    return null
  }
  // Lengths are capped again here: the page owns window.__tiancode_selection.
  return {
    tag: tag.slice(0, 40),
    id: id.slice(0, 200),
    classes: classes.slice(0, 400),
    selector: selector.slice(0, 600),
    text: text.slice(0, 200),
    html: html.slice(0, 1201),
    styles: styles.slice(0, 800),
    margin: margin.slice(0, 80),
    padding: padding.slice(0, 80),
    url: url.slice(0, 2000),
    rect,
    viewport,
  }
}

function readSize(source: object, key: string): { width: number; height: number } | null {
  for (const [entryKey, entryValue] of Object.entries(source)) {
    if (entryKey !== key) continue
    if (typeof entryValue !== "object" || entryValue === null) return null
    const width = readNumber(entryValue, "width")
    const height = readNumber(entryValue, "height")
    if (width === null || height === null) return null
    return { width, height }
  }
  return null
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
