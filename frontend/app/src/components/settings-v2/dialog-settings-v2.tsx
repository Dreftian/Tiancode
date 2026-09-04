import { Component, createMemo, createSignal, Show } from "solid-js"
import { Dialog } from "@tiancode-ai/ui/v2/dialog-v2"
import { TabsV2 } from "@tiancode-ai/ui/v2/tabs-v2"
import { Icon } from "@tiancode-ai/ui/icon"
import { useLanguage } from "@/context/language"
import { usePlatform } from "@/context/platform"
import { SettingsGeneralV2 } from "./general"
import { SettingsKeybinds } from "../settings-keybinds"
import { SettingsProvidersV2 } from "./providers"
import { SettingsModelsV2 } from "./models"
import { SettingsModelsHubV2 } from "./models-hub"
import { SettingsSkillsV2 } from "./skills"
import { SettingsSubAgentsV2 } from "./sub-agents"
import { SettingsMcpPluginsV2 } from "./mcp-plugins"
import { SettingsPetsV2 } from "./pets"
import { SettingsComputerUseV2 } from "./computer-use"
import { SettingsGithubV2 } from "./github"
import { SettingsIntelligenceV2 } from "./intelligence"
import { SettingsEcosystemV2 } from "./ecosystem"
import { SettingsVoicesV2 } from "./voices"
import "./settings-v2.css"
import { SettingsServersV2 } from "./servers"
import { useDialog } from "@tiancode-ai/ui/context/dialog"
import { useLayout } from "@/context/layout"
import { useTabs } from "@/context/tabs"
import { useServerSync } from "@/context/server-sync"

const IconEcosystem = () => (
  <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="10" cy="10" r="2.5" fill="currentColor" fill-opacity="0.2" />
    <circle cx="4" cy="6" r="2" />
    <circle cx="16" cy="6" r="2" />
    <circle cx="5" cy="15" r="2" />
    <circle cx="15" cy="15" r="2" />
    <path d="M5.5 7.5L8.5 9M14.5 7.5L11.5 9M6.5 14L8.5 11M13.5 14L11.5 11M6 6h8" />
  </svg>
)

const IconVoices = () => (
  <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <rect x="7" y="2" width="6" height="10" rx="3" fill="currentColor" fill-opacity="0.15" />
    <path d="M4 8v1a6 6 0 0012 0V8M10 15v3M7 18h6" />
  </svg>
)

const IconSkills = () => (
  <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <path d="M8.5 3H4.5A1.5 1.5 0 003 4.5V8.5a1.5 1.5 0 001.5 1.5H5a2 2 0 010 4h-.5A1.5 1.5 0 003 15.5V17a1.5 1.5 0 001.5 1.5h4a1.5 1.5 0 001.5-1.5v-.5a2 2 0 014 0v.5A1.5 1.5 0 0015.5 18.5h1.5a1.5 1.5 0 001.5-1.5v-4a1.5 1.5 0 00-1.5-1.5h-.5a2 2 0 010-4h.5A1.5 1.5 0 0018.5 6V4.5A1.5 1.5 0 0017 3h-4a1.5 1.5 0 00-1.5 1.5v.5a2 2 0 01-4 0v-.5A1.5 1.5 0 008.5 3z" />
  </svg>
)

const IconSubAgents = () => (
  <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <rect x="3" y="6" width="14" height="10" rx="3" fill="currentColor" fill-opacity="0.15" />
    <path d="M10 2v4M2 11h1M17 11h1M7 10.5a1 1 0 100-2 1 1 0 000 2zM13 10.5a1 1 0 100-2 1 1 0 000 2zM7 13.5h6" />
  </svg>
)

const IconMcpPlugins = () => (
  <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <path d="M7 3v4M13 3v4M5 7h10a1 1 0 011 1v2.5a5 5 0 01-5 5h-2a5 5 0 01-5-5V8a1 1 0 011-1zM10 15.5v2.5" />
  </svg>
)

const IconPets = () => (
  <svg width="18" height="18" viewBox="0 0 20 20" fill="currentColor">
    <circle cx="5" cy="7" r="1.8" />
    <circle cx="8.5" cy="4.5" r="1.8" />
    <circle cx="12" cy="4.5" r="1.8" />
    <circle cx="15.5" cy="7" r="1.8" />
    <path d="M10.2 9c-2.4 0-4.7 1.4-4.7 3.8 0 2.2 2 3.7 4.7 3.7s4.8-1.5 4.8-3.7c0-2.4-2.4-3.8-4.8-3.8z" />
  </svg>
)

