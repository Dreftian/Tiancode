import { execFile } from "node:child_process"
import { stat, writeFile } from "node:fs/promises"
import { basename, isAbsolute, join, relative, resolve } from "node:path"
import { app, BrowserWindow, clipboard, dialog, ipcMain, shell } from "electron"
import type { IpcMainEvent, IpcMainInvokeEvent } from "electron"
import type { DesktopMenuAction } from "@tiancode-ai/app/desktop-menu"
import { parseDesktopNativeBundle, type DesktopNativeBundle } from "@tiancode-ai/app/i18n/desktop-native"

import type { FatalRendererError, ServerReadyData, TitlebarTheme } from "../preload/types"
import { getLogger } from "./logging"
import { runDesktopMenuAction } from "./desktop-menu-actions"
import { setForceFocus } from "./debug"
import { assertAttachmentBudget, createPickedFileAuthorizations } from "./attachment-picker"
import { getStore, removeStoreFileIfEmpty } from "./store"
import {
  getPinchZoomEnabled,
  getWindowID,
  isLiveViewPreviewUrl,
  openExternalURL,
  openLocalFileURL,
  setPinchZoomEnabled,
  setTitlebar,
  updateTitlebar,
  clearWebviewData,
} from "./windows"
import type { UpdaterController } from "./updater-controller"
import { createUpdaterSubscriptions } from "./updater-subscriptions"
import { createDesktopDraftStore } from "./draft-store"
import { nativeT } from "./native-translations"
import { downloadVoices, deleteVoice, downloadVoice, getVoicesStatus, listVoices, selectVoice, setVoiceEnabled, speakVoice, speakFishVoice } from "./voices"
import { asrChunk, asrStart, asrStop, ensureAsrModel, getAsrStatus } from "./asr"
import { getRuntimeInstallState, installRuntime } from "./runtime-install"
import { captureArea, captureLiveView, capturePreview, captureScreen, captureWindow } from "./capture"
import { backupNow, listBackups, restoreBackup } from "./backup"
import { registerPreviewViewIpc } from "./preview-view"
import { registerDesktopPetIpc } from "./desktop-pet"

// Apps "abrir con" que acepta open-path. En macOS y Linux el renderer envía
// el nombre tal cual; en Windows envía el path resuelto por resolveAppPath
// para uno de estos nombres, así que ahí se re-resuelve y compara.
const OPEN_APP_NAMES: Record<"darwin" | "win32" | "linux", readonly string[]> = {
  darwin: [
    "Visual Studio Code",
    "Cursor",
    "Zed",
    "TextMate",
    "Antigravity",
    "Terminal",
    "iTerm",
    "Ghostty",
    "Warp",
    "Xcode",
    "Android Studio",
    "Sublime Text",
  ],
  win32: ["code", "cursor", "zed", "powershell", "Sublime Text"],
  linux: ["code", "cursor", "zed", "Sublime Text"],
}

// Paths que el save-file-picker acaba de devolver al renderer: solo esos se
// pueden escribir con write-text-file (single-use, con expiración).
const authorizedWritePaths = new Set<string>()
const WRITE_PATH_TTL_MS = 10 * 60 * 1000

function authorizeWritePath(path: string) {
  authorizedWritePaths.add(path)
  setTimeout(() => authorizedWritePaths.delete(path), WRITE_PATH_TTL_MS).unref()
}

// Stores expuestos al renderer vía IPC; el resto son de uso exclusivo del
// main (p. ej. respaldos, WSL, updater). Los stores dinámicos del renderer
// siguen el patrón tiancode.{window,workspace,draft}.<id>.dat.
const RENDERER_STORES = new Set(["tiancode.settings", "tiancode.global.dat", "default.dat", "tiancode.updater"])
const RENDERER_SETTINGS_KEYS = new Set(["minimizeToTray", "fileWatcher", "checkUpdatesOnStart", "autoBackup"])
const UPDATER_KEYS = new Set(["ready"])

function isRendererStore(name: string) {
  if (RENDERER_STORES.has(name)) return true
  if (name.startsWith("tiancode.window.") && name.endsWith(".dat")) return true
  if (name.startsWith("tiancode.workspace.") && name.endsWith(".dat")) return true
  if (name.startsWith("tiancode.draft.") && name.endsWith(".dat")) return true
  return false
}

