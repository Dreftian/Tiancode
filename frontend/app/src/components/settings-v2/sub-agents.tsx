import { ButtonV2 } from "@tiancode-ai/ui/v2/button-v2"
import { SegmentedControlItemV2, SegmentedControlV2 } from "@tiancode-ai/ui/v2/segmented-control-v2"
import { SelectV2 } from "@tiancode-ai/ui/v2/select-v2"
import { Switch } from "@tiancode-ai/ui/v2/switch-v2"
import { TextInputV2 } from "@tiancode-ai/ui/v2/text-input-v2"
import { TextareaV2 } from "@tiancode-ai/ui/v2/textarea-v2"
import type { Agent } from "@tiancode-ai/sdk/v2/client"
import { type Component, createEffect, createMemo, createResource, createSignal, For, on, Show } from "solid-js"
import { useLanguage } from "@/context/language"
import { useModels } from "@/context/models"
import { useServerSDK } from "@/context/server-sdk"
import { authTokenFromCredentials } from "@/utils/server"
import { showToast } from "@/utils/toast"
import { SettingsPagerV2 } from "./parts/pager"
import { RlmHierarchyTree } from "@/components/visualization/rlm-hierarchy-tree"
import {
  agentDisablePatch,
  buildDelegationTree,
  draftFromGenerated,
  mergePanelAgents,
  scopeTarget,
  validateAgentDraft,
  type AgentDraft,
  type AgentPresentation,
  type PanelAgent,
} from "./sub-agents-logic"
import "./sub-agents.css"

const AgentColors: { id: string; value: string; label: string }[] = [
  { id: "yellow", value: "#EAB308", label: "settings.subAgents.form.color.yellow" },
  { id: "red", value: "#EF4444", label: "settings.subAgents.form.color.red" },
  { id: "orange", value: "#F97316", label: "settings.subAgents.form.color.orange" },
  { id: "green", value: "#10B981", label: "settings.subAgents.form.color.green" },
  { id: "cyan", value: "#06B6D4", label: "settings.subAgents.form.color.cyan" },
  { id: "blue", value: "#3B82F6", label: "settings.subAgents.form.color.blue" },
  { id: "purple", value: "#8B5CF6", label: "settings.subAgents.form.color.purple" },
  { id: "pink", value: "#EC4899", label: "settings.subAgents.form.color.pink" },
]

const AgentTools: { id: string; label: string; sensitive: boolean }[] = [
  { id: "Read", label: "settings.subAgents.form.tools.read", sensitive: false },
  { id: "Grep", label: "settings.subAgents.form.tools.grep", sensitive: false },
  { id: "Glob", label: "settings.subAgents.form.tools.glob", sensitive: false },
  { id: "Bash", label: "settings.subAgents.form.tools.bash", sensitive: true },
  { id: "Edit", label: "settings.subAgents.form.tools.edit", sensitive: true },
  { id: "Write", label: "settings.subAgents.form.tools.write", sensitive: true },
  { id: "WebFetch", label: "settings.subAgents.form.tools.webFetch", sensitive: false },
  { id: "WebSearch", label: "settings.subAgents.form.tools.webSearch", sensitive: false },
  { id: "TodoWrite", label: "settings.subAgents.form.tools.todoWrite", sensitive: false },
]

const ToolPermissionNames = AgentTools.map((tool) => tool.id.toLowerCase())

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
type CreateMode = "manual" | "ai"

const emptyDraft = (): AgentDraft => ({
  name: "",
  description: "",
  mode: "subagent",
  prompt: "",
  color: "#3B82F6",
  model: "",
  tools: ["Read", "Grep", "Glob"],
  injectAgentsMd: false,
})

