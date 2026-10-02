import { Popover } from "@kobalte/core/popover"
import { For, Show, createMemo, createResource, type JSX } from "solid-js"
import { createStore } from "solid-js/store"
import { DiffChanges } from "@tiancode-ai/ui/diff-changes"
import { Icon } from "@tiancode-ai/ui/icon"
import { IconButtonV2 } from "@tiancode-ai/ui/v2/icon-button-v2"
import { Icon as IconV2 } from "@tiancode-ai/ui/v2/icon"
import { ProjectAvatar } from "@tiancode-ai/ui/v2/project-avatar-v2"
import { Switch } from "@tiancode-ai/ui/v2/switch-v2"
import { getFilename } from "@tiancode-ai/core/util/path"
import { useCommand } from "@/context/command"
import { useLanguage } from "@/context/language"
import { getProjectAvatarVariant } from "@/context/layout"
import { usePlatform } from "@/context/platform"
import { useSDK } from "@/context/sdk"
import { useSync } from "@/context/sync"
import { displayName, getProjectAvatarSource } from "@/pages/layout/helpers"
import { showToast } from "@/utils/toast"
import { mcpStatusLabel, pluginEntries, summaryConfigPath, type SummaryService } from "./session-summary"
import "./session-summary-popover.css"

const SERVICES: { type: SummaryService; label: "session.summary.mcp" | "session.summary.plugins" | "session.summary.skills" | "session.summary.lsp" }[] = [
  { type: "mcp", label: "session.summary.mcp" },
  { type: "plugins", label: "session.summary.plugins" },
  { type: "skills", label: "session.summary.skills" },
  { type: "lsp", label: "session.summary.lsp" },
]

const SummaryIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.1" aria-hidden="true">
    <rect x="2" y="2.5" width="12" height="11" rx="1.5" />
    <path d="M2 6h12M5 9h3M5 11h5" stroke-linecap="round" />
  </svg>
)

