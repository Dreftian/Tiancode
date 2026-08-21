import { IconButtonV2 } from "@tiancode-ai/ui/v2/icon-button-v2"
import { Icon as IconV2 } from "@tiancode-ai/ui/v2/icon"
import { SelectV2 } from "@tiancode-ai/ui/v2/select-v2"
import { createEffect, createSignal, onCleanup, onMount, Show } from "solid-js"
import { createStore } from "solid-js/store"
import { Persist, persisted } from "@/utils/persist"
import { normalizeUrl } from "@/components/preview-panel"
import { useLanguage } from "@/context/language"
import { usePlatform } from "@/context/platform"
import { useSDK } from "@/context/sdk"
import { useServer } from "@/context/server"
import { authTokenFromCredentials } from "@/utils/server"
import type { PreviewViewState } from "@/context/platform"
import { previewActionUrl, previewStatusUrl, type PreviewAction } from "./live-preview-url"
import { PREVIEW_RETRY_MAX_ATTEMPTS, isRetryablePreviewLoadFailure, previewRetryDelay, samePreviewUrl } from "./live-preview-retry"
import { iframePreviewUrl, usesIframePreview } from "./live-preview-transport"
import { orientedPreviewDimensions } from "./preview-experience"
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
  desktop: { width: 1440, height: 900 },
  laptop: { width: 1280, height: 800 },
  tv: { width: 1920, height: 1080 },
  tablet: { width: 768, height: 1024 },
  androidTablet: { width: 800, height: 1280 },
  mobile: { width: 390, height: 844 },
  androidPhone: { width: 412, height: 915 },
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
  onManagedTarget?: (url: string | undefined) => void
  onCapture?: (file: File) => void
  onOpenSource?: (path: string) => void
  externalDevice?: () => "fluid" | "mobile" | "tablet" | "laptop" | undefined
  onDeviceChange?: (mode: "fluid" | "mobile" | "tablet" | "laptop") => void
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

  createEffect(() => {
    const ext = props.externalDevice?.()
    if (!ext) return
    if (ext === "mobile" && deviceId() !== "mobile") {
      setDeviceId("mobile")
      setZoom(1)
    } else if (ext === "tablet" && deviceId() !== "tablet") {
      setDeviceId("tablet")
      setZoom(1)
    } else if (ext === "laptop" && deviceId() !== "laptop") {
      setDeviceId("laptop")
      setZoom(1)
    } else if (ext === "fluid" && deviceId() !== "fit") {
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
    if (id === "mobile" || id === "androidPhone") return 12
    if (id === "tablet" || id === "androidTablet") return 10
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
        iframe.contentWindow?.location.reload()
      } catch {
        // Cross-origin fallback: replace source with cache-busting timestamp
      }
      try {
        const u = new URL(target)
        u.searchParams.set("_t", String(Date.now()))
        iframe.src = u.toString()
      } catch {
        iframe.src = target
      }
      return
    }
    setIframeUrl(undefined)
    window.requestAnimationFrame(() => setIframeUrl(target))
  }

  const completeIframeLoad = () => {
    const target = iframeUrl()
    if (!target) return
    setIframeLoading(false)
    updateIframeState(target, false)
    retryAttempts = 0
    failedUrl = undefined
    clearRetry()
    setFail(null)
  }

  const failIframeLoad = () => {
    const target = iframeUrl()
    if (!target) return
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
  const fetchDevServer = async () => {
    const dir = devServerDirectory()
    const headers = devServerHeaders()
    const url = server.current?.http.url
    if (!dir || !url) return
    try {
      const res = await fetch(previewStatusUrl(url, dir), { headers })
      if (res.ok) setDevServer((await res.json()) as DevServerState)
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
      if (res.ok) setDevServer((await res.json()) as DevServerState)
    } catch {
      // Sin servidor del agente: la UI queda como está.
    }
  }

  onMount(() => {
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
    const handleReload = (event?: Event) => {
      const customEvent = event as CustomEvent<{ path?: string }> | undefined
      const path = customEvent?.detail?.path
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
    }
    window.addEventListener("tiancode:preview-reload", handleReload)

    if (!view || !surface) {
      onCleanup(() => {
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

  // Inicia el preview gestionado cuando el agente crea una entrada web ejecutable.
  createEffect(() => {
    const key = props.autoStartKey?.()
    const status = devServer()?.status
    if (!key || key === lastAutoStartKey || status === "starting" || status === "ready") return
    lastAutoStartKey = key
    void devServerAction("start")
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
    const target = normalizeUrl(urlInput())
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
      }
    }
    return {
      width: `${device.width}px`,
      height: `${device.height}px`,
      left: `${viewport.frame}px`,
      top: `${viewport.frame}px`,
      transform: `scale(${viewport.scale})`,
      "transform-origin": "top left",
    }
  }

  const deviceOptions = () => [
    { id: "fit" as const, label: language.t("livePreview.fit") },
    { id: "mobile" as const, label: `${language.t("livePreview.device.mobile")} 390×844` },
    { id: "androidPhone" as const, label: `${language.t("livePreview.device.android")} 412×915` },
    { id: "tablet" as const, label: `${language.t("livePreview.device.tablet")} 768×1024` },
    { id: "androidTablet" as const, label: `${language.t("livePreview.device.androidTablet")} 800×1280` },
    { id: "tv" as const, label: `${language.t("livePreview.device.tv")} 1920×1080` },
    { id: "desktop" as const, label: `${language.t("livePreview.device.desktop")} 1440×900` },
    { id: "laptop" as const, label: `${language.t("livePreview.device.laptop")} 1280×800` },
    { id: "custom" as const, label: language.t("livePreview.device.custom") },
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
        <span class="max-w-28 shrink truncate text-11-regular text-text-weak">{devServerStatusLabel() ?? language.t("livePreview.fit")}</span>
        <SelectV2
          appearance="base"
          class="w-32 max-w-full shrink"
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
              props.onDeviceChange?.("fluid")
            } else if (option.id === "mobile" || option.id === "androidPhone") {
              props.onDeviceChange?.("mobile")
            } else if (option.id === "tablet" || option.id === "androidTablet") {
              props.onDeviceChange?.("tablet")
            } else if (option.id === "laptop" || option.id === "desktop" || option.id === "tv") {
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
          title="Inspector Visual de Elementos (Diseño a Código)"
          onClick={() => setInspectActive(!inspectActive())}
          class={`flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium border transition-all cursor-pointer ${
            inspectActive()
              ? "bg-cyan-500/20 text-cyan-300 border-cyan-400 shadow-[0_0_8px_rgba(56,189,248,0.3)]"
              : "bg-v2-background-bg-base text-text-weak border-v2-border-border-muted hover:text-text-base hover:border-v2-border-border-strong"
          }`}
        >
          <span>🎯</span>
          <span>Diseño a Código</span>
        </button>

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
          <ToolButton disabled={deviceId() === "fit"} title={language.t("livePreview.zoomOut")} onClick={() => zoomStep(-ZOOM_STEP)}>
            −
          </ToolButton>
          <span class="min-w-10 text-center text-11-regular text-text-weak tabular-nums">
            {Math.round(previewViewport().scale * 100)}%
          </span>
          <ToolButton disabled={deviceId() === "fit"} title={language.t("livePreview.zoomIn")} onClick={() => zoomStep(ZOOM_STEP)}>
            +
          </ToolButton>
        </div>
      </div>

      <Show when={fail()}>
        {(failed) => (
          <div class="flex shrink-0 items-center gap-2 border-b border-v2-border-border-muted px-3 py-1.5 text-11-regular text-[var(--v2-state-fg-danger)]">
            <span class="min-w-0 flex-1 truncate" title={failed().description}>
              {language.t("livePreview.loadFailed", { url: failed().url, description: failed().description })}
            </span>
            <button
              type="button"
              class="shrink-0 text-11-medium text-[var(--v2-state-fg-info)] hover:text-text-base"
              onClick={retryPreview}
            >
              {language.t("livePreview.retry")}
            </button>
            <button
              type="button"
              class="shrink-0 text-text-faint hover:text-text-base"
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
                  deviceId() === "mobile" || deviceId() === "androidPhone"
                    ? "rounded-[1.8rem] ring-4 ring-neutral-800"
                    : deviceId() === "tablet" || deviceId() === "androidTablet"
                      ? "rounded-2xl ring-4 ring-neutral-800"
                      : deviceId() === "tv"
                        ? "rounded-md border-4 border-neutral-900 shadow-2xl"
                        : deviceSize()
                          ? "rounded-lg"
                          : "rounded-none"
                }`}
                style={previewFrameStyle()}
              >
                <Show when={deviceId() === "mobile"}>
                  <div class="pointer-events-none absolute left-1/2 top-1 z-10 h-1.5 w-16 -translate-x-1/2 rounded-full bg-black/80" aria-hidden="true" />
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
                  sandbox="allow-scripts allow-same-origin allow-forms allow-modals allow-downloads"
                  referrerpolicy="no-referrer"
                  class="absolute border-0 bg-white"
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
          <div class="absolute inset-0 flex items-center justify-center px-6 text-center text-12-regular text-text-weak">
            {previewPlaceholder()}
          </div>
        </Show>
      </div>

    </div>
  )
}