function requireStoreAccess(name: string, op: "get" | "set" | "delete" | "clear" | "list") {
  if (!isRendererStore(name)) throw new Error(`Store no permitido: ${name}`)
  if ((op === "clear" || op === "list") && (name === "tiancode.settings" || name === "tiancode.updater")) {
    throw new Error(`Store no permitido: ${name}`)
  }
}

function requireStoreKey(name: string, op: "get" | "set" | "delete", key: string) {
  requireStoreAccess(name, op)
  if (name === "tiancode.settings" && !RENDERER_SETTINGS_KEYS.has(key)) throw new Error(`Clave no permitida: ${key}`)
  if (name === "tiancode.updater" && (op !== "get" || !UPDATER_KEYS.has(key))) {
    throw new Error("Store de actualizaciones de solo lectura")
  }
}

const pickerFilters = (ext?: string[]) => {
  if (!ext || ext.length === 0) return undefined
  return [{ name: nativeT("desktop.dialog.files"), extensions: ext }]
}

const pickedFiles = createPickedFileAuthorizations()

type Deps = {
  killSidecar: () => Promise<void> | void
  relaunch: () => void
  awaitInitialization: () => Promise<ServerReadyData>
  consumeInitialDeepLinks: () => Promise<string[]> | string[]
  getDefaultServerUrl: () => Promise<string | null> | string | null
  setDefaultServerUrl: (url: string | null) => Promise<void> | void
  isFirstLaunchOnboardingPending: () => Promise<boolean> | boolean
  finishFirstLaunchOnboarding: (createDefaultProject: boolean) => Promise<string | null> | string | null
  isOldLayoutEligible: () => Promise<boolean> | boolean
  getDisplayBackend: () => Promise<string | null>
  setDisplayBackend: (backend: string | null) => Promise<void> | void
  checkAppExists: (appName: string) => Promise<boolean> | boolean
  resolveAppPath: (appName: string) => Promise<string | null>
  updater: UpdaterController
  showUpdater: () => Promise<void> | void
  setBackgroundColor: (color: string) => void
  exportDebugLogs: () => Promise<string>
  recordFatalRendererError: (error: FatalRendererError) => Promise<void> | void
  setNativeTranslations: (bundle: DesktopNativeBundle) => void
}

