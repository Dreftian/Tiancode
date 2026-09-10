import { createEffect, createSignal, onCleanup, Show } from "solid-js"
import { useLanguage } from "@/context/language"
import { usePlatform } from "@/context/platform"
import { useSettings } from "@/context/settings"
import { welcomePageUrl } from "@/utils/webview-welcome"
import "./preview-panel.css"

// Navegador interno: panel flotante con un <webview> para ver apps y sitios
// web en tiempo real (por ejemplo, el servidor de desarrollo del proyecto).
// El elemento se crea dinámicamente porque "webview" no está en los tipos JSX;
// los eventos del navegador llegan por addEventListener.

// webContentsId del guest, publicado para que el botón de captura de pantalla
// pueda fotografiar lo que muestra el navegador interno.
export const [previewWebContentsId, setPreviewWebContentsId] = createSignal<number | undefined>(undefined)

// Estado de apertura compartido: la vista en vivo (sandbox) cierra el
// navegador flotante cuando el agente navega, para que no compita con el
// panel de código + preview.
export const [previewPanelOpen, setPreviewPanelOpen] = createSignal(false)

// No hay una URL por defecto útil en producción (localhost:5173 solo existe
// en dev); el panel se abre vacío y el usuario navega a donde quiera.
const DEFAULT_URL = ""

export const normalizeUrl = (value: string) => {
  const trimmed = value.trim()
  if (!trimmed) return trimmed
  if (/^https?:\/\//i.test(trimmed)) return trimmed
  // Localhost, loopback IP, or 0.0.0.0 MUST use http:// to prevent SSL protocol errors
  if (/^(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])(:\d+)?(\/.*)?$/i.test(trimmed)) {
    return `http://${trimmed}`
  }
  return `https://${trimmed}`
}

export const supportsPreviewPanel = (platform: "web" | "desktop") => true

const DEV_PORTS = [
  { port: "3000", label: "3000", title: "Port 3000 (React / Next.js / Node)" },
  { port: "5173", label: "5173", title: "Port 5173 (Vite / Svelte / Vue)" },
  { port: "8000", label: "8000", title: "Port 8000 (Python FastAPI / Django / PHP)" },
  { port: "8080", label: "8080", title: "Port 8080 (Go / Rust / Java Spring)" },
  { port: "5000", label: "5000", title: "Port 5000 (Python Flask / .NET)" },
  { port: "8501", label: "8501", title: "Port 8501 (Streamlit)" },
  { port: "7860", label: "7860", title: "Port 7860 (Gradio)" },
  { port: "4321", label: "4321", title: "Port 4321 (Astro)" },
]

// API mínima del elemento <webview> de Electron expuesta al renderer.
type WebviewElement = HTMLElement & {
  loadURL(url: string): Promise<void>
  getURL(): string
  getTitle(): string
  canGoBack(): boolean
  canGoForward(): boolean
  goBack(): void
  goForward(): void
  reload(): void
  isLoading(): boolean
  getWebContentsId(): number
}

