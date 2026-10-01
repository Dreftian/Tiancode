import { ButtonV2 } from "@tiancode-ai/ui/v2/button-v2"
import { MenuV2 } from "@tiancode-ai/ui/v2/menu-v2"
import { SegmentedControlItemV2, SegmentedControlV2 } from "@tiancode-ai/ui/v2/segmented-control-v2"
import { SelectV2 } from "@tiancode-ai/ui/v2/select-v2"
import { Switch } from "@tiancode-ai/ui/v2/switch-v2"
import { TextInputV2 } from "@tiancode-ai/ui/v2/text-input-v2"
import { Icon } from "@tiancode-ai/ui/icon"
import { useDialog } from "@tiancode-ai/ui/context/dialog"
import type { Config, McpLocalConfig, McpRemoteConfig, McpStatus } from "@tiancode-ai/sdk/v2/client"
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
import { CURATED_SKILLS, fetchMarketplace, MARKETPLACE_SNAPSHOT, type MarketplaceItem } from "./marketplace"
import { DialogMcpConfirm, DialogMcpPlugin, DialogMcpServer } from "./mcp-dialogs"
import { BrandOrFallback } from "./parts/brand-icon"
import { SettingsHubHeader } from "./parts/hub-header"
import { SettingsPagerV2 } from "./parts/pager"
import { displayName, pluginEnabled, pluginName, pluginOrigin, pluginVersion, type PluginEntry } from "./plugins-origin"
import { decodeGitHubUrl, fetchGitHubSkills } from "./skills-github"
import "./mcp-plugins.css"

