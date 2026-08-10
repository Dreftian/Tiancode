import { createEffect, createSignal, onCleanup, Show } from "solid-js"
import { useLanguage } from "@/context/language"
import { usePlatform } from "@/context/platform"
import { useSettings } from "@/context/settings"
import "./preview-panel.css"

// Navegador interno: panel flotante con un <webview> para ver apps y sitios
// web en tiempo real (por ejemplo, el servidor de desarrollo del proyecto).
// El elemento se crea dinámicamente porque "webview" no está en los tipos JSX;
// los eventos del navegador llegan por addEventListener.

// webContentsId del guest, publicado para que el botón de captura de pantalla
// pueda fotografiar lo que muestra el navegador interno.
export const [previewWebContentsId, setPreviewWebContentsId] = createSignal<number | undefined>(undefined)

// No hay una URL por defecto útil en producción (localhost:5173 solo existe
// en dev); el panel se abre vacío y el usuario navega a donde quiera.
const DEFAULT_URL = ""

export const normalizeUrl = (value: string) => {
  const trimmed = value.trim()
  if (!trimmed) return trimmed
  if (/^https?:\/\//i.test(trimmed)) return trimmed
  return `https://${trimmed}`
}

export const supportsPreviewPanel = (platform: "web" | "desktop") => platform === "desktop"

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
  const [open, setOpen] = createSignal(false)
  const [url, setUrl] = createSignal(DEFAULT_URL)
  const [input, setInput] = createSignal(DEFAULT_URL)
  const [loading, setLoading] = createSignal(false)
  const [canGoBack, setCanGoBack] = createSignal(false)
  const [canGoForward, setCanGoForward] = createSignal(false)
  const [pageTitle, setPageTitle] = createSignal("")
  let container: HTMLDivElement | undefined
  let webview: WebviewElement | undefined
  // URL con la que se abre el webview; capturada en el toggle (no reactiva)
  // para que el effect de creación solo dependa de open().
  let initialUrl = DEFAULT_URL

  const syncState = () => {
    if (!webview) return
    setLoading(webview.isLoading())
    setCanGoBack(webview.canGoBack())
    setCanGoForward(webview.canGoForward())
    setUrl(webview.getURL() || url())
    setPageTitle(webview.getTitle())
  }

  // The container only exists while the panel is open, so the webview must be
  // created reactively (onMount runs once, before the first open). Closing the
  // panel disposes the element and stops the guest page.
  createEffect(() => {
    if (!supportsPreviewPanel(platform.platform) || !open() || !container) return
    const element = document.createElement("webview") as unknown as WebviewElement
    // Electron registers the custom element only when webviewTag is enabled.
    // Keep the renderer safe if a desktop embedder disables it.
    if (typeof element.getWebContentsId !== "function") {
      setOpen(false)
      return
    }
    element.setAttribute("partition", "persist:preview")
    if (initialUrl) element.setAttribute("src", initialUrl)
    element.setAttribute("webpreferences", "contextIsolation=yes, nodeIntegration=no, sandbox=yes")
    element.style.width = "100%"
    element.style.height = "100%"
    container.appendChild(element)
    webview = element
    // getWebContentsId solo está disponible tras el evento dom-ready del
    // webview; llamarlo antes lanza "The WebView must be attached to the DOM
    // and the dom-ready event emitted before this method can be called".
    const onDomReady = () => setPreviewWebContentsId(element.getWebContentsId())
    element.addEventListener("dom-ready", onDomReady)
    const onTitleUpdate = () => setPageTitle(element.getTitle())
    element.addEventListener("did-navigate", syncState)
    element.addEventListener("did-navigate-in-page", syncState)
    const onStartLoading = () => setLoading(true)
    element.addEventListener("did-start-loading", onStartLoading)
    element.addEventListener("did-stop-loading", syncState)
    element.addEventListener("page-title-updated", onTitleUpdate)
    onCleanup(() => {
      element.removeEventListener("dom-ready", onDomReady)
      element.removeEventListener("did-navigate", syncState)
      element.removeEventListener("did-navigate-in-page", syncState)
      element.removeEventListener("did-start-loading", onStartLoading)
      element.removeEventListener("did-stop-loading", syncState)
      element.removeEventListener("page-title-updated", onTitleUpdate)
      element.remove()
      webview = undefined
      setPreviewWebContentsId(undefined)
    })
  })

  const navigate = (value: string) => {
    const target = normalizeUrl(value)
    if (!target) return
    setInput(target)
    setUrl(target)
    webview?.loadURL(target).catch(() => {})
  }

  const toggle = () => {
    if (open()) {
      setOpen(false)
      return
    }
    initialUrl = url()
    setOpen(true)
    // Al abrir con la web ya cargada, refresca el estado de navegación.
    requestAnimationFrame(syncState)
  }

  return (
    <Show when={supportsPreviewPanel(platform.platform) && settings.general.showBrowser()}>
      <>
      <Show when={!open()}>
        <button
          type="button"
          class="preview-toggle"
          data-preview-toggle
          onClick={toggle}
          aria-label={language.t("preview.open")}
          title={language.t("preview.open")}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="10" />
            <line x1="2" y1="12" x2="22" y2="12" />
            <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
          </svg>
        </button>
      </Show>
      <Show when={open()}>
        <div class="preview-panel" data-preview-panel role="region" aria-label={language.t("preview.title")}>
          <div class="preview-bar">
            <button
              type="button"
              class="preview-btn"
              disabled={!canGoBack()}
              onClick={() => webview?.goBack()}
              aria-label={language.t("preview.back")}
            >
              ←
            </button>
            <button
              type="button"
              class="preview-btn"
              disabled={!canGoForward()}
              onClick={() => webview?.goForward()}
              aria-label={language.t("preview.forward")}
            >
              →
            </button>
            <button
              type="button"
              class="preview-btn"
              onClick={() => webview?.reload()}
              aria-label={language.t("preview.reload")}
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
              placeholder={language.t("preview.url")}
              spellcheck={false}
              aria-label={language.t("preview.url")}
            />
            <button
              type="button"
              class="preview-btn"
              onClick={() => navigate(input())}
              disabled={loading()}
              aria-label={language.t("preview.go")}
            >
              {loading() ? "…" : "↵"}
            </button>
            <button
              type="button"
              class="preview-btn preview-btn-close"
              onClick={() => setOpen(false)}
              aria-label={language.t("preview.close")}
            >
              ✕
            </button>
          </div>
          <div class="preview-status">
            <span>{pageTitle() || url() || language.t("preview.url")}</span>
          </div>
          <div class="preview-webview" ref={container} />
        </div>
      </Show>
      </>
    </Show>
  )
}
