import { ButtonV2 } from "@tiancode-ai/ui/v2/button-v2"
import { MenuV2 } from "@tiancode-ai/ui/v2/menu-v2"
import { SegmentedControlItemV2, SegmentedControlV2 } from "@tiancode-ai/ui/v2/segmented-control-v2"
import { SelectV2 } from "@tiancode-ai/ui/v2/select-v2"
import { Switch } from "@tiancode-ai/ui/v2/switch-v2"
import { TextInputV2 } from "@tiancode-ai/ui/v2/text-input-v2"
import { Icon } from "@tiancode-ai/ui/icon"
import { useDialog } from "@tiancode-ai/ui/context/dialog"
import type {
  Config,
  MarketplaceInstalled,
  MarketplaceItem,
  McpLocalConfig,
  McpRemoteConfig,
  McpStatus,
} from "@tiancode-ai/sdk/v2/client"
import {
  type Component,
  createComputed,
  createEffect,
  createMemo,
  createResource,
  For,
  type JSX,
  on,
  onCleanup,
  Show,
} from "solid-js"
import { createStore, reconcile } from "solid-js/store"
import { useLanguage } from "@/context/language"
import { usePlatform } from "@/context/platform"
import { useServerSDK } from "@/context/server-sdk"
import type { dict } from "@/i18n/en"
import { showToast } from "@/utils/toast"
import { CURATED_ITEMS, mcpConfig, mcpKey, mergeCatalog, searchCatalog, SOURCE_GROUPS, sourceGroup } from "./marketplace"
import { DialogMcpPlugin, DialogMcpServer } from "./mcp-dialogs"
import { SettingsConfirmDialog } from "./parts/confirm-dialog"
import { BrandOrFallback } from "./parts/brand-icon"
import { CatalogIcon } from "./parts/catalog-icon"
import { SettingsHubHeader } from "./parts/hub-header"
import { SettingsPagerV2 } from "./parts/pager"
import { displayName, pluginEnabled, pluginName, pluginOrigin, pluginVersion, type PluginEntry } from "./plugins-origin"
import { decodeGitHubUrl, fetchGitHubSkills } from "./skills-github"
import "./mcp-plugins.css"

type McpDefinition = McpLocalConfig | McpRemoteConfig
type McpConfigValue = McpDefinition | { enabled: boolean }
type TabMode = "plugins" | "mcp" | "discover"
type CatalogType = "all" | MarketplaceItem["type"]
type SourceFilter = "all" | (typeof SOURCE_GROUPS)[number]
type ServerState = "connected" | "failed" | "needs_auth" | "needs_client_registration" | "disabled" | "pending"

// Curated entries are described in the user's language rather than the catalog's English.
const CURATED_DESCRIPTIONS: Record<string, keyof typeof dict> = {
  "diagram-design": "settings.marketplace.diagramDescription",
  "security-audit": "settings.marketplace.securityDescription",
  "i-have-adhd": "settings.marketplace.focusDescription",
  composio: "settings.marketplace.composioDescription",
  "baseline-ui": "settings.marketplace.baselineUiDescription",
  "fixing-accessibility": "settings.marketplace.fixingAccessibilityDescription",
  "fixing-motion-performance": "settings.marketplace.fixingMotionDescription",
  "fixing-metadata": "settings.marketplace.fixingMetadataDescription",
  "improve-ui": "settings.marketplace.improveUiDescription",
  "create-design-md": "settings.marketplace.designMdDescription",
}

const CATALOG_TYPES: CatalogType[] = ["all", "mcp", "skill", "plugin"]
const DISCOVER_PAGE_SIZE = 24

