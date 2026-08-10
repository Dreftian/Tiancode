import { sampledChecksum } from "@tiancode-ai/core/util/encode"
import { useFileComponent } from "@tiancode-ai/ui/context/file"
import { Icon as IconV2 } from "@tiancode-ai/ui/v2/icon"
import { IconButtonV2 } from "@tiancode-ai/ui/v2/icon-button-v2"
import { TabsV2 } from "@tiancode-ai/ui/v2/tabs-v2"
import { createEffect, createMemo, createSignal, onCleanup, onMount, Show } from "solid-js"
import { Dynamic } from "solid-js/web"
import FileTreeV2 from "@/components/file-tree-v2"
import { normalizeUrl, supportsPreviewPanel } from "@/components/preview-panel"
import { useFile } from "@/context/file"
import { useLanguage } from "@/context/language"
import { usePlatform } from "@/context/platform"
import { useSDK } from "@/context/sdk"
import { useSync } from "@/context/sync"
import { useSessionLayout } from "@/pages/session/session-layout"
import { ScrollView } from "@tiancode-ai/ui/scroll-view"

const LIVE_VIEW_URL = "http://127.0.0.1:8790/"
const LIVE_VIEW_CHECK_MS = 3000
// URL de la app servida por el propio live server cuando la raíz de la sesión
// tiene index.html y el agente no fijó un preview_url externo.
const PREVIEW_DEFAULT_URL = `${LIVE_VIEW_URL}preview/`
// URL de un servidor de desarrollo local ("Local: http://localhost:5173") en
// los logs que publica el agente; se detecta para navegar el panel solo.
const DEV_SERVER_URL_RE = /https?:\/\/(?:localhost|127\.0\.0\.1):\d{2,5}(?:[/?#][^\s"']*)?/i

// Campos del snapshot del live server que este panel consume.
type SnapshotPayload = {
  preview_url?: string | null
  preview_default?: string | null
  current_file?: string | null
  logs?: { line?: string }[]
}

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

// URL que el servidor quiere mostrar: la fijada por el agente (set_preview) o,
// si no, el preview local (/preview/) para sesiones web con index.html.
function resolveReportedUrl(snapshot: SnapshotPayload | undefined) {
  if (!snapshot) return undefined
  if (snapshot.preview_url) return snapshot.preview_url
  if (snapshot.preview_default) return `${LIVE_VIEW_URL}${snapshot.preview_default.replace(/^\//, "")}`
  return undefined
}

// Primer servidor de desarrollo local mencionado en los logs del agente
// (p. ej. "Local: http://localhost:5173" al arrancar npm run dev).
function findDevServerUrl(snapshot: SnapshotPayload | undefined) {
  for (const entry of snapshot?.logs ?? []) {
    const match = DEV_SERVER_URL_RE.exec(entry.line ?? "")
    if (match) return match[0].replace(/\/$/, "")
  }
  return undefined
}

function SandboxCodePanel(props: { followPath?: string }) {
  const file = useFile()
  const language = useLanguage()
  const fileComponent = useFileComponent()
  const [selectedPath, setSelectedPath] = createSignal<string>()
  // Una selección manual del usuario gana sobre el seguimiento del agente.
  const [pinned, setPinned] = createSignal(false)
  const state = createMemo(() => {
    const path = selectedPath()
    if (!path) return
    return file.get(path)
  })
  const contents = createMemo(() => state()?.content?.content ?? "")
  const cacheKey = createMemo(() => sampledChecksum(contents()))

  const selectFile = (path: string) => {
    setSelectedPath(path)
    void file.load(path)
  }

  // Sigue al agente: cuando reporta el archivo que está editando
  // (current_file del snapshot), se selecciona solo, salvo selección manual.
  let lastFollowed = ""
  createEffect(() => {
    const path = props.followPath
    if (!path || pinned() || path === lastFollowed) return
    lastFollowed = path
    selectFile(path)
  })

  // El árbol vive en el contexto de archivos del workspace: si nunca se abrió
  // el navegador de archivos principal, la raíz no está cargada ni expandida y
  // el panel se ve vacío. Aquí se siembra al montar (idempotente) y se vuelve a
  // sembrar cuando cambia el directorio de la sesión (el montaje ocurre antes
  // de que la sesión resuelva su workspace, así que onMount solo no basta).
  const sdk = useSDK()
  createEffect(() => {
    if (!sdk().directory) return
    void file.tree.list("")
    file.tree.expand("")
  })
  onMount(() => {
    void file.tree.list("")
    file.tree.expand("")
  })

  return (
    <div class="grid size-full min-h-0 grid-cols-[minmax(10rem,0.42fr)_minmax(0,1fr)]">
      <div class="flex min-h-0 flex-col border-r border-v2-border-border-muted">
        <div class="flex h-8 shrink-0 items-center border-b border-v2-border-border-muted px-2 text-11-medium text-text-weak">
          {language.t("liveView.code.workspace")}
        </div>
        <ScrollView class="min-h-0 flex-1">
          <FileTreeV2
            active={selectedPath()}
            draggable={false}
            onFileClick={(node) => {
              setPinned(true)
              selectFile(node.path)
            }}
          />
        </ScrollView>
      </div>
      <div class="min-h-0 min-w-0">
        <Show
          when={selectedPath()}
          fallback={
            <div class="flex size-full items-center justify-center px-6 text-center text-13-regular text-text-weak">
              {language.t("session.files.selectToOpen")}
            </div>
          }
        >
          <Show
            when={state()?.loaded}
            fallback={
              <Show
                when={!state()?.error}
                fallback={
                  <div role="status" class="flex size-full items-center justify-center px-6 text-center text-13-regular text-text-weak">
                    {language.t("liveView.code.unavailable")}
                  </div>
                }
              >
                <div role="status" class="flex size-full items-center justify-center px-6 text-13-regular text-text-weak">
                  {language.t("common.loading")}
                  {language.t("common.loading.ellipsis")}
                </div>
              </Show>
            }
          >
            <ScrollView class="size-full">
              <div class="min-w-max p-3 pb-10">
                <Dynamic
                  component={fileComponent}
                  mode="text"
                  file={{
                    name: selectedPath() ?? "",
                    contents: contents(),
                    cacheKey: cacheKey(),
                  }}
                  class="select-text"
                />
              </div>
            </ScrollView>
          </Show>
        </Show>
      </div>
    </div>
  )
}

// Navegador del panel "App": un <webview> de Electron (partición
// "persist:live-view") con barra de direcciones estilo navegador. Es la
// "vista en vivo" real: muestra la app en desarrollo, no el dashboard.
// Cuando el agente reporta una URL (set_preview) o arranca un dev server
// visible en los logs, el panel navega solo (targetUrl).
function LiveViewBrowser(props: {
  targetUrl?: () => string | undefined
  onCapture?: (file: File) => void
}) {
  const language = useLanguage()
  const platform = usePlatform()
  const [url, setUrl] = createSignal("")
  const [input, setInput] = createSignal("")
  const [loading, setLoading] = createSignal(false)
  const [canGoBack, setCanGoBack] = createSignal(false)
  const [canGoForward, setCanGoForward] = createSignal(false)
  const [attached, setAttached] = createSignal(false)
  const [busy, setBusy] = createSignal(false)
  let container: HTMLDivElement | undefined
  let webview: WebviewElement | undefined
  // URL pendiente: el webview solo existe con la pestaña App abierta; si el
  // agente navega mientras se ve otra pestaña, se carga al recrearlo.
  const pendingUrlRef = { current: "" }
  // La navegación manual (URL tecleada, atrás/adelante) gana sobre la
  // auto-detección del dev server; una URL nueva del agente la reanuda.
  let manualNav = false
  let lastTargetUrl: string | undefined

  const syncState = () => {
    if (!webview) return
    setLoading(webview.isLoading())
    setCanGoBack(webview.canGoBack())
    setCanGoForward(webview.canGoForward())
    setUrl(webview.getURL() || url())
    setInput(webview.getURL() || url())
  }

  // El webview se crea dinámicamente (el elemento no está en los tipos JSX);
  // los eventos del navegador llegan por addEventListener, como en el
  // navegador interno (preview-panel).
  createEffect(() => {
    if (!supportsPreviewPanel(platform.platform) || !container) return
    const element = document.createElement("webview") as unknown as WebviewElement
    if (typeof element.getWebContentsId !== "function") return
    element.setAttribute("partition", "persist:live-view")
    if (pendingUrlRef.current) element.setAttribute("src", pendingUrlRef.current)
    element.setAttribute("webpreferences", "contextIsolation=yes, nodeIntegration=no, sandbox=yes")
    element.style.width = "100%"
    element.style.height = "100%"
    container.appendChild(element)
    webview = element
    const onDomReady = () => {
      setAttached(true)
      syncState()
    }
    element.addEventListener("dom-ready", onDomReady)
    element.addEventListener("did-navigate", syncState)
    element.addEventListener("did-navigate-in-page", syncState)
    element.addEventListener("did-start-loading", () => setLoading(true))
    element.addEventListener("did-stop-loading", syncState)
    onCleanup(() => {
      element.removeEventListener("dom-ready", onDomReady)
      element.removeEventListener("did-navigate", syncState)
      element.removeEventListener("did-navigate-in-page", syncState)
      element.remove()
      webview = undefined
      setAttached(false)
    })
  })

  const navigateTo = (target: string) => {
    if (!target) return
    pendingUrlRef.current = target
    setInput(target)
    setUrl(target)
    if (webview) void webview.loadURL(target).catch(() => {})
  }

  // URL del agente / dev server detectado: navega y reanuda la auto-navegación.
  createEffect(() => {
    const target = props.targetUrl?.()
    if (!target || target === lastTargetUrl) return
    lastTargetUrl = target
    manualNav = false
    navigateTo(target)
  })

  const navigateFromInput = () => {
    const target = normalizeUrl(input())
    if (!target) return
    manualNav = true
    navigateTo(target)
  }

  const goBack = () => {
    manualNav = true
    webview?.goBack()
  }

  const goForward = () => {
    manualNav = true
    webview?.goForward()
  }

  const capture = async () => {
    if (busy() || !attached()) return
    setBusy(true)
    try {
      const file = await platform.captureScreenshot?.("liveView")
      if (file) props.onCapture?.(file)
    } catch {
      // Sin captura disponible: la UI sigue usable.
    } finally {
      setBusy(false)
    }
  }

  return (
    <div class="flex size-full min-h-0 flex-col">
      <div class="flex h-9 shrink-0 items-center gap-1 border-b border-v2-border-border-muted px-1.5">
        <IconButtonV2
          type="button"
          variant="ghost-muted"
          size="small"
          disabled={!canGoBack()}
          onClick={goBack}
          aria-label={language.t("preview.back")}
          title={language.t("preview.back")}
          icon={<IconV2 name="arrow-left" />}
        />
        <IconButtonV2
          type="button"
          variant="ghost-muted"
          size="small"
          disabled={!canGoForward()}
          onClick={goForward}
          aria-label={language.t("preview.forward")}
          title={language.t("preview.forward")}
          icon={<IconV2 name="arrow-right" />}
        />
        <IconButtonV2
          type="button"
          variant="ghost-muted"
          size="small"
          onClick={() => webview?.reload()}
          aria-label={language.t("liveView.refresh")}
          title={language.t("liveView.refresh")}
          icon={<IconV2 name="reset" />}
        />
        <input
          class="h-7 min-w-0 flex-1 rounded-md border border-v2-border-border-muted bg-v2-background-bg-base px-2 text-12-regular text-text-base outline-none focus:border-v2-border-border-strong"
          value={input()}
          onInput={(event) => setInput(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") navigateFromInput()
          }}
          placeholder={language.t("liveView.url")}
          spellcheck={false}
          aria-label={language.t("liveView.url")}
        />
        <Show when={url()}>
          <IconButtonV2
            type="button"
            variant="ghost-muted"
            size="small"
            onClick={() => platform.openExternal(url())}
            aria-label={language.t("liveView.openExternal")}
            title={language.t("liveView.openExternal")}
            icon={<IconV2 name="outline-square-arrow" />}
          />
        </Show>
        <IconButtonV2
          type="button"
          variant="ghost-muted"
          size="small"
          disabled={!attached() || busy()}
          onClick={() => void capture()}
          aria-label={language.t("liveView.capture")}
          title={language.t("liveView.capture")}
          icon={<IconV2 name="monitor" />}
        />
      </div>
      <div class="min-h-0 flex-1" ref={container} />
    </div>
  )
}

export function LiveViewPanel(props: { onCapture?: (file: File) => void }) {
  const language = useLanguage()
  const platform = usePlatform()
  const { view } = useSessionLayout()
  const sync = useSync()
  const sdk = useSDK()
  const [reloadKey, setReloadKey] = createSignal(1)
  const [unavailable, setUnavailable] = createSignal(false)
  const [tab, setTab] = createSignal(view().liveView.tab())
  // Último snapshot del live server (preview_url, logs, current_file…).
  const [snapshot, setSnapshot] = createSignal<SnapshotPayload | undefined>(undefined)
  // URL detectada en los logs del agente (solo informativa, la navegación la
  // hace LiveViewBrowser con targetUrl).
  const [detectedUrl, setDetectedUrl] = createSignal<string | undefined>(undefined)
  // El aviso descartado con la X no vuelve a aparecer para esa misma URL
  // (el poll lo re-derivaría en el siguiente snapshot).
  const [dismissedUrl, setDismissedUrl] = createSignal<string | undefined>(undefined)
  let tabSelectedLocally = false

  // El proyecto actual del workspace: es lo que la vista en vivo debe reflejar.
  // sdk().directory ES el directorio de la sesión activa (el SDKProvider de la
  // página se inicializa con session.directory); sync().project?.worktree es el
  // proyecto GLOBAL (p. ej. C:\) y NO vale para la sesión.
  const worktree = createMemo(() => sdk().directory || sync().project?.worktree)

  // URL que el panel debe mostrar: la del agente (set_preview o preview local)
  // o, si no hay, el primer dev server detectado en los logs. La detección
  // queda suprimida mientras el usuario navegue a mano (manualNav en el
  // navegador); una URL nueva del agente la reanuda.
  const serverTarget = createMemo(() => {
    const reported = resolveReportedUrl(snapshot())
    if (reported) return reported
    return findDevServerUrl(snapshot())
  })

  // Aviso transitorio cuando la navegación vino de la detección de logs (no
  // de una URL fijada por el agente); se descarta con la X.
  createEffect(() => {
    const target = serverTarget()
    const reported = resolveReportedUrl(snapshot())
    const detected = target && !reported ? target : undefined
    setDetectedUrl(detected === dismissedUrl() ? undefined : detected)
  })

  // Refleja el proyecto actual: si el servidor aún no tiene sesión, crea una
  // con la raíz del workspace; si la sesión actual del servidor es la del panel
  // (label "Vista en vivo") y apunta a otra raíz (cambio de sesión/proyecto),
  // la corrige. Nunca toca una sesión creada por el agente.
  // El dashboard responde con Access-Control-Allow-Origin: *, por eso el fetch
  // es normal (no-cors devolvería respuestas opaque e ilegibles).
  const syncWorkspaceSession = () => {
    const root = worktree()
    if (!root || root === "main") return
    const controller = new AbortController()
    const timer = window.setTimeout(() => controller.abort(), LIVE_VIEW_CHECK_MS)
    void fetch(`${LIVE_VIEW_URL}api/snapshot`, { signal: controller.signal })
      .then((res) => (res.ok ? res.json() : undefined))
      .then((payload) => {
        setSnapshot(payload?.session)
        const current = payload?.session
        if (!current) {
          // Sin sesión: crear con el workspace actual.
          return createPanelSession(root)
        }
        const sameRoot = typeof current.root === "string" && current.root.replace(/\\+$/, "") === root.replace(/\\+$/, "")
        const isPanelSession = current.label === "Vista en vivo"
        if (sameRoot || !isPanelSession) return
        // Sesión del panel con raíz vieja: corregir al workspace actual.
        return createPanelSession(root)
      })
      .catch(() => undefined)
      .finally(() => window.clearTimeout(timer))
  }

  const createPanelSession = (root: string) =>
    fetch(`${LIVE_VIEW_URL}api/create_session`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ root_text: root, mode: "web", label: "Vista en vivo" }),
    })
  onMount(syncWorkspaceSession)

  // El worktree puede tardar en resolverse al arrancar (proyecto aún sin
  // cargar): se reintenta mientras el panel esté montado, sin molestar si el
  // agente ya creó su propia sesión.
  const autoSessionTimer = window.setInterval(syncWorkspaceSession, 5_000)
  onCleanup(() => window.clearInterval(autoSessionTimer))

  // Al cambiar de proyecto (p. ej. nueva sesión en otra carpeta), re-sincroniza
  // si el servidor no tiene sesión aún.
  createEffect(() => {
    void worktree()
    const timer = window.setTimeout(syncWorkspaceSession, 800)
    onCleanup(() => window.clearTimeout(timer))
  })

  // Desktop persistence can finish after this panel mounts. Adopt its tab until
  // the person makes a choice, then keep that choice through unrelated layout
  // updates instead of allowing an older persisted value to select Preview again.
  createEffect(() => {
    if (tabSelectedLocally) return
    setTab(view().liveView.tab())
  })

  const selectTab = (next: string) => {
    const value: "preview" | "code" | "devtools" = next === "code" ? "code" : next === "devtools" ? "devtools" : "preview"
    tabSelectedLocally = true
    setTab(value)
    view().liveView.setTab(value)
  }

  let checkTimer: number | undefined
  const checkServer = () => {
    if (checkTimer !== undefined) window.clearTimeout(checkTimer)
    const controller = new AbortController()
    checkTimer = window.setTimeout(() => controller.abort(), LIVE_VIEW_CHECK_MS)
    fetch(LIVE_VIEW_URL, { mode: "no-cors", signal: controller.signal })
      .then(() => setUnavailable(false))
      .catch(() => setUnavailable(true))
      .finally(() => {
        if (checkTimer !== undefined) window.clearTimeout(checkTimer)
        checkTimer = undefined
      })
  }
  onMount(checkServer)
  onCleanup(() => {
    if (checkTimer !== undefined) window.clearTimeout(checkTimer)
  })

  const reload = () => {
    setReloadKey((key) => key + 1)
    checkServer()
  }

  return (
    <aside
      id="live-view-panel"
      role="region"
      aria-label={language.t("liveView.sandbox")}
      class="flex size-full min-h-0 flex-col overflow-hidden rounded-[10px] border border-v2-border-border-muted bg-v2-background-bg-base shadow-[var(--v2-elevation-raised)]"
    >
      <div class="flex h-10 shrink-0 items-center gap-2 border-b border-v2-border-border-muted bg-v2-background-bg-base px-2">
        <div class="flex items-center gap-1.5 text-13-medium text-text-base select-none">
          <span class="size-1.5 rounded-full bg-[var(--v2-state-fg-success)]" aria-hidden="true" />
          {language.t("liveView.sandbox")}
        </div>
        <div class="flex-1" />
        <Show when={tab() === "devtools"}>
          <IconButtonV2
            type="button"
            variant="ghost-muted"
            size="large"
            onClick={reload}
            aria-label={language.t("liveView.refresh")}
            title={language.t("liveView.refresh")}
            icon={<IconV2 name="reset" />}
          />
        </Show>
        <IconButtonV2
          type="button"
          variant="ghost-muted"
          size="large"
          onClick={() => view().liveView.close()}
          aria-label={language.t("common.close")}
          title={language.t("common.close")}
          icon={<IconV2 name="xmark-small" />}
        />
      </div>

      <TabsV2
        value={tab()}
        onChange={selectTab}
        class="min-h-0 flex-1"
      >
        <TabsV2.List class="shrink-0 bg-v2-background-bg-base">
          <TabsV2.Trigger value="preview">{language.t("liveView.tab.app")}</TabsV2.Trigger>
          <TabsV2.Trigger value="code">{language.t("liveView.tab.code")}</TabsV2.Trigger>
          <TabsV2.Trigger value="devtools">{language.t("liveView.tab.devTools")}</TabsV2.Trigger>
        </TabsV2.List>
        <TabsV2.Content value="preview" forceMount class="min-h-0 overflow-hidden" hidden={tab() !== "preview"}>
          <Show
            when={supportsPreviewPanel(platform.platform)}
            fallback={
              <div class="flex size-full min-h-0 flex-col">
                <Show when={reloadKey()} keyed>
                  {(_) => (
                    <iframe
                      data-slot="sandbox-live-view"
                      src={LIVE_VIEW_URL}
                      title={language.t("liveView.tab.app")}
                      class="min-h-0 w-full flex-1 border-0 bg-v2-background-bg-base"
                    />
                  )}
                </Show>
                <Show when={unavailable()}>
                  <div class="shrink-0 border-t border-v2-border-border-muted px-3 py-1.5 text-11-regular text-text-faint">
                    {language.t("liveView.unavailable")}
                  </div>
                </Show>
              </div>
            }
          >
            <LiveViewBrowser targetUrl={serverTarget} onCapture={props.onCapture} />
          </Show>
          <Show when={detectedUrl()}>
            {(url) => (
              <div class="flex shrink-0 items-center gap-2 border-t border-v2-border-border-muted px-3 py-1.5 text-11-regular text-text-weak">
                <span class="min-w-0 flex-1 truncate">
                  {language.t("liveView.detectNotice", { url: url() })}
                </span>
                <button
                  type="button"
                  class="shrink-0 text-text-faint hover:text-text-base"
                  onClick={() => {
                    setDismissedUrl(detectedUrl())
                    setDetectedUrl(undefined)
                  }}
                  aria-label={language.t("common.close")}
                >
                  <IconV2 name="xmark-small" size="small" />
                </button>
              </div>
            )}
          </Show>
        </TabsV2.Content>
        <TabsV2.Content value="code" forceMount class="min-h-0 overflow-hidden" hidden={tab() !== "code"}>
          <SandboxCodePanel followPath={snapshot()?.current_file ?? undefined} />
        </TabsV2.Content>
        <TabsV2.Content value="devtools" forceMount class="min-h-0 overflow-hidden" hidden={tab() !== "devtools"}>
          <div class="flex size-full min-h-0 flex-col">
            <Show when={reloadKey()} keyed>
              {(_) => (
                <iframe
                  data-slot="sandbox-live-view"
                  src={LIVE_VIEW_URL}
                  title={language.t("liveView.tab.devTools")}
                  class="min-h-0 w-full flex-1 border-0 bg-v2-background-bg-base"
                />
              )}
            </Show>
            <Show when={unavailable()}>
              <div class="shrink-0 border-t border-v2-border-border-muted px-3 py-1.5 text-11-regular text-text-faint">
                {language.t("liveView.unavailable")}
              </div>
            </Show>
          </div>
        </TabsV2.Content>
      </TabsV2>
    </aside>
  )
}
