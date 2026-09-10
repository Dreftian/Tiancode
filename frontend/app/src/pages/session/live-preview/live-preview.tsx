import { IconButtonV2 } from "@tiancode-ai/ui/v2/icon-button-v2"
import { Icon as IconV2 } from "@tiancode-ai/ui/v2/icon"
import { SelectV2 } from "@tiancode-ai/ui/v2/select-v2"
import { Spinner } from "@tiancode-ai/ui/spinner"
import { createEffect, createSignal, For, onCleanup, onMount, Show } from "solid-js"
import { createStore } from "solid-js/store"
import { Persist, persisted } from "@/utils/persist"
import { normalizeUrl } from "@/components/preview/preview-panel"
import { useLanguage } from "@/context/language"
import { usePlatform } from "@/context/platform"
import { useSDK } from "@/context/sdk"
import { useServer } from "@/context/server"
import { authTokenFromCredentials } from "@/utils/server"
import type { PreviewViewState } from "@/context/platform"
import { previewActionUrl, previewLogsUrl, previewStatusUrl, type PreviewAction } from "./live-preview-url"
import { PREVIEW_RETRY_MAX_ATTEMPTS, isRetryablePreviewLoadFailure, previewRetryDelay, samePreviewUrl } from "./live-preview-retry"
import { iframePreviewUrl, usesIframePreview } from "./live-preview-transport"
import { orientedPreviewDimensions } from "./preview-experience"
import { reactToBuild, shortenBuildTrigger } from "./live-preview-build"
import { fittedPreviewViewport } from "./preview-viewport"

// Estado del dev server gestionado por el agente (DevServerManager, /preview).
type DevServerState = {
  status: "idle" | "starting" | "ready" | "error" | "stopped"
  url: string | null
  port: number | null
  framework: string | null
  packageManager: string | null
  command: string | null
  errors: { file: string | null; line: number | null; message: string }[]
  startedAt: number | null
  errorMessage: string | null
  isDesktop?: boolean
  // Incremental rebuild progress. The server stays "ready" while a rebuild runs, so this is
  // the only signal that work is in flight after the agent (or the user) touches a file.
  build?: {
    running: boolean
    startedAt: number | null
    durationMs: number | null
    ok: boolean | null
    trigger: string | null
    sequence: number
  }
}

type InspectedElementInfo = {
  tag: string
  classes: string
  id: string
  dimensions: string
  margin: string
  padding: string
}

type PreviewIssue = {
  type: "runtime" | "whitescreen"
  message: string
  url?: string
}

// La vista previa local se muestra en un iframe dentro del renderer. Esto hace
// que sus píxeles respeten el borde, el tamaño y el modo expandido del Sandbox.
// WebContentsView queda como fallback para destinos no locales.

const ZOOM_MIN = 0.25
const ZOOM_MAX = 5
const ZOOM_STEP = 0.2
const CUSTOM_MIN = 80
const CUSTOM_MAX = 4096
const HIDDEN_PREVIEW_BOUNDS = { x: 0, y: 0, width: 0, height: 0 }

export function isBlankPreviewUrl(url: string | undefined) {
  return !url || url.startsWith("about:blank")
}

// Older desktop builds used a data URL as an empty-state webview. It is not a
// project preview and leaves a long, confusing URL in the toolbar after an
// upgrade, so it must never be revealed as the current application.
export function isWelcomePreviewUrl(url: string | undefined) {
  return url?.startsWith("data:text/html;charset=utf-8,") ?? false
}

const DEVICE_PRESETS = {
  desktop: { width: 1920, height: 1080 },
  desktopCompact: { width: 1440, height: 900 },
  macbook: { width: 1512, height: 982 },
  laptop: { width: 1366, height: 768 },
  tablet: { width: 820, height: 1180 },
  tabletCompact: { width: 768, height: 1024 },
  androidTablet: { width: 800, height: 1280 },
  mobile: { width: 393, height: 852 },
  mobileMax: { width: 430, height: 932 },
  androidPhone: { width: 412, height: 915 },
  mobileCompact: { width: 375, height: 667 },
  tv: { width: 2560, height: 1440 },
} as const

type DeviceId = "fit" | keyof typeof DEVICE_PRESETS | "custom"
type IframeHistoryMode = "push" | "traverse"

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max)

function ToolButton(props: {
  pressed?: boolean
  disabled?: boolean
  title: string
  onClick: () => void
  children: string
}) {
  return (
    <button
      type="button"
      data-pressed={props.pressed || undefined}
      disabled={props.disabled}
      onClick={props.onClick}
      title={props.title}
      aria-pressed={props.pressed}
      class="flex h-6 shrink-0 items-center gap-1 rounded-md px-1.5 text-11-regular text-text-weak transition-colors hover:bg-v2-overlay-simple-overlay-hover hover:text-text-base disabled:opacity-40 data-[pressed]:bg-v2-overlay-simple-overlay-active data-[pressed]:text-text-base"
    >
      {props.children}
    </button>
  )
}

