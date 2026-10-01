import { ButtonV2 } from "@tiancode-ai/ui/v2/button-v2"
import { SegmentedControlItemV2, SegmentedControlV2 } from "@tiancode-ai/ui/v2/segmented-control-v2"
import { Switch } from "@tiancode-ai/ui/v2/switch-v2"
import { TextInputV2 } from "@tiancode-ai/ui/v2/text-input-v2"
import { Icon as IconV2 } from "@tiancode-ai/ui/v2/icon"
import { IconButtonV2 } from "@tiancode-ai/ui/v2/icon-button-v2"
import { Icon } from "@tiancode-ai/ui/icon"
import type { Config, McpLocalConfig, McpRemoteConfig, McpStatus } from "@tiancode-ai/sdk/v2/client"
import {
  type Component,
  createEffect,
  createResource,
  For,
  Show,
  createSignal,
  createMemo,
  onMount,
  onCleanup,
} from "solid-js"
import { createStore } from "solid-js/store"
import { usePlatform } from "@/context/platform"
import { fetchMarketplace, MARKETPLACE_SNAPSHOT, CURATED_SKILLS, type MarketplaceItem } from "./marketplace"

// Curated entries are described in the user's language rather than the catalog's English.
const curatedDescriptions: Record<string, "settings.marketplace.diagramDescription" | "settings.marketplace.securityDescription" | "settings.marketplace.focusDescription" | "settings.marketplace.composioDescription"> = {
  "diagram-design": "settings.marketplace.diagramDescription",
  "security-audit": "settings.marketplace.securityDescription",
  "i-have-adhd": "settings.marketplace.focusDescription",
  composio: "settings.marketplace.composioDescription",
}
import { decodeGitHubUrl, fetchGitHubSkills } from "./skills-github"
import { parseMcpConfig, parseCommand } from "./mcp-config"
import { useLanguage } from "@/context/language"
import { useServerSDK } from "@/context/server-sdk"
import { showToast } from "@/utils/toast"
import {
  displayName,
  pluginEnabled,
  pluginName,
  pluginOrigin,
  type PluginEntry,
} from "./plugins-origin"
import { SettingsPagerV2 } from "./parts/pager"
import { BrandOrFallback } from "./parts/brand-icon"
import "./mcp-plugins.css"

type McpConfigValue = McpLocalConfig | McpRemoteConfig | { enabled: boolean }
type TabMode = "mcp" | "plugins" | "discover"

const formatCategory = (cat?: string) => {
  if (!cat) return "General"
  const map: Record<string, string> = {
    diseno: "Diseño",
    web: "Web",
    backend: "Backend",
    seguridad: "Seguridad",
    finanzas: "Finanzas",
    ia: "IA & ML",
    desarrollo: "Desarrollo",
    herramientas: "Herramientas",
    sistema: "Sistema",
    documentacion: "Documentación",
    database: "Base de Datos",
    cloud: "Cloud & DevOps",
    ventas: "Ventas & CRM",
    datos: "Ciencia Datos",
  }
  return map[cat.toLowerCase()] || cat.charAt(0).toUpperCase() + cat.slice(1)
}

