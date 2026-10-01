import { ButtonV2 } from "@tiancode-ai/ui/v2/button-v2"
import { SegmentedControlItemV2, SegmentedControlV2 } from "@tiancode-ai/ui/v2/segmented-control-v2"
import { SelectV2 } from "@tiancode-ai/ui/v2/select-v2"
import { Switch } from "@tiancode-ai/ui/v2/switch-v2"
import { TextInputV2 } from "@tiancode-ai/ui/v2/text-input-v2"
import { TextareaV2 } from "@tiancode-ai/ui/v2/textarea-v2"
import type { Agent, AgentConfig, Config } from "@tiancode-ai/sdk/v2/client"
import { type Component, createEffect, createMemo, createResource, For, on, Show } from "solid-js"
import { createStore, reconcile } from "solid-js/store"
import { useLanguage } from "@/context/language"
import { useModels } from "@/context/models"
import { useServerSDK } from "@/context/server-sdk"
import { normalizeAgentList } from "@/context/global-sync/utils"
import { showToast } from "@/utils/toast"
import { SettingsSectionTabs } from "./parts/section-tabs"
import { Icon, type IconName } from "@tiancode-ai/ui/icon"
import { BrandIcon, type BrandIconName } from "./parts/brand-icon"
import { RlmHierarchyTree } from "@/components/visualization/rlm-hierarchy-tree"
import {
  agentDisablePatch,
  buildDelegationTree,
  EDITABLE_TOOLS,
  effectivePermission,
  mergePanelAgents,
  overridePlan,
  parseOverrideNumber,
  sameOverrides,
  scopeTarget,
  type AgentOverrides,
  type AgentPresentation,
  type EditableTool,
  type PanelAgent,
  type ScopeTarget,
  type SettingsScope,
  type ToolAction,
} from "./sub-agents-logic"
import "./sub-agents.css"

const ToolPermissionNames = ["read", "grep", "glob", "bash", "edit", "write", "webfetch", "websearch", "todowrite"]

type StatusId = "all" | "enabled" | "disabled" | "custom"

const StatusOptions: { id: StatusId; label: string }[] = [
  { id: "all", label: "settings.subAgents.list.filter.all" },
  { id: "enabled", label: "settings.subAgents.list.filter.enabled" },
  { id: "disabled", label: "settings.subAgents.list.filter.disabled" },
  { id: "custom", label: "settings.subAgents.list.filter.custom" },
]

// Name, fallback emoji, colour and category of every agent that ships with Tiancode.
const AGENT_META = [
  ["build", "🔨", "#3B82F6", "core"],
  ["plan", "📋", "#8B5CF6", "core"],
  ["general", "🔍", "#10B981", "core"],
  ["explore", "🧭", "#F59E0B", "core"],
  ["software-architect", "🏛️", "#3B82F6", "engineering"],
  ["fullstack-coder", "⚡", "#8B5CF6", "engineering"],
  ["ui-ux-master", "🎨", "#EC4899", "design"],
  ["performance-optimizer", "🚀", "#F97316", "engineering"],
  ["database-architect", "🗄️", "#EAB308", "data"],
  ["qa-e2e-tester", "🧪", "#10B981", "quality"],
  ["python-data-engineer", "🐍", "#3776AB", "data"],
  ["mobile-app-developer", "📱", "#10B981", "engineering"],
  ["cloud-devops-engineer", "☁️", "#0284C7", "operations"],
  ["hermes-researcher", "🔬", "#06B6D4", "research"],
  ["marketing-strategist", "📣", "#F59E0B", "marketing"],
  ["reverse-engineer", "🔎", "#A855F7", "security"],
  ["pentest", "🕵️", "#E11D48", "security"],
  ["llm-redteam", "🔐", "#C026D3", "security"],
] as const

const GROUP_ORDER = ["engineering", "design", "data", "quality", "operations", "security", "research", "marketing", "other"] as const

const SWATCHES = ["#3B82F6", "#8B5CF6", "#EC4899", "#E11D48", "#F97316", "#EAB308", "#10B981", "#06B6D4"]

const PERMISSION_CHOICES = ["inherit", "allow", "ask", "deny"] as const
// The select needs a real value for "inherit"; an empty id reads as nothing selected.
const INHERIT_MODEL = "inherit"
type PermissionChoice = (typeof PERMISSION_CHOICES)[number]

