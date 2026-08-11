import { sampledChecksum } from "@tiancode-ai/core/util/encode"
import { useFileComponent } from "@tiancode-ai/ui/context/file"
import { ResizeHandle } from "@tiancode-ai/ui/resize-handle"
import { Icon as IconV2 } from "@tiancode-ai/ui/v2/icon"
import { IconButtonV2 } from "@tiancode-ai/ui/v2/icon-button-v2"
import { createEffect, createMemo, createSignal, onCleanup, onMount, Show } from "solid-js"
import { Dynamic } from "solid-js/web"
import { supportsPreviewPanel } from "@/components/preview-panel"
import { useFile } from "@/context/file"
import { useLanguage } from "@/context/language"
import { usePlatform } from "@/context/platform"
import { useSDK } from "@/context/sdk"
import { useSync } from "@/context/sync"
import { useSessionLayout } from "@/pages/session/session-layout"
import { LivePreview } from "@/pages/session/live-preview/live-preview"
import { ScrollView } from "@tiancode-ai/ui/scroll-view"

export const LIVE_VIEW_URL = "http://127.0.0.1:8790/"
const LIVE_VIEW_CHECK_MS = 3000
// URL de un servidor de desarrollo local ("Local: http://localhost:5173") en
// los logs que publica el agente; se detecta para navegar el panel solo.
const DEV_SERVER_URL_RE = /https?:\/\/(?:localhost|127\.0\.0\.1):\d{2,5}(?:[/?#][^\s"']*)?/i
// Ancho del pane de código dentro del panel (el preview ocupa el resto).
const CODE_PANE_MIN = 180
const CODE_PANE_MAX = 480
const CODE_PANE_DEFAULT = 260

// Campos del snapshot del live server que este panel consume (y el vigía de
// apertura automática del sandbox, live-view-auto-open).
export type SnapshotPayload = {
  preview_url?: string | null
  preview_default?: string | null
  current_file?: string | null
  logs?: { line?: string }[]
}

// URL que el servidor quiere mostrar: la fijada por el agente (set_preview) o,
// si no, el preview local (/preview/) para sesiones web con index.html.
export function resolveReportedUrl(snapshot: SnapshotPayload | undefined) {
  if (!snapshot) return undefined
  if (snapshot.preview_url) return snapshot.preview_url
  if (snapshot.preview_default) return `${LIVE_VIEW_URL}${snapshot.preview_default.replace(/^\//, "")}`
  return undefined
}

// Primer servidor de desarrollo local mencionado en los logs del agente
// (p. ej. "Local: http://localhost:5173" al arrancar npm run dev).
export function findDevServerUrl(snapshot: SnapshotPayload | undefined) {
  for (const entry of snapshot?.logs ?? []) {
    const match = DEV_SERVER_URL_RE.exec(entry.line ?? "")
    if (match) return match[0].replace(/\/$/, "")
  }
  return undefined
}

// URL que el sandbox debe mostrar: la fijada por el agente (set_preview o
// preview local) o, si no, el primer dev server detectado en los logs. Es la
// misma detección que usa el panel y la que dispara la apertura automática
// del sandbox cuando el agente navega (useLiveViewAutoOpen).
export function serverTargetOf(snapshot: SnapshotPayload | undefined) {
  const reported = resolveReportedUrl(snapshot)
  if (reported) return reported
  return findDevServerUrl(snapshot)
}

// URL detectada en los tool-calls del chat (p. ej. la IA abrió la web con
// chrome-devtools_new_page): el sandbox la muestra aunque el live server no
// tenga sesión. La fija useLiveViewAutoOpen y la navega LivePreview.
export const [liveViewExternalUrl, setLiveViewExternalUrl] = createSignal<string | undefined>(undefined)

// Pane de código: muestra el archivo que el agente está editando (sigue
// current_file del snapshot) y lo abre también bajo demanda. Sin árbol: el
// navegador de archivos y la vista Dev tools ya lo ofrecen.
function CodePane(props: { followPath?: string }) {
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

  return (
    <div class="flex size-full min-h-0 flex-col">
      <div class="flex h-8 shrink-0 items-center gap-2 border-b border-v2-border-border-muted px-2">
        <span class="shrink-0 text-11-medium text-text-weak">{language.t("liveView.tab.code")}</span>
        <Show when={selectedPath()}>
          <span class="min-w-0 flex-1 truncate font-mono text-11-regular text-text-weak" title={selectedPath()}>
            {selectedPath()}
          </span>
        </Show>
      </div>
      <div class="min-h-0 min-w-0 flex-1">
        <Show
          when={selectedPath()}
          fallback={
            <div class="flex size-full items-center justify-center px-6 text-center text-13-regular text-text-weak">
              {language.t("liveView.code.empty")}
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


// Dashboard de dev tools del live server (árbol, logs, terminal, preview
// local); se muestra en el pane derecho cuando el toggle "Dev tools" está
// activo, en lugar del navegador de la app.
function DevToolsPane(props: { reloadKey: number }) {
  const language = useLanguage()
  return (
    <div class="flex size-full min-h-0 flex-col">
      <Show when={props.reloadKey} keyed>
        {(_) => (
          <iframe
            data-slot="sandbox-live-view"
            src={LIVE_VIEW_URL}
            title={language.t("liveView.tab.devTools")}
            class="min-h-0 w-full flex-1 border-0 bg-v2-background-bg-base"
          />
        )}
      </Show>
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
  const [codeWidth, setCodeWidth] = createSignal(CODE_PANE_DEFAULT)
  // Último snapshot del live server (preview_url, logs, current_file…).
  const [snapshot, setSnapshot] = createSignal<SnapshotPayload | undefined>(undefined)
  // URL detectada en los logs del agente (solo informativa, la navegación la
  // hace LivePreview con targetUrl).
  const [detectedUrl, setDetectedUrl] = createSignal<string | undefined>(undefined)
  // El aviso descartado con la X no vuelve a aparecer para esa misma URL
  // (el poll lo re-derivaría en el siguiente snapshot).
  const [dismissedUrl, setDismissedUrl] = createSignal<string | undefined>(undefined)

  // El pane derecho alterna entre la app (navegador) y el dashboard; el valor
  // persiste en el layout ("preview" por defecto; "code" antiguo = preview).
  const devTools = createMemo(() => view().liveView.tab() === "devtools")
  const toggleDevTools = () => view().liveView.setTab(devTools() ? "preview" : "devtools")

  // El proyecto actual del workspace: es lo que la vista en vivo debe reflejar.
  // sdk().directory ES el directorio de la sesión activa (el SDKProvider de la
  // página se inicializa con session.directory); sync().project?.worktree es el
  // proyecto GLOBAL (p. ej. C:\) y NO vale para la sesión.
  const worktree = createMemo(() => sdk().directory || sync().project?.worktree)

  // URL que el panel debe mostrar: la del agente (set_preview o preview local)
  // o, si no, el primer dev server detectado en los logs. La detección
  // queda suprimida mientras el usuario navegue a mano (manualNav en el
  // navegador); una URL nueva del agente la reanuda. La URL de un tool-call
  // del chat (liveViewExternalUrl) gana sobre el snapshot del live server.
  const serverTarget = createMemo(() => serverTargetOf(snapshot()))
  const browserTarget = () => liveViewExternalUrl() ?? serverTarget()

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

  const reloadDevTools = () => {
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
        <button
          type="button"
          data-pressed={devTools() || undefined}
          class="flex h-7 shrink-0 items-center gap-1 rounded-md px-2 text-12-regular text-text-weak transition-colors hover:bg-v2-overlay-simple-overlay-hover hover:text-text-base data-[pressed]:bg-v2-overlay-simple-overlay-active data-[pressed]:text-text-base"
          onClick={toggleDevTools}
          aria-pressed={devTools()}
          title={language.t("liveView.tab.devTools")}
        >
          <IconV2 name="outline-sliders" size="small" />
          {language.t("liveView.tab.devTools")}
        </button>
        <Show when={devTools()}>
          <IconButtonV2
            type="button"
            variant="ghost-muted"
            size="large"
            onClick={reloadDevTools}
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

      {/* Código | App lado a lado, estilo Qwen: el código que edita el agente
          siempre visible junto al preview de la app. */}
      <div class="flex min-h-0 flex-1">
        <div class="h-full min-h-0 shrink-0 border-r border-v2-border-border-muted" style={{ width: `${codeWidth()}px` }}>
          <CodePane followPath={snapshot()?.current_file ?? undefined} />
        </div>
        <div class="h-full w-1 shrink-0 cursor-col-resize bg-v2-border-border-muted" aria-hidden="true">
          <ResizeHandle
            direction="horizontal"
            edge="start"
            size={codeWidth()}
            min={CODE_PANE_MIN}
            max={CODE_PANE_MAX}
            onResize={setCodeWidth}
          />
        </div>
        <div class="flex min-h-0 min-w-0 flex-1 flex-col">
          <Show
            when={devTools() || !supportsPreviewPanel(platform.platform)}
            fallback={<LivePreview targetUrl={browserTarget} onCapture={props.onCapture} />}
          >
            <DevToolsPane reloadKey={reloadKey()} />
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
          <Show when={unavailable()}>
            <div class="shrink-0 border-t border-v2-border-border-muted px-3 py-1.5 text-11-regular text-text-faint">
              {language.t("liveView.unavailable")}
            </div>
          </Show>
        </div>
      </div>
    </aside>
  )
}
