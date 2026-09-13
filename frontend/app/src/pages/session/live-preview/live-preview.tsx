import { ButtonV2 } from "@tiancode-ai/ui/v2/button-v2"
import { IconButtonV2 } from "@tiancode-ai/ui/v2/icon-button-v2"
import { Icon as IconV2 } from "@tiancode-ai/ui/v2/icon"
import { SelectV2 } from "@tiancode-ai/ui/v2/select-v2"
import { Spinner } from "@tiancode-ai/ui/spinner"
import { createEffect, createSignal, For, on, onCleanup, onMount, Show } from "solid-js"
import { createStore } from "solid-js/store"
import { Persist, persisted } from "@/utils/persist"
import { normalizeUrl } from "@/components/preview/preview-panel"
import { useLanguage } from "@/context/language"
import { usePlatform } from "@/context/platform"
import { useSDK } from "@/context/sdk"
import { ServerConnection, useServer } from "@/context/server"
import { authTokenFromCredentials } from "@/utils/server"
import type { PreviewViewState } from "@/context/platform"
import {
  previewActionUrl,
  previewAgentPendingUrl,
  previewAgentResultUrl,
  previewLogsUrl,
  previewStatusUrl,
  type PreviewAction,
} from "./live-preview-url"
import { buildPreviewAgentScript, type PreviewAgentAction } from "./preview-agent-script"
import { PREVIEW_RETRY_MAX_ATTEMPTS, isRetryablePreviewLoadFailure, previewRetryDelay, samePreviewUrl } from "./live-preview-retry"
import { iframePreviewUrl, usesIframePreview } from "./live-preview-transport"
import { orientedPreviewDimensions } from "./preview-experience"
import {
  buildErrorLocation,
  failedBuildErrors,
  previewFailureCopy,
  previewStatusLabel,
  previewStatusTone,
  reactToBuild,
  redactPreviewLogLine,
  shortenBuildTrigger,
} from "./live-preview-build"
import {
  mirrorFrameInterval,
  previewPollInterval,
  shouldArmMirror,
  shouldFetchPreviewLogs,
  shouldShowPreviewLogs,
} from "./preview-poll"
import { clampZoom, fittedPreviewViewport, nextZoomStep, type PreviewZoom } from "./preview-viewport"
import { createReloadScheduler } from "./live-preview-reload"
import "./live-preview.css"

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
  /** Root pid of the spawned desktop app; on Windows this is the shell wrapper, not the GUI. */
  pid?: number | null
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

// Acciones del agente que NO tocan la página: las ejecuta el proceso principal de Electron contra
// el escritorio (tools `screenshot` y `clipboard`). Viajan por el mismo puente que las de página
// porque el servidor es un proceso Bun sin acceso a Electron.
type DesktopBridgeAction = {
  type: "capture" | "clipboard_read" | "clipboard_write" | "computer"
  /** `capture`: screen, window o area. */
  target?: string
  /** `clipboard_write`: el texto a poner en el portapapeles. */
  value?: string
  bounds?: { x: number; y: number; width: number; height: number }
}

type BridgeAction = PreviewAgentAction | DesktopBridgeAction

function isDesktopBridgeAction(action: BridgeAction): action is DesktopBridgeAction {
  return (
    action.type === "capture" ||
    action.type === "clipboard_read" ||
    action.type === "clipboard_write" ||
    action.type === "computer"
  )
}

/**
 * Token que le dice al proceso principal que la acción va al navegador integrado en vez de a la
 * vista previa. Viaja en el parámetro `frameUrl` de `window.api.previewAgent.execute` porque ese
 * contrato del preload sólo tiene dos argumentos.
 *
 * Copia literal de BROWSER_SURFACE_TOKEN en frontend/desktop/src/main/preview-agent.ts: los dos
 * tienen que coincidir y `app` no puede importar de `desktop`.
 *
 * Ninguna acción trae hoy `surface: "browser"`: el long-poll descarta ese campo al codificar
 * (PreviewAgentActionSchema, backend/tiancode/src/server/routes/.../groups/preview.ts). Esta rama
 * queda montada para cuando el esquema lo acepte.
 */
const BROWSER_SURFACE_TOKEN = "tiancode-surface:browser"

// `window.api` sólo está declarado en parte (el build web no tiene preload), así que el portapapeles
// se estrecha aquí en vez de ensanchar un tipo global que el navegador nunca cumple.
function desktopClipboardApi() {
  return (
    window as unknown as {
      api?: { readClipboardText?: () => Promise<string>; writeClipboardText?: (text: string) => Promise<boolean> }
    }
  ).api
}

/** Igual que el portapapeles: lo publica el preload de la app de escritorio y no existe en web. */
function desktopComputerApi() {
  return (
    window as unknown as {
      api?: { computer?: { perform?: (action: DesktopBridgeAction) => Promise<{ ok: boolean; output: string }> } }
    }
  ).api?.computer
}

/** El origen de una URL de página, o undefined si no es una página web. */
function originOf(value: string | undefined) {
  if (!value) return undefined
  try {
    const url = new URL(value)
    if (url.protocol !== "http:" && url.protocol !== "https:") return undefined
    return url.origin
  } catch {
    return undefined
  }
}

/** PNG → base64 por trozos: `fromCharCode(...bytes)` desborda la pila con una captura entera. */
function toBase64(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer)
  let binary = ""
  for (let i = 0; i < bytes.length; i += 8192) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 8192))
  }
  return btoa(binary)
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

const CUSTOM_MIN = 80
const CUSTOM_MAX = 4096
const HIDDEN_PREVIEW_BOUNDS = { x: 0, y: 0, width: 0, height: 0 }
const IFRAME_SANDBOX = "allow-scripts allow-same-origin allow-forms allow-modals allow-downloads allow-popups allow-popups-to-escape-sandbox allow-pointer-lock allow-top-navigation-by-user-activation allow-storage-access-by-user-activation"
const IFRAME_ALLOW = "accelerometer; autoplay; camera; clipboard-read; clipboard-write; display-capture; encrypted-media; fullscreen; gamepad; geolocation; gyroscope; hid; microphone; midi; payment; picture-in-picture; screen-wake-lock; usb; web-share"

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
export type ExternalDeviceMode = "fluid" | "mobile" | "tablet" | "laptop"

