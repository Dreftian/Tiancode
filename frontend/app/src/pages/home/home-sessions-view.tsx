import type { Session } from "@tiancode-ai/sdk/v2/client"
import { type Accessor, createMemo, createSignal, For, Show, Suspense } from "solid-js"
import { Spinner } from "@tiancode-ai/ui/spinner"
import { ScrollView } from "@tiancode-ai/ui/scroll-view"
import { ButtonV2 } from "@tiancode-ai/ui/v2/button-v2"
import { HomeWebAppCard } from "@/pages/home/home-webapp-card"
import { Icon as IconV2 } from "@tiancode-ai/ui/v2/icon"
import { IconButtonV2 } from "@tiancode-ai/ui/v2/icon-button-v2"
import { TooltipV2 } from "@tiancode-ai/ui/v2/tooltip-v2"
import { useLanguage } from "@/context/language"
import { ServerConnection } from "@/context/server"
import { SessionTabAvatarView } from "@/pages/layout/session-tab-avatar"
import { sessionTitle } from "@/utils/session-title"
import { shouldOpenSessionInBackground } from "../home-session-open"
import {
  HomeSessionStatusController,
  homeSessionSearchKey,
  type HomeSessionGroup,
  type HomeSessionRecord,
  type OpenSessionOptions,
} from "./home-sessions-controller"

const SHOW_HOME_SESSION_ARCHIVE = false
const HOME_SECTION_LABEL = "text-v2-text-text-muted [font-weight:440]"
const HOME_SESSION_SEARCH_RESULTS_ID = "home-session-search-results"

// Middle-click or Cmd+click on macOS (Ctrl+click elsewhere) opens a session
// tab in the background without navigating, matching browser conventions.
function isBackgroundOpen(event: MouseEvent) {
  return shouldOpenSessionInBackground({
    button: event.button,
    mac: typeof navigator === "object" && /(Mac|iPod|iPhone|iPad)/.test(navigator.platform),
    meta: event.metaKey,
    ctrl: event.ctrlKey,
    shift: event.shiftKey,
    alt: event.altKey,
  })
}

export type HomeSessionsViewProps = {
  language: ReturnType<typeof useLanguage>
  groups: Accessor<HomeSessionGroup[]>
  showProjectName: Accessor<boolean>
  server: Accessor<ServerConnection.Key>
  canCreateSession: Accessor<boolean>
  searchValue: Accessor<string>
  searchPlaceholder: Accessor<string>
  searchOpen: Accessor<boolean>
  searchLoading: Accessor<boolean>
  searchResults: Accessor<HomeSessionRecord[]>
  searchActive: Accessor<string>
  searchNoResultsLabel: Accessor<string>
  titleOpacity: (id: HomeSessionGroup["id"]) => number
  isOpenTab: (record: HomeSessionRecord) => boolean
  onCreateSession: (prompt?: string) => void
  onOpenSession: (session: Session, options?: OpenSessionOptions) => void
  onDeleteSession?: (session: Session) => Promise<void>
  onArchiveSession: (session: Session) => Promise<void>
  onSetHoverTarget: (element: HTMLElement) => void
  onSetThumbTrack: (element: HTMLDivElement) => void
  onSetContent: (element: HTMLDivElement) => void
  onSetHeader: (id: HomeSessionGroup["id"], element: HTMLDivElement) => void
  onWheel: (event: WheelEvent) => void
  onSetSearchRoot: (element: HTMLDivElement) => void
  onSetSearchInput: (element: HTMLInputElement) => void
  onSetSearchList: (element: HTMLDivElement) => void
  onSearchFocus: () => void
  onSearchInput: (value: string) => void
  onSearchClose: () => void
  onSearchMove: (delta: number) => void
  onSearchSelectActive: () => void
  onSearchHighlight: (record: HomeSessionRecord) => void
  onSearchSelect: (record: HomeSessionRecord, options?: OpenSessionOptions) => void
}

