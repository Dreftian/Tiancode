import { ButtonV2 } from "@tiancode-ai/ui/v2/button-v2"
import { MenuV2 } from "@tiancode-ai/ui/v2/menu-v2"
import { SegmentedControlItemV2, SegmentedControlV2 } from "@tiancode-ai/ui/v2/segmented-control-v2"
import { SelectV2 } from "@tiancode-ai/ui/v2/select-v2"
import { TextInputV2 } from "@tiancode-ai/ui/v2/text-input-v2"
import { Icon } from "@tiancode-ai/ui/icon"
import { useDialog } from "@tiancode-ai/ui/context/dialog"
import type { Config, MarketplaceConnector, McpRemoteConfig, McpStatus } from "@tiancode-ai/sdk/v2/client"
import { type Component, createEffect, createMemo, createResource, For, on, onCleanup, Show } from "solid-js"
import { createStore } from "solid-js/store"
import { useLanguage } from "@/context/language"
import { usePlatform } from "@/context/platform"
import { useServerSDK } from "@/context/server-sdk"
import type { dict } from "@/i18n/en"
import { showToast } from "@/utils/toast"
import { mcpKey } from "./marketplace"
import { DialogMcpServer } from "./mcp-dialogs"
import { CatalogIcon } from "./parts/catalog-icon"
import { SettingsConfirmDialog } from "./parts/confirm-dialog"
import { SettingsPagerV2 } from "./parts/pager"
import "./mcp-plugins.css"

// Settings › Conexiones › Conectores: the apps Claude and Codex connect to through a hosted MCP
// server, connected here in one step. A connector is an ordinary remote MCP server in the global
// config; signing in uses the server's OAuth, in the browser.

type View = "all" | "connected"
type State = "connected" | "needs_auth" | "needs_client_registration" | "failed" | "disabled" | "pending" | "available"

const PAGE_SIZE = 24
const REFRESH_MS = 10_000

