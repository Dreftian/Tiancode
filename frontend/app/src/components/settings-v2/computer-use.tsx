import { For, Show, createEffect, createMemo, createResource, createSignal, onCleanup, onMount, type Component } from "solid-js"
import { createStore } from "solid-js/store"
import { ButtonV2 } from "@tiancode-ai/ui/v2/button-v2"
import { SegmentedControlItemV2, SegmentedControlV2 } from "@tiancode-ai/ui/v2/segmented-control-v2"
import { Switch } from "@tiancode-ai/ui/v2/switch-v2"
import { SelectV2 } from "@tiancode-ai/ui/v2/select-v2"
import type { McpLocalConfig, McpRemoteConfig, McpStatus } from "@tiancode-ai/sdk/v2/client"
import { useLanguage } from "@/context/language"
import { usePlatform } from "@/context/platform"
import { useServerSDK } from "@/context/server-sdk"
import { useSettings } from "@/context/settings"
import { showToast } from "@/utils/toast"
import { Persist, persisted } from "@/utils/persist"
import { SettingsListV2 } from "./parts/list"
import { SettingsRowV2 } from "./parts/row"

type McpConfigValue = McpLocalConfig | McpRemoteConfig | { enabled: boolean }
type PermissionMap = Record<string, "ask" | "allow" | "deny">
type ComputerUseTab = "toolkit" | "browser" | "profiles" | "vision" | "bridges"

const isLocalServer = (config: McpConfigValue): config is McpLocalConfig =>
  "type" in config && config.type === "local"

