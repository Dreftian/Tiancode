import { For, Show, createMemo, onCleanup, onMount } from "solid-js"
import { createStore } from "solid-js/store"
import { IconButtonV2 } from "@tiancode-ai/ui/v2/icon-button-v2"
import { Icon as IconV2 } from "@tiancode-ai/ui/v2/icon"
import { TextInputV2 } from "@tiancode-ai/ui/v2/text-input-v2"
import { useLanguage } from "@/context/language"
import { usePlatform } from "@/context/platform"
import { SETTINGS_PAGES, SETTINGS_ROWS, type SettingsSearchEntry } from "./search-catalog"
import { rankSettings, type SettingsSearchItem, type SettingsSearchResult } from "./search-results"

type LanguageKey = Parameters<ReturnType<typeof useLanguage>["t"]>[0]

/** The search box at the top of the settings sidebar; its results replace the page list. */
export function SettingsSearchV2(props: {
  query: string
  onQuery: (value: string) => void
  onSelect: (entry: SettingsSearchEntry) => void
  hasTab: (tab: string) => boolean
}) {
  const language = useLanguage()
  const platform = usePlatform()
  const [state, setState] = createStore({ highlighted: 0 })
  let input: HTMLInputElement | undefined

  const t = (key: string) => language.t(key as LanguageKey)
  const available = (entry: SettingsSearchEntry) => {
    if (!props.hasTab(entry.tab)) return false
    if (entry.available === "desktop") return platform.platform === "desktop"
    if (entry.available === "windows") return platform.platform === "desktop" && platform.os === "windows"
    return true
  }
  const items = createMemo<SettingsSearchItem[]>(() => {
    const pageTitle = new Map(SETTINGS_PAGES.map((page) => [page.tab, t(page.label)]))
    return [...SETTINGS_PAGES, ...SETTINGS_ROWS].filter(available).map((entry) => ({
      ...entry,
      title: t(entry.label),
      secondary: entry.target
        ? [
            pageTitle.get(entry.tab),
            entry.context ? t(entry.context) : entry.section ? t(`settings.general.section.${entry.section}`) : undefined,
          ]
            .filter(Boolean)
            .join(" › ")
        : t("settings.search.group.pages"),
    }))
  })
  const ranked = createMemo(() => rankSettings(props.query, items()))
  const results = () => ranked().results
  const pages = createMemo(() => results().filter((result) => !result.target))
  const rows = createMemo(() => results().filter((result) => result.target))
  const ordered = createMemo(() => [...pages(), ...rows()])

  const choose = (result: SettingsSearchResult | undefined) => {
    if (!result) return
    props.onSelect(result)
  }

  const onKeyDown = (event: KeyboardEvent) => {
    const total = ordered().length
    if (event.key === "Escape" && props.query) {
      event.preventDefault()
      event.stopPropagation()
      props.onQuery("")
      return
    }
    if (!total) return
    const move = (next: number) => {
      event.preventDefault()
      setState("highlighted", (next + total) % total)
      queueMicrotask(() =>
        document.querySelector(`[data-settings-search-index="${state.highlighted}"]`)?.scrollIntoView({ block: "nearest" }),
      )
    }
    if (event.key === "ArrowDown") return move(state.highlighted + 1)
    if (event.key === "ArrowUp") return move(state.highlighted - 1)
    if (event.key === "Home") return move(0)
    if (event.key === "End") return move(total - 1)
    if (event.key === "Enter") {
      event.preventDefault()
      choose(ordered()[state.highlighted])
    }
  }

  // Ctrl/Cmd+F focuses the box while the settings dialog is open.
  onMount(() => {
    const focus = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== "f" || !(event.ctrlKey || event.metaKey) || event.altKey) return
      event.preventDefault()
      input?.focus()
      input?.select()
    }
    window.addEventListener("keydown", focus, true)
    onCleanup(() => window.removeEventListener("keydown", focus, true))
  })

  const Result = (result: SettingsSearchResult, index: () => number) => (
    <button
      type="button"
      role="option"
      class="settings-v2-search-result"
      data-settings-search-index={index()}
      data-highlighted={state.highlighted === index() ? "" : undefined}
      aria-selected={state.highlighted === index()}
      onMouseMove={() => setState("highlighted", index())}
      onClick={() => choose(result)}
    >
      <span class="settings-v2-search-result-title">{result.title}</span>
      <Show when={result.target}>
        <span class="settings-v2-search-result-context">{result.secondary}</span>
      </Show>
    </button>
  )

  return (
    <div class="settings-v2-search" data-component="settings-search">
      <div class="settings-v2-search-input">
        <IconV2 name="magnifying-glass" />
        <TextInputV2
          ref={input}
          type="search"
          appearance="base"
          value={props.query}
          role="combobox"
          aria-expanded={!!props.query}
          aria-controls="settings-search-results"
          aria-label={language.t("settings.search.placeholder")}
          placeholder={language.t("settings.search.placeholder")}
          spellcheck={false}
          autocomplete="off"
          onInput={(event) => {
            setState("highlighted", 0)
            props.onQuery(event.currentTarget.value)
          }}
          onKeyDown={onKeyDown}
        />
        <Show when={props.query}>
          <IconButtonV2
            size="small"
            variant="ghost-muted"
            icon={<IconV2 name="xmark-small" />}
            aria-label={language.t("a11y.clearSearch")}
            onClick={() => {
              props.onQuery("")
              input?.focus()
            }}
          />
        </Show>
      </div>
      <Show when={props.query.trim()}>
        <div id="settings-search-results" role="listbox" class="settings-v2-search-results">
          <Show
            when={ordered().length > 0}
            fallback={
              <div class="settings-v2-search-empty">
                {language.t("settings.search.empty", { query: props.query.trim() })}
              </div>
            }
          >
            <Show when={pages().length > 0}>
              <div class="settings-v2-search-group">{language.t("settings.search.group.pages")}</div>
              <For each={pages()}>{(result, index) => Result(result, index)}</For>
            </Show>
            <Show when={rows().length > 0}>
              <div class="settings-v2-search-group">{language.t("settings.search.group.settings")}</div>
              <For each={rows()}>{(result, index) => Result(result, () => pages().length + index())}</For>
            </Show>
            <Show when={ranked().truncated}>
              <div class="settings-v2-search-empty">{language.t("settings.search.refine")}</div>
            </Show>
          </Show>
        </div>
      </Show>
    </div>
  )
}

/** Scrolls to a settings row once its page has rendered it, and flashes it. */
export function revealSettingsRow(target: string) {
  const find = () =>
    [...document.querySelectorAll<HTMLElement>(`[data-action="${CSS.escape(target)}"]`)].find(
      (element) => element.getClientRects().length > 0,
    )
  const reveal = (element: HTMLElement) => {
    const row = element.closest<HTMLElement>('[data-component="settings-v2-row"]') ?? element
    row.scrollIntoView({ block: "center", behavior: "smooth" })
    row.setAttribute("data-search-target", "")
    setTimeout(() => row.removeAttribute("data-search-target"), 1800)
  }
  const tick = (left: number) => {
    const element = find()
    if (element) return reveal(element)
    if (left > 0) setTimeout(() => tick(left - 1), 50)
  }
  tick(40)
}
