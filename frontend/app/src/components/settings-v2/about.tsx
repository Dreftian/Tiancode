import { Show, type Component } from "solid-js"
import { ButtonV2 } from "@tiancode-ai/ui/v2/button-v2"
import { Mark } from "@tiancode-ai/ui/logo"
import { useLanguage } from "@/context/language"
import { usePlatform } from "@/context/platform"
import { useUpdaterAction } from "../updater-action"
import "./settings-v2.css"

const REPOSITORY_URL = "https://github.com/Dreftian/Tiancode"
const WEBSITE_URL = "https://tiancode.vercel.app"
const UPSTREAM_URL = "https://github.com/anomalyco/opencode"
const LICENSE_URL = "https://github.com/Dreftian/Tiancode/blob/dev/LICENSE"

/** Settings → About: version, license and attribution. */
export const SettingsAboutV2: Component<{ active?: boolean }> = () => {
  const language = useLanguage()
  const platform = usePlatform()
  const updater = useUpdaterAction()
  const channel = import.meta.env.VITE_TIANCODE_CHANNEL
  const link = (url: string, label: string) => (
    <a
      href={url}
      class="text-v2-text-text-base underline underline-offset-2 hover:text-v2-text-text-accent"
      onClick={(event) => {
        event.preventDefault()
        platform.openExternal(url)
      }}
    >
      {label}
    </a>
  )

  return (
    <div class="settings-v2-tab-body" data-component="settings-about">
      <div class="mx-auto flex max-w-[520px] flex-col items-center gap-3 py-10 text-center">
        <Mark class="w-24 text-v2-text-text-base" />
        <div class="text-16-medium text-v2-text-text-base">{language.t("app.name.desktop")}</div>
        <div class="text-13-regular text-v2-text-text-muted">
          {platform.version
            ? language.t("settings.about.version", { version: platform.version })
            : language.t("settings.about.development")}
          <Show when={channel && channel !== "prod"}>{` · ${channel}`}</Show>
        </div>
        <div class="text-13-regular text-v2-text-text-muted">
          {language.t("settings.about.license.before")}
          {link(LICENSE_URL, language.t("settings.about.license.link"))}
        </div>
        <Show when={platform.updater}>
          <ButtonV2
            variant="neutral"
            size="small"
            data-action="settings-about-check-updates"
            disabled={!updater.action().run}
            onClick={() => void updater.run()}
          >
            {language.t(updater.action().label)}
          </ButtonV2>
        </Show>
        <p class="mt-4 text-12-regular leading-5 text-v2-text-text-muted">
          {language.t("settings.about.basedOn.before")}
          {link(UPSTREAM_URL, "opencode")}
          {language.t("settings.about.basedOn.after")}
        </p>
        <div class="flex flex-wrap items-center justify-center gap-4 text-12-regular">
          {link(REPOSITORY_URL, language.t("settings.about.repository"))}
          {link(WEBSITE_URL, language.t("settings.about.website"))}
        </div>
      </div>
    </div>
  )
}
