import { ButtonV2 } from "@tiancode-ai/ui/v2/button-v2"
import { Dialog, DialogBody, DialogFooter, DialogHeader, DialogTitle } from "@tiancode-ai/ui/v2/dialog-v2"
import { SegmentedControlItemV2, SegmentedControlV2 } from "@tiancode-ai/ui/v2/segmented-control-v2"
import { Switch } from "@tiancode-ai/ui/v2/switch-v2"
import { TextareaV2 } from "@tiancode-ai/ui/v2/textarea-v2"
import { Icon } from "@tiancode-ai/ui/icon"
import { useDialog } from "@tiancode-ai/ui/context/dialog"
import type { Config, DecisionAnswer, DecisionStatus } from "@tiancode-ai/sdk/v2/client"
import { type Component, createEffect, createResource, For, on, onCleanup, Show } from "solid-js"
import { createStore, reconcile, unwrap } from "solid-js/store"
import { useLanguage } from "@/context/language"
import { usePlatform } from "@/context/platform"
import { useServerSDK } from "@/context/server-sdk"
import { showToast } from "@/utils/toast"
import { SettingsConfirmDialog } from "./parts/confirm-dialog"
import { SettingsHubHeader } from "./parts/hub-header"
import { permissionRules, resolveRule } from "./computer-use-logic"
import { SettingsListV2 } from "./parts/list"
import { SettingsRowV2 } from "./parts/row"
import "./parts/kit.css"

export type IntelligenceSection = "memory" | "context" | "protection" | "decisions"
export const INTELLIGENCE_SECTIONS: readonly IntelligenceSection[] = ["memory", "context", "protection", "decisions"]

type Switches = NonNullable<NonNullable<Config["experimental"]>["intelligence"]>
type SwitchKey = keyof Switches
const TAIL_TURNS = [1, 2, 4] as const
const OUTPUT_LINES = [1000, 2000, 5000] as const
const DOOM_LOOP = ["ask", "allow", "deny"] as const

/**
 * Settings › Inteligencia: what the agent remembers, how its context is kept small, the guards
 * around what it runs, and the offline decision model. The switches live in the global config;
 * the Intelligence ones apply without reopening projects (see IntelligenceSwitches on the server).
 */