// Real marks for each specialist: the technology it stands for when one is unambiguous, otherwise a
// line glyph from the icon set. The emoji in AGENT_META stays as the last fallback.
const AGENT_BRANDS: Partial<Record<string, BrandIconName>> = {
  "fullstack-coder": "react",
  "ui-ux-master": "figma",
  "performance-optimizer": "vite",
  "database-architect": "postgresql",
  "qa-e2e-tester": "cypress",
  "python-data-engineer": "python",
  "mobile-app-developer": "android",
  "cloud-devops-engineer": "docker",
  "marketing-strategist": "hubspot",
  "reverse-engineer": "wireshark",
  pentest: "kalilinux",
  "llm-redteam": "owasp",
}
const AGENT_GLYPHS: Partial<Record<string, IconName>> = {
  build: "code",
  plan: "checklist",
  general: "magnifying-glass",
  explore: "folder",
  "software-architect": "code-lines",
  "hermes-researcher": "magnifying-glass",
}

function AgentMark(props: { name: string; emoji: string; size?: number }) {
  const brand = () => AGENT_BRANDS[props.name]
  const glyph = () => AGENT_GLYPHS[props.name]
  return (
    <Show
      when={brand()}
      fallback={
        <Show when={glyph()} fallback={props.emoji}>
          {(name) => <Icon name={name()} size={props.size && props.size > 18 ? "normal" : "small"} />}
        </Show>
      }
    >
      {(name) => <BrandIcon name={name()} size={props.size ?? 18} />}
    </Show>
  )
}

function AgentAvatar(props: { agent: PanelAgent; large?: boolean }) {
  return (
    <span
      class="settings-v2-sa-avatar"
      data-size={props.large ? "large" : undefined}
      style={{
        "background-color": `color-mix(in srgb, ${props.agent.color} 16%, transparent)`,
        "border-color": `color-mix(in srgb, ${props.agent.color} 42%, transparent)`,
      }}
    >
      <AgentMark name={props.agent.name} emoji={props.agent.icon} size={props.large ? 24 : 18} />
    </span>
  )
}

type Draft = {
  model: string
  temperature: string
  steps: string
  prompt_append: string
  color: string
  hidden: boolean
  permission: Partial<Record<EditableTool, ToolAction>>
}

/**
 * Settings › Sub-agentes: every specialist in a list grouped by category, and an editor for the one
 * selected (model, temperature, steps, per-tool permissions, extra instructions, colour). Edits are
 * overrides under `agent.<name>` in the chosen scope's config; the built-in prompt is never replaced.
 */