export function LivePreview(props: {
  targetUrl?: () => string | undefined
  autoStartKey?: () => string | undefined
  directory?: () => string | undefined
  onManagedTarget?: (url: string | undefined) => void
  onCapture?: (file: File) => void
  onOpenSource?: (path: string) => void
  externalDevice?: () => "fluid" | "mobile" | "tablet" | "laptop" | undefined
  onDeviceChange?: (mode: "fluid" | "mobile" | "tablet" | "laptop") => void
  onDirectoryChange?: (dir: string) => void
  /** File the agent is currently writing, tracked from write/edit/apply_patch tool parts. */
  activeEditFile?: () => string | undefined
}) {
  const language = useLanguage()
  const platform = usePlatform()
  const preview = () => platform.previewView
  const sdk = useSDK()
  const server = useServer()

  const [state, setState] = createSignal<PreviewViewState | null>(null)
  const [urlInput, setUrlInput] = createSignal("")
  const [fail, setFail] = createSignal<{ code: number; description: string; url: string } | null>(null)
  const [previewPrefs, setPreviewPrefs] = persisted(
    Persist.global("live-preview.preferences"),
    createStore({
      deviceId: "fit" as DeviceId,
      customWidth: 1600,
      customHeight: 900,
      zoom: 1,
    }),
  )
  const zoom = () => previewPrefs.zoom
  const setZoom = (value: number | ((prev: number) => number)) => {
    const next = typeof value === "function" ? value(previewPrefs.zoom) : value
    setPreviewPrefs("zoom", clamp(next, ZOOM_MIN, ZOOM_MAX))
  }
  const deviceId = () => previewPrefs.deviceId
  const setDeviceId = (id: DeviceId) => setPreviewPrefs("deviceId", id)
  const [inspectActive, setInspectActive] = createSignal(false)
  const [selectedElement, setSelectedElement] = createSignal<InspectedElementInfo | null>(null)
  const [previewIssue, setPreviewIssue] = createSignal<PreviewIssue | null>(null)

  let lastExternal = props.externalDevice?.()
  createEffect(() => {
    const ext = props.externalDevice?.()
    if (!ext || ext === lastExternal) return
    lastExternal = ext
    if (ext === "mobile") {
      setDeviceId("mobile")
      setZoom(1)
    } else if (ext === "tablet") {
      setDeviceId("tablet")
      setZoom(1)
    } else if (ext === "laptop") {
      setDeviceId("laptop")
      setZoom(1)
    } else if (ext === "fluid") {
      setDeviceId("fit")
      setZoom(1)
    }
  })

  const [rotated, setRotated] = createSignal(false)
  const customSize = () => ({ width: previewPrefs.customWidth, height: previewPrefs.customHeight })
  const setCustomSize = (
    value:
      | { width: number; height: number }
      | ((prev: { width: number; height: number }) => { width: number; height: number }),
  ) => {
    const next = typeof value === "function" ? value(customSize()) : value
    setPreviewPrefs("customWidth", clamp(next.width, CUSTOM_MIN, CUSTOM_MAX))
    setPreviewPrefs("customHeight", clamp(next.height, CUSTOM_MIN, CUSTOM_MAX))
  }
  const [previewSurfaceVisible, setPreviewSurfaceVisible] = createSignal(false)
  const [iframeUrl, setIframeUrl] = createSignal<string>()
  const [iframeLoading, setIframeLoading] = createSignal(false)
  const [nativePreviewActive, setNativePreviewActive] = createSignal(false)
  const [availableViewport, setAvailableViewport] = createSignal({ width: 0, height: 0 })
  // Dev server gestionado por el agente (DevServerManager del backend).
  const [devServer, setDevServer] = createSignal<DevServerState | null>(null)
  // Last rebuild we already reacted to; see fetchDevServer for why this is a counter.
  let lastBuildSequence = 0

  let container: HTMLDivElement | undefined
  // La navegación manual (URL tecleada, atrás/adelante) gana sobre la
  // auto-detección del dev server; una URL nueva del agente la reanuda.
  let lastTargetUrl: string | undefined
  let requestedUrl: string | undefined
  let failedUrl: string | undefined
  let retryAttempts = 0
  let retryTimer: number | undefined
  let lastAutoStartKey: string | undefined
  let previewVisible = false
  let previewMounted = true
  let boundsReady = false
  let previewContentReady = false
  let boundsFrame: number | undefined
  let lastBounds: string | undefined
  let lastNativeZoom: number | undefined
  let iframe: HTMLIFrameElement | undefined
  let iframeHistory: string[] = []
  let iframeHistoryIndex = -1
  let whiteScreenTimer: number | undefined
  let inspectorCleanup: (() => void) | undefined

  const clearWhiteScreenTimer = () => {
    if (whiteScreenTimer !== undefined) {
      window.clearTimeout(whiteScreenTimer)
      whiteScreenTimer = undefined
    }
  }

  const detachInspector = () => {
    if (inspectorCleanup) {
      inspectorCleanup()
      inspectorCleanup = undefined
    }
  }

  const attachInspector = () => {
    detachInspector()
    if (!iframe) return
    try {
      const doc = iframe.contentDocument
      if (!doc || !doc.body) return

      let overlay = doc.getElementById("__tiancode_inspector_overlay") as HTMLDivElement | null
      if (!overlay) {
        overlay = doc.createElement("div")
        overlay.id = "__tiancode_inspector_overlay"
        overlay.style.cssText =
          "position:fixed;pointer-events:none;z-index:2147483647;display:none;box-sizing:border-box;border:2px solid #06b6d4;background:rgba(6,182,212,0.15);box-shadow:0 0 10px rgba(6,182,212,0.4);transition:top 0.05s ease,left 0.05s ease,width 0.05s ease,height 0.05s ease;"
        doc.body.appendChild(overlay)
      }

      let badge = doc.getElementById("__tiancode_inspector_badge") as HTMLDivElement | null
      if (!badge) {
        badge = doc.createElement("div")
        badge.id = "__tiancode_inspector_badge"
        badge.style.cssText =
          "position:absolute;bottom:100%;left:0;margin-bottom:4px;background:#083344;color:#67e8f9;padding:2px 6px;border-radius:4px;font-size:11px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-weight:600;white-space:nowrap;box-shadow:0 2px 8px rgba(0,0,0,0.5);border:1px solid #06b6d4;pointer-events:none;"
        overlay.appendChild(badge)
      }

      const handleMouseOver = (e: MouseEvent) => {
        const target = e.target as HTMLElement | null
        if (!target || target === overlay || overlay.contains(target) || target === doc.body || target === doc.documentElement) {
          return
        }
        const rect = target.getBoundingClientRect()
        overlay.style.display = "block"
        overlay.style.top = `${rect.top}px`
        overlay.style.left = `${rect.left}px`
        overlay.style.width = `${rect.width}px`
        overlay.style.height = `${rect.height}px`

        const tag = target.tagName.toLowerCase()
        const idStr = target.id ? `#${target.id}` : ""
        const classStr =
          typeof target.className === "string" && target.className.trim()
            ? `.${target.className.trim().split(/\s+/).slice(0, 2).join(".")}`
            : ""
        const dimStr = `${Math.round(rect.width)} × ${Math.round(rect.height)}`
        badge.textContent = `${tag}${idStr}${classStr}  ${dimStr}`

        if (rect.top < 26) {
          badge.style.bottom = "auto"
          badge.style.top = "100%"
          badge.style.marginTop = "4px"
          badge.style.marginBottom = "0"
        } else {
          badge.style.bottom = "100%"
          badge.style.top = "auto"
          badge.style.marginTop = "0"
          badge.style.marginBottom = "4px"
        }
      }

      const handleClick = (e: MouseEvent) => {
        const target = e.target as HTMLElement | null
        if (!target || target === overlay || overlay.contains(target)) return
        e.preventDefault()
        e.stopPropagation()
        const rect = target.getBoundingClientRect()
        const win = doc.defaultView ?? window
        const computed = win.getComputedStyle(target)
        const tag = target.tagName.toLowerCase()
        const classNames = typeof target.className === "string" ? target.className.trim() : ""
        setSelectedElement({
          tag,
          classes: classNames,
          id: target.id || "",
          dimensions: `${Math.round(rect.width)}px × ${Math.round(rect.height)}px`,
          margin: `${computed.marginTop} ${computed.marginRight} ${computed.marginBottom} ${computed.marginLeft}`,
          padding: `${computed.paddingTop} ${computed.paddingRight} ${computed.paddingBottom} ${computed.paddingLeft}`,
        })
      }

      const handleDocKeyDown = (e: KeyboardEvent) => {
        if ((e.ctrlKey || e.metaKey) && e.altKey && (e.key === "i" || e.key === "I" || e.code === "KeyI")) {
          e.preventDefault()
          setInspectActive((prev) => !prev)
        }
      }

      const handleScroll = () => {
        overlay.style.display = "none"
      }

      doc.addEventListener("mouseover", handleMouseOver, true)
      doc.addEventListener("click", handleClick, true)
      doc.addEventListener("keydown", handleDocKeyDown, true)
      doc.addEventListener("scroll", handleScroll, true)

      inspectorCleanup = () => {
        try {
          doc.removeEventListener("mouseover", handleMouseOver, true)
          doc.removeEventListener("click", handleClick, true)
          doc.removeEventListener("keydown", handleDocKeyDown, true)
          doc.removeEventListener("scroll", handleScroll, true)
          overlay.remove()
        } catch {
          // ignore
        }
      }
    } catch {
      // Cross-origin iframe
    }
  }

  createEffect(() => {
    if (inspectActive()) {
      attachInspector()
    } else {
      detachInspector()
      setSelectedElement(null)
    }
  })

  const revealPreview = () => {
    if (!previewMounted || !nativePreviewActive() || previewVisible || !boundsReady || !previewContentReady) return
    previewVisible = true
    setPreviewSurfaceVisible(true)
    void preview()?.setVisible(true)
  }

  const clearRetry = () => {
    if (retryTimer === undefined) return
    window.clearTimeout(retryTimer)
    retryTimer = undefined
  }

  const scheduleRetry = (target: string) => {
    if (retryTimer !== undefined || retryAttempts >= PREVIEW_RETRY_MAX_ATTEMPTS) return
    const attempt = retryAttempts++
    retryTimer = window.setTimeout(() => {
      retryTimer = undefined
      if (!samePreviewUrl(requestedUrl, target)) return
      if (usesIframePreview(target)) {
        reloadIframe()
        return
      }
      void preview()?.navigate(target)
    }, previewRetryDelay(attempt))
  }

  // Tamaño que debe ocupar la vista: null = llenar el contenedor (fit).
  const unrotatedDeviceSize = () => {
    const id = deviceId()
    if (id === "fit") return null
    if (id === "custom") return customSize()
    return DEVICE_PRESETS[id]
  }

  const deviceSize = () => orientedPreviewDimensions(unrotatedDeviceSize() ?? undefined, rotated()) ?? null

  const deviceFrame = () => {
    const id = deviceId()
    if (id === "fit") return 0
    if (id === "mobile" || id === "mobileMax" || id === "mobileCompact" || id === "androidPhone") return 12
    if (id === "tablet" || id === "tabletCompact" || id === "androidTablet") return 10
    if (id === "tv") return 8
    return 8
  }

  const previewViewport = () => fittedPreviewViewport(availableViewport(), deviceSize() ?? undefined, zoom(), deviceFrame())

  const measureViewport = () => {
    if (!container) return
    const rect = container.getBoundingClientRect()
    const next = { width: Math.round(rect.width), height: Math.round(rect.height) }
    setAvailableViewport((current) => current.width === next.width && current.height === next.height ? current : next)
  }

  // Bounds del WebContentsView: rect del contenedor real del panel, o el
  // dispositivo centrado dentro de él. El main escala por el zoom de ventana.
  const reportBounds = () => {
    if (!nativePreviewActive() || iframeUrl()) return
    const view = preview()
    if (!view || !container) return
    const rect = container.getBoundingClientRect()
    if (rect.width < 1 || rect.height < 1) {
      boundsReady = false
      lastBounds = undefined
      previewVisible = false
      setPreviewSurfaceVisible(false)
      // La superficie nativa vive por encima del DOM. También borramos sus
      // bounds para que una vista residual no cubra el panel al colapsarse.
      void view.setBounds(HIDDEN_PREVIEW_BOUNDS)
      return
    }
    const device = deviceSize()
    const viewport = previewViewport()
    const width = Math.max(1, Math.round(device ? viewport.width - viewport.frame * 2 : rect.width))
    const height = Math.max(1, Math.round(device ? viewport.height - viewport.frame * 2 : rect.height))
    const nextZoom = device ? viewport.scale : zoom()
    if (nextZoom !== lastNativeZoom) {
      lastNativeZoom = nextZoom
      void view.setZoom(nextZoom)
    }
    const bounds = {
      x: Math.round(device ? rect.x + (rect.width - width) / 2 : rect.x),
      y: Math.round(device ? rect.y + (rect.height - height) / 2 : rect.y),
      width,
      height,
    }
    const key = `${bounds.x}:${bounds.y}:${bounds.width}:${bounds.height}`
    if (key === lastBounds) {
      boundsReady = true
      revealPreview()
      return
    }
    lastBounds = key
    void view.setBounds(bounds).then(() => {
      if (!previewMounted) return
      boundsReady = true
      revealPreview()
    }).catch(() => {
      lastBounds = undefined
    })
  }

  const queueBounds = () => {
    if (boundsFrame !== undefined) return
    boundsFrame = window.requestAnimationFrame(() => {
      boundsFrame = undefined
      measureViewport()
      reportBounds()
    })
  }

  const hideNativePreview = () => {
    setNativePreviewActive(false)
    previewVisible = false
    boundsReady = false
    previewContentReady = false
    lastBounds = undefined
    lastNativeZoom = undefined
    setPreviewSurfaceVisible(false)
    const view = preview()
    if (!view) return
    // A WebContentsView is composed above the DOM. Clear its bounds before
    // hiding it so a previous native preview can never cover this iframe.
    void view.setBounds(HIDDEN_PREVIEW_BOUNDS)
    void view.setVisible(false)
  }

  const updateIframeState = (target: string, loading: boolean) => {
    setState({
      url: target,
      loading,
      canGoBack: iframeHistoryIndex > 0,
      canGoForward: iframeHistoryIndex < iframeHistory.length - 1,
      visible: true,
      selectMode: false,
    })
  }

  const navigateTo = (target: string, historyMode: IframeHistoryMode = "push") => {
    if (!target) return
    const iframeTarget = iframePreviewUrl(target)
    const nextTarget = iframeTarget ?? target
    if (!samePreviewUrl(requestedUrl, nextTarget)) {
      retryAttempts = 0
      failedUrl = undefined
      clearRetry()
    }
    clearWhiteScreenTimer()
    setPreviewIssue(null)
    requestedUrl = nextTarget
    setUrlInput(nextTarget)
    if (iframeTarget) {
      if (historyMode === "push" && !samePreviewUrl(iframeHistory[iframeHistoryIndex], iframeTarget)) {
        iframeHistory = [...iframeHistory.slice(0, iframeHistoryIndex + 1), iframeTarget]
        iframeHistoryIndex = iframeHistory.length - 1
      }
      setIframeLoading(true)
      setIframeUrl(iframeTarget)
      updateIframeState(iframeTarget, true)
      hideNativePreview()
      return
    }
    setIframeUrl(undefined)
    setIframeLoading(false)
    setNativePreviewActive(true)
    queueBounds()
    void preview()?.navigate(target)
  }

  function reloadIframe() {
    const target = iframeUrl()
    if (!target) return
    clearWhiteScreenTimer()
    setPreviewIssue(null)
    setIframeLoading(true)
    setFail(null)
    updateIframeState(target, true)
    if (iframe) {
      try {
        iframe.contentWindow?.postMessage({ type: "tiancode:reload", timestamp: Date.now() }, "*")
      } catch {
        // ignore
      }
      try {
        const u = new URL(target)
        u.searchParams.set("_t", String(Date.now()))
        iframe.src = u.toString()
        return
      } catch {
        try {
          iframe.contentWindow?.location.reload()
        } catch {
          iframe.src = target
        }
        return
      }
    }
    setIframeUrl(undefined)
    window.requestAnimationFrame(() => setIframeUrl(target))
  }

  const completeIframeLoad = () => {
    const target = iframeUrl()
    if (!target) return
    clearWhiteScreenTimer()
    setPreviewIssue((current) => (current?.type === "whitescreen" ? null : current))
    try {
      if (iframe?.contentWindow) {
        const win = iframe.contentWindow as unknown as Record<string, unknown> & {
          addEventListener: (type: string, listener: (event: unknown) => void) => void
          console: Console
          __tiancode_hooked?: boolean
        }

        if (!win.__tiancode_hooked) {
          win.__tiancode_hooked = true

          win.addEventListener("error", (event: unknown) => {
            const ev = event as ErrorEvent
            const errorMsg = ev.message || (ev.error && String(ev.error.message)) || "Error de ejecución en la vista previa"
            setPreviewIssue({
              type: "runtime",
              message: errorMsg,
              url: iframeUrl(),
            })
          })

          win.addEventListener("unhandledrejection", (event: unknown) => {
            const ev = event as PromiseRejectionEvent
            const reason = ev.reason as unknown
            const reasonRecord = typeof reason === "object" && reason !== null ? (reason as Record<string, unknown>) : undefined
            const errorMsg = (reasonRecord?.message as string | undefined) || String(reason || "Promesa rechazada no controlada")
            setPreviewIssue({
              type: "runtime",
              message: errorMsg,
              url: iframeUrl(),
            })
          })

          const origConsoleError = win.console.error
          win.console.error = (...args: unknown[]) => {
            origConsoleError.apply(win.console, args)
            const text = args
              .map((arg) => (typeof arg === "string" ? arg : arg instanceof Error ? `${arg.name}: ${arg.message}\n${arg.stack || ""}` : JSON.stringify(arg)))
              .join(" ")
            if (
              text.includes("Uncaught") ||
              text.includes("Error:") ||
              text.includes("Failed to load resource") ||
              text.includes("SyntaxError") ||
              text.includes("ReferenceError") ||
              text.includes("TypeError")
            ) {
              setPreviewIssue({
                type: "runtime",
                message: text.slice(0, 500),
                url: iframeUrl(),
              })
            }
          }
        }
        if (!win.electron) {
          const ipcListeners = new Map<string, Set<Function>>()
          win.electron = {
            ipcRenderer: {
              send: (channel: string, ...args: any[]) => {
                const listeners = ipcListeners.get(channel)
                if (listeners) {
                  listeners.forEach((fn) => {
                    try { fn({}, ...args) } catch {}
                  })
                }
              },
              on: (channel: string, listener: Function) => {
                if (!ipcListeners.has(channel)) ipcListeners.set(channel, new Set())
                ipcListeners.get(channel)!.add(listener)
                return () => ipcListeners.get(channel)?.delete(listener)
              },
              once: (channel: string, listener: Function) => {
                const wrapper = (...args: any[]) => {
                  ipcListeners.get(channel)?.delete(wrapper)
                  listener(...args)
                }
                if (!ipcListeners.has(channel)) ipcListeners.set(channel, new Set())
                ipcListeners.get(channel)!.add(wrapper)
              },
              invoke: async (channel: string, ...args: any[]) => {
                if (channel === "get-version" || channel === "app:get-version") return "1.0.0"
                if (channel === "get-platform" || channel === "app:get-platform") return "win32"
                if (channel === "dialog:openFile" || channel === "dialog:showOpenDialog") return { canceled: false, filePaths: [] }
                if (channel === "dialog:showSaveDialog") return { canceled: false, filePath: "output.txt" }
                if (channel === "clipboard:readText") return navigator.clipboard?.readText?.() ?? ""
                if (channel === "clipboard:writeText") {
                  if (navigator.clipboard?.writeText && args[0]) navigator.clipboard.writeText(args[0])
                  return true
                }
                return { success: true }
              },
              removeListener: (channel: string, listener: Function) => {
                ipcListeners.get(channel)?.delete(listener)
              },
              removeAllListeners: (channel: string) => {
                ipcListeners.delete(channel)
              },
            },
          }
        }
        if (!win.api) {
          win.api = {
            platform: "browser-sandbox",
            isSandbox: true,
          }
        }
        if (!win.process) {
          win.process = {
            platform: "win32",
            versions: { electron: "37.0.0", chrome: "130.0.0", node: "22.0.0" },
            env: { NODE_ENV: "development" },
          }
        }
        if (!win.ventd) {
          win.ventd = {
            getState: async () => ({ connection: "idle", config: {} }),
            onState: () => () => {},
            onDevices: () => () => {},
            onStats: () => () => {},
            onLog: () => () => {},
            onInput: () => () => {},
            startScan: async () => {},
            stopScan: async () => {},
            connect: async () => {},
            disconnect: async () => {},
            updateConfig: async () => {},
            log: () => {},
          }
        }
        if (!win.khaos) {
          type KhaosTab = {
            id: number
            title: string
            url: string
            favicon: string
            loading: boolean
            canGoBack: boolean
            canGoForward: boolean
            audible: boolean
            muted: boolean
            isApp: boolean
            history: string[]
            historyIndex: number
          }
          const initialUrl = "https://www.google.com"
          const mockTabs: KhaosTab[] = [
            {
              id: 1,
              title: "Nueva pestaña",
              url: initialUrl,
              favicon: "",
              loading: false,
              canGoBack: false,
              canGoForward: false,
              audible: false,
              muted: false,
              isApp: false,
              history: [initialUrl],
              historyIndex: 0,
            },
          ]
          const mockState = {
            tabs: mockTabs,
            activeTabId: 1,
            blocker: { sessionBlocked: 14, listDomains: 42500, enabled: true },
            totalCpu: 8,
            totalMemory: 24,
            privateWindow: false,
          }
          const mockSettings = {
            themeAccent: "purple",
            themeMode: "dark",
            searchEngine: "google",
            adBlockerEnabled: true,
            smartHomeSync: false,
            ramLimitMb: 4096,
            cpuLimitPercent: 50,
          }
          const bookmarks = [
            { id: 1, title: "Google", url: "https://www.google.com", createdAt: Date.now() - 3600000 },
            { id: 2, title: "GitHub", url: "https://github.com", createdAt: Date.now() - 7200000 },
          ]
          const historyList = [
            { id: 1, title: "Google", url: "https://www.google.com", visitedAt: Date.now() - 1000 },
          ]
          const stateListeners = new Set<(s: typeof mockState) => void>()
          const notifyListeners = () => {
            stateListeners.forEach((fn) => {
              try { fn({ ...mockState, tabs: [...mockState.tabs] }) } catch {}
            })
          }

          const getActiveTab = () => mockState.tabs.find((t) => t.id === mockState.activeTabId) || mockState.tabs[0]

          win.khaos = {
            onState: (cb: (s: typeof mockState) => void) => {
              stateListeners.add(cb)
              setTimeout(() => {
                try { cb({ ...mockState, tabs: [...mockState.tabs] }) } catch {}
              }, 10)
              return () => stateListeners.delete(cb)
            },
            getSettings: async () => mockSettings,
            setSettings: async (patch: Partial<typeof mockSettings>) => {
              Object.assign(mockSettings, patch)
              return mockSettings
            },
            newTab: async (opts?: { url?: string; background?: boolean }) => {
              const id = Date.now()
              const url = opts?.url || "https://www.google.com"
              const title = url.replace(/^https?:\/\//, "").split("/")[0] || "Nueva pestaña"
              const tab: KhaosTab = {
                id,
                title,
                url,
                favicon: "",
                loading: false,
                canGoBack: false,
                canGoForward: false,
                audible: false,
                muted: false,
                isApp: false,
                history: [url],
                historyIndex: 0,
              }
              mockState.tabs.push(tab)
              if (!opts?.background) mockState.activeTabId = id
              historyList.unshift({ id: Date.now(), title, url, visitedAt: Date.now() })
              notifyListeners()
              return id
            },
            closeTab: async (id: number) => {
              mockState.tabs = mockState.tabs.filter((t) => t.id !== id)
              if (mockState.tabs.length === 0) {
                const newId = Date.now()
                mockState.tabs.push({
                  id: newId,
                  title: "Nueva pestaña",
                  url: "about:blank",
                  favicon: "",
                  loading: false,
                  canGoBack: false,
                  canGoForward: false,
                  audible: false,
                  muted: false,
                  isApp: false,
                  history: ["about:blank"],
                  historyIndex: 0,
                })
                mockState.activeTabId = newId
              } else if (mockState.activeTabId === id) {
                mockState.activeTabId = mockState.tabs[mockState.tabs.length - 1].id
              }
              notifyListeners()
            },
            activateTab: async (id: number) => {
              mockState.activeTabId = id
              notifyListeners()
            },
            navigate: async (id: number, input: string) => {
              const tab = mockState.tabs.find((t) => t.id === id)
              if (!tab) return
              let targetUrl = input.trim()
              if (!targetUrl.startsWith("http://") && !targetUrl.startsWith("https://") && !targetUrl.startsWith("about:")) {
                if (targetUrl.includes(".") && !targetUrl.includes(" ")) {
                  targetUrl = "https://" + targetUrl
                } else {
                  targetUrl = `https://www.google.com/search?q=${encodeURIComponent(targetUrl)}`
                }
              }
              tab.history = tab.history.slice(0, tab.historyIndex + 1)
              tab.history.push(targetUrl)
              tab.historyIndex = tab.history.length - 1
              tab.url = targetUrl
              tab.title = targetUrl.replace(/^https?:\/\//, "").split("/")[0] || targetUrl
              tab.canGoBack = tab.historyIndex > 0
              tab.canGoForward = false
              tab.loading = true
              historyList.unshift({ id: Date.now(), title: tab.title, url: targetUrl, visitedAt: Date.now() })
              notifyListeners()
              setTimeout(() => {
                tab.loading = false
                notifyListeners()
              }, 400)
            },
            goBack: async () => {
              const tab = getActiveTab()
              if (tab && tab.historyIndex > 0) {
                tab.historyIndex--
                tab.url = tab.history[tab.historyIndex]
                tab.title = tab.url.replace(/^https?:\/\//, "").split("/")[0] || tab.url
                tab.canGoBack = tab.historyIndex > 0
                tab.canGoForward = tab.historyIndex < tab.history.length - 1
                notifyListeners()
              }
            },
            goForward: async () => {
              const tab = getActiveTab()
              if (tab && tab.historyIndex < tab.history.length - 1) {
                tab.historyIndex++
                tab.url = tab.history[tab.historyIndex]
                tab.title = tab.url.replace(/^https?:\/\//, "").split("/")[0] || tab.url
                tab.canGoBack = tab.historyIndex > 0
                tab.canGoForward = tab.historyIndex < tab.history.length - 1
                notifyListeners()
              }
            },
            reload: async () => {
              const tab = getActiveTab()
              if (tab) {
                tab.loading = true
                notifyListeners()
                setTimeout(() => {
                  tab.loading = false
                  notifyListeners()
                }, 350)
              }
            },
            stop: async () => {
              const tab = getActiveTab()
              if (tab) {
                tab.loading = false
                notifyListeners()
              }
            },
            discardTab: async () => {},
            killTab: async () => {},
            minimize: () => {},
            toggleMaximize: () => {},
            closeWindow: () => {},
            listHistory: async () => historyList,
            clearHistory: async () => {
              historyList.length = 0
              return true
            },
            listBookmarks: async () => bookmarks,
            toggleBookmark: async (tabIdOrUrl?: any) => {
              const url = typeof tabIdOrUrl === "string" ? tabIdOrUrl : getActiveTab()?.url || ""
              const existingIndex = bookmarks.findIndex((b) => b.url === url)
              if (existingIndex >= 0) {
                bookmarks.splice(existingIndex, 1)
                return false
              } else {
                const title = getActiveTab()?.title || url
                bookmarks.push({ id: Date.now(), title, url, createdAt: Date.now() })
                return true
              }
            },
            runCleaner: async () => ({ freedMb: 142 }),
            smartHomeStatus: async () => ({ connected: true, devices: [{ id: "dev-1", name: "Estudio Inteligente", state: "on" }] }),
            smartHomeTest: async () => true,
            setChromeHeight: () => {},
          }
        }

        // White Screen Detector: 0 elements painted after 4 seconds of load
        whiteScreenTimer = window.setTimeout(() => {
          whiteScreenTimer = undefined
          if (!previewMounted || !iframeUrl()) return
          try {
            const doc = iframe?.contentDocument
            if (!doc) return
            const body = doc.body
            if (!body) {
              setPreviewIssue({
                type: "whitescreen",
                message: "Pantalla en blanco detectada: el documento no contiene cuerpo (<body>) renderizado.",
                url: iframeUrl(),
              })
              return
            }
            const elements = body.querySelectorAll(
              "*:not(script):not(style):not(noscript):not(meta):not(link):not(#__tiancode_inspector_overlay):not(#__tiancode_inspector_badge)",
            )
            const visible = Array.from(elements).filter((el) => {
              const rect = el.getBoundingClientRect()
              return rect.width > 0 && rect.height > 0
            })
            const hasText = Boolean(body.innerText && body.innerText.trim().length > 0)
            if (visible.length === 0 && !hasText) {
              setPreviewIssue({
                type: "whitescreen",
                message: "Pantalla en blanco detectada: 0 elementos renderizados en la vista previa tras 4 segundos de carga.",
                url: iframeUrl(),
              })
            }
          } catch {
            // Cross-origin iframe
          }
        }, 4000)

        if (inspectActive()) {
          attachInspector()
        }
      }
    } catch {
      // Cross-origin iframe
    }
    setIframeLoading(false)
    updateIframeState(target, false)
    retryAttempts = 0
    failedUrl = undefined
    clearRetry()
    setFail(null)
    nudgePreviewIframeGeometry(iframe)
  }

  const nudgePreviewIframeGeometry = (element?: HTMLIFrameElement | null) => {
    if (!element) return
    const prevWidth = element.style.width
    element.style.width = "calc(100% - 0.5px)"
    const timer = window.setTimeout(() => {
      if (element) element.style.width = prevWidth || "100%"
    }, 120)
    return () => window.clearTimeout(timer)
  }

  const askAiToFix = (errorDetails?: string) => {
    const errorText = errorDetails || fail()?.description || devServer()?.errorMessage || "Error en la vista previa"
    const currentUrl = iframeUrl() || fail()?.url || devServer()?.url || ""
    const prompt = [
      "Por favor soluciona el siguiente error que ocurre en la vista previa de la aplicación:",
      currentUrl ? `Destino/Archivo: ${currentUrl}` : "",
      "```",
      errorText,
      "```",
      "Analiza el código del proyecto, localiza la causa del fallo y corrige los archivos para que la vista previa funcione correctamente.",
    ]
      .filter(Boolean)
      .join("\n\n")

    window.dispatchEvent(
      new CustomEvent("tiancode:insert-prompt", {
        detail: { text: prompt, submit: true },
      }),
    )
  }

  const failIframeLoad = () => {
    const target = iframeUrl()
    if (!target) return
    clearWhiteScreenTimer()
    setIframeLoading(false)
    updateIframeState(target, false)
    failedUrl = target
    setFail({ code: 0, description: language.t("livePreview.serverError"), url: target })
    scheduleRetry(target)
  }

  const zoomStep = (delta: number) => {
    const next = clamp(zoom() + delta, ZOOM_MIN, ZOOM_MAX)
    setZoom(next)
    if (iframeUrl()) return
    void preview()?.setZoom(next)
  }

  const retryPreview = () => {
    setFail(null)
    if (devServer()?.status === "error" || devServer()?.status === "stopped") {
      void devServerAction(devServer()?.status === "stopped" ? "start" : "restart")
    }
    reloadPreview()
  }

  // Dev server gestionado por el agente (DevServerManager): estado, logs y
  // acciones se leen del HttpApi /preview del servidor del agente.
  const devServerDirectory = () => {
    const propDir = props.directory?.()
    if (propDir && propDir !== "main") return propDir
    const dir = sdk().directory
    return dir && dir !== "main" ? dir : undefined
  }
  const devServerHeaders = () => {
    const http = server.current?.http
    const password = http?.password
    return password
      ? { Authorization: `Basic ${authTokenFromCredentials({ username: http.username ?? "tiancode", password })}` }
      : undefined
  }
  const [desktopLogs, setDesktopLogs] = createSignal<string[]>([])
  const fetchDevServerLogs = async () => {
    const dir = devServerDirectory()
    const headers = devServerHeaders()
    const url = server.current?.http.url
    if (!dir || !url) return
    try {
      const res = await fetch(previewLogsUrl(url, dir), { headers })
      if (res.ok) setDesktopLogs((await res.json()) as string[])
    } catch {
      // ignore
    }
  }
  const fetchDevServer = async () => {
    const dir = devServerDirectory()
    const headers = devServerHeaders()
    const url = server.current?.http.url
    if (!dir || !url) return
    try {
      const res = await fetch(previewStatusUrl(url, dir), { headers })
      if (res.ok) {
        const data = (await res.json()) as DevServerState
        setDevServer(data)
        const reaction = reactToBuild({ build: data.build, lastSequence: lastBuildSequence })
        lastBuildSequence = reaction.sequence
        if (reaction.reload) reloadIframe()
        if (data.isDesktop || data.status === "starting" || data.status === "ready" || data.build?.running) {
          void fetchDevServerLogs()
        }
      }
    } catch {
      // Servidor del agente no disponible: se conserva el último estado.
    }
  }
  const devServerAction = async (action: PreviewAction) => {
    const dir = devServerDirectory()
    const headers = devServerHeaders()
    const url = server.current?.http.url
    if (!dir || !url) return
    try {
      const res = await fetch(previewActionUrl(url, action, dir), {
        method: "POST",
        headers: { ...headers, "content-type": "application/json" },
        body: "{}",
      })
      if (res.ok) {
        const data = (await res.json()) as DevServerState
        setDevServer(data)
        void fetchDevServerLogs()
      }
    } catch {
      // Sin servidor del agente: la UI queda como está.
    }
  }

  onMount(() => {
    const handleToggleInspector = () => setInspectActive((prev) => !prev)
    window.addEventListener("tiancode:toggle-inspector", handleToggleInspector)

    const handleWindowKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.altKey && (e.key === "i" || e.key === "I" || e.code === "KeyI")) {
        e.preventDefault()
        setInspectActive((prev) => !prev)
      }
    }
    window.addEventListener("keydown", handleWindowKeyDown)

    onCleanup(() => {
      clearWhiteScreenTimer()
      detachInspector()
      window.removeEventListener("tiancode:toggle-inspector", handleToggleInspector)
      window.removeEventListener("keydown", handleWindowKeyDown)
    })

    const view = preview()
    const surface = container
    // Fetching the managed runtime must not depend on Electron's optional
    // WebContentsView. Local loopback previews use an iframe and can mount
    // before the native ref is available.
    void fetchDevServer()
    const devTimer = window.setInterval(fetchDevServer, 2000)
    const observer = surface ? new ResizeObserver(queueBounds) : undefined
    if (surface) {
      measureViewport()
      observer?.observe(surface)
    }
    let reloadDebounceTimer: number | undefined
    const handleReload = (event?: Event) => {
      const customEvent = event as CustomEvent<{ path?: string }> | undefined
      const path = customEvent?.detail?.path
      if (reloadDebounceTimer !== undefined) window.clearTimeout(reloadDebounceTimer)
      reloadDebounceTimer = window.setTimeout(() => {
        reloadDebounceTimer = undefined
        if (iframeUrl()) {
          reloadIframe()
          if (iframe?.contentWindow) {
            try {
              iframe.contentWindow.postMessage({ type: "tiancode:file-change", path, timestamp: Date.now() }, "*")
            } catch {
              // ignore
            }
          }
        }
        if (preview()) {
          void preview()?.reload()
        }
      }, 50)
    }
    window.addEventListener("tiancode:preview-reload", handleReload)

    if (!view || !surface) {
      onCleanup(() => {
        if (reloadDebounceTimer !== undefined) window.clearTimeout(reloadDebounceTimer)
        window.clearInterval(devTimer)
        observer?.disconnect()
        window.removeEventListener("resize", queueBounds)
        window.removeEventListener("fullscreenchange", queueBounds)
        window.removeEventListener("tiancode:preview-reload", handleReload)
        clearRetry()
      })
      return
    }
    // The native surface is shared outside the renderer. A prior tab can have
    // left it visible, so hide it before this panel decides which transport it
    // needs; otherwise it can cover a local iframe for one or more frames.
    void view.setBounds(HIDDEN_PREVIEW_BOUNDS)
    void view.setVisible(false)
    queueBounds()
    void view.getState().then((snapshot) => {
      if (!previewMounted || iframeUrl()) return
      // A stale welcome data URL belongs to the old empty-state transport. The
      // DOM placeholder is responsive and lets the managed runtime win.
      if (isWelcomePreviewUrl(snapshot?.url)) {
        setState(null)
        setUrlInput("")
        return
      }
      if (snapshot) setState(snapshot)
      if (isBlankPreviewUrl(snapshot?.url)) {
        // Siempre se carga una página conocida antes de revelar la superficie;
        // si ya llegó un destino del agente, ese destino gana a la bienvenida.
        return
      }
      if (!snapshot?.loading) {
        previewContentReady = true
        revealPreview()
      }
    })
    const unsubscribe = view.onEvent((event) => {
      // The native view can still report a delayed event after a local target
      // switches to the iframe. Never let that stale event overwrite iframe UI.
      if (iframeUrl()) return
      if (event.type === "state") {
        if (isWelcomePreviewUrl(event.state.url)) {
          setState(null)
          setUrlInput("")
          return
        }
        setState(event.state)
        if (event.state.url) setUrlInput(event.state.url)
        if (event.state.loading) setFail(null)
        return
      }
      if (event.type === "loaded") {
        // Electron crea el WebContentsView en about:blank. No es contenido del
        // preview y revelarlo deja el rectángulo negro que el panel debe evitar.
        if (isBlankPreviewUrl(event.url) || isWelcomePreviewUrl(event.url)) return
        previewContentReady = true
        revealPreview()
        if (samePreviewUrl(requestedUrl, event.url)) {
          retryAttempts = 0
          failedUrl = undefined
          clearRetry()
        }
        setFail(null)
        return
      }
      if (event.type === "fail") {
        if (!event.fail.isMainFrame || event.fail.code === -3) return
        // Una URL fallida nunca se deja como un rectángulo negro. La UI
        // conserva el diagnóstico y el retry vuelve a revelar la página sólo
        // tras un `loaded` real.
        previewContentReady = false
        previewVisible = false
        setPreviewSurfaceVisible(false)
        void view.setVisible(false)
        setFail({ code: event.fail.code, description: event.fail.description, url: event.fail.url })
        if (isRetryablePreviewLoadFailure(event.fail)) {
          failedUrl = event.fail.url
          scheduleRetry(event.fail.url)
        }
        return
      }
    })
    onCleanup(() => {
      if (reloadDebounceTimer !== undefined) window.clearTimeout(reloadDebounceTimer)
      window.removeEventListener("tiancode:preview-reload", handleReload)
      window.clearInterval(devTimer)
      observer?.disconnect()
      window.removeEventListener("resize", queueBounds)
      window.removeEventListener("fullscreenchange", queueBounds)
      previewMounted = false
      unsubscribe()
      clearRetry()
      previewVisible = false
      setPreviewSurfaceVisible(false)
      setNativePreviewActive(false)
      setIframeUrl(undefined)
      setIframeLoading(false)
      iframe = undefined
      boundsReady = false
      previewContentReady = false
      lastBounds = undefined
      if (boundsFrame !== undefined) window.cancelAnimationFrame(boundsFrame)
      // Panel cerrado o pestaña distinta: la vista se oculta (no se destruye,
      // conserva su sesión y URL hasta que la ventana cierre).
      void view.setBounds(HIDDEN_PREVIEW_BOUNDS)
      void view.setVisible(false)
    })
  })

  // URL del agente / dev server detectado / tool-call del chat: navega y
  // reanuda la auto-navegación.
  createEffect(() => {
    const target = props.targetUrl?.()
    if (!target || target === lastTargetUrl) return
    lastTargetUrl = target
    navigateTo(target)
  })

  // Inicia el preview gestionado cuando el agente crea una entrada web ejecutable o se detecta un proyecto.
  let hasAutoStarted = false
  let lastObservedDir: string | undefined
  createEffect(() => {
    const dir = devServerDirectory()
    if (!dir) return
    if (dir !== lastObservedDir) {
      lastObservedDir = dir
      hasAutoStarted = false
      lastAutoStartKey = undefined
      failedUrl = undefined
      clearRetry()
      void fetchDevServer()
    }
  })
  createEffect(() => {
    const status = devServer()?.status
    const command = devServer()?.command
    const key = props.autoStartKey?.()
    if (status === "idle" && command && !hasAutoStarted) {
      hasAutoStarted = true
      void devServerAction("start")
      return
    }
    if (key && key !== lastAutoStartKey && status !== "starting" && status !== "ready") {
      lastAutoStartKey = key
      void devServerAction("start")
    }
  })

  // Un servidor listo se publica como destino canónico y reemplaza la
  // bienvenida o un primer intento fallido. Así el runtime gestionado gana al
  // /preview/ estático del dashboard sin sobrescribir una navegación manual.
  createEffect(() => {
    const managed = devServer()
    const serverUrl = managed?.status === "ready" ? managed.url : undefined
    if (!serverUrl) {
      if (managed?.status === "error" || managed?.status === "stopped") props.onManagedTarget?.(undefined)
      return
    }
    props.onManagedTarget?.(serverUrl)
    const current = state()?.url
    if (!current || current.startsWith("data:")) navigateTo(serverUrl)
    if (samePreviewUrl(failedUrl, serverUrl)) navigateTo(serverUrl)
  })

  // Errores de compilación del dev server → banner en el panel.
  createEffect(() => {
    const dev = devServer()
    if (dev?.status !== "error") return
    const error = dev.errors[0]
    const description = error?.message ?? dev.errorMessage
    if (!description || fail()) return
    setFail({ code: 0, description, url: error?.file ?? dev.command ?? "" })
  })

  // Cambio de dispositivo (preset/custom/fit): re-posiciona la vista.
  createEffect(() => {
    void deviceSize()
    void rotated()
    void zoom()
    queueBounds()
  })

  const url = () => state()?.url ?? ""
  const previewPlaceholder = () => {
    const failure = fail()
    if (failure) return failure.description
    if (devServer()?.status === "starting" || state()?.loading) return language.t("livePreview.starting")
    return language.t("liveView.appEmpty")
  }

  const navigateFromInput = () => {
    const raw = urlInput().trim()
    if (!raw) return
    const isWindowsPath = /^[a-zA-Z]:[/\\]/.test(raw)
    const isPosixPath = raw.startsWith("/") || raw.startsWith("~") || raw.startsWith("./") || raw.startsWith("../")
    const isLocalPath =
      !raw.startsWith("http://") &&
      !raw.startsWith("https://") &&
      !raw.startsWith("localhost") &&
      !raw.startsWith("127.0.0.1") &&
      (isWindowsPath || isPosixPath || raw.includes("/") || raw.includes("\\"))
    if (isLocalPath && props.onDirectoryChange) {
      props.onDirectoryChange(raw)
      void devServerAction("restart")
      return
    }
    const target = normalizeUrl(raw)
    if (!target) return
    navigateTo(target)
  }

  const goBack = () => {
    if (iframeUrl()) {
      if (iframeHistoryIndex < 1) return
      iframeHistoryIndex -= 1
      navigateTo(iframeHistory[iframeHistoryIndex], "traverse")
      return
    }
    void preview()?.back()
  }

  const goForward = () => {
    if (iframeUrl()) {
      if (iframeHistoryIndex >= iframeHistory.length - 1) return
      iframeHistoryIndex += 1
      navigateTo(iframeHistory[iframeHistoryIndex], "traverse")
      return
    }
    void preview()?.forward()
  }

  const reloadPreview = () => {
    if (iframeUrl()) {
      reloadIframe()
      return
    }
    void preview()?.reload()
  }

  const previewFrameStyle = () => {
    const device = deviceSize()
    const viewport = previewViewport()
    if (!device) return { width: "100%", height: "100%" }
    return {
      width: `${viewport.width}px`,
      height: `${viewport.height}px`,
    }
  }

  const iframeStyle = () => {
    const device = deviceSize()
    const viewport = previewViewport()
    if (!device) {
      return {
        width: "100%",
        height: "100%",
        top: "0px",
        left: "0px",
        right: "0px",
        bottom: "0px",
        position: "absolute" as const,
      }
    }
    return {
      width: `${device.width}px`,
      height: `${device.height}px`,
      left: `${viewport.frame}px`,
      top: `${viewport.frame}px`,
      transform: `scale(${viewport.scale})`,
      "transform-origin": "top left",
      position: "absolute" as const,
    }
  }

  const deviceOptions = () => [
    { id: "fit" as const, label: "Ajustar al entorno (Fluido)" },
    { id: "desktop" as const, label: "Escritorio FHD 1920×1080" },
    { id: "desktopCompact" as const, label: "Escritorio 1440×900" },
    { id: "macbook" as const, label: "MacBook Pro 1512×982" },
    { id: "laptop" as const, label: "Portátil 1366×768" },
    { id: "tablet" as const, label: "iPad Air/Pro 820×1180" },
    { id: "tabletCompact" as const, label: "iPad Mini 768×1024" },
    { id: "androidTablet" as const, label: "Android Tablet 800×1280" },
    { id: "mobile" as const, label: "iPhone 16 / 15 Pro 393×852" },
    { id: "mobileMax" as const, label: "iPhone 16 / 15 Pro Max 430×932" },
    { id: "androidPhone" as const, label: "Android Galaxy S24 412×915" },
    { id: "mobileCompact" as const, label: "Móvil Compacto 375×667" },
    { id: "tv" as const, label: "Monitor 2K/TV 2560×1440" },
    { id: "custom" as const, label: language.t("livePreview.device.custom") || "Personalizado" },
  ]

  const setCustomDimension = (axis: "width" | "height", value: string) => {
    const parsed = Number.parseInt(value, 10)
    setCustomSize((size) => ({ ...size, [axis]: Number.isFinite(parsed) ? clamp(parsed, CUSTOM_MIN, CUSTOM_MAX) : size[axis] }))
  }

  const statusTone = () => {
    const dev = devServer()
    if (dev) {
      if (dev.status === "ready") return "bg-[var(--v2-state-fg-success)]"
      if (dev.status === "starting") return "bg-[var(--v2-state-fg-warning)]"
      if (dev.status === "error") return "bg-[var(--v2-state-fg-danger)]"
      return "bg-[var(--v2-state-fg-info)]"
    }
    if (fail()) return "bg-[var(--v2-state-fg-danger)]"
    if (state()?.loading) return "bg-[var(--v2-state-fg-warning)]"
    return "bg-[var(--v2-state-fg-success)]"
  }

  const devServerStatusLabel = () => {
    const dev = devServer()
    if (!dev) return undefined
    if (dev.status === "starting") return language.t("livePreview.starting")
    if (dev.status === "ready") return language.t("livePreview.ready")
    if (dev.status === "stopped") return language.t("livePreview.stopped")
    if (dev.status === "error") return language.t("livePreview.serverError")
    return language.t("livePreview.idle")
  }

  const devServerRunning = () => devServer()?.status === "ready" || devServer()?.status === "starting"

  // "Building" covers both cold start and every incremental rebuild, which is what makes the
  // panel feel live while the agent writes code.
  const isBuilding = () => devServer()?.build?.running === true || devServer()?.status === "starting"

  /** Short workspace-relative name of the file that kicked off the running build. */
  const buildTrigger = () => shortenBuildTrigger(devServer()?.build?.trigger)

  const buildLabel = () => {
    if (devServer()?.status === "starting") return language.t("livePreview.starting")
    const trigger = buildTrigger()
    return trigger
      ? language.t("livePreview.buildingFile", { file: trigger })
      : language.t("livePreview.building")
  }

  return (
    <div class="flex size-full min-h-0 flex-col" role="region" aria-label={language.t("liveView.tab.app")}>
      {/* Fila 1: navegación (igual que el webview anterior). */}
      <div class="flex min-w-0 shrink-0 items-center gap-1 border-b border-v2-border-border-muted px-1.5 py-1">
        <IconButtonV2
          type="button"
          variant="ghost-muted"
          size="small"
          disabled={!state()?.canGoBack}
          onClick={goBack}
          aria-label={language.t("preview.back")}
          title={language.t("preview.back")}
          icon={<IconV2 name="arrow-left" />}
        />
        <IconButtonV2
          type="button"
          variant="ghost-muted"
          size="small"
          disabled={!state()?.canGoForward}
          onClick={goForward}
          aria-label={language.t("preview.forward")}
          title={language.t("preview.forward")}
          icon={<IconV2 name="arrow-right" />}
        />
        <IconButtonV2
          type="button"
          variant="ghost-muted"
          size="small"
          onClick={reloadPreview}
          aria-label={language.t("liveView.refresh")}
          title={language.t("liveView.refresh")}
          icon={<IconV2 name="reset" />}
        />
        <input
          class="h-7 min-w-0 flex-1 rounded-md border border-v2-border-border-muted bg-v2-background-bg-base px-2 text-12-regular text-text-base outline-none focus:border-v2-border-border-strong"
          value={urlInput()}
          onInput={(event) => setUrlInput(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") navigateFromInput()
          }}
          placeholder={language.t("liveView.url")}
          spellcheck={false}
          aria-label={language.t("liveView.url")}
        />
      </div>

      {/* Fila 2: estado, tamaño de dispositivo y escala. */}
      <div class="flex min-w-0 shrink-0 flex-wrap items-center gap-1 border-b border-v2-border-border-muted px-1.5 py-1">
        <span
          class={`size-1.5 shrink-0 rounded-full ${statusTone()}`}
          title={devServerStatusLabel() ?? (url() || undefined)}
          aria-hidden="true"
        />
        <Show
          when={isBuilding()}
          fallback={
            <span class="max-w-28 shrink truncate text-11-regular text-text-weak">
              {devServerStatusLabel() ?? language.t("livePreview.fit")}
            </span>
          }
        >
          <span
            class="flex min-w-0 shrink items-center gap-1.5 rounded-md bg-[var(--v2-state-fg-warning)]/10 px-1.5 py-0.5 text-11-regular text-[var(--v2-state-fg-warning)]"
            role="status"
            aria-live="polite"
            title={buildLabel()}
          >
            <Spinner class="size-3 shrink-0" />
            <span class="truncate">{buildLabel()}</span>
          </span>
        </Show>
        <Show when={!isBuilding() && props.activeEditFile?.()}>
          {(file) => (
            <span
              class="flex min-w-0 shrink items-center gap-1.5 rounded-md bg-[var(--v2-state-fg-info)]/10 px-1.5 py-0.5 text-11-regular text-[var(--v2-state-fg-info)]"
              role="status"
              aria-live="polite"
              title={language.t("livePreview.writingFile", { file: file() })}
            >
              <IconV2 name="edit" class="size-3 shrink-0" />
              <span class="truncate">{shortenBuildTrigger(file()) ?? file()}</span>
            </span>
          )}
        </Show>
        <Show when={!isBuilding() && !props.activeEditFile?.() && devServer()?.build?.ok === true && devServer()?.build?.durationMs}>
          {(duration) => (
            <span
              class="shrink-0 text-11-regular text-text-weak/70 tabular-nums"
              title={language.t("livePreview.builtIn", { ms: String(duration()) })}
            >
              {(duration() / 1000).toFixed(1)}s
            </span>
          )}
        </Show>
        <SelectV2
          appearance="base"
          class="w-48 max-w-full shrink"
          options={deviceOptions()}
          current={deviceOptions().find((option) => option.id === deviceId())}
          placement="bottom-end"
          gutter={4}
          value={(option) => option.id}
          label={(option) => option.label}
          onSelect={(option) => {
            if (!option) return
            setDeviceId(option.id)
            if (option.id === "fit") {
              setRotated(false)
              lastExternal = "fluid"
              props.onDeviceChange?.("fluid")
            } else if (option.id === "mobile" || option.id === "mobileMax" || option.id === "mobileCompact" || option.id === "androidPhone") {
              lastExternal = "mobile"
              props.onDeviceChange?.("mobile")
            } else if (option.id === "tablet" || option.id === "tabletCompact" || option.id === "androidTablet") {
              lastExternal = "tablet"
              props.onDeviceChange?.("tablet")
            } else {
              lastExternal = "laptop"
              props.onDeviceChange?.("laptop")
            }
          }}
        />
        <ToolButton
          pressed={rotated()}
          disabled={deviceId() === "fit"}
          title={language.t("livePreview.rotate")}
          onClick={() => setRotated(!rotated())}
        >
          ↻
        </ToolButton>

        {/* Visual Design-to-Code Canvas / Element Picker (pen.dev style) */}
        <button
          type="button"
          data-pressed={inspectActive() || undefined}
          title={`${language.t("livePreview.designToCode.title")} (Ctrl+Alt+I)`}
          onClick={() => setInspectActive(!inspectActive())}
          class={`flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium border transition-all cursor-pointer ${
            inspectActive()
              ? "bg-cyan-500/20 text-cyan-300 border-cyan-400 shadow-[0_0_8px_rgba(56,189,248,0.3)]"
              : "bg-v2-background-bg-base text-text-weak border-v2-border-border-muted hover:text-text-base hover:border-v2-border-border-strong"
          }`}
        >
          <span>{language.t("livePreview.designToCode.label")}</span>
        </button>

        <Show when={inspectActive()}>
          <span class="inline-flex items-center gap-1 rounded-full bg-cyan-500/20 px-2 py-0.5 font-mono text-[10px] font-semibold text-cyan-300 border border-cyan-400/40 animate-pulse select-none">
            <span class="size-1.5 rounded-full bg-cyan-400 shadow-[0_0_6px_#22d3ee]" />
            INSPECTOR ON
          </span>
        </Show>

        <Show when={deviceId() === "custom"}>
          <input
            type="number"
            min={CUSTOM_MIN}
            max={CUSTOM_MAX}
            value={customSize().width}
            onInput={(event) => setCustomDimension("width", event.currentTarget.value)}
            class="h-6 w-14 rounded-md border border-v2-border-border-muted bg-v2-background-bg-base px-1.5 text-11-regular text-text-base outline-none focus:border-v2-border-border-strong"
            aria-label={language.t("livePreview.custom.width")}
          />
          <span class="text-11-regular text-text-faint" aria-hidden="true">
            ×
          </span>
          <input
            type="number"
            min={CUSTOM_MIN}
            max={CUSTOM_MAX}
            value={customSize().height}
            onInput={(event) => setCustomDimension("height", event.currentTarget.value)}
            class="h-6 w-14 rounded-md border border-v2-border-border-muted bg-v2-background-bg-base px-1.5 text-11-regular text-text-base outline-none focus:border-v2-border-border-strong"
            aria-label={language.t("livePreview.custom.height")}
          />
        </Show>
        <div class="flex shrink-0 items-center">
          <ToolButton title={language.t("livePreview.zoomOut")} onClick={() => zoomStep(-ZOOM_STEP)}>
            −
          </ToolButton>
          <span class="min-w-10 text-center text-11-regular text-text-weak tabular-nums">
            {Math.round(previewViewport().scale * 100)}%
          </span>
          <ToolButton title={language.t("livePreview.zoomIn")} onClick={() => zoomStep(ZOOM_STEP)}>
            +
          </ToolButton>
        </div>
      </div>

      <Show when={inspectActive() && selectedElement()}>
        {(info) => (
          <div class="flex shrink-0 items-center justify-between gap-3 border-b border-cyan-500/30 bg-cyan-950/40 px-3 py-1.5 font-mono text-[11px] text-cyan-200">
            <div class="flex min-w-0 flex-1 flex-wrap items-center gap-2">
              <span class="rounded bg-cyan-500/25 px-1.5 py-0.5 font-bold text-cyan-300">
                &lt;{info().tag}&gt;
              </span>
              <Show when={info().id}>
                <span class="text-amber-300 font-semibold">#{info().id}</span>
              </Show>
              <Show when={info().classes}>
                <span class="max-w-[280px] truncate text-cyan-400/90" title={info().classes}>
                  .{info().classes.split(/\s+/).join(".")}
                </span>
              </Show>
              <span class="text-text-faint">|</span>
              <span class="text-text-weak" title="Dimensiones">
                📐 {info().dimensions}
              </span>
              <span class="text-text-faint">|</span>
              <span class="text-text-weak" title="Margin">
                Margin: {info().margin}
              </span>
              <span class="text-text-faint">|</span>
              <span class="text-text-weak" title="Padding">
                Padding: {info().padding}
              </span>
            </div>
            <button
              type="button"
              class="shrink-0 text-text-faint hover:text-text-base cursor-pointer"
              onClick={() => setSelectedElement(null)}
              aria-label={language.t("common.close")}
            >
              <IconV2 name="xmark-small" size="small" />
            </button>
          </div>
        )}
      </Show>

      <Show when={previewIssue()}>
        {(issue) => (
          <div class="flex shrink-0 items-center justify-between gap-2 border-b border-rose-500/30 bg-rose-500/10 px-3 py-1.5 text-11-regular text-rose-300">
            <div class="flex min-w-0 flex-1 items-center gap-2">
              <span class="shrink-0 text-sm">
                {issue().type === "whitescreen" ? "⚪" : "⚠️"}
              </span>
              <span class="min-w-0 flex-1 truncate font-medium" title={issue().message}>
                {issue().type === "whitescreen"
                  ? "Pantalla en blanco detectada (0 elementos pintados tras 4s)"
                  : `Error en la vista previa: ${issue().message}`}
              </span>
            </div>
            <div class="flex shrink-0 items-center gap-2">
              <button
                type="button"
                class="flex shrink-0 items-center gap-1 rounded bg-amber-500/20 px-2.5 py-1 text-11-medium text-amber-300 hover:bg-amber-500/30 border border-amber-500/30 transition-colors cursor-pointer shadow-sm"
                onClick={() => askAiToFix(issue().message)}
              >
                <span>✨</span>
                <span>Reparar con Tiancode</span>
              </button>
              <button
                type="button"
                class="shrink-0 text-11-medium text-text-weak hover:text-text-base cursor-pointer px-1 py-0.5"
                onClick={() => reloadPreview()}
              >
                {language.t("livePreview.retry")}
              </button>
              <button
                type="button"
                class="shrink-0 text-text-faint hover:text-text-base cursor-pointer"
                onClick={() => setPreviewIssue(null)}
                aria-label={language.t("common.close")}
              >
                <IconV2 name="xmark-small" size="small" />
              </button>
            </div>
          </div>
        )}
      </Show>

      <Show when={fail()}>
        {(failed) => (
          <div class="flex shrink-0 items-center gap-2 border-b border-v2-border-border-muted px-3 py-1.5 text-11-regular text-[var(--v2-state-fg-danger)]">
            <span class="min-w-0 flex-1 truncate" title={failed().description}>
              {language.t("livePreview.loadFailed", { url: failed().url, description: failed().description })}
            </span>
            <button
              type="button"
              class="flex shrink-0 items-center gap-1 rounded bg-amber-500/15 px-2 py-0.5 text-11-medium text-amber-300 hover:bg-amber-500/25 transition-colors cursor-pointer"
              onClick={() => askAiToFix(failed().description)}
            >
              <span>✨</span>
              <span>{language.t("livePreview.fixWithAi") || "Reparar con IA"}</span>
            </button>
            <button
              type="button"
              class="shrink-0 text-11-medium text-[var(--v2-state-fg-info)] hover:text-text-base cursor-pointer"
              onClick={retryPreview}
            >
              {language.t("livePreview.retry")}
            </button>
            <button
              type="button"
              class="shrink-0 text-text-faint hover:text-text-base cursor-pointer"
              onClick={() => setFail(null)}
              aria-label={language.t("common.close")}
            >
              <IconV2 name="xmark-small" size="small" />
            </button>
          </div>
        )}
      </Show>

      {/* Contenedor real del preview: sus bounds (getBoundingClientRect) son
          los del WebContentsView. El placeholder sólo aparece al ocultarlo. */}
      <div class="relative min-h-0 flex-1 overflow-hidden bg-v2-background-bg-base" ref={container}>
        <Show when={iframeUrl()} keyed>
          {(target) => (
            <div class={`absolute inset-0 flex items-center justify-center overflow-hidden ${deviceSize() ? "p-3" : "p-0"}`}>
              <div
                class={`relative shrink-0 overflow-hidden bg-white ${
                  deviceSize()
                    ? "border border-black/70 shadow-[0_12px_40px_rgba(0,0,0,0.35)]"
                    : "size-full"
                } ${
                  deviceId() === "mobile" || deviceId() === "mobileMax" || deviceId() === "mobileCompact" || deviceId() === "androidPhone"
                    ? "rounded-[1.8rem] ring-4 ring-neutral-800"
                    : deviceId() === "tablet" || deviceId() === "tabletCompact" || deviceId() === "androidTablet"
                      ? "rounded-2xl ring-4 ring-neutral-800"
                      : deviceId() === "tv"
                        ? "rounded-md border-4 border-neutral-900 shadow-2xl"
                        : deviceSize()
                          ? "rounded-lg"
                          : "rounded-none"
                }`}
                style={previewFrameStyle()}
              >
                <Show when={deviceId() === "mobile" || deviceId() === "mobileMax"}>
                  <div class="pointer-events-none absolute left-1/2 top-1.5 z-10 h-2 w-16 -translate-x-1/2 rounded-full bg-black/90 shadow-sm" aria-hidden="true" />
                </Show>
                <Show when={deviceId() === "mobileCompact"}>
                  <div class="pointer-events-none absolute left-1/2 top-1 z-10 h-1.5 w-12 -translate-x-1/2 rounded-full bg-black/80" aria-hidden="true" />
                </Show>
                <Show when={deviceId() === "androidPhone"}>
                  <div class="pointer-events-none absolute left-1/2 top-1.5 z-10 h-2.5 w-2.5 -translate-x-1/2 rounded-full bg-black ring-1 ring-neutral-700" aria-hidden="true" />
                </Show>
                <Show when={deviceId() === "tv"}>
                  <div class="pointer-events-none absolute bottom-0.5 left-1/2 z-10 h-1 w-6 -translate-x-1/2 rounded-full bg-neutral-600/60" aria-hidden="true" />
                </Show>
                <iframe
                  ref={(element) => {
                    iframe = element
                  }}
                  data-slot="live-preview-iframe"
                  src={target}
                  title={language.t("liveView.tab.app")}
                  sandbox="allow-scripts allow-same-origin allow-forms allow-modals allow-downloads allow-popups allow-popups-to-escape-sandbox allow-pointer-lock allow-top-navigation-by-user-activation allow-storage-access-by-user-activation"
                  allow="accelerometer; autoplay; camera; clipboard-read; clipboard-write; display-capture; encrypted-media; fullscreen; gamepad; geolocation; gyroscope; hid; microphone; midi; payment; picture-in-picture; screen-wake-lock; usb; web-share"
                  referrerpolicy="no-referrer-when-downgrade"
                  class="absolute inset-0 top-0 left-0 border-0 bg-white"
                  style={iframeStyle()}
                  onLoad={completeIframeLoad}
                  onError={failIframeLoad}
                />
              </div>
              <Show when={iframeLoading()}>
                <div class="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-v2-background-bg-base px-6 text-center text-12-regular text-text-weak">
                  {language.t("livePreview.starting")}
                </div>
              </Show>
            </div>
          )}
        </Show>
        <Show when={!iframeUrl() && !previewSurfaceVisible()}>
          <Show
            when={devServer()?.isDesktop}
            fallback={
              <div class="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 text-center text-12-regular text-text-weak">
                <span>{previewPlaceholder()}</span>
                <Show when={devServer()?.status === "idle" || devServer()?.status === "stopped" || devServer()?.status === "error"}>
                  <div class="flex items-center gap-2">
                    <button
                      type="button"
                      class="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 text-[12px] font-medium hover:bg-cyan-500/30 transition-all cursor-pointer shadow-sm"
                      onClick={() => void devServerAction(devServer()?.status === "stopped" ? "start" : devServer()?.status === "error" ? "restart" : "start")}
                    >
                      <span>▶</span>
                      <span>{devServer()?.status === "error" ? (language.t("livePreview.retry") || "Reintentar") : (language.t("livePreview.startServer") || "Iniciar Vista Previa")}</span>
                    </button>
                    <Show when={devServer()?.status === "error"}>
                      <button
                        type="button"
                        class="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-amber-500/20 text-amber-300 border border-amber-500/40 text-[12px] font-medium hover:bg-amber-500/30 transition-all cursor-pointer shadow-sm"
                        onClick={() => askAiToFix(devServer()?.errorMessage || devServer()?.errors?.[0]?.message || "Error al compilar o iniciar el dev server")}
                      >
                        <span>✨</span>
                        <span>{language.t("livePreview.fixWithAi") || "Reparar con IA"}</span>
                      </button>
                    </Show>
                  </div>
                </Show>
                <Show when={devServer()?.status === "starting"}>
                  <button
                    type="button"
                    class="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-rose-500/20 text-rose-300 border border-rose-500/40 text-[11px] font-medium hover:bg-rose-500/30 transition-all cursor-pointer shadow-sm"
                    onClick={() => void devServerAction("stop")}
                  >
                    <span>⏹</span>
                    <span>{language.t("livePreview.stop") || "Cancelar"}</span>
                  </button>
                </Show>
              </div>
            }
          >
            <div class="absolute inset-0 flex flex-col overflow-hidden bg-v2-background-bg-base p-4">
              <div class="flex flex-col gap-3 rounded-xl border border-v2-border-border-muted bg-v2-background-bg-surface p-4 shadow-sm">
                <div class="flex items-center justify-between gap-2">
                  <div class="flex items-center gap-2.5">
                    <span class="flex size-9 items-center justify-center rounded-lg bg-cyan-500/10 text-cyan-400 text-lg">
                      🖥️
                    </span>
                    <div>
                      <div class="flex items-center gap-2">
                        <span class="text-13-medium text-text-base">Entorno Desktop Sandbox</span>
                        <span class="rounded bg-cyan-500/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-cyan-300">
                          {devServer()?.framework || "Desktop GUI"}
                        </span>
                      </div>
                      <p class="text-11-regular text-text-weak">
                        Aplicación en ejecución contenida en segundo plano sin ventanas externas en el escritorio.
                      </p>
                    </div>
                  </div>
                  <div class="flex items-center gap-2">
                    <span
                      class={`size-2 rounded-full ${
                        devServer()?.status === "ready"
                          ? "bg-emerald-400 animate-pulse shadow-[0_0_8px_#34d399]"
                          : devServer()?.status === "starting"
                            ? "bg-amber-400 animate-ping"
                            : devServer()?.status === "error"
                              ? "bg-rose-500"
                              : "bg-neutral-500"
                      }`}
                    />
                    <span class="text-11-medium text-text-weak">
                      {devServer()?.status === "ready"
                        ? "En ejecución (Sandbox)"
                        : devServer()?.status === "starting"
                          ? "Iniciando proceso..."
                          : devServer()?.status === "error"
                            ? "Error al ejecutar"
                            : "Detenida"}
                    </span>
                  </div>
                </div>

                <div class="flex items-center gap-2 pt-1">
                  <Show
                    when={devServer()?.status === "ready"}
                    fallback={
                      <Show
                        when={devServer()?.status === "starting"}
                        fallback={
                          <button
                            type="button"
                            class="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 text-[12px] font-medium hover:bg-cyan-500/30 transition-all cursor-pointer shadow-sm"
                            onClick={() => void devServerAction(devServer()?.status === "error" ? "restart" : "start")}
                          >
                            <span>▶</span>
                            <span>{devServer()?.status === "error" ? "Reintentar Ejecución" : "Ejecutar Aplicación en Windows"}</span>
                          </button>
                        }
                      >
                        <button
                          type="button"
                          class="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-rose-500/20 text-rose-300 border border-rose-500/40 text-[11px] font-medium hover:bg-rose-500/30 transition-all cursor-pointer shadow-sm"
                          onClick={() => void devServerAction("stop")}
                        >
                          <span>⏹</span>
                          <span>Cancelar inicio</span>
                        </button>
                      </Show>
                    }
                  >
                    <button
                      type="button"
                      class="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-rose-500/20 text-rose-300 border border-rose-500/40 text-[12px] font-medium hover:bg-rose-500/30 transition-all cursor-pointer shadow-sm"
                      onClick={() => void devServerAction("stop")}
                    >
                      <span>■</span>
                      <span>Detener Aplicación</span>
                    </button>
                    <button
                      type="button"
                      class="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-neutral-800 text-neutral-300 border border-neutral-700 text-[12px] font-medium hover:bg-neutral-700 transition-all cursor-pointer shadow-sm"
                      onClick={() => void devServerAction("restart")}
                    >
                      <span>↻</span>
                      <span>Reiniciar</span>
                    </button>
                  </Show>
                  <Show when={devServer()?.command}>
                    <span class="text-11-regular font-mono text-text-faint ml-auto">
                      {devServer()?.command}
                    </span>
                  </Show>
                </div>
                <Show when={devServer()?.errorMessage}>
                  <div class="rounded-lg bg-rose-500/10 border border-rose-500/20 px-3 py-2 text-[11px] text-rose-300 flex items-center justify-between gap-2">
                    <span class="min-w-0 flex-1">{devServer()?.errorMessage}</span>
                    <button
                      type="button"
                      class="flex shrink-0 items-center gap-1 rounded bg-amber-500/20 px-2 py-0.5 text-11-medium text-amber-300 hover:bg-amber-500/30 transition-colors cursor-pointer"
                      onClick={() => askAiToFix(devServer()?.errorMessage || "")}
                    >
                      <span>✨</span>
                      <span>{language.t("livePreview.fixWithAi") || "Reparar con IA"}</span>
                    </button>
                  </div>
                </Show>
              </div>

              {/* Consola de logs en vivo */}
              <div class="mt-3 flex min-h-0 flex-1 flex-col rounded-xl border border-v2-border-border-muted bg-neutral-950 p-3 shadow-inner">
                <div class="flex items-center justify-between pb-2 border-b border-neutral-800 text-[11px] text-neutral-400">
                  <span class="font-medium">Consola de ejecución (stdout / stderr)</span>
                  <div class="flex items-center gap-2">
                    <button
                      type="button"
                      class="text-neutral-400 hover:text-white transition-colors cursor-pointer text-[10px]"
                      onClick={() => void fetchDevServerLogs()}
                    >
                      Actualizar
                    </button>
                    <button
                      type="button"
                      class="text-neutral-400 hover:text-white transition-colors cursor-pointer text-[10px]"
                      onClick={() => {
                        const text = desktopLogs().join("\n")
                        if (text) void navigator.clipboard?.writeText(text)
                      }}
                    >
                      Copiar
                    </button>
                  </div>
                </div>
                <div class="min-h-0 flex-1 overflow-y-auto pt-2 font-mono text-[11px] leading-relaxed text-neutral-300">
                  <Show
                    when={desktopLogs().length > 0}
                    fallback={<div class="text-neutral-600 italic">No hay registros de consola aún. Presiona "Ejecutar Aplicación en Windows" para ver la salida.</div>}
                  >
                    <For each={desktopLogs()}>
                      {(line) => <div class="whitespace-pre-wrap break-all">{line}</div>}
                    </For>
                  </Show>
                </div>
              </div>
            </div>
          </Show>
        </Show>
      </div>

    </div>
  )
}