export const SettingsIntelligenceV2: Component<{
  directory?: string
  section?: IntelligenceSection
  onSectionChange?: (section: IntelligenceSection) => void
}> = (props) => {
  const language = useLanguage()
  const platform = usePlatform()
  const dialog = useDialog()
  const serverSdk = useServerSDK()
  const client = () => serverSdk().client
  const [ui, setUi] = createStore({
    section: props.section ?? ("memory" as IntelligenceSection),
    probe: "",
    probing: false,
  })
  const [config, setConfig] = createStore<{ value: Config; loaded: boolean }>({ value: {}, loaded: false })
  const [probe, setProbe] = createStore<{ outcome?: DecisionAnswer | null; area?: DecisionAnswer | null }>({})

  createEffect(
    on(
      () => props.section,
      (section) => section && setUi("section", section),
      { defer: true },
    ),
  )
  const select = (section: IntelligenceSection) => {
    setUi("section", section)
    props.onSectionChange?.(section)
  }

  // null when the server could not be read: a rejected resource replaced the whole window with
  // the error page the moment this tab (or a refetch after a failed save) read it.
  const [remote, { refetch: refetchConfig }] = createResource(
    () => serverSdk(),
    () =>
      Promise.resolve()
        .then(() => client().global.config.get({ throwOnError: true }))
        .then((result) => result.data ?? null)
        .catch(() => null),
  )
  createEffect(() => {
    const value = remote()
    if (!value) return
    setConfig("value", reconcile(value))
    setConfig("loaded", true)
  })

  const [memory, { mutate: setMemory }] = createResource(
    () => props.directory ?? "",
    // Wrapped so an older server (or SDK) without the endpoint degrades to "unknown" instead of throwing.
    (directory) =>
      Promise.resolve()
        .then(() => client().experimental.memory.get(directory ? { directory } : undefined))
        .then((result) => result.data)
        .catch(() => undefined),
  )

  const [decision, { mutate: setDecision, refetch: refetchDecision }] = createResource(() =>
    Promise.resolve()
      .then(() => client().global.decision.status())
      .then((result) => result.data)
      .catch(() => undefined),
  )
  // Follow a download while it runs; otherwise the status only changes on the user's actions.
  createEffect(() => {
    if (decision()?.state !== "downloading") return
    const timer = setInterval(() => void refetchDecision(), 1000)
    onCleanup(() => clearInterval(timer))
  })

  const switches = () => config.value.experimental?.intelligence ?? {}
  // Absent means on, as on the server (ConfigIntelligence.DEFAULTS).
  const on_ = (key: SwitchKey) => switches()[key] !== false

  const save = async (patch: Config, optimistic: (draft: Config) => Config) => {
    // A plain copy: structuredClone cannot copy the store's proxy.
    const before = structuredClone(unwrap(config.value))
    setConfig("value", reconcile(optimistic(structuredClone(before))))
    const saved = await client()
      .global.config.update({ config: patch }, { throwOnError: true })
      .then(() => true)
      .catch(() => false)
    if (saved) {
      window.dispatchEvent(new CustomEvent("tiancode:intelligence-changed"))
      return
    }
    setConfig("value", reconcile(before))
    showToast({ variant: "error", title: language.t("settings.intelligence.save.failed") })
    void refetchConfig()
  }

  const setSwitch = (key: SwitchKey, value: boolean) =>
    save({ experimental: { intelligence: { [key]: value } } }, (draft) => ({
      ...draft,
      experimental: { ...draft.experimental, intelligence: { ...draft.experimental?.intelligence, [key]: value } },
    }))

  const compaction = () => config.value.compaction ?? {}
  const setCompaction = (patch: NonNullable<Config["compaction"]>) =>
    save({ compaction: patch }, (draft) => ({ ...draft, compaction: { ...draft.compaction, ...patch } }))
  const outputLines = () => config.value.tool_output?.max_lines ?? 2000
  // The last of `doom_loop` and `*` wins, and a single action ("allow") covers it, as on the server.
  const doomLoop = () => resolveRule(permissionRules(config.value.permission), "doom_loop") ?? "ask"
  const continueOnDeny = () => config.value.experimental?.continue_loop_on_deny === true

  // ------------------------------------------------------------------ Memory

  const memoryState = () => {
    const user = on_("userMemory")
    const project = on_("projectMemory")
    if (user && project) return language.t("settings.intelligence.hint.memory.both")
    if (user) return language.t("settings.intelligence.hint.memory.user")
    if (project) return language.t("settings.intelligence.hint.memory.project")
    return language.t("settings.intelligence.hint.memory.off")
  }

  const editMemory = (target: "user" | "project") => {
    const file = memory()?.[target]
    if (!file) return
    dialog.push(() => (
      <MemoryEditor
        title={language.t(
          target === "user" ? "settings.intelligence.memory.user.title" : "settings.intelligence.memory.project.title",
        )}
        text={file.text}
        limit={file.limit}
        onSave={(text) => replaceMemory(target, text)}
        onClose={() => dialog.close()}
      />
    ))
  }

  const replaceMemory = async (target: "user" | "project", text: string) => {
    const directory = props.directory
    const result = await client()
      .experimental.memory.replace(
        { ...(directory ? { directory } : {}), memoryReplaceInput: { target, text } },
        { throwOnError: true },
      )
      .then((response) => response.data)
      .catch(() => undefined)
    if (!result) {
      showToast({ variant: "error", title: language.t("settings.intelligence.memory.save.failed") })
      return false
    }
    setMemory(result)
    showToast({ variant: "success", icon: "circle-check", title: language.t("settings.intelligence.memory.saved") })
    return true
  }

  const clearMemory = (target: "user" | "project") =>
    dialog.push(() => (
      <SettingsConfirmDialog
        title={language.t("settings.intelligence.memory.clear.title")}
        description={language.t(
          target === "user" ? "settings.intelligence.memory.clear.user" : "settings.intelligence.memory.clear.project",
        )}
        confirm={language.t("settings.intelligence.memory.clear.confirm")}
        onConfirm={() => void replaceMemory(target, "")}
        onClose={() => dialog.close()}
      />
    ))

  const openFolder = (file: string) => {
    const folder = file.replace(/[\\/][^\\/]*$/, "")
    void platform
      .openPath?.(folder)
      .catch(() => showToast({ variant: "error", title: language.t("common.requestFailed") }))
  }

  // ------------------------------------------------------------------ Decisions

  const decisionHint = () => {
    const status = decision()
    if (!status) return "—"
    if (status.state === "downloading")
      return language.t("settings.intelligence.decisions.state.downloading", { percent: percent(status) })
    return language.t(`settings.intelligence.decisions.state.${status.state}`)
  }

  const decisionAction = async (action: "install" | "cancel" | "remove") => {
    const api = client().global.decision
    const result = await (action === "install" ? api.install() : action === "cancel" ? api.cancel() : api.remove())
      .then((response) => response.data)
      .catch(() => undefined)
    if (result) setDecision(result)
    else showToast({ variant: "error", title: language.t("common.requestFailed") })
  }

  const removeModel = () =>
    dialog.push(() => (
      <SettingsConfirmDialog
        title={language.t("settings.intelligence.decisions.remove.title")}
        description={language.t("settings.intelligence.decisions.remove.description")}
        confirm={language.t("settings.intelligence.decisions.remove.confirm")}
        onConfirm={() => void decisionAction("remove")}
        onClose={() => dialog.close()}
      />
    ))

  const runProbe = async () => {
    const text = ui.probe.trim()
    if (!text || ui.probing) return
    setUi("probing", true)
    const ask = (preset: "outcome" | "area") =>
      client()
        .global.decision.classify({ decisionClassifyInput: { preset, text, timeoutMs: 20_000 } })
        .then((response) => response.data ?? null)
        .catch(() => null)
    const [outcome, area] = await Promise.all([ask("outcome"), ask("area")])
    setProbe({ outcome, area })
    setUi("probing", false)
    void refetchDecision()
  }

  const sections = () => [
    {
      id: "memory" as const,
      label: language.t("settings.intelligence.tab.memory"),
      hint: memoryState(),
      icon: "brain" as const,
    },
    {
      id: "context" as const,
      label: language.t("settings.intelligence.tab.context"),
      hint: language.t(
        compaction().auto === false
          ? "settings.intelligence.hint.context.manual"
          : "settings.intelligence.hint.context.auto",
      ),
      icon: "code-lines" as const,
    },
    {
      id: "protection" as const,
      label: language.t("settings.intelligence.tab.protection"),
      hint: language.t("settings.intelligence.hint.protection", {
        count: (["guardrails", "loopBreaker", "toolCallRepair", "outputDistiller"] as const).filter(on_).length,
      }),
      icon: "shield" as const,
    },
    {
      id: "decisions" as const,
      label: language.t("settings.intelligence.tab.decisions"),
      hint: decisionHint(),
      icon: "glasses" as const,
    },
  ]

  const toggle = (key: SwitchKey, title: string, description: string, action: string) => (
    <SettingsRowV2 title={title} description={description}>
      <div data-action={action}>
        <Switch checked={on_(key)} onChange={(value) => void setSwitch(key, value)} hideLabel>
          {title}
        </Switch>
      </div>
    </SettingsRowV2>
  )

  return (
    <div class="settings-v2-tab settings-v2-intelligence">
      <SettingsHubHeader
        icon="brain"
        title={language.t("settings.intelligence.page.title")}
        description={language.t("settings.intelligence.page.description")}
        sections={sections()}
        value={ui.section}
        onChange={select}
      />

      <div class="settings-v2-tab-body settings-v2-kit-page">
        <Show when={remote() === null}>
          <p class="settings-v2-kit-note" data-tone="warn">
            {language.t("settings.config.loadFailed")}
          </p>
        </Show>
        <Show when={ui.section === "memory"}>
          <div class="settings-v2-kit-cards">
            <For each={["user", "project"] as const}>
              {(target) => {
                const key = target === "user" ? "userMemory" : "projectMemory"
                const file = () => memory()?.[target]
                const used = () => file()?.text.length ?? 0
                const limit = () => file()?.limit ?? 1
                const available = () => target === "user" || !!props.directory
                return (
                  <div
                    class="settings-v2-kit-card"
                    data-off={on_(key) ? undefined : ""}
                    data-action={`settings-intelligence-${key}`}
                  >
                    <div class="settings-v2-kit-card-head">
                      <span class="settings-v2-kit-card-icon" aria-hidden="true">
                        <Icon name={target === "user" ? "brain" : "folder"} size="small" />
                      </span>
                      <div class="settings-v2-kit-card-copy">
                        <span class="settings-v2-kit-card-title">
                          {language.t(`settings.intelligence.memory.${target}.title`)}
                        </span>
                        <span class="settings-v2-kit-card-description">
                          {language.t(`settings.intelligence.memory.${target}.description`)}
                        </span>
                      </div>
                      <Switch checked={on_(key)} onChange={(value) => void setSwitch(key, value)} hideLabel>
                        {language.t(`settings.intelligence.memory.${target}.title`)}
                      </Switch>
                    </div>
                    <div class="settings-v2-kit-card-body">
                      <Show
                        when={available()}
                        fallback={
                          <span class="settings-v2-kit-card-description">
                            {language.t("settings.intelligence.memory.noProject")}
                          </span>
                        }
                      >
                        <div class="settings-v2-kit-meter" data-tone={used() / limit() > 0.85 ? "warn" : undefined}>
                          <div class="settings-v2-kit-meter-track">
                            <div
                              class="settings-v2-kit-meter-fill"
                              style={{ width: `${Math.min(100, (used() / limit()) * 100)}%` }}
                            />
                          </div>
                          <div class="settings-v2-kit-meter-caption">
                            <span>
                              {used() === 0
                                ? language.t("settings.intelligence.memory.empty")
                                : language.t("settings.intelligence.memory.usage", {
                                    used: used().toLocaleString(language.intl()),
                                    limit: limit().toLocaleString(language.intl()),
                                  })}
                            </span>
                          </div>
                        </div>
                        <Show when={file()?.path}>
                          {(path) => (
                            <span class="settings-v2-kit-path" title={path()}>
                              {path()}
                            </span>
                          )}
                        </Show>
                      </Show>
                    </div>
                    <Show when={available() && file()}>
                      <div class="settings-v2-kit-card-foot">
                        <ButtonV2 size="small" variant="outline" onClick={() => editMemory(target)}>
                          {language.t(
                            used() === 0 ? "settings.intelligence.memory.write" : "settings.intelligence.memory.edit",
                          )}
                        </ButtonV2>
                        <Show when={platform.openPath}>
                          <ButtonV2 size="small" variant="ghost" onClick={() => openFolder(file()!.path)}>
                            {language.t("settings.intelligence.memory.folder")}
                          </ButtonV2>
                        </Show>
                        <Show when={used() > 0}>
                          <ButtonV2 size="small" variant="ghost" onClick={() => clearMemory(target)}>
                            {language.t("settings.intelligence.memory.clear")}
                          </ButtonV2>
                        </Show>
                      </div>
                    </Show>
                  </div>
                )
              }}
            </For>
          </div>

          <SettingsListV2 density="compact">
            {toggle(
              "autoSkillLearn",
              language.t("settings.intelligence.skillCreate"),
              language.t("settings.intelligence.skillCreate.description"),
              "settings-intelligence-skills",
            )}
          </SettingsListV2>
          <p class="settings-v2-kit-note">{language.t("settings.intelligence.memory.note")}</p>
        </Show>

        <Show when={ui.section === "context"}>
          <SettingsListV2 density="compact">
            <SettingsRowV2
              title={language.t("settings.intelligence.compaction.auto")}
              description={language.t("settings.intelligence.compaction.auto.description")}
            >
              <div data-action="settings-intelligence-compaction">
                <Switch
                  checked={compaction().auto !== false}
                  onChange={(value) => void setCompaction({ auto: value })}
                  hideLabel
                >
                  {language.t("settings.intelligence.compaction.auto")}
                </Switch>
              </div>
            </SettingsRowV2>
            <SettingsRowV2
              title={language.t("settings.intelligence.compaction.prune")}
              description={language.t("settings.intelligence.compaction.prune.description")}
            >
              <Switch
                checked={compaction().prune !== false}
                onChange={(value) => void setCompaction({ prune: value })}
                hideLabel
              >
                {language.t("settings.intelligence.compaction.prune")}
              </Switch>
            </SettingsRowV2>
            <SettingsRowV2
              title={language.t("settings.intelligence.compaction.tail")}
              description={language.t("settings.intelligence.compaction.tail.description")}
            >
              <SegmentedControlV2
                class="settings-v2-kit-segmented"
                value={String(compaction().tail_turns ?? 2)}
                onChange={(value) => value && void setCompaction({ tail_turns: Number(value) })}
                aria-label={language.t("settings.intelligence.compaction.tail")}
              >
                <For each={TAIL_TURNS}>
                  {(turns) => <SegmentedControlItemV2 value={String(turns)}>{turns}</SegmentedControlItemV2>}
                </For>
              </SegmentedControlV2>
            </SettingsRowV2>
            <SettingsRowV2
              title={language.t("settings.intelligence.toolOutput")}
              description={language.t("settings.intelligence.toolOutput.description")}
            >
              <SegmentedControlV2
                class="settings-v2-kit-segmented"
                value={String(outputLines())}
                onChange={(value) =>
                  value &&
                  void save({ tool_output: { max_lines: Number(value) } }, (draft) => ({
                    ...draft,
                    tool_output: { ...draft.tool_output, max_lines: Number(value) },
                  }))
                }
                aria-label={language.t("settings.intelligence.toolOutput")}
              >
                <For each={OUTPUT_LINES}>
                  {(lines) => (
                    <SegmentedControlItemV2 value={String(lines)}>
                      {lines.toLocaleString(language.intl())}
                    </SegmentedControlItemV2>
                  )}
                </For>
              </SegmentedControlV2>
            </SettingsRowV2>
            {toggle(
              "cleanWeb",
              language.t("settings.intelligence.webBoilerplate"),
              language.t("settings.intelligence.webBoilerplate.description"),
              "settings-intelligence-web",
            )}
            {toggle(
              "codeGraph",
              language.t("settings.intelligence.codeGraph"),
              language.t("settings.intelligence.codeGraph.description"),
              "settings-intelligence-codegraph",
            )}
          </SettingsListV2>
          <p class="settings-v2-kit-note">{language.t("settings.intelligence.reload.note")}</p>
        </Show>

        <Show when={ui.section === "protection"}>
          <div
            class="settings-v2-kit-hero"
            data-active={on_("guardrails") ? "" : undefined}
            data-action="settings-intelligence-shield"
          >
            <span class="settings-v2-kit-hero-icon" aria-hidden="true">
              <Icon name="shield" />
            </span>
            <div class="settings-v2-kit-hero-copy">
              <span class="settings-v2-kit-hero-title">{language.t("settings.intelligence.shellScan")}</span>
              <span class="settings-v2-kit-hero-description">
                {language.t("settings.intelligence.shellScan.description")}
              </span>
            </div>
            <Switch checked={on_("guardrails")} onChange={(value) => void setSwitch("guardrails", value)} hideLabel>
              {language.t("settings.intelligence.shellScan")}
            </Switch>
          </div>

          <SettingsListV2 density="compact">
            {toggle(
              "loopBreaker",
              language.t("settings.intelligence.loopBreaker"),
              language.t("settings.intelligence.loopBreaker.description"),
              "settings-intelligence-loop",
            )}
            <Show when={on_("loopBreaker")}>
              <div class="settings-v2-kit-subrow">
                <span>{language.t("settings.intelligence.doomLoop")}</span>
                <SegmentedControlV2
                  class="settings-v2-kit-segmented"
                  value={doomLoop()}
                  onChange={(value) =>
                    value &&
                    void save({ permission: { doom_loop: value as (typeof DOOM_LOOP)[number] } }, (draft) => ({
                      ...draft,
                      // A single action ("allow") stays as the `*` rule, as the server keeps it.
                      permission: {
                        ...(typeof draft.permission === "object"
                          ? draft.permission
                          : draft.permission
                            ? { "*": draft.permission }
                            : {}),
                        doom_loop: value as (typeof DOOM_LOOP)[number],
                      },
                    }))
                  }
                  aria-label={language.t("settings.intelligence.doomLoop")}
                >
                  <For each={DOOM_LOOP}>
                    {(action) => (
                      <SegmentedControlItemV2 value={action}>
                        {language.t(`settings.intelligence.doomLoop.${action}`)}
                      </SegmentedControlItemV2>
                    )}
                  </For>
                </SegmentedControlV2>
              </div>
            </Show>
            {toggle(
              "toolCallRepair",
              language.t("settings.intelligence.toolCallRepair"),
              language.t("settings.intelligence.toolCallRepair.description"),
              "settings-intelligence-repair",
            )}
            {toggle(
              "outputDistiller",
              language.t("settings.intelligence.outputDistiller"),
              language.t("settings.intelligence.outputDistiller.description"),
              "settings-intelligence-distiller",
            )}
            <SettingsRowV2
              title={language.t("settings.intelligence.continueOnDeny")}
              description={language.t("settings.intelligence.continueOnDeny.description")}
            >
              <Switch
                checked={continueOnDeny()}
                onChange={(value) =>
                  void save({ experimental: { continue_loop_on_deny: value } }, (draft) => ({
                    ...draft,
                    experimental: { ...draft.experimental, continue_loop_on_deny: value },
                  }))
                }
                hideLabel
              >
                {language.t("settings.intelligence.continueOnDeny")}
              </Switch>
            </SettingsRowV2>
          </SettingsListV2>
          <p class="settings-v2-kit-note">{language.t("settings.intelligence.reload.note")}</p>
        </Show>

        <Show when={ui.section === "decisions"}>
          <DecisionCard
            status={decision()}
            onInstall={() => void decisionAction("install")}
            onCancel={() => void decisionAction("cancel")}
            onRemove={removeModel}
          />

          <SettingsListV2 density="compact">
            {toggle(
              "smartAlerts",
              language.t("settings.intelligence.smartAlerts"),
              language.t("settings.intelligence.smartAlerts.description"),
              "settings-intelligence-smart-alerts",
            )}
          </SettingsListV2>

          <Show when={decision()?.state === "ready"}>
            <div class="settings-v2-kit-card" data-action="settings-intelligence-probe">
              <div class="settings-v2-kit-card-head">
                <span class="settings-v2-kit-card-icon" aria-hidden="true">
                  <Icon name="checklist" size="small" />
                </span>
                <div class="settings-v2-kit-card-copy">
                  <span class="settings-v2-kit-card-title">{language.t("settings.intelligence.probe.title")}</span>
                  <span class="settings-v2-kit-card-description">
                    {language.t("settings.intelligence.probe.description")}
                  </span>
                </div>
              </div>
              <TextareaV2
                rows={3}
                value={ui.probe}
                placeholder={language.t("settings.intelligence.probe.placeholder")}
                onInput={(event) => setUi("probe", event.currentTarget.value)}
              />
              <div class="settings-v2-kit-card-foot">
                <ButtonV2
                  size="small"
                  variant="contrast"
                  disabled={!ui.probe.trim() || ui.probing}
                  onClick={() => void runProbe()}
                >
                  {language.t(ui.probing ? "settings.intelligence.probe.running" : "settings.intelligence.probe.run")}
                </ButtonV2>
                <Show when={probe.outcome}>
                  {(answer) => (
                    <span class="settings-v2-kit-card-description">
                      {language.t("settings.intelligence.probe.time", { ms: answer().ms })}
                    </span>
                  )}
                </Show>
              </div>
              <Show when={probe.outcome}>
                {(answer) => (
                  <Bars
                    title={language.t("settings.intelligence.probe.outcome")}
                    answer={answer()}
                    prefix="settings.intelligence.outcome"
                  />
                )}
              </Show>
              <Show when={probe.area}>
                {(answer) => (
                  <Bars
                    title={language.t("settings.intelligence.probe.area")}
                    answer={answer()}
                    prefix="settings.intelligence.area"
                  />
                )}
              </Show>
            </div>
          </Show>

          <p class="settings-v2-kit-note">{language.t("settings.intelligence.decisions.credits")}</p>
        </Show>
      </div>
    </div>
  )
}

