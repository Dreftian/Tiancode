import windowState from "electron-window-state"
import { resolveThemeVariant } from "@tiancode-ai/ui/theme/resolve"
import type { DesktopTheme } from "@tiancode-ai/ui/theme/types"
import oc2ThemeJson from "../../../ui/src/theme/themes/oc-2.json"
import { randomUUID } from "node:crypto"
import { existsSync, rmSync } from "node:fs"
import { app, BrowserWindow, dialog, net, nativeImage, type NativeImage, nativeTheme, protocol, session, shell } from "electron"
import { dirname, isAbsolute, join, relative, resolve } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import type { TitlebarTheme } from "../preload/types"
import { APP_NAMES, CHANNEL } from "./constants"
import { exportDebugLogs, write as writeLog } from "./logging"
import { getStore, removeStoreFile } from "./store"
import { PINCH_ZOOM_ENABLED_KEY, MINIMIZE_TO_TRAY_KEY, WINDOW_IDS_KEY } from "./store-keys"
import { createUnresponsiveSampler } from "./unresponsive"
import { nativeT } from "./native-translations"
import { createWindowRegistry } from "./window-registry"
import { safeWindowURL } from "./window-state"
import { resolveExternalURL, resolveLocalFilePath } from "./external-url"
import { isFirstLaunchOnboardingPending } from "./onboarding"

const root = dirname(fileURLToPath(import.meta.url))
const rendererRoot = join(root, "../renderer")
const rendererProtocol = "oc"
const rendererHost = "renderer"
const clipboardWritePermission = "clipboard-sanitized-write"
const notificationPermission = "notifications"
const mediaPermission = "media"
const rendererPermissions = new Set([clipboardWritePermission, notificationPermission, mediaPermission])
const oc2Theme = oc2ThemeJson as DesktopTheme
const oc2Background = {
  light: resolveThemeVariant(oc2Theme.light, false)["background-base"],
  dark: resolveThemeVariant(oc2Theme.dark, true)["background-base"],
}
const documentPolicyHeader = "Document-Policy"
const jsCallStacksDocumentPolicy = "include-js-call-stacks-in-crash-reports"

protocol.registerSchemesAsPrivileged([
  {
    scheme: rendererProtocol,
    privileges: {
      secure: true,
      standard: true,
      supportFetchAPI: true,
      stream: true,
    },
  },
])

let backgroundColor: string | undefined
let relaunchHandler = () => {
  setAppQuitting()
  app.relaunch()
  app.exit(0)
}
// Guests de los <webview> capturables por ventana host, por partición:
// "persist:preview" es el navegador interno (capture-preview) y
// "persist:live-view" es el panel "Vista en vivo" de la sesión
// (capture-live-view). El renderer no aporta el id: se resuelve desde la
// ventana que llama.
const previewGuests = new Map<number, number>()
const liveViewGuests = new Map<number, number>()
const titlebarThemes = new WeakMap<BrowserWindow, Partial<TitlebarTheme>>()
const pinchZoomEnabled = new WeakMap<BrowserWindow, boolean>()
const windowIDs = new WeakMap<BrowserWindow, string>()
const registry = createWindowRegistry<BrowserWindow>({
  read: () => getStore().get(WINDOW_IDS_KEY),
  write: (ids) => getStore().set(WINDOW_IDS_KEY, ids),
  cleanup: (id) => {
    rmSync(join(app.getPath("userData"), windowStateFile(id)), { force: true })
    removeStoreFile(windowDataFile(id))
  },
})
const titlebarHeight = 40
const maxZoomLevel = 10
const minZoomLevel = 0.2

export function setRelaunchHandler(handler: () => void) {
  relaunchHandler = handler
}

export function setAppQuitting(quitting = true) {
  registry.setQuitting(quitting)
}

export function setBackgroundColor(color: string) {
  backgroundColor = color
  BrowserWindow.getAllWindows().forEach((win) => {
    win.setBackgroundColor(color)
    if (process.platform === "darwin") win.invalidateShadow()
  })
}

export function getBackgroundColor(): string | undefined {
  return backgroundColor
}

function iconsDir() {
  return app.isPackaged ? join(process.resourcesPath, "icons") : join(root, "../../resources/icons")
}

function iconPath() {
  const ext = process.platform === "win32" ? "ico" : "png"
  return join(iconsDir(), `icon.${ext}`)
}