export const SettingsMcpPluginsV2: Component<{
  directory?: string
  active?: boolean
}> = (props) => {
  const language = useLanguage()
  const platform = usePlatform()
  const [market, setMarket] = createStore({ type: "all", pending: "", advanced: "", editing: false, saving: "" })
  const serverSdk = useServerSDK()
  const [activeTab, setActiveTab] = createSignal<TabMode>("plugins")
  const [searchQuery, setSearchQuery] = createSignal("")
  const [showAddModal, setShowAddModal] = createSignal(false)
  const [addMode, setAddMode] = createSignal<"mcp" | "plugin">("plugin")
  const [discoverCategory, setDiscoverCategory] = createSignal("all")

  // Form states
  const [formName, setFormName] = createSignal("")
  const [formCommand, setFormCommand] = createSignal("")
  /** Sólo aplica a servidores remotos: un servidor local no tiene flujo OAuth. */
  const [formOAuth, setFormOAuth] = createSignal(false)
  const [submitting, setSubmitting] = createSignal(false)

  const params = () => (props.directory ? { directory: props.directory } : undefined)
  const saveConfig = (config: Config) => props.directory
    ? serverSdk().client.config.update({ ...params(), config }, { throwOnError: true })
    : serverSdk().client.global.config.update({ config }, { throwOnError: true })

  // Discovery never changes installed state. Keep a versioned offline snapshot.
  const [clineCatalog] = createResource(
    () => activeTab() === "discover",
    () => fetchMarketplace().catch(() => MARKETPLACE_SNAPSHOT),
    { initialValue: MARKETPLACE_SNAPSHOT },
  )
  const marketplace = createMemo(() => [...CURATED_SKILLS.map((entry) => ({
    ...entry,
    desc: language.t(curatedDescriptions[entry.id] ?? "settings.marketplace.focusDescription"),
  })), ...clineCatalog().filter((entry) => !CURATED_SKILLS.some((curated) => curated.type === entry.type && curated.id === entry.id))])
  const [installedSkills, { refetch: refetchSkills }] = createResource(async () => {
    const result = await serverSdk().client.app.skills(params()).catch(() => ({ data: [] }))
    return result.data ?? []
  }, { initialValue: [] })

  // Fetch Config
  const [configData, { refetch: refetchConfig }] = createResource(
    async () => {
      try {
        const result = await serverSdk().client.config.get(params()).catch(() => ({ data: {} }))
        return (result.data ?? {}) as Config
      } catch {
        return {} as Config
      }
    },
    { initialValue: {} as Config },
  )

  // Fetch MCP Status
  const [mcpStatusData, { refetch: refetchStatus }] = createResource(
    async () => {
      try {
        const result = await serverSdk().client.mcp.status(params()).catch(() => ({ data: {} }))
        return (result.data ?? {}) as Record<string, McpStatus>
      } catch {
        return {} as Record<string, McpStatus>
      }
    },
    { initialValue: {} as Record<string, McpStatus> },
  )

  createEffect(() => {
    const isActive = props.active ?? true
    if (!isActive) return
    const timer = setInterval(() => void refetchStatus(), 10000)
    onCleanup(() => clearInterval(timer))
  })

  // Detail view: transport, endpoint, tool names (MCP) and origin/spec/path (plugins) for every
  // row at once, without opening anything.
  const [detailed, setDetailed] = createSignal(false)
  const detailToggle = () => (
    <button
      type="button"
      class="settings-v2-subagents-detail mcp-plugins-detail"
      aria-pressed={detailed()}
      title={language.t(detailed() ? "settings.mcpPlugins.detail.compact" : "settings.mcpPlugins.detail.full")}
      onClick={() => setDetailed((value) => !value)}
    >
      {language.t(detailed() ? "settings.mcpPlugins.detail.compactShort" : "settings.mcpPlugins.detail.fullShort")}
    </button>
  )


  // Connected MCP servers list
  const mcpServers = createMemo(() => {
    const configMcp = (configData().mcp ?? {}) as Record<string, McpConfigValue>
    const statusMap = mcpStatusData()
    const query = searchQuery().toLowerCase().trim()

    return Object.entries(configMcp)
      .map(([name, conf]) => {
        const isObject = typeof conf === "object" && conf !== null
        const isLocal = isObject && "type" in conf && conf.type === "local"
        const isRemote = isObject && "type" in conf && conf.type === "remote"
        const configEnabled = isObject && "enabled" in conf ? conf.enabled !== false : true
        const enabled = configEnabled
        const statusObj = statusMap[name]
        const status = statusObj?.status ?? (enabled ? "unknown" : "disabled")
        const command = isLocal ? (conf as McpLocalConfig).command.join(" ") : isRemote ? (conf as McpRemoteConfig).url : "Builtin MCP"
        const toolsCount = statusObj?.status === "connected" && typeof statusObj.tools === "number" ? statusObj.tools : 0
        const statusError = statusObj && "error" in statusObj ? statusObj.error : undefined
        const environment = isLocal && (conf as McpLocalConfig).environment ? Object.keys((conf as McpLocalConfig).environment ?? {}) : []

        return {
          name,
          enabled,
          status,
          command,
          toolsCount,
          statusError,
          environment,
          isLocal,
          isRemote,
          config: conf,
        }
      })
      .filter((server) => !query || server.name.toLowerCase().includes(query) || server.command.toLowerCase().includes(query))
  })

  // Installed Plugins list (including configured catalog plugins)
  const pluginsList = createMemo(() => {
    const rawList = (configData().plugin ?? []) as PluginEntry[]
    const query = searchQuery().toLowerCase().trim()

    // Older builds exposed these UI-only entries; they are not executable plugins.
    const configured = rawList
      .filter((entry) => !pluginName(entry).startsWith("builtin-"))
      .map((entry) => {
        const name = pluginName(entry)
        const display = displayName(entry)
        const configEnabled = pluginEnabled(entry)
        const enabled = configEnabled
        const origin = pluginOrigin(entry)
        const catalogItem = marketplace().find((item) => item.type === "plugin" && item.spec === name)

        return {
          entry,
          name,
          display: catalogItem?.name ?? display,
          desc: catalogItem?.desc,
          icon: catalogItem?.icon ?? "🧩",
          category: catalogItem?.category ?? "extension",
          enabled,
          origin,
          isLocal: origin === "local",
        }
      })

    // An empty config means no marketplace plugins are installed. Catalog
    // entries are discoverable in the Discover tab and become installed only
    // after the user explicitly chooses Install.
    return configured.filter((plugin) => !query || plugin.name.toLowerCase().includes(query) || plugin.display.toLowerCase().includes(query))
  })

  // A local plugin's name is its file:// URL; show the part under .tiancode/ instead of the
  // whole absolute path, and never repeat the path as its description.
  const shortPluginRef = (name: string) => {
    const looksLikePath = /^file:/i.test(name) || /^[a-zA-Z]:[\\/]/.test(name) || name.startsWith("/")
    if (!looksLikePath) return name
    const normalized = name.replace(/\\/g, "/")
    const idx = normalized.indexOf("/.tiancode/")
    if (idx >= 0) return normalized.slice(idx + 1)
    return normalized.split("/").filter(Boolean).slice(-2).join("/")
  }
  const pluginDescription = (plugin: { desc?: string; name: string; isLocal: boolean }) =>
    plugin.desc ?? (plugin.isLocal ? language.t("settings.mcpPlugins.plugin.localDescription") : plugin.name)

  // Catalog filtered list
  const catalogList = createMemo(() => {
    const cat = discoverCategory()
    const query = searchQuery().toLowerCase().trim()
    return marketplace().filter((item) => {
      const matchCat = cat === "all" || item.category === cat
      const matchQuery = !query || item.name.toLowerCase().includes(query) || item.desc.toLowerCase().includes(query)
      return matchCat && matchQuery && (market.type === "all" || item.type === market.type)
    })
  })

  // Pagination 10x10 for Discover Catalog
  const DISCOVER_PAGE_SIZE = 6
  const [discoverPage, setDiscoverPage] = createSignal(1)
  const discoverTotal = () => Math.max(1, Math.ceil(catalogList().length / DISCOVER_PAGE_SIZE))
  const pageDiscoverItems = createMemo(() => {
    const page = Math.min(discoverPage(), discoverTotal())
    const start = (page - 1) * DISCOVER_PAGE_SIZE
    return catalogList().slice(start, start + DISCOVER_PAGE_SIZE)
  })

  // Pagination 10x10 for MCP Servers
  const MCP_PAGE_SIZE = 6
  const [mcpPage, setMcpPage] = createSignal(1)
  const mcpTotal = () => Math.max(1, Math.ceil(mcpServers().length / MCP_PAGE_SIZE))
  const pageMcpServers = createMemo(() => {
    const page = Math.min(mcpPage(), mcpTotal())
    const start = (page - 1) * MCP_PAGE_SIZE
    return mcpServers().slice(start, start + MCP_PAGE_SIZE)
  })

  // Pagination 10x10 for Installed Plugins
  const PLUGINS_PAGE_SIZE = 6
  const [pluginsPage, setPluginsPage] = createSignal(1)
  const pluginsTotal = () => Math.max(1, Math.ceil(pluginsList().length / PLUGINS_PAGE_SIZE))
  const pagePluginsList = createMemo(() => {
    const page = Math.min(pluginsPage(), pluginsTotal())
    const start = (page - 1) * PLUGINS_PAGE_SIZE
    return pluginsList().slice(start, start + PLUGINS_PAGE_SIZE)
  })

  createEffect(() => {
    discoverCategory()
    market.type
    searchQuery()
    setDiscoverPage(1)
    setMcpPage(1)
    setPluginsPage(1)
  })

  createEffect(() => {
    if (discoverPage() > discoverTotal()) setDiscoverPage(discoverTotal())
    if (mcpPage() > mcpTotal()) setMcpPage(mcpTotal())
    if (pluginsPage() > pluginsTotal()) setPluginsPage(pluginsTotal())
  })

  const toggleMcpServer = async (name: string, currentEnabled: boolean) => {
    if (market.saving) return
    setMarket("saving", name)
    try {
      const entry = configData().mcp?.[name]
      if (!entry || !("type" in entry)) throw new Error("Missing MCP definition")
      // Explicit activation approves a project-defined server in the global
      // config; repository config alone is deliberately never executable.
      await serverSdk().client.mcp.add({ ...params(), name, config: { ...entry, enabled: !currentEnabled } }, { throwOnError: true })
      await refetchConfig()
      await refetchStatus()
      showToast({
        variant: "success",
        title: language.t(currentEnabled ? "settings.mcpPlugins.toast.serverDisabled" : "settings.mcpPlugins.toast.serverEnabled", { name }),
      })
    } catch {
      showToast({ variant: "error", title: language.t("settings.mcpPlugins.toast.serverUpdateFailed") })
    } finally {
      setMarket("saving", "")
    }
  }

  const removeMcpServer = async (name: string) => {
    if (market.saving || !window.confirm(language.t("settings.marketplace.removeConfirm", { name }))) return
    setMarket("saving", name)
    try {
      await serverSdk().client.mcp.remove({ ...params(), name }, { throwOnError: true })
      await refetchConfig()
      await refetchStatus()
      showToast({ variant: "success", title: language.t("settings.mcpPlugins.toast.serverRemoved", { name }) })
    } catch {
      showToast({ variant: "error", title: language.t("settings.mcpPlugins.toast.serverRemoveFailed") })
    } finally {
      setMarket("saving", "")
    }
  }

  const ownPlugins = () => {
    const origins = (configData() as Config & { plugin_origins?: { spec: PluginEntry; scope: string }[] }).plugin_origins
    return origins?.length
      ? origins.filter((origin) => origin.scope === (props.directory ? "local" : "global")).map((origin) => origin.spec)
      : [...(configData().plugin ?? [])]
  }

  const togglePlugin = async (spec: PluginEntry, currentEnabled: boolean) => {
    if (market.saving) return
    const targetName = pluginName(spec)
    const current = ownPlugins()
    const entries = current.some((entry) => pluginName(entry) === targetName) ? current : [...current, spec]
    const updated = entries.map((entry): PluginEntry => {
      if (pluginName(entry) !== targetName) return entry
      const options = { ...(Array.isArray(entry) ? entry[1] : {}), enabled: !currentEnabled }
      return [targetName, options]
    })
    setMarket("saving", targetName)
    try {
      await saveConfig({ plugin: updated })
      await refetchConfig()
      showToast({
        variant: "success",
        title: language.t(currentEnabled ? "settings.mcpPlugins.toast.pluginDisabled" : "settings.mcpPlugins.toast.pluginEnabled"),
      })
    } catch {
      showToast({ variant: "error", title: language.t("settings.mcpPlugins.toast.pluginUpdateFailed") })
    } finally {
      setMarket("saving", "")
    }
  }

  const editMcp = (name: string, config: McpLocalConfig | McpRemoteConfig, editing = true) => {
    setAddMode("mcp")
    setFormName(name)
    setFormCommand(config.type === "local" ? JSON.stringify(config.command) : config.url)
    setFormOAuth(config.type === "remote" && config.oauth !== false)
    setMarket({ advanced: JSON.stringify(config, null, 2), editing })
    setShowAddModal(true)
  }

  const installCatalogItem = async (item: MarketplaceItem) => {
    if (item.config) {
      editMcp(item.id, item.config, false)
      return
    }
    if (!item.skillURL) {
      if (item.source) platform.openExternal(item.source)
      return
    }
    const source = decodeGitHubUrl(item.skillURL)
    if (!source) return
    setMarket("pending", item.id)
    try {
      const skills = await fetchGitHubSkills(source)
      if (skills.length === 0) throw new Error("No SKILL.md found")
      for (const skill of skills) {
        await serverSdk().client.app.skills2.import({ ...params(), ...skill }, { throwOnError: true })
      }
      await refetchSkills()
      showToast({ variant: "success", title: language.t("settings.skills.import.success") })
    } catch {
      showToast({ variant: "error", title: language.t("settings.mcpPlugins.toast.installFailed", { name: item.name }) })
    } finally {
      setMarket("pending", "")
    }
  }

  /** Arranca el flujo OAuth: el backend abre el navegador y espera la vuelta del callback. */
  const authenticate = async (serverName: string) => {
    if (market.saving) return
    setMarket("saving", serverName)
    try {
      await serverSdk().client.mcp.auth.authenticate({ ...params(), name: serverName }, { throwOnError: true })
      showToast({ variant: "success", title: language.t("settings.mcpPlugins.toast.authStarted", { name: serverName }) })
    } catch {
      showToast({ variant: "error", title: language.t("settings.mcpPlugins.toast.authFailed", { name: serverName }) })
    } finally {
      setMarket("saving", "")
    }
    void refetchStatus()
  }

  // Save Custom Add Modal
  const handleSaveModal = async () => {
    const name = formName().trim()
    const cmd = formCommand().trim()
    if (!name || (!cmd && !(addMode() === "mcp" && market.advanced.trim()))) {
      showToast({ variant: "error", title: language.t("settings.mcpPlugins.toast.formIncomplete") })
      return
    }

    setSubmitting(true)
    try {
      if (addMode() === "mcp") {
        const config = market.advanced.trim()
          ? parseMcpConfig(JSON.parse(market.advanced))
          : parseMcpConfig(/^https?:\/\//.test(cmd)
            ? { type: "remote", url: cmd, enabled: false, oauth: formOAuth() ? {} : false }
            : { type: "local", command: parseCommand(cmd), enabled: false })
        // Persist only this server so an edit cannot overwrite another scope's entries.
        await saveConfig({ mcp: { [name]: config } })
      } else {
        const currentPlugins = ownPlugins()
        if (!currentPlugins.some((p) => pluginName(p) === cmd)) {
          currentPlugins.push(cmd)
        }
        await saveConfig({ plugin: currentPlugins })
      }

      void refetchConfig()
      void refetchStatus()
      setShowAddModal(false)
      setFormName("")
      setFormCommand("")
      setFormOAuth(false)
      setMarket({ advanced: "", editing: false })
      showToast({ variant: "success", title: language.t("settings.mcpPlugins.toast.added") })
    } catch {
      showToast({ variant: "error", title: language.t("settings.mcpPlugins.toast.saveFailed") })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      {/* Header */}
      <div class="settings-v2-tab-header settings-v2-tab-header--stacked">
        <div class="settings-v2-tab-header-row">
          <div>
            <h2 class="settings-v2-tab-title">{language.t("settings.mcpPlugins.title")}</h2>
            <p class="settings-v2-tab-description">{language.t("settings.mcpPlugins.description")}</p>
          </div>
          <div class="flex items-center gap-2">
            <ButtonV2
              variant="contrast"
              size="small"
              icon="plus"
              class="rounded-lg px-3 h-8 shadow-sm font-medium"
              onClick={() => {
                setMarket({ advanced: "", editing: false })
                setFormName("")
                setFormCommand("")
                setFormOAuth(false)
                setAddMode(activeTab() === "plugins" ? "plugin" : "mcp")
                setShowAddModal(true)
              }}
            >
              {language.t(activeTab() === "plugins" ? "settings.mcpPlugins.add.plugin" : "settings.mcpPlugins.add.server")}
            </ButtonV2>
          </div>
        </div>
        {/* Navigation & Controls */}
        <div class="mcp-plugins-segmented-wrapper">
          <SegmentedControlV2 value={activeTab()} onChange={(v) => setActiveTab(v as TabMode)}>
            <SegmentedControlItemV2 value="plugins">
              <span class="flex items-center gap-1.5 whitespace-nowrap">
                <span>{language.t("settings.mcpPlugins.tab.plugins")}</span>
                <span class="mcp-plugins-tab-count">{pluginsList().length}</span>
              </span>
            </SegmentedControlItemV2>
            <SegmentedControlItemV2 value="mcp">
              <span class="flex items-center gap-1.5 whitespace-nowrap">
                <span>{language.t("settings.mcpPlugins.tab.servers")}</span>
                <span class="mcp-plugins-tab-count">{mcpServers().length}</span>
              </span>
            </SegmentedControlItemV2>
            <SegmentedControlItemV2 value="discover">
              <span class="flex items-center gap-1.5 whitespace-nowrap">
                <span>{language.t("settings.mcpPlugins.tab.discover")}</span>
                <span class="mcp-plugins-tab-count">{catalogList().length}</span>
              </span>
            </SegmentedControlItemV2>
          </SegmentedControlV2>

          {detailToggle()}
          <div class="mcp-plugins-search-box">
            <TextInputV2
              type="search"
              appearance="base"
              value={searchQuery()}
              onInput={(e) => setSearchQuery(e.currentTarget.value)}
              placeholder={language.t("settings.mcpPlugins.search.placeholder")}
              aria-label={language.t("settings.mcpPlugins.search.placeholder")}
            />
          </div>
        </div>
      </div>

      <div class="settings-v2-tab-body">
        {/* TAB 1: MCP SERVERS */}
        <Show when={activeTab() === "mcp"}>
          <div class="flex flex-col gap-4">
            <div class="mcp-plugins-intro">
              <div class="mcp-plugins-intro-icon">
                <Icon name="mcp" size="small" />
              </div>
              <div class="mcp-plugins-intro-copy">
                <h4 class="mcp-plugins-intro-title">{language.t("settings.mcpPlugins.intro.title")}</h4>
                <p class="mcp-plugins-intro-body">{language.t("settings.mcpPlugins.intro.body")}</p>
                <div class="mcp-plugins-intro-kinds">
                  <span>
                    <strong>{language.t("settings.mcpServers.type.local")}</strong> · {language.t("settings.mcpPlugins.intro.local")}
                  </span>
                  <span>
                    <strong>{language.t("settings.mcpServers.type.remote")}</strong> · {language.t("settings.mcpPlugins.intro.remote")}
                  </span>
                </div>
              </div>
            </div>

            <Show
              when={mcpServers().length > 0}
              fallback={
                <div class="flex flex-col items-center justify-center p-12 text-center rounded-xl border border-dashed border-v2-border-border-muted bg-v2-background-bg-layer-01/40">
                  <div class="size-12 rounded-2xl bg-cyan-400/10 text-cyan-400 flex items-center justify-center mb-3">
                    <Icon name="mcp" size="large" />
                  </div>
                  <h3 class="text-[14px] font-medium text-v2-text-text-base">{language.t("settings.mcpServers.empty")}</h3>
                  <p class="text-[12px] text-v2-text-text-muted max-w-sm mt-1 mb-4">
                    {language.t("settings.mcpPlugins.empty.description")}
                  </p>
                  <div class="flex items-center gap-2">
                    <ButtonV2
                      variant="neutral"
                      size="small"
                      onClick={() => setActiveTab("discover")}
                    >
                      {language.t("settings.mcpPlugins.empty.explore")}
                    </ButtonV2>
                    <ButtonV2
                      variant="contrast"
                      size="small"
                      icon="plus"
                      onClick={() => {
                        setMarket({ advanced: "", editing: false })
                        setFormName("")
                        setFormCommand("")
                        setFormOAuth(false)
                        setAddMode("mcp")
                        setShowAddModal(true)
                      }}
                    >
                      {language.t("settings.mcpPlugins.empty.add")}
                    </ButtonV2>
                  </div>
                </div>
              }
            >
              <div class="mcp-plugins-table mcp-plugins-table--mcp">
                <div class="mcp-plugins-thead">
                  <div>{language.t("settings.mcpPlugins.column.server")}</div>
                  <div>{language.t("settings.mcpPlugins.column.type")}</div>
                  <div>{language.t("settings.mcpPlugins.column.command")}</div>
                  <div>{language.t("settings.mcpPlugins.column.status")}</div>
                  <div class="text-right">{language.t("settings.mcpPlugins.column.action")}</div>
                </div>

                <div class="divide-y divide-white/[0.04]">
                  <For each={pageMcpServers()}>
                    {(server) => (
                      <div class="mcp-plugins-row">
                        {/* 1. Servidor MCP */}
                        <div class="mcp-plugins-cell gap-3 pr-2">
                          <div class="size-9 rounded-xl bg-white/[0.06] border border-white/10 flex items-center justify-center shrink-0 text-lg shadow-sm">
                            <BrandOrFallback names={[server.name, server.command]} size={20} fallback={<Icon name="mcp" size="small" />} />
                          </div>
                          <div class="flex flex-col min-w-0">
                            <div class="flex items-center gap-1.5">
                              <span class="text-xs font-semibold text-v2-text-text-base truncate" title={server.name}>
                                {server.name}
                              </span>
                              <span
                                class="mcp-plugins-status-dot"
                                classList={{
                                  connected: server.status === "connected" && server.enabled,
                                  error: server.status === "failed",
                                  disconnected: !server.enabled || server.status === "disabled" || server.status === "needs_auth",
                                }}
                                title={language.t(`settings.mcpServers.status.${server.enabled ? server.status : "disabled"}`)}
                              />
                            </div>
                            <span class="text-[10px] text-v2-text-text-muted truncate">
                              {server.enabled && server.status === "connected"
                                ? language.t("settings.mcpServers.status.connected")
                                : !server.enabled
                                  ? language.t("settings.mcpServers.status.disabled")
                                  : language.t(`settings.mcpServers.status.${server.status}`)}
                            </span>
                          </div>
                        </div>

                        {/* 2. Tipo & Alcance */}
                        <div class="mcp-plugins-cell gap-2 pr-2">
                          <span class="mcp-plugins-chip mcp-plugins-chip--category accent text-[10px]">
                            {language.t(server.isLocal ? "settings.mcpServers.type.local" : "settings.mcpServers.type.remote")}
                          </span>
                          <Show when={server.toolsCount > 0}>
                            <span class="mcp-plugins-chip mcp-plugins-chip--type text-[10px]">
                              {language.t("settings.mcpServers.tools.count", { count: server.toolsCount })}
                            </span>
                          </Show>
                        </div>

                        {/* 3. Comando / Endpoint SSE */}
                        <div class="mcp-plugins-cell pr-3 flex-col items-start gap-1.5">
                          <div class="win11-spec-badge max-w-full text-[10.5px] py-0.5 px-2" title={server.command}>
                            <span class="font-mono" classList={{ truncate: !detailed() }}>{server.command}</span>
                          </div>
                          <Show when={detailed()}>
                            <div class="mcp-plugins-detail-block">
                              <span>
                                <b>{language.t("settings.mcpPlugins.detail.transport")}:</b>{" "}
                                {server.isLocal ? "stdio (proceso local)" : server.isRemote ? "HTTP / SSE" : "integrado"}
                              </span>
                              <Show when={server.environment.length > 0}>
                                <span>
                                  <b>{language.t("settings.mcpPlugins.detail.env")}:</b> {server.environment.join(", ")}
                                </span>
                              </Show>
                              <span>
                                <b>{language.t("settings.mcpPlugins.detail.tools")}:</b>{" "}
                                {server.toolsCount > 0
                                  ? language.t("settings.mcpServers.tools.count", { count: server.toolsCount })
                                  : language.t(server.enabled ? "settings.mcpPlugins.detail.noTools" : "settings.mcpPlugins.detail.disabledTools")}
                              </span>
                              <Show when={server.statusError}>
                                <span class="mcp-plugins-detail-error">{server.statusError}</span>
                              </Show>
                            </div>
                          </Show>
                        </div>

                        {/* 4. Estado */}
                        <div class="mcp-plugins-cell mcp-plugins-cell--status">
                          <Switch
                            disabled={Boolean(market.saving)}
                            checked={server.enabled}
                            onChange={() => void toggleMcpServer(server.name, server.enabled)}
                          />
                          <span
                            class="settings-v2-chip text-[10px]"
                            data-tone={server.enabled ? "accent" : "muted"}
                          >
                            {language.t(server.enabled ? "settings.mcpPlugins.status.active" : "settings.mcpPlugins.status.inactive")}
                          </span>
                        </div>

                        {/* 5. Acción */}
                        <div class="mcp-plugins-cell justify-end">
                          <Show when={server.isRemote && server.status === "needs_auth"}>
                            <ButtonV2 size="small" variant="contrast" disabled={Boolean(market.saving)} onClick={() => void authenticate(server.name)}>
                              {language.t("settings.mcpServers.action.authenticate")}
                            </ButtonV2>
                          </Show>
                          <ButtonV2 size="small" variant="neutral" onClick={() => {
                            if ("type" in server.config) editMcp(server.name, server.config)
                          }}>{language.t("common.edit")}</ButtonV2>
                          <IconButtonV2
                            type="button"
                            variant="ghost-muted"
                            size="small"
                            icon={<IconV2 name="trash" class="text-v2-icon-icon-muted hover:text-v2-state-fg-danger" />}
                            aria-label={language.t("settings.mcpPlugins.remove.server")}
                            onClick={() => void removeMcpServer(server.name)}
                          />
                        </div>
                      </div>
                    )}
                  </For>
                </div>
              </div>

              <Show when={mcpTotal() > 1}>
                <SettingsPagerV2
                  page={mcpPage()}
                  totalPages={mcpTotal()}
                  onPage={setMcpPage}
                />
              </Show>
            </Show>
          </div>
        </Show>

        {/* TAB 2: PLUGINS */}
        <Show when={activeTab() === "plugins"}>
          <div class="flex flex-col gap-6">
            <Show when={activeTab() === "plugins"}>
            {/* Installed & Extension Plugins */}
            <div class="flex flex-col gap-3">
              <div class="flex items-center justify-between">
                <h3 class="text-[13px] font-semibold text-v2-text-text-base flex items-center gap-2">
                  <span>{language.t("settings.mcpPlugins.section.installed")}</span>
                  <span class="mcp-plugins-chip">{pluginsList().length}</span>
                </h3>
              </div>

              <div class="mcp-plugins-table mcp-plugins-table--plugins">
                <div class="mcp-plugins-thead">
                  <div>{language.t("settings.mcpPlugins.column.plugin")}</div>
                  <div>{language.t("settings.mcpPlugins.column.category")}</div>
                  <div>{language.t("settings.mcpPlugins.column.description")}</div>
                  <div>{language.t("settings.mcpPlugins.column.status")}</div>
                </div>

                <div class="divide-y divide-white/[0.04]">
                  <For each={pagePluginsList()}>
                    {(plugin) => (
                      <div class="mcp-plugins-row">
                        {/* 1. Plugin */}
                        <div class="mcp-plugins-cell gap-3 pr-2">
                          <div class="size-9 rounded-xl bg-white/[0.06] border border-white/10 flex items-center justify-center shrink-0 text-lg shadow-sm">
                            <BrandOrFallback names={[plugin.display, plugin.name]} size={20} fallback={plugin.icon} />
                          </div>
                          <div class="flex flex-col min-w-0">
                            <span class="text-xs font-semibold text-v2-text-text-base truncate" title={plugin.display}>
                              {plugin.display}
                            </span>
                            <span class="text-[10px] font-mono text-v2-text-text-muted truncate" title={plugin.name}>
                              {shortPluginRef(plugin.name)}
                            </span>
                          </div>
                        </div>

                        {/* 2. Categoría & Tipo */}
                        <div class="mcp-plugins-cell gap-2 pr-2">
                          <span class="mcp-plugins-chip mcp-plugins-chip--category accent text-[10px]">
                            {formatCategory(plugin.category)}
                          </span>
                          <span class="mcp-plugins-chip mcp-plugins-chip--type text-[10px]">
                            {language.t(plugin.isLocal ? "settings.mcpPlugins.origin.local" : "settings.mcpPlugins.origin.plugin")}
                          </span>
                        </div>

                        {/* 3. Descripción */}
                        <div class="mcp-plugins-cell pr-3 flex-col items-start gap-1.5">
                          <p
                            class="text-[11.5px] text-v2-text-text-muted leading-normal m-0"
                            classList={{ "line-clamp-1": !detailed() }}
                            title={pluginDescription(plugin)}
                          >
                            {pluginDescription(plugin)}
                          </p>
                          <Show when={detailed()}>
                            <div class="mcp-plugins-detail-block">
                              <span>
                                <b>{language.t("settings.mcpPlugins.detail.spec")}:</b> <code>{plugin.name}</code>
                              </span>
                              <span>
                                <b>{language.t("settings.mcpPlugins.detail.origin")}:</b>{" "}
                                {language.t(plugin.isLocal ? "settings.mcpPlugins.origin.local" : "settings.mcpPlugins.origin.plugin")}
                              </span>
                            </div>
                          </Show>
                        </div>

                        {/* 4. Estado */}
                        <div class="mcp-plugins-cell mcp-plugins-cell--status">
                          <Switch
                            disabled={Boolean(market.saving)}
                            checked={plugin.enabled}
                            onChange={() => void togglePlugin(plugin.entry, plugin.enabled)}
                          />
                          <span
                            class="settings-v2-chip text-[10px]"
                            data-tone={plugin.enabled ? "accent" : "muted"}
                          >
                            {language.t(plugin.enabled ? "settings.mcpPlugins.status.active" : "settings.mcpPlugins.status.inactive")}
                          </span>
                        </div>
                      </div>
                    )}
                  </For>
                </div>
              </div>

              <Show when={pluginsTotal() > 1}>
                <SettingsPagerV2
                  page={pluginsPage()}
                  totalPages={pluginsTotal()}
                  onPage={setPluginsPage}
                />
              </Show>
            </div>

            </Show>

          </div>
        </Show>

        {/* TAB 3: DISCOVER CATALOG - WINDOWS 11 FLUENT STORE DESIGN */}
        <Show when={activeTab() === "discover"}>
          <div class="win11-discover-wrapper">
            <div class="mcp-plugins-discover-head">
              <div class="mcp-plugins-discover-copy">
                <h3 class="settings-v2-section-title">{language.t("settings.mcpPlugins.discover.title")}</h3>
                <p class="mcp-plugins-discover-description">{language.t("settings.marketplace.description")}</p>
              </div>
              <div class="mcp-plugins-discover-stats">
                <span class="settings-v2-chip" data-tone="muted">
                  {language.t("settings.mcpPlugins.discover.available", { count: catalogList().length })}
                </span>
                <span class="settings-v2-chip" data-tone="accent">
                  {language.t("settings.mcpPlugins.discover.installed", { count: mcpServers().length + pluginsList().length })}
                </span>
              </div>
            </div>

            <SegmentedControlV2 value={market.type} onChange={(value) => setMarket("type", value ?? "all")}>
              <For each={["all", "mcp", "skill", "plugin"] as const}>{(type) => (
                <SegmentedControlItemV2 value={type}>
                  {type === "all" ? language.t("settings.mcpPlugins.discover.category.all") : type === "mcp" ? "MCP" : type === "skill" ? "Skills" : "Plugins"}
                  <span class="mcp-plugins-tab-count">{marketplace().filter((item) => type === "all" || item.type === type).length}</span>
                </SegmentedControlItemV2>
              )}</For>
            </SegmentedControlV2>
            {/* Windows 11 Fluent Category Filter Bar */}
            <div class="win11-filter-bar no-scrollbar">
              <For
                each={[
                  "all",
                  "desarrollo",
                  "ia",
                  "seguridad",
                  "web",
                  "database",
                  "cloud",
                  "finanzas",
                  "diseno",
                  "ventas",
                  "datos",
                ]}
              >
                {(cat) => {
                  const isActive = () => discoverCategory() === cat
                  return (
                    <button
                      type="button"
                      class="win11-filter-chip"
                      classList={{ active: isActive() }}
                      onClick={() => setDiscoverCategory(cat)}
                    >
                      <span>{language.t(`settings.mcpPlugins.discover.category.${cat}` as "settings.mcpPlugins.discover.category.all")}</span>
                    </button>
                  )
                }}
              </For>
            </div>

            {/* Windows 11 Fluent App List View (10x10) */}
            <div class="mcp-plugins-table">
              <div class="mcp-plugins-thead">
                <div>{language.t("settings.mcpPlugins.column.extension")}</div>
                <div>{language.t("settings.mcpPlugins.column.category")}</div>
                <div>{language.t("settings.mcpPlugins.column.spec")}</div>
                <div class="text-right">{language.t("settings.mcpPlugins.column.action")}</div>
              </div>

              <div class="divide-y divide-white/[0.04]">
                <For each={pageDiscoverItems()}>
                  {(item) => {
                    const isInstalled = createMemo(() => {
                      if (item.type === "mcp") return Boolean(configData().mcp?.[item.id])
                      if (item.type === "skill") return installedSkills().some((skill) => skill.name === item.id)
                      return false
                    })

                    return (
                      <div class="mcp-plugins-row">
                        {/* 1. Extensión / Herramienta */}
                        <div class="mcp-plugins-cell gap-3 pr-2">
                          <div class="size-9 rounded-xl bg-white/[0.06] border border-white/10 flex items-center justify-center shrink-0 text-lg shadow-sm">
                            <BrandOrFallback names={[item.id, item.name, item.command]} size={20} fallback={item.icon} />
                          </div>
                          <div class="flex flex-col min-w-0">
                            <div class="flex items-center gap-1.5 flex-wrap">
                              <span class="text-xs font-semibold text-v2-text-text-base truncate" title={item.name}>
                                {item.name}
                              </span>
                              <Show when={item.popular}>
                                <span class="win11-badge-popular text-[9px] py-0 px-1.5">{language.t("settings.mcpPlugins.discover.popular")}</span>
                              </Show>
                            </div>
                            <div class="flex items-center gap-1.5 mt-0.5">
                              <span
                                class="win11-app-pill text-[9.5px]"
                                classList={{
                                  "pill-mcp": item.type === "mcp",
                                  "pill-plugin": item.type === "plugin",
                                }}
                              >
                                {item.type === "mcp" ? "MCP" : item.type === "skill" ? "Skill" : "Plugin"}
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* 2. Categoría */}
                        <div class="mcp-plugins-cell pr-2">
                          <span class="mcp-category-badge">
                            {formatCategory(item.category)}
                          </span>
                        </div>

                        {/* 3. Comando / Especificación & Descripción */}
                        <div class="mcp-plugins-cell flex-col items-start gap-1 pr-3">
                          <div class="win11-spec-badge max-w-full text-[10.5px] py-0.5 px-2" title={item.command ?? item.spec}>
                            <span class="truncate font-mono">{item.command ?? item.spec}</span>
                          </div>
                          <p class="text-[11px] text-v2-text-text-muted line-clamp-1 leading-normal m-0">
                            {item.desc}
                          </p>
                        </div>

                        {/* 4. Estado / Acción */}
                        <div class="mcp-plugins-cell justify-end">
                          <button
                            type="button"
                            class="win11-action-btn text-xs py-1.5 px-3"
                            classList={{
                              "btn-installed": isInstalled(),
                              "btn-install": !isInstalled(),
                            }}
                            disabled={isInstalled() || market.pending === item.id}
                            onClick={() => void installCatalogItem(item)}
                          >
                            <Show when={isInstalled()} fallback={<span>{language.t(item.config || item.skillURL ? "settings.mcpPlugins.discover.get" : "settings.marketplace.source")}</span>}>
                              <span>{language.t("settings.mcpPlugins.discover.installedBadge")}</span>
                            </Show>
                          </button>
                        </div>
                      </div>
                    )
                  }}
                </For>
              </div>
            </div>

            <Show when={discoverTotal() > 1}>
              <SettingsPagerV2
                page={discoverPage()}
                totalPages={discoverTotal()}
                onPage={setDiscoverPage}
              />
            </Show>
          </div>
        </Show>
      </div>

      {/* Modal Añadir Servidor / Plugin */}
      <Show when={showAddModal()}>
        <div class="mcp-plugins-dialog-backdrop" onClick={() => setShowAddModal(false)}>
          <div class="mcp-plugins-modal" role="dialog" aria-modal="true" aria-label={language.t("settings.marketplace.config")} onClick={(e) => e.stopPropagation()} onKeyDown={(e) => { if (e.key === "Escape") setShowAddModal(false) }}>
            <div class="flex items-center justify-between pb-2 border-b border-v2-border-border-muted">
              <h3 class="text-[16px] font-semibold text-v2-text-text-base">
                {language.t(addMode() === "mcp" ? "settings.mcpPlugins.add.server" : "settings.mcpPlugins.add.plugin")}
              </h3>
              <IconButtonV2
                type="button"
                variant="ghost-muted"
                size="small"
                icon={<IconV2 name="close" />}
                aria-label={language.t("common.close")}
                onClick={() => setShowAddModal(false)}
              />
            </div>

            <div class="flex flex-col gap-3">
              <label class="flex flex-col gap-1.5">
                <span class="text-[12px] font-medium text-v2-text-text-base">{language.t("settings.mcpPlugins.form.name")}</span>
                <TextInputV2
                  disabled={market.editing}
                  value={formName()}
                  onInput={(e) => setFormName(e.currentTarget.value)}
                  placeholder={language.t("settings.mcpPlugins.form.name.placeholder")}
                />
              </label>

              <Show when={!market.advanced}><label class="flex flex-col gap-1.5">
                <span class="text-[12px] font-medium text-v2-text-text-base">
                  {language.t(addMode() === "mcp" ? "settings.mcpPlugins.form.command.server" : "settings.mcpPlugins.form.command.plugin")}
                </span>
                <TextInputV2
                  value={formCommand()}
                  onInput={(e) => setFormCommand(e.currentTarget.value)}
                  placeholder={language.t(
                    addMode() === "mcp"
                      ? "settings.mcpPlugins.form.command.server.placeholder"
                      : "settings.mcpPlugins.form.command.plugin.placeholder",
                  )}
                />
              </label></Show>

              <Show
                when={
                  !market.advanced && addMode() === "mcp" &&
                  /^(https?|sse):\/\//.test(formCommand().trim())
                }
              >
                <label class="flex items-center justify-between gap-3">
                  <span class="flex flex-col gap-0.5">
                    <span class="text-[12px] font-medium text-v2-text-text-base">
                      {language.t("settings.mcpPlugins.form.oauth")}
                    </span>
                    <span class="text-[11px] text-v2-text-text-muted">
                      {language.t("settings.mcpPlugins.form.oauth.description")}
                    </span>
                  </span>
                  <Switch checked={formOAuth()} onChange={setFormOAuth} hideLabel>
                    {language.t("settings.mcpPlugins.form.oauth")}
                  </Switch>
                </label>
              </Show>
              <Show when={addMode() === "mcp"}>
                <label class="flex flex-col gap-1.5">
                  <span>{language.t("settings.marketplace.config")}</span>
                  <textarea class="mcp-config-editor" rows={10} value={market.advanced}
                    onInput={(event) => setMarket("advanced", event.currentTarget.value)} spellcheck={false} />
                  <span class="text-xs text-v2-text-text-muted">{language.t("settings.marketplace.configHint")}</span>
                </label>
              </Show>
            </div>

            <div class="flex items-center justify-end gap-2 pt-2 border-t border-v2-border-border-muted">
              <ButtonV2 variant="neutral" size="normal" onClick={() => setShowAddModal(false)}>
                {language.t("common.cancel")}
              </ButtonV2>
              <ButtonV2
                variant="contrast"
                size="normal"
                disabled={submitting() || !formName().trim() || (!formCommand().trim() && !market.advanced.trim())}
                onClick={() => void handleSaveModal()}
              >
                {submitting() ? language.t("common.saving") : language.t("common.save")}
              </ButtonV2>
            </div>
          </div>
        </div>
      </Show>
    </>
  )
}
