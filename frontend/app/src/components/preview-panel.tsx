import { createSignal, onCleanup, onMount, Show } from "solid-js"
import { useLanguage } from "@/context/language"
import "./preview-panel.css"

// Navegador interno: panel flotante con un <webview> para ver apps y sitios
// web en tiempo real (por ejemplo, el servidor de desarrollo del proyecto).
// El elemento se crea dinámicamente porque "webview" no está en los tipos JSX;
// los eventos del navegador llegan por addEventListener.

const DEFAULT_URL = "http://localhost:5173"

const normalizeUrl = (value: string) => {
  const trimmed = value.trim()
  if (!trimmed) return trimmed
  if (/^https?:\/\//i.test(trimmed)) return trimmed
  return `https://${trimmed}`
}

export function PreviewPanel() {
  const language = useLanguage()
  const [open, setOpen] = createSignal(false)
  const [url, setUrl] = createSignal(DEFAULT_URL)
  const [input, setInput] = createSignal(DEFAULT_URL)
  const [loading, setLoading] = createSignal(false)
  const [canGoBack, setCanGoBack] = createSignal(false)
  const [canGoForward, setCanGoForward] = createSignal(false)
  const [pageTitle, setPageTitle] = createSignal("")
  let container: HTMLDivElement | undefined
  let webview: Electron.WebviewTag | undefined

  const syncState = () => {
    if (!webview || webview.isDestroyed?.()) return
    setLoading(webview.isLoading())
    setCanGoBack(webview.canGoBack())
    setCanGoForward(webview.canGoForward())
    setUrl(webview.getURL() || url())
    setPageTitle(webview.getTitle())
  }

  onMount(() => {
    if (!container) return
    const element = document.createElement("webview")
    element.setAttribute("partition", "persist:preview")
    element.setAttribute("src", url())
    element.setAttribute("webpreferences", "contextIsolation=yes, nodeIntegration=no, sandbox=yes")
    element.setAttribute("allowpopups", "false")
    element.style.width = "100%"
    element.style.height = "100%"
    container.appendChild(element)
    webview = element as unknown as Electron.WebviewTag
    element.addEventListener("did-navigate", syncState)
    element.addEventListener("did-navigate-in-page", syncState)
    element.addEventListener("did-start-loading", () => setLoading(true))
    element.addEventListener("did-stop-loading", syncState)
    element.addEventListener("page-title-updated", () => setPageTitle(element.getTitle()))
    onCleanup(() => {
      element.removeEventListener("did-navigate", syncState)
      element.removeEventListener("did-navigate-in-page", syncState)
      element.removeEventListener("did-start-loading", () => setLoading(true))
      element.removeEventListener("did-stop-loading", syncState)
      element.removeEventListener("page-title-updated", () => setPageTitle(element.getTitle()))
      element.remove()
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
    setOpen(true)
    // Al abrir con la web ya cargada, refresca el estado de navegación.
    requestAnimationFrame(syncState)
  }

  return (
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
            <span>{pageTitle() || url()}</span>
          </div>
          <div class="preview-webview" ref={container} />
        </div>
      </Show>
    </>
  )
}
