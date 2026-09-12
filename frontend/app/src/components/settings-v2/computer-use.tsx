import { For, Show, createEffect, createMemo, createResource, createSignal, onCleanup, type Component } from "solid-js"
import { Switch } from "@tiancode-ai/ui/v2/switch-v2"
import { SegmentedControlItemV2, SegmentedControlV2 } from "@tiancode-ai/ui/v2/segmented-control-v2"
import type { McpLocalConfig, McpRemoteConfig } from "@tiancode-ai/sdk/v2/client"
import { useLanguage } from "@/context/language"
import { usePlatform } from "@/context/platform"
import { useServerSDK } from "@/context/server-sdk"
import { showToast } from "@/utils/toast"
import { SettingsListV2 } from "./parts/list"
import { SettingsRowV2 } from "./parts/row"

type McpConfigValue = McpLocalConfig | McpRemoteConfig | { enabled: boolean }
type PermissionMap = Record<string, "ask" | "allow" | "deny">
type ComputerUseTab = "tools" | "bridges"

const isLocalServer = (config: McpConfigValue): config is McpLocalConfig =>
  "type" in config && config.type === "local"

export const SettingsComputerUseV2: Component<{
  directory?: string
  active?: boolean
}> = (props) => {
  const language = useLanguage()
  const platform = usePlatform()
  const serverSdk = useServerSDK()
  const [saving, setSaving] = createSignal(false)
  const [activeTab, setActiveTab] = createSignal<ComputerUseTab>("tools")
  // Ambas tools viajan por el puente de la app de escritorio: en el navegador no existen.
  const desktop = createMemo(() => platform.platform === "desktop")

  const params = () => (props.directory ? { directory: props.directory } : undefined)

  const [configData, { refetch: refetchConfig }] = createResource(
    async () => {
      try {
        const result = await serverSdk().client.config.get(params()).catch(() => ({ data: {} }))
        return (result.data ?? {}) as Record<string, any>
      } catch {
        return {} as Record<string, any>
      }
    },
    { initialValue: {} as Record<string, any> },
  )

  const [statusData, { refetch: refetchStatus }] = createResource(
    async () => {
      try {
        const result = await serverSdk().client.mcp.status(params()).catch(() => ({ data: {} }))
        return (result.data ?? {}) as Record<string, any>
      } catch {
        return {} as Record<string, any>
      }
    },
    { initialValue: {} as Record<string, any> },
  )

  // El sondeo sólo tiene sentido mientras se están mirando los bridges: antes seguía corriendo
  // con la pestaña de ajustes abierta en cualquier otra sección.
  createEffect(() => {
    if (!(props.active ?? true)) return
    if (activeTab() !== "bridges") return
    const interval = setInterval(() => void refetchStatus(), 10_000)
    onCleanup(() => clearInterval(interval))
  })

  const localApps = createMemo(
    () =>
      Object.entries((configData().mcp ?? {}) as Record<string, McpConfigValue>).filter(([, config]) =>
        isLocalServer(config),
      ),
  )

  const currentPermission = () => {
    const permission = configData().permission
    if (typeof permission !== "object" || permission === null || Array.isArray(permission)) return undefined
    return permission as PermissionMap
  }

  // El estado del interruptor sale de la configuración real, no de una copia local: es la misma
  // regla que evalúa el backend cuando la tool pide permiso.
  const screenshotApproved = () => currentPermission()?.screenshot === "allow"

  const setScreenshotAutoApprove = async (enabled: boolean) => {
    if (saving()) return
    setSaving(true)
    try {
      const permission: PermissionMap = { ...(currentPermission() ?? {}) }
      // Borrar la clave devuelve el permiso a "ask", que es el valor por defecto del backend.
      if (enabled) permission.screenshot = "allow"
      else delete permission.screenshot
      await serverSdk().client.config.update({ ...params(), config: { permission } })
      await refetchConfig()
      showToast({ variant: "success", title: language.t("settings.computerUse.save.done") })
    } catch {
      showToast({ variant: "error", title: language.t("settings.computerUse.save.failed") })
    } finally {
      setSaving(false)
    }
  }

  const availability = () => (
    <span class="settings-v2-chip" data-tone={desktop() ? "green" : "muted"}>
      {desktop()
        ? language.t("settings.computerUse.tool.ready")
        : language.t("settings.computerUse.tool.desktopOnly")}
    </span>
  )

  return (
    <>
      <div class="settings-v2-tab-header settings-v2-tab-header--stacked">
        <div class="settings-v2-tab-header-row">
          <h2 class="settings-v2-tab-title">{language.t("settings.computerUse.title")}</h2>
        </div>
        <p class="settings-v2-tab-description">{language.t("settings.computerUse.description")}</p>
        <div style={{ "margin-top": "6px" }}>
          <SegmentedControlV2 value={activeTab()} onChange={(val) => val && setActiveTab(val as ComputerUseTab)}>
            <SegmentedControlItemV2 value="tools">{language.t("settings.computerUse.tab.tools")}</SegmentedControlItemV2>
            <SegmentedControlItemV2 value="bridges">
              {language.t("settings.computerUse.tab.bridges")}
            </SegmentedControlItemV2>
          </SegmentedControlV2>
        </div>
      </div>

      <div class="settings-v2-tab-body">
        <Show when={activeTab() === "tools"}>
          <div class="settings-v2-section">
            <h3 class="settings-v2-section-title">{language.t("settings.computerUse.section.tools")}</h3>
            <p class="settings-v2-note">{language.t("settings.computerUse.tools.description")}</p>
            <SettingsListV2>
              <SettingsRowV2
                title={language.t("settings.computerUse.screenshot.title")}
                description={language.t("settings.computerUse.screenshot.description")}
              >
                {availability()}
              </SettingsRowV2>

              <SettingsRowV2
                title={language.t("settings.computerUse.clipboard.title")}
                description={language.t("settings.computerUse.clipboard.description")}
              >
                {availability()}
              </SettingsRowV2>
            </SettingsListV2>
          </div>

          <div class="settings-v2-section">
            <h3 class="settings-v2-section-title">{language.t("settings.computerUse.section.permissions")}</h3>
            <SettingsListV2>
              <SettingsRowV2
                title={language.t("settings.computerUse.autoApproveScreenshot")}
                description={language.t("settings.computerUse.autoApproveScreenshot.description")}
              >
                <div data-action="settings-computer-use-auto-approve">
                  <Switch
                    checked={screenshotApproved()}
                    disabled={saving()}
                    onChange={(checked) => void setScreenshotAutoApprove(checked)}
                  />
                </div>
              </SettingsRowV2>
            </SettingsListV2>
            <p class="settings-v2-note">{language.t("settings.computerUse.autoApproveScreenshot.note")}</p>
            <p class="settings-v2-note">{language.t("settings.computerUse.clipboard.note")}</p>
          </div>
        </Show>

        <Show when={activeTab() === "bridges"}>
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
        </Show>
      </div>
    </>
  )
}