const externalModeOf = (id: DeviceId): ExternalDeviceMode => {
  if (id === "fit") return "fluid"
  if (id === "mobile" || id === "mobileMax" || id === "mobileCompact" || id === "androidPhone") return "mobile"
  if (id === "tablet" || id === "tabletCompact" || id === "androidTablet") return "tablet"
  return "laptop"
}
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
      class="flex h-6 shrink-0 items-center gap-1 rounded-md px-1.5 text-11-regular text-v2-text-text-muted transition-colors hover:bg-v2-overlay-simple-overlay-hover hover:text-v2-text-text-base disabled:opacity-40 data-[pressed]:bg-v2-overlay-simple-overlay-pressed data-[pressed]:text-v2-text-text-base"
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
  /**
   * Quick device buttons of the Sandbox header. `seq` grows on every press so a press always
   * applies, even when the mode equals the one already highlighted.
   */
  externalDevice?: () => { mode: ExternalDeviceMode; seq: number } | undefined
  /** Reports which quick-button family the current (persisted) preset belongs to. */
  onDeviceChange?: (mode: ExternalDeviceMode) => void
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
      // `zoom` is the manual scale and only applies while `zoomMode` is "manual". Preferences
      // saved before 1.0.42 have no `zoomMode`, which reads as auto-fit.
      zoom: 1,
      zoomMode: "auto" as "auto" | "manual",
      // Window the user pinned for a desktop project, per directory. The matcher gets it wrong
      // for multi-window apps (a devtools window, a splash screen) and this is the escape hatch.
      mirrorPins: {} as Record<string, string>,
    }),
  )
  const previewZoom = (): PreviewZoom =>
    previewPrefs.zoomMode === "manual" ? { mode: "manual", scale: clampZoom(previewPrefs.zoom) } : { mode: "auto" }
  const setManualZoom = (scale: number) => {
    setPreviewPrefs("zoom", clampZoom(scale))
    setPreviewPrefs("zoomMode", "manual")
  }
  const setAutoZoom = () => setPreviewPrefs("zoomMode", "auto")
  const deviceId = () => previewPrefs.deviceId
  const setDeviceId = (id: DeviceId) => setPreviewPrefs("deviceId", id)
  const [inspectActive, setInspectActive] = createSignal(false)
  const [selectedElement, setSelectedElement] = createSignal<InspectedElementInfo | null>(null)
  const [previewIssue, setPreviewIssue] = createSignal<PreviewIssue | null>(null)

  // The Sandbox header's quick buttons arrive as {mode, seq}. Keying on `seq` makes every press
  // count: before, a remount reset the header to "fluid" while the persisted preset stayed a
  // desktop silhouette, and pressing "fluid" then did nothing because it "already" was fluid.
  let lastExternalSeq = props.externalDevice?.()?.seq
  createEffect(() => {
    const ext = props.externalDevice?.()
    if (!ext || ext.seq === lastExternalSeq) return
    lastExternalSeq = ext.seq
    if (ext.mode === "mobile") setDeviceId("mobile")
    else if (ext.mode === "tablet") setDeviceId("tablet")
    else if (ext.mode === "laptop") setDeviceId("laptop")
    else setDeviceId("fit")
    if (ext.mode === "fluid") setRotated(false)
    setAutoZoom()
  })
  // Keep the header highlight honest, including after the persisted preference hydrates.
  createEffect(() => props.onDeviceChange?.(externalModeOf(deviceId())))

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
  // Espejo de la ventana de una app de escritorio del Sandbox: es una imagen, no un embebido.
  type MirrorStatus = "idle" | "searching" | "live" | "blank" | "gone" | "nomatch"
  const [mirrorStatus, setMirrorStatus] = createSignal<MirrorStatus>("idle")
  const [mirrorFrame, setMirrorFrame] = createSignal<string>()
  const [mirrorTitle, setMirrorTitle] = createSignal<string>()
  const [mirrorSources, setMirrorSources] = createSignal<
    { id: string; name: string; icon: string | null; thumb: string }[]
  >([])
  const [mirrorPicking, setMirrorPicking] = createSignal(false)
  // Windows only. Without asking, macOS and Linux rendered a black panel that could never
  // resolve, contradicting the renderer's own "keeps its console elsewhere" promise.
  const [mirrorSupported, setMirrorSupported] = createSignal(false)
  /** Set by startWindowMirror so the picker can hand a window to the same lifecycle. */
  let mirrorAdopt: ((sourceId: string) => void) | undefined
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
  // Reloads are double-buffered: the next document loads in a hidden second iframe and is
  // swapped in only once it has loaded, so the page the agent is editing never blanks out
  // between two of its writes. `frames` holds at most two entries; `activeFrameId` is the one
  // on screen and `iframe` always points at its element.
  type PreviewFrame = { id: number; src: string; url: string }
  let frameSequence = 0
  const frameElements = new Map<number, HTMLIFrameElement>()
  const [frames, setFrames] = createSignal<PreviewFrame[]>([])
  const [activeFrameId, setActiveFrameId] = createSignal<number | undefined>(undefined)
  const [reloading, setReloading] = createSignal(false)
  const frameIdOf = (element: HTMLIFrameElement) => {
    for (const [id, candidate] of frameElements) if (candidate === element) return id
    return undefined
  }
  const discardFrame = (id: number) => {
    frameElements.delete(id)
    setFrames((current) => current.filter((frame) => frame.id !== id))
  }
  const bustCache = (target: string) => {
    try {
      const u = new URL(target)
      u.searchParams.set("_t", String(Date.now()))
      return u.toString()
    } catch {
      return target
    }
  }
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

  // Promote the hidden frame that just loaded. The old document stays mounted for two more
  // animation frames so the new one has painted before anything disappears.
  const swapFrames = (nextId: number) => {
    const previousId = activeFrameId()
    const next = frameElements.get(nextId)
    if (!next) return
    const previous = previousId !== undefined ? frameElements.get(previousId) : undefined
    let scroll: { x: number; y: number } | undefined
    try {
      const win = previous?.contentWindow
      if (win) scroll = { x: win.scrollX, y: win.scrollY }
    } catch {
      // cross-origin document: nothing to carry over
    }
    detachInspector()
    iframe = next
    setActiveFrameId(nextId)
    if (scroll && (scroll.x || scroll.y)) {
      try {
        next.contentWindow?.scrollTo(scroll.x, scroll.y)
      } catch {
        // ignore
      }
    }
    if (previousId === undefined) return
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => discardFrame(previousId))
    })
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

  createEffect(
    on(iframeUrl, (target) => {
      frameElements.clear()
      setReloading(false)
      if (!target) {
        setFrames([])
        setActiveFrameId(undefined)
        return
      }
      frameSequence += 1
      setActiveFrameId(frameSequence)
      setFrames([{ id: frameSequence, src: target, url: target }])
    }),
  )

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
        reloadScheduler.request("retry")
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

  const previewViewport = () => fittedPreviewViewport(availableViewport(), deviceSize() ?? undefined, previewZoom(), deviceFrame())

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
    const nextZoom = viewport.scale
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
    // Oculta no es descargada: la vista nativa es un navegador con sesión persistente y se
    // quedaba aparcada en la última web del usuario, invisible pero viva y al alcance del puente
    // del agente. Se descarga. Volver a un destino no-loopback pasa siempre por navigateTo, que
    // vuelve a cargar su URL, y el historial de la vista conserva el "atrás".
    void view.navigate("about:blank")
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
    setFail(null)
    updateIframeState(target, true)
    const active = activeFrameId()
    const activeElement = active !== undefined ? frameElements.get(active) : undefined
    // First document still loading (or no frame yet): bump it in place, overlay and all.
    if (!activeElement || iframeLoading()) {
      setIframeLoading(true)
      if (activeElement) {
        activeElement.src = bustCache(target)
        return
      }
      setIframeUrl(undefined)
      window.requestAnimationFrame(() => setIframeUrl(target))
      return
    }
    // Load the fresh document behind the current one; completeIframeLoad swaps them.
    setReloading(true)
    const spare = frames().find((frame) => frame.id !== active)
    if (spare) {
      const element = frameElements.get(spare.id)
      if (element) element.src = bustCache(target)
      return
    }
    frameSequence += 1
    setFrames((current) => [...current, { id: frameSequence, src: bustCache(target), url: target }])
  }

  const completeIframeLoad = (element?: HTMLIFrameElement) => {
    const target = iframeUrl()
    if (!target) return
    const loaded = element ?? iframe
    const loadedId = loaded ? frameIdOf(loaded) : undefined
    if (loadedId !== undefined && loadedId !== activeFrameId()) swapFrames(loadedId)
    else if (loaded) iframe = loaded
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
            const errorMsg =
              ev.message || (ev.error && String(ev.error.message)) || language.t("livePreview.issue.runtimeDefault")
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
            const errorMsg =
              (reasonRecord?.message as string | undefined) ||
              String(reason || language.t("livePreview.issue.unhandledRejection"))
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
                message: language.t("livePreview.issue.whiteScreen.noBody"),
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
                message: language.t("livePreview.issue.whiteScreen.empty"),
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
    setReloading(false)
    updateIframeState(target, false)
    retryAttempts = 0
    failedUrl = undefined
    clearRetry()
    setFail(null)
    nudgePreviewIframeGeometry(iframe)
    reloadScheduler.settled()
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
    const errorText =
      errorDetails || fail()?.description || devServer()?.errorMessage || language.t("livePreview.issue.runtimeDefault")
    const currentUrl = iframeUrl() || fail()?.url || devServer()?.url || ""
    // El texto aparece como mensaje del usuario en el chat, así que va en su idioma y no en el
    // de quien escribió el panel.
    const prompt = [
      language.t("livePreview.fixPrompt.intro"),
      currentUrl ? language.t("livePreview.fixPrompt.target", { url: currentUrl }) : "",
      "```",
      errorText,
      "```",
      language.t("livePreview.fixPrompt.outro"),
    ]
      .filter(Boolean)
      .join("\n\n")

    window.dispatchEvent(
      new CustomEvent("tiancode:insert-prompt", {
        detail: { text: prompt, submit: true },
      }),
    )
  }

  const failIframeLoad = (element?: HTMLIFrameElement) => {
    const target = iframeUrl()
    if (!target) return
    const failedId = element ? frameIdOf(element) : undefined
    if (failedId !== undefined && failedId !== activeFrameId()) {
      // The hidden replacement failed: keep showing the document we already have.
      discardFrame(failedId)
      setReloading(false)
      reloadScheduler.settled()
      return
    }
    clearWhiteScreenTimer()
    setIframeLoading(false)
    setReloading(false)
    updateIframeState(target, false)
    failedUrl = target
    setFail({ code: 0, description: language.t("livePreview.serverError"), url: target })
    reloadScheduler.settled()
    scheduleRetry(target)
  }

  // Every "the app changed" signal (tool parts, session diffs, the watcher, the build poll, the
  // reload button, the page itself) funnels through one scheduler: a burst becomes one reload
  // and nothing restarts a document that is still loading.
  const reloadScheduler = createReloadScheduler({
    delayMs: 250,
    run: () => {
      if (iframeUrl()) {
        reloadIframe()
        return
      }
      const native = preview()
      if (!native) {
        reloadScheduler.settled()
        return
      }
      Promise.resolve(native.reload())
        .catch(() => undefined)
        .finally(() => reloadScheduler.settled())
    },
  })

  // Steps walk the ladder from the scale on screen, so "+" from a 54 % auto-fit shows 67 %
  // instead of nudging a hidden preference that the fit then clamped away.
  const zoomStep = (direction: 1 | -1) => setManualZoom(nextZoomStep(previewViewport().scale, direction))
  const zoomActualSize = () => setManualZoom(1)

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
  // Cola de stdout/stderr del proceso gestionado. La ve tanto la consola del Sandbox como la
  // espera de un proyecto web mientras arranca, así que no es sólo "de escritorio".
  const [serverLogs, setServerLogs] = createSignal<string[]>([])
  const fetchDevServerLogs = async () => {
    const dir = devServerDirectory()
    const headers = devServerHeaders()
    const url = server.current?.http.url
    if (!dir || !url) return
    try {
      const res = await fetch(previewLogsUrl(url, dir), { headers })
      // Se enmascara al entrar, una vez por respuesta: lo que se pinta y lo que se copia al
      // portapapeles son entonces el mismo texto, sin la clave que el dev server haya impreso.
      if (res.ok) setServerLogs(((await res.json()) as string[]).map(redactPreviewLogLine))
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
        if (reaction.reload) reloadScheduler.request(data.build?.trigger ?? "build")
        if (
          shouldFetchPreviewLogs({
            status: data.status,
            building: data.build?.running === true,
            desktop: data.isDesktop === true,
          })
        ) {
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

  // El agente dentro de la app: el servidor no puede tocar el DOM de la vista previa, así que
  // encola la acción y este bucle la recoge y la ejecuta contra el frame real. Long-poll en vez
  // de sondeo: un clic del agente llega en cuanto lo pide, y mientras no pide nada no se gasta
  // ni una petición por segundo.
  // ── Espejo de la ventana de escritorio ───────────────────────────────────────
  //
  // El Sandbox podía lanzar una app de escritorio pero sólo enseñaba su stdout, así que "¿se ve
  // bien?" no tenía respuesta sin salir de Tiancode. Esto fotografía su ventana real cada medio
  // segundo. Es un espejo: no se puede pulsar ni escribir dentro, y el panel lo dice.
  const mirrorHints = () => {
    const dir = devServerDirectory()
    const name = dir ? dir.split(/[\/]/).filter(Boolean).pop() : undefined
    return [name, devServer()?.framework, devServer()?.command].filter((value): value is string => !!value)
  }

  const pinMirrorSource = (sourceId: string | undefined) => {
    const dir = devServerDirectory()
    if (!dir) return
    const next = { ...previewPrefs.mirrorPins }
    if (sourceId) next[dir] = sourceId
    else delete next[dir]
    setPreviewPrefs("mirrorPins", next)
  }

  const startWindowMirror = () => {
    const mirror = platform.windowMirror
    if (!mirror) return () => {}
    let stopped = false
    let armedFor: string | undefined
    /** The window we settled on. Kept so a paused mirror can be resumed without re-matching. */
    let armedSource: string | undefined
    /** Whether the main process currently holds a mirror entry for this window. */
    let running = false
    let searchTimer: ReturnType<typeof setTimeout> | undefined
    let attempts = 0

    const unsubscribe = mirror.onEvent((event) => {
      if (stopped) return
      if (event.type === "frame") {
        setMirrorFrame(event.dataUrl)
        setMirrorTitle(event.title)
        setMirrorStatus("live")
        return
      }
      if (event.type === "blank") {
        // Minimised, or a window the legacy capture path cannot read. Drop the frame too: keeping
        // it would leave a stale picture on screen with no way to show this explanation.
        setMirrorFrame(undefined)
        setMirrorStatus("blank")
        return
      }
      running = false
      armedSource = undefined
      setMirrorStatus("gone")
      setMirrorFrame(undefined)
    })

    const disarm = () => {
      clearTimeout(searchTimer)
      armedFor = undefined
      armedSource = undefined
      running = false
      attempts = 0
      setMirrorFrame(undefined)
      setMirrorTitle(undefined)
      setMirrorStatus("idle")
      void mirror.stop().catch(() => undefined)
    }

    const cadence = () =>
      mirrorFrameInterval({
        visible: typeof document === "undefined" || document.visibilityState === "visible",
        focused: typeof document === "undefined" || document.hasFocus(),
      })

    const startAt = async (sourceId: string, interval: number) => {
      armedSource = sourceId
      if (interval === 0) {
        // Nobody is looking. Remember the window and start when they are.
        setMirrorStatus("searching")
        return
      }
      running = (await mirror.start({ sourceId, intervalMs: interval, width: 1280 }).catch(() => false)) === true
    }

    const arm = async (key: string, pid: number) => {
      const dir = devServerDirectory()
      const pinned = dir ? previewPrefs.mirrorPins[dir] : undefined
      let sourceId: string | undefined
      if (pinned) {
        // A pin is a window handle, which dies with the window it named. Treat it as a hint that
        // has to still exist, not as an answer — otherwise picking a window once broke every
        // later run of that project with "La ventana se cerró".
        const live = await mirror.listSources().catch(() => [])
        if (live.some((source) => source.id === pinned)) sourceId = pinned
        else pinMirrorSource(undefined)
      }
      if (!sourceId) {
        const before = await mirror.snapshot().catch(() => [])
        const matched = await mirror.match({ pid, hints: mirrorHints(), before }).catch(() => null)
        sourceId = matched ?? undefined
      }
      if (stopped || armedFor !== key) return
      if (!sourceId) {
        attempts += 1
        // A GUI takes a moment to put its window up; keep looking for ~10s before giving up and
        // offering the picker.
        if (attempts < 10) {
          searchTimer = setTimeout(() => void arm(key, pid), 1000)
          return
        }
        setMirrorStatus("nomatch")
        return
      }
      await startAt(sourceId, cadence())
    }

    createEffect(() => {
      const state = devServer()
      const dir = devServerDirectory()
      const pid = state?.pid ?? null
      const ok = shouldArmMirror({
        isDesktop: state?.isDesktop === true,
        status: state?.status,
        // The pid belongs to the machine that spawned it. A WSL sidecar is reached over
        // 127.0.0.1 too, so the URL says nothing — only the connection kind does.
        local: !!server.current && ServerConnection.builtin(server.current),
        pid,
        available: mirrorSupported(),
      })
      if (!ok || !dir || typeof pid !== "number") {
        if (armedFor) disarm()
        return
      }
      const key = `${dir}:${pid}`
      if (armedFor === key) return
      clearTimeout(searchTimer)
      armedFor = key
      attempts = 0
      setMirrorFrame(undefined)
      setMirrorStatus("searching")
      void arm(key, pid)
    })

    // Visibility and focus changes only ever throttle. Stopping outright used to destroy the
    // main-process entry, and nothing could recreate it — the panel then showed a frozen frame
    // under a green "live" dot for the rest of the session.
    const retune = () => {
      if (!armedSource) return
      const interval = cadence()
      if (interval === 0) {
        if (running) {
          running = false
          void mirror.pause().catch(() => undefined)
        }
        return
      }
      if (running) {
        void mirror.setInterval(interval).catch(() => undefined)
        return
      }
      void startAt(armedSource, interval)
    }
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", retune)
      window.addEventListener("focus", retune)
      window.addEventListener("blur", retune)
    }

    /** Used by the picker so a hand-chosen window joins the same lifecycle. */
    mirrorAdopt = (sourceId: string) => {
      clearTimeout(searchTimer)
      attempts = 0
      armedFor = armedFor ?? `manual:${devServerDirectory() ?? ""}`
      setMirrorFrame(undefined)
      setMirrorStatus("searching")
      void startAt(sourceId, cadence())
    }

    return () => {
      stopped = true
      mirrorAdopt = undefined
      clearTimeout(searchTimer)
      unsubscribe()
      if (typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", retune)
        window.removeEventListener("focus", retune)
        window.removeEventListener("blur", retune)
      }
      void mirror.stop().catch(() => undefined)
    }
  }

  /**
   * Sends the current mirror frame to the chat.
   *
   * Only ever on this explicit click: the frame is of a window on the user's real desktop, so it
   * is never attached to a message on its own.
   */
  const captureMirrorFrame = async () => {
    const frame = mirrorFrame()
    if (!frame || !props.onCapture) return
    const blob = await fetch(frame)
      .then((res) => res.blob())
      .catch(() => undefined)
    if (!blob) return
    const name = (mirrorTitle() || "ventana").replace(/[^\p{L}\p{N}]+/gu, "-").slice(0, 40) || "ventana"
    props.onCapture(new File([blob], `${name}.jpg`, { type: "image/jpeg" }))
  }

  const openMirrorPicker = async () => {
    const mirror = platform.windowMirror
    if (!mirror) return
    setMirrorPicking(true)
    setMirrorSources(await mirror.listSources().catch(() => []))
  }

  const chooseMirrorSource = (sourceId: string) => {
    pinMirrorSource(sourceId)
    setMirrorPicking(false)
    // Through the controller, so this capture is throttled on blur and stopped on teardown like
    // any other. Started directly, it outlived the panel with no indicator anywhere.
    mirrorAdopt?.(sourceId)
  }

  /**
   * La superficie sobre la que el agente puede actuar.
   *
   * Dos condiciones, y las dos hacen falta:
   *
   * 1. Es lo que el usuario tiene DELANTE. El proceso principal la trata como autoritativa y sólo
   *    ejecuta en un frame de ese mismo origen, así que devolver aquí algo que no se está viendo
   *    reabriría el agujero. Por eso la vista nativa sólo cuenta mientras está activa: oculta
   *    queda descargada (hideNativePreview) y no es objetivo de nadie.
   * 2. Es la vista previa DEL PROYECTO. Este panel es también un navegador con barra de
   *    direcciones y sesión persistente; si el usuario lo lleva a una web suya, eso es navegación
   *    suya, no una superficie del agente. Además el permiso que enseña la tool nombra el origen
   *    del dev server, así que dejar actuar sobre otro sitio haría que ese permiso mintiera.
   */
  const previewFrameHint = () => {
    // La recarga sin parpadeo mantiene dos iframes vivos y los alterna: el `src` del activo es lo
    // único que distingue el visible de la copia oculta.
    const visible = iframeUrl() ? iframe?.src : nativePreviewActive() ? state()?.url || undefined : undefined
    if (!visible) return undefined
    const seen = originOf(visible)
    const project = devServer()?.url
    if (!seen || !project) return undefined
    // El dev server puede anunciarse en 0.0.0.0 o [::1] y el iframe se carga en la forma
    // navegable (iframePreviewUrl): los dos deletreos son el mismo servidor.
    const allowed = [originOf(project), originOf(iframePreviewUrl(project))]
    return allowed.includes(seen) ? visible : undefined
  }

  const startPreviewAgentBridge = () => {
    const agent = platform.previewAgent
    // A web renderer still polls, slowly and with surface=0/capable=0, so the backend can answer
    // "incapable" instead of "no window open" — that is the only way the tool can tell the agent
    // it is on the wrong build rather than telling it to open a panel that does not exist here.
    const capable = !!agent
    let stopped = false

    const runDesktopCommand = async (action: DesktopBridgeAction): Promise<{ ok: boolean; output: string }> => {
      if (action.type === "capture") {
        const kind = action.target === "window" ? "window" : action.target === "area" ? "area" : "screen"
        if (kind === "area" && !action.bounds)
          return { ok: false, output: "Falta el recorte: `area` necesita bounds con x, y, width y height." }
        const shot = await platform.captureScreenshot?.(kind, action.bounds ? { bounds: action.bounds } : undefined)
        if (!shot) return { ok: false, output: "Tiancode no pudo capturar la pantalla." }
        // La imagen viaja como data URL por el mismo canal de texto del puente; la tool la
        // convierte en adjunto para que el modelo la vea.
        return { ok: true, output: `data:image/png;base64,${toBase64(await shot.arrayBuffer())}` }
      }
      if (action.type === "computer") {
        const computer = desktopComputerApi()
        if (!computer?.perform) return { ok: false, output: "El control del ordenador no está disponible en esta sesión." }
        return await computer.perform(action)
      }
      const clipboard = desktopClipboardApi()
      if (action.type === "clipboard_read") {
        if (!clipboard?.readClipboardText) return { ok: false, output: "Portapapeles no disponible en esta sesión." }
        return { ok: true, output: await clipboard.readClipboardText() }
      }
      if (!clipboard?.writeClipboardText) return { ok: false, output: "Portapapeles no disponible en esta sesión." }
      await clipboard.writeClipboardText(action.value ?? "")
      return { ok: true, output: "Portapapeles actualizado." }
    }

    const runCommand = async (action: BridgeAction): Promise<{ ok: boolean; output: string }> => {
      if (isDesktopBridgeAction(action)) {
        try {
          return await runDesktopCommand(action)
        } catch (error) {
          return { ok: false, output: error instanceof Error ? error.message : String(error) }
        }
      }
      if (!agent) return { ok: false, output: "Esta sesión no puede ejecutar acciones dentro de la página." }
      try {
        const hint = action.surface === "browser" ? BROWSER_SURFACE_TOKEN : previewFrameHint()
        const result = await agent.execute(buildPreviewAgentScript(action), hint)
        if (!result.ok) return { ok: false, output: result.error }
        return { ok: true, output: result.value }
      } catch (error) {
        return { ok: false, output: error instanceof Error ? error.message : String(error) }
      }
    }

    const loop = async () => {
      while (!stopped) {
        const dir = devServerDirectory()
        const url = server.current?.http.url
        if (!dir || !url) {
          await new Promise((resolve) => setTimeout(resolve, 2000))
          continue
        }
        try {
          const headers = devServerHeaders()
          // Ask the main process whether a frame really exists, rather than assuming one does
          // because the component is mounted: `available` runs the same lookup as `execute`.
          const surface = agent ? await agent.available(previewFrameHint()).catch(() => false) : false
          // The short re-poll is only right while a page is genuinely on its way: an iframe URL is
          // set, or the dev server is still starting. With no preview at all — the Sandbox empty
          // state, or a desktop app that will never have a frame — "waiting for a page" is
          // permanent, and 1.5 s meant ~40 requests a minute forever.
          const loading = !!iframeUrl() || devServer()?.status === "starting"
          const wait = surface || !capable || !loading ? 20000 : 1500
          const res = await fetch(previewAgentPendingUrl(url, dir, wait, { surface, capable }), { headers })
          if (!res.ok) {
            await new Promise((resolve) => setTimeout(resolve, 3000))
            continue
          }
          const commands = (await res.json()) as { id: string; action: BridgeAction }[]
          for (const command of commands) {
            const post = (body: Record<string, unknown>) =>
              fetch(previewAgentResultUrl(url, dir), {
                method: "POST",
                headers: { ...headers, "content-type": "application/json" },
                body: JSON.stringify(body),
              }).catch(() => undefined)
            if (stopped) {
              // Claimed but never run. Hand it back instead of dropping it on the floor — the
              // agent is still waiting and a freshly opened panel can still execute it.
              await post({ id: command.id, ok: false, output: "La Vista en vivo se cerró.", requeue: true })
              continue
            }
            const outcome = await runCommand(command.action)
            await post({ id: command.id, ok: outcome.ok, output: outcome.output })
          }
        } catch {
          // Servidor caído o sesión cambiando: se reintenta sin ruido.
          await new Promise((resolve) => setTimeout(resolve, 3000))
        }
      }
    }

    void loop()
    return () => {
      stopped = true
    }
  }

  onMount(() => {
    const stopAgentBridge = startPreviewAgentBridge()
    onCleanup(stopAgentBridge)
    void platform.windowMirror
      ?.supported()
      .then((value) => setMirrorSupported(value === true))
      .catch(() => undefined)
    const stopWindowMirror = startWindowMirror()
    onCleanup(stopWindowMirror)

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
    // El ritmo del sondeo sigue al estado: rápido mientras arranca o compila, tranquilo cuando
    // no hay nada que mirar. Un intervalo fijo era lento donde importa y ruidoso donde no.
    void fetchDevServer()
    let devTimer = 0
    let devTimerDelay = 0
    const scheduleDevPoll = () => {
      const state = devServer()
      const delay = previewPollInterval({
        status: state?.status,
        building: state?.build?.running === true,
        desktop: state?.isDesktop === true,
      })
      if (delay === devTimerDelay && devTimer) return
      if (devTimer) window.clearInterval(devTimer)
      devTimerDelay = delay
      devTimer = window.setInterval(() => {
        void fetchDevServer()
        scheduleDevPoll()
      }, delay)
    }
    scheduleDevPoll()
    const observer = surface ? new ResizeObserver(queueBounds) : undefined
    if (surface) {
      measureViewport()
      observer?.observe(surface)
    }
    const handleReload = (event?: Event) => {
      const customEvent = event as CustomEvent<{ path?: string; reason?: string }> | undefined
      reloadScheduler.request(customEvent?.detail?.path ?? customEvent?.detail?.reason)
    }
    // The reload client injected by the managed static/JSX preview offers to delegate its
    // own reloads to us, so a file change produces one buffered swap instead of a self-reload
    // (white flash) plus ours.
    const handleMessage = (event: MessageEvent) => {
      const data = event.data as { type?: unknown; path?: unknown } | null
      if (!data || typeof data.type !== "string" || !event.source) return
      let known = false
      for (const element of frameElements.values()) if (element.contentWindow === event.source) known = true
      if (!known) return
      if (data.type === "tiancode:preview-client") {
        try {
          ;(event.source as Window).postMessage({ type: "tiancode:host", delegateReloads: true }, "*")
        } catch {
          // ignore
        }
        return
      }
      if (data.type === "tiancode:reload-request") {
        reloadScheduler.request(typeof data.path === "string" ? data.path : "watcher")
      }
    }
    window.addEventListener("message", handleMessage)
    window.addEventListener("tiancode:preview-reload", handleReload)

    if (!view || !surface) {
      onCleanup(() => {
        reloadScheduler.dispose()
        window.clearInterval(devTimer)
        observer?.disconnect()
        window.removeEventListener("resize", queueBounds)
        window.removeEventListener("fullscreenchange", queueBounds)
        window.removeEventListener("tiancode:preview-reload", handleReload)
        window.removeEventListener("message", handleMessage)
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
      reloadScheduler.dispose()
      window.removeEventListener("tiancode:preview-reload", handleReload)
      window.removeEventListener("message", handleMessage)
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
      setReloading(false)
      frameElements.clear()
      setFrames([])
      setActiveFrameId(undefined)
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
    void previewZoom()
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

  const reloadPreview = () => reloadScheduler.request("manual")

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
      const scale = viewport.scale
      if (scale === 1) {
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
      // Fluid mode with a manual zoom: the document keeps filling the panel at its own size
      // and is scaled as a whole, like a browser's page zoom.
      return {
        width: `${100 / scale}%`,
        height: `${100 / scale}%`,
        top: "0px",
        left: "0px",
        transform: `scale(${scale})`,
        "transform-origin": "top left",
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

  /** "Portátil 1366×768": el nombre se traduce, las medidas no. */
  const devicePreset = (id: keyof typeof DEVICE_PRESETS, name: string) =>
    `${name} ${DEVICE_PRESETS[id].width}×${DEVICE_PRESETS[id].height}`

  const deviceOptions = () => [
    { id: "fit" as const, label: language.t("liveView.device.fluid") },
    { id: "desktop" as const, label: devicePreset("desktop", language.t("livePreview.device.desktop")) },
    { id: "desktopCompact" as const, label: devicePreset("desktopCompact", language.t("livePreview.device.desktop")) },
    // Nombres de producto: no se traducen en ningún idioma.
    { id: "macbook" as const, label: devicePreset("macbook", "MacBook Pro") },
    { id: "laptop" as const, label: devicePreset("laptop", language.t("livePreview.device.laptop")) },
    { id: "tablet" as const, label: devicePreset("tablet", "iPad Air/Pro") },
    { id: "tabletCompact" as const, label: devicePreset("tabletCompact", "iPad Mini") },
    { id: "androidTablet" as const, label: devicePreset("androidTablet", language.t("livePreview.device.androidTablet")) },
    { id: "mobile" as const, label: devicePreset("mobile", "iPhone 16 / 15 Pro") },
    { id: "mobileMax" as const, label: devicePreset("mobileMax", "iPhone 16 / 15 Pro Max") },
    { id: "androidPhone" as const, label: devicePreset("androidPhone", language.t("livePreview.device.android")) },
    { id: "mobileCompact" as const, label: devicePreset("mobileCompact", language.t("livePreview.device.mobile")) },
    { id: "tv" as const, label: devicePreset("tv", language.t("livePreview.device.tv")) },
    { id: "custom" as const, label: language.t("livePreview.device.custom") },
  ]

  const setCustomDimension = (axis: "width" | "height", value: string) => {
    const parsed = Number.parseInt(value, 10)
    setCustomSize((size) => ({ ...size, [axis]: Number.isFinite(parsed) ? clamp(parsed, CUSTOM_MIN, CUSTOM_MAX) : size[axis] }))
  }

  const statusInput = () => ({
    status: devServer()?.status,
    failed: !!fail(),
    loading: state()?.loading === true,
  })

  const STATUS_TONE_CLASS = {
    success: "bg-[var(--v2-state-fg-success)]",
    warning: "bg-[var(--v2-state-fg-warning)]",
    danger: "bg-[var(--v2-state-fg-danger)]",
    info: "bg-[var(--v2-state-fg-info)]",
    // Nada gestionado ha contestado: gris, porque no hay nada que esté yendo bien.
    neutral: "bg-v2-icon-icon-muted",
  } as const

  const statusTone = () => STATUS_TONE_CLASS[previewStatusTone(statusInput())]

  const STATUS_LABEL_KEY = {
    starting: "livePreview.starting",
    ready: "livePreview.ready",
    stopped: "livePreview.stopped",
    serverError: "livePreview.serverError",
    loadFailed: "livePreview.status.failed",
    idle: "livePreview.idle",
  } as const

  const devServerStatusLabel = () => language.t(STATUS_LABEL_KEY[previewStatusLabel(statusInput())])

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

  /** The whole path, for the tooltip: the chip itself only has room for the file name. */
  const buildLabelTitle = () => {
    const full = devServer()?.build?.trigger
    return full ? language.t("livePreview.buildingFile", { file: full }) : buildLabel()
  }

  // Un build fallido deja el servidor "ready" sirviendo la última salida que sí compiló: estos
  // errores son la única señal de que lo que se ve en pantalla está caducado, y de por qué.
  const [dismissedBuildSequence, setDismissedBuildSequence] = createSignal(0)
  const buildErrors = () => {
    const dev = devServer()
    if (!dev?.build || dev.build.sequence <= dismissedBuildSequence()) return []
    return failedBuildErrors({ build: dev.build, errors: dev.errors })
  }
  const dismissBuildErrors = () => setDismissedBuildSequence(devServer()?.build?.sequence ?? 0)
  // "Reintentar" aquí es volver a compilar: arrancar la vista previa ejecuta el build del
  // proyecto (dev-server-manager). Recargar el iframe sólo volvería a pintar lo mismo de antes.
  const retryBuild = () => void devServerAction("restart")
  /** El texto que se le manda al agente: un error por línea, con su archivo y su línea. */
  const buildErrorReport = () =>
    buildErrors()
      .map((error) => {
        const where = buildErrorLocation(error)
        return where ? `${where}: ${error.message}` : error.message
      })
      .join("\n")

  // Con errores de compilación en pantalla, "no se pudo cargar la URL" sobra: el panel de arriba
  // ya dice qué pasa y lo dice mejor.
  const loadFailure = () => (buildErrors().length > 0 ? null : fail())

  const showLogTail = () =>
    shouldShowPreviewLogs({
      status: devServer()?.status,
      building: devServer()?.build?.running === true,
      desktop: devServer()?.isDesktop === true,
      lines: serverLogs().length,
    })

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
        {/* Ranura de ancho fijo: los tres chips se excluyen entre sí y miden distinto, así que
            el selector de dispositivo y el zoom se desplazaban en cada archivo que escribía el
            agente, justo cuando el usuario iba a pulsarlos. */}
        <div class="live-preview-status-slot">
          <span
            class={`size-1.5 shrink-0 rounded-full ${statusTone()}`}
            title={devServerStatusLabel()}
            aria-hidden="true"
          />
          <Show
            when={isBuilding()}
            fallback={
              <span class="min-w-0 truncate text-11-regular text-v2-text-text-muted">{devServerStatusLabel()}</span>
            }
          >
            <span
              class="flex min-w-0 items-center gap-1.5 rounded-md bg-v2-state-bg-warning px-1.5 py-0.5 text-11-regular whitespace-nowrap text-v2-text-text-base"
              role="status"
              aria-live="polite"
              title={buildLabelTitle()}
            >
              <Spinner class="size-3 shrink-0" />
              <span class="min-w-0 truncate">{buildLabel()}</span>
            </span>
          </Show>
          <Show when={!isBuilding() && props.activeEditFile?.()}>
            {(file) => (
              <span
                class="flex min-w-0 items-center gap-1.5 rounded-md bg-v2-state-bg-info px-1.5 py-0.5 text-11-regular whitespace-nowrap text-v2-state-fg-info"
                role="status"
                aria-live="polite"
                title={language.t("livePreview.writingFile", { file: file() })}
              >
                <IconV2 name="edit" class="size-3 shrink-0" />
                <span class="min-w-0 truncate">{shortenBuildTrigger(file()) ?? file()}</span>
              </span>
            )}
          </Show>
          <Show when={!isBuilding() && !props.activeEditFile?.() && devServer()?.build?.ok === true && devServer()?.build?.durationMs}>
            {(duration) => (
              <span
                class="shrink-0 text-11-regular text-v2-text-text-faint tabular-nums"
                title={language.t("livePreview.builtIn", { ms: String(duration()) })}
              >
                {(duration() / 1000).toFixed(1)}s
              </span>
            )}
          </Show>
        </div>
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
            setAutoZoom()
            if (option.id === "fit") setRotated(false)
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
          aria-pressed={inspectActive()}
          title={`${language.t("livePreview.designToCode.title")} (Ctrl+Alt+I)`}
          onClick={() => setInspectActive(!inspectActive())}
          class={`flex shrink-0 items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium border transition-colors cursor-pointer ${
            inspectActive()
              ? "bg-v2-state-bg-info text-v2-state-fg-info border-v2-state-border-info"
              : "bg-v2-background-bg-base text-v2-text-text-muted border-v2-border-border-muted hover:text-v2-text-text-base hover:border-v2-border-border-strong"
          }`}
        >
          <span>{language.t("livePreview.designToCode.label")}</span>
        </button>

        <Show when={inspectActive()}>
          <span class="inline-flex shrink-0 items-center gap-1 rounded-full border border-v2-state-border-info bg-v2-state-bg-info px-2 py-0.5 text-[10px] font-semibold text-v2-state-fg-info select-none">
            <span class="live-preview-pulse size-1.5 rounded-full bg-v2-state-fg-info" aria-hidden="true" />
            {language.t("livePreview.inspector.active")}
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
          <span class="text-11-regular text-v2-text-text-faint" aria-hidden="true">
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
          <ToolButton title={language.t("livePreview.zoomOut")} onClick={() => zoomStep(-1)}>
            −
          </ToolButton>
          <button
            type="button"
            class="min-w-10 rounded-md px-1 text-center text-11-regular text-v2-text-text-muted tabular-nums transition-colors hover:bg-v2-overlay-simple-overlay-hover hover:text-v2-text-text-base"
            title={language.t("livePreview.zoomReset")}
            onClick={zoomActualSize}
          >
            {Math.round(previewViewport().scale * 100)}%
          </button>
          <ToolButton title={language.t("livePreview.zoomIn")} onClick={() => zoomStep(1)}>
            +
          </ToolButton>
          <ToolButton pressed={previewViewport().mode === "auto"} title={language.t("livePreview.zoomAuto")} onClick={setAutoZoom}>
            {language.t("livePreview.fit")}
          </ToolButton>
        </div>
      </div>

      <Show when={inspectActive() && selectedElement()}>
        {(info) => (
          <div class="flex shrink-0 items-center justify-between gap-3 border-b border-v2-state-border-info bg-v2-state-bg-info px-3 py-1.5 font-mono text-[11px] text-v2-text-text-base">
            <div class="flex min-w-0 flex-1 flex-wrap items-center gap-2">
              <span class="rounded bg-v2-background-bg-base px-1.5 py-0.5 font-bold text-v2-state-fg-info">
                &lt;{info().tag}&gt;
              </span>
              <Show when={info().id}>
                <span class="font-semibold">#{info().id}</span>
              </Show>
              <Show when={info().classes}>
                <span class="max-w-[280px] truncate text-v2-state-fg-info" title={info().classes}>
                  .{info().classes.split(/\s+/).join(".")}
                </span>
              </Show>
              <span aria-hidden="true">|</span>
              {/* `margin` y `padding` se escriben como las propiedades CSS que son: el valor de al
                  lado es CSS literal, no prosa traducible. */}
              <span title={info().dimensions}>
                {language.t("livePreview.selection.size")}: {info().dimensions}
              </span>
              <span aria-hidden="true">|</span>
              <span title={info().margin}>margin: {info().margin}</span>
              <span aria-hidden="true">|</span>
              <span title={info().padding}>padding: {info().padding}</span>
            </div>
            <IconButtonV2
              type="button"
              variant="ghost-muted"
              size="small"
              class="shrink-0"
              onClick={() => setSelectedElement(null)}
              title={language.t("common.close")}
              icon={<IconV2 name="xmark-small" size="small" />}
            />
          </div>
        )}
      </Show>

      {/* Compilación fallida. El manager deja `status` en "ready" y sólo baja `build.ok`, así que
          sin esta rama un error de sintaxis no se veía por ninguna parte: la página seguía
          mostrando la última salida que sí compiló, como si no pasara nada. */}
      <Show when={buildErrors().length > 0}>
        <div
          class="flex shrink-0 flex-col gap-1.5 border-b border-v2-state-border-danger bg-v2-state-bg-danger px-3 py-2"
          role="status"
          aria-live="polite"
        >
          <div class="flex items-center gap-2">
            <span class="min-w-0 flex-1 truncate text-11-medium text-v2-state-fg-danger">
              {language.t("livePreview.buildFailed")}
            </span>
            <ButtonV2 type="button" size="small" variant="contrast" onClick={() => askAiToFix(buildErrorReport())}>
              {language.t("livePreview.fixWithAi")}
            </ButtonV2>
            <ButtonV2 type="button" size="small" variant="neutral" onClick={retryBuild}>
              {language.t("livePreview.retry")}
            </ButtonV2>
            <IconButtonV2
              type="button"
              variant="ghost-muted"
              size="small"
              class="shrink-0"
              onClick={dismissBuildErrors}
              title={language.t("common.close")}
              icon={<IconV2 name="xmark-small" size="small" />}
            />
          </div>
          <ul class="m-0 flex max-h-32 list-none flex-col gap-1 overflow-y-auto p-0 font-mono text-[11px] leading-relaxed text-v2-text-text-base">
            <For each={buildErrors()}>
              {(error) => (
                <li class="flex min-w-0 flex-wrap items-baseline gap-x-2">
                  <Show when={buildErrorLocation(error)}>
                    {(location) => (
                      <Show
                        when={props.onOpenSource && error.file}
                        fallback={
                          <span class="shrink-0 text-v2-state-fg-danger" title={error.file ?? undefined}>
                            {location()}
                          </span>
                        }
                      >
                        <button
                          type="button"
                          class="shrink-0 cursor-pointer text-v2-state-fg-danger underline underline-offset-2"
                          title={error.file ?? undefined}
                          onClick={() => props.onOpenSource?.(error.file!)}
                        >
                          {location()}
                        </button>
                      </Show>
                    )}
                  </Show>
                  <span class="min-w-0 break-all whitespace-pre-wrap">{error.message}</span>
                </li>
              )}
            </For>
          </ul>
        </div>
      </Show>

      <Show when={previewIssue()}>
        {(issue) => (
          <div class="flex shrink-0 items-center justify-between gap-2 border-b border-v2-state-border-danger bg-v2-state-bg-danger px-3 py-1.5 text-11-regular text-v2-state-fg-danger">
            <div class="flex min-w-0 flex-1 items-center gap-2">
              <span class="min-w-0 flex-1 truncate font-medium" title={issue().message}>
                {issue().type === "whitescreen"
                  ? language.t("livePreview.issue.whiteScreen")
                  : language.t("livePreview.issue.runtime", { message: issue().message })}
              </span>
            </div>
            <div class="flex shrink-0 items-center gap-2">
              <ButtonV2 type="button" size="small" variant="contrast" onClick={() => askAiToFix(issue().message)}>
                {language.t("livePreview.fixWithAi")}
              </ButtonV2>
              <ButtonV2 type="button" size="small" variant="neutral" onClick={() => reloadPreview()}>
                {language.t("livePreview.retry")}
              </ButtonV2>
              <IconButtonV2
                type="button"
                variant="ghost-muted"
                size="small"
                class="shrink-0"
                onClick={() => setPreviewIssue(null)}
                title={language.t("common.close")}
                icon={<IconV2 name="xmark-small" size="small" />}
              />
            </div>
          </div>
        )}
      </Show>

      <Show when={loadFailure()}>
        {(failed) => (
          <div class="flex shrink-0 items-center gap-2 border-b border-v2-state-border-danger bg-v2-state-bg-danger px-3 py-1.5 text-11-regular text-v2-state-fg-danger">
            <span class="min-w-0 flex-1 truncate" title={failed().description}>
              {/* "¿Está el dev server en marcha?" sólo se pregunta cuando de verdad puede estarlo:
                  con un error de compilación el servidor contestó, y esa pregunta escondía el
                  mensaje del compilador detrás de un diagnóstico falso. */}
              {previewFailureCopy({ status: devServer()?.status, compileErrors: devServer()?.errors?.length ?? 0 }) ===
              "compile"
                ? failed().description
                : language.t("livePreview.loadFailed", { url: failed().url, description: failed().description })}
            </span>
            <ButtonV2 type="button" size="small" variant="contrast" onClick={() => askAiToFix(failed().description)}>
              {language.t("livePreview.fixWithAi")}
            </ButtonV2>
            <ButtonV2 type="button" size="small" variant="neutral" onClick={retryPreview}>
              {language.t("livePreview.retry")}
            </ButtonV2>
            <IconButtonV2
              type="button"
              variant="ghost-muted"
              size="small"
              class="shrink-0"
              onClick={() => setFail(null)}
              title={language.t("common.close")}
              icon={<IconV2 name="xmark-small" size="small" />}
            />
          </div>
        )}
      </Show>

      {/* Contenedor real del preview: sus bounds (getBoundingClientRect) son
          los del WebContentsView. El placeholder sólo aparece al ocultarlo. */}
      <div class="relative min-h-0 flex-1 overflow-hidden bg-v2-background-bg-base" ref={container}>
        <Show when={iframeUrl()} keyed>
          {(target) => (
            <div
              class="absolute inset-0 flex"
              classList={{
                "p-3": !!deviceSize(),
                "p-0": !deviceSize(),
                // Auto-fit centres the silhouette; a manual zoom that no longer fits scrolls instead.
                "items-center justify-center overflow-hidden": !previewViewport().overflow,
                "items-start justify-start overflow-auto": previewViewport().overflow,
              }}
            >
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
                <For each={frames().filter((frame) => frame.url === target)}>
                  {(frame) => (
                    <iframe
                      ref={(element) => {
                        frameElements.set(frame.id, element)
                        if (frame.id === activeFrameId()) iframe = element
                      }}
                      data-slot="live-preview-iframe"
                      data-active={frame.id === activeFrameId() || undefined}
                      src={frame.src}
                      title={language.t("liveView.tab.app")}
                      sandbox={IFRAME_SANDBOX}
                      allow={IFRAME_ALLOW}
                      referrerpolicy="no-referrer-when-downgrade"
                      class="absolute inset-0 top-0 left-0 border-0 bg-white"
                      style={{
                        ...iframeStyle(),
                        visibility: frame.id === activeFrameId() ? "visible" : "hidden",
                        "pointer-events": frame.id === activeFrameId() ? "auto" : "none",
                      }}
                      onLoad={(event) => completeIframeLoad(event.currentTarget)}
                      onError={(event) => failIframeLoad(event.currentTarget)}
                    />
                  )}
                </For>
              </div>
              <Show when={reloading() && !iframeLoading()}>
                <div class="pointer-events-none absolute inset-x-0 top-0 z-10 h-0.5 overflow-hidden" aria-hidden="true">
                  <div class="live-preview-reloading-bar h-full w-1/3 rounded-full bg-[var(--v2-state-fg-info)]" />
                </div>
              </Show>
              <Show when={iframeLoading()}>
                <div class="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-v2-background-bg-base px-6 text-center text-12-regular text-v2-text-text-muted">
                  {language.t("livePreview.starting")}
                </div>
              </Show>
            </div>
          )}
        </Show>
        <Show when={!iframeUrl() && !previewSurfaceVisible()}>
          <div class="absolute inset-0 flex flex-col overflow-hidden bg-v2-background-bg-base p-4">
            <Show
              when={devServer()?.isDesktop}
              fallback={
                <div
                  class="flex min-h-0 flex-col items-center justify-center gap-3 px-6 text-center text-12-regular text-v2-text-text-muted"
                  classList={{ "flex-1": !showLogTail(), "shrink-0 pb-4": showLogTail() }}
                >
                  <span>{previewPlaceholder()}</span>
                  <Show when={devServer()?.status === "idle" || devServer()?.status === "stopped" || devServer()?.status === "error"}>
                    <div class="flex items-center gap-2">
                      <ButtonV2
                        type="button"
                        variant="contrast"
                        onClick={() => void devServerAction(devServer()?.status === "stopped" ? "start" : devServer()?.status === "error" ? "restart" : "start")}
                      >
                        {devServer()?.status === "error"
                          ? language.t("livePreview.retry")
                          : language.t("livePreview.startServer")}
                      </ButtonV2>
                      <Show when={devServer()?.status === "error"}>
                        <ButtonV2
                          type="button"
                          variant="neutral"
                          onClick={() =>
                            askAiToFix(
                              devServer()?.errorMessage ||
                                devServer()?.errors?.[0]?.message ||
                                language.t("livePreview.serverError"),
                            )
                          }
                        >
                          {language.t("livePreview.fixWithAi")}
                        </ButtonV2>
                      </Show>
                    </div>
                  </Show>
                  <Show when={devServer()?.status === "starting"}>
                    <ButtonV2 type="button" size="small" variant="danger" onClick={() => void devServerAction("stop")}>
                      {language.t("livePreview.stop")}
                    </ButtonV2>
                  </Show>
                </div>
              }
            >
              <>
                <div class="flex shrink-0 flex-col gap-3 rounded-xl border border-v2-border-border-muted bg-v2-background-bg-layer-01 p-4">
                  <div class="flex flex-wrap items-center justify-between gap-2">
                    <div class="flex min-w-0 flex-1 items-center gap-2.5">
                      <span class="flex size-9 shrink-0 items-center justify-center rounded-lg bg-v2-state-bg-info text-v2-state-fg-info">
                        <IconV2 name="monitor" />
                      </span>
                      <div class="min-w-0">
                        <div class="flex flex-wrap items-center gap-2">
                          <span class="text-13-medium text-v2-text-text-base">{language.t("livePreview.desktop.title")}</span>
                          <span class="rounded bg-v2-state-bg-info px-1.5 py-0.5 text-[10px] font-semibold uppercase text-v2-state-fg-info">
                            {devServer()?.framework || language.t("livePreview.desktop.badge")}
                          </span>
                        </div>
                        <p class="text-11-regular text-v2-text-text-muted">
                          {language.t("livePreview.desktop.subtitle")}
                        </p>
                      </div>
                    </div>
                    <div class="flex shrink-0 items-center gap-2">
                      <span
                        class={`size-2 rounded-full ${
                          devServer()?.status === "ready"
                            ? "live-preview-pulse bg-[var(--v2-state-fg-success)]"
                            : devServer()?.status === "starting"
                              ? "live-preview-pulse bg-[var(--v2-state-fg-warning)]"
                              : devServer()?.status === "error"
                                ? "bg-[var(--v2-state-fg-danger)]"
                                : "bg-v2-icon-icon-muted"
                        }`}
                        aria-hidden="true"
                      />
                      <span class="text-11-medium text-v2-text-text-muted">
                        {devServer()?.status === "ready"
                          ? language.t("livePreview.desktop.running")
                          : devServer()?.status === "starting"
                            ? language.t("livePreview.desktop.starting")
                            : devServer()?.status === "error"
                              ? language.t("livePreview.desktop.failed")
                              : language.t("livePreview.stopped")}
                      </span>
                    </div>
                  </div>

                  <div class="flex flex-wrap items-center gap-2 pt-1">
                    <Show
                      when={devServer()?.status === "ready"}
                      fallback={
                        <Show
                          when={devServer()?.status === "starting"}
                          fallback={
                            <ButtonV2
                              type="button"
                              variant="contrast"
                              onClick={() => void devServerAction(devServer()?.status === "error" ? "restart" : "start")}
                            >
                              {devServer()?.status === "error"
                                ? language.t("livePreview.retry")
                                : language.t("livePreview.desktop.run")}
                            </ButtonV2>
                          }
                        >
                          <ButtonV2 type="button" size="small" variant="danger" onClick={() => void devServerAction("stop")}>
                            {language.t("common.cancel")}
                          </ButtonV2>
                        </Show>
                      }
                    >
                      <ButtonV2 type="button" variant="danger" onClick={() => void devServerAction("stop")}>
                        {language.t("livePreview.desktop.stopApp")}
                      </ButtonV2>
                      <ButtonV2 type="button" variant="neutral" onClick={() => void devServerAction("restart")}>
                        {language.t("livePreview.desktop.restart")}
                      </ButtonV2>
                    </Show>
                    <Show when={devServer()?.command}>
                      <span
                        class="ml-auto min-w-0 max-w-full truncate text-11-regular font-mono text-v2-text-text-faint"
                        title={devServer()?.command ?? undefined}
                      >
                        {devServer()?.command}
                      </span>
                    </Show>
                  </div>
                  <Show when={devServer()?.errorMessage}>
                    <div class="flex items-center justify-between gap-2 rounded-lg border border-v2-state-border-danger bg-v2-state-bg-danger px-3 py-2 text-[11px] text-v2-state-fg-danger">
                      <span class="min-w-0 flex-1">{devServer()?.errorMessage}</span>
                      <ButtonV2
                        type="button"
                        size="small"
                        variant="contrast"
                        onClick={() => askAiToFix(devServer()?.errorMessage || "")}
                      >
                        {language.t("livePreview.fixWithAi")}
                      </ButtonV2>
                    </div>
                  </Show>
                </div>

                {/* Espejo de la ventana real de la app. Imagen, no embebido: no se puede pulsar. */}
                <Show when={mirrorSupported() && devServer()?.isDesktop && devServer()?.status === "ready"}>
                  <div class="mt-3 flex min-h-0 flex-[2] flex-col overflow-hidden rounded-xl border border-v2-border-border-muted bg-v2-background-bg-layer-01">
                    <div class="flex flex-wrap items-center gap-2 border-b border-v2-border-border-muted px-3 py-2 text-[11px] text-v2-text-text-muted">
                      <span
                        class={`size-2 shrink-0 rounded-full ${
                          mirrorStatus() === "live" ? "bg-[var(--v2-state-fg-success)]" : "bg-v2-icon-icon-muted"
                        }`}
                        aria-hidden="true"
                      />
                      <span class="min-w-0 flex-1 truncate font-medium text-v2-text-text-base" title={mirrorTitle()}>
                        {mirrorTitle() ?? language.t("livePreview.mirror.window")}
                      </span>
                      <span class="shrink-0 text-[10px]">{language.t("livePreview.mirror.viewOnly")}</span>
                      <ButtonV2 type="button" size="small" variant="ghost-muted" onClick={() => void openMirrorPicker()}>
                        {language.t("livePreview.mirror.choose")}
                      </ButtonV2>
                      <Show when={mirrorFrame()}>
                        <ButtonV2 type="button" size="small" variant="ghost-muted" onClick={() => void captureMirrorFrame()}>
                          {language.t("liveView.capture")}
                        </ButtonV2>
                      </Show>
                    </div>

                    {/* Fondo oscuro fijo: es el marco de una fotografía de otra ventana, no una
                        superficie de la app, y un fondo claro teñiría la imagen. */}
                    <div class="relative flex min-h-0 flex-1 items-center justify-center bg-[var(--v2-grey-1200)]">
                      <Show
                        when={mirrorFrame()}
                        fallback={
                          <div class="px-6 text-center text-[11px] text-[var(--v2-grey-500)]">
                            {mirrorStatus() === "searching"
                              ? language.t("livePreview.mirror.searching")
                              : mirrorStatus() === "blank"
                                ? language.t("livePreview.mirror.blank")
                                : mirrorStatus() === "gone"
                                  ? language.t("livePreview.mirror.gone")
                                  : mirrorStatus() === "nomatch"
                                    ? language.t("livePreview.mirror.nomatch")
                                    : language.t("livePreview.mirror.idle")}
                          </div>
                        }
                      >
                        {(frame) => (
                          <img
                            src={frame()}
                            alt={language.t("livePreview.mirror.alt")}
                            class="max-h-full max-w-full object-contain"
                            draggable={false}
                          />
                        )}
                      </Show>

                      <Show when={mirrorPicking()}>
                        <div class="absolute inset-0 z-10 overflow-y-auto bg-v2-background-bg-base p-3">
                          <div class="mb-2 flex items-center justify-between text-[11px] text-v2-text-text-muted">
                            <span>{language.t("livePreview.mirror.pickTitle")}</span>
                            <ButtonV2
                              type="button"
                              size="small"
                              variant="ghost-muted"
                              onClick={() => setMirrorPicking(false)}
                            >
                              {language.t("common.cancel")}
                            </ButtonV2>
                          </div>
                          <div class="grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-2">
                            <For each={mirrorSources()}>
                              {(source) => (
                                <button
                                  type="button"
                                  class="flex cursor-pointer flex-col gap-1 rounded-lg border border-v2-border-border-muted p-1.5 text-left transition-colors hover:border-v2-border-border-strong"
                                  onClick={() => chooseMirrorSource(source.id)}
                                >
                                  <Show when={source.thumb}>
                                    {(thumb) => (
                                      <img src={thumb()} alt="" class="h-20 w-full rounded object-cover" draggable={false} />
                                    )}
                                  </Show>
                                  <span class="truncate text-[10px] text-v2-text-text-base" title={source.name}>
                                    {source.name}
                                  </span>
                                </button>
                              )}
                            </For>
                          </div>
                          <Show when={mirrorSources().length === 0}>
                            <div class="py-6 text-center text-[11px] text-v2-text-text-muted">
                              {language.t("livePreview.mirror.empty")}
                            </div>
                          </Show>
                        </div>
                      </Show>
                    </div>
                  </div>
                </Show>
              </>
            </Show>

            {/* Cola de stdout/stderr del proceso gestionado. Ya se estaba trayendo para un proyecto
                web mientras arranca y se tiraba, porque sólo se pintaba en la rama de escritorio:
                la espera era la palabra "Iniciando…" sobre un panel vacío teniendo esto a mano. */}
            <Show when={showLogTail()}>
              <div
                class="flex min-h-0 flex-1 flex-col rounded-xl border border-v2-border-border-muted bg-v2-background-bg-layer-01 p-3"
                classList={{ "mt-3": devServer()?.isDesktop === true }}
              >
                <div class="flex items-center justify-between gap-2 border-b border-v2-border-border-muted pb-2 text-[11px] text-v2-text-text-muted">
                  <span class="min-w-0 truncate font-medium">{language.t("livePreview.console")}</span>
                  <div class="flex shrink-0 items-center gap-1">
                    <IconButtonV2
                      type="button"
                      size="small"
                      variant="ghost-muted"
                      onClick={() => void fetchDevServerLogs()}
                      title={language.t("livePreview.console.refresh")}
                      icon={<IconV2 name="reset" size="small" />}
                    />
                    <IconButtonV2
                      type="button"
                      size="small"
                      variant="ghost-muted"
                      disabled={serverLogs().length === 0}
                      onClick={() => {
                        const text = serverLogs().join("\n")
                        if (text) void navigator.clipboard?.writeText(text)
                      }}
                      title={language.t("livePreview.console.copy")}
                      icon={<IconV2 name="outline-copy" size="small" />}
                    />
                  </div>
                </div>
                <div class="min-h-0 flex-1 overflow-y-auto pt-2 font-mono text-[11px] leading-relaxed text-v2-text-text-base">
                  <Show
                    when={serverLogs().length > 0}
                    fallback={<div class="text-v2-text-text-muted italic">{language.t("livePreview.console.empty")}</div>}
                  >
                    <For each={serverLogs()}>
                      {(line) => <div class="whitespace-pre-wrap break-all">{line}</div>}
                    </For>
                  </Show>
                </div>
              </div>
            </Show>
          </div>
        </Show>
      </div>

    </div>
  )
}