/** opencode's session summary: project, location, branch, changes and the extensions in use. */
export function SessionSummaryPopover(props: { sessionID?: string; onReview: () => void }) {
  const language = useLanguage()
  const sync = useSync()
  const sdk = useSDK()
  const [store, setStore] = createStore({
    open: false,
    projectExpanded: true,
    extensionsExpanded: true,
    submenu: undefined as SummaryService | undefined,
  })
  const project = createMemo(() => sync().project)
  const directory = () => sdk().directory
  const local = createMemo(() => !project() || project()!.worktree === directory())
  const branch = () => sync().data.vcs?.branch
  // Live session.diff events fill session_diff; after a reload only the turns' own summaries
  // remain, so fall back to those (latest entry per file) instead of "loading" forever.
  const diffs = createMemo(() => {
    const id = props.sessionID
    if (!id) return undefined
    const live = sync().data.session_diff[id]
    if (live) return live
    const byFile = new Map<string, { additions: number; deletions: number }>()
    for (const message of sync().data.message[id] ?? []) {
      if (message.role !== "user") continue
      for (const diff of message.summary?.diffs ?? []) if (diff.file) byFile.set(diff.file, diff)
    }
    return [...byFile.values()]
  })

  const setOpen = (open: boolean) => setStore({ open, submenu: open ? store.submenu : undefined })

  const command = useCommand()
  command.register("session-summary", () => [
    {
      id: "session.summary.toggle",
      title: language.t("session.summary.toggle"),
      category: language.t("command.category.view"),
      keybind: "mod+shift+y",
      onSelect: () => setOpen(!store.open),
    },
  ])

  return (
    <Popover open={store.open} onOpenChange={setOpen} placement="bottom-end" gutter={8} overflowPadding={16}>
      <Popover.Trigger
        as={IconButtonV2}
        type="button"
        variant="ghost-muted"
        size="large"
        class="!w-9 shrink-0"
        data-action="session-summary"
        state={store.open ? "pressed" : undefined}
        aria-label={language.t("session.summary.title")}
        title={language.t("session.summary.title")}
        icon={<SummaryIcon />}
      />
      <Popover.Portal>
        <Popover.Content class="session-summary-popover" aria-label={language.t("session.summary.title")}>
          <section class="session-summary-card">
            <button
              type="button"
              class="session-summary-row session-summary-heading"
              aria-expanded={store.projectExpanded}
              onClick={() => setStore("projectExpanded", (value) => !value)}
            >
              <Show when={project()} fallback={<IconV2 name="folder" />}>
                {(info) => (
                  <ProjectAvatar
                    class="session-summary-avatar"
                    fallback={displayName(info())}
                    src={getProjectAvatarSource(info().id, info().icon)}
                    variant={getProjectAvatarVariant(info().icon?.color)}
                  />
                )}
              </Show>
              <span class="session-summary-label">
                {project() ? displayName(project()!) : getFilename(directory())}
              </span>
              <Icon name="chevron-down" size="small" class="session-summary-disclosure" />
            </button>
            <Show when={store.projectExpanded}>
              <div class="session-summary-rows">
                <div class="session-summary-row" title={directory()}>
                  <IconV2 name={local() ? "monitor" : "workspace"} />
                  <span class="session-summary-label">
                    {local() ? language.t("session.summary.local") : getFilename(directory())}
                  </span>
                </div>
                <div class="session-summary-row">
                  <IconV2 name="branch" />
                  <span class="session-summary-label">{branch() ?? language.t("session.summary.noBranch")}</span>
                </div>
                <button
                  type="button"
                  class="session-summary-row"
                  disabled={!props.sessionID}
                  onClick={() => {
                    setOpen(false)
                    props.onReview()
                  }}
                >
                  <IconV2 name="review" />
                  <span class="session-summary-label">
                    <Show
                      when={diffs()}
                      fallback={
                        <span class="session-summary-muted">
                          {language.t(props.sessionID ? "session.review.loadingChanges" : "session.review.noChanges")}
                        </span>
                      }
                    >
                      {(list) => (
                        <Show
                          when={list().length > 0}
                          fallback={<span class="session-summary-muted">{language.t("session.review.noChanges")}</span>}
                        >
                          <span>{language.t("session.summary.changedFiles", { count: list().length })}</span>
                          <span class="session-summary-muted">·</span>
                          <DiffChanges changes={list()} />
                        </Show>
                      )}
                    </Show>
                  </span>
                </button>
              </div>
            </Show>
          </section>

          <section class="session-summary-card">
            <button
              type="button"
              class="session-summary-row session-summary-heading"
              aria-expanded={store.extensionsExpanded}
              onClick={() => setStore({ extensionsExpanded: !store.extensionsExpanded, submenu: undefined })}
            >
              <IconV2 name="grid-plus" />
              <span class="session-summary-label">{language.t("session.summary.extensions")}</span>
              <Icon name="chevron-down" size="small" class="session-summary-disclosure" />
            </button>
            <Show when={store.extensionsExpanded}>
              <div class="session-summary-rows">
                <For each={SERVICES}>
                  {(service) => (
                    <ServiceMenu
                      service={service.type}
                      label={language.t(service.label)}
                      open={store.submenu === service.type}
                      onOpenChange={(open) => setStore("submenu", open ? service.type : undefined)}
                    />
                  )}
                </For>
              </div>
            </Show>
          </section>
        </Popover.Content>
      </Popover.Portal>
    </Popover>
  )
}

