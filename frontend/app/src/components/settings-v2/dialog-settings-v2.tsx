import { Component, createMemo, createSignal, onCleanup, Show } from "solid-js"
import { createStore } from "solid-js/store"
import { createMediaQuery } from "@solid-primitives/media"
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
import { SettingsConnectionsHubV2, type ConnectionsSection } from "./connections-hub"
import {
  COMPUTER_USE_SECTIONS,
  LEGACY_COMPUTER_USE_SECTIONS,
  SettingsComputerUseV2,
  type ComputerUseSection,
} from "./computer-use"
import { INTELLIGENCE_SECTIONS, type IntelligenceSection, SettingsIntelligenceV2 } from "./intelligence"
import { SettingsVoicesV2 } from "./voices"
import "./settings-v2.css"
import { SERVER_SECTIONS, SettingsServerHubV2, type ServerSection } from "./server-hub"
import { SettingsNotificationsV2 } from "./notifications"
import { SettingsAboutV2 } from "./about"
import { SettingsSearchV2, revealSettingsRow } from "./search"
import type { SettingsSearchEntry } from "./search-catalog"
import { useDialog } from "@tiancode-ai/ui/context/dialog"
import { useLayout } from "@/context/layout"
import { useTabs } from "@/context/tabs"
import { useServerSync } from "@/context/server-sync"

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