export function HomeSessionsView(props: HomeSessionsViewProps) {
  return (
    <section
      ref={props.onSetHoverTarget}
      class="min-h-0 min-w-0 flex-1 flex flex-col"
      aria-label={props.language.t("sidebar.project.recentSessions")}
    >
      <div class="sticky top-0 z-30 shrink-0 bg-v2-background-bg-base pb-3 pt-6 lg:pt-12" onWheel={props.onWheel}>
        <HomeSessionSearch {...props} />
        <Suspense>
          <Show when={props.groups().length > 0 && props.canCreateSession()}>
            <div class="pointer-events-none absolute right-0 top-[84px] z-20 flex lg:top-[108px]">
              <ButtonV2
                data-action="home-new-session"
                variant="ghost-muted"
                size="normal"
                icon="edit"
                class="pointer-events-auto h-7 px-2 [font-weight:530]"
                onClick={props.onCreateSession}
              >
                {props.language.t("command.session.new")}
              </ButtonV2>
            </div>
          </Show>
        </Suspense>
      </div>
      <div class="pointer-events-none sticky top-[84px] z-40 h-0 -mr-3 lg:top-[108px]">
        <div
          ref={props.onSetThumbTrack}
          data-component="home-session-scroll-track"
          class="relative ml-auto h-[calc(100cqh-84px)] w-3 lg:h-[calc(100cqh-108px)]"
        />
      </div>
      <div class="-mr-3 min-h-[calc(100cqh-72px)] lg:min-h-[calc(100cqh-96px)]">
        <Suspense
          fallback={
            <div class="pt-3">
              <HomeSessionSkeleton label={props.language.t("common.loading")} />
            </div>
          }
        >
          <Show
            when={props.groups().length > 0}
            fallback={
              <HomeSessionsEmpty
                onNewSession={props.canCreateSession() ? props.onCreateSession : undefined}
                language={props.language}
              />
            }
          >
            <div ref={props.onSetContent} class="flex flex-col gap-3 pt-3 pr-3 pb-16">
              <HomeWebAppCard />
              <For each={props.groups()}>
                {(group, index) => (
                  <>
                    <HomeSessionGroupHeader
                      title={group.title}
                      titleOpacity={props.titleOpacity(group.id)}
                      onSetRef={(element) => props.onSetHeader(group.id, element)}
                      elevated={index() === 0}
                    />
                    <div
                      class={`flex min-w-0 flex-col gap-px pt-4 ${index() === props.groups().length - 1 ? "" : "mb-6"}`}
                    >
                      <For each={group.sessions}>{(record) => <HomeSessionRow {...props} record={record} />}</For>
                    </div>
                  </>
                )}
              </For>
            </div>
          </Show>
        </Suspense>
      </div>
    </section>
  )
}

function HomeSessionLeadingController(props: {
  server: HomeSessionsViewProps["server"]
  isOpenTab: HomeSessionsViewProps["isOpenTab"]
  record: HomeSessionRecord
  revealProjectOnHover: boolean
}) {
  return (
    <HomeSessionStatusController
      server={props.server}
      record={props.record}
      isOpenTab={props.isOpenTab}
      render={(state) => (
        <HomeSessionLeading
          record={props.record}
          revealProjectOnHover={props.revealProjectOnHover}
          open={state.open()}
          unread={state.unread()}
          loading={state.loading()}
        />
      )}
    />
  )
}

function HomeSessionLeading(props: {
  record: HomeSessionRecord
  revealProjectOnHover: boolean
  open: boolean
  unread: boolean
  loading: boolean
}) {
  return (
    <div class="relative shrink-0">
      <Show when={props.open}>
        <span
          aria-hidden="true"
          class={`
            pointer-events-none absolute top-1/2 h-3 w-0.5 -translate-y-1/2
            rounded-[2px] bg-v2-background-bg-layer-04
          `}
          style={{ right: "calc(100% + 4px)" }}
        />
      </Show>
      <SessionTabAvatarView
        project={props.record.project}
        directory={props.record.session.directory}
        revealProjectOnHover={props.revealProjectOnHover}
        unread={props.unread}
        loading={props.loading}
      />
    </div>
  )
}

