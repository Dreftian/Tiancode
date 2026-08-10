import { ButtonV2 } from "@tiancode-ai/ui/v2/button-v2"
import { SegmentedControlItemV2, SegmentedControlV2 } from "@tiancode-ai/ui/v2/segmented-control-v2"
import { Switch } from "@tiancode-ai/ui/v2/switch-v2"
import { TextInputV2 } from "@tiancode-ai/ui/v2/text-input-v2"
import type { Config } from "@tiancode-ai/sdk/v2/client"
import { type Component, createEffect, createMemo, createResource, createSignal, For, Show } from "solid-js"
import { useFile } from "@/context/file"
import { useLanguage } from "@/context/language"
import { useLayout } from "@/context/layout"
import { useServerSDK } from "@/context/server-sdk"
import { useSessionLayout } from "@/pages/session/session-layout"
import { showToast } from "@/utils/toast"
import { SettingsListV2 } from "./parts/list"
import { SettingsRowV2 } from "./parts/row"
import {
  displayName,
  pluginEnabled,
  pluginName,
  pluginOptions,
  pluginOrigin,
  pluginVersion,
  samePlugin,
  type PluginEntry,
} from "./plugins-origin"
import "./plugins.css"

// Hooks conocidos del runtime v1 (backend/plugin/src/index.ts). Los chips de
// la tarjeta se extraen del archivo del plugin local con una regex conservadora.
const KNOWN_HOOKS = [
  "dispose",
  "event",
  "config",
  "tool",
  "auth",
  "provider",
  "chat.message",
  "chat.params",
  "chat.headers",
  "permission.ask",
  "command.execute.before",
  "tool.execute.before",
  "shell.env",
  "tool.execute.after",
  "tool.definition",
  "experimental.chat.messages.transform",
  "experimental.chat.system.transform",
  "experimental.provider.small_model",
  "experimental.session.compacting",
  "experimental.compaction.autocontinue",
  "experimental.text.complete",
]
const HOOK_RE = /["']?([a-z][a-zA-Z0-9_.-]*)["']?\s*:\s*(?:async\s*)?\(/g

const extractHooks = (source: string): string[] => {
  const found = new Set<string>()
  for (const match of source.matchAll(HOOK_RE)) {
    const name = match[1]
    if (KNOWN_HOOKS.includes(name)) found.add(name)
  }
  return [...found].sort()
}

// Catálogo "Descubrir": paquetes npm verificados (opencode-*) y los plugins de
// ejemplo locales del repositorio (.tiancode/plugins).
type CatalogEntry = { id: string; kind: "npm" | "local"; spec: string }

const CatalogNpm: CatalogEntry[] = [
  { id: "wakatime", kind: "npm", spec: "opencode-wakatime" },
  { id: "langfuse", kind: "npm", spec: "@langfuse/opencode-observability-plugin" },
  { id: "litellm", kind: "npm", spec: "opencode-plugin-litellm" },
  { id: "claudeAuth", kind: "npm", spec: "opencode-claude-auth" },
  { id: "supermemory", kind: "npm", spec: "opencode-supermemory" },
  { id: "mastra", kind: "npm", spec: "@mastra/opencode" },
]

const CatalogLocal: CatalogEntry[] = [
  { id: "envGuard", kind: "local", spec: ".tiancode/plugins/env-guard.ts" },
  { id: "commitHelper", kind: "local", spec: ".tiancode/plugins/commit-helper.ts" },
  { id: "notifyIdle", kind: "local", spec: ".tiancode/plugins/notify-idle.ts" },
  { id: "shellEnv", kind: "local", spec: ".tiancode/plugins/shell-env.ts" },
  { id: "permissionGuard", kind: "local", spec: ".tiancode/plugins/permission-guard.ts" },
]

const PluginTemplate = `// my-plugin.ts — Tiancode plugin template
// Los plugins corren en el proceso del agente y reaccionan a eventos del ciclo
// de vida. El export por defecto debe ser un objeto PluginModule con
// "id" y "server(input) => Promise<Hooks>" (ver .tiancode/plugins/*.ts).

export const MyPlugin = {
  id: "my-plugin",

  server: async (input) => ({
    // Corre antes de cada ejecución de herramienta. Protege archivos .env.
    "tool.execute.before": async (toolInput, output) => {
      if (toolInput.tool === "edit" && output.args?.filePath?.endsWith(".env")) {
        return { deny: true, reason: ".env files are protected by my-plugin" }
      }
      return output
    },

    // Inyecta variables de entorno en los procesos de la herramienta shell.
    shell: {
      env: async (env) => ({
        ...env,
        MY_PLUGIN_ENABLED: "1",
      }),
    },
  }),
}

export default MyPlugin
`

type OriginFilter = "all" | "npm" | "local"

export const SettingsPluginsV2: Component<{
  directory?: string
}> = (props) => {
  const language = useLanguage()
  const serverSdk = useServerSDK()
  // El diálogo de ajustes puede abrirse fuera del FileProvider (p. ej. desde la
  // home o sin sesión activa), donde no hay editor de workspace. El contexto de
  // archivo es opcional: solo se usa al abrir el plugin recién creado en el
  // editor; sin él, el alta sigue funcionando y el toast indica la ruta.
  let file: ReturnType<typeof useFile> | undefined
  try {
    file = useFile()
  } catch {
    file = undefined
  }
  const layout = useLayout()
  const { workspaceKey } = useSessionLayout()
  const [value, setValue] = createSignal("")
  const [query, setQuery] = createSignal("")
  const [origin, setOrigin] = createSignal<OriginFilter>("all")
  const [catalogQuery, setCatalogQuery] = createSignal("")
  const [creating, setCreating] = createSignal(false)

  const params = () => (props.directory ? { directory: props.directory } : undefined)

  const [config, { refetch }] = createResource(
    () => serverSdk().client.config.get(params()),
    (request) => request.then((x) => x.data),
    { initialValue: undefined as Config | undefined },
  )

  const pluginList = createMemo(() => (config()?.plugin ?? []) as PluginEntry[])

  // Hooks de los plugins locales: se leen sus archivos una vez y se extraen los
  // nombres de hook conocidos (regex sobre el fuente).
  const localSpecs = createMemo(() => pluginList().filter((entry) => pluginOrigin(entry) === "local").map(pluginName))
  const [hooksBySpec, { refetch: refetchHooks }] = createResource(
    localSpecs,
    async (specs) => {
      const out: Record<string, string[]> = {}
      await Promise.all(
        specs.map(async (spec) => {
          try {
            const result = await serverSdk().client.file.read({ ...params(), path: spec })
            out[spec] = extractHooks(result.data?.content ?? "")
          } catch {
            out[spec] = []
          }
        }),
      )
      return out
    },
    { initialValue: {} as Record<string, string[]> },
  )
  createEffect(() => void localSpecs())

  // El alta dispara el reinicio de la instancia (disposal+reload); el refetch
  // inmediato vería la config vieja, así que se reintenta tras el reinicio.
  const refetchAfterReload = () => {
    void refetch()
    void refetchHooks()
    setTimeout(() => void refetch(), 2000)
  }

  const visiblePlugins = createMemo(() => {
    const needle = query().trim().toLowerCase()
    return pluginList().filter((entry) => {
      if (origin() !== "all" && pluginOrigin(entry) !== origin()) return false
      if (!needle) return true
      return displayName(entry).toLowerCase().includes(needle) || pluginName(entry).toLowerCase().includes(needle)
    })
  })

  const catalogMatches = (entry: CatalogEntry) => {
    const needle = catalogQuery().trim().toLowerCase()
    if (!needle) return true
    return (
      entry.spec.toLowerCase().includes(needle) ||
      language.t(`settings.plugins.catalog.${entry.kind}.${entry.id}.name`).toLowerCase().includes(needle)
    )
  }

  const isInstalled = (spec: string) => pluginList().some((entry) => samePlugin(pluginName(entry), spec))

  const addEntry = async (entry: string) => {
    if (!entry) return
    try {
      await serverSdk().client.config.update({
        ...params(),
        config: { plugin: [...pluginList(), entry] },
      })
      showToast({ variant: "success", title: language.t("settings.plugins.add.success") })
      refetchAfterReload()
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

  // Habilitar/deshabilitar conservando la entry en config: desactivado se
  // guarda como [spec, { enabled: false }] y el runtime lo omite al cargar.
  const toggleEnabled = async (entry: PluginEntry, enabled: boolean) => {
    const name = pluginName(entry)
    const next: PluginEntry = enabled
      ? (() => {
          const options = pluginOptions(entry)
          if (!options) return name
          const { enabled: _ignored, ...rest } = options
          return Object.keys(rest).length === 0 ? name : [name, rest]
        })()
      : [name, { ...(pluginOptions(entry) ?? {}), enabled: false }]
    try {
      await serverSdk().client.config.update({
        ...params(),
        config: { plugin: pluginList().map((item) => (pluginName(item) === name ? next : item)) },
      })
      showToast({
        variant: "success",
        title: enabled
          ? language.t("settings.plugins.toggle.enabled", { name: displayName(entry) })
          : language.t("settings.plugins.toggle.disabled", { name: displayName(entry) }),
      })
      refetchAfterReload()
    } catch {
      showToast({ variant: "error", title: language.t("settings.plugins.add.failed") })
    }
  }

  const removePlugin = async (entry: PluginEntry) => {
    const name = pluginName(entry)
    if (!window.confirm(language.t("settings.plugins.remove.confirm", { name: displayName(entry) }))) return
    try {
      await serverSdk().client.config.update({
        ...params(),
        config: { plugin: pluginList().filter((item) => pluginName(item) !== name) },
      })
      showToast({ variant: "success", title: language.t("settings.plugins.remove.success") })
      refetchAfterReload()
    } catch {
      showToast({ variant: "error", title: language.t("settings.plugins.remove.failed") })
    }
  }

  const addCatalog = async (entry: CatalogEntry) => {
    if (isInstalled(entry.spec)) return
    await addEntry(entry.spec)
  }

  // Crea el esqueleto en .tiancode/plugins/ del workspace (endpoint fs.write)
  // con nombre único y lo abre en el editor si hay sesión/workspace activo.
  const createPluginFile = async () => {
    if (creating() || !props.directory) return
    setCreating(true)
    try {
      let path = ".tiancode/plugins/my-plugin.ts"
      for (let attempt = 2; attempt <= 20; attempt++) {
        try {
          await serverSdk().client.file.read({ ...params(), path })
          path = `.tiancode/plugins/my-plugin-${attempt}.ts`
        } catch {
          break // no existe: nombre libre
        }
      }
      await serverSdk().client.file.write({ ...params(), path, content: PluginTemplate })
      showToast({ variant: "success", title: language.t("settings.plugins.create.success", { path }) })
      openInEditor(path)
    } catch {
      showToast({ variant: "error", title: language.t("settings.plugins.create.failed") })
    } finally {
      setCreating(false)
    }
  }

  // Abre el archivo en el editor del workspace (tabs del workspace, como el
  // file opener del command palette); si el contexto no está disponible, el
  // toast de creación ya indica la ruta.
  const openInEditor = (path: string) => {
    if (!file) return
    try {
      const value = file.tab(path)
      const tabs = layout.tabs(workspaceKey())
      tabs.open(value)
      void file.load(path)
      layout.fileTree.setTab("all")
      tabs.setActive(value)
    } catch {
      showToast({ variant: "default", title: language.t("settings.plugins.create.openFailed", { path }) })
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
          <div class="settings-v2-plugins-list-toolbar">
            <h3 class="settings-v2-section-title">{language.t("settings.plugins.section.installed")}</h3>
            <div class="settings-v2-plugins-list-controls">
              <TextInputV2
                type="text"
                appearance="base"
                value={query()}
                onInput={(event) => setQuery(event.currentTarget.value)}
                placeholder={language.t("settings.plugins.search.placeholder")}
                showClearButton={query().length > 0}
                onClearClick={() => setQuery("")}
                spellcheck={false}
                aria-label={language.t("settings.plugins.search.placeholder")}
              />
              <SegmentedControlV2
                class="settings-v2-plugins-filter"
                value={origin()}
                onChange={(value) => setOrigin((value ?? "all") as OriginFilter)}
              >
                <For each={[{ id: "all" }, { id: "npm" }, { id: "local" }]}>
                  {(option) => (
                    <SegmentedControlItemV2 value={option.id}>
                      {language.t(`settings.plugins.filter.${option.id}`)}
                    </SegmentedControlItemV2>
                  )}
                </For>
              </SegmentedControlV2>
            </div>
          </div>
          <Show
            when={visiblePlugins().length > 0}
            fallback={<div class="settings-v2-skills-status">{language.t("settings.plugins.empty")}</div>}
          >
            <SettingsListV2>
              <For each={visiblePlugins()}>
                {(entry) => {
                  const name = pluginName(entry)
                  const enabled = pluginEnabled(entry)
                  const version = pluginVersion(entry)
                  const hooks = hooksBySpec()?.[name]
                  return (
                    <div class="settings-v2-plugins-item" data-disabled={enabled ? undefined : ""}>
                      <div class="settings-v2-plugins-item-copy">
                        <div class="settings-v2-plugins-item-name-row">
                          <span class="settings-v2-plugins-item-name">{displayName(entry)}</span>
                          <span class="settings-v2-plugins-chip">
                            {pluginOrigin(entry) === "npm"
                              ? language.t("settings.plugins.origin.npm")
                              : language.t("settings.plugins.origin.local")}
                          </span>
                          <Show when={version}>
                            <span class="settings-v2-plugins-chip">
                              {language.t("settings.plugins.version", { version: version! })}
                            </span>
                          </Show>
                          <Show when={!enabled}>
                            <span class="settings-v2-plugins-chip" data-variant="disabled">
                              {language.t("settings.plugins.status.disabled")}
                            </span>
                          </Show>
                        </div>
                        <Show when={displayName(entry) !== name}>
                          <div class="settings-v2-plugins-item-description">{name}</div>
                        </Show>
                        <Show when={hooks && hooks.length > 0}>
                          <div class="settings-v2-plugins-hooks">
                            <span class="settings-v2-plugins-hooks-label">
                              {language.t("settings.plugins.hooks.title")}
                            </span>
                            <For each={hooks}>
                              {(hook) => <span class="settings-v2-plugins-hook">{hook}</span>}
                            </For>
                          </div>
                        </Show>
                      </div>
                      <div class="settings-v2-plugins-item-actions">
                        <Switch
                          checked={enabled}
                          onChange={(next) => void toggleEnabled(entry, next)}
                          hideLabel
                        >
                          {displayName(entry)}
                        </Switch>
                        <ButtonV2
                          type="button"
                          variant="danger"
                          size="small"
                          onClick={() => void removePlugin(entry)}
                        >
                          {language.t("settings.plugins.remove")}
                        </ButtonV2>
                      </div>
                    </div>
                  )
                }}
              </For>
            </SettingsListV2>
          </Show>
        </div>

        <div class="settings-v2-section settings-v2-plugins-catalog">
          <div class="settings-v2-plugins-catalog-header">
            <h3 class="settings-v2-section-title">{language.t("settings.plugins.catalog.title")}</h3>
            <TextInputV2
              type="text"
              appearance="base"
              value={catalogQuery()}
              onInput={(event) => setCatalogQuery(event.currentTarget.value)}
              placeholder={language.t("settings.plugins.search.placeholder")}
              showClearButton={catalogQuery().length > 0}
              onClearClick={() => setCatalogQuery("")}
              spellcheck={false}
              aria-label={language.t("settings.plugins.search.placeholder")}
            />
          </div>
          <p class="settings-v2-plugins-catalog-description">
            {language.t("settings.plugins.catalog.npm.description")}
          </p>

          <div class="settings-v2-plugins-catalog-subtitle">
            {language.t("settings.plugins.catalog.npm.title")}
          </div>
          <SettingsListV2>
            <For each={CatalogNpm.filter(catalogMatches)}>
              {(entry) => {
                const installed = isInstalled(entry.spec)
                return (
                  <div class="settings-v2-plugins-item">
                    <div class="settings-v2-plugins-item-copy">
                      <div class="settings-v2-plugins-item-name-row">
                        <span class="settings-v2-plugins-item-name">
                          {language.t(`settings.plugins.catalog.npm.${entry.id}.name`)}
                        </span>
                        <span class="settings-v2-plugins-chip">
                          {language.t("settings.plugins.origin.npm")}
                        </span>
                      </div>
                      <div class="settings-v2-plugins-item-description">
                        {language.t(`settings.plugins.catalog.npm.${entry.id}.description`)}
                      </div>
                      <div class="settings-v2-plugins-catalog-note">{entry.spec}</div>
                    </div>
                    <Show
                      when={installed}
                      fallback={
                        <ButtonV2 type="button" variant="contrast" size="small" onClick={() => void addCatalog(entry)}>
                          {language.t("settings.plugins.catalog.add")}
                        </ButtonV2>
                      }
                    >
                      <span class="settings-v2-plugins-badge">
                        {language.t("settings.plugins.catalog.installed")}
                      </span>
                    </Show>
                  </div>
                )
              }}
            </For>
            <Show when={CatalogNpm.filter(catalogMatches).length === 0}>
              <div class="settings-v2-skills-status">{language.t("settings.plugins.catalog.empty")}</div>
            </Show>
          </SettingsListV2>

          <div class="settings-v2-plugins-catalog-subtitle">
            {language.t("settings.plugins.catalog.local.title")}
          </div>
          <SettingsListV2>
            <For each={CatalogLocal.filter(catalogMatches)}>
              {(entry) => {
                const installed = isInstalled(entry.spec)
                return (
                  <div class="settings-v2-plugins-item">
                    <div class="settings-v2-plugins-item-copy">
                      <div class="settings-v2-plugins-item-name-row">
                        <span class="settings-v2-plugins-item-name">
                          {language.t(`settings.plugins.catalog.local.${entry.id}.name`)}
                        </span>
                        <span class="settings-v2-plugins-chip">
                          {language.t("settings.plugins.origin.local")}
                        </span>
                      </div>
                      <div class="settings-v2-plugins-item-description">
                        {language.t(`settings.plugins.catalog.local.${entry.id}.description`)}
                      </div>
                      <div class="settings-v2-plugins-catalog-note">{entry.spec}</div>
                    </div>
                    <Show
                      when={installed}
                      fallback={
                        <ButtonV2 type="button" variant="contrast" size="small" onClick={() => void addCatalog(entry)}>
                          {language.t("settings.plugins.catalog.add")}
                        </ButtonV2>
                      }
                    >
                      <span class="settings-v2-plugins-badge">
                        {language.t("settings.plugins.catalog.installed")}
                      </span>
                    </Show>
                  </div>
                )
              }}
            </For>
            <Show when={CatalogLocal.filter(catalogMatches).length === 0}>
              <div class="settings-v2-skills-status">{language.t("settings.plugins.catalog.empty")}</div>
            </Show>
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
              <div class="settings-v2-plugins-template-actions">
                <ButtonV2 type="button" variant="outline" size="small" onClick={() => void copyTemplate()}>
                  {language.t("settings.plugins.template.copy")}
                </ButtonV2>
                <Show when={props.directory}>
                  <ButtonV2
                    type="button"
                    variant="contrast"
                    size="small"
                    disabled={creating()}
                    onClick={() => void createPluginFile()}
                  >
                    {creating()
                      ? language.t("settings.plugins.create.creating")
                      : language.t("settings.plugins.create.button")}
                  </ButtonV2>
                </Show>
              </div>
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
