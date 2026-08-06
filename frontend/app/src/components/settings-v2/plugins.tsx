import { ButtonV2 } from "@tiancode-ai/ui/v2/button-v2"
import { TextInputV2 } from "@tiancode-ai/ui/v2/text-input-v2"
import type { Config } from "@tiancode-ai/sdk/v2/client"
import { type Component, createResource, For, Show, createSignal, createMemo } from "solid-js"
import { useLanguage } from "@/context/language"
import { useServerSDK } from "@/context/server-sdk"
import { showToast } from "@/utils/toast"
import { SettingsListV2 } from "./parts/list"
import { SettingsRowV2 } from "./parts/row"
import "./plugins.css"

type PluginEntry = string | [string, { [key: string]: unknown }]

const pluginName = (entry: PluginEntry) => (typeof entry === "string" ? entry : entry[0])

const pluginOrigin = (entry: PluginEntry) =>
  pluginName(entry).startsWith("@") || pluginName(entry).includes("/") ? "npm" : "local"

const NpmAppCatalog = [
  { name: "@biomejs/biome", descriptionKey: "settings.plugins.catalog.npm.biome.description" },
  { name: "@playwright/mcp", descriptionKey: "settings.plugins.catalog.npm.playwrightMcp.description" },
  { name: "@octokit/rest", descriptionKey: "settings.plugins.catalog.npm.octokitRest.description" },
  { name: "@slack/web-api", descriptionKey: "settings.plugins.catalog.npm.slackWebApi.description" },
  { name: "@notionhq/client", descriptionKey: "settings.plugins.catalog.npm.notionClient.description" },
  { name: "@sentry/cli", descriptionKey: "settings.plugins.catalog.npm.sentryCli.description" },
  { name: "agent-notify", descriptionKey: "settings.plugins.catalog.npm.agentNotify.description" },
  { name: "@chime-io/plugin-claude", descriptionKey: "settings.plugins.catalog.npm.chimeClaude.description" },
] as const

const LocalPluginCatalog = [
  { name: "env-guard", descriptionKey: "settings.plugins.catalog.local.envGuard.description" },
  { name: "commit-helper", descriptionKey: "settings.plugins.catalog.local.commitHelper.description" },
  { name: "notify-idle", descriptionKey: "settings.plugins.catalog.local.notifyIdle.description" },
  { name: "shell-env", descriptionKey: "settings.plugins.catalog.local.shellEnv.description" },
  { name: "permission-guard", descriptionKey: "settings.plugins.catalog.local.permissionGuard.description" },
] as const

type CatalogApp = (typeof NpmAppCatalog)[number] | (typeof LocalPluginCatalog)[number]

const localPluginSpec = (name: string) => `./plugins/${name}.ts`

const PluginTemplate = `// my-plugin.js — Tiancode plugin template
// Plugins run inside the agent process and react to lifecycle events.

export const MyPlugin = {
  name: "my-plugin",

  // Runs when the session becomes idle.
  session: {
    idle: async (session) => {
      console.log(\`[my-plugin] session \${session.id} is idle\`)
    },
  },

  // Runs before every tool execution. Protects .env files from edits.
  tool: {
    "execute.before": async (input) => {
      if (input.tool === "edit" && input.input?.filePath?.endsWith(".env")) {
        return { deny: true, reason: ".env files are protected by my-plugin" }
      }
      return input
    },
  },

  // Injects environment variables into shell tool processes.
  shell: {
    env: async (env) => ({
      ...env,
      MY_PLUGIN_ENABLED: "1",
    }),
  },
}

export default MyPlugin
`

const CatalogRow: Component<{
  app: CatalogApp
  origin: "npm" | "local"
  installed: boolean
  onAdd: () => void
}> = (props) => {
  const language = useLanguage()
  return (
    <div class="settings-v2-plugins-item">
      <div class="settings-v2-plugins-item-copy">
        <div class="settings-v2-plugins-item-name">{props.app.name}</div>
        <div class="settings-v2-plugins-item-description">{language.t(props.app.descriptionKey)}</div>
      </div>
      <span class="settings-v2-plugins-chip">
        {props.origin === "npm"
          ? language.t("settings.plugins.origin.npm")
          : language.t("settings.plugins.origin.local")}
      </span>
      <Show
        when={props.installed}
        fallback={
          <ButtonV2 type="button" variant="outline" size="small" onClick={props.onAdd}>
            {language.t("settings.plugins.catalog.add")}
          </ButtonV2>
        }
      >
        <span class="settings-v2-plugins-badge">{language.t("settings.plugins.catalog.installed")}</span>
      </Show>
    </div>
  )
}