function ServiceMenu(props: {
  service: SummaryService
  label: string
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  return (
    <Popover open={props.open} onOpenChange={props.onOpenChange} placement="left-start" gutter={6} modal={false}>
      <Popover.Trigger as="button" type="button" class="session-summary-row" data-service={props.service}>
        <ServiceIcon service={props.service} />
        <span class="session-summary-label">{props.label}</span>
        <span class="session-summary-caret" aria-hidden="true" />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content class="session-service-menu" data-service={props.service} aria-label={props.label}>
          <Show when={props.service === "mcp"}>
            <McpList />
          </Show>
          <Show when={props.service === "plugins"}>
            <PluginList />
          </Show>
          <Show when={props.service === "skills"}>
            <SkillList />
          </Show>
          <Show when={props.service === "lsp"}>
            <LspList />
          </Show>
          <ConfigLink service={props.service} />
        </Popover.Content>
      </Popover.Portal>
    </Popover>
  )
}

function ServiceIcon(props: { service: SummaryService }) {
  if (props.service === "mcp") return <Icon name="mcp" size="small" />
  if (props.service === "plugins") return <Icon name="plugin" size="small" />
  if (props.service === "lsp") return <Icon name="code" size="small" />
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.1" aria-hidden="true">
      <path d="M8 3L1.5 6 8 9l6.5-3L8 3zM4 7.3V11c1 .9 2.4 1.4 4 1.4s3-.5 4-1.4V7.3" stroke-linejoin="round" />
    </svg>
  )
}

function McpList() {
  const language = useLanguage()
  const sync = useSync()
  const [state, setState] = createStore({ pending: undefined as string | undefined })
  const names = createMemo(() => Object.keys(sync().data.mcp ?? {}).sort((a, b) => a.localeCompare(b)))
  const change = (name: string, enabled: boolean) => {
    if (state.pending) return
    setState("pending", name)
    void sync()
      .mcp.setEnabled(name, enabled)
      .catch((error: unknown) =>
        showToast({
          variant: "error",
          title: language.t("common.requestFailed"),
          description: error instanceof Error ? error.message : String(error),
        }),
      )
      .finally(() => setState("pending", undefined))
  }
  return (
    <Show when={names().length > 0} fallback={<ServiceEmpty title={language.t("session.summary.mcp.empty")} />}>
      <h3 class="session-service-title">{language.t("session.summary.mcp.title")}</h3>
      <div class="session-service-list">
        <For each={names()}>
          {(name) => {
            const status = () => sync().data.mcp?.[name]?.status
            const label = () => mcpStatusLabel(status())
            const error = () => {
              const info = sync().data.mcp?.[name]
              return info?.status === "failed" ? info.error : undefined
            }
            return (
              <div class="session-service-row" title={error() ?? name}>
                <span class="session-service-dot" data-status={status()} aria-hidden="true" />
                <span class="session-summary-label">{name}</span>
                <Show when={label()}>
                  {(key) => <span class="session-service-status">{language.t(key())}</span>}
                </Show>
                <Switch
                  checked={status() !== "disabled"}
                  disabled={state.pending === name || status() === "pending"}
                  onChange={(checked) => change(name, checked)}
                  aria-label={name}
                />
              </div>
            )
          }}
        </For>
      </div>
    </Show>
  )
}

function PluginList() {
  const language = useLanguage()
  const sync = useSync()
  const plugins = createMemo(() => pluginEntries(sync().data.config.plugin))
  return (
    <Show when={plugins().length > 0} fallback={<ServiceEmpty title={language.t("session.summary.plugins.empty")} />}>
      <h3 class="session-service-title">{language.t("session.summary.plugins.configured")}</h3>
      <div class="session-service-list">
        <For each={plugins()}>
          {(plugin) => (
            <div class="session-service-row" title={plugin.spec}>
              <span class="session-service-dot" data-status={plugin.enabled ? "connected" : "disabled"} aria-hidden="true" />
              <span class="session-summary-label">{plugin.name}</span>
              <Show when={!plugin.enabled}>
                <span class="session-service-status">{language.t("session.summary.disabled")}</span>
              </Show>
            </div>
          )}
        </For>
      </div>
    </Show>
  )
}