export function registerIpcHandlers(deps: Deps) {
  const drafts = createDesktopDraftStore(join(app.getPath("userData"), "drafts.sqlite"))
  const updaterSubscriptions = createUpdaterSubscriptions()

  // Vista en vivo del panel "Vista en vivo": WebContentsView controlado por
  // el renderer (bounds del contenedor real, navegación, selección de
  // elementos). Canales exclusivos preview-view:*; nada existente cambia.
  registerPreviewViewIpc()

  // Mascota de escritorio independiente
  registerDesktopPetIpc()

  // Resuelve el argumento "app" de open-path contra los nombres conocidos;
  // en Windows el renderer envía el path resuelto y hay que re-resolver para
  // verificar que corresponde a una de las apps permitidas.
  const resolveOpenApp = async (app: string) => {
    if (process.platform === "darwin") return OPEN_APP_NAMES.darwin.includes(app) ? app : null
    if (process.platform === "win32") {
      if (!isAbsolute(app)) return null
      const candidates = await Promise.all(OPEN_APP_NAMES.win32.map((name) => deps.resolveAppPath(name)))
      return candidates.find((candidate) => candidate && candidate.toLowerCase() === app.toLowerCase()) ?? null
    }
    return OPEN_APP_NAMES.linux.includes(app) ? app : null
  }

  app.once("will-quit", updaterSubscriptions.clear)
  app.on("before-quit", () => drafts.flush())
  app.once("will-quit", () => drafts.close())
  app.on("browser-window-created", (_event, win) => win.on("session-end", () => drafts.flush()))

  ipcMain.handle("kill-sidecar", () => deps.killSidecar())
  ipcMain.handle("relaunch-app", () => deps.relaunch())
  ipcMain.handle("await-initialization", () => deps.awaitInitialization())
  ipcMain.handle("consume-initial-deep-links", () => deps.consumeInitialDeepLinks())
  ipcMain.handle("get-default-server-url", () => deps.getDefaultServerUrl())
  ipcMain.handle("set-default-server-url", (_event: IpcMainInvokeEvent, url: string | null) =>
    deps.setDefaultServerUrl(url),
  )
  ipcMain.handle("is-first-launch-onboarding-pending", () => deps.isFirstLaunchOnboardingPending())
  ipcMain.handle("finish-first-launch-onboarding", (_event: IpcMainInvokeEvent, createDefaultProject: boolean) =>
    deps.finishFirstLaunchOnboarding(createDefaultProject),
  )
  ipcMain.handle("is-old-layout-eligible", () => deps.isOldLayoutEligible())
  ipcMain.handle("get-display-backend", () => deps.getDisplayBackend())
  ipcMain.handle("set-display-backend", (_event: IpcMainInvokeEvent, backend: string | null) =>
    deps.setDisplayBackend(backend),
  )
  ipcMain.handle("check-app-exists", (_event: IpcMainInvokeEvent, appName: string) => deps.checkAppExists(appName))
  ipcMain.handle("resolve-app-path", (_event: IpcMainInvokeEvent, appName: string) => deps.resolveAppPath(appName))
  ipcMain.handle("updater-subscribe", (event) => {
    const id = event.sender.id
    updaterSubscriptions.set(
      id,
      deps.updater.subscribe((state) => {
        if (event.sender.isDestroyed()) return updaterSubscriptions.delete(id)
        event.sender.send("updater-state", state)
      }),
    )
    event.sender.once("destroyed", () => updaterSubscriptions.delete(id))
  })
  ipcMain.handle("updater-unsubscribe", (event) => updaterSubscriptions.delete(event.sender.id))
  ipcMain.handle("updater-check", () => deps.updater.check())
  ipcMain.handle("updater-install", () => deps.updater.install())
  ipcMain.handle("set-background-color", (_event: IpcMainInvokeEvent, color: string) => deps.setBackgroundColor(color))
  ipcMain.handle("export-debug-logs", () => deps.exportDebugLogs())
  ipcMain.handle("set-force-focus", (event: IpcMainInvokeEvent, enabled: boolean) =>
    setForceFocus(event.sender, enabled),
  )
  ipcMain.handle("record-fatal-renderer-error", (_event: IpcMainInvokeEvent, error: FatalRendererError) =>
    deps.recordFatalRendererError(error),
  )
  ipcMain.handle("set-native-translations", (event: IpcMainInvokeEvent, value: unknown) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win || win.isDestroyed() || win.webContents !== event.sender || event.senderFrame !== event.sender.mainFrame) {
      throw new Error("Invalid native translation sender")
    }
    const bundle = parseDesktopNativeBundle(value)
    if (!bundle) throw new Error("Invalid native translation bundle")
    deps.setNativeTranslations(bundle)
  })
  ipcMain.handle("voices-status", () => getVoicesStatus())
  ipcMain.handle("voices-download", () => downloadVoices())
  ipcMain.handle("voices-list", () => listVoices())
  ipcMain.handle("voices-speak", (_event: IpcMainInvokeEvent, text: string, voiceId?: string, options?: { automatic?: boolean }) =>
    speakVoice(text, voiceId, options),
  )
  ipcMain.handle("voices-speak-fish", (
    _event: IpcMainInvokeEvent,
    text: string,
    voiceId?: string,
    apiKey?: string,
    speed?: number,
  ) => speakFishVoice(text, voiceId, apiKey, speed))
  ipcMain.handle("voices-select", (_event: IpcMainInvokeEvent, voiceId: string) => selectVoice(voiceId))
  ipcMain.handle("voices-download-voice", (_event: IpcMainInvokeEvent, voiceId: string) => downloadVoice(voiceId))
  ipcMain.handle("voices-delete-voice", (_event: IpcMainInvokeEvent, voiceId: string) => deleteVoice(voiceId))
  ipcMain.handle("voices-set-enabled", (_event: IpcMainInvokeEvent, voiceId: string, enabled: boolean) =>
    setVoiceEnabled(voiceId, enabled),
  )
  ipcMain.handle("asr-status", () => getAsrStatus())
  ipcMain.handle("asr-ensure-model", () => ensureAsrModel())
  ipcMain.handle("asr-start", (_event: IpcMainInvokeEvent, language: "es" | "en") => {
    asrStart(language === "es" ? "es" : "en")
  })
  ipcMain.on("asr-chunk", (event: IpcMainEvent, samples: Float32Array) => {
    if (event.senderFrame !== event.sender.mainFrame) return
    asrChunk(samples)
  })
  ipcMain.handle("asr-stop", () => asrStop())
  ipcMain.handle("runtime-install-state", () => getRuntimeInstallState())
  ipcMain.handle("runtime-install", (_event: IpcMainInvokeEvent, kind: "ollama" | "lmstudio") => installRuntime(kind))
  ipcMain.handle("store-get", (_event: IpcMainInvokeEvent, name: string, key: string) => {
    requireStoreKey(name, "get", key)
    try {
      const store = getStore(name)
      const value = store.get(key)
      if (value === undefined || value === null) return null
      return typeof value === "string" ? value : JSON.stringify(value)
    } catch {
      return null
    }
  })
  ipcMain.handle("store-set", (_event: IpcMainInvokeEvent, name: string, key: string, value: string) => {
    requireStoreKey(name, "set", key)
    getStore(name).set(key, value)
  })
  ipcMain.handle("store-delete", (_event: IpcMainInvokeEvent, name: string, key: string) => {
    requireStoreKey(name, "delete", key)
    getStore(name).delete(key)
    void removeStoreFileIfEmpty(name)
  })
  ipcMain.handle("store-clear", (_event: IpcMainInvokeEvent, name: string) => {
    requireStoreAccess(name, "clear")
    getStore(name).clear()
    void removeStoreFileIfEmpty(name)
  })
  ipcMain.handle("store-keys", (_event: IpcMainInvokeEvent, name: string) => {
    requireStoreAccess(name, "list")
    const store = getStore(name)
    return Object.keys(store.store)
  })
  ipcMain.handle("store-length", (_event: IpcMainInvokeEvent, name: string) => {
    requireStoreAccess(name, "list")
    const store = getStore(name)
    return Object.keys(store.store).length
  })
  ipcMain.handle("draft-get", (_event, key: string) => drafts.get(key))
  ipcMain.handle("draft-set", (_event, key: string, value: string) => drafts.set(key, value))
  ipcMain.handle("draft-delete", (_event, key: string) => drafts.set(key, null))
  ipcMain.handle("draft-blob-put", (_event, data: ArrayBuffer) => drafts.putBlob(new Uint8Array(data)))
  ipcMain.handle("draft-blob-get", (_event, id: string) => {
    const data = drafts.getBlob(id)
    return data ? data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) : null
  })

  ipcMain.handle(
    "open-directory-picker",
    async (_event: IpcMainInvokeEvent, opts?: { multiple?: boolean; title?: string; defaultPath?: string }) => {
      const result = await dialog.showOpenDialog({
        properties: ["openDirectory", ...(opts?.multiple ? ["multiSelections" as const] : []), "createDirectory"],
        title: opts?.title ?? nativeT("desktop.dialog.chooseFolder"),
        defaultPath: opts?.defaultPath,
      })
      if (result.canceled) return null
      return opts?.multiple ? result.filePaths : result.filePaths[0]
    },
  )

  ipcMain.handle(
    "open-file-picker",
    async (
      event: IpcMainInvokeEvent,
      opts?: { multiple?: boolean; title?: string; defaultPath?: string; extensions?: string[] },
    ) => {
      const result = await dialog.showOpenDialog({
        properties: ["openFile", ...(opts?.multiple ? ["multiSelections" as const] : [])],
        title: opts?.title ?? nativeT("desktop.dialog.chooseFile"),
        defaultPath: opts?.defaultPath,
        filters: pickerFilters(opts?.extensions),
      })
      if (result.canceled) return null
      const files = await Promise.all(
        result.filePaths.map(async (filePath) => ({
          path: filePath,
          name: basename(filePath),
          size: (await stat(filePath)).size,
        })),
      )
      assertAttachmentBudget(files)
      const token = pickedFiles.add(event.sender.id, result.filePaths)
      return { token, files }
    },
  )

  ipcMain.handle("read-picked-file", async (event: IpcMainInvokeEvent, token: string, filePath: string) => {
    return pickedFiles.read(event.sender.id, token, filePath)
  })

  ipcMain.handle("release-picked-files", (event: IpcMainInvokeEvent, token: string) => {
    pickedFiles.release(event.sender.id, token)
  })

  ipcMain.handle(
    "save-file-picker",
    async (_event: IpcMainInvokeEvent, opts?: { title?: string; defaultPath?: string }) => {
      const result = await dialog.showSaveDialog({
        title: opts?.title ?? nativeT("desktop.dialog.saveFile"),
        defaultPath: opts?.defaultPath,
      })
      if (result.canceled) return null
      const filePath = result.filePath
      if (filePath) authorizeWritePath(filePath)
      return filePath ?? null
    },
  )

  // Escribe texto en un archivo elegido por el usuario (exportar conversación
  // a Markdown, etc.). Solo se admiten paths devueltos por el save-file-picker
  // de este proceso; el permiso se consume en el primer uso.
  ipcMain.handle("write-text-file", async (_event: IpcMainInvokeEvent, path: string, content: string) => {
    if (!authorizedWritePaths.delete(path)) throw new Error("Path no autorizado")
    await writeFile(path, content, "utf8")
    return true
  })

  ipcMain.on("open-external", (event: IpcMainEvent, url: string) => {
    // Las URLs de vista previa local (dev server, HTML del proyecto) que la
    // UI pide abrir fuera se muestran en el panel "Vista en vivo": se
    // reenvían al renderer para que abra el sandbox en lugar del navegador.
    if (isLiveViewPreviewUrl(url)) {
      event.sender.send("live-view-navigate", url)
      return
    }
    openExternalURL(url)
  })

  ipcMain.on("open-local-file", (event: IpcMainEvent, url: string) => {
    if (isLiveViewPreviewUrl(url)) {
      event.sender.send("live-view-navigate", url)
      return
    }
    openLocalFileURL(url)
  })

  ipcMain.handle("open-path", async (_event: IpcMainInvokeEvent, path: string, app?: string) => {
    const info = await stat(path).catch(() => null)
    if (!isAbsolute(path) || !info) throw new Error("La ruta no existe o no es absoluta")
    if (!app) return shell.openPath(path)
    const resolved = await resolveOpenApp(app)
    if (!resolved) throw new Error("Aplicación no permitida")
    await new Promise<void>((resolve, reject) => {
      const [cmd, args] =
        process.platform === "darwin" ? (["open", ["-a", resolved, path]] as const) : ([resolved, [path]] as const)
      execFile(cmd, args, (err) => (err ? reject(err) : resolve()))
    })
  })

  ipcMain.handle("reveal-path", async (_event: IpcMainInvokeEvent, path: string) => {
    const exists = await stat(path).then(
      () => true,
      () => false,
    )
    if (!exists) return false
    shell.showItemInFolder(path)
    return true
  })

  ipcMain.handle("read-clipboard-image", () => {
    const image = clipboard.readImage()
    if (image.isEmpty()) return null
    const buffer = image.toPNG().buffer
    const size = image.getSize()
    return { buffer, width: size.width, height: size.height }
  })

  // Capturas para el chat (el modelo puede analizarlas vía un MCP de visión).
  ipcMain.handle("capture-screen", () => captureScreen())
  ipcMain.handle("capture-area", (_event: IpcMainInvokeEvent, bounds: { x: number; y: number; width: number; height: number }) =>
    captureArea(bounds),
  )
  ipcMain.handle("capture-window", (event: IpcMainInvokeEvent) => captureWindow(event.sender))
  ipcMain.handle("capture-preview", (event: IpcMainInvokeEvent) => capturePreview(event.sender.id))
  ipcMain.handle("capture-live-view", (event: IpcMainInvokeEvent) => captureLiveView(event.sender.id))

  // Borra el almacenamiento de los webviews del navegador interno y la vista
  // en vivo (cookies, caché, localStorage) desde la página de ajustes.
  ipcMain.handle("clear-webview-data", () => clearWebviewData())

  // Inicio con Windows: el estado lo gestiona el sistema operativo.
  ipcMain.handle("set-login-item", (_event: IpcMainInvokeEvent, enabled: boolean) => {
    app.setLoginItemSettings({ openAtLogin: enabled, path: process.execPath })
    return app.getLoginItemSettings().openAtLogin
  })
  ipcMain.handle("get-login-item", () => app.getLoginItemSettings().openAtLogin)

  // Respaldos de datos (sesiones + configuración; los modelos no se respaldan).
  ipcMain.handle("backup-now", () => backupNow())
  ipcMain.handle("backup-list", () => listBackups())
  ipcMain.handle("backup-restore", (_event: IpcMainInvokeEvent, name: string) => restoreBackup(name))

  ipcMain.handle("get-window-id", (event: IpcMainInvokeEvent) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) throw new Error("Window not found")
    const id = getWindowID(win)
    if (!id) throw new Error("Window ID not found")
    return id
  })

  ipcMain.handle("get-window-focused", (event: IpcMainInvokeEvent) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    return win?.isFocused() ?? false
  })

  ipcMain.handle("get-window-fullscreen", (event: IpcMainInvokeEvent) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    return win?.isFullScreen() ?? false
  })

  ipcMain.handle("set-window-focus", (event: IpcMainInvokeEvent) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    win?.focus()
  })

  ipcMain.handle("set-compact-window", (event: IpcMainInvokeEvent, options?: { width?: number; height?: number }) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win || win.isDestroyed()) return
    const width = options?.width ?? 440
    const height = options?.height ?? 380
    if (win.isMaximized()) win.unmaximize()
    win.setResizable(false)
    win.setMaximizable(false)
    win.setSize(width, height, true)
    win.center()
  })

  ipcMain.handle("restore-main-window", (event: IpcMainInvokeEvent) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win || win.isDestroyed()) return
    win.setResizable(true)
    win.setMaximizable(true)
    win.setMinimumSize(800, 600)
    win.setSize(1280, 800, true)
    win.center()
  })

  ipcMain.handle("show-window", (event: IpcMainInvokeEvent) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    win?.show()
  })

  ipcMain.on("relaunch", () => {
    deps.relaunch()
  })

  ipcMain.handle("get-zoom-factor", (event: IpcMainInvokeEvent) => event.sender.getZoomFactor())
  ipcMain.handle("set-zoom-factor", (event: IpcMainInvokeEvent, factor: number) => {
    event.sender.setZoomFactor(factor)
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return
    updateTitlebar(win)
  })
  ipcMain.handle("get-pinch-zoom-enabled", () => getPinchZoomEnabled())
  ipcMain.handle("set-pinch-zoom-enabled", (_event: IpcMainInvokeEvent, enabled: boolean) => {
    setPinchZoomEnabled(enabled)
  })
  ipcMain.handle("set-titlebar", (event: IpcMainInvokeEvent, theme: TitlebarTheme) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return
    setTitlebar(win, theme)
  })
  ipcMain.handle("run-desktop-menu-action", (event: IpcMainInvokeEvent, action: DesktopMenuAction) => {
    runDesktopMenuAction(BrowserWindow.fromWebContents(event.sender), action, {
      checkForUpdates: () => void deps.showUpdater(),
      relaunch: deps.relaunch,
    })
  })

  ipcMain.handle(
    "model-hub-delete-file",
    async (_event: IpcMainInvokeEvent, target: { file?: string; id?: string; destPath?: string }) => {
      getLogger()?.info("model-hub-delete-file requested", target)

      // 1. Matar cualquier proceso de llama-server para liberar bloqueos en Windows
      if (process.platform === "win32") {
        try {
          execFile("taskkill", ["/F", "/IM", "llama-server.exe", "/T"])
          execFile("taskkill", ["/F", "/IM", "llama.exe", "/T"])
        } catch {}
      }

      const fileOrName = target.file || target.id || ""
      const cleanFileName = fileOrName.replace(/\.gguf$/i, "")

      const candidateDirs = [
        join(app.getPath("appData"), "ai.tiancode.desktop", "xdg", "data", "tiancode", "models"),
        join(app.getPath("appData"), "ai.tiancode.desktop.codex", "xdg", "data", "tiancode", "models"),
        join(app.getPath("userData"), "xdg", "data", "tiancode", "models"),
        join(app.getPath("home"), ".tiancode", "models"),
        join(app.getPath("home"), ".local", "share", "tiancode", "models"),
      ]

      const { rm, readdir, readFile, writeFile } = await import("node:fs/promises")

      for (const dir of candidateDirs) {
        // Limpieza en .jobs.json
        try {
          const jobsPath = join(dir, ".jobs.json")
          const content = await readFile(jobsPath, "utf-8")
          const jobsList = JSON.parse(content)
          if (Array.isArray(jobsList)) {
            const filtered = jobsList.filter((j: any) => {
              if (!j) return false
              if (target.id && j.id === target.id) return false
              if (target.file && j.file === target.file) return false
              if (target.destPath && j.destPath === target.destPath) return false
              if (fileOrName && (j.file?.includes(fileOrName) || j.destPath?.includes(fileOrName))) return false
              return true
            })
            await writeFile(jobsPath, JSON.stringify(filtered, null, 2), "utf-8")
          }
        } catch {}

        // Eliminación física recursiva de archivos .gguf o carpetas
        try {
          const deleteMatching = async (currentDir: string) => {
            const entries = await readdir(currentDir, { withFileTypes: true }).catch(() => [])
            for (const entry of entries) {
              const full = join(currentDir, entry.name)
              const nameLower = entry.name.toLowerCase()
              const isMatch =
                (target.file && nameLower === target.file.toLowerCase()) ||
                (target.destPath && full.toLowerCase() === target.destPath.toLowerCase()) ||
                (fileOrName && nameLower.includes(fileOrName.toLowerCase())) ||
                (cleanFileName && nameLower.includes(cleanFileName.toLowerCase()))

              if (isMatch) {
                await rm(full, { recursive: true, force: true }).catch(() => {})
              } else if (entry.isDirectory() && entry.name !== "." && entry.name !== "..") {
                await deleteMatching(full)
              }
            }
          }
          await deleteMatching(dir)
        } catch {}
      }

      const isInsideCandidateDir = (targetPath: string) => {
        const resolvedTarget = resolve(targetPath)
        return candidateDirs.some((dir) => {
          const rel = relative(resolve(dir), resolvedTarget)
          return !rel.startsWith("..") && !isAbsolute(rel)
        })
      }

      if (target.destPath && isInsideCandidateDir(target.destPath)) {
        try {
          await rm(target.destPath, { recursive: true, force: true }).catch(() => {})
          await rm(`${target.destPath}.part`, { recursive: true, force: true }).catch(() => {})
        } catch {}
      }

      // Verify the artifact is really gone; a locked file (llama-server still
      // holding the handle, AV quarantine, etc.) must not report success or
      // the model silently resurrects via auto-discovery on next start.
      let stillExists = false
      for (const dir of candidateDirs) {
        try {
          const verifyDir = async (currentDir: string) => {
            const entries = await readdir(currentDir, { withFileTypes: true }).catch(() => [])
            for (const entry of entries) {
              if (stillExists) return
              const nameLower = entry.name.toLowerCase()
              const isMatch =
                (target.file && nameLower === target.file.toLowerCase()) ||
                (fileOrName && nameLower.includes(fileOrName.toLowerCase())) ||
                (cleanFileName && nameLower.includes(cleanFileName.toLowerCase()))
              if (isMatch && entry.isFile() && !nameLower.endsWith(".part")) {
                stillExists = true
                return
              }
              if (entry.isDirectory()) await verifyDir(join(currentDir, entry.name))
            }
          }
          await verifyDir(dir)
        } catch {}
      }

      return { success: !stillExists }
    },
  )
}

export function sendMenuCommand(win: BrowserWindow, id: string) {
  win.webContents.send("menu-command", id)
}

export function sendDeepLinks(win: BrowserWindow, urls: string[]) {
  win.webContents.send("deep-link", urls)
}