function resolveWindowIcon(): NativeImage | undefined {
  const ext = process.platform === "win32" ? "ico" : "png"
  const candidates = [
    join(iconsDir(), `icon.${ext}`),
    join(iconsDir(), "icon.ico"),
    join(iconsDir(), "icon.png"),
    app.isPackaged ? join(process.resourcesPath, "icons", `icon.${ext}`) : join(root, `../../resources/icons/icon.${ext}`),
    app.isPackaged ? join(process.resourcesPath, "icons", "icon.ico") : join(root, "../../resources/icons/icon.ico"),
    app.isPackaged ? join(process.resourcesPath, "icons", "icon.png") : join(root, "../../resources/icons/icon.png"),
    join(app.getAppPath(), `resources/icons/icon.${ext}`),
    join(app.getAppPath(), "resources/icons/icon.ico"),
    join(app.getAppPath(), "resources/icons/icon.png"),
    join(root, `../../icons/${CHANNEL}/icon.${ext}`),
    join(root, `../../icons/${CHANNEL}/icon.ico`),
    join(root, `../../icons/${CHANNEL}/icon.png`),
    join(root, `../../icons/prod/icon.${ext}`),
    join(root, "../../icons/prod/icon.ico"),
    join(root, "../../icons/prod/icon.png"),
    join(root, "../../icons/dev/icon.ico"),
    join(root, "../../icons/dev/icon.png"),
  ]
  for (const candidate of candidates) {
    try {
      if (candidate && existsSync(candidate)) {
        const img = nativeImage.createFromPath(candidate)
        if (!img.isEmpty()) return img
      }
    } catch {
      // Continue to next candidate
    }
  }
  return undefined
}

function windowIcon() {
  const icon = resolveWindowIcon()
  if (icon) return icon
  writeLog("window", "failed to load application icon", { path: iconPath() }, "error")
  return undefined
}

function tone(): "dark" | "light" {
  return nativeTheme.shouldUseDarkColors ? "dark" : "light"
}

function defaultBackgroundColor() {
  return oc2Background[tone()]
}

function overlay(theme: Partial<TitlebarTheme> = {}, zoom = 1) {
  const mode = theme.mode ?? tone()
  return {
    color: "#00000000",
    symbolColor: mode === "dark" ? "white" : "black",
    height: Math.max(titlebarHeight, Math.round(titlebarHeight * zoom)),
  }
}

export function setTitlebar(win: BrowserWindow, theme: Partial<TitlebarTheme> = {}) {
  titlebarThemes.set(win, theme)
  // macOS draws the window frame hairline and shadow using the NSWindow
  // appearance, which follows nativeTheme rather than the rendered content.
  // Align it with the app theme so a light app on a dark system does not get
  // the dark-appearance border and shadow. A "system" scheme must map to
  // "system" (not the resolved mode) or prefers-color-scheme stops tracking
  // OS appearance changes in the renderer.
  if (process.platform === "darwin") nativeTheme.themeSource = theme.scheme ?? theme.mode ?? "system"
  updateTitlebar(win)
}

export function updateTitlebar(win: BrowserWindow) {
  if (process.platform !== "win32") return
  win.setTitleBarOverlay(overlay(titlebarThemes.get(win), win.webContents.getZoomFactor()))
}

export function setPinchZoomEnabled(enabled: boolean) {
  getStore().set(PINCH_ZOOM_ENABLED_KEY, enabled)
  for (const win of BrowserWindow.getAllWindows()) {
    pinchZoomEnabled.set(win, enabled)
    win.webContents.send("pinch-zoom-enabled-changed", enabled)
    if (!enabled && win.webContents.getZoomFactor() !== 1) win.webContents.setZoomFactor(1)
    updateZoom(win)
  }
}

export function getPinchZoomEnabled() {
  return getStore().get(PINCH_ZOOM_ENABLED_KEY) === true
}

// Minimize-to-tray is a Windows/Linux behavior; on macOS the app keeps running
// when its window closes by convention and a menu bar icon would be the only
// way back to a hidden window.
export function getMinimizeToTrayEnabled() {
  if (process.platform === "darwin") return false
  const value = getStore().get(MINIMIZE_TO_TRAY_KEY)
  // The generic store IPC persists renderer writes as strings, so accept both.
  return value === true || value === "true"
}

export function getWindowID(win: BrowserWindow) {
  return windowIDs.get(win)
}

export function getLastFocusedWindow() {
  const focused = BrowserWindow.getFocusedWindow()
  if (focused) return focused
  const win = registry.lastFocused()
  if (!win || win.isDestroyed()) return null
  return win
}