export const SettingsComputerUseV2: Component<{
  directory?: string
  active?: boolean
}> = (props) => {
  const language = useLanguage()
  const platform = usePlatform()
  const serverSdk = useServerSDK()
  const settings = useSettings()
  const [saving, setSaving] = createSignal(false)
  const [clearing, setClearing] = createSignal(false)
  const [activeTab, setActiveTab] = createSignal<ComputerUseTab>("toolkit")
  const desktop = createMemo(() => platform.platform === "desktop")

  // Persistent advanced OS & Browser Agent settings
  const [osPrefs, setOsPrefs] = persisted(
    Persist.global("tiancode.computer-use.preferences"),
    createStore({
      profile: "developer" as "developer" | "designer" | "automation" | "safe",
      visualOverlay: true,
      safeZoneProtected: true,
      clipboardSync: true,
      autoFocusWindows: true,
      speedPreset: "balanced" as "turbo" | "balanced" | "safe",
      displayTarget: "primary" as "primary" | "active" | "all",
      screenshotOcr: true,
      browserRipple: true,
      browserCookies: true,
      browserRecord: true,
    }),
  )

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

  createEffect(() => {
    const isActive = props.active ?? true
    if (!isActive) return
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
      showToast({ variant: "success", title: "Permisos de Uso de PC actualizados" })
    } catch {
      showToast({ variant: "error", title: language.t("settings.computerUse.save.failed") })
    } finally {
      setSaving(false)
    }
  }

  const clearBrowserData = async () => {
    if (!window.api?.clearWebviewData) return
    const confirmed = window.confirm(language.t("settings.browser.clearData.confirm") || "¿Deseas borrar las cookies y datos del navegador integrado?")
    if (!confirmed) return
    setClearing(true)
    try {
      await window.api.clearWebviewData()
      showToast({ variant: "success", title: language.t("settings.browser.clearData.done") || "Datos del navegador borrados con éxito" })
    } catch {
      showToast({ variant: "error", title: language.t("settings.browser.clearData.failed") || "Error al borrar datos del navegador" })
    } finally {
      setClearing(false)
    }
  }

  const profileOptions = () => [
    { id: "developer" as const, label: "🚀 Modo Desarrollador (Foco en IDE, Terminal y Git)" },
    { id: "designer" as const, label: "🎨 Modo Diseñador UI (Foco en Figma, Pixels y Layouts)" },
    { id: "automation" as const, label: "⚡ Modo Automatización E2E (Flujos guiados continuos)" },
    { id: "safe" as const, label: "🛡️ Modo Seguro (Confirmación obligatoria para cada acción)" },
  ]

  const speedOptions = () => [
    { id: "turbo" as const, label: "Turbo (30ms - Rápido para scripts y macros)" },
    { id: "balanced" as const, label: "Balanceado (150ms - Cadencia humana estándar)" },
    { id: "safe" as const, label: "Paso a paso (500ms - Verificación visual frame a frame)" },
  ]

  const displayOptions = () => [
    { id: "primary" as const, label: "Monitor Principal (1920×1080 / 4K)" },
    { id: "active" as const, label: "Ventana Activa en Foco" },
    { id: "all" as const, label: "Escritorio Completo (Multi-Monitor)" },
  ]

  return (
    <>
      <div class="settings-v2-tab-header settings-v2-tab-header--stacked">
        <div class="settings-v2-tab-header-row">
          <h2 class="settings-v2-tab-title">{language.t("settings.computerUse.title") || "Uso de la PC y Navegador"}</h2>
        </div>
        <div style={{ "margin-top": "6px", "margin-bottom": "6px" }}>
          <SegmentedControlV2
            value={activeTab()}
            onChange={(val) => val && setActiveTab(val as ComputerUseTab)}
          >
            <SegmentedControlItemV2 value="toolkit">🛠️ Herramientas</SegmentedControlItemV2>
            <SegmentedControlItemV2 value="browser">🌐 Navegador Web</SegmentedControlItemV2>
            <SegmentedControlItemV2 value="profiles">⚙️ Perfiles & Permisos</SegmentedControlItemV2>
            <SegmentedControlItemV2 value="vision">👁️ Visión & Pantalla</SegmentedControlItemV2>
            <SegmentedControlItemV2 value="bridges">🔌 Bridges</SegmentedControlItemV2>
          </SegmentedControlV2>
        </div>
        <p class="settings-v2-tab-description">
          {activeTab() === "toolkit" && "Herramientas de productividad del agente: sincronización de portapapeles, foco de ventanas y capturas de depuración."}
          {activeTab() === "browser" && "Control del navegador integrado: navegación web autónoma, cookies de sesión persistentes y renderizado visual."}
          {activeTab() === "profiles" && "Perfiles de automatización para programadores, cadencia de interacción y protección de aplicaciones sensibles."}
          {activeTab() === "vision" && "Ajustes de captura óptica de pantalla, indicador visual de clics y resolución adaptativa del agente."}
          {activeTab() === "bridges" && "Conexión directa con aplicaciones instaladas en tu PC para automatización y control de escritorio."}
        </p>
      </div>

      <div class="settings-v2-tab-body">
        {/* TAB 1: TOOLKIT */}
        <Show when={activeTab() === "toolkit"}>
          <div class="settings-v2-section">
            <h3 class="settings-v2-section-title">Herramientas de Productividad del Agente</h3>
            <SettingsListV2>
              <SettingsRowV2
                title="Sincronización Inteligente de Portapapeles"
                description="Permite que el agente lea o escriba código y snippets directamente desde/hacia el portapapeles de Windows."
              >
                <Switch
                  checked={osPrefs.clipboardSync}
                  onChange={(checked) => setOsPrefs("clipboardSync", checked)}
                />
              </SettingsRowV2>

              <SettingsRowV2
                title="Auto-Foco de Ventanas en Errores de Código"
                description="Trae automáticamente la terminal o el IDE al frente cuando se detecta un fallo de compilación o test roto."
              >
                <Switch
                  checked={osPrefs.autoFocusWindows}
                  onChange={(checked) => setOsPrefs("autoFocusWindows", checked)}
                />
              </SettingsRowV2>

              <SettingsRowV2
                title="Captura Óptica con Reconocimiento OCR"
                description="Extrae texto, trazas de error y elementos de interfaz directamente de capturas de pantalla para alimentar el contexto."
              >
                <Switch
                  checked={osPrefs.screenshotOcr}
                  onChange={(checked) => setOsPrefs("screenshotOcr", checked)}
                />
              </SettingsRowV2>
            </SettingsListV2>
          </div>
        </Show>

        {/* TAB 2: BROWSER */}
        <Show when={activeTab() === "browser"}>
          <div class="settings-v2-section">
            <h3 class="settings-v2-section-title">Navegador Integrado & Automatización Web</h3>
            <SettingsListV2>
              <SettingsRowV2
                title="Permitir Control Autónomo del Navegador"
                description="Habilita al agente para abrir páginas web, rellenar formularios, hacer clic y extraer información técnica."
              >
                <Switch
                  checked={settings.general.showBrowser()}
                  onChange={(checked) => settings.general.setShowBrowser(checked)}
                />
              </SettingsRowV2>

              <SettingsRowV2
                title="Superposición Visual del Cursor del Agente"
                description="Muestra un puntero iluminado y ondas de clic en vivo cuando el agente interactúa con la web."
              >
                <Switch
                  checked={osPrefs.browserRipple}
                  onChange={(checked) => setOsPrefs("browserRipple", checked)}
                />
              </SettingsRowV2>

              <SettingsRowV2
                title="Sesión y Cookies Persistentes"
                description="Conserva los inicios de sesión (GitHub, AWS, Vercel) para que los agentes operen en paneles autenticados."
              >
                <Switch
                  checked={osPrefs.browserCookies}
                  onChange={(checked) => setOsPrefs("browserCookies", checked)}
                />
              </SettingsRowV2>

              <SettingsRowV2
                title="Grabación y Registro de Acciones Web"
                description="Captura automáticamente la secuencia de clics, scroll y navegación del agente en formato de resumen."
              >
                <Switch
                  checked={osPrefs.browserRecord}
                  onChange={(checked) => setOsPrefs("browserRecord", checked)}
                />
              </SettingsRowV2>

              <Show when={desktop()}>
                <SettingsRowV2
                  title="Borrar Datos y Caché de Navegación"
                  description="Elimina todas las cookies, almacenamiento local y caché temporal del navegador integrado."
                >
                  <ButtonV2
                    type="button"
                    variant="danger"
                    size="small"
                    disabled={clearing()}
                    onClick={() => void clearBrowserData()}
                  >
                    {clearing() ? "Borrando..." : "Borrar Datos"}
                  </ButtonV2>
                </SettingsRowV2>
              </Show>
            </SettingsListV2>
          </div>
        </Show>

        {/* TAB 3: PROFILES */}
        <Show when={activeTab() === "profiles"}>
          <div class="settings-v2-section">
            <h3 class="settings-v2-section-title">Perfil de Operación & Permisos</h3>
            <SettingsListV2>
              <SettingsRowV2
                title="Perfil de Operación del Agente"
                description="Adapta la conducta del agente según la tarea que estés realizando (programación, diseño o automatización)."
              >
                <SelectV2
                  appearance="base"
                  options={profileOptions()}
                  current={profileOptions().find((o) => o.id === osPrefs.profile)}
                  value={(o) => o.id}
                  label={(o) => o.label}
                  onSelect={(o) => o && setOsPrefs("profile", o.id)}
                />
              </SettingsRowV2>

              <SettingsRowV2
                title={language.t("settings.computerUse.autoApprove") || "Aprobación Automática de Acciones de PC"}
                description={language.t("settings.computerUse.autoApprove.description") || "Ejecuta clics y pulsaciones sin solicitar confirmación interactiva en cada paso."}
              >
                <div data-action="settings-computer-use-auto-approve">
                  <Switch checked={settings.general.computerUseAutoApprove()} onChange={(checked) => void setAutoApprove(checked)} />
                </div>
              </SettingsRowV2>

              <SettingsRowV2
                title="Zona Segura (Protección de Aplicaciones Críticas)"
                description="Bloquea automáticamente clics o interacciones en gestores de contraseñas, banca online y ventanas elevadas de Administrador."
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

        {/* TAB 4: VISION */}
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

        {/* TAB 5: BRIDGES */}
        <Show when={activeTab() === "bridges"}>
          <div class="settings-v2-section">
            <h3 class="settings-v2-section-title">{language.t("settings.computerUse.section.apps") || "Bridges de Aplicaciones Locales"}</h3>
            <p class="settings-v2-note">{language.t("settings.computerUse.apps.description")}</p>
            <Show
              when={localApps().length > 0}
              fallback={<div class="settings-v2-skills-status">{language.t("settings.computerUse.empty") || "No hay bridges de aplicaciones configurados."}</div>}
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
                            ? language.t("settings.computerUse.apps.connected") || "Conectado"
                            : language.t("settings.computerUse.apps.disconnected") || "Desconectado"}
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
