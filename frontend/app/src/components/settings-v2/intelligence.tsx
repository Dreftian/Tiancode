import { createEffect, createSignal, onCleanup, onMount, type Component } from "solid-js"
import { Switch } from "@tiancode-ai/ui/v2/switch-v2"
import { useLanguage } from "@/context/language"
import { useSettings } from "@/context/settings"
import { useServerSDK } from "@/context/server-sdk"
import { loadIntelligenceConfig, syncIntelligenceConfig } from "@/utils/intelligence-config"
import { SettingsListV2 } from "./parts/list"
import { SettingsRowV2 } from "./parts/row"

export const SettingsIntelligenceV2: Component = () => {
  const language = useLanguage()
  const settings = useSettings()
  const serverSdk = useServerSDK()

  // The server config owns these switches; the local store is only a cache of it. Seed the
  // cache before the mirroring effect below is allowed to write, otherwise a fresh client
  // PATCHes its all-on defaults over switches the user turned off somewhere else.
  const [seeded, setSeeded] = createSignal(false)
  onMount(() => {
    const controller = new AbortController()
    onCleanup(() => controller.abort())
    void loadIntelligenceConfig(serverSdk()?.server?.http, controller.signal).then((remote) => {
      if (remote) settings.intelligence.merge(remote)
      setSeeded(true)
    })
  })

  // These switches only take effect server-side, so mirror them into the server config
  // whenever they change. The renderer's settings store is localStorage-only and the
  // agent never sees it.
  createEffect(() => {
    if (!seeded()) return
    const switches = {
      userMemory: settings.intelligence.userMemory(),
      projectMemory: settings.intelligence.projectMemory(),
      guardrails: settings.intelligence.guardrails(),
      codeGraph: settings.intelligence.codeGraph(),
      outputDistiller: settings.intelligence.outputDistiller(),
      toolCallRepair: settings.intelligence.toolCallRepair(),
      loopBreaker: settings.intelligence.loopBreaker(),
      cleanWeb: settings.intelligence.cleanWeb(),
      autoSkillLearn: settings.intelligence.autoSkillLearn(),
    }
    const controller = new AbortController()
    onCleanup(() => controller.abort())
    void syncIntelligenceConfig(serverSdk()?.server?.http, switches, controller.signal)
  })

  return (
    <>
      <div class="settings-v2-tab-header settings-v2-tab-header--stacked">
        <div class="settings-v2-tab-header-row">
          <h2 class="settings-v2-tab-title">
            {language.t("settings.intelligence.title") || "Intelligence & Memory"}
          </h2>
        </div>
        <p class="settings-v2-tab-description">
          {language.t("settings.intelligence.description") ||
            "Configure long-term memory (LTM), smart web extraction, graph analysis and execution safety."}
        </p>
      </div>

      <div class="settings-v2-tab-body">
        {/* Section 1: Long-Term Memory */}
        <div class="settings-v2-section">
          <h3 class="settings-v2-section-title">
            🧠 {language.t("settings.intelligence.section.memory") || "Long-Term Memory (LTM)"}
          </h3>
          <SettingsListV2>
            <SettingsRowV2
              title={language.t("settings.intelligence.userMemory") || "User memory (USER.md)"}
              description={
                language.t("settings.intelligence.userMemory.desc") ||
                "Remembers global coding, style and language preferences across all your projects."
              }
            >
              <Switch
                checked={settings.intelligence.userMemory()}
                onChange={(checked) => settings.intelligence.setUserMemory(checked)}
              />
            </SettingsRowV2>

            <SettingsRowV2
              title={language.t("settings.intelligence.projectMemory") || "Project memory (MEMORY.md)"}
              description={
                language.t("settings.intelligence.projectMemory.desc") ||
                "Stores this repository's technical architecture, network ports and build quirks."
              }
            >
              <Switch
                checked={settings.intelligence.projectMemory()}
                onChange={(checked) => settings.intelligence.setProjectMemory(checked)}
              />
            </SettingsRowV2>

            <SettingsRowV2
              title={language.t("settings.intelligence.skillCreate") || "Skill authoring (SKILL.md)"}
              description={
                language.t("settings.intelligence.skillCreate.desc") ||
                "Lets the agent save a workflow as a reusable SKILL.md under .tiancode/skills or your global skills folder. The agent decides when to write one."
              }
            >
              <Switch
                checked={settings.intelligence.autoSkillLearn()}
                onChange={(checked) => settings.intelligence.setAutoSkillLearn(checked)}
              />
            </SettingsRowV2>
          </SettingsListV2>
        </div>

        {/* Section 2: Code Graph & Context */}
        <div class="settings-v2-section">
          <h3 class="settings-v2-section-title">
            🔍 {language.t("settings.intelligence.section.context") || "Code Graph & Context"}
          </h3>
          <SettingsListV2>
            <SettingsRowV2
              title={language.t("settings.intelligence.codeGraph") || "Code graph analysis (CodeGraph)"}
              description={
                language.t("settings.intelligence.codeGraph.desc") ||
                "Indexes functions, classes and dependencies to reason about architectural impact before editing."
              }
            >
              <Switch
                checked={settings.intelligence.codeGraph()}
                onChange={(checked) => settings.intelligence.setCodeGraph(checked)}
              />
            </SettingsRowV2>

            <SettingsRowV2
              title={language.t("settings.intelligence.outputDistiller") || "Terminal output distillation"}
              description={
                language.t("settings.intelligence.outputDistiller.desc") ||
                "Shortens long terminal output before the model reads it. The complete output is still kept in the tool result."
              }
            >
              <Switch
                checked={settings.intelligence.outputDistiller()}
                onChange={(checked) => settings.intelligence.setOutputDistiller(checked)}
              />
            </SettingsRowV2>
          </SettingsListV2>
        </div>

        {/* Section 3: Web & Execution Safety */}
        <div class="settings-v2-section">
          <h3 class="settings-v2-section-title">
            🛡️ {language.t("settings.intelligence.section.safety") || "Web & Execution Safety"}
          </h3>
          <SettingsListV2>
            <SettingsRowV2
              title={language.t("settings.intelligence.webBoilerplate") || "Strip web page boilerplate"}
              description={
                language.t("settings.intelligence.webBoilerplate.desc") ||
                "Drops scripts, navigation, footers and forms when a fetched page is turned into Markdown. Turn it off for pages whose content lives inside those elements."
              }
            >
              <Switch
                checked={settings.intelligence.cleanWeb()}
                onChange={(checked) => settings.intelligence.setCleanWeb(checked)}
              />
            </SettingsRowV2>

            <SettingsRowV2
              title={language.t("settings.intelligence.shellScan") || "Shell command screening (AgentShield)"}
              description={
                language.t("settings.intelligence.shellScan.desc") ||
                "Scans every shell command for destructive deletions, reads of secret files and piped remote execution, and attaches a warning to the tool call. Advisory only: it blocks nothing and masks nothing."
              }
            >
              <Switch
                checked={settings.intelligence.guardrails()}
                onChange={(checked) => settings.intelligence.setGuardrails(checked)}
              />
            </SettingsRowV2>

            <SettingsRowV2
              title={language.t("settings.intelligence.toolCallRepair") || "Tool-call argument repair"}
              description={
                language.t("settings.intelligence.toolCallRepair.desc") ||
                "Rebuilds malformed tool arguments — truncated JSON, unclosed braces, markdown fences — that local or streaming models emit. When off, a malformed call simply fails."
              }
            >
              <Switch
                checked={settings.intelligence.toolCallRepair()}
                onChange={(checked) => settings.intelligence.setToolCallRepair(checked)}
              />
            </SettingsRowV2>

            <SettingsRowV2
              title={language.t("settings.intelligence.loopBreaker") || "Loop breaker"}
              description={
                language.t("settings.intelligence.loopBreaker.desc") ||
                "Halts the agent when it repeats the same tool call or fires too many tools in one turn, and asks you before it carries on."
              }
            >
              <Switch
                checked={settings.intelligence.loopBreaker()}
                onChange={(checked) => settings.intelligence.setLoopBreaker(checked)}
              />
            </SettingsRowV2>
          </SettingsListV2>
        </div>
      </div>
    </>
  )
}