export function restoreMainWindows() {
  const ids = registry.persisted()
  // Un id huérfano (ventana que murió sin `closed`, p. ej. un cierre forzado
  // o un crash) no tiene su .dat de ventana: restaurarlo abriría ventanas
  // fantasma idénticas en cada arranque.
  const alive = ids.filter((id) => existsSync(join(app.getPath("userData"), windowDataFile(id))))
  if (alive.length !== ids.length) registry.prune(alive)
  return (alive.length ? alive : [randomUUID()]).map((id) => createMainWindow(id))
}

export function setDockIcon() {
  if (process.platform !== "darwin") return
  const icon = nativeImage.createFromPath(join(iconsDir(), "dock.png"))
  if (!icon.isEmpty()) app.dock?.setIcon(icon)
}

export function createMainWindow(id: string = randomUUID()) {
  const isOnboarding = isFirstLaunchOnboardingPending()
  const state = windowState({
    file: windowStateFile(id),
    defaultWidth: 1280,
    defaultHeight: 800,
  })

  const mode = tone()
  const icon = windowIcon()
  const win = new BrowserWindow({
    x: undefined,
    y: undefined,
    width: isOnboarding ? 780 : 440,
    height: isOnboarding ? 560 : 380,
    resizable: false,
    maximizable: false,
    center: true,
    show: false,
    autoHideMenuBar: true,
    title: APP_NAMES[CHANNEL],
    icon,
    backgroundColor: backgroundColor ?? defaultBackgroundColor(),
    ...(process.platform === "darwin"
      ? {
          titleBarStyle: "hidden" as const,
          trafficLightPosition: { x: 14, y: 14 },
        }
      : {}),
    ...(process.platform === "win32"
      ? {
          frame: false,
          titleBarStyle: "hidden" as const,
          titleBarOverlay: overlay({ mode }),
          // Esquinas redondeadas nativas de Windows 11 para la ventana sin marco.
          roundedCorners: true,
        }
      : {}),
    webPreferences: {
      preload: join(root, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      // Habilita el <webview> del navegador interno (panel de preview).
      webviewTag: true,
    },
  })

  // BrowserWindow gets the same decoded image as the executable and tray.
  // This is important on Windows after an in-place update: it prevents a
  // stale string-path association from leaving the taskbar with the previous
  // app icon until Explorer refreshes its cache.
  if (icon) win.setIcon(icon)

  allowRendererPermissions(win)
  hardenGuestSessions()
  wireWebviewHardening(win)
  wirePreviewGuestTracking(win)
  wireWindowRecovery(win, id)
  wireNavigationPolicy(win)

  win.webContents.session.webRequest.onBeforeSendHeaders((details, callback) => {
    const { requestHeaders } = details
    upsertKeyValue(requestHeaders, "Access-Control-Allow-Origin", ["*"])
    callback({ requestHeaders })
  })

  win.webContents.session.webRequest.onHeadersReceived((details, callback) => {
    const { responseHeaders = {} } = details
    addRendererHeaders(details.url, responseHeaders)
    callback({ responseHeaders })
  })

  state.manage(win)
  registerWindow(win, id)
  wireFullscreen(win)
  loadWindow(win, "index.html")
  wireZoom(win)

  win.once("ready-to-show", () => {
    win.show()
  })

  return win
}

export function openExternalURL(value: string) {
  const url = resolveExternalURL(value)
  if (!url) {
    writeLog("window", "blocked external target", { url: value }, "warn")
    return
  }
  void shell.openExternal(url)
}

export function openLocalFileURL(value: string) {
  const path = resolveLocalFilePath(value)
  if (!path) {
    writeLog("window", "blocked local file target", { url: value }, "warn")
    return
  }
  void shell.openPath(path).then((error) => {
    if (error) writeLog("window", "failed to open local file", { path, error }, "error")
  })
}

function wireNavigationPolicy(win: BrowserWindow) {
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (!isRendererUrl(url)) openExternalURL(url)
    return { action: "deny" }
  })
  // Renderer reloads (window.location.reload) navigate to the app's own URL
  // and must stay in-window; everything else leaves through the OS.
  win.webContents.on("will-navigate", (event, url) => {
    if (isRendererUrl(url)) return
    event.preventDefault()
    openExternalURL(url)
  })
}