export const SettingsMcpPluginsV2: Component<{
  directory?: string
  active?: boolean
}> = (props) => {
  const language = useLanguage()
  const platform = usePlatform()
  const serverSdk = useServerSDK()
  const dialog = useDialog()
  const [ui, setUi] = createStore({
    tab: "plugins" as TabMode,
    query: "",
    type: "all" as CatalogType,
    category: "all",
    source: "all" as SourceFilter,
    // The search the registry is asked about, a moment after typing stops.
    term: "",
    // The full catalog is requested the first time this page is shown.
    catalogRequested: false,
    page: 1,
    // The entry a save or toggle is running for; every switch waits for it.
    saving: "",
    // The catalog entry being installed.
    pending: "",
  })

  const params = () => (props.directory ? { directory: props.directory } : undefined)
  const saveConfig = (config: Config) =>
    props.directory
      ? serverSdk().client.config.update({ ...params(), config }, { throwOnError: true })
      : serverSdk().client.global.config.update({ config }, { throwOnError: true })

  // Discovery never changes installed state. The server mirrors the catalogs (and bundles a copy
  // for offline use); a server too old to have them leaves Tiancode's own picks.
  createEffect(() => {
    if (props.active !== false && !ui.catalogRequested) setUi("catalogRequested", true)
  })
  const [remoteCatalog, { refetch: refetchCatalog }] = createResource(
    () => ui.catalogRequested || undefined,
    async () => (await serverSdk().client.global.marketplace.catalog({ throwOnError: true })).data.items,
  )
  createEffect(
    on(
      () => ui.query,
      (value) => {
        const timer = setTimeout(() => setUi("term", value.trim()), 400)
        onCleanup(() => clearTimeout(timer))
      },
    ),
  )
  // The official MCP Registry lists far more servers than any mirror; a search also asks it.
  const [registry] = createResource(
    () =>
      ui.tab === "discover" &&
      ui.term.length >= 3 &&
      (ui.type === "all" || ui.type === "mcp") &&
      (ui.source === "all" || ui.source === "registry")
        ? ui.term
        : undefined,
    async (q) => (await serverSdk().client.global.marketplace.search({ q }).catch(() => ({ data: [] }))).data ?? [],
  )
  const marketplace = createMemo(() =>
    mergeCatalog(CURATED_ITEMS, remoteCatalog.error ? [] : (remoteCatalog.latest ?? []), registry.latest ?? []),
  )
  const describe = (item: MarketplaceItem) => {
    const key = item.source === "tiancode" ? CURATED_DESCRIPTIONS[item.name] : undefined
    return key ? language.t(key) : item.description
  }
  const [installedPlugins, { refetch: refetchInstalled }] = createResource(
    async () => (await serverSdk().client.global.marketplace.installed().catch(() => ({ data: [] }))).data ?? [],
    { initialValue: [] as MarketplaceInstalled[] },
  )
  const [installedSkills, { refetch: refetchSkills }] = createResource(
    async () => (await serverSdk().client.app.skills(params()).catch(() => ({ data: [] }))).data ?? [],
    { initialValue: [] },
  )
  const [configData, { refetch: refetchConfig }] = createResource(
    async () => ((await serverSdk().client.config.get(params()).catch(() => ({ data: {} }))).data ?? {}) as Config,
    { initialValue: {} as Config },
  )
  const [mcpStatusData, { refetch: refetchStatus }] = createResource(
    async () =>
      ((await serverSdk().client.mcp.status(params()).catch(() => ({ data: {} }))).data ?? {}) as Record<string, McpStatus>,
    { initialValue: {} as Record<string, McpStatus> },
  )

  createEffect(() => {
    if (props.active === false) return
    const timer = setInterval(() => void refetchStatus(), 10000)
    onCleanup(() => clearInterval(timer))
  })

  const query = () => ui.query.toLowerCase().trim()

  // The status refreshes every 10 s; keyed reconciliation keeps each card (and an open menu in it)
  // in place and only updates what changed.
  const servers = keyed("name", () => {
    const statusMap = mcpStatusData()
    return Object.entries((configData().mcp ?? {}) as Record<string, McpConfigValue>).map(([name, conf]) => {
      const definition = "type" in conf ? conf : undefined
      const enabled = conf.enabled !== false
      const status = statusMap[name]
      const state: ServerState = !enabled
        ? "disabled"
        : status && status.status !== "disabled"
          ? status.status
          : "pending"
      return {
        name,
        enabled,
        state,
        definition,
        command: definition?.type === "local" ? definition.command.join(" ") : (definition?.url ?? ""),
        tools: status?.status === "connected" && typeof status.tools === "number" ? status.tools : 0,
        error: status && "error" in status ? status.error : undefined,
        environment: definition?.type === "local" ? Object.keys(definition.environment ?? {}).length : 0,
        oauth: definition?.type === "remote" && definition.oauth !== false,
      }
    })
  })
  const visibleServers = createMemo(() =>
    servers().filter(
      (server) => !query() || server.name.toLowerCase().includes(query()) || server.command.toLowerCase().includes(query()),
    ),
  )

  // The plugin list of the scope this page writes; entries from the other scope stay untouched.
  const ownPlugins = () => {
    const origins = (configData() as Config & { plugin_origins?: { spec: PluginEntry; scope: string }[] }).plugin_origins
    return origins?.length
      ? origins.filter((origin) => origin.scope === (props.directory ? "local" : "global")).map((origin) => origin.spec)
      : [...(configData().plugin ?? [])]
  }

  const plugins = keyed("name", () =>
    ((configData().plugin ?? []) as PluginEntry[])
      // Older builds exposed these UI-only entries; they are not executable plugins.
      .filter((entry) => !pluginName(entry).startsWith("builtin-"))
      .map((entry) => {
        const name = pluginName(entry)
        const local = pluginOrigin(entry) === "local"
        // Files under .tiancode/plugin(s) are loaded because they exist: removing the config entry
        // would not unload them, so they offer their folder instead.
        const discovered = /^file:/i.test(name) && /\/\.?tiancode\/plugins?\/[^/]+\.[cm]?[jt]s$/i.test(name)
        return {
          entry,
          name,
          display: displayName(entry),
          description: local ? language.t("settings.mcpPlugins.plugin.localDescription") : undefined,
          version: pluginVersion(entry),
          enabled: pluginEnabled(entry),
          local,
          file: discovered ? fileUrlPath(name) : undefined,
          removable: !discovered && ownPlugins().some((own) => pluginName(own) === name),
        }
      }),
  )
  const visiblePlugins = createMemo(() =>
    plugins().filter(
      (plugin) => !query() || plugin.name.toLowerCase().includes(query()) || plugin.display.toLowerCase().includes(query()),
    ),
  )
  const visibleInstalled = createMemo(() =>
    installedPlugins().filter(
      (entry) => !query() || entry.name.includes(query()) || entry.title.toLowerCase().includes(query()),
    ),
  )

  // A local plugin's name is its file:// URL; show the part under .tiancode/ instead of the
  // whole absolute path.
  const shortPluginRef = (name: string) => {
    const looksLikePath = /^file:/i.test(name) || /^[a-zA-Z]:[\\/]/.test(name) || name.startsWith("/")
    if (!looksLikePath) return name
    const normalized = name.replace(/\\/g, "/")
    const index = normalized.indexOf("/.tiancode/")
    if (index >= 0) return normalized.slice(index + 1)
    return normalized.split("/").filter(Boolean).slice(-2).join("/")
  }

  const categoryLabel = (category: string) => {
    const key = `settings.mcpPlugins.discover.category.${category}` as keyof typeof dict
    const label = language.t(key)
    return label === key ? category.charAt(0).toUpperCase() + category.slice(1) : label
  }
  // The type switch names groups ("Skills"); a catalog card names one entry ("Skill").
  const typeLabel = (type: CatalogType, plural = false) => {
    if (type === "all") return language.t("settings.mcpPlugins.discover.category.all")
    if (type === "mcp") return language.t("settings.mcpPlugins.type.mcp")
    if (type === "skill") return language.t(plural ? "settings.tab.skills" : "settings.mcpPlugins.type.skill")
    return language.t(plural ? "settings.mcpPlugins.tab.plugins" : "settings.mcpPlugins.type.plugin")
  }

  const sourceLabel = (source: SourceFilter) =>
    source === "all"
      ? language.t("settings.mcpPlugins.discover.allSources")
      : language.t(`settings.mcpPlugins.discover.source.${source}`)
  const ofKind = createMemo(() => marketplace().filter((item) => ui.type === "all" || item.type === ui.type))
  // Sources and categories come from the catalog itself, so every option has entries behind it.
  const sources = createMemo(() => {
    const counts = new Map<string, number>()
    for (const item of ofKind()) counts.set(sourceGroup(item.source), (counts.get(sourceGroup(item.source)) ?? 0) + 1)
    return [
      { id: "all" as SourceFilter, label: sourceLabel("all"), count: ofKind().length },
      ...SOURCE_GROUPS.filter((id) => counts.has(id)).map((id) => ({ id, label: sourceLabel(id), count: counts.get(id)! })),
    ]
  })
  const ofType = createMemo(() => ofKind().filter((item) => ui.source === "all" || sourceGroup(item.source) === ui.source))
  const categories = createMemo(() => {
    const counts = new Map<string, number>()
    for (const item of ofType()) counts.set(item.category, (counts.get(item.category) ?? 0) + 1)
    return [
      { id: "all", label: language.t("settings.mcpPlugins.discover.allCategories"), count: ofType().length },
      ...[...counts]
        .map(([id, count]) => ({ id, label: categoryLabel(id), count }))
        .toSorted((a, b) => b.count - a.count || a.label.localeCompare(b.label)),
    ]
  })
  const catalog = createMemo(() =>
    searchCatalog(
      ofType().filter((item) => ui.category === "all" || item.category === ui.category),
      ui.query,
    ),
  )
  const pages = () => Math.max(1, Math.ceil(catalog().length / DISCOVER_PAGE_SIZE))
  const catalogPage = createMemo(() => {
    const page = Math.min(ui.page, pages())
    return catalog().slice((page - 1) * DISCOVER_PAGE_SIZE, page * DISCOVER_PAGE_SIZE)
  })
  createEffect(
    on([() => ui.type, () => ui.source, () => ui.category, () => ui.query], () => setUi("page", 1), { defer: true }),
  )
  createEffect(
    on(categories, (list) => {
      if (!list.some((option) => option.id === ui.category)) setUi("category", "all")
    }),
  )
  createEffect(
    on(sources, (list) => {
      if (!list.some((option) => option.id === ui.source)) setUi("source", "all")
    }),
  )

  // A catalog server counts as added under its own name or under any name that points at it.
  const configuredServers = createMemo(
    () =>
      new Set(
        Object.values((configData().mcp ?? {}) as Record<string, McpConfigValue>).flatMap((conf) =>
          "type" in conf ? [mcpKey(conf.type === "remote" ? { url: conf.url } : { command: conf.command })] : [],
        ),
      ),
  )
  const installed = (item: MarketplaceItem) => {
    if (item.type === "mcp")
      return Boolean(configData().mcp?.[item.name]) || (item.mcp ? configuredServers().has(mcpKey(item.mcp)) : false)
    if (item.type === "skill") return installedSkills().some((skill) => skill.name === item.name)
    return installedPlugins().some((plugin) => plugin.id === item.id)
  }
  const obtainable = (item: MarketplaceItem) =>
    Boolean((item.mcp && mcpConfig(item.mcp)) || item.skillUrl || (item.type === "plugin" && item.installable))

  const connected = () => servers().filter((server) => server.state === "connected").length

  const refresh = async () => {
    await refetchConfig()
    await refetchStatus()
  }

  // Runs one change at a time and reports it; `fail` names what could not be done.
  const run = async (key: string, action: () => Promise<unknown>, done: string, fail: string) => {
    if (ui.saving) return
    setUi("saving", key)
    try {
      await action()
      await refresh()
      showToast({ variant: "success", title: done })
    } catch {
      showToast({ variant: "error", title: fail })
    } finally {
      setUi("saving", "")
    }
  }

  const toggleServer = (server: ReturnType<typeof servers>[number]) =>
    run(
      server.name,
      () =>
        server.definition
          ? // Explicit activation approves a project-defined server in the global config;
            // repository config alone is deliberately never executable.
            serverSdk().client.mcp.add(
              { ...params(), name: server.name, config: { ...server.definition, enabled: !server.enabled } },
              { throwOnError: true },
            )
          : // A bare { enabled } entry switches a server defined elsewhere (a plugin, a default). It goes
            // to the global config: a project entry cannot override a server the global config defines.
            serverSdk().client.global.config.update(
              { config: { mcp: { [server.name]: { enabled: !server.enabled } } } },
              { throwOnError: true },
            ),
      language.t(
        server.enabled ? "settings.mcpPlugins.toast.serverDisabled" : "settings.mcpPlugins.toast.serverEnabled",
        { name: server.name },
      ),
      language.t("settings.mcpPlugins.toast.serverUpdateFailed"),
    )

  const reconnect = (name: string) =>
    run(
      name,
      () => serverSdk().client.mcp.connect({ ...params(), name }, { throwOnError: true }),
      language.t("settings.mcpPlugins.toast.reconnected", { name }),
      language.t("settings.mcpPlugins.toast.actionFailed", { name }),
    )

  const signOut = (name: string) =>
    run(
      name,
      () => serverSdk().client.mcp.auth.remove({ ...params(), name }, { throwOnError: true }),
      language.t("settings.mcpPlugins.toast.signedOut", { name }),
      language.t("settings.mcpPlugins.toast.actionFailed", { name }),
    )

  // The backend opens the browser and waits for the OAuth callback.
  const authenticate = async (name: string) => {
    if (ui.saving) return
    setUi("saving", name)
    try {
      await serverSdk().client.mcp.auth.authenticate({ ...params(), name }, { throwOnError: true })
      showToast({ variant: "success", title: language.t("settings.mcpPlugins.toast.authStarted", { name }) })
    } catch {
      showToast({ variant: "error", title: language.t("settings.mcpPlugins.toast.authFailed", { name }) })
    } finally {
      setUi("saving", "")
    }
    void refetchStatus()
  }

  const confirm = (title: string, description: string, action: () => void) =>
    void dialog.push(() => (
      <SettingsConfirmDialog
        title={title}
        description={description}
        confirm={language.t("settings.mcpServers.action.remove")}
        onConfirm={action}
        onClose={() => dialog.close()}
      />
    ))

  const removeServer = (name: string) =>
    confirm(language.t("settings.marketplace.removeConfirm", { name }), language.t("settings.mcpPlugins.remove.server.description"), () =>
      void run(
        name,
        () => serverSdk().client.mcp.remove({ ...params(), name }, { throwOnError: true }),
        language.t("settings.mcpPlugins.toast.serverRemoved", { name }),
        language.t("settings.mcpPlugins.toast.serverRemoveFailed"),
      ),
    )

  const togglePlugin = (spec: PluginEntry, enabled: boolean) => {
    const target = pluginName(spec)
    const current = ownPlugins()
    const entries = current.some((entry) => pluginName(entry) === target) ? current : [...current, spec]
    return run(
      target,
      () =>
        saveConfig({
          plugin: entries.map((entry): PluginEntry => {
            if (pluginName(entry) !== target) return entry
            return [target, { ...(Array.isArray(entry) ? entry[1] : {}), enabled: !enabled }]
          }),
        }),
      language.t(enabled ? "settings.mcpPlugins.toast.pluginDisabled" : "settings.mcpPlugins.toast.pluginEnabled"),
      language.t("settings.mcpPlugins.toast.pluginUpdateFailed"),
    )
  }

  const removePlugin = (plugin: ReturnType<typeof plugins>[number]) =>
    confirm(
      language.t("settings.plugins.remove.confirm", { name: plugin.display }),
      language.t("settings.mcpPlugins.remove.plugin.description"),
      () =>
        void run(
          plugin.name,
          () => saveConfig({ plugin: ownPlugins().filter((entry) => pluginName(entry) !== plugin.name) }),
          language.t("settings.plugins.remove.success"),
          language.t("settings.plugins.remove.failed"),
        ),
    )

  const openServer = (name?: string, config?: McpDefinition, editing = false) =>
    void dialog.push(() => (
      <DialogMcpServer
        name={name}
        config={config}
        editing={editing}
        onClose={() => dialog.close()}
        onSave={async (serverName, definition, activate) => {
          // Servers from Settings live in the global config, never in the project's tiancode.json:
          // that file is usually committed (headers and variables would leak with it), and a project
          // entry is ignored for any server the global config defines. A full definition replaces
          // the entry, so cleared fields are really removed; MCP.add is the approval that turns it on.
          if (activate && !editing) {
            await serverSdk().client.mcp.add(
              { ...params(), name: serverName, config: { ...definition, enabled: true } },
              { throwOnError: true },
            )
          } else {
            await serverSdk().client.global.config.update(
              { config: { mcp: { [serverName]: editing ? definition : { ...definition, enabled: false } } } },
              { throwOnError: true },
            )
          }
          await refresh()
          showToast({ variant: "success", title: language.t("settings.mcpServers.add.success") })
        }}
      />
    ))

  const openPlugin = () =>
    void dialog.push(() => (
      <DialogMcpPlugin
        onClose={() => dialog.close()}
        onSave={async (spec) => {
          const current = ownPlugins()
          if (!current.some((entry) => pluginName(entry) === spec)) await saveConfig({ plugin: [...current, spec] })
          await refresh()
          showToast({ variant: "success", title: language.t("settings.mcpPlugins.toast.pluginInstalled", { name: spec }) })
        }}
      />
    ))

  const install = async (item: MarketplaceItem) => {
    const config = item.mcp ? mcpConfig(item.mcp) : undefined
    if (config) {
      openServer(item.name, config)
      return
    }
    if (item.type === "plugin" && item.installable) {
      await installPlugin(item)
      return
    }
    if (!item.skillUrl) {
      if (item.homepage) platform.openExternal(item.homepage)
      return
    }
    const source = decodeGitHubUrl(item.skillUrl)
    if (!source) return
    setUi("pending", item.id)
    try {
      const skills = await fetchGitHubSkills(source)
      if (skills.length === 0) throw new Error("No SKILL.md found")
      for (const skill of skills) {
        await serverSdk().client.app.skills2.import({ ...params(), ...skill }, { throwOnError: true })
      }
      await refetchSkills()
      showToast({ variant: "success", title: language.t("settings.skills.import.success") })
    } catch {
      showToast({ variant: "error", title: language.t("settings.mcpPlugins.toast.installFailed", { name: item.title }) })
    } finally {
      setUi("pending", "")
    }
  }

  // A Claude Code or Codex plugin: the server downloads it and adds what Tiancode can run.
  const installPlugin = async (item: MarketplaceItem) => {
    setUi("pending", item.id)
    try {
      const result = await serverSdk().client.global.marketplace.install(
        { marketplaceInstallInput: { id: item.id } },
        { throwOnError: true },
      )
      await Promise.all([refetchInstalled(), refetchSkills(), refresh()])
      showToast({
        variant: "success",
        title: language.t("settings.mcpPlugins.discover.pluginInstalled", { name: item.title }),
        description: pluginSummary(result.data),
      })
    } catch (error) {
      showToast({
        variant: "error",
        title: language.t("settings.mcpPlugins.toast.installFailed", { name: item.title }),
        description: errorMessage(error),
      })
    } finally {
      setUi("pending", "")
    }
  }

  const pluginSummary = (entry: MarketplaceInstalled) =>
    [
      entry.skills.length && language.t("settings.mcpPlugins.installed.skills", { count: entry.skills.length }),
      entry.commands.length && language.t("settings.mcpPlugins.installed.commands", { count: entry.commands.length }),
      entry.agents.length && language.t("settings.mcpPlugins.installed.agents", { count: entry.agents.length }),
      entry.mcp.length && language.t("settings.mcpPlugins.installed.servers", { count: entry.mcp.length }),
      entry.skipped.length && language.t("settings.mcpPlugins.installed.skipped", { list: entry.skipped.join(", ") }),
    ]
      .filter(Boolean)
      .join(" · ")

  const uninstallPlugin = (entry: MarketplaceInstalled) =>
    confirm(
      language.t("settings.plugins.remove.confirm", { name: entry.title }),
      language.t("settings.mcpPlugins.installed.removeDescription"),
      () =>
        void run(
          entry.id,
          async () => {
            await serverSdk().client.global.marketplace.uninstall({ id: entry.id }, { throwOnError: true })
            await Promise.all([refetchInstalled(), refetchSkills()])
          },
          language.t("settings.plugins.remove.success"),
          language.t("settings.plugins.remove.failed"),
        ),
    )

  const statusLabel = (state: ServerState) =>
    state === "pending" ? language.t("settings.mcpPlugins.status.pending") : language.t(`settings.mcpServers.status.${state}`)

  const moreMenu = (label: string, items: () => JSX.Element) => (
    <MenuV2 placement="bottom-end">
      <MenuV2.Trigger as="button" type="button" class="settings-v2-mp-more" aria-label={label} title={label}>
        <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
          <circle cx="3.5" cy="8" r="1.25" fill="currentColor" />
          <circle cx="8" cy="8" r="1.25" fill="currentColor" />
          <circle cx="12.5" cy="8" r="1.25" fill="currentColor" />
        </svg>
      </MenuV2.Trigger>
      <MenuV2.Portal>
        <MenuV2.Content>{items()}</MenuV2.Content>
      </MenuV2.Portal>
    </MenuV2>
  )

  const addLabel = () =>
    language.t(ui.tab === "plugins" ? "settings.mcpPlugins.add.plugin" : "settings.mcpPlugins.add.server")

  return (
    <>
      <SettingsHubHeader
        icon="mcp"
        title={language.t("settings.mcpPlugins.title")}
        description={language.t("settings.mcpPlugins.description")}
        value={ui.tab}
        onChange={(tab) => setUi("tab", tab)}
        sections={[
          {
            id: "plugins",
            label: language.t("settings.mcpPlugins.tab.plugins"),
            hint: language.t("settings.mcpPlugins.hint.plugins", { count: plugins().length + installedPlugins().length }),
            icon: "plugin",
          },
          {
            id: "mcp",
            label: language.t("settings.mcpPlugins.tab.servers"),
            hint: language.t("settings.mcpPlugins.hint.servers", { connected: connected(), total: servers().length }),
            icon: "mcp",
          },
          {
            id: "discover",
            label: language.t("settings.mcpPlugins.tab.discover"),
            hint: language.t("settings.mcpPlugins.hint.discover", { count: marketplace().length }),
            icon: "magnifying-glass",
          },
        ]}
      />

      <div class="settings-v2-tab-body settings-v2-mp">
        <div class="settings-v2-mp-toolbar">
          <TextInputV2
            class="settings-v2-mp-search"
            type="search"
            appearance="base"
            value={ui.query}
            onInput={(event) => setUi("query", event.currentTarget.value)}
            placeholder={language.t("settings.mcpPlugins.search.placeholder")}
            aria-label={language.t("settings.mcpPlugins.search.placeholder")}
            spellcheck={false}
            autocomplete="off"
          />
          <Show when={ui.tab === "discover"}>
            <SegmentedControlV2
              class="settings-v2-mp-types"
              value={ui.type}
              onChange={(value) => {
                const type = CATALOG_TYPES.find((option) => option === value)
                if (type) setUi("type", type)
              }}
              aria-label={language.t("settings.mcpPlugins.discover.typeLabel")}
            >
              <For each={CATALOG_TYPES}>
                {(type) => <SegmentedControlItemV2 value={type}>{typeLabel(type, true)}</SegmentedControlItemV2>}
              </For>
            </SegmentedControlV2>
            <SelectV2
              appearance="base"
              class="settings-v2-mp-category"
              options={sources()}
              current={sources().find((option) => option.id === ui.source)}
              value={(option) => option.id}
              label={(option) => `${option.label} · ${option.count}`}
              onSelect={(option) => option && setUi("source", option.id)}
            />
            <SelectV2
              appearance="base"
              class="settings-v2-mp-category"
              options={categories()}
              current={categories().find((option) => option.id === ui.category)}
              value={(option) => option.id}
              label={(option) => `${option.label} · ${option.count}`}
              onSelect={(option) => option && setUi("category", option.id)}
            />
          </Show>
          <Show when={ui.tab !== "discover"}>
            <ButtonV2
              variant="contrast"
              size="small"
              icon="plus"
              class="settings-v2-mp-add"
              onClick={() => (ui.tab === "plugins" ? openPlugin() : openServer())}
            >
              {addLabel()}
            </ButtonV2>
          </Show>
        </div>

        <Show when={ui.tab === "plugins"}>
          <Show
            when={plugins().length + installedPlugins().length > 0}
            fallback={
              <EmptyState
                icon="plugin"
                title={language.t("settings.plugins.empty")}
                description={language.t("settings.mcpPlugins.plugins.empty.description")}
                explore={language.t("settings.mcpPlugins.empty.explore")}
                add={language.t("settings.mcpPlugins.add.plugin")}
                onExplore={() => setUi({ tab: "discover", type: "plugin" })}
                onAdd={openPlugin}
              />
            }
          >
            <ul class="settings-v2-mp-list">
              <Show when={visiblePlugins().length + visibleInstalled().length === 0}>
                <li class="settings-v2-mp-none">{language.t("settings.mcpPlugins.plugins.searchEmpty")}</li>
              </Show>
              <For each={visibleInstalled()}>
                {(entry) => {
                  const item = () => marketplace().find((candidate) => candidate.id === entry.id)
                  return (
                    <li class="settings-v2-mp-card">
                      <span class="settings-v2-mp-avatar" aria-hidden="true">
                        <CatalogIcon
                          title={entry.title}
                          name={entry.name}
                          icon={item()?.icon}
                          domain={item()?.domain}
                          size={22}
                          fallback={<Icon name="plugin" />}
                        />
                      </span>
                      <div class="settings-v2-mp-card-copy">
                        <div class="settings-v2-mp-card-head">
                          <span class="settings-v2-mp-card-title" title={entry.title}>
                            {entry.title}
                          </span>
                        </div>
                        <Show when={item() && describe(item()!)}>
                          {(description) => <p class="settings-v2-mp-card-description">{description()}</p>}
                        </Show>
                        <div class="settings-v2-mp-tags">
                          <span class="settings-v2-mp-tag" data-tone="accent">
                            {sourceLabel(sourceGroup(entry.source))}
                          </span>
                          <Show when={entry.skills.length}>
                            <span class="settings-v2-mp-tag">
                              {language.t("settings.mcpPlugins.installed.skills", { count: entry.skills.length })}
                            </span>
                          </Show>
                          <Show when={entry.commands.length}>
                            <span class="settings-v2-mp-tag">
                              {language.t("settings.mcpPlugins.installed.commands", { count: entry.commands.length })}
                            </span>
                          </Show>
                          <Show when={entry.agents.length}>
                            <span class="settings-v2-mp-tag">
                              {language.t("settings.mcpPlugins.installed.agents", { count: entry.agents.length })}
                            </span>
                          </Show>
                          <Show when={entry.mcp.length}>
                            <span class="settings-v2-mp-tag">
                              {language.t("settings.mcpPlugins.installed.servers", { count: entry.mcp.length })}
                            </span>
                          </Show>
                        </div>
                      </div>
                      <div class="settings-v2-mp-card-actions">
                        {moreMenu(language.t("settings.mcpPlugins.action.more", { name: entry.title }), () => (
                          <>
                            <Show when={item()?.homepage}>
                              {(homepage) => (
                                <MenuV2.Item onSelect={() => platform.openExternal(homepage())}>
                                  {language.t("settings.marketplace.source")}
                                </MenuV2.Item>
                              )}
                            </Show>
                            <MenuV2.Item onSelect={() => uninstallPlugin(entry)}>{language.t("settings.plugins.remove")}</MenuV2.Item>
                          </>
                        ))}
                      </div>
                    </li>
                  )
                }}
              </For>
              <For each={visiblePlugins()}>
                {(plugin) => (
                  <li class="settings-v2-mp-card" data-disabled={plugin.enabled ? undefined : ""}>
                    <span class="settings-v2-mp-avatar" aria-hidden="true">
                      <BrandOrFallback names={[plugin.display, plugin.name]} size={20} fallback={<Icon name="plugin" />} />
                    </span>
                    <div class="settings-v2-mp-card-copy">
                      <div class="settings-v2-mp-card-head">
                        <span class="settings-v2-mp-card-title" title={plugin.display}>
                          {plugin.display}
                        </span>
                        <Show when={plugin.version}>
                          <span class="settings-v2-mp-tag">v{plugin.version}</span>
                        </Show>
                      </div>
                      <span class="settings-v2-mp-card-sub" title={plugin.name}>
                        {shortPluginRef(plugin.name)}
                      </span>
                      <Show when={plugin.description}>
                        <p class="settings-v2-mp-card-description">{plugin.description}</p>
                      </Show>
                      <div class="settings-v2-mp-tags">
                        <span class="settings-v2-mp-tag">
                          {language.t(plugin.local ? "settings.mcpPlugins.origin.local" : "settings.mcpPlugins.origin.npm")}
                        </span>
                      </div>
                    </div>
                    <div class="settings-v2-mp-card-actions">
                      <Switch
                        checked={plugin.enabled}
                        disabled={Boolean(ui.saving)}
                        onChange={() => void togglePlugin(plugin.entry, plugin.enabled)}
                        hideLabel
                      >
                        {language.t("settings.mcpPlugins.switch.plugin", { name: plugin.display })}
                      </Switch>
                      <Show when={plugin.removable || (plugin.file && platform.revealPath)}>
                        {moreMenu(language.t("settings.mcpPlugins.action.more", { name: plugin.display }), () => (
                          <>
                            <Show when={plugin.file}>
                              {(file) => (
                                <MenuV2.Item onSelect={() => void platform.revealPath?.(file())}>
                                  {language.t("settings.mcpPlugins.action.reveal")}
                                </MenuV2.Item>
                              )}
                            </Show>
                            <Show when={plugin.removable}>
                              <MenuV2.Item onSelect={() => removePlugin(plugin)}>{language.t("settings.plugins.remove")}</MenuV2.Item>
                            </Show>
                          </>
                        ))}
                      </Show>
                    </div>
                  </li>
                )}
              </For>
            </ul>
          </Show>
        </Show>

        <Show when={ui.tab === "mcp"}>
          <Show
            when={servers().length > 0}
            fallback={
              <EmptyState
                icon="mcp"
                title={language.t("settings.mcpServers.empty")}
                description={language.t("settings.mcpPlugins.empty.description")}
                explore={language.t("settings.mcpPlugins.empty.explore")}
                add={language.t("settings.mcpPlugins.empty.add")}
                onExplore={() => setUi({ tab: "discover", type: "mcp" })}
                onAdd={() => openServer()}
                note={language.t("settings.mcpPlugins.intro.body")}
              />
            }
          >
            <ul class="settings-v2-mp-list">
              <For
                each={visibleServers()}
                fallback={<li class="settings-v2-mp-none">{language.t("settings.mcpServers.search.empty")}</li>}
              >
                {(server) => (
                  <li class="settings-v2-mp-card" data-disabled={server.enabled ? undefined : ""}>
                    <span class="settings-v2-mp-avatar" aria-hidden="true">
                      <BrandOrFallback names={[server.name, server.command]} size={20} fallback={<Icon name="mcp" />} />
                    </span>
                    <div class="settings-v2-mp-card-copy">
                      <div class="settings-v2-mp-card-head">
                        <span class="settings-v2-mp-card-title" title={server.name}>
                          {server.name}
                        </span>
                        <span class="settings-v2-mp-status" data-state={server.state}>
                          {statusLabel(server.state)}
                        </span>
                      </div>
                      <Show when={server.command}>
                        <span class="settings-v2-mp-card-sub" title={server.command}>
                          {server.command}
                        </span>
                      </Show>
                      <div class="settings-v2-mp-tags">
                        <span class="settings-v2-mp-tag">
                          {language.t(
                            !server.definition
                              ? "settings.mcpPlugins.origin.builtin"
                              : server.definition.type === "local"
                                ? "settings.mcpPlugins.origin.local"
                                : "settings.mcpPlugins.type.remote",
                          )}
                        </span>
                        <Show when={server.tools > 0}>
                          <span class="settings-v2-mp-tag" data-tone="accent">
                            {language.t("settings.mcpServers.tools.count", { count: server.tools })}
                          </span>
                        </Show>
                        <Show when={server.environment > 0}>
                          <span class="settings-v2-mp-tag">
                            {language.t("settings.mcpPlugins.tag.env", { count: server.environment })}
                          </span>
                        </Show>
                        <Show when={server.oauth}>
                          <span class="settings-v2-mp-tag">OAuth</span>
                        </Show>
                      </div>
                      <Show when={server.state === "failed" && server.error}>
                        {(error) => (
                          <p class="settings-v2-mp-card-error" title={error()}>
                            {error()}
                          </p>
                        )}
                      </Show>
                    </div>
                    <div class="settings-v2-mp-card-actions">
                      <Show when={server.state === "needs_auth"}>
                        <ButtonV2
                          size="small"
                          variant="contrast"
                          disabled={Boolean(ui.saving)}
                          onClick={() => void authenticate(server.name)}
                        >
                          {language.t("settings.mcpServers.action.authenticate")}
                        </ButtonV2>
                      </Show>
                      <Switch
                        checked={server.enabled}
                        disabled={Boolean(ui.saving)}
                        onChange={() => void toggleServer(server)}
                        hideLabel
                      >
                        {language.t("settings.mcpPlugins.switch.server", { name: server.name })}
                      </Switch>
                      {moreMenu(language.t("settings.mcpPlugins.action.more", { name: server.name }), () => (
                        <>
                          <Show when={server.definition}>
                            {(definition) => (
                              <MenuV2.Item onSelect={() => openServer(server.name, definition(), true)}>
                                {language.t("settings.mcpServers.action.edit")}
                              </MenuV2.Item>
                            )}
                          </Show>
                          <Show when={server.enabled && server.definition}>
                            <MenuV2.Item onSelect={() => void reconnect(server.name)}>
                              {language.t("settings.mcpPlugins.action.reconnect")}
                            </MenuV2.Item>
                          </Show>
                          <Show when={server.oauth}>
                            <MenuV2.Item onSelect={() => void signOut(server.name)}>
                              {language.t("settings.mcpPlugins.action.signOut")}
                            </MenuV2.Item>
                          </Show>
                          <Show when={server.definition}>
                            <MenuV2.Separator />
                            <MenuV2.Item onSelect={() => removeServer(server.name)}>
                              {language.t("settings.mcpServers.action.remove")}
                            </MenuV2.Item>
                          </Show>
                        </>
                      ))}
                    </div>
                  </li>
                )}
              </For>
            </ul>
          </Show>
        </Show>

        <Show when={ui.tab === "discover"}>
          <p class="settings-v2-mp-hint">{language.t("settings.mcpPlugins.discover.description")}</p>
          <Show when={remoteCatalog.loading || remoteCatalog.error || registry.loading}>
            <p class="settings-v2-mp-discover-status" role="status">
              <Show
                when={remoteCatalog.error}
                fallback={language.t(
                  remoteCatalog.loading ? "settings.mcpPlugins.discover.loading" : "settings.mcpPlugins.discover.searchingRegistry",
                )}
              >
                {language.t("settings.mcpPlugins.discover.loadFailed")}
                <button type="button" class="settings-v2-mp-link" onClick={() => void refetchCatalog()}>
                  {language.t("settings.mcpPlugins.discover.retry")}
                </button>
              </Show>
            </p>
          </Show>
          <ul class="settings-v2-mp-grid">
            <For each={catalogPage()} fallback={<li class="settings-v2-mp-none">{language.t("settings.mcpPlugins.discover.empty")}</li>}>
              {(item) => (
                <li class="settings-v2-mp-item">
                  <div class="settings-v2-mp-item-head">
                    <span class="settings-v2-mp-avatar" aria-hidden="true">
                      <CatalogIcon
                        title={item.title}
                        name={item.name}
                        icon={item.icon}
                        domain={item.domain}
                        size={22}
                        fallback={<Icon name={item.type === "mcp" ? "mcp" : item.type === "plugin" ? "plugin" : "brain"} />}
                      />
                    </span>
                    <div class="settings-v2-mp-item-identity">
                      <span class="settings-v2-mp-card-title" title={item.title}>
                        {item.title}
                      </span>
                      <span class="settings-v2-mp-item-meta" title={item.id}>
                        {typeLabel(item.type)} · {sourceLabel(sourceGroup(item.source))}
                        {/* Registry servers often share a name; their publisher tells them apart. */}
                        <Show when={sourceGroup(item.source) === "registry" && item.id.includes("/")}>
                          {` · ${item.id.slice(item.id.indexOf(":") + 1, item.id.lastIndexOf("/"))}`}
                        </Show>
                      </span>
                    </div>
                    <Show
                      when={item.auth === "restricted" || item.auth === "own-app"}
                      fallback={
                        <Show when={item.verified}>
                          <span class="settings-v2-mp-tag" data-tone="accent">
                            {language.t("settings.mcpPlugins.discover.official")}
                          </span>
                        </Show>
                      }
                    >
                      <span
                        class="settings-v2-mp-tag"
                        title={language.t(
                          item.auth === "restricted"
                            ? "settings.connections.connectors.restricted.hint"
                            : "settings.connections.connectors.ownApp.hint",
                        )}
                      >
                        {language.t(
                          item.auth === "restricted"
                            ? "settings.connections.connectors.restricted"
                            : "settings.connections.connectors.ownApp",
                        )}
                      </span>
                    </Show>
                  </div>
                  <p class="settings-v2-mp-item-description">
                    {describe(item) || language.t("settings.mcpPlugins.discover.noDescription")}
                  </p>
                  <div class="settings-v2-mp-item-foot">
                    <span class="settings-v2-mp-item-license">{categoryLabel(item.category)}</span>
                    <Show when={item.stars}>
                      {(stars) => (
                        <span class="settings-v2-mp-item-license" title={String(stars())}>
                          ★ {compactNumber(stars(), language.intl())}
                        </span>
                      )}
                    </Show>
                    <Show when={item.homepage && obtainable(item)}>
                      <button
                        type="button"
                        class="settings-v2-mp-link"
                        onClick={() => item.homepage && platform.openExternal(item.homepage)}
                      >
                        {language.t("settings.marketplace.source")}
                      </button>
                    </Show>
                    <ButtonV2
                      size="small"
                      class="ml-auto"
                      variant={installed(item) ? "ghost" : obtainable(item) ? "contrast" : "outline"}
                      disabled={installed(item) || ui.pending === item.id || (!obtainable(item) && !item.homepage)}
                      onClick={() => void install(item)}
                    >
                      {installed(item)
                        ? language.t("settings.mcpPlugins.discover.installedBadge")
                        : ui.pending === item.id
                          ? language.t("settings.mcpPlugins.discover.installing")
                          : language.t(obtainable(item) ? "settings.mcpPlugins.discover.get" : "settings.marketplace.source")}
                    </ButtonV2>
                  </div>
                </li>
              )}
            </For>
          </ul>
          <Show when={pages() > 1}>
            <SettingsPagerV2 page={Math.min(ui.page, pages())} totalPages={pages()} onPage={(page) => setUi("page", page)} />
          </Show>
        </Show>
      </div>
    </>
  )
}

