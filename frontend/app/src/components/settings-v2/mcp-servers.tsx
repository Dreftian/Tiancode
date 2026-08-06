import { ButtonV2 } from "@tiancode-ai/ui/v2/button-v2"
import { SelectV2 } from "@tiancode-ai/ui/v2/select-v2"
import { Switch } from "@tiancode-ai/ui/v2/switch-v2"
import { TextInputV2 } from "@tiancode-ai/ui/v2/text-input-v2"
import { TextareaV2 } from "@tiancode-ai/ui/v2/textarea-v2"
import type { McpLocalConfig, McpOAuthConfig, McpRemoteConfig, McpStatus } from "@tiancode-ai/sdk/v2/client"
import {
  type Component,
  createResource,
  For,
  Show,
  createSignal,
  createMemo,
  onMount,
  onCleanup,
} from "solid-js"
import { useLanguage } from "@/context/language"
import { useServerSDK } from "@/context/server-sdk"
import { showToast } from "@/utils/toast"
import { SettingsListV2 } from "./parts/list"
import { SettingsRowV2 } from "./parts/row"
import "./mcp-servers.css"

type McpConfigValue = McpLocalConfig | McpRemoteConfig | { enabled: boolean }

// Config entries may only carry `{ enabled }` (the server command lives in an
// outer layer), so narrow the union before touching type-specific fields.
const isConfiguredServer = (config: McpConfigValue): config is McpLocalConfig | McpRemoteConfig =>
  "type" in config && (config.type === "local" || config.type === "remote")

const TypeOptions: { id: "local" | "remote"; label: string }[] = [
  { id: "local", label: "settings.mcpServers.type.local" },
  { id: "remote", label: "settings.mcpServers.type.remote" },
]

const PresetDefinitions: { id: string; labelKey: string; command: string }[] = [
  {
    id: "filesystem",
    labelKey: "settings.mcpServers.presets.filesystem",
    command: "npx -y @modelcontextprotocol/server-filesystem <path>",
  },
  { id: "fetch", labelKey: "settings.mcpServers.presets.fetch", command: "npx -y @modelcontextprotocol/server-fetch" },
  { id: "memory", labelKey: "settings.mcpServers.presets.memory", command: "npx -y @modelcontextprotocol/server-memory" },
  {
    id: "sequential-thinking",
    labelKey: "settings.mcpServers.presets.sequentialThinking",
    command: "npx -y @modelcontextprotocol/server-sequential-thinking",
  },
  { id: "time", labelKey: "settings.mcpServers.presets.time", command: "npx -y @modelcontextprotocol/server-time" },
  { id: "playwright", labelKey: "settings.mcpServers.presets.playwright", command: "npx @playwright/mcp@latest" },
  { id: "context7", labelKey: "settings.mcpServers.presets.context7", command: "npx -y @upstash/context7-mcp" },
  { id: "git", labelKey: "settings.mcpServers.presets.git", command: "uvx mcp-server-git" },
]

// Catalog of popular MCP servers shown under "Discover". Local presets carry
// the full command, remote presets a URL; some require an API key that must
// be added after the server is created.
type DiscoverPreset =
  | { id: string; type: "local"; command: string; requiresKey?: boolean }
  | { id: string; type: "remote"; url: string; requiresKey?: boolean }

const DiscoverPresets: DiscoverPreset[] = [
  { id: "android-emulator", type: "local", command: "npx -y @mobilenext/mobile-mcp@latest" },
  { id: "node-repl", type: "local", command: "npx -y repl-mcp@latest" },
  { id: "ios-simulator", type: "local", command: "npx -y ios-simulator-mcp" },
  { id: "chrome-devtools", type: "local", command: "npx -y chrome-devtools-mcp@latest" },
  { id: "playwright", type: "local", command: "npx -y @playwright/mcp@latest" },
  { id: "context7", type: "local", command: "npx -y @upstash/context7-mcp" },
  { id: "aikido", type: "local", command: "npx -y @aikidosec/mcp", requiresKey: true },
  { id: "airwallex", type: "local", command: "npx -y @airwallex/developer-mcp@latest", requiresKey: true },
  { id: "canva", type: "remote", url: "https://mcp.canva.com/mcp" },
  { id: "circle", type: "remote", url: "https://developers.circle.com/mcp" },
  { id: "appwrite", type: "remote", url: "https://mcp.appwrite.io/" },
  { id: "apollo", type: "remote", url: "https://mcp.apollo.io/mcp" },
  { id: "graphos-tools", type: "remote", url: "https://mcp.apollographql.com" },
  { id: "atlan", type: "remote", url: "https://mcp.atlan.com/mcp" },
  { id: "awsknowledge", type: "remote", url: "https://knowledge-mcp.global.api.aws" },
]