export const SettingsSubAgentsV2: Component<{
  directory?: string
  active?: boolean
}> = (props) => {
  const language = useLanguage()
  const serverSdk = useServerSDK()
  const models = useModels()

  const [ui, setUi] = createStore({
    scope: (props.directory ? "project" : "global") as SettingsScope,
    section: "agents" as "agents" | "hierarchy",
    query: "",
    status: "all" as StatusId,
    selected: undefined as string | undefined,
    // Narrow panels show either the list or the editor; wide ones show both.
    editing: false,
    saving: false,
    promptOpen: false,
  })

  const params = () => (props.directory ? { directory: props.directory } : undefined)
  // Which config file this panel reads and writes. Both resources take it as their source: a
  // createResource with no source argument runs its fetcher once inside untrack, so the scope
  // selector used to change the toast and nothing else.
  const target = createMemo(() => scopeTarget(ui.scope, props.directory))

  const [configData, { refetch: refetchConfig }] = createResource(
    target,
    async (where) => {
      try {
        const res = await (
          where.kind === "global"
            ? serverSdk().client.global.config.get()
            : serverSdk().client.config.get({ directory: where.directory })
        ).catch(() => undefined)
        return ((res?.data as { agent?: Record<string, Record<string, unknown>> } | undefined)?.agent ?? {}) as Record<
          string,
          Record<string, unknown>
        >
      } catch {
        return {}
      }
    },
    { initialValue: {} },
  )

  const [agents, { refetch }] = createResource<{ items: Agent[]; failed: boolean }, ScopeTarget>(
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

  const [statusOverrides, setStatusOverrides] = createStore<Record<string, boolean | undefined>>({})
  const [pending, setPending] = createStore<Record<string, boolean>>({})

  const isAgentActive = (agentName: string) => {
    const override = statusOverrides[agentName]
    if (override !== undefined) return override
    const conf = configData()
    if (conf?.[agentName]?.disable === true || conf?.[agentName]?.disabled === true) return false
    const match = agents().items.find((a) => a?.name === agentName)
    // The backend drops a disabled agent from its list entirely, so an agent we only know about
    // from config or from the built-in catalogue is switched off, not merely unseen.
    if (!match && !agents.loading) return false
    return true
  }

  const scopeHint = () =>
    language.t(ui.scope === "project" ? "settings.subAgents.scope.project.hint" : "settings.subAgents.scope.global.hint")

  const writeConfig = (where: ScopeTarget, config: Config) =>
    where.kind === "global"
      ? serverSdk().client.global.config.update({ config })
      : serverSdk().client.config.update({ directory: where.directory, config })

  const resetConfig = (where: ScopeTarget, name: string) =>
    where.kind === "global"
      ? serverSdk().client.global.config.agent.reset({ name })
      : serverSdk().client.config.agent.reset({ name, directory: where.directory })

  const toggleAgent = async (agentName: string, enable: boolean) => {
    if (pending[agentName]) return
    setPending(agentName, true)
    setStatusOverrides(agentName, enable)
    // Only this agent's {disable} goes over the wire. Copying configData() sent the merged
    // `cfg.agent` map back — every markdown agent's parsed Info, system prompt included — so one
    // switch wrote every agent's prompt into the repository's tiancode.json.
    const config = agentDisablePatch(agentName, enable)
    try {
      await writeConfig(target(), config)
      await Promise.all([refetchConfig(), refetch()])
      showToast({
        variant: "success",
        title: language.t(enable ? "settings.subAgents.toggle.enabled" : "settings.subAgents.toggle.disabled", {
          name: agentName,
        }),
        description: scopeHint(),
      })
    } catch {
      showToast({ variant: "error", title: language.t("settings.subAgents.toggle.failed") })
    } finally {
      setStatusOverrides(agentName, undefined)
      setPending(agentName, false)
    }
  }

  // The server catalog remains authoritative for the integrated agents' availability.
  const agentList = createMemo<PanelAgent[]>(() =>
    mergePanelAgents({
      server: agents().items,
      meta: Object.fromEntries(
        AGENT_META.map(([name, icon, color, group]) => [
          name,
          {
            title: language.t(`settings.subAgents.catalog.${name}.title`),
            role: language.t(`settings.subAgents.catalog.${name}.role`),
            description: language.t(`settings.subAgents.catalog.${name}.description`),
            category: language.t(`settings.subAgents.category.${group}`),
            group,
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
        category: language.t("settings.subAgents.category.other"),
      },
    }),
  )

  const toolsSummary = (count: number) => language.plural("settings.subAgents.list.tools.summary", count)

  const matchesQuery = (agent: PanelAgent) => {
    const needle = ui.query.trim().toLowerCase()
    if (!needle) return true
    return [agent.name, agent.title, agent.role, agent.description, agent.category].some((text) =>
      (text ?? "").toLowerCase().includes(needle),
    )
  }

  const matchesStatus = (agent: PanelAgent) => {
    if (ui.status === "enabled") return agent.enabled
    if (ui.status === "disabled") return !agent.enabled
    if (ui.status === "custom") return agent.customized
    return true
  }

  // Specialists only: build and plan are primary agents, general and explore are the backend's own
  // helpers; all of them still appear in the delegation tree.
  const specialists = createMemo(() =>
    agentList().filter((a) => a.builtin && a.mode === "subagent" && !["general", "explore"].includes(a.name)),
  )
  const visibleAgents = createMemo(() => specialists().filter((a) => matchesQuery(a) && matchesStatus(a)))
  const groups = createMemo(() =>
    GROUP_ORDER.map((id) => ({ id, agents: visibleAgents().filter((agent) => agent.group === id) })).filter(
      (group) => group.agents.length > 0,
    ),
  )

  const delegationTree = createMemo(() => buildDelegationTree(agentList().filter((agent) => agent.builtin)))

  // The first agent the list shows is selected, so the editor never opens empty on a wide panel.
  createEffect(() => {
    const first = groups()[0]?.agents[0]
    if (!first) return
    if (!ui.selected || !specialists().some((agent) => agent.name === ui.selected)) setUi("selected", first.name)
  })

  const selectedAgent = createMemo(() => agentList().find((agent) => agent.name === ui.selected))

  const [draft, setDraft] = createStore<Draft>(toDraft({}))
  // A different agent, or the same one after a save, starts from what is stored.
  createEffect(
    on(
      () => [ui.selected, JSON.stringify(selectedAgent()?.overrides ?? {})] as const,
      () => {
        setDraft(reconcile(toDraft(selectedAgent()?.overrides ?? {})))
        setUi("promptOpen", false)
      },
    ),
  )

  const temperature = createMemo(() => parseOverrideNumber(draft.temperature, { min: 0, max: 2 }))
  const steps = createMemo(() => parseOverrideNumber(draft.steps, { min: 1, max: 1000, integer: true }))
  const valid = () => temperature().valid && steps().valid
  const draftOverrides = createMemo<AgentOverrides>(() =>
    fromDraft(draft, temperature().value, steps().value, selectedAgent()?.overrides.disable),
  )
  const dirty = createMemo(() => {
    const agent = selectedAgent()
    return !!agent && !sameOverrides(agent.overrides, draftOverrides())
  })

  const select = (name: string) => {
    setUi("selected", name)
    setUi("editing", true)
  }

  const save = async () => {
    const agent = selectedAgent()
    if (!agent || ui.saving || !valid() || !dirty()) return
    setUi("saving", true)
    const where = target()
    const plan = overridePlan(agent.overrides, draftOverrides())
    try {
      if (plan.reset) await resetConfig(where, agent.name)
      if (Object.keys(plan.patch).length > 0)
        await writeConfig(where, { agent: { [agent.name]: plan.patch as AgentConfig } })
      await Promise.all([refetchConfig(), refetch()])
      showToast({
        variant: "success",
        title: language.t("settings.subAgents.editor.saved", { name: agent.title }),
        description: scopeHint(),
      })
    } catch {
      showToast({ variant: "error", title: language.t("settings.subAgents.editor.saveFailed") })
    } finally {
      setUi("saving", false)
    }
  }

  const reset = async () => {
    const agent = selectedAgent()
    if (!agent || ui.saving) return
    const scope = language.t(ui.scope === "project" ? "settings.subAgents.scope.project" : "settings.subAgents.scope.global")
    if (!window.confirm(language.t("settings.subAgents.editor.reset.confirm", { name: agent.title, scope }))) return
    setUi("saving", true)
    try {
      const result = await resetConfig(target(), agent.name)
      await Promise.all([refetchConfig(), refetch()])
      showToast({
        variant: result.data ? "success" : "default",
        title: language.t(result.data ? "settings.subAgents.editor.resetDone" : "settings.subAgents.editor.resetNothing", {
          name: agent.title,
        }),
      })
    } catch {
      showToast({ variant: "error", title: language.t("settings.subAgents.editor.saveFailed") })
    } finally {
      setUi("saving", false)
    }
  }

  type ModelOption = { id: string; label: string }
  const modelOptions = createMemo<ModelOption[]>(() => {
    const listed = models.list().map((model) => ({
      id: `${model.provider.id}/${model.id}`,
      label: `${model.provider.name} · ${model.name}`,
    }))
    // A model from a provider that is not connected now stays visible instead of reading as "inherit".
    const stored = draft.model && !listed.some((option) => option.id === draft.model)
    return [
      { id: INHERIT_MODEL, label: language.t("settings.subAgents.editor.model.inherit") },
      ...(stored ? [{ id: draft.model, label: draft.model }] : []),
      ...listed,
    ]
  })

  const permissionLabel = (choice: PermissionChoice) => language.t(`settings.subAgents.editor.permission.${choice}`)
  // What the agent does today for a tool (after every rule merges), shown next to its selector.
  const currentAction = (tool: EditableTool) => {
    const permission = agents().items.find((item) => item.name === ui.selected)?.permission
    const action = Array.isArray(permission) ? effectivePermission(permission, tool, "*") : undefined
    return action === "allow" || action === "deny" ? action : "ask"
  }

  const agentCard = (agent: PanelAgent) => (
    <div
      class="settings-v2-sa-card"
      data-selected={ui.selected === agent.name ? "" : undefined}
      data-disabled={agent.enabled ? undefined : ""}
    >
      <button
        type="button"
        class="settings-v2-sa-card-main"
        aria-current={ui.selected === agent.name ? "true" : undefined}
        onClick={() => select(agent.name)}
      >
        <AgentAvatar agent={agent} />
        <span class="settings-v2-sa-card-copy">
          <span class="settings-v2-sa-card-title">{agent.title}</span>
          <span class="settings-v2-sa-card-role">{agent.role}</span>
          <span class="settings-v2-sa-card-description">{agent.description}</span>
          <span class="settings-v2-sa-tags">
            <Show when={agent.overrides.model}>
              {(model) => (
                <span class="settings-v2-sa-tag" data-tone="accent">
                  {language.t("settings.subAgents.tag.model", { model: model().split("/").slice(1).join("/") || model() })}
                </span>
              )}
            </Show>
            <Show when={agent.tools.restricted}>
              <span class="settings-v2-sa-tag">{toolsSummary(agent.tools.allowed)}</span>
            </Show>
            <Show when={agent.customized}>
              <span class="settings-v2-sa-tag" data-tone="accent">
                {language.t("settings.subAgents.editor.custom")}
              </span>
            </Show>
          </span>
        </span>
      </button>
      <Switch
        class="settings-v2-sa-card-switch"
        hideLabel
        checked={agent.enabled}
        disabled={pending[agent.name]}
        onChange={(checked) => toggleAgent(agent.name, checked)}
      >
        {language.t("settings.subAgents.switch.label", { name: agent.title })}
      </Switch>
    </div>
  )

  // An accessor, not a value: the editor stays mounted while the selection and its data change.
  const editor = (agent: () => PanelAgent) => (
    <section class="settings-v2-sa-editor" aria-label={agent().title}>
      <header class="settings-v2-sa-editor-header">
        <ButtonV2 type="button" variant="ghost" size="small" class="settings-v2-sa-back" onClick={() => setUi("editing", false)}>
          <Icon name="arrow-left" size="small" />
          {language.t("settings.subAgents.editor.back")}
        </ButtonV2>
        <div class="settings-v2-sa-identity">
          <AgentAvatar agent={agent()} large />
          <div class="settings-v2-sa-identity-copy">
            <h3 class="settings-v2-sa-editor-title">{agent().title}</h3>
            <div class="settings-v2-sa-identity-meta">
              <span class="settings-v2-sa-handle">@{agent().name}</span>
              <span class="settings-v2-sa-tag">{agent().category}</span>
              <span class="settings-v2-sa-tag">{language.t("settings.subAgents.editor.builtin")}</span>
              <Show when={agent().customized}>
                <span class="settings-v2-sa-tag" data-tone="accent">{language.t("settings.subAgents.editor.custom")}</span>
              </Show>
            </div>
          </div>
          <Switch
            hideLabel
            checked={agent().enabled}
            disabled={pending[agent().name]}
            onChange={(checked) => toggleAgent(agent().name, checked)}
          >
            {language.t("settings.subAgents.switch.label", { name: agent().title })}
          </Switch>
        </div>
        <p class="settings-v2-sa-role">{agent().role}</p>
        <p class="settings-v2-sa-description">{agent().description}</p>
      </header>

      <div class="settings-v2-sa-editor-body">
        <div class="settings-v2-sa-section">
          <h4 class="settings-v2-sa-section-title">{language.t("settings.subAgents.editor.section.model")}</h4>
          <div class="settings-v2-sa-field">
            <div class="settings-v2-sa-field-copy">
              <span class="settings-v2-sa-field-title">{language.t("settings.subAgents.editor.model.title")}</span>
              <span class="settings-v2-sa-field-hint">{language.t("settings.subAgents.editor.model.description")}</span>
            </div>
            <SelectV2
              appearance="base"
              class="settings-v2-sa-model"
              data-action="settings-subagent-model"
              options={modelOptions()}
              current={modelOptions().find((option) => option.id === (draft.model || INHERIT_MODEL))}
              value={(option) => option.id}
              label={(option) => option.label}
              onSelect={(option) => setDraft("model", !option || option.id === INHERIT_MODEL ? "" : option.id)}
            />
          </div>
          <div class="settings-v2-sa-field-pair">
            <label class="settings-v2-sa-field settings-v2-sa-field--stacked">
              <span class="settings-v2-sa-field-title">{language.t("settings.subAgents.editor.temperature.title")}</span>
              <TextInputV2
                appearance="base"
                inputMode="decimal"
                value={draft.temperature}
                invalid={!temperature().valid}
                placeholder={language.t("settings.subAgents.editor.temperature.placeholder")}
                onInput={(event) => setDraft("temperature", event.currentTarget.value)}
              />
              <span class="settings-v2-sa-field-hint" data-invalid={temperature().valid ? undefined : ""}>
                {language.t(
                  temperature().valid
                    ? "settings.subAgents.editor.temperature.description"
                    : "settings.subAgents.editor.temperature.invalid",
                )}
              </span>
            </label>
            <label class="settings-v2-sa-field settings-v2-sa-field--stacked">
              <span class="settings-v2-sa-field-title">{language.t("settings.subAgents.editor.steps.title")}</span>
              <TextInputV2
                appearance="base"
                inputMode="numeric"
                value={draft.steps}
                invalid={!steps().valid}
                placeholder={language.t("settings.subAgents.editor.steps.placeholder")}
                onInput={(event) => setDraft("steps", event.currentTarget.value)}
              />
              <span class="settings-v2-sa-field-hint" data-invalid={steps().valid ? undefined : ""}>
                {language.t(
                  steps().valid ? "settings.subAgents.editor.steps.description" : "settings.subAgents.editor.steps.invalid",
                )}
              </span>
            </label>
          </div>
        </div>

        <div class="settings-v2-sa-section">
          <h4 class="settings-v2-sa-section-title">{language.t("settings.subAgents.editor.section.tools")}</h4>
          <p class="settings-v2-sa-section-hint">{language.t("settings.subAgents.editor.tools.description")}</p>
          <div class="settings-v2-sa-tools">
            <For each={EDITABLE_TOOLS}>
              {(tool) => {
                const choice = (): PermissionChoice => draft.permission[tool] ?? "inherit"
                return (
                  <div class="settings-v2-sa-tool" data-sensitive={["bash", "edit"].includes(tool) ? "" : undefined}>
                    <div class="settings-v2-sa-tool-copy">
                      <span class="settings-v2-sa-tool-name">{language.t(`settings.subAgents.editor.tool.${tool}`)}</span>
                      <span class="settings-v2-sa-tool-current">
                        {language.t("settings.subAgents.editor.permission.current", {
                          value: permissionLabel(currentAction(tool)),
                        })}
                      </span>
                    </div>
                    <SelectV2
                      appearance="inline"
                      options={[...PERMISSION_CHOICES]}
                      current={choice()}
                      label={permissionLabel}
                      placement="bottom-end"
                      gutter={6}
                      onSelect={(next) =>
                        setDraft("permission", tool, !next || next === "inherit" ? undefined : (next as ToolAction))
                      }
                    />
                  </div>
                )
              }}
            </For>
          </div>
        </div>

        <div class="settings-v2-sa-section">
          <h4 class="settings-v2-sa-section-title">{language.t("settings.subAgents.editor.section.instructions")}</h4>
          <label class="settings-v2-sa-field settings-v2-sa-field--stacked">
            <span class="settings-v2-sa-field-title">{language.t("settings.subAgents.editor.append.title")}</span>
            <TextareaV2
              rows={4}
              value={draft.prompt_append}
              placeholder={language.t("settings.subAgents.editor.append.placeholder")}
              onInput={(event) => setDraft("prompt_append", event.currentTarget.value)}
            />
            <span class="settings-v2-sa-field-hint">{language.t("settings.subAgents.editor.append.description")}</span>
          </label>
          <div class="settings-v2-sa-prompt">
            <button
              type="button"
              class="settings-v2-sa-prompt-toggle"
              aria-expanded={ui.promptOpen}
              disabled={!agent().prompt}
              onClick={() => setUi("promptOpen", (open) => !open)}
            >
              <Icon name={ui.promptOpen ? "chevron-down" : "chevron-right"} size="small" />
              {language.t(agent().prompt ? "settings.subAgents.editor.prompt.title" : "settings.subAgents.editor.prompt.unavailable")}
            </button>
            <Show when={ui.promptOpen && agent().prompt}>
              <pre class="settings-v2-sa-prompt-text">{agent().prompt}</pre>
            </Show>
          </div>
        </div>

        <div class="settings-v2-sa-section">
          <h4 class="settings-v2-sa-section-title">{language.t("settings.subAgents.editor.section.appearance")}</h4>
          <div class="settings-v2-sa-field">
            <div class="settings-v2-sa-field-copy">
              <span class="settings-v2-sa-field-title">{language.t("settings.subAgents.editor.color.title")}</span>
              <span class="settings-v2-sa-field-hint">{language.t("settings.subAgents.editor.color.description")}</span>
            </div>
            <div class="settings-v2-sa-swatches" role="radiogroup" aria-label={language.t("settings.subAgents.editor.color.title")}>
              <button
                type="button"
                role="radio"
                class="settings-v2-sa-swatch settings-v2-sa-swatch--default"
                aria-checked={!draft.color}
                title={language.t("settings.subAgents.editor.color.default")}
                onClick={() => setDraft("color", "")}
              />
              <For each={SWATCHES}>
                {(color) => (
                  <button
                    type="button"
                    role="radio"
                    class="settings-v2-sa-swatch"
                    aria-checked={draft.color.toLowerCase() === color.toLowerCase()}
                    title={color}
                    style={{ "background-color": color }}
                    onClick={() => setDraft("color", color)}
                  />
                )}
              </For>
            </div>
          </div>
          <div class="settings-v2-sa-field">
            <div class="settings-v2-sa-field-copy">
              <span class="settings-v2-sa-field-title">{language.t("settings.subAgents.editor.hidden.title")}</span>
              <span class="settings-v2-sa-field-hint">{language.t("settings.subAgents.editor.hidden.description")}</span>
            </div>
            <Switch hideLabel checked={draft.hidden} onChange={(checked) => setDraft("hidden", checked)}>
              {language.t("settings.subAgents.editor.hidden.title")}
            </Switch>
          </div>
        </div>
      </div>

      <footer class="settings-v2-sa-editor-footer">
        <span class="settings-v2-sa-footer-note">{scopeHint()}</span>
        <div class="settings-v2-sa-footer-actions">
          <ButtonV2 type="button" variant="ghost" size="small" disabled={!agent().customized || ui.saving} onClick={() => void reset()}>
            {language.t("settings.subAgents.editor.reset")}
          </ButtonV2>
          <ButtonV2
            type="button"
            variant="outline"
            size="small"
            disabled={!dirty() || ui.saving}
            onClick={() => setDraft(reconcile(toDraft(agent().overrides)))}
          >
            {language.t("settings.subAgents.editor.discard")}
          </ButtonV2>
          <ButtonV2
            type="button"
            variant="contrast"
            size="small"
            data-action="settings-subagent-save"
            disabled={!dirty() || !valid() || ui.saving}
            onClick={() => void save()}
          >
            {language.t("settings.subAgents.editor.save")}
          </ButtonV2>
        </div>
      </footer>
    </section>
  )

  return (
    <>
      <div class="settings-v2-tab-header settings-v2-tab-header--stacked">
        <div class="settings-v2-tab-header-row">
          <div class="settings-v2-sub-agents-header-copy">
            <h2 class="settings-v2-tab-title">{language.t("settings.subAgents.title")}</h2>
            <p class="settings-v2-tab-description">{language.t("settings.subAgents.integrated.description")}</p>
          </div>
          <span class="settings-v2-chip shrink-0" data-tone="accent">
            {language.t("settings.subAgents.summary", {
              enabled: specialists().filter((agent) => agent.enabled).length,
              count: specialists().length,
            })}
          </span>
        </div>
        <SettingsSectionTabs
          value={ui.section}
          onChange={(section) => setUi("section", section)}
          options={[
            { id: "agents", label: language.t("settings.subAgents.list.group.builtin") },
            { id: "hierarchy", label: language.t("settings.subAgents.hierarchy.title") },
          ]}
        />
      </div>

      <div class="settings-v2-tab-body settings-v2-sub-agents">
        <Show when={ui.section === "agents"}>
          <div class="settings-v2-sa-toolbar">
            <TextInputV2
              type="search"
              appearance="base"
              value={ui.query}
              onInput={(event) => setUi("query", event.currentTarget.value)}
              placeholder={language.t("settings.subAgents.list.search.placeholder")}
              aria-label={language.t("settings.subAgents.list.search.placeholder")}
              spellcheck={false}
              autocomplete="off"
            />
            <SegmentedControlV2
              value={ui.status}
              onChange={(value) => {
                if (StatusOptions.some((option) => option.id === value)) setUi("status", value as StatusId)
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
            <div class="settings-v2-sa-scope" title={scopeHint()}>
              <span class="settings-v2-sa-scope-label">{language.t("settings.subAgents.scope.label")}</span>
              <SegmentedControlV2
                value={ui.scope}
                onChange={(value) => {
                  if (value === "project" || value === "global") setUi("scope", value)
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
          </div>

          <Show when={agents().failed}>
            <div role="alert" class="flex flex-wrap items-center gap-3 py-3 text-sm text-v2-state-fg-warning">
              <span>{language.t("settings.subAgents.list.loadFailed")}</span>
              <ButtonV2 onClick={() => void refetch()}>{language.t("settings.subAgents.list.retry")}</ButtonV2>
            </div>
          </Show>

          <div class="settings-v2-sa-layout" data-editing={ui.editing ? "" : undefined}>
            <div class="settings-v2-sa-list" role="list">
              <For each={groups()}>
                {(group) => (
                  <div class="settings-v2-sa-group" role="group" aria-label={language.t(`settings.subAgents.category.${group.id}`)}>
                    <div class="settings-v2-sa-group-title">
                      <span>{language.t(`settings.subAgents.category.${group.id}`)}</span>
                      <span class="settings-v2-sa-group-count">{group.agents.length}</span>
                    </div>
                    <For each={group.agents}>{(agent) => agentCard(agent)}</For>
                  </div>
                )}
              </For>
              <Show when={visibleAgents().length === 0 && !agents().failed && !agents.loading}>
                <p class="settings-v2-sa-empty">{language.t("settings.subAgents.list.empty")}</p>
              </Show>
            </div>
            <Show
              when={selectedAgent()}
              fallback={<div class="settings-v2-sa-editor settings-v2-sa-editor--empty">{language.t("settings.subAgents.editor.empty")}</div>}
            >
              {(agent) => editor(agent)}
            </Show>
          </div>
        </Show>

        <Show when={ui.section === "hierarchy"}>
          <div class="settings-v2-section">
            <RlmHierarchyTree roots={delegationTree()} />
          </div>
        </Show>
      </div>
    </>
  )
}

function toDraft(overrides: AgentOverrides): Draft {
  return {
    model: overrides.model ?? "",
    temperature: overrides.temperature === undefined ? "" : String(overrides.temperature),
    steps: overrides.steps === undefined ? "" : String(overrides.steps),
    prompt_append: overrides.prompt_append ?? "",
    color: overrides.color ?? "",
    hidden: overrides.hidden === true,
    permission: { ...overrides.permission },
  }
}

function fromDraft(draft: Draft, temperature: number | undefined, steps: number | undefined, disable?: boolean): AgentOverrides {
  const permission = Object.fromEntries(
    Object.entries(draft.permission).filter((entry): entry is [string, ToolAction] => !!entry[1]),
  ) as AgentOverrides["permission"]
  return {
    ...(draft.model ? { model: draft.model } : {}),
    ...(temperature !== undefined ? { temperature } : {}),
    ...(steps !== undefined ? { steps } : {}),
    ...(draft.prompt_append.trim() ? { prompt_append: draft.prompt_append.trim() } : {}),
    ...(draft.color ? { color: draft.color } : {}),
    ...(draft.hidden ? { hidden: true } : {}),
    ...(disable ? { disable: true } : {}),
    ...(permission && Object.keys(permission).length > 0 ? { permission } : {}),
  }
}