export function PreviewPanel() {
  const language = useLanguage()
  const platform = usePlatform()
  const settings = useSettings()
  const [open, setOpen] = [previewPanelOpen, setPreviewPanelOpen]
  const [url, setUrl] = createSignal(DEFAULT_URL)
  const [input, setInput] = createSignal(DEFAULT_URL)
  const [loading, setLoading] = createSignal(false)
  const [canGoBack, setCanGoBack] = createSignal(false)
  const [canGoForward, setCanGoForward] = createSignal(false)
  const [pageTitle, setPageTitle] = createSignal("")
  const [viewport, setViewport] = createSignal<"desktop" | "tablet" | "mobile">("desktop")
  const [loadError, setLoadError] = createSignal<{ errorCode?: number; description?: string } | null>(null)
  let container: HTMLDivElement | undefined
  let webview: WebviewElement | undefined
  let ready = false
  let initialUrl = DEFAULT_URL
  let programmatic = false

  const isDesktop = () => platform.platform === "desktop"

  const syncState = () => {
    if (!webview) return
    setLoading(webview.isLoading())
    setCanGoBack(webview.canGoBack())
    setCanGoForward(webview.canGoForward())
    setUrl(webview.getURL() || url())
    setPageTitle(webview.getTitle())
  }

  const flushPending = () => {
    if (!webview || !ready) return
    const pending = initialUrl
    if (pending && pending !== webview.getURL()) {
      programmatic = true
      void webview.loadURL(pending).catch(() => {})
    }
  }

  const openGuestNavigation = (event: Event) => {
    const url = (event as Event & { url?: string }).url
    if (programmatic || !url || settings.general.browserLinks() !== "system") return
    event.preventDefault()
    platform.openExternal(url)
  }

  createEffect(() => {
    if (!open() || !container) return
    if (!isDesktop()) return

    const element = document.createElement("webview") as unknown as WebviewElement
    if (typeof element.getWebContentsId !== "function") {
      return
    }
    ready = false
    element.setAttribute("partition", "persist:preview")
    element.setAttribute("src", initialUrl || welcomePageUrl(language.t("preview.empty")))
    element.setAttribute("webpreferences", "contextIsolation=yes, nodeIntegration=no, sandbox=yes")
    element.style.position = "absolute"
    element.style.inset = "0"
    element.style.width = "100%"
    element.style.height = "100%"
    element.style.border = "none"
    container.appendChild(element)
    webview = element

    const onDomReady = () => {
      ready = true
      setPreviewWebContentsId(element.getWebContentsId())
      flushPending()
    }
    element.addEventListener("dom-ready", onDomReady)
    const onTitleUpdate = () => setPageTitle(element.getTitle())
    element.addEventListener("did-navigate", syncState)
    element.addEventListener("did-navigate-in-page", syncState)
    const onStartLoading = () => {
      programmatic = false
      setLoading(true)
      setLoadError(null)
    }
    const onFailLoad = (event: any) => {
      if (event.errorCode === -3) return // ERR_ABORTED
      setLoading(false)
      setLoadError({ errorCode: event.errorCode, description: event.errorDescription })
    }
    element.addEventListener("did-start-loading", onStartLoading)
    element.addEventListener("did-stop-loading", syncState)
    element.addEventListener("did-fail-load", onFailLoad)
    element.addEventListener("page-title-updated", onTitleUpdate)
    element.addEventListener("will-navigate", openGuestNavigation)
    element.addEventListener("new-window", openGuestNavigation)

    onCleanup(() => {
      element.removeEventListener("dom-ready", onDomReady)
      element.removeEventListener("did-navigate", syncState)
      element.removeEventListener("did-navigate-in-page", syncState)
      element.removeEventListener("did-start-loading", onStartLoading)
      element.removeEventListener("did-stop-loading", syncState)
      element.removeEventListener("did-fail-load", onFailLoad)
      element.removeEventListener("page-title-updated", onTitleUpdate)
      element.removeEventListener("will-navigate", openGuestNavigation)
      element.removeEventListener("new-window", openGuestNavigation)
      element.remove()
      webview = undefined
      ready = false
      setPreviewWebContentsId(undefined)
    })
  })

  const navigate = (value: string) => {
    const target = normalizeUrl(value)
    if (!target) return
    setLoadError(null)
    setInput(target)
    setUrl(target)
    if (!webview) return
    programmatic = true
    if (ready) void webview.loadURL(target).catch(() => {})
    else webview.setAttribute("src", target)
  }

  const navigatePort = (port: string) => {
    navigate(`http://localhost:${port}`)
  }

  const handleReload = () => {
    setLoadError(null)
    if (webview) {
      webview.reload()
      return
    }
    if (url()) {
      const current = url()
      setUrl("")
      setTimeout(() => setUrl(current), 50)
    }
  }

  return (
    <Show when={settings.general.showBrowser() && open()}>
      <div class="preview-panel" data-preview-panel role="region" aria-label={language.t("preview.title")}>
        <div class="preview-bar">
          <button
            type="button"
            class="preview-btn"
            disabled={!canGoBack()}
            onClick={() => webview?.goBack()}
            aria-label={language.t("preview.back")}
            title="Atrás"
          >
            ←
          </button>
          <button
            type="button"
            class="preview-btn"
            disabled={!canGoForward()}
            onClick={() => webview?.goForward()}
            aria-label={language.t("preview.forward")}
            title="Adelante"
          >
            →
          </button>
          <button
            type="button"
            class="preview-btn"
            onClick={handleReload}
            aria-label={language.t("preview.reload")}
            title="Recargar"
          >
            ⟳
          </button>
          <input
            class="preview-input"
            value={input()}
            onInput={(event) => setInput(event.currentTarget.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") navigate(input())
            }}
            placeholder="http://localhost:3000 o URL del sitio web"
            spellcheck={false}
            aria-label={language.t("preview.url")}
          />
          <button
            type="button"
            class="preview-btn preview-btn-go"
            onClick={() => navigate(input())}
            disabled={loading()}
            aria-label={language.t("preview.go")}
            title="Navegar"
          >
            {loading() ? "…" : "↵"}
          </button>

          {/* Viewport switcher */}
          <div class="preview-viewport-controls">
            <button
              type="button"
              class="preview-viewport-btn"
              data-active={viewport() === "desktop" || undefined}
              onClick={() => setViewport("desktop")}
              title="Escritorio (100%)"
            >
              🖥️
            </button>
            <button
              type="button"
              class="preview-viewport-btn"
              data-active={viewport() === "tablet" || undefined}
              onClick={() => setViewport("tablet")}
              title="Tablet (768px)"
            >
              📱
            </button>
            <button
              type="button"
              class="preview-viewport-btn"
              data-active={viewport() === "mobile" || undefined}
              onClick={() => setViewport("mobile")}
              title="Móvil (375px)"
            >
              📲
            </button>
          </div>

          <button
            type="button"
            class="preview-btn preview-btn-close"
            onClick={() => setOpen(false)}
            aria-label={language.t("preview.close")}
            title="Cerrar vista previa"
          >
            ✕
          </button>
        </div>

        {/* Quick Dev Server Ports Bar */}
        <div class="preview-ports-bar">
          <span class="preview-ports-label">Puertos dev:</span>
          {DEV_PORTS.map((dp) => (
            <button
              type="button"
              class="preview-port-pill"
              onClick={() => navigatePort(dp.port)}
              title={dp.title}
            >
              :{dp.label}
            </button>
          ))}
        </div>

        <div class="preview-status">
          <span class="truncate">{pageTitle() || url() || "Vista previa universal"}</span>
          <Show when={loading()}>
            <span class="preview-loading-tag">Cargando...</span>
          </Show>
        </div>

        <div class="preview-viewport-container" data-viewport={viewport()}>
          <div class="preview-webview" ref={container}>
            {/* Fallback iframe for Web mode */}
            <Show when={!isDesktop() && url()}>
              <iframe
                src={url()}
                class="preview-fallback-iframe"
                sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals"
              />
            </Show>

            {/* Error Recovery Overlay */}
            <Show when={loadError()}>
              <div class="preview-error-overlay">
                <div class="preview-error-card">
                  <span class="preview-error-icon">⚡</span>
                  <h3>Servidor no detectado en este puerto</h3>
                  <p>
                    No se pudo conectar a <code>{url()}</code> ({loadError()?.description || "Conexión rechazada"}).
                  </p>
                  <p class="preview-error-hint">
                    Asegúrate de iniciar el servidor de desarrollo de tu proyecto (ej: <code>npm run dev</code>, <code>python main.py</code>, <code>cargo run</code>, <code>go run main.go</code>).
                  </p>
                  <div class="preview-error-actions">
                    <button type="button" class="preview-retry-btn" onClick={handleReload}>
                      ⟳ Reintentar conexión
                    </button>
                  </div>
                </div>
              </div>
            </Show>
          </div>
        </div>
      </div>
    </Show>
  )
}