export const SettingsSubAgentsV2: Component<{
  directory?: string
  active?: boolean
}> = (props) => {
  const language = useLanguage()
  const serverSdk = useServerSDK()
  const models = useModels()

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

  const [agents, { refetch }] = createResource<Agent[], ReturnType<typeof target>>(
    target,
    async () => {
      try {
        const p = params()
        const res = await serverSdk()
          .api.agent.list(p ? { location: p } : undefined)
          .catch(() => ({ data: [] as Agent[] }))
        return (res?.data ?? []) as Agent[]
      } catch {
        return []
      }
    },
    { initialValue: [] },
  )

  // Coming back to the tab is an implicit "show me what is there now": this panel exists to show
  // the agent/*.md files on disk, and one added from outside the app would otherwise never appear.
  // Same convention as skills.tsx.
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

  const isAgentActive = (agentName: string) => {
    const overrides = agentStatusOverrides()
    if (agentName in overrides) {
      return overrides[agentName]
    }
    const conf = configData()
    if (conf && (conf[agentName]?.disable === true || conf[agentName]?.disabled === true)) {
      return false
    }
    const serverList = agents() ?? []
    const match = serverList.find((a) => a?.name === agentName)
    if (match && ((match as any).disabled === true || (match as any).mode === "disabled")) {
      return false
    }
    // The backend drops a disabled agent from its list entirely, so an agent we only know about
    // from config or from the built-in catalogue is switched off, not merely unseen.
    if (!match && !agents.loading) return false
    return true
  }

  const toggleAgent = (agentName: string, enable: boolean) => {
    // 1. Reacción individual e inmediata (0 ms) en el switch y chip
    setAgentStatusOverrides((prev) => ({ ...prev, [agentName]: enable }))

    // 2. Feedback visual instantáneo
    showToast({
      variant: "success",
      title: language.t(enable ? "settings.subAgents.toggle.enabled" : "settings.subAgents.toggle.disabled", {
        name: agentName,
      }),
      description: language.t(
        scope() === "project" ? "settings.subAgents.scope.project.hint" : "settings.subAgents.scope.global.hint",
      ),
    })

    // 3. Sincronización asíncrona en segundo plano sin congelar la animación.
    // Only this agent's {disable} goes over the wire. Copying configData() sent the merged
    // `cfg.agent` map back — every markdown agent's parsed Info, system prompt included — so one
    // switch wrote every agent's prompt into the repository's tiancode.json.
    const where = target()
    const config = agentDisablePatch(agentName, enable) as any

    void (
      where.kind === "global"
        ? serverSdk().client.global.config.update({ config })
        : serverSdk().client.config.update({ directory: where.directory, config })
    )
      .then(() => {
        void refetchConfig()
        void refetch()
      })
      .catch(() => {
        // Rollback en caso de error
        setAgentStatusOverrides((prev) => {
          const next = { ...prev }
          delete next[agentName]
          return next
        })
        showToast({
          variant: "error",
          title: language.t("settings.subAgents.toggle.failed"),
        })
      })
  }

  // The panel used to build its list from AGENT_META alone, which is why none of the user's own
  // agent/*.md files ever showed up. The server list is the source of truth now; the metadata
  // only decorates the agents that ship with Tiancode.
  const agentList = createMemo<PanelAgent[]>(() =>
    mergePanelAgents({
      server: agents() ?? [],
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

  const existingNames = createMemo(() => agentList().map((agent) => agent.name))

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

  const visibleAgents = createMemo(() => agentList().filter((a) => matchesQuery(a) && matchesStatus(a)))
  const visibleBuiltinAgents = createMemo(() => visibleAgents().filter((a) => a.builtin))
  const visibleCustomAgents = createMemo(() => visibleAgents().filter((a) => !a.builtin))

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

  const delegationTree = createMemo(() => buildDelegationTree(agentList()))

  /* ---------------------------------------------------------------- creation */

  const [creating, setCreating] = createSignal(false)
  const [createMode, setCreateMode] = createSignal<CreateMode>("manual")
  const [draft, setDraft] = createSignal<AgentDraft>(emptyDraft())
  const [saving, setSaving] = createSignal(false)
  const [nameError, setNameError] = createSignal<string | undefined>()
  const [descriptionError, setDescriptionError] = createSignal(false)
  const [generating, setGenerating] = createSignal(false)
  const [generatePrompt, setGeneratePrompt] = createSignal("")
  const [reviewing, setReviewing] = createSignal(false)

  const patchDraft = (patch: Partial<AgentDraft>) => setDraft((current) => ({ ...current, ...patch }))

  const modelOptions = createMemo(() => {
    const options = models.list().map((model) => ({
      providerID: model.provider.id as string,
      modelID: model.id as string,
      label: model.name as string,
      group: ((model.provider as { name?: string }).name ?? model.provider.id) as string,
    }))
    return [
      { providerID: "", modelID: "", label: language.t("settings.subAgents.generate.model.default"), group: "" },
      ...options,
    ]
  })

  // Default to whatever the user last talked to, so "generate" uses the model they are working
  // with rather than silently picking something else.
  const [selectedModel, setSelectedModel] = createSignal<{ providerID: string; modelID: string } | undefined>()
  const currentModelOption = createMemo(() => {
    const explicit = selectedModel()
    const recent = models.recent.list()[0]
    const key = explicit ?? (recent ? { providerID: recent.providerID, modelID: recent.modelID } : undefined)
    if (!key) return modelOptions()[0]
    return (
      modelOptions().find((option) => option.providerID === key.providerID && option.modelID === key.modelID) ??
      modelOptions()[0]
    )
  })

  const closeCreate = () => {
    setCreating(false)
    setReviewing(false)
    setNameError(undefined)
    setDescriptionError(false)
    setDraft(emptyDraft())
    setGeneratePrompt("")
  }

  const openCreate = (mode: CreateMode) => {
    setCreateMode(mode)
    setCreating(true)
  }

  const toggleTool = (tool: string, enabled: boolean) =>
    setDraft((current) => ({
      ...current,
      tools: enabled ? [...new Set([...current.tools, tool])] : current.tools.filter((item) => item !== tool),
    }))

  const generate = async () => {
    const description = generatePrompt().trim()
    if (!description) {
      showToast({ variant: "error", title: language.t("settings.subAgents.generate.needsDescription") })
      return
    }
    const serverHttp = serverSdk()?.server?.http
    if (!serverHttp?.url) {
      showToast({ variant: "error", title: language.t("settings.subAgents.generate.failed") })
      return
    }

    const headers: Record<string, string> = { "Content-Type": "application/json" }
    if (serverHttp.password) {
      headers["Authorization"] = `Basic ${authTokenFromCredentials({
        username: serverHttp.username,
        password: serverHttp.password,
      })}`
    }
    // Without a directory the workspace routing resolves to the server's default project, which
    // would draft against a different model than the one this panel is showing.
    const search = props.directory ? `?directory=${encodeURIComponent(props.directory)}` : ""
    const option = currentModelOption()

    setGenerating(true)
    try {
      const response = await fetch(`${serverHttp.url.replace(/\/+$/, "")}/agent/generate${search}`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          description,
          ...(option?.providerID && option.modelID ? { providerID: option.providerID, modelID: option.modelID } : {}),
        }),
      })

      if (!response.ok) {
        // A failure here is never silent: the backend answers 422 with a reason so the panel can
        // say "pick a model" instead of "something went wrong".
        const body = (await response.json().catch(() => undefined)) as
          | { data?: { reason?: string; message?: string } }
          | undefined
        const reason = body?.data?.reason
        showToast({
          variant: "error",
          title: language.t("settings.subAgents.generate.failed"),
          description:
            reason === "no-model"
              ? language.t("settings.subAgents.generate.failed.noModel")
              : (body?.data?.message ?? language.t("settings.subAgents.generate.failed.model")),
        })
        return
      }

      const generated = (await response.json()) as {
        identifier?: string
        whenToUse?: string
        systemPrompt?: string
      }
      // Never saved sight unseen: the draft only fills the form, the user reviews and then saves.
      setDraft((current) =>
        draftFromGenerated(
          {
            identifier: generated.identifier ?? "",
            whenToUse: generated.whenToUse ?? "",
            systemPrompt: generated.systemPrompt ?? "",
          },
          current,
        ),
      )
      setNameError(undefined)
      setDescriptionError(false)
      setReviewing(true)
      setCreateMode("manual")
    } catch {
      showToast({
        variant: "error",
        title: language.t("settings.subAgents.generate.failed"),
        description: language.t("settings.subAgents.generate.failed.network"),
      })
    } finally {
      setGenerating(false)
    }
  }

  const save = async () => {
    const current = draft()
    const problem = validateAgentDraft(current, existingNames())
    setNameError(undefined)
    setDescriptionError(false)
    if (problem?.field === "name") {
      setNameError(
        problem.problem === "taken"
          ? language.t("settings.subAgents.form.name.taken", { name: current.name.trim() })
          : problem.problem === "empty"
            ? language.t("settings.subAgents.form.name.required")
            : language.t("settings.subAgents.form.name.invalid"),
      )
      return
    }
    if (problem?.field === "description") {
      setDescriptionError(true)
      return
    }

    setSaving(true)
    try {
      const result = await serverSdk().client.app.agents2.create({
        ...(props.directory ? { directory: props.directory } : {}),
        name: current.name.trim(),
        description: current.description.trim(),
        mode: current.mode,
        color: current.color,
        tools: current.tools,
        injectAgentsMd: current.injectAgentsMd,
        ...(current.model.trim() ? { model: current.model.trim() } : {}),
        ...(current.prompt.trim() ? { prompt: current.prompt.trim() } : {}),
      })
      if ((result as { error?: unknown })?.error) throw new Error("create failed")
      showToast({ variant: "success", title: language.t("settings.subAgents.form.success") })
      closeCreate()
      void refetchConfig()
      void refetch()
    } catch {
      showToast({ variant: "error", title: language.t("settings.subAgents.form.failed") })
    } finally {
      setSaving(false)
    }
  }

  const remove = async (agent: PanelAgent) => {
    if (agent.builtin) return
    if (!window.confirm(language.t("settings.subAgents.form.delete.confirm", { name: agent.name }))) return
    try {
      const result = await serverSdk().client.app.agents2.delete({
        name: agent.name,
        ...(props.directory ? { directory: props.directory } : {}),
      })
      if ((result as { error?: unknown })?.error) throw new Error("delete failed")
      showToast({ variant: "success", title: language.t("settings.subAgents.form.deleted") })
      void refetchConfig()
      void refetch()
    } catch {
      showToast({ variant: "error", title: language.t("settings.subAgents.form.deleteFailed") })
    }
  }

  /* ------------------------------------------------------------------ render */

  const agentRow = (agent: PanelAgent, options: { deletable: boolean }) => (
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
          disabled={agent.name === "build"}
          onChange={(checked) => toggleAgent(agent.name, checked)}
        />
        <span class="settings-v2-chip text-[10px]" data-tone={agent.enabled ? "accent" : "muted"}>
          {language.t(agent.enabled ? "settings.subAgents.status.active" : "settings.subAgents.status.inactive")}
        </span>
        <Show when={options.deletable}>
          <ButtonV2
            type="button"
            variant="ghost"
            size="small"
            aria-label={language.t("settings.subAgents.list.delete")}
            onClick={() => void remove(agent)}
          >
            {language.t("settings.subAgents.form.delete")}
          </ButtonV2>
        </Show>
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
            <p class="settings-v2-tab-description">{language.t("settings.subAgents.description")}</p>
          </div>
          <div class="flex items-center gap-2 shrink-0">
            <span class="settings-v2-chip" data-tone="accent">
              {language.t("settings.subAgents.native.count", { count: visibleBuiltinAgents().length })}
            </span>
            <span class="settings-v2-chip" data-tone="muted">
              {language.t("settings.subAgents.custom.count", { count: visibleCustomAgents().length })}
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
          <div class="settings-v2-sub-agents-toolbar-row settings-v2-sub-agents-toolbar-row--actions">
            <ButtonV2 type="button" variant="contrast" size="small" onClick={() => openCreate("manual")}>
              {language.t("settings.subAgents.create.manual")}
            </ButtonV2>
            <ButtonV2 type="button" variant="outline" size="small" onClick={() => openCreate("ai")}>
              {language.t("settings.subAgents.create.ai")}
            </ButtonV2>
            <span class="settings-v2-sub-agents-scope-hint">{language.t("settings.subAgents.create.storage")}</span>
          </div>
        </div>

        <Show when={creating()}>
          <div class="settings-v2-sub-agents-form">
            <div class="settings-v2-sub-agents-form-header">
              <h3 class="settings-v2-section-title">{language.t("settings.subAgents.form.new.title")}</h3>
              <SegmentedControlV2
                value={createMode()}
                onChange={(value) => {
                  if (value === "manual" || value === "ai") setCreateMode(value)
                }}
              >
                <SegmentedControlItemV2 value="manual">
                  <span>{language.t("settings.subAgents.create.manual")}</span>
                </SegmentedControlItemV2>
                <SegmentedControlItemV2 value="ai">
                  <span>{language.t("settings.subAgents.create.ai")}</span>
                </SegmentedControlItemV2>
              </SegmentedControlV2>
            </div>

            <Show when={createMode() === "ai"}>
              <div class="settings-v2-sub-agents-form-field">
                <label class="settings-v2-sub-agents-form-label" for="sub-agents-generate">
                  {language.t("settings.subAgents.generate.title")}
                </label>
                <TextareaV2
                  id="sub-agents-generate"
                  rows={3}
                  value={generatePrompt()}
                  disabled={generating()}
                  onInput={(event) => setGeneratePrompt(event.currentTarget.value)}
                  placeholder={language.t("settings.subAgents.generate.placeholder")}
                />
                <p class="settings-v2-sub-agents-form-hint">{language.t("settings.subAgents.generate.hint")}</p>
              </div>
              <div class="settings-v2-sub-agents-form-field">
                <span class="settings-v2-sub-agents-form-label">{language.t("settings.subAgents.generate.model")}</span>
                <SelectV2
                  appearance="base"
                  options={modelOptions()}
                  current={currentModelOption()}
                  value={(option) => `${option.providerID}/${option.modelID}`}
                  label={(option) => option.label}
                  groupBy={(option) => option.group}
                  onSelect={(option) =>
                    setSelectedModel(
                      option && option.providerID
                        ? { providerID: option.providerID, modelID: option.modelID }
                        : { providerID: "", modelID: "" },
                    )
                  }
                />
              </div>
              <div class="settings-v2-sub-agents-form-actions">
                <ButtonV2
                  type="button"
                  variant="contrast"
                  size="small"
                  disabled={generating() || !generatePrompt().trim()}
                  onClick={() => void generate()}
                >
                  {generating()
                    ? language.t("settings.subAgents.generate.running")
                    : language.t("settings.subAgents.generate.submit")}
                </ButtonV2>
                <ButtonV2 type="button" variant="ghost" size="small" onClick={closeCreate}>
                  {language.t("settings.subAgents.form.cancel")}
                </ButtonV2>
              </div>
            </Show>

            <Show when={createMode() === "manual"}>
              <Show when={reviewing()}>
                <p class="settings-v2-sub-agents-form-review">{language.t("settings.subAgents.generate.ready")}</p>
              </Show>

              <div class="settings-v2-sub-agents-form-grid">
                <div class="settings-v2-sub-agents-form-field">
                  <label class="settings-v2-sub-agents-form-label" for="sub-agents-name">
                    {language.t("settings.subAgents.form.field.name")}
                  </label>
                  <TextInputV2
                    id="sub-agents-name"
                    appearance="base"
                    value={draft().name}
                    invalid={!!nameError()}
                    spellcheck={false}
                    autocomplete="off"
                    onInput={(event) => {
                      setNameError(undefined)
                      patchDraft({ name: event.currentTarget.value })
                    }}
                    placeholder={language.t("settings.subAgents.form.field.name.placeholder")}
                  />
                  <Show when={nameError()}>
                    <p class="settings-v2-sub-agents-form-error">{nameError()}</p>
                  </Show>
                </div>

                <div class="settings-v2-sub-agents-form-field">
                  <span class="settings-v2-sub-agents-form-label">
                    {language.t("settings.subAgents.form.field.mode")}
                  </span>
                  <SegmentedControlV2
                    value={draft().mode}
                    onChange={(value) => {
                      if (value === "primary" || value === "subagent") patchDraft({ mode: value })
                    }}
                  >
                    <SegmentedControlItemV2 value="subagent">
                      <span>{language.t("settings.subAgents.form.mode.subagent")}</span>
                    </SegmentedControlItemV2>
                    <SegmentedControlItemV2 value="primary">
                      <span>{language.t("settings.subAgents.form.mode.primary")}</span>
                    </SegmentedControlItemV2>
                  </SegmentedControlV2>
                  <p class="settings-v2-sub-agents-form-hint">{language.t("settings.subAgents.form.mode.hint")}</p>
                </div>
              </div>

              <div class="settings-v2-sub-agents-form-field">
                <label class="settings-v2-sub-agents-form-label" for="sub-agents-description">
                  {language.t("settings.subAgents.form.field.description")}
                </label>
                <TextInputV2
                  id="sub-agents-description"
                  appearance="base"
                  value={draft().description}
                  invalid={descriptionError()}
                  onInput={(event) => {
                    setDescriptionError(false)
                    patchDraft({ description: event.currentTarget.value })
                  }}
                  placeholder={language.t("settings.subAgents.form.field.description.placeholder")}
                />
                <Show when={descriptionError()}>
                  <p class="settings-v2-sub-agents-form-error">
                    {language.t("settings.subAgents.form.description.required")}
                  </p>
                </Show>
              </div>

              <div class="settings-v2-sub-agents-form-field">
                <label class="settings-v2-sub-agents-form-label" for="sub-agents-prompt">
                  {language.t("settings.subAgents.form.field.prompt")}
                </label>
                <TextareaV2
                  id="sub-agents-prompt"
                  rows={5}
                  value={draft().prompt}
                  onInput={(event) => patchDraft({ prompt: event.currentTarget.value })}
                  placeholder={language.t("settings.subAgents.form.field.prompt.placeholder")}
                />
              </div>

              <div class="settings-v2-sub-agents-form-grid">
                <div class="settings-v2-sub-agents-form-field">
                  <label class="settings-v2-sub-agents-form-label" for="sub-agents-model">
                    {language.t("settings.subAgents.form.field.model")}
                  </label>
                  <TextInputV2
                    id="sub-agents-model"
                    appearance="base"
                    value={draft().model}
                    spellcheck={false}
                    autocomplete="off"
                    onInput={(event) => patchDraft({ model: event.currentTarget.value })}
                    placeholder={language.t("settings.subAgents.form.field.model.placeholder")}
                  />
                  <p class="settings-v2-sub-agents-form-hint">{language.t("settings.subAgents.form.model.inherit")}</p>
                </div>

                <div class="settings-v2-sub-agents-form-field">
                  <span class="settings-v2-sub-agents-form-label">
                    {language.t("settings.subAgents.form.field.color")}
                  </span>
                  <div class="settings-v2-sub-agents-swatches">
                    <For each={AgentColors}>
                      {(color) => (
                        <button
                          type="button"
                          class="settings-v2-sub-agents-swatch"
                          style={{ "--swatch": color.value }}
                          data-selected={draft().color === color.value ? "" : undefined}
                          aria-label={language.t(color.label as Parameters<typeof language.t>[0])}
                          aria-pressed={draft().color === color.value}
                          onClick={() => patchDraft({ color: color.value })}
                        />
                      )}
                    </For>
                  </div>
                </div>
              </div>

              <div class="settings-v2-sub-agents-form-field">
                <span class="settings-v2-sub-agents-form-label">
                  {language.t("settings.subAgents.form.field.tools")}
                </span>
                <div class="settings-v2-sub-agents-tools-grid">
                  <For each={AgentTools}>
                    {(tool) => (
                      <label class="settings-v2-sub-agents-tool">
                        <input
                          type="checkbox"
                          checked={draft().tools.includes(tool.id)}
                          onChange={(event) => toggleTool(tool.id, event.currentTarget.checked)}
                        />
                        <span>{language.t(tool.label as Parameters<typeof language.t>[0])}</span>
                        <Show when={tool.sensitive}>
                          <span class="settings-v2-sub-agents-badge text-[9.5px]">
                            {language.t("settings.subAgents.form.tools.sensitive")}
                          </span>
                        </Show>
                      </label>
                    )}
                  </For>
                </div>
              </div>

              <div class="settings-v2-sub-agents-form-switch">
                <div class="flex flex-col min-w-0">
                  <span class="settings-v2-sub-agents-form-label">
                    {language.t("settings.subAgents.form.field.injectAgentsMd")}
                  </span>
                  <span class="settings-v2-sub-agents-form-hint">
                    {language.t("settings.subAgents.form.field.injectAgentsMd.description")}
                  </span>
                </div>
                <Switch
                  checked={draft().injectAgentsMd}
                  onChange={(checked) => patchDraft({ injectAgentsMd: checked })}
                />
              </div>

              <div class="settings-v2-sub-agents-form-actions">
                <ButtonV2 type="button" variant="contrast" size="small" disabled={saving()} onClick={() => void save()}>
                  {saving() ? language.t("settings.subAgents.form.saving") : language.t("settings.subAgents.form.save")}
                </ButtonV2>
                <ButtonV2 type="button" variant="ghost" size="small" disabled={saving()} onClick={closeCreate}>
                  {language.t("settings.subAgents.form.cancel")}
                </ButtonV2>
              </div>
            </Show>
          </div>
        </Show>

        {/* 1. Sub-agentes propios del usuario (agent/*.md) */}
        <Show when={visibleCustomAgents().length > 0}>
          <div class="settings-v2-section mb-6">
            <div class="flex items-center justify-between mb-2.5">
              <div class="flex items-center gap-2">
                <h3 class="settings-v2-section-title">{language.t("settings.subAgents.list.group.user")}</h3>
                <span class="settings-v2-sub-agents-group-count">{visibleCustomAgents().length}</span>
              </div>
              <span class="text-xs text-v2-text-text-muted">{language.t("settings.subAgents.list.user.hint")}</span>
            </div>

            <div class="settings-v2-subagents-table">
              {tableHead()}
              <For each={visibleCustomAgents()}>{(agent) => agentRow(agent, { deletable: true })}</For>
            </div>
          </div>
        </Show>

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
              <For each={pageBuiltinAgents().items}>{(agent) => agentRow(agent, { deletable: false })}</For>
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

        <Show when={visibleAgents().length === 0}>
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