function SkillList() {
  const language = useLanguage()
  const sdk = useSDK()
  const [skills] = createResource(
    () => sdk().directory,
    async (directory) => {
      const [list, config] = await Promise.all([
        sdk()
          .client.app.skills({ directory }, { throwOnError: false })
          .then((res) => (Array.isArray(res?.data) ? res.data : []))
          .catch(() => []),
        sdk()
          .client.config.get({ directory })
          .then((res) => res.data as { skills?: { disabled?: string[] } } | undefined)
          .catch(() => undefined),
      ])
      const disabled = new Set(config?.skills?.disabled ?? [])
      return list
        .map((skill: { name: string }) => ({ name: skill.name, enabled: !disabled.has(skill.name) }))
        .toSorted((a, b) => a.name.localeCompare(b.name))
    },
  )
  return (
    <Show when={!skills.loading || skills.latest} fallback={<div class="session-service-message">{language.t("common.loading")}</div>}>
      <Show
        when={(skills.latest ?? []).length > 0}
        fallback={<ServiceEmpty title={language.t("session.summary.skills.empty")} />}
      >
        <h3 class="session-service-title">{language.t("session.summary.skills.configured")}</h3>
        <div class="session-service-list">
          <For each={skills.latest ?? []}>
            {(skill) => (
              <div class="session-service-row" title={skill.name}>
                <span class="session-service-dot" data-status={skill.enabled ? "connected" : "disabled"} aria-hidden="true" />
                <span class="session-summary-label">{skill.name}</span>
              </div>
            )}
          </For>
        </div>
      </Show>
    </Show>
  )
}

function LspList() {
  const language = useLanguage()
  const sync = useSync()
  const items = createMemo(() => sync().data.lsp ?? [])
  return (
    <Show when={items().length > 0} fallback={<ServiceEmpty title={language.t("session.summary.lsp.empty")} />}>
      <h3 class="session-service-title">{language.t("session.summary.lsp.configured")}</h3>
      <div class="session-service-list">
        <For each={items()}>
          {(item) => (
            <div class="session-service-row">
              <span class="session-service-dot" data-status={item.status === "connected" ? "connected" : "failed"} aria-hidden="true" />
              <span class="session-summary-label">{item.name || item.id}</span>
              <Show when={item.status !== "connected"}>
                <span class="session-service-status">{language.t("session.summary.failed")}</span>
              </Show>
            </div>
          )}
        </For>
      </div>
    </Show>
  )
}

function ServiceEmpty(props: { title: string }): JSX.Element {
  return <div class="session-service-empty">{props.title}</div>
}

/** "Configuration file": reveals the project's tiancode.json, or the global one when it has none. */
function ConfigLink(props: { service: SummaryService }) {
  const language = useLanguage()
  const platform = usePlatform()
  const sync = useSync()
  const sdk = useSDK()
  const [state, setState] = createStore({ opening: false })
  const open = async () => {
    if (state.opening) return
    setState("opening", true)
    const candidates = summaryConfigPath({ directory: sdk().directory, config: sync().data.path?.config })
    const reveal = platform.revealPath
    const shown = reveal
      ? await candidates.reduce<Promise<boolean>>(
          (found, path) => found.then((done) => done || reveal(path).catch(() => false)),
          Promise.resolve(false),
        )
      : false
    if (!shown && platform.openPath) await platform.openPath(sdk().directory).catch(() => undefined)
    if (!shown && !platform.openPath)
      showToast({ title: language.t("session.summary.configFile"), description: candidates[0] })
    setState("opening", false)
  }
  return (
    <>
      <span class="session-service-separator" role="separator" />
      <button
        type="button"
        class="session-service-config"
        data-service={props.service}
        disabled={state.opening}
        onClick={() => void open()}
      >
        <Icon name="settings-gear" size="small" />
        <span class="session-summary-label">{language.t("session.summary.configFile")}</span>
      </button>
    </>
  )
}