function HomeSessionSearch(props: HomeSessionsViewProps) {
  return (
    <div class="w-full">
      <div ref={props.onSetSearchRoot} data-component="home-session-search" class="relative z-30 w-full">
        <Show when={props.searchOpen()}>
          <div
            data-component="home-session-search-panel"
            class={`
              absolute flex flex-col overflow-hidden rounded-[12px]
              bg-v2-background-bg-base shadow-[var(--v2-elevation-floating)]
            `}
            style={{ top: "-6px", left: "-6px", width: "calc(100% + 12px)" }}
          >
            <div class="flex flex-col pt-9">
              <div id={HOME_SESSION_SEARCH_RESULTS_ID} role="listbox" class="flex flex-col gap-4 pt-4">
                <Show
                  when={!props.searchLoading()}
                  fallback={
                    <div class="flex items-center justify-center px-4 py-3 text-v2-text-text-muted [font-weight:440]">
                      <Spinner class="size-4" />
                    </div>
                  }
                >
                  <Show
                    when={props.searchResults().length > 0}
                    fallback={
                      <p
                        class={`
                          my-1.5 px-4 pb-2 text-[13px] leading-4 tracking-[-0.04px]
                          text-v2-text-text-muted [font-weight:440]
                        `}
                      >
                        {props.searchNoResultsLabel()}
                      </p>
                    }
                  >
                    <div class="flex flex-col">
                      <p
                        class={`
                          my-1.5 pl-[18px] pr-6 text-[13px] leading-4 tracking-[-0.04px]
                          text-v2-text-text-muted [font-weight:440]
                        `}
                      >
                        {props.language.t("home.sessions.search.sessions")}
                      </p>
                      <ScrollView class="max-h-80" viewportRef={props.onSetSearchList}>
                        <div class="flex flex-col gap-px pb-2">
                          <For each={props.searchResults()}>
                            {(record) => (
                              <HomeSessionSearchResultRow
                                {...props}
                                record={record}
                                selected={props.searchActive() === homeSessionSearchKey(record)}
                              />
                            )}
                          </For>
                        </div>
                      </ScrollView>
                    </div>
                  </Show>
                </Show>
              </div>
            </div>
          </div>
        </Show>
        <label
          class={`
            relative z-20 flex h-9 w-full items-center gap-2 rounded-[6px] py-1 pl-3 pr-2
            bg-v2-background-bg-layer-02/60 text-v2-icon-icon-muted transition-[background-color,box-shadow]
            duration-[120ms] ease-in-out hover:bg-v2-background-bg-layer-02 focus-within:bg-v2-background-bg-layer-02
          `}
        >
          <IconV2 name="magnifying-glass" />
          <input
            ref={props.onSetSearchInput}
            class={`
              relative z-20 min-w-0 flex-1 border-0 bg-transparent outline-0
              text-v2-text-text-base [font-weight:440] placeholder:text-v2-text-text-faint
            `}
            value={props.searchValue()}
            placeholder={props.searchPlaceholder()}
            aria-label={props.searchPlaceholder()}
            aria-expanded={props.searchOpen()}
            aria-controls={HOME_SESSION_SEARCH_RESULTS_ID}
            aria-autocomplete="list"
            aria-activedescendant={
              props.searchActive() && props.searchOpen()
                ? `home-session-search-option-${props.searchActive()}`
                : undefined
            }
            onFocus={props.onSearchFocus}
            onInput={(event) => props.onSearchInput(event.currentTarget.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault()
                props.onSearchClose()
                event.currentTarget.blur()
                return
              }
              if (!props.searchOpen() || props.searchResults().length === 0) return
              if (event.altKey || event.metaKey) return
              if (event.key === "ArrowDown") {
                event.preventDefault()
                props.onSearchMove(1)
                return
              }
              if (event.key === "ArrowUp") {
                event.preventDefault()
                props.onSearchMove(-1)
                return
              }
              if (event.key === "Enter" && !event.isComposing) {
                event.preventDefault()
                props.onSearchSelectActive()
              }
            }}
          />
          <Show when={props.searchValue()}>
            <IconButtonV2
              type="button"
              variant="ghost-muted"
              size="small"
              class="relative z-20 shrink-0"
              icon={<IconV2 name="close" size="large" class="text-v2-icon-icon-muted" />}
              aria-label={props.searchPlaceholder()}
              onClick={() => {
                props.onSearchClose()
                props.onSearchFocus()
              }}
            />
          </Show>
        </label>
      </div>
    </div>
  )
}

