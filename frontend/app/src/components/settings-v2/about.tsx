import { createMemo, createResource, For, Show, type Component } from "solid-js"
import { ButtonV2 } from "@tiancode-ai/ui/v2/button-v2"
import { Mark } from "@tiancode-ai/ui/logo"
import { useLanguage } from "@/context/language"
import { usePlatform } from "@/context/platform"
import { useServerSDK } from "@/context/server-sdk"
import { showToast } from "@/utils/toast"
import { useUpdaterAction } from "../updater-action"
import { SettingsListV2 } from "./parts/list"
import { SettingsRowV2 } from "./parts/row"
import "./settings-v2.css"

const REPOSITORY_URL = "https://github.com/Dreftian/Tiancode"
const WEBSITE_URL = "https://tiancode.vercel.app"
const UPSTREAM_URL = "https://github.com/anomalyco/opencode"
const LICENSE_URL = "https://github.com/Dreftian/Tiancode/blob/dev/LICENSE"

const OS_NAMES = { windows: "Windows", macos: "macOS", linux: "Linux" } as const

/** Settings → About: version and updates, the system Tiancode runs on, its folders and links. */
export const SettingsAboutV2: Component<{ active?: boolean }> = () => {
  const language = useLanguage()
  const platform = usePlatform()
  const serverSdk = useServerSDK()
  const updater = useUpdaterAction()
  const channel = import.meta.env.VITE_TIANCODE_CHANNEL
  const [info] = createResource(async () => (await platform.appInfo?.().catch(() => undefined)) ?? null)
  const [server] = createResource(async () =>
    serverSdk()
      .client.global.health()
      .then((result) => result.data?.version ?? null)
      .catch(() => null),
  )
  const [dataFolder] = createResource(async () => (await platform.dataFolder?.info().catch(() => undefined)) ?? null)

  const version = () => info()?.version ?? platform.version
  const channelLabel = () => {
    const value = info()?.channel ?? channel
    if (value === "beta") return language.t("settings.about.channel.beta")
    if (value === "dev") return language.t("settings.about.channel.dev")
    return language.t("settings.about.channel.prod")
  }
  const os = () => {
    const name = platform.os ? OS_NAMES[platform.os] : undefined
    const details = [info()?.osRelease, info()?.arch].filter(Boolean).join(" · ")
    return [name, details].filter(Boolean).join(" ")
  }

  const status = createMemo(() => {
    const state = platform.updater?.state()
    if (!state) return undefined
    switch (state.status) {
      case "checking":
        return { tone: "busy", text: language.t("settings.about.updates.status.checking") }
      case "downloading":
        return {
          tone: "busy",
          text: language.t("settings.about.updates.status.downloading", {
            version: state.version,
            percent: Math.round(state.percent ?? 0),
          }),
        }
      case "ready":
        return { tone: "ready", text: language.t("settings.about.updates.status.ready", { version: state.version }) }
      case "installing":
        return { tone: "busy", text: language.t("settings.about.updates.status.installing", { version: state.version }) }
      case "up-to-date":
        return { tone: "ok", text: language.t("settings.about.updates.status.upToDate") }
      case "error":
        return { tone: "error", text: language.t("settings.about.updates.status.error", { message: state.message }) }
      case "disabled":
        return { tone: "idle", text: language.t("settings.about.updates.status.disabled") }
      default:
        return { tone: "idle", text: language.t("settings.about.updates.status.idle") }
    }
  })

  const system = createMemo(() =>
    [
      { label: "Tiancode", value: version() },
      { label: language.t("settings.about.system.server"), value: server() ?? undefined },
      { label: language.t("settings.about.system.os"), value: os() || undefined },
      { label: "Electron", value: info()?.electron },
      { label: "Chromium", value: info()?.chrome },
      { label: "Node.js", value: info()?.node },
    ].filter((item): item is { label: string; value: string } => !!item.value),
  )

  const copySystem = () => {
    const edition = info()?.portable ? language.t("settings.about.edition.portable") : language.t("settings.about.edition.installer")
    const text = [
      `Tiancode ${version() ?? ""} (${channelLabel()}${info() ? ` · ${edition}` : ""})`,
      ...system()
        .slice(1)
        .map((item) => `${item.label}: ${item.value}`),
    ].join("\n")
    void navigator.clipboard
      .writeText(text)
      .then(() => showToast({ variant: "success", icon: "circle-check", title: language.t("settings.about.system.copied") }))
      .catch(() => showToast({ variant: "error", title: language.t("common.requestFailed") }))
  }

  const openFolder = (path: string) =>
    void platform.openPath?.(path).catch(() => showToast({ variant: "error", title: language.t("common.requestFailed") }))

  const exportLogs = () =>
    void platform.exportDebugLogs?.().catch(() => showToast({ variant: "error", title: language.t("common.requestFailed") }))

  const links = () => [
    { url: WEBSITE_URL, label: language.t("settings.about.website"), icon: "globe" },
    { url: REPOSITORY_URL, label: language.t("settings.about.repository"), icon: "branch" },
    {
      url: version() ? `${REPOSITORY_URL}/releases/tag/v${version()}` : `${REPOSITORY_URL}/releases`,
      label: language.t("settings.about.links.releaseNotes"),
      icon: "outline-square-arrow",
    },
    { url: `${REPOSITORY_URL}/issues/new`, label: language.t("settings.about.links.reportBug"), icon: "help" },
  ]

  const link = (url: string, label: string) => (
    <a
      href={url}
      class="settings-v2-about-inline-link"
      onClick={(event) => {
        event.preventDefault()
        platform.openExternal(url)
      }}
    >
      {label}
    </a>
  )

  return (
    <>
      <div class="settings-v2-tab-header">
        <h2 class="settings-v2-tab-title">{language.t("settings.tab.about")}</h2>
      </div>
      <div class="settings-v2-tab-body settings-v2-about" data-component="settings-about">
        <section class="settings-v2-about-hero">
          <div class="settings-v2-about-logo">
            <Mark class="w-14 text-v2-text-text-base" />
          </div>
          <div class="settings-v2-about-identity">
            <h3 class="settings-v2-about-name">{language.t("app.name.desktop")}</h3>
            <p class="settings-v2-about-tagline">{language.t("settings.about.tagline")}</p>
            <div class="settings-v2-about-tags">
              <span class="settings-v2-about-tag" data-tone="accent">
                {version()
                  ? language.t("settings.about.version", { version: version()! })
                  : language.t("settings.about.development")}
              </span>
              <span class="settings-v2-about-tag">{channelLabel()}</span>
              <Show when={info()}>
                {(value) => (
                  <span class="settings-v2-about-tag">
                    {value().portable
                      ? language.t("settings.about.edition.portable")
                      : language.t("settings.about.edition.installer")}
                  </span>
                )}
              </Show>
            </div>
          </div>
        </section>

        <Show when={platform.updater}>
          <div class="settings-v2-section">
            <h3 class="settings-v2-section-title">{language.t("settings.about.updates.title")}</h3>
            <SettingsListV2>
              <SettingsRowV2
                title={
                  <span class="settings-v2-about-status" data-tone={status()?.tone}>
                    <span class="settings-v2-about-status-dot" aria-hidden="true" />
                    {status()?.text}
                  </span>
                }
                description={language.t("settings.about.updates.description")}
              >
                <ButtonV2
                  variant={platform.updater?.state().status === "ready" ? "contrast" : "neutral"}
                  size="small"
                  data-action="settings-about-check-updates"
                  disabled={!updater.action().run}
                  onClick={() => void updater.run()}
                >
                  {language.t(updater.action().label)}
                </ButtonV2>
              </SettingsRowV2>
            </SettingsListV2>
          </div>
        </Show>

        <div class="settings-v2-section">
          <div class="settings-v2-about-section-head">
            <h3 class="settings-v2-section-title">{language.t("settings.about.system.title")}</h3>
            <ButtonV2 variant="ghost" size="small" icon="outline-copy" onClick={copySystem}>
              {language.t("settings.about.system.copy")}
            </ButtonV2>
          </div>
          <dl class="settings-v2-about-system">
            <For each={system()}>
              {(item) => (
                <div class="settings-v2-about-fact">
                  <dt>{item.label}</dt>
                  <dd>{item.value}</dd>
                </div>
              )}
            </For>
          </dl>
        </div>

        <Show when={platform.openPath && (dataFolder() || info())}>
          <div class="settings-v2-section">
            <h3 class="settings-v2-section-title">{language.t("settings.about.folders.title")}</h3>
            <SettingsListV2>
              <Show when={dataFolder()}>
                {(folder) => (
                  <SettingsRowV2
                    title={language.t("settings.about.folders.data")}
                    description={<span class="settings-v2-about-path" title={folder().path}>{folder().path}</span>}
                  >
                    <ButtonV2 variant="outline" size="small" onClick={() => openFolder(folder().path)}>
                      {language.t("settings.about.folders.open")}
                    </ButtonV2>
                  </SettingsRowV2>
                )}
              </Show>
              <Show when={info()?.logs}>
                {(logs) => (
                  <SettingsRowV2
                    title={language.t("settings.about.folders.logs")}
                    description={<span class="settings-v2-about-path" title={logs()}>{logs()}</span>}
                  >
                    <div class="settings-v2-about-actions">
                      <ButtonV2 variant="outline" size="small" onClick={() => openFolder(logs())}>
                        {language.t("settings.about.folders.open")}
                      </ButtonV2>
                      <Show when={platform.exportDebugLogs}>
                        <ButtonV2 variant="ghost" size="small" onClick={exportLogs}>
                          {language.t("settings.about.folders.exportLogs")}
                        </ButtonV2>
                      </Show>
                    </div>
                  </SettingsRowV2>
                )}
              </Show>
            </SettingsListV2>
          </div>
        </Show>

        <div class="settings-v2-section">
          <h3 class="settings-v2-section-title">{language.t("settings.about.links.title")}</h3>
          <div class="settings-v2-about-links">
            <For each={links()}>
              {(item) => (
                <ButtonV2 variant="outline" size="small" icon={item.icon} onClick={() => platform.openExternal(item.url)}>
                  {item.label}
                </ButtonV2>
              )}
            </For>
          </div>
        </div>

        <p class="settings-v2-about-credits">
          {language.t("settings.about.license.before")}
          {link(LICENSE_URL, language.t("settings.about.license.link"))}
          {". "}
          {language.t("settings.about.basedOn.before")}
          {link(UPSTREAM_URL, "opencode")}
          {language.t("settings.about.basedOn.after")}
        </p>
      </div>
    </>
  )
}
