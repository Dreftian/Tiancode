import { For, Show, createMemo, createResource, createSignal, onCleanup, onMount, type Component } from "solid-js"
import { Switch } from "@tiancode-ai/ui/v2/switch-v2"
import type { McpLocalConfig, McpRemoteConfig, McpStatus } from "@tiancode-ai/sdk/v2/client"
import { useLanguage } from "@/context/language"
import { useServerSDK } from "@/context/server-sdk"
import { useSettings } from "@/context/settings"
import { showToast } from "@/utils/toast"
import { SettingsListV2 } from "./parts/list"
import { SettingsRowV2 } from "./parts/row"

type McpConfigValue = McpLocalConfig | McpRemoteConfig | { enabled: boolean }

// El permiso de la tool computer_use es una clave indexada más del objeto
// permission de la config global; el resto de claves se preservan al escribir.
type PermissionMap = Record<string, "ask" | "allow" | "deny">

const isLocalServer = (config: McpConfigValue): config is McpLocalConfig =>
  "type" in config && config.type === "local"

export const SettingsComputerUseV2: Component<{
  directory?: string
}> = (props) => {
  const language = useLanguage()
  const serverSdk = useServerSDK()
  const settings = useSettings()
  const [saving, setSaving] = createSignal(false)

  const params = () => (props.directory ? { directory: props.directory } : undefined)

  // Config y estado en vivo igual que la sección MCP: el poll de estado no
  // re-renderiza la config, solo actualiza los indicadores de conexión.
  const [configData, { refetch: refetchConfig }] = createResource(
    async () => {
      const result = await serverSdk().client.config.get(params())
      return result.data ?? {}
    },
    { initialValue: {} as Record<string, unknown> },
  )
  const [statusData, { refetch: refetchStatus }] = createResource(
    async () => {
      const result = await serverSdk().client.mcp.status(params())
      return result.data ?? {}
    },
    { initialValue: {} as Record<string, McpStatus> },
  )

  onMount(() => {
    const interval = setInterval(() => void refetchStatus(), 10_000)
    onCleanup(() => clearInterval(interval))
  })

  // Aplicaciones locales integrables: servidores MCP de tipo local (Android
  // Studio, Photoshop, Opera GX, Unreal… son presets/entradas de la config).
  const localApps = createMemo(
    () =>
      Object.entries((configData().mcp ?? {}) as Record<string, McpConfigValue>).filter(([, config]) =>
        isLocalServer(config),
      ),
  )

  // Permisos actuales de la config global. Un permission global de tipo
  // string ("allow") no es combinable con claves por tool: se ignora y se
  // escribe solo la clave de computer_use.
  const currentPermission = () => {
    const permission = configData().permission
    if (typeof permission !== "object" || permission === null || Array.isArray(permission)) return undefined
    return permission as PermissionMap
  }

  const setAutoApprove = async (enabled: boolean) => {
    if (saving()) return
    setSaving(true)
    try {
      const permission: PermissionMap = { ...(currentPermission() ?? {}) }
      if (enabled) permission.computer_use = "allow"
      else delete permission.computer_use
      await serverSdk().client.config.update({ ...params(), config: { permission } })
      settings.general.setComputerUseAutoApprove(enabled)
      void refetchConfig()
    } catch {
      showToast({ variant: "error", title: language.t("settings.computerUse.save.failed") })
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <div class="settings-v2-tab-header settings-v2-tab-header--stacked">
        <div class="settings-v2-tab-header-row">
          <h2 class="settings-v2-tab-title">{language.t("settings.computerUse.title")}</h2>
        </div>
        <p class="settings-v2-tab-description">{language.t("settings.computerUse.description")}</p>
      </div>

      <div class="settings-v2-tab-body">
        <div class="settings-v2-section">
          <h3 class="settings-v2-section-title">{language.t("settings.computerUse.section.permissions")}</h3>
          <SettingsListV2>
            <SettingsRowV2
              title={language.t("settings.computerUse.autoApprove")}
              description={language.t("settings.computerUse.autoApprove.description")}
            >
              <div data-action="settings-computer-use-auto-approve">
                <Switch checked={settings.general.computerUseAutoApprove()} onChange={(checked) => void setAutoApprove(checked)} />
              </div>
            </SettingsRowV2>
          </SettingsListV2>
          <p class="settings-v2-note">{language.t("settings.computerUse.autoApprove.note")}</p>
          <p class="settings-v2-note">{language.t("settings.computerUse.screenshot")}</p>
        </div>

        <div class="settings-v2-section">
          <h3 class="settings-v2-section-title">{language.t("settings.computerUse.section.apps")}</h3>
          <p class="settings-v2-note">{language.t("settings.computerUse.apps.description")}</p>
          <Show
            when={localApps().length > 0}
            fallback={<div class="settings-v2-skills-status">{language.t("settings.computerUse.empty")}</div>}
          >
            <SettingsListV2>
              <For each={localApps()}>
                {([serverName, config]) => {
                  const status = statusData()[serverName]
                  const connected = status?.status === "connected"
                  return (
                    <SettingsRowV2 title={serverName} description={isLocalServer(config) ? config.command.join(" ") : ""}>
                      <span class="settings-v2-chip" data-tone={connected ? "green" : "muted"}>
                        {connected
                          ? language.t("settings.computerUse.apps.connected")
                          : language.t("settings.computerUse.apps.disconnected")}
                      </span>
                    </SettingsRowV2>
                  )
                }}
              </For>
            </SettingsListV2>
          </Show>
        </div>
      </div>
    </>
  )
}