function HomeSessionSearchResultRow(
  props: HomeSessionsViewProps & {
    record: HomeSessionRecord
    selected: boolean
  },
) {
  const title = createMemo(() => sessionTitle(props.record.session.title) || props.record.session.id)
  const showProjectName = () => props.showProjectName() && props.record.projectName
  const key = () => homeSessionSearchKey(props.record)

  return (
    <button
      type="button"
      id={`home-session-search-option-${key()}`}
      data-key={key()}
      data-component="home-session-search-row"
      role="option"
      aria-selected={props.selected}
      class={`
        flex h-10 w-full shrink-0 cursor-default items-center gap-2 border-0 py-3 pl-[18px] pr-6 text-left
        transition-[background-color] duration-[120ms] ease-in-out
        hover:bg-v2-overlay-simple-overlay-hover focus-visible:bg-v2-overlay-simple-overlay-hover focus-visible:outline-none
      `}
      classList={{
        "bg-v2-overlay-simple-overlay-hover": props.selected,
        group: !!showProjectName(),
      }}
      onMouseEnter={() => props.onSearchHighlight(props.record)}
      onMouseDown={(event) => {
        if (event.button === 1) event.preventDefault()
      }}
      onClick={(event) => props.onSearchSelect(props.record, { background: isBackgroundOpen(event) })}
      onAuxClick={(event) => {
        if (!isBackgroundOpen(event)) return
        event.preventDefault()
        props.onSearchSelect(props.record, { background: true })
      }}
    >
      <HomeSessionLeadingController
        server={props.server}
        isOpenTab={props.isOpenTab}
        record={props.record}
        revealProjectOnHover={!!showProjectName()}
      />
      <div class="flex min-w-0 flex-1 items-center gap-1.5">
        <HomeSessionTitle title={title()} showProjectName={!!showProjectName()} search />
        <Show when={showProjectName()}>
          <HomeSessionProjectName name={props.record.projectName} search />
        </Show>
      </div>
    </button>
  )
}

function HomeSessionGroupHeader(props: {
  title: string
  titleOpacity: number
  onSetRef: (element: HTMLDivElement) => void
  elevated?: boolean
}) {
  return (
    <div
      ref={props.onSetRef}
      class={`
        pointer-events-none sticky top-[84px] flex h-7 min-w-0 items-center justify-between
        bg-v2-background-bg-base pl-3 lg:top-[108px]
      `}
      classList={{ "home-session-group-header z-[5]": !!props.elevated, "z-10": !props.elevated }}
    >
      <div class={HOME_SECTION_LABEL} style={{ opacity: props.titleOpacity }}>
        {props.title}
      </div>
    </div>
  )
}

