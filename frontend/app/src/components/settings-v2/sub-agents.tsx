import { ButtonV2 } from "@tiancode-ai/ui/v2/button-v2"
import { SegmentedControlItemV2, SegmentedControlV2 } from "@tiancode-ai/ui/v2/segmented-control-v2"
import { Switch } from "@tiancode-ai/ui/v2/switch-v2"
import { TextInputV2 } from "@tiancode-ai/ui/v2/text-input-v2"
import type { Agent } from "@tiancode-ai/sdk/v2/client"
import { type Component, createEffect, createMemo, createResource, createSignal, For, on, Show } from "solid-js"
import { createStore } from "solid-js/store"
import { useLanguage } from "@/context/language"
import { useServerSDK } from "@/context/server-sdk"
import { normalizeAgentList } from "@/context/global-sync/utils"
import { showToast } from "@/utils/toast"
import { SettingsPagerV2 } from "./parts/pager"
import { RlmHierarchyTree } from "@/components/visualization/rlm-hierarchy-tree"
import {
  agentDisablePatch,
  buildDelegationTree,
  mergePanelAgents,
  scopeTarget,
  type AgentPresentation,
  type PanelAgent,
} from "./sub-agents-logic"
import "./sub-agents.css"

const ToolPermissionNames = ["read", "grep", "glob", "bash", "edit", "write", "webfetch", "websearch", "todowrite"]

const StatusOptions: { id: "all" | "enabled" | "disabled"; label: string }[] = [
  { id: "all", label: "settings.subAgents.list.filter.all" },
  { id: "enabled", label: "settings.subAgents.list.filter.enabled" },
  { id: "disabled", label: "settings.subAgents.list.filter.disabled" },
]

const AGENT_META = [
  ["build", "🔨", "#3B82F6"],
  ["plan", "📋", "#8B5CF6"],
  ["webapp", "🌐", "#06B6D4"],
  ["general", "🔍", "#10B981"],
  ["explore", "🧭", "#F59E0B"],
  ["software-architect", "🏛️", "#3B82F6"],
  ["fullstack-coder", "⚡", "#8B5CF6"],
  ["ui-ux-master", "🎨", "#EC4899"],
  ["performance-optimizer", "🚀", "#F97316"],
  ["database-architect", "🗄️", "#EAB308"],
  ["qa-e2e-tester", "🧪", "#10B981"],
  ["python-data-engineer", "🐍", "#3776AB"],
  ["mobile-app-developer", "📱", "#10B981"],
  ["cloud-devops-engineer", "☁️", "#0284C7"],
  ["hermes-researcher", "🔬", "#06B6D4"],
  ["marketing-strategist", "📣", "#F59E0B"],
  ["reverse-engineer", "🔎", "#A855F7"],
  ["pentest", "🕵️", "#E11D48"],
  ["llm-redteam", "🔐", "#C026D3"],
] as const

type StatusId = "all" | "enabled" | "disabled"