// 1234 → "1.2K" in the user's locale.
function compactNumber(value: number, locale: string) {
  return new Intl.NumberFormat(locale, { notation: "compact", maximumFractionDigits: 1 }).format(value)
}

function errorMessage(error: unknown) {
  if (error && typeof error === "object" && "message" in error && typeof error.message === "string") return error.message
  return undefined
}

function keyed<T extends object>(key: keyof T & string, source: () => T[]) {
  const [store, setStore] = createStore({ list: [] as T[] })
  createComputed(() => setStore("list", reconcile(source(), { key })))
  return () => store.list
}

// file:///C:/a%20b/x.ts → C:/a b/x.ts (the leading slash only belongs to POSIX paths).
function fileUrlPath(url: string) {
  const path = decodeURIComponent(new URL(url).pathname)
  return /^\/[A-Za-z]:/.test(path) ? path.slice(1) : path
}

function EmptyState(props: {
  icon: "mcp" | "plugin"
  title: string
  description: string
  explore: string
  add: string
  note?: string
  onExplore: () => void
  onAdd: () => void
}) {
  return (
    <div class="settings-v2-mp-empty">
      <span class="settings-v2-mp-empty-icon" aria-hidden="true">
        <Icon name={props.icon} />
      </span>
      <h3 class="settings-v2-mp-empty-title">{props.title}</h3>
      <p class="settings-v2-mp-empty-description">{props.description}</p>
      <div class="settings-v2-mp-empty-actions">
        <ButtonV2 variant="outline" size="small" onClick={props.onExplore}>
          {props.explore}
        </ButtonV2>
        <ButtonV2 variant="contrast" size="small" icon="plus" onClick={props.onAdd}>
          {props.add}
        </ButtonV2>
      </div>
      <Show when={props.note}>
        <p class="settings-v2-mp-empty-note">{props.note}</p>
      </Show>
    </div>
  )
}