function HomeSessionRow(props: HomeSessionsViewProps & { record: HomeSessionRecord }) {
  const title = createMemo(() => sessionTitle(props.record.session.title) || props.record.session.id)
  const showProjectName = () => props.showProjectName() && props.record.projectName

  return (
    <div
      class="group/session relative flex h-10 min-w-0 items-center rounded-[6px]"
      classList={{ group: !!showProjectName() }}
    >
      <button
        type="button"
        data-component="home-session-row"
        class={`
          flex h-10 min-w-0 w-full flex-1 shrink-0 cursor-default items-center gap-2 rounded-[6px] border-0
          bg-transparent py-3 pl-3 pr-10 text-left text-v2-text-text-muted [font-weight:530]
          transition-[background-color,color,box-shadow] duration-[120ms] ease-in-out
          hover:bg-v2-overlay-simple-overlay-hover focus-visible:bg-v2-overlay-simple-overlay-hover focus-visible:outline-none
        `}
        onMouseDown={(event) => {
          if (event.button === 1) event.preventDefault()
        }}
        onClick={(event) => props.onOpenSession(props.record.session, { background: isBackgroundOpen(event) })}
        onAuxClick={(event) => {
          if (!isBackgroundOpen(event)) return
          event.preventDefault()
          props.onOpenSession(props.record.session, { background: true })
        }}
      >
        <HomeSessionLeadingController
          server={props.server}
          isOpenTab={props.isOpenTab}
          record={props.record}
          revealProjectOnHover={!!showProjectName()}
        />
        <HomeSessionTitle title={title()} showProjectName={!!showProjectName()} />
        <Show when={showProjectName()}>
          <HomeSessionProjectName name={props.record.projectName} />
        </Show>
      </button>
      <div
        class={`
          absolute right-1.5 top-1/2 flex -translate-y-1/2 items-center gap-1
          opacity-0 group-hover/session:opacity-100 focus-within:opacity-100 transition-opacity z-10
        `}
      >
        <TooltipV2 class="flex shrink-0 items-center" placement="bottom" value={props.language.t("session.delete.title") ?? "Eliminar sesión"}>
          <IconButtonV2
            data-action="home-session-delete"
            variant="ghost-muted"
            size="large"
            icon={<IconV2 name="trash" class="text-v2-icon-icon-muted hover:text-v2-state-fg-danger" />}
            aria-label={props.language.t("session.delete.title") ?? "Eliminar sesión"}
            onClick={(event) => {
              event.preventDefault()
              event.stopPropagation()
              if (window.confirm(props.language.t("session.delete.confirm", { name: title() }))) {
                void props.onDeleteSession?.(props.record.session)
              }
            }}
          />
        </TooltipV2>
      </div>
    </div>
  )
}

function HomeSessionTitle(props: { title: string; showProjectName: boolean; search?: boolean }) {
  return (
    <span
      class="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-v2-text-text-base [font-weight:530]"
      classList={{
        "text-[13px] leading-4 tracking-[-0.04px]": !!props.search,
        "max-w-[min(70%,480px)] flex-[0_1_auto]": props.showProjectName,
        "flex-[1_1_auto]": !props.showProjectName,
      }}
    >
      {props.title}
    </span>
  )
}

function HomeSessionProjectName(props: { name: string; search?: boolean }) {
  return (
    <span
      class="min-w-0 flex-[1_1_auto] overflow-hidden text-ellipsis whitespace-nowrap text-v2-text-text-muted [font-weight:440]"
      classList={{ "text-[13px] leading-4 tracking-[-0.04px]": !!props.search }}
    >
      {props.name}
    </span>
  )
}

