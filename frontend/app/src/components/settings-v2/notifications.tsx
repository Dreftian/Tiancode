import { ButtonV2 } from "@tiancode-ai/ui/v2/button-v2"
import { SegmentedControlItemV2, SegmentedControlV2 } from "@tiancode-ai/ui/v2/segmented-control-v2"
import { SelectV2 } from "@tiancode-ai/ui/v2/select-v2"
import { Switch } from "@tiancode-ai/ui/v2/switch-v2"
import { Icon, type IconName } from "@tiancode-ai/ui/icon"
import { type Component, createResource, createSignal, For, Show } from "solid-js"
import { useLanguage } from "@/context/language"
import { usePermission } from "@/context/permission"
import { usePlatform } from "@/context/platform"
import { useServerSDK } from "@/context/server-sdk"
import { useSettings } from "@/context/settings"
import { createSoundSettingsController, soundOptions } from "./general-controllers"
import { goToSettings } from "./parts/goto"
import { SettingsListV2 } from "./parts/list"
import { SettingsRowV2 } from "./parts/row"
import "./parts/kit.css"

type Channel = "agent" | "questions" | "permissions" | "errors"
const EVENTS: readonly { channel: Channel; icon: IconName }[] = [
  { channel: "agent", icon: "circle-check" },
  { channel: "questions", icon: "bubble-5" },
  { channel: "permissions", icon: "shield" },
  { channel: "errors", icon: "warning" },
]
const VOLUMES = [0.25, 0.5, 0.75, 1] as const

const BellGlyph = () => (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M5 8a5 5 0 0 1 10 0c0 4.5 1.5 6 1.5 6h-13S5 12.5 5 8Z" />
    <path d="M8.5 16.5a1.7 1.7 0 0 0 3 0" />
  </svg>
)

/**
 * Settings › Notificaciones: when Tiancode tells you something happened and how it sounds.
 * System notifications only show while Tiancode is in the background; sounds can follow the
 * same rule, be turned down, or be silenced together with the notifications.
 */