function percent(status: DecisionStatus) {
  return status.totalBytes > 0 ? Math.round((status.receivedBytes / status.totalBytes) * 100) : 0
}

function DecisionCard(props: {
  status: DecisionStatus | undefined
  onInstall: () => void
  onCancel: () => void
  onRemove: () => void
}) {
  const language = useLanguage()
  const state = () => props.status?.state
  const tone = () => {
    if (state() === "ready") return "ok"
    if (state() === "downloading") return "busy"
    if (state() === "error") return "error"
    if (state() === "unavailable") return "warn"
    return undefined
  }
  const size = () => `${Math.round((props.status?.totalBytes ?? 0) / 1_000_000)} MB`
  return (
    <div class="settings-v2-kit-hero" data-active={state() === "ready" ? "" : undefined}>
      <span class="settings-v2-kit-hero-icon" aria-hidden="true">
        <Icon name="glasses" />
      </span>
      <div class="settings-v2-kit-hero-copy">
        <span class="settings-v2-kit-hero-title">
          {language.t("settings.intelligence.decisions.title")}
          <Show when={state()}>
            <span class="settings-v2-kit-pill" data-tone={tone()}>
              {state() === "downloading"
                ? language.t("settings.intelligence.decisions.state.downloading", { percent: percent(props.status!) })
                : language.t(`settings.intelligence.decisions.state.${state()}`)}
            </span>
          </Show>
          <Show when={props.status?.loaded}>
            <span class="settings-v2-kit-pill" data-tone="info">
              {language.t("settings.intelligence.decisions.loaded")}
            </span>
          </Show>
        </span>
        <span class="settings-v2-kit-hero-description">
          {state() === "unavailable"
            ? language.t("settings.intelligence.decisions.unavailable")
            : state() === "error"
              ? props.status?.message
              : language.t("settings.intelligence.decisions.description", { size: size() })}
        </span>
        <Show when={state() === "downloading"}>
          <div class="settings-v2-kit-meter">
            <div class="settings-v2-kit-meter-track">
              <div class="settings-v2-kit-meter-fill" style={{ width: `${percent(props.status!)}%` }} />
            </div>
          </div>
        </Show>
      </div>
      <div class="settings-v2-kit-actions">
        <Show when={state() === "missing" || state() === "error"}>
          <ButtonV2 size="small" variant="contrast" onClick={props.onInstall}>
            {language.t("settings.intelligence.decisions.install", { size: size() })}
          </ButtonV2>
        </Show>
        <Show when={state() === "downloading"}>
          <ButtonV2 size="small" variant="outline" onClick={props.onCancel}>
            {language.t("common.cancel")}
          </ButtonV2>
        </Show>
        <Show when={state() === "ready"}>
          <ButtonV2 size="small" variant="ghost" onClick={props.onRemove}>
            {language.t("settings.intelligence.decisions.remove")}
          </ButtonV2>
        </Show>
      </div>
    </div>
  )
}

