import { createSignal, onCleanup, onMount, Show } from "solid-js"
import { IconButtonV2 } from "@tiancode-ai/ui/v2/icon-button-v2"
import { Icon as IconV2 } from "@tiancode-ai/ui/v2/icon"
import { useLanguage } from "@/context/language"
import { useSessionLayout } from "@/pages/session/session-layout"

// Panel del dashboard en vivo que sirve el MCP local "live_frontend".
const LIVE_VIEW_URL = "http://127.0.0.1:8790/"
const LIVE_VIEW_CHECK_MS = 3000

export function LiveViewPanel() {
  const language = useLanguage()
  const { view } = useSessionLayout()
  const [reloadKey, setReloadKey] = createSignal(1)
  const [unavailable, setUnavailable] = createSignal(false)

  // El iframe no dispara eventos fiables cuando el servidor local está caído
  // (Chromium muestra su página de error dentro del frame), así que sondeamos
  // la URL con un fetch opaco: solo falla ante un error de red real.
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
      aria-label={language.t("liveView.title")}
      class="flex flex-col size-full overflow-hidden bg-v2-background-bg-base"
    >
      <div class="flex h-10 shrink-0 items-center gap-2 px-2 border-b border-border-weaker-base bg-v2-background-bg-base overflow-hidden">
        <div class="flex items-center gap-1.5 text-13-medium text-text-base select-none">
          <span class="size-1.5 rounded-full bg-[var(--v2-state-fg-success)]" aria-hidden="true" />
          {language.t("liveView.title")}
        </div>
        <div class="flex-1" />
        <IconButtonV2
          type="button"
          variant="ghost-muted"
          size="large"
          onClick={reload}
          aria-label={language.t("liveView.refresh")}
          title={language.t("liveView.refresh")}
          icon={<IconV2 name="reset" />}
        />
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
      {/* Show keyed: cada bump de reloadKey recrea el iframe desde cero y lo
          obliga a recargar el dashboard. */}
      <Show when={reloadKey()} keyed>
        {(_) => (
          <iframe
            src={LIVE_VIEW_URL}
            title={language.t("liveView.title")}
            class="flex-1 min-h-0 w-full border-0 bg-v2-background-bg-base"
          />
        )}
      </Show>
      <Show when={unavailable()}>
        <div class="shrink-0 px-3 py-1.5 text-11-regular text-text-faint border-t border-border-weaker-base">
          {language.t("liveView.unavailable")}
        </div>
      </Show>
    </aside>
  )
}