export const SettingsNotificationsV2: Component<{ active?: boolean }> = () => {
  const language = useLanguage()
  const settings = useSettings()
  const platform = usePlatform()
  const permission = usePermission()
  const serverSdk = useServerSDK()
  const sounds = createSoundSettingsController()
  const desktop = () => platform.platform === "desktop"
  const [webPermission, setWebPermission] = createSignal(
    typeof Notification === "undefined" ? "unsupported" : Notification.permission,
  )

  const system = {
    agent: { checked: settings.notifications.agent, set: settings.notifications.setAgent },
    questions: { checked: settings.notifications.questions, set: settings.notifications.setQuestions },
    permissions: { checked: settings.notifications.permissions, set: settings.notifications.setPermissions },
    errors: { checked: settings.notifications.errors, set: settings.notifications.setErrors },
  }

  const [gateways] = createResource(() =>
    Promise.resolve()
      .then(() => serverSdk().client.global.connections.list())
      .then((result) => (result.data?.data ?? []).filter((item) => item.enabled))
      .catch(() => []),
  )
  const [decision] = createResource(() =>
    Promise.resolve()
      .then(() => serverSdk().client.global.decision.status())
      .then((result) => result.data)
      .catch(() => undefined),
  )

  const permissionState = () => {
    if (desktop()) return { tone: "ok", label: language.t("settings.notifications.system.allowed") }
    const state = webPermission()
    if (state === "granted") return { tone: "ok", label: language.t("settings.notifications.system.allowed") }
    if (state === "denied") return { tone: "error", label: language.t("settings.notifications.system.denied") }
    if (state === "unsupported") return { tone: "warn", label: language.t("settings.notifications.system.unsupported") }
    return { tone: "warn", label: language.t("settings.notifications.system.default") }
  }

  // Browsers only grant the permission from a click, so it is asked here and not on the first event.
  const requestPermission = () =>
    void Notification.requestPermission()
      .then((state) => setWebPermission(state))
      .catch(() => undefined)

  const test = () => {
    sounds.play(settings.sounds.agent())
    void platform.notify(
      language.t("settings.notifications.test.title"),
      language.t("settings.notifications.test.description"),
      undefined,
      { force: true },
    )
  }

  return (
    <div class="settings-v2-tab settings-v2-notifications">
      <div class="settings-v2-tab-header settings-v2-hub-header">
        <div class="settings-v2-hub-hero">
          <span class="settings-v2-hub-icon" aria-hidden="true">
            <BellGlyph />
          </span>
          <div class="settings-v2-hub-copy">
            <h2 class="settings-v2-tab-title">{language.t("settings.tab.notifications")}</h2>
            <p class="settings-v2-tab-description">{language.t("settings.notifications.page.description")}</p>
          </div>
        </div>
      </div>

      <div class="settings-v2-tab-body settings-v2-kit-page">
        <div class="settings-v2-kit-hero" data-active={settings.sounds.muted() ? undefined : ""}>
          <span class="settings-v2-kit-hero-icon" aria-hidden="true">
            <BellGlyph />
          </span>
          <div class="settings-v2-kit-hero-copy">
            <span class="settings-v2-kit-hero-title">
              {language.t("settings.notifications.system.title")}
              <span class="settings-v2-kit-pill" data-tone={settings.sounds.muted() ? undefined : permissionState().tone}>
                {settings.sounds.muted() ? language.t("settings.notifications.muted") : permissionState().label}
              </span>
            </span>
            <span class="settings-v2-kit-hero-description">{language.t("settings.notifications.system.description")}</span>
          </div>
          <div class="settings-v2-kit-actions">
            <Show when={!desktop() && webPermission() === "default"}>
              <ButtonV2 size="small" variant="contrast" onClick={requestPermission}>
                {language.t("settings.notifications.system.allow")}
              </ButtonV2>
            </Show>
            <ButtonV2 size="small" variant="outline" data-action="settings-notifications-test" onClick={test}>
              {language.t("settings.notifications.test")}
            </ButtonV2>
          </div>
        </div>

        <SettingsListV2 density="compact">
          <SettingsRowV2 title={language.t("settings.notifications.mute")} description={language.t("settings.notifications.mute.description")}>
            <div data-action="settings-notifications-mute">
              <Switch checked={settings.sounds.muted()} onChange={(value) => settings.sounds.setMuted(value)} hideLabel>
                {language.t("settings.notifications.mute")}
              </Switch>
            </div>
          </SettingsRowV2>
          <SettingsRowV2 title={language.t("settings.notifications.volume")} description={language.t("settings.notifications.volume.description")}>
            <SegmentedControlV2
              class="settings-v2-kit-segmented"
              data-action="settings-notifications-volume"
              value={String(settings.sounds.volume())}
              onChange={(value) => {
                if (!value) return
                settings.sounds.setVolume(Number(value))
                sounds.play(settings.sounds.agent())
              }}
              aria-label={language.t("settings.notifications.volume")}
            >
              <For each={VOLUMES}>
                {(volume) => <SegmentedControlItemV2 value={String(volume)}>{Math.round(volume * 100)} %</SegmentedControlItemV2>}
              </For>
            </SegmentedControlV2>
          </SettingsRowV2>
          <SettingsRowV2
            title={language.t("settings.notifications.background")}
            description={language.t("settings.notifications.background.description")}
          >
            <Switch checked={settings.sounds.backgroundOnly()} onChange={(value) => settings.sounds.setBackgroundOnly(value)} hideLabel>
              {language.t("settings.notifications.background")}
            </Switch>
          </SettingsRowV2>
        </SettingsListV2>

        <div class="settings-v2-kit-section">
          <p class="settings-v2-kit-label">{language.t("settings.notifications.events")}</p>
          <div class="settings-v2-kit-card settings-v2-notifications-events">
            <div class="settings-v2-notifications-head" aria-hidden="true">
              <span>{language.t("settings.notifications.events.event")}</span>
              <span>{language.t("settings.notifications.events.system")}</span>
              <span>{language.t("settings.notifications.events.sound")}</span>
            </div>
            <For each={EVENTS}>
              {(event) => (
                <div class="settings-v2-notifications-event" data-action={`settings-notifications-${event.channel}`}>
                  <span class="settings-v2-kit-card-icon" aria-hidden="true">
                    <Icon name={event.icon} size="small" />
                  </span>
                  <div class="settings-v2-kit-card-copy">
                    <span class="settings-v2-kit-card-title">{language.t(`settings.notifications.event.${event.channel}`)}</span>
                    <span class="settings-v2-kit-card-description">
                      {event.channel === "permissions" && permission.isGlobalAutoAccepting()
                        ? language.t("settings.notifications.event.permissions.autoAccept")
                        : language.t(`settings.notifications.event.${event.channel}.description`)}
                    </span>
                  </div>
                  <Switch
                    checked={system[event.channel].checked()}
                    onChange={(checked) => system[event.channel].set(checked)}
                    hideLabel
                  >
                    {language.t("settings.notifications.events.systemFor", {
                      event: language.t(`settings.notifications.event.${event.channel}`),
                    })}
                  </Switch>
                  <div class="settings-v2-notifications-sound" data-action={`settings-sounds-${event.channel}`}>
                    <SelectV2
                      appearance="inline"
                      options={soundOptions}
                      current={sounds[event.channel].current()}
                      value={(option) => option.id}
                      label={(option) => language.t(option.label)}
                      onSelect={sounds[event.channel].select}
                      placement="bottom-end"
                      gutter={6}
                    />
                    <ButtonV2
                      size="small"
                      variant="ghost"
                      disabled={sounds[event.channel].current().id === "none"}
                      aria-label={language.t("settings.notifications.play")}
                      title={language.t("settings.notifications.play")}
                      onClick={() => sounds.play(sounds[event.channel].current().id)}
                    >
                      ▶
                    </ButtonV2>
                  </div>
                </div>
              )}
            </For>
          </div>
        </div>

        <div class="settings-v2-kit-cards">
          <div class="settings-v2-kit-card">
            <div class="settings-v2-kit-card-head">
              <span class="settings-v2-kit-card-icon" aria-hidden="true">
                <Icon name="glasses" size="small" />
              </span>
              <div class="settings-v2-kit-card-copy">
                <span class="settings-v2-kit-card-title">
                  {language.t("settings.intelligence.smartAlerts")}{" "}
                  <span class="settings-v2-kit-pill" data-tone={decision()?.state === "ready" ? "ok" : undefined}>
                    {language.t(decision()?.state === "ready" ? "settings.notifications.smart.ready" : "settings.notifications.smart.missing")}
                  </span>
                </span>
                <span class="settings-v2-kit-card-description">{language.t("settings.notifications.smart.description")}</span>
              </div>
            </div>
            <div class="settings-v2-kit-card-foot">
              <ButtonV2 size="small" variant="outline" onClick={() => goToSettings("decisions")}>
                {language.t("settings.notifications.smart.open")}
              </ButtonV2>
            </div>
          </div>

          <div class="settings-v2-kit-card">
            <div class="settings-v2-kit-card-head">
              <span class="settings-v2-kit-card-icon" aria-hidden="true">
                <Icon name="share" size="small" />
              </span>
              <div class="settings-v2-kit-card-copy">
                <span class="settings-v2-kit-card-title">{language.t("settings.notifications.remote.title")}</span>
                <span class="settings-v2-kit-card-description">{language.t("settings.notifications.remote.description")}</span>
              </div>
            </div>
            <div class="settings-v2-kit-chips">
              <For
                each={gateways() ?? []}
                fallback={<span class="settings-v2-kit-card-description">{language.t("settings.notifications.remote.none")}</span>}
              >
                {(gateway) => (
                  <span class="settings-v2-kit-chip">
                    {language.t(`settings.notifications.remote.${gateway.provider}`)}
                  </span>
                )}
              </For>
            </div>
            <div class="settings-v2-kit-card-foot">
              <ButtonV2 size="small" variant="outline" onClick={() => goToSettings("gateways")}>
                {language.t("settings.notifications.remote.open")}
              </ButtonV2>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