// Servers are grouped by status (Connected, Errors, Disabled, Unknown) in
// this order; groups with no members are omitted.
type GroupKey = "connected" | "errors" | "disabled" | "unknown"

const statusGroup = (status: McpStatus | undefined): GroupKey => {
  switch (status?.status) {
    case "connected":
      return "connected"
    case "failed":
    case "needs_auth":
    case "needs_client_registration":
      return "errors"
    case "disabled":
      return "disabled"
    default:
      return "unknown"
  }
}

const GroupLabels: Record<GroupKey, string> = {
  connected: "settings.mcpServers.group.connected",
  errors: "settings.mcpServers.group.errors",
  disabled: "settings.mcpServers.group.disabled",
  unknown: "settings.mcpServers.group.unknown",
}

const GroupOrder: GroupKey[] = ["connected", "errors", "disabled", "unknown"]

// The SDK serializes some numeric fields as "NaN"/"Infinity" strings; only
// real numbers should be shown as a tool count.
const connectedToolCount = (status: McpStatus | undefined): number | undefined => {
  if (status?.status !== "connected") return undefined
  const count = Number(status.tools)
  return Number.isFinite(count) ? count : undefined
}

// The SDK serializes some numeric fields as "NaN"/"Infinity" strings; only
// real numbers should reach the config.
const asNumber = (value: string): number | undefined => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

const parsePairs = (text: string) =>
  text.split("\n").reduce<Record<string, string>>((pairs, line) => {
    const trimmed = line.trim()
    const index = trimmed.indexOf("=")
    if (index > 0) pairs[trimmed.slice(0, index).trim()] = trimmed.slice(index + 1).trim()
    return pairs
  }, {})

const pairsToText = (pairs: Record<string, string> | undefined) =>
  pairs ? Object.entries(pairs).map(([key, value]) => `${key}=${value}`).join("\n") : ""

