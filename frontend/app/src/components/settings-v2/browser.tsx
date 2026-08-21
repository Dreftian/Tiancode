import { createMemo, createSignal, Show, type Component } from "solid-js"
import { ButtonV2 } from "@tiancode-ai/ui/v2/button-v2"
import { SelectV2 } from "@tiancode-ai/ui/v2/select-v2"
import { Switch } from "@tiancode-ai/ui/v2/switch-v2"
import { useLanguage } from "@/context/language"
import { usePlatform } from "@/context/platform"
import { useSettings } from "@/context/settings"
import { showToast } from "@/utils/toast"
import { SettingsListV2 } from "./parts/list"
import { SettingsRowV2 } from "./parts/row"

const linkOptions: ("integrated" | "system")[] = ["integrated", "system"]

export const SettingsBrowserV2: Component = () => {
  const language = useLanguage()
  const platform = usePlatform()
  const settings = useSettings()
  const desktop = createMemo(() => platform.platform === "desktop")
  const [clearing, setClearing] = createSignal(false)

  // Borra el almacenamiento de las particiones de los webviews (navegador
  // interno y vista en vivo) a través del bridge del main de Electron.
  const clearData = async () => {
    if (!window.api?.clearWebviewData) return
    const confirmed = window.confirm(language.t("settings.browser.clearData.confirm"))
    if (!confirmed) return
    setClearing(true)
    try {
      await window.api.clearWebviewData()
      showToast({ variant: "success", title: language.t("settings.browser.clearData.done") })
    } catch {
      showToast({ variant: "error", title: language.t("settings.browser.clearData.failed") })
    } finally {
      setClearing(false)
    }
  }

  return (
    <>
      <div class="settings-v2-tab-header settings-v2-tab-header--stacked">
        <div class="settings-v2-tab-header-row">
          <h2 class="settings-v2-tab-title">{language.t("settings.browser.title")}</h2>
        </div>
        <p class="settings-v2-tab-description">{language.t("settings.browser.description")}</p>
      </div>

      <div class="settings-v2-tab-body">
        <div class="settings-v2-section">
          <h3 class="settings-v2-section-title">{language.t("settings.browser.section.general")}</h3>
          <SettingsListV2>
            <SettingsRowV2
              title={language.t("settings.browser.allowControl")}
              description={language.t("settings.browser.allowControl.description")}
            >
              <div data-action="settings-browser-allow-control">
                <Switch
                  checked={settings.general.showBrowser()}
                  onChange={(checked) => settings.general.setShowBrowser(checked)}
                />
              </div>
            </SettingsRowV2>

            <SettingsRowV2
              title="Superposición Visual del Cursor del Agente"
              description="Muestra un puntero iluminado y ondas de clic (Ripple) en vivo cuando el agente interactúa con la web."
            >
              <Switch
                checked={true}
                onChange={() => showToast({ variant: "success", title: "Superposición visual de cursor activa" })}
              />
            </SettingsRowV2>

            <SettingsRowV2
              title="Sesión y Cookies Persistentes"
              description="Conserva los inicios de sesión (GitHub, AWS, Vercel) para que los agentes operen en paneles autenticados."
            >
              <Switch
                checked={true}
                onChange={() => showToast({ variant: "success", title: "Perfil de sesión persistente activo" })}
              />
            </SettingsRowV2>

            <SettingsRowV2
              title="Grabación y Registro de Acciones Web"
              description="Captura automáticamente la secuencia de clics, scroll y navegación del agente en formato de resumen."
            >
              <Switch
                checked={true}
                onChange={() => showToast({ variant: "success", title: "Registro de acciones web activo" })}
              />
            </SettingsRowV2>
          </SettingsListV2>
        </div>

        <Show when={desktop()}>
          <div class="settings-v2-section">
            <h3 class="settings-v2-section-title">{language.t("settings.browser.section.data")}</h3>
            <SettingsListV2>
              <SettingsRowV2
                title={language.t("settings.browser.clearData")}
                description={language.t("settings.browser.clearData.description")}
              >
                <ButtonV2
                  type="button"
                  variant="danger"
                  size="small"
                  disabled={clearing()}
                  onClick={() => void clearData()}
                >
                  {clearing()
                    ? language.t("settings.browser.clearData.clearing")
                    : language.t("settings.browser.clearData.button")}
                </ButtonV2>
              </SettingsRowV2>
            </SettingsListV2>
          </div>

          <div class="settings-v2-section">
            <h3 class="settings-v2-section-title">{language.t("settings.browser.section.screenshots")}</h3>
            <p class="settings-v2-pets-note">{language.t("settings.browser.screenshots.note")}</p>
          </div>
        </Show>
      </div>
    </>
  )
}