export const SettingsPluginsV2: Component<{
  directory?: string
}> = (props) => {
  const language = useLanguage()
  const serverSdk = useServerSDK()
  const [value, setValue] = createSignal("")

  const params = () => (props.directory ? { directory: props.directory } : undefined)

  const [config, { refetch }] = createResource(
    () => serverSdk().client.config.get(params()),
    (request) => request.then((x) => x.data),
    { initialValue: undefined as Config | undefined },
  )

  const pluginList = createMemo(() => (config()?.plugin ?? []) as PluginEntry[])

  const isInstalled = (spec: string) => pluginList().some((item) => pluginName(item) === spec)

  const addEntry = async (entry: string) => {
    if (!entry) return
    try {
      await serverSdk().client.config.update({
        ...params(),
        config: { plugin: [...(config()?.plugin ?? []), entry] },
      })
      showToast({ variant: "success", title: language.t("settings.plugins.add.success") })
      void refetch()
    } catch {
      showToast({ variant: "error", title: language.t("settings.plugins.add.failed") })
    }
  }

  const addPlugin = async () => {
    const entry = value().trim()
    if (!entry) return
    await addEntry(entry)
    setValue("")
  }

  const removePlugin = async (entry: PluginEntry) => {
    const name = pluginName(entry)
    if (!window.confirm(language.t("settings.plugins.remove.confirm", { name }))) return
    try {
      await serverSdk().client.config.update({
        ...params(),
        config: { plugin: pluginList().filter((item) => pluginName(item) !== name) },
      })
      showToast({ variant: "success", title: language.t("settings.plugins.remove.success") })
      void refetch()
    } catch {
      showToast({ variant: "error", title: language.t("settings.plugins.remove.failed") })
    }
  }

  const copyTemplate = async () => {
    try {
      await navigator.clipboard.writeText(PluginTemplate)
      showToast({ variant: "success", title: language.t("settings.plugins.template.copied") })
    } catch {
      showToast({ variant: "error", title: language.t("settings.plugins.add.failed") })
    }
  }

  return (
    <>
      <div class="settings-v2-tab-header settings-v2-tab-header--stacked">
        <h2 class="settings-v2-tab-title">{language.t("settings.plugins.title")}</h2>
        <p class="settings-v2-tab-description">{language.t("settings.plugins.description")}</p>
      </div>

      <div class="settings-v2-tab-body settings-v2-plugins">
        <div class="settings-v2-plugins-note">
          <span class="settings-v2-plugins-note-title">{language.t("settings.plugins.note.title")}</span>
          <span class="settings-v2-plugins-note-description">{language.t("settings.plugins.note.description")}</span>
        </div>

        <div class="settings-v2-section">
          <h3 class="settings-v2-section-title">{language.t("settings.plugins.section.installed")}</h3>
          <Show
            when={pluginList().length > 0}
            fallback={<div class="settings-v2-skills-status">{language.t("settings.plugins.empty")}</div>}
          >
            <SettingsListV2>
              <For each={pluginList()}>
                {(entry) => (
                  <div class="settings-v2-plugins-item">
                    <div class="settings-v2-plugins-item-copy">
                      <div class="settings-v2-plugins-item-name">{pluginName(entry)}</div>
                    </div>
                    <span class="settings-v2-plugins-chip">
                      {pluginOrigin(entry) === "npm"
                        ? language.t("settings.plugins.origin.npm")
                        : language.t("settings.plugins.origin.local")}
                    </span>
                    <ButtonV2
                      type="button"
                      variant="danger"
                      size="small"
                      onClick={() => void removePlugin(entry)}
                    >
                      {language.t("settings.plugins.remove")}
                    </ButtonV2>
                  </div>
                )}
              </For>
            </SettingsListV2>
          </Show>
        </div>

        <div class="settings-v2-section">
          <h3 class="settings-v2-section-title">{language.t("settings.plugins.catalog.npm.title")}</h3>
          <p class="settings-v2-plugins-catalog-description">
            {language.t("settings.plugins.catalog.npm.description")}
          </p>
          <SettingsListV2>
            <For each={NpmAppCatalog}>
              {(app) => (
                <CatalogRow app={app} origin="npm" installed={isInstalled(app.name)} onAdd={() => void addEntry(app.name)} />
              )}
            </For>
          </SettingsListV2>
          <p class="settings-v2-plugins-catalog-note">{language.t("settings.plugins.catalog.npm.note")}</p>
        </div>

        <div class="settings-v2-section">
          <h3 class="settings-v2-section-title">{language.t("settings.plugins.catalog.local.title")}</h3>
          <p class="settings-v2-plugins-catalog-description">
            {language.t("settings.plugins.catalog.local.description")}
          </p>
          <SettingsListV2>
            <For each={LocalPluginCatalog}>
              {(app) => (
                <CatalogRow
                  app={app}
                  origin="local"
                  installed={isInstalled(localPluginSpec(app.name))}
                  onAdd={() => void addEntry(localPluginSpec(app.name))}
                />
              )}
            </For>
          </SettingsListV2>
        </div>

        <div class="settings-v2-section">
          <h3 class="settings-v2-section-title">{language.t("settings.plugins.section.add")}</h3>
          <SettingsListV2>
            <SettingsRowV2 title={language.t("settings.plugins.add.label")} description="">
              <div class="settings-v2-plugins-add">
                <TextInputV2
                  type="text"
                  appearance="base"
                  value={value()}
                  onInput={(event) => setValue(event.currentTarget.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") void addPlugin()
                  }}
                  placeholder={language.t("settings.plugins.add.placeholder")}
                  spellcheck={false}
                  autocomplete="off"
                  aria-label={language.t("settings.plugins.add.label")}
                />
                <ButtonV2 type="button" variant="contrast" size="small" disabled={!value().trim()} onClick={() => void addPlugin()}>
                  {language.t("settings.plugins.add.button")}
                </ButtonV2>
              </div>
            </SettingsRowV2>
          </SettingsListV2>
        </div>

        <div class="settings-v2-section">
          <div class="settings-v2-plugins-template">
            <div class="settings-v2-plugins-template-header">
              <div class="settings-v2-plugins-template-copy">
                <span class="settings-v2-plugins-template-title">{language.t("settings.plugins.template.title")}</span>
                <span class="settings-v2-plugins-template-description">
                  {language.t("settings.plugins.template.description")}
                </span>
              </div>
              <ButtonV2 type="button" variant="outline" size="small" onClick={() => void copyTemplate()}>
                {language.t("settings.plugins.template.copy")}
              </ButtonV2>
            </div>
            <div class="settings-v2-plugins-template-body">
              <pre>{PluginTemplate}</pre>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