function HomeSessionsEmpty(props: { onNewSession?: (prompt?: string) => void; language: ReturnType<typeof useLanguage> }) {
  const [promptText, setPromptText] = createSignal("")

  const handleSubmit = () => {
    const text = promptText().trim()
    if (!text) return
    props.onNewSession?.(text)
  }

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }

  const handleSuggestion = (suggestion: string) => {
    props.onNewSession?.(suggestion)
  }

  const suggestions = () => [
    {
      id: "webapp",
      label: props.language.t("home.chat.suggestion.webapp") || "⚡ Crear una app web interactiva",
      prompt: "Crea una aplicación web moderna y completa con interfaz interactiva y diseño limpio.",
    },
    {
      id: "explain",
      label: props.language.t("home.chat.suggestion.explain") || "💡 Explicar arquitectura o código",
      prompt: "Explica cómo funciona la estructura de un proyecto y cuáles son las mejores prácticas.",
    },
    {
      id: "refactor",
      label: props.language.t("home.chat.suggestion.refactor") || "🛠️ Refactorizar y optimizar",
      prompt: "Ayúdame a refactorizar y optimizar código para que sea más limpio y eficiente.",
    },
    {
      id: "tests",
      label: props.language.t("home.chat.suggestion.tests") || "🧪 Generar pruebas unitarias",
      prompt: "Genera una suite de pruebas unitarias robustas para validar casos límite y lógica principal.",
    },
  ]

  return (
    <div class="flex min-h-full flex-col items-center justify-center gap-6 px-4 py-8 max-w-[680px] mx-auto text-center">
      {/* Header & Logo */}
      <div class="flex flex-col items-center gap-3">
        <div class="flex size-14 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-400/20 via-sky-500/15 to-indigo-600/20 border border-cyan-400/30 shadow-[0_0_30px_rgba(6,182,212,0.18)]">
          <IconV2 name="sparkles" size="large" class="text-cyan-400" />
        </div>
        <h1 class="text-[24px] font-semibold tracking-[-0.03em] text-v2-text-text-base leading-tight">
          {props.language.t("home.chat.heading") || "¿En qué puedo ayudarte hoy?"}
        </h1>
        <p class="text-[13px] leading-5 text-v2-text-text-muted max-w-[440px]">
          {props.language.t("home.chat.subtitle") || "Inicia una conversación, haz una pregunta o programa libremente."}
        </p>
      </div>

      {/* Chat Prompt Input Box (Claude / Codex style) */}
      <div class="w-full rounded-2xl border border-v2-border-border-muted bg-v2-background-bg-layer-01 p-3.5 shadow-xl transition-all focus-within:border-cyan-400/50 focus-within:ring-1 focus-within:ring-cyan-400/20 text-left">
        <textarea
          data-action="home-chat-input"
          class="w-full resize-none bg-transparent text-[14px] leading-relaxed text-v2-text-text-base placeholder:text-v2-text-text-faint outline-none max-h-40 min-h-[72px]"
          placeholder={props.language.t("home.chat.placeholder") || "Escribe un mensaje o haz una pregunta..."}
          rows={3}
          value={promptText()}
          onInput={(e) => setPromptText(e.currentTarget.value)}
          onKeyDown={handleKeyDown}
        />
        <div class="mt-2 flex items-center justify-between pt-2 border-t border-v2-border-border-muted/50">
          <div class="flex items-center gap-2">
            <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium bg-cyan-400/10 text-cyan-400 border border-cyan-400/20">
              <IconV2 name="sparkles" size="small" />
              <span>Tiancode AI</span>
            </span>
          </div>
          <ButtonV2
            data-action="home-chat-submit"
            variant="contrast"
            size="small"
            icon="arrow-up"
            disabled={!promptText().trim()}
            onClick={handleSubmit}
            class="rounded-xl px-3.5 h-8 font-medium shadow-sm transition-transform active:scale-95 disabled:opacity-40"
          >
            {props.language.t("home.chat.send") || "Enviar"}
          </ButtonV2>
        </div>
      </div>

      {/* Suggestion Pills */}
      <div class="w-full flex flex-wrap justify-center gap-2">
        <For each={suggestions()}>
          {(item) => (
            <button
              type="button"
              class="flex items-center gap-2 px-3 py-1.5 rounded-full border border-v2-border-border-muted bg-v2-background-bg-layer-01/60 hover:bg-v2-background-bg-layer-02 hover:border-cyan-400/40 text-[12px] text-v2-text-text-muted hover:text-v2-text-text-base transition-colors text-left"
              onClick={() => handleSuggestion(item.prompt)}
            >
              <span>{item.label}</span>
            </button>
          )}
        </For>
      </div>

      {/* Web & App card option */}
      <div class="w-full max-w-[460px] pt-1">
        <HomeWebAppCard />
      </div>
    </div>
  )
}

function HomeSessionSkeleton(props: { label: string }) {  return (
    <div class="flex min-w-0 flex-col gap-4">
      <div class="flex h-7 min-w-0 items-center justify-between px-4">
        <div class={HOME_SECTION_LABEL}>{props.label}</div>
      </div>
      <div class="flex min-w-0 flex-col gap-px" aria-hidden="true">
        <For each={[0, 1, 2, 3]}>{() => <div class="h-10 rounded-[6px] bg-v2-background-bg-deep opacity-70" />}</For>
      </div>
    </div>
  )
}