function registerWindow(win: BrowserWindow, id: string) {
  windowIDs.set(win, id)
  registry.register(id, win)

  win.on("focus", () => registry.focused(id))
  // Closing the window hides it into the system tray instead of destroying it
  // while minimize-to-tray is enabled; a real quit (tray "Quit", OS shutdown)
  // flags the registry first so this never blocks quitting.
  win.on("close", (event) => {
    if (registry.isQuitting() || !getMinimizeToTrayEnabled()) return
    event.preventDefault()
    win.hide()
  })
  // Windows never emits before-quit on OS shutdown/logoff, but each window
  // gets session-end before it closes; flag the quit so ids stay persisted.
  win.on("session-end", () => registry.setQuitting())
  win.on("closed", () => registry.closed(id))
}

function windowStateFile(id: string) {
  return `window-state-${id.replace(/[^a-zA-Z0-9._-]/g, "-")}.json`
}

// Mirrors windowStorage() in frontend/app/src/utils/persist.ts, which names
// the per-window renderer store this window persists its tabs into.
function windowDataFile(id: string) {
  return `tiancode.window.${id.replace(/[^a-zA-Z0-9._-]/g, "-")}.dat`
}

export function registerRendererProtocol() {
  if (protocol.isProtocolHandled(rendererProtocol)) return

  protocol.handle(rendererProtocol, async (request) => {
    const url = new URL(request.url)
    if (url.host !== rendererHost) {
      writeLog("protocol", "rejected host", { url: request.url }, "warn")
      return new Response("Not found", { status: 404 })
    }

    const file = resolve(rendererRoot, `.${decodeURIComponent(url.pathname)}`)
    const rel = relative(rendererRoot, file)
    if (rel.startsWith("..") || isAbsolute(rel)) {
      writeLog("protocol", "rejected path", { url: request.url, file }, "warn")
      return new Response("Not found", { status: 404 })
    }

    try {
      const range = request.headers.get("range")
      const response = await net.fetch(pathToFileURL(file).toString(), {
        headers: range ? { range } : undefined,
      })
      if (response.status >= 400) {
        writeLog(
          "protocol",
          "fetch failed",
          {
            url: request.url,
            file,
            status: response.status,
            statusText: response.statusText,
          },
          "error",
        )
      }
      return addDocumentPolicy(response, file)
    } catch (error) {
      writeLog("protocol", "fetch error", { url: request.url, file, error }, "error")
      return new Response("Not found", { status: 404 })
    }
  })
}

function loadWindow(win: BrowserWindow, html: string) {
  const devUrl = process.env.ELECTRON_RENDERER_URL
  if (devUrl) {
    const url = new URL(html, devUrl)
    void win.loadURL(url.toString())
    return
  }

  void win.loadURL(`${rendererProtocol}://${rendererHost}/${html}`)
}

