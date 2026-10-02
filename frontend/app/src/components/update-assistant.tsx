import { ButtonV2 } from "@tiancode-ai/ui/v2/button-v2"
import { Icon } from "@tiancode-ai/ui/icon"
import { Mark } from "@tiancode-ai/ui/logo"
import { createEffect, createMemo, createResource, createSignal, For, on, onCleanup, Show } from "solid-js"
import { useLanguage } from "@/context/language"
import { usePlatform } from "@/context/platform"
import "./update-assistant.css"

const RELEASE_PAGE = "https://github.com/Dreftian/Tiancode/releases/tag/v"
const RELEASE_API = "https://api.github.com/repos/Dreftian/Tiancode/releases/tags/v"

/** The release notes' first-level bullets, `- **Title:** text`, as a few short highlights. */
export function releaseHighlights(markdown: string, limit = 4) {
  return markdown
    .split(/\r?\n/)
    .flatMap((line) => {
      const match = /^[-*]\s+\*\*(.+?)\*\*\s*(.*)$/.exec(line)
      if (!match) return []
      const title = match[1].replace(/:\s*$/, "").trim()
      const text = match[2]
        .replace(/^:\s*/, "")
        .replace(/\*\*|`/g, "")
        .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
        .trim()
      return title ? [{ title, text: text.length > 150 ? `${text.slice(0, 147).trimEnd()}…` : text }] : []
    })
    .slice(0, limit)
}

/**
 * The update assistant: a card that follows a new version from download to restart. It opens on
 * its own when a version is downloading or ready, and from the menu's "Check for updates", which
 * used to show bare system dialogs.
 */
export function UpdateAssistant() {
  const platform = usePlatform()
  const language = useLanguage()
  const updater = platform.updater
  const [requested, setRequested] = createSignal(false)
  const [dismissed, setDismissed] = createSignal<string>()

  const state = () => updater?.state() ?? { status: "disabled" as const }
  const version = () => {
    const current = state()
    return "version" in current ? current.version : undefined
  }
  const automatic = () => {
    const current = state()
    if (current.status !== "downloading" && current.status !== "ready" && current.status !== "installing") return false
    return current.version !== dismissed()
  }
  const visible = () => requested() || automatic()

  if (updater?.onShow) {
    const stop = updater.onShow(() => {
      setRequested(true)
      const status = state().status
      if (status === "downloading" || status === "ready" || status === "installing") return
      void updater.check()
    })
    onCleanup(stop)
  }

  // A check that finds nothing closes the card by itself after a moment.
  createEffect(
    on(
      () => state().status,
      (status) => {
        if (!requested() || status !== "up-to-date") return
        const timer = setTimeout(() => setRequested(false), 6000)
        onCleanup(() => clearTimeout(timer))
      },
    ),
  )

  const [notes] = createResource(
    () => (visible() ? version() : undefined),
    (next) =>
      fetch(`${RELEASE_API}${next}`, { signal: AbortSignal.timeout(8000), credentials: "omit" })
        .then((response) => (response.ok ? response.json() : undefined))
        .then((release: { body?: unknown } | undefined) =>
          typeof release?.body === "string" ? releaseHighlights(release.body) : [],
        )
        .catch(() => []),
  )

  const close = () => {
    setRequested(false)
    setDismissed(version())
  }

  const title = createMemo(() => {
    const current = state()
    if (current.status === "checking" || current.status === "idle") return language.t("update.assistant.checking.title")
    if (current.status === "up-to-date") return language.t("update.assistant.upToDate.title")
    if (current.status === "error") return language.t("update.assistant.error.title")
    if (current.status === "downloading")
      return language.t("update.assistant.downloading.title", { version: current.version })
    if (current.status === "installing")
      return language.t("update.assistant.installing.title", { version: current.version })
    if (current.status === "ready") return language.t("update.assistant.ready.title", { version: current.version })
    return language.t("update.assistant.checking.title")
  })

  const subtitle = createMemo(() => {
    const current = state()
    if (current.status === "up-to-date")
      return language.t("update.assistant.upToDate.description", { version: platform.version ?? "" })
    if (current.status === "error") return current.message
    if (current.status === "installing") return language.t("update.assistant.installing.description")
    const next = version()
    if (next && platform.version) return language.t("update.assistant.versions", { from: platform.version, to: next })
    return language.t("update.assistant.checking.description")
  })

  const percent = () => {
    const current = state()
    return current.status === "downloading" ? (current.percent ?? 0) : 0
  }

  return (
    <Show when={updater && visible()}>
      <section
        class="update-assistant"
        data-status={state().status}
        role="dialog"
        aria-live="polite"
        aria-label={title()}
        data-action="update-assistant"
      >
        <header class="update-assistant-head">
          <span class="update-assistant-mark" aria-hidden="true">
            <Mark class="update-assistant-logo" />
          </span>
          <div class="update-assistant-titles">
            <span class="update-assistant-title">{title()}</span>
            <span class="update-assistant-subtitle">{subtitle()}</span>
          </div>
          <button
            type="button"
            class="update-assistant-close"
            aria-label={language.t("update.assistant.close")}
            onClick={close}
          >
            <Icon name="close-small" size="small" />
          </button>
        </header>

        <Show when={state().status === "checking" || state().status === "downloading"}>
          <div class="update-assistant-progress" data-indeterminate={state().status === "checking" ? "" : undefined}>
            <div class="update-assistant-progress-fill" style={{ width: `${percent()}%` }} />
          </div>
          <Show when={state().status === "downloading"}>
            <span class="update-assistant-percent">
              {language.t("update.assistant.percent", { percent: percent() })}
            </span>
          </Show>
        </Show>

        <Show when={(notes() ?? []).length > 0 && state().status !== "up-to-date" && state().status !== "error"}>
          <div class="update-assistant-notes">
            <span class="update-assistant-label">{language.t("update.assistant.highlights")}</span>
            <ul>
              <For each={notes()}>
                {(item) => (
                  <li>
                    <span class="update-assistant-note-title">{item.title}</span>
                    <Show when={item.text}>
                      <span class="update-assistant-note-text">{item.text}</span>
                    </Show>
                  </li>
                )}
              </For>
            </ul>
          </div>
        </Show>

        <Show when={state().status === "ready" || state().status === "downloading"}>
          <p class="update-assistant-safe">
            <Icon name="circle-check" size="small" />
            <span>{language.t("update.assistant.safe")}</span>
          </p>
        </Show>

        <footer class="update-assistant-actions">
          <Show when={version()}>
            {(next) => (
              <button
                type="button"
                class="update-assistant-link"
                onClick={() => platform.openExternal(`${RELEASE_PAGE}${next()}`)}
              >
                {language.t("update.assistant.notes")}
              </button>
            )}
          </Show>
          <span class="update-assistant-spacer" />
          <Show when={state().status === "error"}>
            <ButtonV2 variant="outline" size="small" onClick={() => void updater?.check()}>
              {language.t("update.assistant.retry")}
            </ButtonV2>
          </Show>
          <Show when={state().status === "ready"}>
            <ButtonV2 variant="ghost" size="small" onClick={close}>
              {language.t("update.assistant.later")}
            </ButtonV2>
            <ButtonV2 variant="contrast" size="small" onClick={() => void updater?.install()}>
              {language.t("update.assistant.install")}
            </ButtonV2>
          </Show>
          <Show when={state().status === "up-to-date" || state().status === "downloading"}>
            <ButtonV2 variant="ghost" size="small" onClick={close}>
              {language.t(state().status === "downloading" ? "update.assistant.hide" : "update.assistant.close")}
            </ButtonV2>
          </Show>
        </footer>
      </section>
    </Show>
  )
}