const IconConnections = () => (
  <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="5" cy="6" r="2" />
    <circle cx="15" cy="6" r="2" />
    <circle cx="10" cy="15" r="2" />
    <path d="M6.5 7.5L8.5 13M13.5 7.5L11.5 13M7 6h6" />
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

const IconBell = () => (
  <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <path d="M5 8a5 5 0 0110 0v3.5l1.5 2.5h-13L5 11.5V8zM8 16.5a2 2 0 004 0" />
  </svg>
)

const IconAbout = () => (
  <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="10" cy="10" r="7.5" />
    <path d="M10 9v5M10 6.5v.01" />
  </svg>
)

/**
 * Where Settings opens. Besides a tab, callers may name a section: "data" (General › Datos),
 * "desktop", "browser" or "remote" (Uso de la PC; the older "tools", "pairing" and "experimental"
 * still work), "memory", "context", "protection" or "decisions" (Inteligencia). Anything that is not a string, such as
 * the click event a button forwards, opens General. "servers", "projects" and "worktrees" open
 * Servidor on that section; "connectors", "gateways" and "github" open Conexiones on that section.
 */
type SettingsTarget = {
  tab: string
  general?: string
  computerUse?: ComputerUseSection
  server?: ServerSection
  connections?: ConnectionsSection
  intelligence?: IntelligenceSection
}

function settingsTarget(value: unknown): SettingsTarget {
  const requested = typeof value === "string" ? value : "general"
  if (requested === "mcp-servers" || requested === "plugins") return { tab: "mcp-plugins" }
  if (requested === "data") return { tab: "general", general: "data" }
  if ((COMPUTER_USE_SECTIONS as readonly string[]).includes(requested))
    return { tab: "computer-use", computerUse: requested as ComputerUseSection }
  if (requested in LEGACY_COMPUTER_USE_SECTIONS)
    return { tab: "computer-use", computerUse: LEGACY_COMPUTER_USE_SECTIONS[requested] }
  if ((SERVER_SECTIONS as readonly string[]).includes(requested)) return { tab: "server", server: requested as ServerSection }
  if (requested === "connectors" || requested === "gateways" || requested === "github")
    return { tab: "connections", connections: requested }
  if ((INTELLIGENCE_SECTIONS as readonly string[]).includes(requested))
    return { tab: "intelligence", intelligence: requested as IntelligenceSection }
  return { tab: requested }
}

export const DialogSettings: Component<{
  sessionID?: string
  defaultValue?: string
}> = (props) => {
  const language = useLanguage()
  const narrow = createMediaQuery("(max-width: 639px)")
  const platform = usePlatform()
  const dialog = useDialog()
  const layout = useLayout()
  const tabs = useTabs()
  const serverSync = useServerSync()
  const target = settingsTarget(props.defaultValue)
  const initialTab = target.tab
  const [tab, setTab] = createSignal(initialTab)
  const [search, setSearch] = createSignal("")
  const [sections, setSections] = createStore({
    general: target.general ?? "general",
    computerUse: target.computerUse ?? ("desktop" as ComputerUseSection),
    server: target.server ?? ("servers" as ServerSection),
    connections: target.connections ?? ("connectors" as ConnectionsSection),
    intelligence: target.intelligence ?? ("memory" as IntelligenceSection),
  })

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

  const hasEntry = (entry: SettingsSearchEntry) =>
    entry.tab !== "computer-use" || entry.section !== "remote" || !!(platform.pairing || platform.setKeepScreenActive)

  const openSearchResult = (entry: SettingsSearchEntry) => {
    setSearch("")
    if (entry.tab === "general") setSections("general", entry.section ?? "general")
    if (entry.tab === "computer-use")
      setSections(
        "computerUse",
        LEGACY_COMPUTER_USE_SECTIONS[entry.section ?? ""] ?? (entry.section as ComputerUseSection | undefined) ?? "desktop",
      )
    if (entry.tab === "server") setSections("server", (entry.section as ServerSection | undefined) ?? "servers")
    if (entry.tab === "connections")
      setSections("connections", (entry.section as ConnectionsSection | undefined) ?? "connectors")
    if (entry.tab === "intelligence")
      setSections("intelligence", (entry.section as IntelligenceSection | undefined) ?? "memory")
    markVisited(entry.tab)
    if (entry.target) revealSettingsRow(entry.target)
  }

  // Links inside a page ("Configurar en Conexiones") move the dialog without reopening it.
  const onGoto = (event: Event) => {
    const next = settingsTarget(event instanceof CustomEvent ? event.detail : undefined)
    if (next.computerUse) setSections("computerUse", next.computerUse)
    if (next.server) setSections("server", next.server)
    if (next.connections) setSections("connections", next.connections)
    if (next.intelligence) setSections("intelligence", next.intelligence)
    if (next.general) setSections("general", next.general)
    markVisited(next.tab)
  }
  window.addEventListener("tiancode:settings-goto", onGoto)
  onCleanup(() => window.removeEventListener("tiancode:settings-goto", onGoto))

  const showProviders = () => {
    void dialog.show(() => <DialogSettings sessionID={props.sessionID} defaultValue="providers" />)
  }

  return (
    <Dialog size="x-large" variant="settings" class="settings-v2-dialog">
      <TabsV2
        orientation={narrow() ? "horizontal" : "vertical"}
        variant="settings"
        value={tab()}
        onChange={(value) => markVisited(value)}
        class="settings-v2"
      >
        <TabsV2.List>
          <div class="settings-v2-nav flex flex-col justify-between h-full w-full">
            <div class="settings-v2-nav-main flex flex-col gap-3 w-full">
              <SettingsSearchV2 query={search()} onQuery={setSearch} onSelect={openSearchResult} hasEntry={hasEntry} />
              <div class="settings-v2-nav-groups flex flex-col gap-3" classList={{ hidden: !!search().trim() }}>
                {/* Desktop Section */}
                <div class="flex flex-col gap-1.5">
                  <TabsV2.SectionTitle>{language.t("settings.section.desktop")}</TabsV2.SectionTitle>
                  <div class="flex flex-col gap-1 w-full">
                    <TabsV2.Trigger value="general">
                      <Icon name="sliders" />
                      {language.t("settings.tab.general")}
                    </TabsV2.Trigger>
                    <TabsV2.Trigger value="notifications">
                      <IconBell />
                      {language.t("settings.tab.notifications")}
                    </TabsV2.Trigger>
                    <TabsV2.Trigger value="intelligence">
                      <Icon name="brain" />
                      {language.t("settings.tab.intelligence") || "Intelligence"}
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
                    <TabsV2.Trigger value="server">
                      <Icon name="server" />
                      {language.t("settings.tab.server")}
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
                    <TabsV2.Trigger value="connections">
                      <IconConnections />
                      {language.t("settings.tab.connections") || "Conexiones"}
                    </TabsV2.Trigger>
                    <TabsV2.Trigger value="pets">
                      <IconPets />
                      {language.t("settings.tab.pets")}
                    </TabsV2.Trigger>
                  </div>
                </div>
              </div>
            </div>
            <div class="flex flex-col gap-1 w-full pt-3" classList={{ hidden: !!search().trim() }}>
              <TabsV2.Trigger value="about">
                <IconAbout />
                {language.t("settings.tab.about")}
              </TabsV2.Trigger>
            </div>
          </div>
        </TabsV2.List>

        {/* Tab Panels with Fluid Cached Switching */}
        <TabsV2.Content forceMount value="general" class="settings-v2-panel" classList={{ "!hidden": tab() !== "general" }}>
          <Show when={visited().has("general")}>
            <SettingsGeneralV2
              sessionID={props.sessionID}
              section={sections.general}
              onSectionChange={(section) => setSections("general", section)}
            />
          </Show>
        </TabsV2.Content>

        <TabsV2.Content forceMount value="notifications" class="settings-v2-panel" classList={{ "!hidden": tab() !== "notifications" }}>
          <Show when={visited().has("notifications")}>
            <SettingsNotificationsV2 active={tab() === "notifications"} />
          </Show>
        </TabsV2.Content>

        <TabsV2.Content forceMount value="intelligence" class="settings-v2-panel" classList={{ "!hidden": tab() !== "intelligence" }}>
          <Show when={visited().has("intelligence")}>
            <SettingsIntelligenceV2
              directory={directory()}
              section={sections.intelligence}
              onSectionChange={(section) => setSections("intelligence", section)}
            />
          </Show>
        </TabsV2.Content>

        <TabsV2.Content forceMount value="computer-use" class="settings-v2-panel" classList={{ "!hidden": tab() !== "computer-use" }}>
          <Show when={visited().has("computer-use")}>
            <SettingsComputerUseV2
              directory={directory()}
              active={tab() === "computer-use"}
              section={sections.computerUse}
              onSectionChange={(section) => setSections("computerUse", section)}
            />
          </Show>
        </TabsV2.Content>

        <TabsV2.Content forceMount value="shortcuts" class="settings-v2-panel" classList={{ "!hidden": tab() !== "shortcuts" }}>
          <Show when={visited().has("shortcuts")}>
            <SettingsKeybinds v2 />
          </Show>
        </TabsV2.Content>

        <TabsV2.Content forceMount value="server" class="settings-v2-panel" classList={{ "!hidden": tab() !== "server" }}>
          <Show when={visited().has("server")}>
            <SettingsServerHubV2
              active={tab() === "server"}
              section={sections.server}
              onSectionChange={(section) => setSections("server", section)}
            />
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

        <TabsV2.Content forceMount value="connections" class="settings-v2-panel" classList={{ "!hidden": tab() !== "connections" }}>
          <Show when={visited().has("connections")}>
            <SettingsConnectionsHubV2
              directory={directory()}
              active={tab() === "connections"}
              section={sections.connections}
              onSectionChange={(section) => setSections("connections", section)}
            />
          </Show>
        </TabsV2.Content>

        <TabsV2.Content forceMount value="pets" class="settings-v2-panel" classList={{ "!hidden": tab() !== "pets" }}>
          <Show when={visited().has("pets")}>
            <SettingsPetsV2 active={tab() === "pets"} />
          </Show>
        </TabsV2.Content>

        <TabsV2.Content forceMount value="about" class="settings-v2-panel" classList={{ "!hidden": tab() !== "about" }}>
          <Show when={visited().has("about")}>
            <SettingsAboutV2 active={tab() === "about"} />
          </Show>
        </TabsV2.Content>
      </TabsV2>
    </Dialog>
  )
}