type McpDefinition = McpLocalConfig | McpRemoteConfig
type McpConfigValue = McpDefinition | { enabled: boolean }
type TabMode = "plugins" | "mcp" | "discover"
type CatalogType = "all" | MarketplaceItem["type"]
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
const DISCOVER_PAGE_SIZE = 12

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

  // Discovery never changes installed state. Keep a versioned offline snapshot.
  const [clineCatalog] = createResource(
    () => ui.tab === "discover",
    () => fetchMarketplace().catch(() => MARKETPLACE_SNAPSHOT),
    { initialValue: MARKETPLACE_SNAPSHOT },
  )
  const marketplace = createMemo(() => [
    ...CURATED_SKILLS.map((entry) => ({
      ...entry,
      desc: language.t(CURATED_DESCRIPTIONS[entry.id] ?? "settings.marketplace.focusDescription"),
    })),
    ...clineCatalog().filter(
      (entry) => !CURATED_SKILLS.some((curated) => curated.type === entry.type && curated.id === entry.id),
    ),
  ])
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
        const catalog = marketplace().find((item) => item.type === "plugin" && item.spec === name)
        const local = pluginOrigin(entry) === "local"
        // Files under .tiancode/plugin(s) are loaded because they exist: removing the config entry
        // would not unload them, so they offer their folder instead.
        const discovered = /^file:/i.test(name) && /\/\.?tiancode\/plugins?\/[^/]+\.[cm]?[jt]s$/i.test(name)
        return {
          entry,
          name,
          display: catalog?.name ?? displayName(entry),
          description: catalog?.desc ?? (local ? language.t("settings.mcpPlugins.plugin.localDescription") : undefined),
          category: catalog?.category,
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

  const ofType = createMemo(() => marketplace().filter((item) => ui.type === "all" || item.type === ui.type))
  // Categories come from the catalog itself, so every option has entries behind it.
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
    ofType().filter(
      (item) =>
        (ui.category === "all" || item.category === ui.category) &&
        (!query() || item.name.toLowerCase().includes(query()) || item.desc.toLowerCase().includes(query())),
    ),
  )
  const pages = () => Math.max(1, Math.ceil(catalog().length / DISCOVER_PAGE_SIZE))
  const catalogPage = createMemo(() => {
    const page = Math.min(ui.page, pages())
    return catalog().slice((page - 1) * DISCOVER_PAGE_SIZE, page * DISCOVER_PAGE_SIZE)
  })
  createEffect(on([() => ui.type, () => ui.category, () => ui.query], () => setUi("page", 1), { defer: true }))
  createEffect(
    on(categories, (list) => {
      if (!list.some((option) => option.id === ui.category)) setUi("category", "all")
    }),
  )

  const installed = (item: MarketplaceItem) => {
    if (item.type === "mcp") return Boolean(configData().mcp?.[item.id])
    if (item.type === "skill") return installedSkills().some((skill) => skill.name === item.id)
    return false
  }

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
          : // A bare { enabled } entry switches a server defined elsewhere (a plugin, a default).
            saveConfig({ mcp: { [server.name]: { enabled: !server.enabled } } }),
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
      <DialogMcpConfirm
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
          // A full definition replaces the entry, so cleared fields are really removed. A new entry
          // is written switched off; turning it on below is the explicit approval (MCP.add).
          await saveConfig({ mcp: { [serverName]: editing ? definition : { ...definition, enabled: false } } })
          if (activate) {
            await serverSdk().client.mcp.add(
              { ...params(), name: serverName, config: { ...definition, enabled: true } },
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
    if (item.config) {
      openServer(item.id, item.config)
      return
    }
    if (!item.skillURL) {
      if (item.source) platform.openExternal(item.source)
      return
    }
    const source = decodeGitHubUrl(item.skillURL)
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
      showToast({ variant: "error", title: language.t("settings.mcpPlugins.toast.installFailed", { name: item.name }) })
    } finally {
      setUi("pending", "")
    }
  }

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
            hint: language.t("settings.mcpPlugins.hint.plugins", { count: plugins().length }),
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
            when={plugins().length > 0}
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
              <For
                each={visiblePlugins()}
                fallback={<li class="settings-v2-mp-none">{language.t("settings.mcpPlugins.plugins.searchEmpty")}</li>}
              >
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
                        <Show when={plugin.category}>{(category) => <span class="settings-v2-mp-tag">{categoryLabel(category())}</span>}</Show>
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
          <p class="settings-v2-mp-hint">{language.t("settings.marketplace.description")}</p>
          <ul class="settings-v2-mp-grid">
            <For each={catalogPage()} fallback={<li class="settings-v2-mp-none">{language.t("settings.mcpPlugins.discover.empty")}</li>}>
              {(item) => (
                <li class="settings-v2-mp-item">
                  <div class="settings-v2-mp-item-head">
                    <span class="settings-v2-mp-avatar" aria-hidden="true">
                      <BrandOrFallback
                        names={[item.id, item.name, item.command]}
                        size={20}
                        fallback={<Icon name={item.type === "mcp" ? "mcp" : item.type === "plugin" ? "plugin" : "brain"} />}
                      />
                    </span>
                    <div class="settings-v2-mp-item-identity">
                      <span class="settings-v2-mp-card-title" title={item.name}>
                        {item.name}
                      </span>
                      <span class="settings-v2-mp-item-meta">
                        {typeLabel(item.type)} · {categoryLabel(item.category)}
                      </span>
                    </div>
                    <Show when={item.popular}>
                      <span class="settings-v2-mp-tag" data-tone="accent">
                        {language.t("settings.mcpPlugins.discover.popular")}
                      </span>
                    </Show>
                  </div>
                  <p class="settings-v2-mp-item-description">{item.desc}</p>
                  <div class="settings-v2-mp-item-foot">
                    <Show when={item.license}>
                      <span class="settings-v2-mp-item-license">{item.license}</span>
                    </Show>
                    <Show when={item.source && (item.config || item.skillURL)}>
                      <button
                        type="button"
                        class="settings-v2-mp-link"
                        onClick={() => item.source && platform.openExternal(item.source)}
                      >
                        {language.t("settings.marketplace.source")}
                      </button>
                    </Show>
                    <ButtonV2
                      size="small"
                      class="ml-auto"
                      variant={installed(item) ? "ghost" : item.config || item.skillURL ? "contrast" : "outline"}
                      disabled={installed(item) || ui.pending === item.id}
                      onClick={() => void install(item)}
                    >
                      {installed(item)
                        ? language.t("settings.mcpPlugins.discover.installedBadge")
                        : language.t(item.config || item.skillURL ? "settings.mcpPlugins.discover.get" : "settings.marketplace.source")}
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