export const SettingsSubAgentsV2: Component<{
  directory?: string
  active?: boolean
}> = (props) => {
  const language = useLanguage()
  const serverSdk = useServerSDK()

  const [scope, setScope] = createSignal<"project" | "global">(props.directory ? "project" : "global")

  const params = () => (props.directory ? { directory: props.directory } : undefined)
  // Which config file this panel reads and writes. Both resources take it as their source: a
  // createResource with no source argument runs its fetcher once inside untrack, so the scope
  // selector used to change the toast and nothing else.
  const target = createMemo(() => scopeTarget(scope(), props.directory))

  const [configData, { refetch: refetchConfig }] = createResource(
    target,
    async (where) => {
      try {
        const res = await (
          where.kind === "global"
            ? serverSdk().client.global.config.get()
            : serverSdk().client.config.get({ directory: where.directory })
        ).catch(() => undefined)
        const raw = {
          ...((res?.data as any)?.agents ?? {}),
          ...((res?.data as any)?.agent ?? {}),
        }
        return raw as Record<string, { description?: string; mode?: string; disable?: boolean; disabled?: boolean }>
      } catch {
        return {}
      }
    },
    { initialValue: {} },
  )

  const [agents, { refetch }] = createResource<{ items: Agent[]; failed: boolean }, ReturnType<typeof target>>(
    target,
    async (_, info) => {
      try {
        const p = params()
        const res =
          (await serverSdk().protocol) === "v1"
            ? await serverSdk().createClient({ directory: p?.directory, throwOnError: true }).app.agents()
            : await serverSdk().api.agent.list(p ? { location: p } : undefined)
        if (!Array.isArray(res?.data)) throw new Error("Invalid agent catalog response")
        return { items: normalizeAgentList(res.data), failed: false }
      } catch {
        return { items: info.value?.items ?? [], failed: true }
      }
    },
    { initialValue: { items: [] as Agent[], failed: false } },
  )

  // Refresh persisted enablement when returning from another settings tab.
  createEffect(
    on(
      () => props.active,
      (active, previous) => {
        if (!active || previous) return
        void refetchConfig()
        void refetch()
      },
      { defer: true },
    ),
  )

  const [agentStatusOverrides, setAgentStatusOverrides] = createSignal<Record<string, boolean>>({})
  const [pending, setPending] = createStore<Record<string, boolean>>({})

  const isAgentActive = (agentName: string) => {
    const overrides = agentStatusOverrides()
    if (agentName in overrides) {
      return overrides[agentName]
    }
    const conf = configData()
    if (conf && (conf[agentName]?.disable === true || conf[agentName]?.disabled === true)) {
      return false
    }
    const serverList = agents().items
    const match = serverList.find((a) => a?.name === agentName)
    if (match && ((match as any).disabled === true || (match as any).mode === "disabled")) {
      return false
    }
    // The backend drops a disabled agent from its list entirely, so an agent we only know about
    // from config or from the built-in catalogue is switched off, not merely unseen.
    if (!match && !agents.loading) return false
    return true
  }

  const toggleAgent = async (agentName: string, enable: boolean) => {
    if (pending[agentName]) return
    setPending(agentName, true)
    setAgentStatusOverrides((prev) => ({ ...prev, [agentName]: enable }))
    // Only this agent's {disable} goes over the wire. Copying configData() sent the merged
    // `cfg.agent` map back — every markdown agent's parsed Info, system prompt included — so one
    // switch wrote every agent's prompt into the repository's tiancode.json.
    const where = target()
    const config = agentDisablePatch(agentName, enable)
    try {
      await (where.kind === "global"
        ? serverSdk().client.global.config.update({ config })
        : serverSdk().client.config.update({ directory: where.directory, config }))
      await Promise.all([refetchConfig(), refetch()])
      showToast({
        variant: "success",
        title: language.t(enable ? "settings.subAgents.toggle.enabled" : "settings.subAgents.toggle.disabled", {
          name: agentName,
        }),
        description: language.t(
          where.kind === "project" ? "settings.subAgents.scope.project.hint" : "settings.subAgents.scope.global.hint",
        ),
      })
    } catch {
      showToast({ variant: "error", title: language.t("settings.subAgents.toggle.failed") })
    } finally {
      setAgentStatusOverrides((prev) => {
        const next = { ...prev }
        delete next[agentName]
        return next
      })
      setPending(agentName, false)
    }
  }

  // The server catalog remains authoritative for the integrated agents' availability.
  const agentList = createMemo<PanelAgent[]>(() =>
    mergePanelAgents({
      server: agents().items,
      meta: Object.fromEntries(
        AGENT_META.map(([name, icon, color]) => [
          name,
          {
            title: language.t(`settings.subAgents.catalog.${name}.title`),
            role: language.t(`settings.subAgents.catalog.${name}.role`),
            description: language.t(`settings.subAgents.catalog.${name}.description`),
            category: language.t("settings.subAgents.meta.category.default"),
            icon,
            color,
          } satisfies AgentPresentation,
        ]),
      ),
      config: configData() ?? {},
      isEnabled: isAgentActive,
      toolPermissions: ToolPermissionNames,
      fallback: {
        role: language.t("settings.subAgents.meta.role.default"),
        category: language.t("settings.subAgents.meta.category.default"),
      },
    }),
  )

  const [query, setQuery] = createSignal("")
  const [status, setStatus] = createSignal<StatusId>("all")

  // "{{count}} tools" rendered "1 tools"; the dictionary carries a .one/.other family now.
  const toolsSummary = (count: number) => language.plural("settings.subAgents.list.tools.summary", count)

  const describe = (agent: PanelAgent) => agent.description

  const matchesQuery = (agent: PanelAgent) => {
    const needle = query().trim().toLowerCase()
    if (!needle) return true
    return (
      agent.name.toLowerCase().includes(needle) ||
      agent.title.toLowerCase().includes(needle) ||
      (agent.description ?? "").toLowerCase().includes(needle)
    )
  }

  const matchesStatus = (agent: PanelAgent) => {
    const s = status()
    if (s === "enabled") return agent.enabled
    if (s === "disabled") return !agent.enabled
    return true
  }

  const visibleAgents = createMemo(() =>
    agentList().filter(
      (a) =>
        a.builtin &&
        a.mode === "subagent" &&
        !["general", "explore"].includes(a.name) &&
        matchesQuery(a) &&
        matchesStatus(a),
    ),
  )
  const visibleBuiltinAgents = createMemo(() => visibleAgents().filter((a) => a.builtin))

  // Paginación 10x10 para Sub-Agentes sin scroll excesivo
  const BUILTIN_PAGE_SIZE = 10
  const [builtinPage, setBuiltinPage] = createSignal(1)
  const builtinTotal = () => Math.max(1, Math.ceil(visibleBuiltinAgents().length / BUILTIN_PAGE_SIZE))
  const pageBuiltinAgents = createMemo(() => {
    const page = Math.min(builtinPage(), builtinTotal())
    const start = (page - 1) * BUILTIN_PAGE_SIZE
    return { items: visibleBuiltinAgents().slice(start, start + BUILTIN_PAGE_SIZE), page, total: builtinTotal() }
  })

  createEffect(() => {
    if (builtinPage() > builtinTotal()) setBuiltinPage(builtinTotal())
  })

  createEffect(() => {
    query()
    status()
    setBuiltinPage(1)
  })

  const delegationTree = createMemo(() => buildDelegationTree(agentList().filter((agent) => agent.builtin)))

  const agentRow = (agent: PanelAgent) => (
    <div class="settings-v2-subagents-row">
      <div
        class="settings-v2-subagents-cell gap-2.5 pr-2"
        data-label={language.t("settings.subAgents.list.column.agent")}
      >
        <div
          class="settings-v2-sub-agents-card-avatar shrink-0 size-8 text-base rounded-lg flex items-center justify-center"
          style={{
            "background-color": `color-mix(in srgb, ${agent.color} 18%, transparent)`,
            "border-color": `color-mix(in srgb, ${agent.color} 40%, transparent)`,
          }}
        >
          {agent.icon}
        </div>
        <div class="flex flex-col min-w-0">
          <span class="text-xs font-semibold text-v2-text-text-base truncate">{agent.title}</span>
          <span class="text-[10px] font-mono text-v2-text-text-muted truncate">@{agent.name}</span>
        </div>
      </div>

      <div
        class="settings-v2-subagents-cell flex-col items-start gap-1 pr-3"
        data-label={language.t("settings.subAgents.list.column.role")}
      >
        <div class="flex items-center gap-1.5 flex-wrap">
          <span class="settings-v2-sub-agents-card-category text-[9.5px] px-1.5 py-0.5">{agent.category}</span>
          <span class="text-[11px] font-medium text-v2-text-text-muted truncate max-w-[200px]">{agent.role}</span>
        </div>
        <p class="text-[11px] text-v2-text-text-muted line-clamp-1 leading-normal m-0">{describe(agent)}</p>
      </div>

      <div class="settings-v2-subagents-cell" data-label={language.t("settings.subAgents.list.column.model")}>
        <span class="settings-v2-sub-agents-badge settings-v2-sub-agents-badge--accent text-[10.5px]">
          {agent.model ?? language.t("settings.subAgents.list.model.inherit")}
        </span>
      </div>

      <div class="settings-v2-subagents-cell" data-label={language.t("settings.subAgents.list.column.tools")}>
        <span class="settings-v2-sub-agents-badge text-[10.5px]">
          {agent.tools.restricted ? toolsSummary(agent.tools.allowed) : language.t("settings.subAgents.list.tools.all")}
        </span>
      </div>

      <div
        class="settings-v2-subagents-cell settings-v2-subagents-cell--status"
        data-label={language.t("settings.subAgents.list.column.status")}
      >
        <Switch
          checked={agent.enabled}
          disabled={agent.name === "build" || pending[agent.name]}
          onChange={(checked) => toggleAgent(agent.name, checked)}
        />
        <span class="settings-v2-chip text-[10px]" data-tone={agent.enabled ? "accent" : "muted"}>
          {language.t(agent.enabled ? "settings.subAgents.status.active" : "settings.subAgents.status.inactive")}
        </span>
      </div>
    </div>
  )

  const tableHead = () => (
    <div class="settings-v2-subagents-thead">
      <div>{language.t("settings.subAgents.list.column.agent")}</div>
      <div>{language.t("settings.subAgents.list.column.role")}</div>
      <div>{language.t("settings.subAgents.list.column.model")}</div>
      <div>{language.t("settings.subAgents.list.column.tools")}</div>
      <div>{language.t("settings.subAgents.list.column.status")}</div>
    </div>
  )

  return (
    <>
      <div class="settings-v2-tab-header settings-v2-tab-header--stacked">
        <div class="settings-v2-tab-header-row">
          <div class="settings-v2-sub-agents-header-copy">
            <h2 class="settings-v2-tab-title">{language.t("settings.subAgents.title")}</h2>
            <p class="settings-v2-tab-description">{language.t("settings.subAgents.integrated.description")}</p>
          </div>
          <div class="flex items-center gap-2 shrink-0">
            <span class="settings-v2-chip" data-tone="accent">
              {language.t("settings.subAgents.native.count", { count: visibleBuiltinAgents().length })}
            </span>
          </div>
        </div>
      </div>

      <div class="settings-v2-tab-body settings-v2-sub-agents">
        <div class="settings-v2-sub-agents-scope">
          <div class="settings-v2-sub-agents-scope-control">
            <span class="settings-v2-sub-agents-scope-label">{language.t("settings.subAgents.scope.label")}</span>
            <SegmentedControlV2
              value={scope()}
              onChange={(value) => {
                if (value === "project" || value === "global") setScope(value)
              }}
            >
              <SegmentedControlItemV2 value="project" disabled={!props.directory}>
                <span>
                  {language.t("settings.subAgents.scope.project")}
                  {props.directory ? ` · ${props.directory.split(/[\\/]/).pop()}` : ""}
                </span>
              </SegmentedControlItemV2>
              <SegmentedControlItemV2 value="global">
                <span>{language.t("settings.subAgents.scope.global")}</span>
              </SegmentedControlItemV2>
            </SegmentedControlV2>
          </div>
          <p class="settings-v2-sub-agents-scope-hint">
            {language.t(
              scope() === "project" ? "settings.subAgents.scope.project.hint" : "settings.subAgents.scope.global.hint",
            )}
          </p>
        </div>

        {/* Buscador, filtro y las dos formas de crear un sub-agente. */}
        <div class="settings-v2-sub-agents-toolbar">
          <div class="settings-v2-sub-agents-toolbar-row">
            <TextInputV2
              type="search"
              appearance="base"
              value={query()}
              onInput={(event) => setQuery(event.currentTarget.value)}
              placeholder={language.t("settings.subAgents.list.search.placeholder")}
              aria-label={language.t("settings.subAgents.list.search.placeholder")}
              spellcheck={false}
              autocomplete="off"
            />
            <SegmentedControlV2
              value={status()}
              onChange={(value) => {
                if (value === "all" || value === "enabled" || value === "disabled") setStatus(value)
              }}
            >
              <For each={StatusOptions}>
                {(option) => (
                  <SegmentedControlItemV2 value={option.id}>
                    <span>{language.t(option.label as Parameters<typeof language.t>[0])}</span>
                  </SegmentedControlItemV2>
                )}
              </For>
            </SegmentedControlV2>
          </div>
        </div>

        {/* 2. Sub-Agentes Integrados de Élite */}
        <Show when={visibleBuiltinAgents().length > 0}>
          <div class="settings-v2-section mb-6">
            <div class="flex items-center justify-between mb-2.5">
              <div class="flex items-center gap-2">
                <h3 class="settings-v2-section-title">{language.t("settings.subAgents.list.group.builtin")}</h3>
                <span class="settings-v2-sub-agents-group-count">{visibleBuiltinAgents().length}</span>
              </div>
              <span class="text-xs text-v2-text-text-muted">{language.t("settings.subAgents.list.builtin.hint")}</span>
            </div>

            <div class="settings-v2-subagents-table">
              {tableHead()}
              <For each={pageBuiltinAgents().items}>{(agent) => agentRow(agent)}</For>
            </div>

            <Show when={pageBuiltinAgents().total > 1}>
              <SettingsPagerV2
                page={pageBuiltinAgents().page}
                totalPages={pageBuiltinAgents().total}
                onPage={(p) => setBuiltinPage(p)}
              />
            </Show>
          </div>
        </Show>

        <Show when={agents().failed}>
          <div role="alert" class="flex flex-wrap items-center gap-3 py-3 text-sm text-v2-state-fg-warning">
            <span>{language.t("settings.subAgents.list.loadFailed")}</span>
            <ButtonV2 onClick={() => void refetch()}>{language.t("settings.subAgents.list.retry")}</ButtonV2>
          </div>
        </Show>
        <Show when={visibleAgents().length === 0 && !agents().failed && !agents.loading}>
          <p class="settings-v2-sub-agents-scope-hint">{language.t("settings.subAgents.list.empty")}</p>
        </Show>

        {/* 3. Quién delega en quién, derivado de la misma lista de arriba. */}
        <div class="settings-v2-section mb-6">
          <RlmHierarchyTree roots={delegationTree()} />
        </div>

        <div class="settings-v2-sub-agents-list-footer">
          {language.t("settings.subAgents.list.footer", {
            count: visibleAgents().length,
            enabled: visibleAgents().filter((agent) => agent.enabled).length,
          })}
        </div>
      </div>
    </>
  )
}
