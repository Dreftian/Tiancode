import { For, type Component } from "solid-js"
import { SelectV2 } from "@tiancode-ai/ui/v2/select-v2"
import { Switch } from "@tiancode-ai/ui/v2/switch-v2"
import { useLanguage } from "@/context/language"
import { useSettings } from "@/context/settings"
import { createSoundSettingsController, soundOptions } from "./general-controllers"
import { SettingsListV2 } from "./parts/list"
import { SettingsRowV2 } from "./parts/row"
import "./settings-v2.css"

const CHANNELS = ["agent", "permissions", "errors"] as const

/** Settings → Notifications: system notifications and sound effects per event, like opencode. */
export const SettingsNotificationsV2: Component<{ active?: boolean }> = () => {
  const language = useLanguage()
  const settings = useSettings()
  const sounds = createSoundSettingsController()

  const system = {
    agent: { checked: settings.notifications.agent, set: settings.notifications.setAgent },
    permissions: { checked: settings.notifications.permissions, set: settings.notifications.setPermissions },
    errors: { checked: settings.notifications.errors, set: settings.notifications.setErrors },
  }

  return (
    <>
      <div class="settings-v2-tab-header settings-v2-tab-header--stacked">
        <div class="settings-v2-tab-header-row">
          <h2 class="settings-v2-tab-title">{language.t("settings.tab.notifications")}</h2>
        </div>
        <p class="settings-v2-tab-description">{language.t("settings.notifications.description")}</p>
      </div>
      <div class="settings-v2-tab-body">
        <div class="settings-v2-section">
          <h3 class="settings-v2-section-title">{language.t("settings.general.section.notifications")}</h3>
          <SettingsListV2>
            <For each={CHANNELS}>
              {(kind) => (
                <SettingsRowV2
                  title={language.t(`settings.general.notifications.${kind}.title`)}
                  description={language.t(`settings.general.notifications.${kind}.description`)}
                >
                  <div data-action={`settings-notifications-${kind}`}>
                    <Switch checked={system[kind].checked()} onChange={(checked) => system[kind].set(checked)} />
                  </div>
                </SettingsRowV2>
              )}
            </For>
          </SettingsListV2>
        </div>

        <div class="settings-v2-section">
          <h3 class="settings-v2-section-title">{language.t("settings.general.section.sounds")}</h3>
          <SettingsListV2>
            <For each={CHANNELS}>
              {(kind) => (
                <SettingsRowV2
                  title={language.t(`settings.general.sounds.${kind}.title`)}
                  description={language.t(`settings.general.sounds.${kind}.description`)}
                >
                  <SelectV2
                    appearance="inline"
                    data-action={`settings-sounds-${kind}`}
                    options={soundOptions}
                    current={sounds[kind].current()}
                    value={(option) => option.id}
                    label={(option) => language.t(option.label)}
                    onHighlight={sounds[kind].highlight}
                    onSelect={sounds[kind].select}
                    placement="bottom-end"
                    gutter={6}
                  />
                </SettingsRowV2>
              )}
            </For>
          </SettingsListV2>
        </div>
      </div>
    </>
  )
}