function wireWindowRecovery(win: BrowserWindow, name: string) {
  let showing = false
  const sampler = createUnresponsiveSampler(win, name)

  type RecoveryAction = "relaunch" | "export-logs" | "keep-waiting" | "quit"
  const handle = async (action: RecoveryAction | undefined, wait: boolean) => {
    if (action === "export-logs") {
      const sampling = sampler.stopAndFlush()
      await exportDebugLogs().catch((error) => writeLog("main", "failed to export debug logs", { error }, "error"))
      if (wait && sampling) sampler.start()
      return true
    }
    if (action === "relaunch") {
      sampler.stopAndFlush()
      relaunchHandler()
      return false
    }
    if (action === "quit") {
      sampler.stopAndFlush()
      app.quit()
    }
    return false
  }

  const show = async (message: string, detail: string, wait: boolean) => {
    if (showing || win.isDestroyed()) return
    showing = true
    try {
      while (!win.isDestroyed()) {
        const actions: { id: RecoveryAction; label: string }[] = wait
          ? [
              { id: "relaunch", label: nativeT("desktop.recovery.action.relaunch") },
              { id: "export-logs", label: nativeT("desktop.recovery.action.exportLogs") },
              { id: "keep-waiting", label: nativeT("desktop.recovery.action.keepWaiting") },
            ]
          : [
              { id: "relaunch", label: nativeT("desktop.recovery.action.relaunch") },
              { id: "export-logs", label: nativeT("desktop.recovery.action.exportLogs") },
              { id: "quit", label: nativeT("desktop.recovery.action.quit") },
            ]
        const result = await dialog.showMessageBox(win, {
          type: "warning",
          buttons: actions.map((action) => action.label),
          defaultId: 0,
          cancelId: 2,
          message,
          detail,
        })
        if (await handle(actions[result.response]?.id, wait)) continue
        return
      }
    } finally {
      showing = false
    }
  }

  const failed = (
    event: string,
    errorCode: number,
    errorDescription: string,
    validatedURL: string,
    isMainFrame: boolean,
  ) => {
    writeLog(
      "window",
      "renderer load failed",
      {
        window: name,
        event,
        errorCode,
        errorDescription,
        validatedURL,
        currentURL: safeWindowURL(win),
        isMainFrame,
      },
      "error",
    )

    if (!isMainFrame || errorCode === -3) return
    void show(
      nativeT("desktop.recovery.loadFailed"),
      nativeT("desktop.recovery.loadFailed.detail", {
        window: name,
        url: validatedURL,
        code: errorCode,
        description: errorDescription,
      }),
      false,
    )
  }

  win.webContents.on("did-fail-load", (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
    failed("did-fail-load", errorCode, errorDescription, validatedURL, isMainFrame)
  })
  win.webContents.on("did-fail-provisional-load", (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
    failed("did-fail-provisional-load", errorCode, errorDescription, validatedURL, isMainFrame)
  })
  win.webContents.on("render-process-gone", (_event, details) => {
    sampler.stopAndFlush()
    writeLog("window", "renderer process gone", { window: name, currentURL: safeWindowURL(win), details }, "error")
    void show(
      nativeT("desktop.recovery.terminated"),
      nativeT("desktop.recovery.terminated.detail", {
        window: name,
        reason: details.reason,
        code: details.exitCode ?? nativeT("desktop.recovery.unknown"),
      }),
      false,
    )
  })
  win.on("unresponsive", () => {
    writeLog("window", "renderer unresponsive", { window: name, currentURL: safeWindowURL(win) }, "error")
    sampler.start()
    void show(nativeT("desktop.recovery.unresponsive"), nativeT("desktop.recovery.unresponsive.detail"), true)
  })
  win.on("responsive", () => {
    writeLog("window", "renderer responsive", { window: name, currentURL: safeWindowURL(win) }, "error")
    sampler.stopAndFlush()
  })
  win.webContents.on("console-message", (_event, level, message, line, sourceId) => {
    if (message.toLowerCase().includes("terminal") || sourceId.toLowerCase().includes("terminal")) {
      writeLog("pty", "console", { window: name, level, message, line, sourceId })
    }
  })
  win.webContents.on("preload-error", (_event, preloadPath, error) => {
    writeLog("preload", "preload error", { window: name, preloadPath, error }, "error")
  })
}

function addDocumentPolicy(response: Response, file: string) {
  if (!file.toLowerCase().endsWith(".html")) return response
  const headers = new Headers(response.headers)
  headers.set(documentPolicyHeader, jsCallStacksDocumentPolicy)
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers })
}

function allowRendererPermissions(win: BrowserWindow) {
  const webContentsId = win.webContents.id

  win.webContents.session.setPermissionRequestHandler((webContents, permission, callback, details) => {
    callback(
      rendererPermissions.has(permission) &&
        isTrustedRendererUrl(details.requestingUrl) &&
        webContents.id === webContentsId,
    )
  })
  win.webContents.session.setPermissionCheckHandler((webContents, permission, requestingOrigin, details) => {
    if (!rendererPermissions.has(permission)) return false
    if (webContents && webContents.id !== webContentsId) return false
    return isTrustedRendererUrl(details.requestingUrl) || isTrustedRendererUrl(requestingOrigin)
  })
}

function isTrustedRendererUrl(value?: string) {
  return isRendererUrl(value)
}

// Los <webview> de preview corren en particiones propias que los handlers de
// permisos de la ventana principal nunca ven, así que sin esto Electron
// concedería a las páginas guest cualquier permiso que pidieran. Se deniega
// todo: el preview es para ver apps/sitios, no para cámara/mic/geolocalización.
function hardenGuestSessions() {
  for (const partition of ["persist:preview", "persist:live-view"]) {
    const guestSession = session.fromPartition(partition)
    guestSession.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false))
    guestSession.setPermissionCheckHandler(() => false)
  }
}

// Limpia el almacenamiento persistente de los webviews (navegador interno y
// vista en vivo): cookies, caché, localStorage y datos de sesión de las
// particiones guest, sin tocar la sesión del renderer principal.
export function clearWebviewData() {
  return Promise.all(
    ["persist:preview", "persist:live-view"].map((partition) => session.fromPartition(partition).clearStorageData()),
  )
}