export const SettingsMcpServersV2: Component<{
  directory?: string
}> = (props) => {
  const language = useLanguage()
  const serverSdk = useServerSDK()
  const [name, setName] = createSignal("")
  const [type, setType] = createSignal<"local" | "remote">("local")
  const [command, setCommand] = createSignal("")
  const [environment, setEnvironment] = createSignal("")
  const [cwd, setCwd] = createSignal("")
  const [timeout, setTimeoutValue] = createSignal("")
  const [url, setUrl] = createSignal("")
  const [headers, setHeaders] = createSignal("")
  const [oauth, setOAuth] = createSignal(false)
  const [presetId, setPresetId] = createSignal<string | undefined>(undefined)
  const [editing, setEditing] = createSignal<string | undefined>(undefined)
  const [saving, setSaving] = createSignal(false)
  const [message, setMessage] = createSignal<"success" | "error" | undefined>(undefined)
  const [search, setSearch] = createSignal("")

  const params = () => (props.directory ? { directory: props.directory } : undefined)

  const [data, { refetch }] = createResource(
    async () => {
      const [config, status] = await Promise.all([
        serverSdk().client.config.get(params()),
        serverSdk().client.mcp.status(params()),
      ])
      return { config: config.data ?? {}, status: status.data ?? {} }
    },
    { initialValue: { config: {} as Record<string, McpConfigValue>, status: {} as Record<string, McpStatus> } },
  )

  // Poll status so connection state and tool counts stay live while the
  // dialog is open; the interval is torn down with the component.
  onMount(() => {
    const interval = setInterval(() => void refetch(), 10_000)
    onCleanup(() => clearInterval(interval))
  })

  const servers = createMemo(() => Object.entries(data().config.mcp ?? {}) as [string, McpConfigValue][])
  const editingConfig = createMemo(() => servers().find(([serverName]) => serverName === editing())?.[1])

  const visibleServers = createMemo(() => {
    const query = search().trim().toLowerCase()
    if (!query) return servers()
    return servers().filter(([serverName]) => serverName.toLowerCase().includes(query))
  })

  const groupedServers = createMemo(() =>
    GroupOrder.flatMap((key) => {
      const items = visibleServers()
        .filter(([serverName]) => statusGroup(data().status[serverName]) === key)
        .sort(([a], [b]) => a.localeCompare(b))
      return items.length === 0 ? [] : [{ key, items }]
    }),
  )

  const statusInfo = (status: McpStatus | undefined): { key: string; tone: string } => {
    switch (status?.status) {
      case "connected":
        return { key: "settings.mcpServers.status.connected", tone: "green" }
      case "disabled":
        return { key: "settings.mcpServers.status.disabled", tone: "muted" }
      case "failed":
        return { key: "settings.mcpServers.status.failed", tone: "red" }
      case "needs_auth":
        return { key: "settings.mcpServers.status.needs_auth", tone: "yellow" }
      case "needs_client_registration":
        return { key: "settings.mcpServers.status.needs_client_registration", tone: "yellow" }
      default:
        return { key: "settings.mcpServers.status.unknown", tone: "muted" }
    }
  }

  const timeoutEntry = () => {
    const value = asNumber(timeout())
    return value === undefined ? {} : { timeout: value }
  }

  const existingRemoteOAuth = (): McpOAuthConfig | undefined => {
    const config = editingConfig()
    if (!config || !isConfiguredServer(config) || config.type !== "remote") return undefined
    if (config.oauth === undefined || config.oauth === false) return undefined
    return config.oauth
  }

  const buildConfig = (): McpLocalConfig | McpRemoteConfig => {
    if (type() === "local") {
      const argv = command().trim().split(/\s+/).filter(Boolean)
      const env = parsePairs(environment())
      return {
        type: "local",
        command: argv,
        ...(Object.keys(env).length > 0 ? { environment: env } : {}),
        ...(cwd().trim() ? { cwd: cwd().trim() } : {}),
        ...timeoutEntry(),
      }
    }
    const headerPairs = parsePairs(headers())
    return {
      type: "remote",
      url: url().trim(),
      ...(Object.keys(headerPairs).length > 0 ? { headers: headerPairs } : {}),
      oauth: oauth() ? existingRemoteOAuth() ?? {} : false,
      ...timeoutEntry(),
    }
  }

  const resetForm = () => {
    setName("")
    setType("local")
    setCommand("")
    setEnvironment("")
    setCwd("")
    setTimeoutValue("")
    setUrl("")
    setHeaders("")
    setOAuth(false)
    setPresetId(undefined)
    setEditing(undefined)
  }

  const startEdit = (serverName: string, config: McpConfigValue) => {
    setEditing(serverName)
    setName(serverName)
    setPresetId(undefined)
    setTimeoutValue("timeout" in config && config.timeout !== undefined ? String(config.timeout) : "")
    if (!isConfiguredServer(config)) {
      setType("local")
      setCommand("")
      setEnvironment("")
      setCwd("")
      setUrl("")
      setHeaders("")
      setOAuth(false)
      return
    }
    if (config.type === "local") {
      setType("local")
      setCommand(config.command.join(" "))
      setEnvironment(pairsToText(config.environment))
      setCwd(config.cwd ?? "")
      setUrl("")
      setHeaders("")
      setOAuth(false)
      return
    }
    setType("remote")
    setCommand("")
    setEnvironment("")
    setCwd("")
    setUrl(config.url)
    setHeaders(pairsToText(config.headers))
    setOAuth(config.oauth !== false)
  }

  const submit = async () => {
    const serverName = name().trim()
    if (!serverName) return
    setSaving(true)
    setMessage(undefined)
    try {
      await serverSdk().client.mcp.add({ ...params(), name: serverName, config: buildConfig() })
      setMessage("success")
      void refetch()
    } catch {
      setMessage("error")
    } finally {
      setSaving(false)
    }
  }

  const toggleEnabled = async (serverName: string, config: McpConfigValue, enabled: boolean) => {
    setMessage(undefined)
    try {
      if (isConfiguredServer(config)) {
        await serverSdk().client.mcp.add({ ...params(), name: serverName, config: { ...config, enabled } })
      } else {
        await serverSdk().client.config.update({ ...params(), config: { mcp: { [serverName]: { enabled } } } })
      }
      void refetch()
    } catch {
      setMessage("error")
    }
  }

  // Adds a catalog server when enabled, or disables the existing entry
  // (mirroring toggleEnabled) when turned off.
  const toggleDiscover = async (preset: DiscoverPreset, enabled: boolean) => {
    setMessage(undefined)
    try {
      if (enabled) {
        const config: McpLocalConfig | McpRemoteConfig =
          preset.type === "local"
            ? { type: "local", command: preset.command.split(/\s+/) }
            : { type: "remote", url: preset.url, oauth: {} }
        await serverSdk().client.mcp.add({ ...params(), name: preset.id, config })
      } else {
        const existing = servers().find(([serverName]) => serverName === preset.id)?.[1]
        if (existing && isConfiguredServer(existing)) {
          await serverSdk().client.mcp.add({ ...params(), name: preset.id, config: { ...existing, enabled } })
        } else {
          await serverSdk().client.config.update({ ...params(), config: { mcp: { [preset.id]: { enabled } } } })
        }
      }
      void refetch()
    } catch {
      setMessage("error")
    }
  }

  const connect = async (serverName: string) => {
    setMessage(undefined)
    try {
      await serverSdk().client.mcp.connect({ ...params(), name: serverName })
      void refetch()
    } catch {
      setMessage("error")
    }
  }

  const disconnect = async (serverName: string) => {
    setMessage(undefined)
    try {
      await serverSdk().client.mcp.disconnect({ ...params(), name: serverName })
      void refetch()
    } catch {
      setMessage("error")
    }
  }

  const removeServer = async (serverName: string) => {
    if (!window.confirm(language.t("settings.mcpServers.remove.confirm", { name: serverName }))) return
    setMessage(undefined)
    try {
      await serverSdk().client.mcp.remove({ ...params(), name: serverName })
      if (editing() === serverName) resetForm()
      void refetch()
    } catch {
      setMessage("error")
    }
  }

  // Exports the server as a standard mcpServers JSON block and copies it to
  // the clipboard so it can be pasted into another config file.
  const exportServer = async (serverName: string, config: McpConfigValue) => {
    const entry = isConfiguredServer(config)
      ? config.type === "local"
        ? {
            type: "local",
            command: config.command[0],
            args: config.command.slice(1),
            ...(config.environment ? { env: config.environment } : {}),
          }
        : { type: "remote", url: config.url, ...(config.headers ? { headers: config.headers } : {}) }
      : { enabled: config.enabled }
    const text = JSON.stringify({ mcpServers: { [serverName]: entry } }, null, 2)
    try {
      await navigator.clipboard.writeText(text)
      showToast({ variant: "success", title: language.t("settings.mcpServers.export.success") })
    } catch {
      showToast({ variant: "error", title: language.t("settings.mcpServers.export.failed") })
    }
  }

  const applyPreset = (preset: { command: string }) => {
    setType("local")
    setCommand(preset.command)
  }

  return (
    <>
      <div class="settings-v2-tab-header settings-v2-tab-header--stacked">
        <div class="settings-v2-tab-header-row">
          <h2 class="settings-v2-tab-title">{language.t("settings.mcpServers.title")}</h2>
          <ButtonV2 type="button" variant="contrast" size="small" onClick={resetForm}>
            {language.t("settings.mcpServers.add.button")}
          </ButtonV2>
        </div>
        <p class="settings-v2-tab-description">{language.t("settings.mcpServers.description")}</p>
      </div>

      <div class="settings-v2-tab-body settings-v2-mcp-servers">
        <Show when={message() === "success" || message() === "error"}>
          <div class="settings-v2-skills-message" data-variant={message()}>
            {message() === "success"
              ? language.t("settings.mcpServers.add.success")
              : language.t("settings.mcpServers.add.failed")}
          </div>
        </Show>

        <div class="settings-v2-mcp-servers-layout">
          <div class="settings-v2-mcp-servers-list">
            <div class="settings-v2-section">
              <h3 class="settings-v2-section-title">{language.t("settings.mcpServers.section.servers")}</h3>
              <Show when={servers().length > 1}>
                <TextInputV2
                  type="text"
                  appearance="base"
                  class="settings-v2-mcp-servers-search"
                  value={search()}
                  onInput={(event) => setSearch(event.currentTarget.value)}
                  placeholder={language.t("settings.mcpServers.search.placeholder")}
                  showClearButton={search().length > 0}
                  onClearClick={() => setSearch("")}
                  spellcheck={false}
                  autocomplete="off"
                  aria-label={language.t("settings.mcpServers.search.placeholder")}
                />
              </Show>
              <Show
                when={servers().length > 0}
                fallback={<div class="settings-v2-skills-status">{language.t("settings.mcpServers.empty")}</div>}
              >
                <For each={groupedServers()}>
                  {(group) => (
                    <div class="settings-v2-mcp-servers-group">
                      <Show when={groupedServers().length > 1}>
                        <div class="settings-v2-mcp-servers-group-title">
                          <span>{language.t(GroupLabels[group.key])}</span>
                          <span class="settings-v2-mcp-servers-group-count">{group.items.length}</span>
                        </div>
                      </Show>
                      <SettingsListV2>
                        <For each={group.items}>
                          {([serverName, config]) => {
                            const status = data().status[serverName]
                            const info = statusInfo(status)
                            const connected = status?.status === "connected"
                            const typeLabel = isConfiguredServer(config) ? config.type : undefined
                            const toolCount = connectedToolCount(status)
                            const toolsLabel =
                              toolCount === undefined
                                ? undefined
                                : language.t("settings.mcpServers.tools.count", { count: toolCount })
                            const detail = isConfiguredServer(config)
                              ? config.type === "local"
                                ? config.command.join(" ")
                                : config.url
                              : undefined
                            return (
                              <div class="settings-v2-mcp-servers-item">
                                <div class="settings-v2-mcp-servers-item-copy">
                                  <div class="settings-v2-mcp-servers-item-name-row">
                                    <span class="settings-v2-mcp-servers-item-dot" data-tone={info.tone} />
                                    <span class="settings-v2-mcp-servers-item-name">{serverName}</span>
                                  </div>
                                  <div class="settings-v2-mcp-servers-item-meta">
                                    <Show when={typeLabel}>
                                      <span class="settings-v2-mcp-servers-chip" data-variant="type">
                                        {typeLabel}
                                      </span>
                                    </Show>
                                    <span class="settings-v2-mcp-servers-chip" data-tone={info.tone}>
                                      {language.t(info.key)}
                                    </span>
                                    <Show when={toolsLabel}>
                                      <span class="settings-v2-mcp-servers-chip" data-variant="type">
                                        {toolsLabel}
                                      </span>
                                    </Show>
                                    <Show when={status?.status === "failed"}>
                                      <span class="settings-v2-mcp-servers-item-error">
                                        {status?.status === "failed" ? status.error : ""}
                                      </span>
                                    </Show>
                                  </div>
                                  <Show when={detail}>
                                    <div class="settings-v2-mcp-servers-item-detail">{detail}</div>
                                  </Show>
                                </div>
                                <div class="settings-v2-mcp-servers-item-actions">
                                  <div class="settings-v2-mcp-servers-item-toggle">
                                    <Switch
                                      checked={config.enabled !== false}
                                      onChange={(checked) => void toggleEnabled(serverName, config, checked)}
                                      hideLabel
                                    >
                                      {serverName}
                                    </Switch>
                                  </div>
                                  <Show
                                    when={connected}
                                    fallback={
                                      <ButtonV2
                                        type="button"
                                        variant="outline"
                                        size="small"
                                        onClick={() => void connect(serverName)}
                                      >
                                        {language.t("settings.mcpServers.action.connect")}
                                      </ButtonV2>
                                    }
                                  >
                                    <ButtonV2
                                      type="button"
                                      variant="outline"
                                      size="small"
                                      onClick={() => void disconnect(serverName)}
                                    >
                                      {language.t("settings.mcpServers.action.disconnect")}
                                    </ButtonV2>
                                  </Show>
                                  <ButtonV2
                                    type="button"
                                    variant="ghost"
                                    size="small"
                                    onClick={() => startEdit(serverName, config)}
                                  >
                                    {language.t("settings.mcpServers.action.edit")}
                                  </ButtonV2>
                                  <ButtonV2
                                    type="button"
                                    variant="ghost"
                                    size="small"
                                    onClick={() => void exportServer(serverName, config)}
                                  >
                                    {language.t("settings.mcpServers.action.export")}
                                  </ButtonV2>
                                  <ButtonV2
                                    type="button"
                                    variant="danger"
                                    size="small"
                                    onClick={() => void removeServer(serverName)}
                                  >
                                    {language.t("settings.mcpServers.action.remove")}
                                  </ButtonV2>
                                </div>
                              </div>
                            )
                          }}
                        </For>
                      </SettingsListV2>
                    </div>
                  )}
                </For>
                <Show when={servers().length > 0 && visibleServers().length === 0}>
                  <div class="settings-v2-mcp-servers-search-empty">
                    {language.t("settings.mcpServers.search.empty")}
                  </div>
                </Show>
              </Show>
            </div>

            <div class="settings-v2-section settings-v2-mcp-servers-discover">
              <div class="settings-v2-mcp-servers-discover-header">
                <h3 class="settings-v2-section-title">{language.t("settings.mcpServers.discover.title")}</h3>
                <p class="settings-v2-mcp-servers-discover-subtitle">
                  {language.t("settings.mcpServers.discover.description")}
                </p>
              </div>
              <SettingsListV2>
                <For each={DiscoverPresets}>
                  {(preset) => {
                    const existing = servers().find(([serverName]) => serverName === preset.id)?.[1]
                    const checked = existing !== undefined && existing.enabled !== false
                    return (
                      <div class="settings-v2-mcp-servers-discover-item">
                        <div class="settings-v2-mcp-servers-discover-copy">
                          <div class="settings-v2-mcp-servers-discover-name">
                            {language.t(`settings.mcpServers.discover.presets.${preset.id}.name`)}
                          </div>
                          <div class="settings-v2-mcp-servers-discover-meta">
                            <span class="settings-v2-mcp-servers-chip" data-variant="type">
                              {preset.type}
                            </span>
                            <Show when={preset.requiresKey}>
                              <span class="settings-v2-mcp-servers-discover-hint">
                                {language.t("settings.mcpServers.discover.requiresKey")}
                              </span>
                            </Show>
                          </div>
                          <div class="settings-v2-mcp-servers-discover-item-description">
                            {language.t(`settings.mcpServers.discover.presets.${preset.id}.description`)}
                          </div>
                        </div>
                        <Switch checked={checked} onChange={(value) => void toggleDiscover(preset, value)} hideLabel>
                          {preset.id}
                        </Switch>
                      </div>
                    )
                  }}
                </For>
              </SettingsListV2>
            </div>
          </div>

          <div class="settings-v2-mcp-servers-form">
            <div class="settings-v2-section">
              <h3 class="settings-v2-section-title">
                {editing()
                  ? language.t("settings.mcpServers.edit.title")
                  : language.t("settings.mcpServers.section.add")}
              </h3>
              <SettingsListV2>
                <SettingsRowV2 title={language.t("settings.mcpServers.field.name")} description="">
                  <TextInputV2
                    type="text"
                    appearance="base"
                    value={name()}
                    onInput={(event) => setName(event.currentTarget.value)}
                    placeholder={language.t("settings.mcpServers.field.name.placeholder")}
                    spellcheck={false}
                    autocomplete="off"
                    aria-label={language.t("settings.mcpServers.field.name")}
                  />
                </SettingsRowV2>
                <SettingsRowV2 title={language.t("settings.mcpServers.field.type")} description="">
                  <SelectV2
                    appearance="inline"
                    data-action="settings-mcp-server-type"
                    options={TypeOptions}
                    current={TypeOptions.find((option) => option.id === type())}
                    placement="bottom-end"
                    gutter={6}
                    value={(option) => option.id}
                    label={(option) => language.t(option.label)}
                    onSelect={(option) => {
                      if (option) setType(option.id)
                    }}
                  />
                </SettingsRowV2>
                <Show when={type() === "local"}>
                  <SettingsRowV2 title={language.t("settings.mcpServers.field.command")} description="">
                    <div class="flex flex-col gap-2 w-full">
                      <SelectV2
                        appearance="inline"
                        data-action="settings-mcp-server-preset"
                        options={PresetDefinitions}
                        current={PresetDefinitions.find((preset) => preset.id === presetId())}
                        placeholder={language.t("settings.mcpServers.presets.title")}
                        placement="bottom-end"
                        gutter={6}
                        value={(preset) => preset.id}
                        label={(preset) => language.t(preset.labelKey)}
                        onSelect={(preset) => {
                          if (preset) {
                            setPresetId(preset.id)
                            applyPreset(preset)
                          }
                        }}
                      />
                      <TextInputV2
                        type="text"
                        appearance="base"
                        value={command()}
                        onInput={(event) => setCommand(event.currentTarget.value)}
                        placeholder={language.t("settings.mcpServers.field.command.placeholder")}
                        spellcheck={false}
                        autocomplete="off"
                        aria-label={language.t("settings.mcpServers.field.command")}
                      />
                      <span class="settings-v2-mcp-servers-hint">
                        {language.t("settings.mcpServers.field.command.hint")}
                      </span>
                    </div>
                  </SettingsRowV2>
                  <SettingsRowV2 title={language.t("settings.mcpServers.field.environment")} description="">
                    <TextareaV2
                      value={environment()}
                      onInput={(event) => setEnvironment(event.currentTarget.value)}
                      placeholder={language.t("settings.mcpServers.field.environment.placeholder")}
                      rows={3}
                      aria-label={language.t("settings.mcpServers.field.environment")}
                    />
                  </SettingsRowV2>
                </Show>
                <Show when={type() === "remote"}>
                  <SettingsRowV2 title={language.t("settings.mcpServers.field.url")} description="">
                    <TextInputV2
                      type="url"
                      appearance="base"
                      value={url()}
                      onInput={(event) => setUrl(event.currentTarget.value)}
                      placeholder={language.t("settings.mcpServers.field.url.placeholder")}
                      spellcheck={false}
                      autocomplete="off"
                      aria-label={language.t("settings.mcpServers.field.url")}
                    />
                  </SettingsRowV2>
                  <SettingsRowV2 title={language.t("settings.mcpServers.field.headers")} description="">
                    <TextareaV2
                      value={headers()}
                      onInput={(event) => setHeaders(event.currentTarget.value)}
                      placeholder={language.t("settings.mcpServers.field.headers")}
                      rows={3}
                      aria-label={language.t("settings.mcpServers.field.headers")}
                    />
                  </SettingsRowV2>
                  <SettingsRowV2 title={language.t("settings.mcpServers.field.oauth")} description="">
                    <div class="flex items-center">
                      <Switch checked={oauth()} onChange={setOAuth} hideLabel>
                        {language.t("settings.mcpServers.field.oauth")}
                      </Switch>
                    </div>
                  </SettingsRowV2>
                </Show>
                <SettingsRowV2 title={language.t("settings.mcpServers.field.cwd")} description="">
                  <TextInputV2
                    type="text"
                    appearance="base"
                    value={cwd()}
                    onInput={(event) => setCwd(event.currentTarget.value)}
                    placeholder={language.t("settings.mcpServers.field.cwd")}
                    spellcheck={false}
                    autocomplete="off"
                    aria-label={language.t("settings.mcpServers.field.cwd")}
                  />
                </SettingsRowV2>
                <SettingsRowV2 title={language.t("settings.mcpServers.field.timeout")} description="">
                  <TextInputV2
                    type="number"
                    appearance="base"
                    value={timeout()}
                    onInput={(event) => setTimeoutValue(event.currentTarget.value)}
                    placeholder={language.t("settings.mcpServers.field.timeout")}
                    spellcheck={false}
                    autocomplete="off"
                    aria-label={language.t("settings.mcpServers.field.timeout")}
                  />
                </SettingsRowV2>
              </SettingsListV2>
              <div class="settings-v2-mcp-servers-actions">
                <ButtonV2 type="button" variant="ghost" size="small" onClick={resetForm}>
                  {language.t("settings.mcpServers.cancel.button")}
                </ButtonV2>
                <ButtonV2
                  type="button"
                  variant="contrast"
                  size="small"
                  disabled={
                    saving() ||
                    !name().trim() ||
                    (type() === "local" && !command().trim()) ||
                    (type() === "remote" && !url().trim())
                  }
                  onClick={() => void submit()}
                >
                  {saving()
                    ? language.t("settings.mcpServers.saving")
                    : language.t(editing() ? "settings.mcpServers.save.changes" : "settings.mcpServers.save.button")}
                </ButtonV2>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
