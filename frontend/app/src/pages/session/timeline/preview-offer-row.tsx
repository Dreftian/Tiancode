import { Match, Show, Switch, createMemo, onMount } from "solid-js"
import { createStore } from "solid-js/store"
import { ButtonV2 } from "@tiancode-ai/ui/v2/button-v2"
import { IconButtonV2 } from "@tiancode-ai/ui/v2/icon-button-v2"
import { Icon as IconV2 } from "@tiancode-ai/ui/v2/icon"
import { getFilename } from "@tiancode-ai/core/util/path"
import { useLanguage } from "@/context/language"
import { useSettings } from "@/context/settings"
import { showToast } from "@/utils/toast"
import { usePreviewOpeners } from "@/pages/session/live-preview/use-preview-openers"
import type { PreviewOfferReason } from "./preview-offer"
import "./preview-offer-row.css"

type Choice = "dismissed" | "sandbox" | "desktop"

const STORAGE_KEY = "tiancode.preview-offer.v1"
const MAX_REMEMBERED = 300
// A turn that finished this recently counts as "just finished" for the automatic modes; older
// turns (a reload, an old session) only ever show the card.
const AUTO_WINDOW_MS = 20_000

const [handled, setHandled] = createStore<Record<string, Choice>>(readHandled())

function readHandled(): Record<string, Choice> {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}")
    if (!value || typeof value !== "object" || Array.isArray(value)) return {}
    return Object.fromEntries(
      Object.entries(value).filter(
        (entry): entry is [string, Choice] =>
          entry[1] === "dismissed" || entry[1] === "sandbox" || entry[1] === "desktop",
      ),
    )
  } catch {
    return {}
  }
}

function remember(userMessageID: string, choice: Choice) {
  setHandled(userMessageID, choice)
  try {
    // Message IDs sort by time, so the oldest entries are the first ones to drop.
    const entries = Object.entries({ ...handled }).sort(([a], [b]) => a.localeCompare(b))
    localStorage.setItem(STORAGE_KEY, JSON.stringify(Object.fromEntries(entries.slice(-MAX_REMEMBERED))))
  } catch {
    // Without storage the card simply shows again after a reload.
  }
}

export function TimelinePreviewOfferRow(props: {
  userMessageID: string
  reason: PreviewOfferReason
  entry?: string
  finishedAt?: number
}) {
  const language = useLanguage()
  const settings = useSettings()
  const openers = usePreviewOpeners()
  const [state, setState] = createStore({ busy: undefined as "sandbox" | "desktop" | undefined })
  const choice = createMemo(() => handled[props.userMessageID])
  const file = createMemo(() => (props.entry ? getFilename(props.entry) || props.entry : undefined))

  const run = async (target: "sandbox" | "desktop") => {
    if (state.busy) return
    setState("busy", target)
    try {
      if (target === "sandbox") await openers.sandbox()
      if (target === "desktop") await openers.desktop(props.entry)
      remember(props.userMessageID, target)
    } catch (error) {
      showToast({
        variant: "error",
        title: language.t("session.previewOffer.failed"),
        description: error instanceof Error && error.message ? error.message : undefined,
      })
    } finally {
      setState("busy", undefined)
    }
  }

  onMount(() => {
    const mode = settings.general.previewOnFinish()
    if (mode !== "sandbox" && mode !== "desktop") return
    if (choice()) return
    if (!props.finishedAt || Date.now() - props.finishedAt > AUTO_WINDOW_MS) return
    void run(mode)
  })

  const title = () =>
    language.t(
      props.reason === "started"
        ? "session.previewOffer.title.started"
        : props.reason === "reviewed"
          ? "session.previewOffer.title.reviewed"
          : "session.previewOffer.title.modified",
    )

  return (
    <Show when={choice() !== "dismissed"}>
      <div
        data-component="session-turn-preview-offer"
        data-state={choice() ?? "ask"}
        role="group"
        aria-label={title()}
      >
        <span data-slot="preview-offer-icon" aria-hidden="true">
          <IconV2 name={choice() === "desktop" ? "monitor" : "globe"} />
        </span>
        <div data-slot="preview-offer-copy">
          <Switch>
            <Match when={choice() === "sandbox"}>
              <span data-slot="preview-offer-title">{language.t("session.previewOffer.openedSandbox")}</span>
            </Match>
            <Match when={choice() === "desktop"}>
              <span data-slot="preview-offer-title">{language.t("session.previewOffer.openedDesktop")}</span>
            </Match>
            <Match when={true}>
              <span data-slot="preview-offer-title">{title()}</span>
            </Match>
          </Switch>
          <Show when={file()}>
            {(name) => (
              <span data-slot="preview-offer-file" title={props.entry}>
                {name()}
              </span>
            )}
          </Show>
        </div>
        <div data-slot="preview-offer-actions">
          <Show when={choice() !== "sandbox"}>
            <ButtonV2
              size="small"
              variant={choice() ? "ghost" : "contrast"}
              icon="globe"
              disabled={!!state.busy}
              data-action="preview-offer-sandbox"
              onClick={() => void run("sandbox")}
            >
              {language.t(choice() ? "session.previewOffer.sandboxInstead" : "session.previewOffer.sandbox")}
            </ButtonV2>
          </Show>
          <Show when={choice() !== "desktop"}>
            <ButtonV2
              size="small"
              variant={choice() ? "ghost" : "neutral"}
              icon="monitor"
              disabled={!!state.busy}
              data-action="preview-offer-desktop"
              title={language.t("session.previewOffer.desktop.hint")}
              onClick={() => void run("desktop")}
            >
              {language.t(choice() ? "session.previewOffer.desktopInstead" : "session.previewOffer.desktop")}
            </ButtonV2>
          </Show>
          <Show when={state.busy}>
            <span data-slot="preview-offer-busy" role="status">
              {language.t("session.previewOffer.starting")}
            </span>
          </Show>
          <IconButtonV2
            size="small"
            variant="ghost-muted"
            icon={<IconV2 name="xmark-small" />}
            title={language.t("session.previewOffer.dismiss")}
            data-action="preview-offer-dismiss"
            onClick={() => remember(props.userMessageID, "dismissed")}
          />
        </div>
      </div>
    </Show>
  )
}
