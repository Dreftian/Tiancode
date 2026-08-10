import { sampledChecksum } from "@tiancode-ai/core/util/encode"
import { useFileComponent } from "@tiancode-ai/ui/context/file"
import { Icon as IconV2 } from "@tiancode-ai/ui/v2/icon"
import { IconButtonV2 } from "@tiancode-ai/ui/v2/icon-button-v2"
import { TabsV2 } from "@tiancode-ai/ui/v2/tabs-v2"
import { createEffect, createMemo, createSignal, onCleanup, onMount, Show } from "solid-js"
import { Dynamic } from "solid-js/web"
import FileTreeV2 from "@/components/file-tree-v2"
import { useFile } from "@/context/file"
import { useLanguage } from "@/context/language"
import { useSDK } from "@/context/sdk"
import { useSync } from "@/context/sync"
import { useSessionLayout } from "@/pages/session/session-layout"
import { ScrollView } from "@tiancode-ai/ui/scroll-view"

const LIVE_VIEW_URL = "http://127.0.0.1:8790/"
const LIVE_VIEW_CHECK_MS = 3000

function SandboxCodePanel() {
  const file = useFile()
  const language = useLanguage()
  const fileComponent = useFileComponent()
  const [selectedPath, setSelectedPath] = createSignal<string>()
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

  // El árbol vive en el contexto de archivos del workspace: si nunca se abrió
  // el navegador de archivos principal, la raíz no está cargada ni expandida y
  // el panel se ve vacío. Aquí se siembra al montar (idempotente).
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
          <FileTreeV2 active={selectedPath()} draggable={false} onFileClick={(node) => selectFile(node.path)} />
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

export function LiveViewPanel() {
  const language = useLanguage()
  const { view } = useSessionLayout()
  const sync = useSync()
  const sdk = useSDK()
  const [reloadKey, setReloadKey] = createSignal(1)
  const [unavailable, setUnavailable] = createSignal(false)
  const [tab, setTab] = createSignal(view().liveView.tab())
  let tabSelectedLocally = false

  // El proyecto actual del workspace: es lo que la vista en vivo debe reflejar.
  const worktree = createMemo(() => sync().project?.worktree ?? sdk().directory)

  // Refleja el proyecto actual: si el servidor aún no tiene sesión, crea una
  // con la raíz del workspace (best-effort, no pisa sesiones del agente).
  // El dashboard responde con Access-Control-Allow-Origin: *, por eso el fetch
  // es normal (no-cors devolvería respuestas opaque e ilegibles).
  const syncWorkspaceSession = () => {
    const root = worktree()
    if (!root || root === "main") return
    const controller = new AbortController()
    const timer = window.setTimeout(() => controller.abort(), LIVE_VIEW_CHECK_MS)
    void fetch(`${LIVE_VIEW_URL}api/sessions`, { signal: controller.signal })
      .then((res) => (res.ok ? res.json() : undefined))
      .then((payload) => {
        const count = payload?.count ?? payload?.sessions?.length
        if (typeof count === "number" && count > 0) return
        return fetch(`${LIVE_VIEW_URL}api/create_session`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ root_text: root, mode: "web", label: "Vista en vivo" }),
        })
      })
      .catch(() => undefined)
      .finally(() => window.clearTimeout(timer))
  }
  onMount(syncWorkspaceSession)

  // El worktree puede tardar en resolverse al arrancar (proyecto aún sin
  // cargar): se reintenta mientras el panel esté montado, sin molestar si el
  // agente ya creó su propia sesión.
  const autoSessionTimer = window.setInterval(syncWorkspaceSession, 10_000)
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
    const value = next === "code" ? "code" : "preview"
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
        <Show when={tab() === "preview"}>
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
          <TabsV2.Trigger value="preview">{language.t("liveView.tab.preview")}</TabsV2.Trigger>
          <TabsV2.Trigger value="code">{language.t("liveView.tab.code")}</TabsV2.Trigger>
        </TabsV2.List>
        <TabsV2.Content value="preview" forceMount class="min-h-0 overflow-hidden" hidden={tab() !== "preview"}>
          <div class="flex size-full min-h-0 flex-col">
            <Show when={reloadKey()} keyed>
              {(_) => (
                <iframe
                  data-slot="sandbox-live-view"
                  src={LIVE_VIEW_URL}
                  title={language.t("liveView.tab.preview")}
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
        <TabsV2.Content value="code" forceMount class="min-h-0 overflow-hidden" hidden={tab() !== "code"}>
          <SandboxCodePanel />
        </TabsV2.Content>
      </TabsV2>
    </aside>
  )
}
