import { Component, Show, createResource, createSignal } from "solid-js"
import { Switch } from "@tiancode-ai/ui/v2/switch-v2"
import { useLanguage } from "@/context/language"
import { usePlatform } from "@/context/platform"
import { SettingsListV2 } from "./parts/list"
import { SettingsRowV2 } from "./parts/row"
import "./settings-v2.css"

export const SettingsPairingV2: Component<{ active?: boolean }> = () => {
  const language = useLanguage()
  const platform = usePlatform()
  const [keepAwake, { mutate }] = createResource(
    () => !!platform.getKeepScreenActive,
    () => platform.getKeepScreenActive?.() ?? Promise.resolve(false),
    { initialValue: false },
  )
  const [pending, setPending] = createSignal(false)
  const [failed, setFailed] = createSignal(false)

  const onKeepAwake = (checked: boolean) => {
    if (!platform.setKeepScreenActive || pending()) return
    setPending(true)
    setFailed(false)
    mutate(checked)
    void platform
      .setKeepScreenActive(checked)
      .then((applied) => {
        mutate(applied)
        if (checked && !applied) setFailed(true)
      })
      .catch(() => {
        mutate(!checked)
        setFailed(true)
      })
      .finally(() => setPending(false))
  }

  return (
    <>
      <div class="settings-v2-tab-header settings-v2-tab-header--stacked">
        <div class="settings-v2-tab-header-row">
          <h2 class="settings-v2-tab-title">{language.t("settings.pairing.title")}</h2>
        </div>
        <p class="settings-v2-tab-description">{language.t("settings.pairing.description")}</p>
      </div>
      <div class="settings-v2-tab-body">
        <div class="settings-v2-section">
          <SettingsListV2>
            <Show when={platform.setKeepScreenActive}>
              <SettingsRowV2
                title={language.t("settings.pairing.screenActive.title")}
                description={
                  <>
                    {language.t("settings.pairing.screenActive.description")}
                    <Show when={failed()}>
                      <span class="block text-v2-state-fg-danger">
                        {language.t("settings.pairing.screenActive.error")}
                      </span>
                    </Show>
                  </>
                }
              >
                <div data-action="settings-keep-screen-active">
                  <Switch checked={keepAwake.latest} disabled={pending()} onChange={onKeepAwake} />
                </div>
              </SettingsRowV2>
            </Show>
          </SettingsListV2>
        </div>
      </div>
    </>
  )
}