function Bars(props: { title: string; answer: DecisionAnswer; prefix: string }) {
  const language = useLanguage()
  const entries = () => Object.entries(props.answer.probabilities).toSorted((a, b) => b[1] - a[1])
  return (
    <div class="settings-v2-kit-section">
      <p class="settings-v2-kit-label">{props.title}</p>
      <div class="settings-v2-kit-bars">
        <For each={entries()}>
          {([label, value]) => (
            <div class="settings-v2-kit-bar" data-best={label === props.answer.choice ? "" : undefined}>
              <span>{language.t(`${props.prefix}.${label}` as Parameters<typeof language.t>[0])}</span>
              <div class="settings-v2-kit-meter-track">
                <div class="settings-v2-kit-meter-fill" style={{ width: `${Math.round(value * 100)}%` }} />
              </div>
              <span class="settings-v2-kit-bar-value">{Math.round(value * 100)} %</span>
            </div>
          )}
        </For>
      </div>
    </div>
  )
}

function MemoryEditor(props: {
  title: string
  text: string
  limit: number
  onSave: (text: string) => Promise<boolean>
  onClose: () => void
}) {
  const language = useLanguage()
  const [draft, setDraft] = createStore({ text: props.text, saving: false })
  return (
    <Dialog size="large">
      <DialogHeader>
        <DialogTitle>{props.title}</DialogTitle>
      </DialogHeader>
      <DialogBody>
        <TextareaV2
          rows={16}
          value={draft.text}
          onInput={(event) => setDraft("text", event.currentTarget.value)}
          style={{ "font-family": "var(--v2-font-mono, ui-monospace, monospace)", "font-size": "12.5px" }}
        />
        <span class="settings-v2-kit-meter-caption">
          <span>{language.t("settings.intelligence.memory.editor.hint")}</span>
          <span data-over={draft.text.length > props.limit ? "" : undefined}>
            {draft.text.length.toLocaleString(language.intl())} / {props.limit.toLocaleString(language.intl())}
          </span>
        </span>
      </DialogBody>
      <DialogFooter>
        <ButtonV2 variant="outline" onClick={props.onClose}>
          {language.t("common.cancel")}
        </ButtonV2>
        <ButtonV2
          variant="contrast"
          disabled={draft.saving}
          onClick={async () => {
            setDraft("saving", true)
            // A failed save keeps the editor open with the user's text; the toast says what happened.
            if (await props.onSave(draft.text)) return props.onClose()
            setDraft("saving", false)
          }}
        >
          {language.t("common.save")}
        </ButtonV2>
      </DialogFooter>
    </Dialog>
  )
}