// Registra los guests de los <webview> de preview (si los hay) para poder
// capturarlos después sin fiarse del id que envíe el renderer. Cada partición
// tiene su propio mapa: el navegador interno y el panel "Vista en vivo"
// pueden existir a la vez en la misma ventana sin pisarse.
// Los <webview> solo son legítimos en las dos particiones conocidas del
// preview; se fuerza la partición y se eliminan preload/allowpopups para que
// ni un renderer comprometido pueda elevar un guest a la sesión principal o
// abrir ventanas desde él.
function wireWebviewHardening(win: BrowserWindow) {
  win.webContents.on("will-attach-webview", (_event, webPreferences, params) => {
    if (params.partition !== "persist:preview" && params.partition !== "persist:live-view") {
      params.partition = "persist:preview"
    }
    delete params.preload
    delete params.allowpopups
    delete webPreferences.preload
    webPreferences.nodeIntegration = false
    webPreferences.contextIsolation = true
    webPreferences.sandbox = true
  })
}

function wirePreviewGuestTracking(win: BrowserWindow) {
  win.webContents.on("did-attach-webview", (_event, guest) => {
    if (guest.session === session.fromPartition("persist:preview")) {
      previewGuests.set(win.webContents.id, guest.id)
      guest.once("destroyed", () => {
        if (previewGuests.get(win.webContents.id) === guest.id) previewGuests.delete(win.webContents.id)
      })
      return
    }
    if (guest.session === session.fromPartition("persist:live-view")) {
      liveViewGuests.set(win.webContents.id, guest.id)
      guest.once("destroyed", () => {
        if (liveViewGuests.get(win.webContents.id) === guest.id) liveViewGuests.delete(win.webContents.id)
      })
    }
  })
}

export function getPreviewGuestWebContentsId(hostWebContentsId: number) {
  return previewGuests.get(hostWebContentsId) ?? null
}

export function getLiveViewGuestWebContentsId(hostWebContentsId: number) {
  return liveViewGuests.get(hostWebContentsId) ?? null
}

function addRendererHeaders(value: string, headers: Record<string, any>) {
  upsertKeyValue(headers, "Access-Control-Allow-Origin", ["*"])
  upsertKeyValue(headers, "Access-Control-Allow-Headers", ["*"])
  if (isRendererUrl(value, true)) upsertKeyValue(headers, documentPolicyHeader, [jsCallStacksDocumentPolicy])
}

function isRendererUrl(value?: string, html = false) {
  if (!value || !URL.canParse(value)) return false
  const url = new URL(value)
  if (html && !url.pathname.endsWith(".html")) return false
  if (url.protocol === `${rendererProtocol}:` && url.host === rendererHost) return true
  const devUrl = process.env.ELECTRON_RENDERER_URL
  if (!devUrl || !URL.canParse(devUrl)) return false
  return url.origin === new URL(devUrl).origin
}

function wireZoom(win: BrowserWindow) {
  pinchZoomEnabled.set(win, getPinchZoomEnabled())
  win.webContents.setZoomFactor(1)
  win.webContents.on("zoom-changed", (event, zoomDirection) => {
    event.preventDefault()
    if (pinchZoomEnabled.get(win)) {
      win.webContents.setZoomFactor(clampZoom(win.webContents.getZoomFactor() + (zoomDirection === "in" ? 0.2 : -0.2)))
      updateZoom(win)
      return
    }
    if (win.webContents.getZoomFactor() !== 1) win.webContents.setZoomFactor(1)
    updateZoom(win)
  })
}

function wireFullscreen(win: BrowserWindow) {
  const send = (fullscreen: boolean) => {
    if (win.isDestroyed() || win.webContents.isDestroyed()) return
    win.webContents.send("window-fullscreen-changed", fullscreen)
  }

  win.on("enter-full-screen", () => send(true))
  win.on("leave-full-screen", () => send(false))
}

function clampZoom(value: number) {
  return Math.min(Math.max(value, minZoomLevel), maxZoomLevel)
}

function updateZoom(win: BrowserWindow) {
  updateTitlebar(win)
  win.webContents.send("zoom-factor-changed", win.webContents.getZoomFactor())
}

function upsertKeyValue(obj: Record<string, unknown>, keyToChange: string, value: unknown) {
  const keyToChangeLower = keyToChange.toLowerCase()
  for (const key of Object.keys(obj)) {
    if (key.toLowerCase() === keyToChangeLower) {
      // Reassign old key
      obj[key] = value
      // Done
      return
    }
  }
  // Insert at end instead
  obj[keyToChange] = value
}
