import { For, Show, createMemo, createResource, createSignal, onCleanup, onMount, type Component } from "solid-js"
import { createStore } from "solid-js/store"
import { SegmentedControlItemV2, SegmentedControlV2 } from "@tiancode-ai/ui/v2/segmented-control-v2"
import { Switch } from "@tiancode-ai/ui/v2/switch-v2"
import { SelectV2 } from "@tiancode-ai/ui/v2/select-v2"
import type { McpLocalConfig, McpRemoteConfig, McpStatus } from "@tiancode-ai/sdk/v2/client"
import { useLanguage } from "@/context/language"
import { useServerSDK } from "@/context/server-sdk"
import { useSettings } from "@/context/settings"
import { showToast } from "@/utils/toast"
import { Persist, persisted } from "@/utils/persist"
import { SettingsListV2 } from "./parts/list"
import { SettingsRowV2 } from "./parts/row"
import { SettingsPluginsV2 } from "./plugins"

type McpConfigValue = McpLocalConfig | McpRemoteConfig | { enabled: boolean }
type PermissionMap = Record<string, "ask" | "allow" | "deny">
type ComputerUseTab = "control" | "vision" | "plugins" | "bridges"

const isLocalServer = (config: McpConfigValue): config is McpLocalConfig =>
  "type" in config && config.type === "local"

export const SettingsComputerUseV2: Component<{
  directory?: string
}> = (props) => {
  const language = useLanguage()
  const serverSdk = useServerSDK()
  const settings = useSettings()
  const [saving, setSaving] = createSignal(false)
  const [activeTab, setActiveTab] = createSignal<ComputerUseTab>("control")

  // Persistent advanced OS Agent settings
  const [osPrefs, setOsPrefs] = persisted(
    Persist.global("tiancode.computer-use.preferences"),
    createStore({
      visualOverlay: true,
      safeZoneProtected: true,
      speedPreset: "balanced" as "turbo" | "balanced" | "safe",
      displayTarget: "primary" as "primary" | "active" | "all",
    }),
  )

  const params = () => (props.directory ? { directory: props.directory } : undefined)

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

  const speedOptions = () => [
    { id: "turbo" as const, label: "Turbo (30ms - Rápido)" },
    { id: "balanced" as const, label: "Balanceado (150ms - Humano)" },
    { id: "safe" as const, label: "Cauteloso (500ms - Paso a paso)" },
  ]

  const displayOptions = () => [
    { id: "primary" as const, label: "Monitor Principal (1920×1080)" },
    { id: "active" as const, label: "Ventana Activa en Foco" },
    { id: "all" as const, label: "Escritorio Completo (Multi-Monitor)" },
  ]

  return (
    <>
      <div class="settings-v2-tab-header settings-v2-tab-header--stacked">
        <div class="settings-v2-tab-header-row">
          <h2 class="settings-v2-tab-title">{language.t("settings.computerUse.title")}</h2>
        </div>
        <div style={{ "margin-top": "6px", "margin-bottom": "6px" }}>
          <SegmentedControlV2
            value={activeTab()}
            onChange={(val) => val && setActiveTab(val as ComputerUseTab)}
          >
            <SegmentedControlItemV2 value="control">Control de PC</SegmentedControlItemV2>
            <SegmentedControlItemV2 value="vision">Visión & Pantalla</SegmentedControlItemV2>
            <SegmentedControlItemV2 value="plugins">Plugins & Hooks</SegmentedControlItemV2>
            <SegmentedControlItemV2 value="bridges">Bridges Locales</SegmentedControlItemV2>
          </SegmentedControlV2>
        </div>
        <p class="settings-v2-tab-description">
          {activeTab() === "control" && "Configura permisos de ejecución autónoma, cadencia de clics y zonas seguras para el agente en Windows."}
          {activeTab() === "vision" && "Ajustes de captura óptica de pantalla, indicador visual de clics y resolución adaptativa del agente."}
          {activeTab() === "plugins" && "Extiende el agente con paquetes npm o archivos de plugin locales que se enganchan a los eventos del ciclo de vida."}
          {activeTab() === "bridges" && "Conexión directa con aplicaciones instaladas en tu PC para automatización y control de escritorio."}
        </p>
      </div>

      <div class="settings-v2-tab-body">
        <Show when={activeTab() === "control"}>
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

              <SettingsRowV2
                title="Zona Segura (Protección de Aplicaciones Críticas)"
                description="Bloquea clics automáticos en gestores de contraseñas, banca y ventanas con privilegios elevados de Administrador."
              >
                <Switch
                  checked={osPrefs.safeZoneProtected}
                  onChange={(checked) => setOsPrefs("safeZoneProtected", checked)}
                />
              </SettingsRowV2>

              <SettingsRowV2
                title="Cadencia y Velocidad de Interacción"
                description="Controla el retardo deliberado entre movimientos del ratón, pulsaciones de teclas y verificaciones ópticas."
              >
                <SelectV2
                  appearance="base"
                  options={speedOptions()}
                  current={speedOptions().find((o) => o.id === osPrefs.speedPreset)}
                  value={(o) => o.id}
                  label={(o) => o.label}
                  onSelect={(o) => o && setOsPrefs("speedPreset", o.id)}
                />
              </SettingsRowV2>
            </SettingsListV2>
            <p class="settings-v2-note">{language.t("settings.computerUse.autoApprove.note")}</p>
          </div>
        </Show>

        <Show when={activeTab() === "vision"}>
          <div class="settings-v2-section">
            <h3 class="settings-v2-section-title">Ajustes Ópticos & Overlay Visual</h3>
            <SettingsListV2>
              <SettingsRowV2
                title="Indicador Visual de Acción (Laser Ring Overlay)"
                description="Muestra un halo animado sutil en pantalla sobre el punto exacto donde el agente hace clic o escribe."
              >
                <Switch
                  checked={osPrefs.visualOverlay}
                  onChange={(checked) => setOsPrefs("visualOverlay", checked)}
                />
              </SettingsRowV2>

              <SettingsRowV2
                title="Monitor / Región Objetivo"
                description="Define el área visual que el agente observa para reconocer botones, formularios y contenido gráfico."
              >
                <SelectV2
                  appearance="base"
                  options={displayOptions()}
                  current={displayOptions().find((o) => o.id === osPrefs.displayTarget)}
                  value={(o) => o.id}
                  label={(o) => o.label}
                  onSelect={(o) => o && setOsPrefs("displayTarget", o.id)}
                />
              </SettingsRowV2>
            </SettingsListV2>
            <p class="settings-v2-note">{language.t("settings.computerUse.screenshot")}</p>
          </div>
        </Show>

        <Show when={activeTab() === "plugins"}>
          <SettingsPluginsV2 directory={props.directory} />
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