export const SettingsConnectorsV2: Component<{ active?: boolean }> = (props) => {
  const language = useLanguage()
  const platform = usePlatform()
  const serverSdk = useServerSDK()
  const dialog = useDialog()
  const [ui, setUi] = createStore({
    query: "",
    view: "all" as View,
    category: "all",
    page: 1,
    // The connector a connect, sign-in or removal is running for.
    busy: "",
    requested: false,
  })

  createEffect(() => {
    if (props.active !== false && !ui.requested) setUi("requested", true)
  })
  const [connectors, { refetch: refetchConnectors }] = createResource(
    () => ui.requested || undefined,
    async () => (await serverSdk().client.global.marketplace.connectors({ throwOnError: true })).data,
  )
  const [config, { refetch: refetchConfig }] = createResource(
    () => ui.requested || undefined,
    async () => ((await serverSdk().client.global.config.get().catch(() => ({ data: {} }))).data ?? {}) as Config,
  )
  const [status, { refetch: refetchStatus }] = createResource(
    () => ui.requested || undefined,
    async () =>
      ((await serverSdk().client.mcp.status().catch(() => ({ data: {} }))).data ?? {}) as Record<string, McpStatus>,
  )
  createEffect(() => {
    if (props.active === false) return
    const timer = setInterval(() => void refetchStatus(), REFRESH_MS)
    onCleanup(() => clearInterval(timer))
  })

  // Configured remote servers by URL, so a connector added by hand (under any name) shows as connected.
  const configured = createMemo(() => {
    const byUrl = new Map<string, { name: string; enabled: boolean }>()
    for (const [name, entry] of Object.entries(config.latest?.mcp ?? {})) {
      if ("type" in entry && entry.type === "remote") byUrl.set(mcpKey({ url: entry.url }), { name, enabled: entry.enabled !== false })
    }
    return byUrl
  })
  const entryOf = (connector: MarketplaceConnector) => configured().get(mcpKey({ url: connector.url }))
  const stateOf = (connector: MarketplaceConnector): State => {
    const entry = entryOf(connector)
    if (!entry) return "available"
    if (!entry.enabled) return "disabled"
    const current = status.latest?.[entry.name]
    return current && current.status !== "disabled" ? current.status : "pending"
  }

  const query = () => ui.query.toLowerCase().trim()
  const categoryLabel = (category: string) => {
    const key = `settings.mcpPlugins.discover.category.${category}` as keyof typeof dict
    const label = language.t(key)
    return label === key ? category : label
  }
  // The apps Codex ships first (the everyday ones: Gmail, Drive, GitHub, Notion…), then the rest.
  const sorted = createMemo(() =>
    (connectors.latest ?? []).toSorted(
      (a, b) => Number(!a.sources.includes("codex")) - Number(!b.sources.includes("codex")) || a.title.localeCompare(b.title),
    ),
  )
  const visible = createMemo(() =>
    sorted().filter(
      (connector) =>
        (ui.view === "all" || stateOf(connector) !== "available") &&
        (ui.category === "all" || connector.category === ui.category) &&
        (!query() ||
          connector.title.toLowerCase().includes(query()) ||
          connector.description.toLowerCase().includes(query()) ||
          (connector.domain ?? "").includes(query())),
    ),
  )
  const categories = createMemo(() => {
    const counts = new Map<string, number>()
    for (const connector of connectors.latest ?? []) counts.set(connector.category, (counts.get(connector.category) ?? 0) + 1)
    return [
      { id: "all", label: language.t("settings.mcpPlugins.discover.allCategories"), count: connectors.latest?.length ?? 0 },
      ...[...counts]
        .map(([id, count]) => ({ id, label: categoryLabel(id), count }))
        .toSorted((a, b) => b.count - a.count || a.label.localeCompare(b.label)),
    ]
  })
  const connectedCount = () => (connectors.latest ?? []).filter((connector) => stateOf(connector) === "connected").length
  const pages = () => Math.max(1, Math.ceil(visible().length / PAGE_SIZE))
  const page = createMemo(() => {
    const current = Math.min(ui.page, pages())
    return visible().slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE)
  })
  createEffect(on([() => ui.query, () => ui.view, () => ui.category], () => setUi("page", 1), { defer: true }))

  const refresh = async () => {
    await refetchConfig()
    await refetchStatus()
  }

  // A free config name: the connector's own, or the same with a number when another server has it.
  const nameFor = (connector: MarketplaceConnector) => {
    const taken = new Set(Object.keys(config.latest?.mcp ?? {}))
    if (!taken.has(connector.name)) return connector.name
    return Array.from({ length: 50 }, (_, index) => `${connector.name}-${index + 2}`).find((name) => !taken.has(name))!
  }

  // One step: add the server, then sign in when it asks for it (the browser opens on the vendor's page).
  const connect = async (connector: MarketplaceConnector) => {
    if (ui.busy) return
    if (connector.auth === "own-app" || connector.auth === "restricted") return configure(connector)
    const name = nameFor(connector)
    setUi("busy", connector.id)
    try {
      const result = await serverSdk().client.mcp.add(
        { name, config: { type: "remote", url: connector.url, enabled: true } },
        { throwOnError: true },
      )
      const state = result.data[name]?.status
      if (state === "needs_auth") {
        showToast({ title: language.t("settings.connections.connectors.signingIn", { name: connector.title }) })
        await serverSdk().client.mcp.auth.authenticate({ name }, { throwOnError: true })
      }
      await refresh()
      if (state === "needs_client_registration") return configure(connector, name)
      showToast({ variant: "success", title: language.t("settings.connections.connectors.connected", { name: connector.title }) })
    } catch {
      await refresh()
      showToast({ variant: "error", title: language.t("settings.connections.connectors.failed", { name: connector.title }) })
    } finally {
      setUi("busy", "")
    }
  }

  const signIn = async (connector: MarketplaceConnector) => {
    const entry = entryOf(connector)
    if (!entry || ui.busy) return
    setUi("busy", connector.id)
    try {
      await serverSdk().client.mcp.auth.authenticate({ name: entry.name }, { throwOnError: true })
      await refresh()
    } catch {
      showToast({ variant: "error", title: language.t("settings.mcpPlugins.toast.authFailed", { name: connector.title }) })
    } finally {
      setUi("busy", "")
    }
  }

  // Vendors that only accept OAuth apps they registered need the user's own client ID: the server
  // dialog, prefilled, takes it.
  const configure = (connector: MarketplaceConnector, existing?: string) => {
    const current = existing ? config.latest?.mcp?.[existing] : undefined
    const base: McpRemoteConfig =
      current && "type" in current && current.type === "remote"
        ? current
        : { type: "remote", url: connector.url, oauth: {}, enabled: false }
    void dialog.push(() => (
      <DialogMcpServer
        name={existing ?? nameFor(connector)}
        config={base}
        editing={Boolean(existing)}
        onClose={() => dialog.close()}
        onSave={async (name, definition, activate) => {
          if (activate && !existing) {
            await serverSdk().client.mcp.add({ name, config: { ...definition, enabled: true } }, { throwOnError: true })
          } else {
            await serverSdk().client.global.config.update(
              { config: { mcp: { [name]: existing ? definition : { ...definition, enabled: false } } } },
              { throwOnError: true },
            )
          }
          await refresh()
          showToast({ variant: "success", title: language.t("settings.mcpServers.add.success") })
        }}
      />
    ))
  }

  const disconnect = (connector: MarketplaceConnector) => {
    const entry = entryOf(connector)
    if (!entry) return
    void dialog.push(() => (
      <SettingsConfirmDialog
        title={language.t("settings.connections.connectors.disconnectConfirm", { name: connector.title })}
        description={language.t("settings.connections.connectors.disconnectDescription")}
        confirm={language.t("settings.connections.connectors.disconnect")}
        onConfirm={async () => {
          setUi("busy", connector.id)
          try {
            await serverSdk().client.mcp.remove({ name: entry.name }, { throwOnError: true })
            await refresh()
            showToast({ variant: "success", title: language.t("settings.mcpPlugins.toast.serverRemoved", { name: connector.title }) })
          } catch {
            showToast({ variant: "error", title: language.t("settings.mcpPlugins.toast.serverRemoveFailed") })
          } finally {
            setUi("busy", "")
          }
        }}
        onClose={() => dialog.close()}
      />
    ))
  }

  const stateLabel = (state: State) => {
    if (state === "available") return ""
    if (state === "pending") return language.t("settings.mcpPlugins.status.pending")
    return language.t(`settings.mcpServers.status.${state}`)
  }

  const authLabel = (connector: MarketplaceConnector) =>
    connector.auth === "none"
      ? language.t("settings.connections.connectors.noAuth")
      : connector.auth === "own-app"
        ? language.t("settings.connections.connectors.ownApp")
        : connector.auth === "restricted"
          ? language.t("settings.connections.connectors.restricted")
          : "OAuth"

  return (
    <div class="settings-v2-tab-body settings-v2-mp">
      <div class="settings-v2-mp-toolbar">
        <TextInputV2
          class="settings-v2-mp-search"
          type="search"
          appearance="base"
          value={ui.query}
          onInput={(event) => setUi("query", event.currentTarget.value)}
          placeholder={language.t("settings.connections.connectors.search")}
          aria-label={language.t("settings.connections.connectors.search")}
          spellcheck={false}
          autocomplete="off"
        />
        <SegmentedControlV2
          class="settings-v2-mp-types"
          value={ui.view}
          onChange={(value) => setUi("view", value === "connected" ? "connected" : "all")}
          aria-label={language.t("settings.connections.connectors.view")}
        >
          <SegmentedControlItemV2 value="all">{language.t("settings.mcpPlugins.discover.category.all")}</SegmentedControlItemV2>
          <SegmentedControlItemV2 value="connected">
            {language.t("settings.connections.connectors.connectedView", { count: connectedCount() })}
          </SegmentedControlItemV2>
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
      </div>
      <p class="settings-v2-mp-hint">{language.t("settings.connections.connectors.description")}</p>
      <Show when={connectors.error}>
        <p class="settings-v2-mp-discover-status" role="status">
          {language.t("settings.mcpPlugins.discover.loadFailed")}
          <button type="button" class="settings-v2-mp-link" onClick={() => void refetchConnectors()}>
            {language.t("settings.mcpPlugins.discover.retry")}
          </button>
        </p>
      </Show>
      <ul class="settings-v2-mp-grid" aria-busy={connectors.loading}>
        <For
          each={page()}
          fallback={
            <li class="settings-v2-mp-none">
              {language.t(connectors.loading ? "settings.mcpPlugins.discover.loading" : "settings.connections.connectors.empty")}
            </li>
          }
        >
          {(connector) => {
            const state = () => stateOf(connector)
            const busy = () => ui.busy === connector.id
            return (
              <li class="settings-v2-mp-item" data-component="connector-card" data-state={state()}>
                <div class="settings-v2-mp-item-head">
                  <span class="settings-v2-mp-avatar" aria-hidden="true">
                    <CatalogIcon
                      title={connector.title}
                      name={connector.name}
                      icon={connector.icon}
                      domain={connector.domain}
                      size={22}
                      fallback={<Icon name="share" />}
                    />
                  </span>
                  <div class="settings-v2-mp-item-identity">
                    <span class="settings-v2-mp-card-title" title={connector.title}>
                      {connector.title}
                    </span>
                    <span class="settings-v2-mp-item-meta">
                      {categoryLabel(connector.category)} · {authLabel(connector)}
                    </span>
                  </div>
                  <Show when={state() !== "available"}>
                    <span class="settings-v2-mp-status" data-state={state()}>
                      {stateLabel(state())}
                    </span>
                  </Show>
                </div>
                <p class="settings-v2-mp-item-description">
                  {connector.description || language.t("settings.connections.connectors.fallbackDescription", { name: connector.title })}
                </p>
                <div class="settings-v2-mp-item-foot">
                  <span class="settings-v2-mp-item-license">
                    {connector.sources.map((source) => (source === "claude" ? "Claude" : "Codex")).join(" · ")}
                  </span>
                  <Show when={connector.docs}>
                    {(docs) => (
                      <button type="button" class="settings-v2-mp-link" onClick={() => platform.openExternal(docs())}>
                        {language.t("settings.connections.connectors.docs")}
                      </button>
                    )}
                  </Show>
                  <div class="ml-auto flex items-center gap-1">
                    <Show
                      when={state() !== "available"}
                      fallback={
                        <ButtonV2
                          size="small"
                          variant={connector.auth === "restricted" ? "outline" : "contrast"}
                          disabled={Boolean(ui.busy)}
                          title={
                            connector.auth === "own-app"
                              ? language.t("settings.connections.connectors.ownApp.hint")
                              : connector.auth === "restricted"
                                ? language.t("settings.connections.connectors.restricted.hint")
                                : undefined
                          }
                          onClick={() => void connect(connector)}
                        >
                          {busy()
                            ? language.t("settings.connections.connectors.connecting")
                            : language.t(
                                connector.auth === "own-app" || connector.auth === "restricted"
                                  ? "settings.connections.connectors.configure"
                                  : "settings.connections.connectors.connect",
                              )}
                        </ButtonV2>
                      }
                    >
                      <Show when={state() === "needs_auth"}>
                        <ButtonV2 size="small" variant="contrast" disabled={Boolean(ui.busy)} onClick={() => void signIn(connector)}>
                          {language.t("settings.mcpServers.action.authenticate")}
                        </ButtonV2>
                      </Show>
                      <Show when={state() === "needs_client_registration"}>
                        <ButtonV2
                          size="small"
                          variant="contrast"
                          disabled={Boolean(ui.busy)}
                          onClick={() => configure(connector, entryOf(connector)?.name)}
                        >
                          {language.t("settings.connections.connectors.configure")}
                        </ButtonV2>
                      </Show>
                      <MenuV2 placement="bottom-end">
                        <MenuV2.Trigger
                          as="button"
                          type="button"
                          class="settings-v2-mp-more"
                          aria-label={language.t("settings.mcpPlugins.action.more", { name: connector.title })}
                          title={language.t("settings.mcpPlugins.action.more", { name: connector.title })}
                        >
                          <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
                            <circle cx="3.5" cy="8" r="1.25" fill="currentColor" />
                            <circle cx="8" cy="8" r="1.25" fill="currentColor" />
                            <circle cx="12.5" cy="8" r="1.25" fill="currentColor" />
                          </svg>
                        </MenuV2.Trigger>
                        <MenuV2.Portal>
                          <MenuV2.Content>
                            <MenuV2.Item onSelect={() => configure(connector, entryOf(connector)?.name)}>
                              {language.t("settings.mcpServers.action.edit")}
                            </MenuV2.Item>
                            <Show when={connector.auth !== "none"}>
                              <MenuV2.Item onSelect={() => void signIn(connector)}>
                                {language.t("settings.connections.connectors.signInAgain")}
                              </MenuV2.Item>
                            </Show>
                            <MenuV2.Separator />
                            <MenuV2.Item onSelect={() => disconnect(connector)}>
                              {language.t("settings.connections.connectors.disconnect")}
                            </MenuV2.Item>
                          </MenuV2.Content>
                        </MenuV2.Portal>
                      </MenuV2>
                    </Show>
                  </div>
                </div>
              </li>
            )
          }}
        </For>
      </ul>
      <Show when={pages() > 1}>
        <SettingsPagerV2 page={Math.min(ui.page, pages())} totalPages={pages()} onPage={(next) => setUi("page", next)} />
      </Show>
    </div>
  )
}