export const DialogSettings: Component<{
  sessionID?: string
  defaultValue?: string
}> = (props) => {
  const language = useLanguage()
  const platform = usePlatform()
  const dialog = useDialog()
  const layout = useLayout()
  const tabs = useTabs()
  const serverSync = useServerSync()
  const initialTab = props.defaultValue === "mcp-servers" || props.defaultValue === "plugins"
    ? "mcp-plugins"
    : props.defaultValue === "browser"
      ? "computer-use"
      : props.defaultValue ?? "general"
  const [tab, setTab] = createSignal(initialTab)

  // Lazy cache (matching OpenCode Desktop): only mount the active tab initially,
  // and keep visited tabs cached in DOM for instant 0ms switching without CPU/background thrashing.
  const [visited, setVisited] = createSignal<Set<string>>(new Set([initialTab]))
  const markVisited = (val: string) => {
    setTab(val)
    setVisited((prev) => {
      if (prev.has(val)) return prev
      const next = new Set(prev)
      next.add(val)
      return next
    })
  }

  const rawDirectory = () => {
    const route = layout.route()
    if (route.type === "dir-new-sesssion") return route.dir
    if (route.type === "draft") {
      const draft = tabs.store.find((item) => item.type === "draft" && item.draftID === route.draftID)
      return draft?.type === "draft" ? draft.directory : undefined
    }
    if (route.type === "session") return serverSync().session.get(route.sessionId)?.directory
    return undefined
  }
  const directory = createMemo(rawDirectory, undefined, { equals: (a, b) => a === b })

  const showProviders = () => {
    void dialog.show(() => <DialogSettings sessionID={props.sessionID} defaultValue="providers" />)
  }

  return (
    <Dialog size="x-large" variant="settings" class="settings-v2-dialog">
      <TabsV2
        orientation="vertical"
        variant="settings"
        value={tab()}
        onChange={(value) => markVisited(value)}
        class="settings-v2"
      >
        <TabsV2.List>
          <div class="flex flex-col justify-between h-full w-full">
            <div class="flex flex-col gap-3 w-full">
              <div class="flex flex-col gap-3">
                {/* Desktop Section */}
                <div class="flex flex-col gap-1.5">
                  <TabsV2.SectionTitle>{language.t("settings.section.desktop")}</TabsV2.SectionTitle>
                  <div class="flex flex-col gap-1 w-full">
                    <TabsV2.Trigger value="general">
                      <Icon name="sliders" />
                      {language.t("settings.tab.general")}
                    </TabsV2.Trigger>
                    <TabsV2.Trigger value="intelligence">
                      <Icon name="brain" />
                      {language.t("settings.tab.intelligence") || "Intelligence"}
                    </TabsV2.Trigger>
                    <TabsV2.Trigger value="ecosystem">
                      <IconEcosystem />
                      Ecosistema IA
                    </TabsV2.Trigger>
                    <TabsV2.Trigger value="computer-use">
                      <Icon name="window-cursor" />
                      {language.t("settings.tab.computerUse") || "Uso de la PC"}
                    </TabsV2.Trigger>
                    <TabsV2.Trigger value="shortcuts">
                      <Icon name="keyboard" />
                      {language.t("settings.tab.shortcuts")}
                    </TabsV2.Trigger>
                  </div>
                </div>

                {/* Server Section */}
                <div class="flex flex-col gap-1.5">
                  <TabsV2.SectionTitle>{language.t("settings.section.server")}</TabsV2.SectionTitle>
                  <div class="flex flex-col gap-1 w-full">
                    <TabsV2.Trigger value="servers">
                      <Icon name="server" />
                      {language.t("status.popover.tab.servers")}
                    </TabsV2.Trigger>
                    <TabsV2.Trigger value="providers">
                      <Icon name="providers" />
                      {language.t("settings.providers.title")}
                    </TabsV2.Trigger>
                    <TabsV2.Trigger value="models">
                      <Icon name="models" />
                      {language.t("settings.models.title")}
                    </TabsV2.Trigger>
                    <TabsV2.Trigger value="models-hub">
                      <Icon name="brain" />
                      {language.t("settings.tab.modelsHub")}
                    </TabsV2.Trigger>
                  </div>
                </div>

                {/* Extensions Section */}
                <div class="flex flex-col gap-1.5">
                  <TabsV2.SectionTitle>{language.t("settings.section.extensions")}</TabsV2.SectionTitle>
                  <div class="flex flex-col gap-1 w-full">
                    <TabsV2.Trigger value="github">
                      <Icon name="github" />
                      {language.t("settings.tab.github")}
                    </TabsV2.Trigger>
                    <TabsV2.Trigger value="voices">
                      <IconVoices />
                      {language.t("settings.tab.voices")}
                    </TabsV2.Trigger>
                    <TabsV2.Trigger value="skills">
                      <IconSkills />
                      {language.t("settings.tab.skills")}
                    </TabsV2.Trigger>
                    <TabsV2.Trigger value="sub-agents">
                      <IconSubAgents />
                      {language.t("settings.tab.subAgents") || "Sub-Agentes"}
                    </TabsV2.Trigger>
                    <TabsV2.Trigger value="mcp-plugins">
                      <IconMcpPlugins />
                      {language.t("settings.tab.mcpPlugins") || "MCP y Plugins"}
                    </TabsV2.Trigger>
                  </div>
                </div>

                {/* Integrations Section */}
                <div class="flex flex-col gap-1.5">
                  <TabsV2.SectionTitle>{language.t("settings.section.integrations")}</TabsV2.SectionTitle>
                  <div class="flex flex-col gap-1 w-full">
                    <TabsV2.Trigger value="pets">
                      <IconPets />
                      {language.t("settings.tab.pets")}
                    </TabsV2.Trigger>
                  </div>
                </div>
              </div>
            </div>
            <div class="settings-v2-nav-footer">
              <span>{language.t("app.name.desktop")}</span>
              <span>v{platform.version}</span>
            </div>
          </div>
        </TabsV2.List>

        {/* Tab Panels with Fluid Cached Switching */}
        <TabsV2.Content forceMount value="general" class="settings-v2-panel" classList={{ "!hidden": tab() !== "general" }}>
          <Show when={visited().has("general")}>
            <SettingsGeneralV2 sessionID={props.sessionID} />
          </Show>
        </TabsV2.Content>

        <TabsV2.Content forceMount value="intelligence" class="settings-v2-panel" classList={{ "!hidden": tab() !== "intelligence" }}>
          <Show when={visited().has("intelligence")}>
            <SettingsIntelligenceV2 />
          </Show>
        </TabsV2.Content>

        <TabsV2.Content forceMount value="ecosystem" class="settings-v2-panel" classList={{ "!hidden": tab() !== "ecosystem" }}>
          <Show when={visited().has("ecosystem")}>
            <SettingsEcosystemV2 />
          </Show>
        </TabsV2.Content>

        <TabsV2.Content forceMount value="computer-use" class="settings-v2-panel" classList={{ "!hidden": tab() !== "computer-use" }}>
          <Show when={visited().has("computer-use")}>
            <SettingsComputerUseV2 directory={directory()} active={tab() === "computer-use"} />
          </Show>
        </TabsV2.Content>

        <TabsV2.Content forceMount value="shortcuts" class="settings-v2-panel" classList={{ "!hidden": tab() !== "shortcuts" }}>
          <Show when={visited().has("shortcuts")}>
            <SettingsKeybinds v2 />
          </Show>
        </TabsV2.Content>

        <TabsV2.Content forceMount value="servers" class="settings-v2-panel" classList={{ "!hidden": tab() !== "servers" }}>
          <Show when={visited().has("servers")}>
            <SettingsServersV2 />
          </Show>
        </TabsV2.Content>

        <TabsV2.Content forceMount value="providers" class="settings-v2-panel" classList={{ "!hidden": tab() !== "providers" }}>
          <Show when={visited().has("providers")}>
            <SettingsProvidersV2 directory={directory} onBack={showProviders} />
          </Show>
        </TabsV2.Content>

        <TabsV2.Content forceMount value="models" class="settings-v2-panel" classList={{ "!hidden": tab() !== "models" }}>
          <Show when={visited().has("models")}>
            <SettingsModelsV2 />
          </Show>
        </TabsV2.Content>

        <TabsV2.Content forceMount value="models-hub" class="settings-v2-panel" classList={{ "!hidden": tab() !== "models-hub" }}>
          <Show when={visited().has("models-hub")}>
            <SettingsModelsHubV2 directory={directory()} active={tab() === "models-hub"} />
          </Show>
        </TabsV2.Content>

        <TabsV2.Content forceMount value="github" class="settings-v2-panel" classList={{ "!hidden": tab() !== "github" }}>
          <Show when={visited().has("github")}>
            <SettingsGithubV2 directory={directory()} active={tab() === "github"} />
          </Show>
        </TabsV2.Content>

        <TabsV2.Content forceMount value="voices" class="settings-v2-panel" classList={{ "!hidden": tab() !== "voices" }}>
          <Show when={visited().has("voices")}>
            <SettingsVoicesV2 active={tab() === "voices"} />
          </Show>
        </TabsV2.Content>

        <TabsV2.Content forceMount value="skills" class="settings-v2-panel" classList={{ "!hidden": tab() !== "skills" }}>
          <Show when={visited().has("skills")}>
            <SettingsSkillsV2 directory={directory()} active={tab() === "skills"} />
          </Show>
        </TabsV2.Content>

        <TabsV2.Content forceMount value="sub-agents" class="settings-v2-panel" classList={{ "!hidden": tab() !== "sub-agents" }}>
          <Show when={visited().has("sub-agents")}>
            <SettingsSubAgentsV2 directory={directory()} active={tab() === "sub-agents"} />
          </Show>
        </TabsV2.Content>

        <TabsV2.Content forceMount value="mcp-plugins" class="settings-v2-panel" classList={{ "!hidden": tab() !== "mcp-plugins" }}>
          <Show when={visited().has("mcp-plugins")}>
            <SettingsMcpPluginsV2 directory={directory()} active={tab() === "mcp-plugins"} />
          </Show>
        </TabsV2.Content>

        <TabsV2.Content forceMount value="pets" class="settings-v2-panel" classList={{ "!hidden": tab() !== "pets" }}>
          <Show when={visited().has("pets")}>
            <SettingsPetsV2 active={tab() === "pets"} />
          </Show>
        </TabsV2.Content>
      </TabsV2>
    </Dialog>
  )
}
