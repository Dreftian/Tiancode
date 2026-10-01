import type { Component } from "solid-js"
import { Switch } from "@tiancode-ai/ui/v2/switch-v2"
import { SelectV2 } from "@tiancode-ai/ui/v2/select-v2"
import { useLanguage } from "@/context/language"
import { tabLayouts, useSettings } from "@/context/settings"
import { SettingsListV2 } from "./parts/list"
import { SettingsRowV2 } from "./parts/row"
import "./settings-v2.css"

/** Settings → Experimental, like opencode's page. */
export const SettingsExperimentalV2: Component<{ active?: boolean }> = () => {
  const language = useLanguage()
  const settings = useSettings()
  return (
    <>
      <div class="settings-v2-tab-header settings-v2-tab-header--stacked">
        <div class="settings-v2-tab-header-row">
          <h2 class="settings-v2-tab-title">{language.t("settings.tab.experimental")}</h2>
        </div>
        <p class="settings-v2-tab-description">{language.t("settings.experimental.description")}</p>
      </div>
      <div class="settings-v2-tab-body">
        <div class="settings-v2-section">
          <SettingsListV2>
            <SettingsRowV2
              title={language.t("settings.experimental.tabs.title")}
              description={language.t("settings.experimental.tabs.description")}
            >
              <SelectV2
                appearance="inline"
                data-action="settings-tab-layout"
                options={[...tabLayouts]}
                current={settings.appearance.tabLayout()}
                placement="bottom-end"
                gutter={6}
                label={(option) => language.t(`settings.experimental.tabs.${option}`)}
                onSelect={(option) => option && settings.appearance.setTabLayout(option)}
              />
            </SettingsRowV2>
            <SettingsRowV2
              title={language.t("settings.experimental.browser.title")}
              description={language.t("settings.experimental.browser.description")}
            >
              <div data-action="settings-agent-browser">
                <Switch
                  checked={settings.general.agentBrowser()}
                  onChange={(checked) => settings.general.setAgentBrowser(checked)}
                />
              </div>
            </SettingsRowV2>
            <SettingsRowV2
              title={language.t("settings.experimental.projectNames.title")}
              description={language.t("settings.experimental.projectNames.description")}
            >
              <div data-action="settings-show-project-name">
                <Switch
                  checked={settings.appearance.showProjectName()}
                  onChange={(checked) => settings.appearance.setShowProjectName(checked)}
                />
              </div>
            </SettingsRowV2>
          </SettingsListV2>
        </div>
      </div>
    </>
  )
}
