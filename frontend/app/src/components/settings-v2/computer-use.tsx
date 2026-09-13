import {
  For,
  Show,
  createEffect,
  createMemo,
  createResource,
  createSignal,
  onCleanup,
  type Component,
  type JSX,
} from "solid-js"
import { ButtonV2 } from "@tiancode-ai/ui/v2/button-v2"
import { SelectV2 } from "@tiancode-ai/ui/v2/select-v2"
import { Switch } from "@tiancode-ai/ui/v2/switch-v2"
import { TextInputV2 } from "@tiancode-ai/ui/v2/text-input-v2"
import { SegmentedControlItemV2, SegmentedControlV2 } from "@tiancode-ai/ui/v2/segmented-control-v2"
import type { McpLocalConfig, McpRemoteConfig } from "@tiancode-ai/sdk/v2/client"
import { useLanguage } from "@/context/language"
import { usePlatform } from "@/context/platform"
import { useServerSDK } from "@/context/server-sdk"
import { useSettings } from "@/context/settings"
import { showToast } from "@/utils/toast"
import { SettingsListV2 } from "./parts/list"
import { SettingsRowV2 } from "./parts/row"

type McpConfigValue = McpLocalConfig | McpRemoteConfig | { enabled: boolean }
type PermissionAction = "ask" | "allow" | "deny"
type PermissionRule = PermissionAction | Record<string, PermissionAction>
type PermissionMap = Record<string, PermissionRule>
type ComputerUseTab = "tools" | "browser" | "bridges"
type BrowserLinks = "integrated" | "system"
type CookieRetention = "always" | "session"

const isLocalServer = (config: McpConfigValue): config is McpLocalConfig =>
  "type" in config && config.type === "local"

const isAction = (value: unknown): value is PermissionAction =>
  value === "ask" || value === "allow" || value === "deny"

// Ajustes que guarda el proceso principal de la app de escritorio, no `tiancode.json`. El
// interruptor del uso del computador vive aquí a propósito: `tiancode.json` es un archivo del
// proyecto que el propio agente puede reescribir con la tool `edit` (ver main/computer-use.ts).
const SETTINGS_STORE = "tiancode.settings"
const COMPUTER_ENABLED_KEY = "computerUseEnabled"
const COMPUTER_DENIED_KEY = "computerUseDeniedApps"
const WEBVIEW_RETENTION_KEY = "webviewRetention"

const BROWSER_ACTIONS: PermissionAction[] = ["ask", "allow", "deny"]
const LINK_OPTIONS: BrowserLinks[] = ["integrated", "system"]
const RETENTION_OPTIONS: CookieRetention[] = ["always", "session"]

/** El origen es lo que el backend usa como patrón al pedir permiso (ver tool/preview.ts). */
function toOrigin(raw: string): string | undefined {
  const value = raw.trim()
  if (!value) return undefined
  const candidate = /^[a-z][a-z0-9+.-]*:\/\//i.test(value) ? value : `https://${value}`
  if (!URL.canParse(candidate)) return undefined
  const url = new URL(candidate)
  if (url.origin === "null" || !url.hostname) return undefined
  return url.origin
}

/**
 * Nombre de ejecutable, tal y como lo compara el main: último tramo de la ruta en minúsculas.
 * Se exige extensión porque lo que Windows devuelve siempre la lleva; sin ella la entrada no
 * llegaría a coincidir nunca y sería una línea en la lista que no veta nada.
 */
function toExecutable(raw: string): string | undefined {
  const parts = raw.trim().toLowerCase().split(/[\\/]/)
  const name = parts[parts.length - 1] ?? ""
  if (!/^[^\s].*\.[a-z0-9]{1,8}$/.test(name)) return undefined
  return name
}

export const SettingsComputerUseV2: Component<{
  directory?: string
  active?: boolean
}> = (props) => {
  const language = useLanguage()
  const platform = usePlatform()
  const settings = useSettings()
  const serverSdk = useServerSDK()
  const [saving, setSaving] = createSignal(false)
  const [activeTab, setActiveTab] = createSignal<ComputerUseTab>("tools")
  const [siteDraft, setSiteDraft] = createSignal("")
  const [appDraft, setAppDraft] = createSignal("")
  const [clearing, setClearing] = createSignal(false)
  // Las tools de captura y portapapeles viajan por el puente de la app de escritorio: en el
  // navegador no existen. El uso del computador, además, sólo está implementado en Windows.
  const desktop = createMemo(() => platform.platform === "desktop")
  const windows = createMemo(() => desktop() && platform.os === "windows")

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

  // El sondeo sólo tiene sentido mientras se están mirando los bridges: antes seguía corriendo
  // con la pestaña de ajustes abierta en cualquier otra sección.
  createEffect(() => {
    if (!(props.active ?? true)) return
    if (activeTab() !== "bridges") return
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

  // El estado del interruptor sale de la configuración real, no de una copia local: es la misma
  // regla que evalúa el backend cuando la tool pide permiso.
  const screenshotApproved = () => currentPermission()?.screenshot === "allow"

  const setScreenshotAutoApprove = async (enabled: boolean) => {
    if (saving()) return
    setSaving(true)
    try {
      // Nunca se borra la clave: la configuración se fusiona con mergeDeep y una clave ausente en
      // el parche deja la que hubiera, así que "quitar" el permiso hay que escribirlo.
      await serverSdk().client.config.update({
        ...params(),
        config: { permission: { screenshot: enabled ? "allow" : "ask" } },
      })
      await refetchConfig()
      showToast({ variant: "success", title: language.t("settings.computerUse.save.done") })
    } catch {
      showToast({ variant: "error", title: language.t("settings.computerUse.save.failed") })
    } finally {
      setSaving(false)
    }
  }

  // -------------------------------------------------------------------------------------------
  // Navegador integrado: permission.browser
  // -------------------------------------------------------------------------------------------

  // Las reglas se leen en el orden en que están escritas, porque el backend resuelve con
  // findLast: la ÚLTIMA que encaja manda (ver backend/tiancode/src/permission/index.ts).
  const browserEntries = createMemo<[string, PermissionAction][]>(() => {
    const rule = currentPermission()?.browser
    if (isAction(rule)) return [["*", rule]]
    if (typeof rule !== "object" || rule === null || Array.isArray(rule)) return []
    return Object.entries(rule).filter((entry): entry is [string, PermissionAction] => isAction(entry[1]))
  })

  const wildcard = createMemo<PermissionAction | undefined>(() => {
    const entries = browserEntries()
    for (let i = entries.length - 1; i >= 0; i--) if (entries[i]![0] === "*") return entries[i]![1]
    return undefined
  })

  // Sin regla propia manda el valor por defecto del agente, que hoy es `"*": "allow"`: cualquier
  // sitio abierto en el navegador integrado se puede leer y manejar sin preguntar nada.
  const baseline = createMemo<PermissionAction>(() => wildcard() ?? "allow")
  const inherited = () => wildcard() === undefined

  const effectiveFor = (origin: string): PermissionAction => {
    const entries = browserEntries()
    for (let i = entries.length - 1; i >= 0; i--) {
      const [pattern, action] = entries[i]!
      if (pattern === "*" || pattern === origin) return action
    }
    return "allow"
  }

  const allowedSites = createMemo(() => {
    const seen = new Set<string>()
    const sites: string[] = []
    for (const [pattern] of browserEntries()) {
      if (pattern === "*" || seen.has(pattern)) continue
      seen.add(pattern)
      if (effectiveFor(pattern) === "allow") sites.push(pattern)
    }
    return sites
  })

  const writeBrowser = async (patch: Record<string, PermissionAction>) => {
    await serverSdk().client.config.update({ ...params(), config: { permission: { browser: patch } } })
    await refetchConfig()
  }

  const setBaseline = async (action: PermissionAction) => {
    if (saving() || action === baseline()) return
    setSaving(true)
    try {
      await writeBrowser({ "*": action })
      // Comprobación posterior, no simulación: si la clave "*" acaba detrás de otra regla del
      // archivo, el valor efectivo no es el elegido y hay que decirlo en vez de fingir.
      if (baseline() !== action) {
        showToast({ variant: "error", title: language.t("settings.computerUse.browser.sites.orderFailed") })
        return
      }
      showToast({ variant: "success", title: language.t("settings.computerUse.save.done") })
    } catch {
      showToast({ variant: "error", title: language.t("settings.computerUse.save.failed") })
    } finally {
      setSaving(false)
    }
  }

  const addSite = async () => {
    if (saving()) return
    const origin = toOrigin(siteDraft())
    if (!origin) {
      showToast({ variant: "error", title: language.t("settings.computerUse.browser.sites.invalid") })
      return
    }
    if (allowedSites().includes(origin)) {
      showToast({ variant: "error", title: language.t("settings.computerUse.browser.sites.duplicate") })
      return
    }
    setSaving(true)
    try {
      await writeBrowser({ [origin]: "allow" })
      if (effectiveFor(origin) !== "allow") {
        showToast({ variant: "error", title: language.t("settings.computerUse.browser.sites.orderFailed") })
        return
      }
      setSiteDraft("")
      showToast({ variant: "success", title: language.t("settings.computerUse.save.done") })
    } catch {
      showToast({ variant: "error", title: language.t("settings.computerUse.save.failed") })
    } finally {
      setSaving(false)
    }
  }

  const revokeSite = async (origin: string) => {
    if (saving()) return
    setSaving(true)
    try {
      // "ask", no borrar: mergeDeep no elimina claves, así que quitar la línea del parche dejaría
      // el permiso como estaba. Revocar es volver a preguntar.
      await writeBrowser({ [origin]: "ask" })
      if (effectiveFor(origin) === "allow") {
        showToast({ variant: "error", title: language.t("settings.computerUse.browser.sites.orderFailed") })
        return
      }
      showToast({ variant: "success", title: language.t("settings.computerUse.browser.sites.revoked") })
    } catch {
      showToast({ variant: "error", title: language.t("settings.computerUse.save.failed") })
    } finally {
      setSaving(false)
    }
  }

  // -------------------------------------------------------------------------------------------
  // Ajustes guardados por el proceso principal (sólo app de escritorio)
  // -------------------------------------------------------------------------------------------

  const [computerEnabled, { mutate: setComputerEnabled }] = createResource(
    () => desktop(),
    () =>
      window.api?.storeGet
        ? window.api.storeGet(SETTINGS_STORE, COMPUTER_ENABLED_KEY).then((value) => value !== "false")
        : Promise.resolve(true),
    { initialValue: true },
  )

  const onComputerEnabledChange = (checked: boolean) => {
    setComputerEnabled(checked)
    const update = window.api?.storeSet?.(SETTINGS_STORE, COMPUTER_ENABLED_KEY, String(checked))
    if (!update) return
    void update.catch(() => setComputerEnabled(!checked))
  }

  const [deniedApps, { mutate: setDeniedApps }] = createResource(
    () => desktop(),
    async () => {
      if (!window.api?.storeGet) return [] as string[]
      const raw = await window.api.storeGet(SETTINGS_STORE, COMPUTER_DENIED_KEY)
      if (!raw) return [] as string[]
      try {
        const parsed = JSON.parse(raw)
        if (!Array.isArray(parsed)) return [] as string[]
        return parsed.filter((item): item is string => typeof item === "string")
      } catch {
        return [] as string[]
      }
    },
    { initialValue: [] as string[] },
  )

  const writeDeniedApps = (next: string[]) => {
    const previous = deniedApps()
    setDeniedApps(next)
    const update = window.api?.storeSet?.(SETTINGS_STORE, COMPUTER_DENIED_KEY, JSON.stringify(next))
    if (!update) return
    void update.catch(() => {
      setDeniedApps(previous)
      showToast({ variant: "error", title: language.t("settings.computerUse.save.failed") })
    })
  }

  const addDeniedApp = () => {
    const name = toExecutable(appDraft())
    if (!name) {
      showToast({ variant: "error", title: language.t("settings.computerUse.denied.invalid") })
      return
    }
    if (deniedApps().includes(name)) {
      showToast({ variant: "error", title: language.t("settings.computerUse.denied.duplicate") })
      return
    }
    writeDeniedApps([...deniedApps(), name])
    setAppDraft("")
  }

  const [retention, { mutate: setRetention }] = createResource(
    () => desktop(),
    () =>
      window.api?.storeGet
        ? window.api
            .storeGet(SETTINGS_STORE, WEBVIEW_RETENTION_KEY)
            .then((value): CookieRetention => (value === "session" ? "session" : "always"))
        : Promise.resolve<CookieRetention>("always"),
    { initialValue: "always" as CookieRetention },
  )

  const onRetentionChange = (value: CookieRetention) => {
    const previous = retention()
    if (value === previous) return
    setRetention(value)
    const update = window.api?.storeSet?.(SETTINGS_STORE, WEBVIEW_RETENTION_KEY, value)
    if (!update) return
    void update.catch(() => setRetention(previous))
  }

  // Borra el almacenamiento de las particiones de los webviews (navegador integrado y vista en
  // vivo) a través del puente del main.
  const clearData = async () => {
    if (!window.api?.clearWebviewData) return
    if (!window.confirm(language.t("settings.browser.clearData.confirm"))) return
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

  const availability = () => (
    <span class="settings-v2-chip" data-tone={desktop() ? "green" : "muted"}>
      {desktop()
        ? language.t("settings.computerUse.tool.ready")
        : language.t("settings.computerUse.tool.desktopOnly")}
    </span>
  )

  const computerAvailability = () => (
    <span class="settings-v2-chip" data-tone={windows() ? "green" : "muted"}>
      {windows()
        ? language.t("settings.computerUse.tool.ready")
        : desktop()
          ? language.t("settings.computerUse.computer.windowsOnly")
          : language.t("settings.computerUse.tool.desktopOnly")}
    </span>
  )

  // La clase compartida de settings-v2.css, no estilos en línea: el campo tiene que ser un
  // elemento flexible de verdad para que el hueco de control sume campo + gap + botón. Con
  // `flex: none` (text-input-v2.css) y `width: 100%` el botón caía fuera de la fila y el
  // `contain: paint` del panel lo recortaba.
  const inlineControl = (children: JSX.Element) => <div class="settings-v2-row-inline">{children}</div>

  return (
    <>
      <div class="settings-v2-tab-header settings-v2-tab-header--stacked">
        <div class="settings-v2-tab-header-row">
          <h2 class="settings-v2-tab-title">{language.t("settings.computerUse.title")}</h2>
        </div>
        <p class="settings-v2-tab-description">{language.t("settings.computerUse.description")}</p>
        <div style={{ "margin-top": "6px" }}>
          <SegmentedControlV2 value={activeTab()} onChange={(val) => val && setActiveTab(val as ComputerUseTab)}>
            <SegmentedControlItemV2 value="tools">{language.t("settings.computerUse.tab.tools")}</SegmentedControlItemV2>
            <SegmentedControlItemV2 value="browser">
              {language.t("settings.computerUse.tab.browser")}
            </SegmentedControlItemV2>
            <SegmentedControlItemV2 value="bridges">
              {language.t("settings.computerUse.tab.bridges")}
            </SegmentedControlItemV2>
          </SegmentedControlV2>
        </div>
      </div>

      <div class="settings-v2-tab-body">
        <Show when={activeTab() === "tools"}>
          <div class="settings-v2-section">
            <h3 class="settings-v2-section-title">{language.t("settings.computerUse.section.tools")}</h3>
            <p class="settings-v2-note">{language.t("settings.computerUse.tools.intro")}</p>
            <SettingsListV2>
              <SettingsRowV2
                title={language.t("settings.computerUse.screenshot.title")}
                description={language.t("settings.computerUse.screenshot.description")}
              >
                {availability()}
              </SettingsRowV2>

              <SettingsRowV2
                title={language.t("settings.computerUse.clipboard.title")}
                description={language.t("settings.computerUse.clipboard.description")}
              >
                {availability()}
              </SettingsRowV2>

              <SettingsRowV2
                title={language.t("settings.computerUse.computer.title")}
                description={language.t("settings.computerUse.computer.description")}
              >
                {computerAvailability()}
              </SettingsRowV2>
            </SettingsListV2>
            <p class="settings-v2-note">{language.t("settings.computerUse.platform.note")}</p>
          </div>

          <div class="settings-v2-section">
            <h3 class="settings-v2-section-title">{language.t("settings.computerUse.section.permissions")}</h3>
            <SettingsListV2>
              <SettingsRowV2
                title={language.t("settings.computerUse.autoApproveScreenshot")}
                description={language.t("settings.computerUse.autoApproveScreenshot.description")}
              >
                <div data-action="settings-computer-use-auto-approve">
                  <Switch
                    checked={screenshotApproved()}
                    disabled={saving()}
                    onChange={(checked) => void setScreenshotAutoApprove(checked)}
                  />
                </div>
              </SettingsRowV2>
            </SettingsListV2>
            <p class="settings-v2-note">{language.t("settings.computerUse.autoApproveScreenshot.note")}</p>
            <p class="settings-v2-note">{language.t("settings.computerUse.clipboard.note")}</p>
          </div>

          {/* Sólo Windows: en macOS y Linux la tool se niega siempre, así que un interruptor para
              apagarla sería un mando que no manda nada. La nota de arriba explica por qué. */}
          <Show when={windows()}>
            <div class="settings-v2-section">
              <h3 class="settings-v2-section-title">{language.t("settings.computerUse.section.computer")}</h3>
              <SettingsListV2>
                <SettingsRowV2
                  title={language.t("settings.computerUse.computer.enable")}
                  description={language.t("settings.computerUse.computer.enable.description")}
                >
                  <div data-action="settings-computer-use-enabled">
                    <Switch checked={computerEnabled()} onChange={onComputerEnabledChange} />
                  </div>
                </SettingsRowV2>

                <SettingsRowV2
                  title={language.t("settings.computerUse.denied.title")}
                  description={language.t("settings.computerUse.denied.description")}
                >
                  {inlineControl(
                    <>
                      <TextInputV2
                        appearance="base"
                        value={appDraft()}
                        onInput={(event) => setAppDraft(event.currentTarget.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") addDeniedApp()
                        }}
                        placeholder={language.t("settings.computerUse.denied.placeholder")}
                        spellcheck={false}
                        autocomplete="off"
                        aria-label={language.t("settings.computerUse.denied.title")}
                      />
                      <ButtonV2 type="button" variant="outline" size="small" disabled={!appDraft().trim()} onClick={addDeniedApp}>
                        {language.t("settings.computerUse.denied.add")}
                      </ButtonV2>
                    </>,
                  )}
                </SettingsRowV2>
              </SettingsListV2>

              <Show
                when={deniedApps().length > 0}
                fallback={
                  <div class="settings-v2-skills-status">{language.t("settings.computerUse.denied.empty")}</div>
                }
              >
                <SettingsListV2>
                  <For each={deniedApps()}>
                    {(name) => (
                      <SettingsRowV2 title={name} description="">
                        <ButtonV2
                          type="button"
                          variant="ghost"
                          size="small"
                          onClick={() => writeDeniedApps(deniedApps().filter((item) => item !== name))}
                        >
                          {language.t("settings.computerUse.denied.remove")}
                        </ButtonV2>
                      </SettingsRowV2>
                    )}
                  </For>
                </SettingsListV2>
              </Show>
              <p class="settings-v2-note">{language.t("settings.computerUse.denied.note")}</p>
            </div>
          </Show>
        </Show>

        <Show when={activeTab() === "browser"}>
          <div class="settings-v2-section">
            <h3 class="settings-v2-section-title">{language.t("settings.computerUse.browser.section")}</h3>
            <SettingsListV2>
              <SettingsRowV2
                title={language.t("settings.computerUse.browser.control")}
                description={language.t("settings.computerUse.browser.control.description")}
              >
                {inlineControl(
                  <>
                    <Show when={inherited()}>
                      <span class="settings-v2-chip" data-tone="muted">
                        {language.t("settings.computerUse.browser.control.inherited")}
                      </span>
                    </Show>
                    <SelectV2
                      appearance="inline"
                      data-action="settings-browser-permission"
                      options={BROWSER_ACTIONS}
                      current={baseline()}
                      disabled={saving()}
                      placement="bottom-end"
                      gutter={6}
                      label={(option) => language.t(`settings.computerUse.browser.control.${option}`)}
                      onSelect={(option) => option && void setBaseline(option)}
                    />
                  </>,
                )}
              </SettingsRowV2>

              <SettingsRowV2
                title={language.t("settings.browser.links")}
                description={language.t("settings.browser.links.description")}
              >
                <SelectV2
                  appearance="inline"
                  data-action="settings-browser-links"
                  options={LINK_OPTIONS}
                  current={settings.general.browserLinks()}
                  placement="bottom-end"
                  gutter={6}
                  label={(option) => language.t(`settings.browser.links.${option}`)}
                  onSelect={(option) => option && settings.general.setBrowserLinks(option)}
                />
              </SettingsRowV2>
            </SettingsListV2>
            <p class="settings-v2-note">{language.t("settings.computerUse.browser.control.note")}</p>
          </div>

          <div class="settings-v2-section">
            <h3 class="settings-v2-section-title">{language.t("settings.computerUse.browser.sites")}</h3>
            <p class="settings-v2-note">{language.t("settings.computerUse.browser.sites.description")}</p>
            <Show when={baseline() === "allow"}>
              <p class="settings-v2-note">{language.t("settings.computerUse.browser.sites.inert")}</p>
            </Show>
            <SettingsListV2>
              <SettingsRowV2
                title={language.t("settings.computerUse.browser.sites.add")}
                description={language.t("settings.computerUse.browser.sites.description")}
              >
                {inlineControl(
                  <>
                    <TextInputV2
                      type="url"
                      appearance="base"
                      value={siteDraft()}
                      onInput={(event) => setSiteDraft(event.currentTarget.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") void addSite()
                      }}
                      placeholder={language.t("settings.computerUse.browser.sites.placeholder")}
                      spellcheck={false}
                      autocomplete="off"
                      aria-label={language.t("settings.computerUse.browser.sites.add")}
                    />
                    <ButtonV2
                      type="button"
                      variant="outline"
                      size="small"
                      disabled={saving() || !siteDraft().trim()}
                      onClick={() => void addSite()}
                    >
                      {language.t("settings.computerUse.browser.sites.add")}
                    </ButtonV2>
                  </>,
                )}
              </SettingsRowV2>
            </SettingsListV2>

            <Show
              when={allowedSites().length > 0}
              fallback={
                <div class="settings-v2-skills-status">
                  {language.t("settings.computerUse.browser.sites.empty")}
                </div>
              }
            >
              <SettingsListV2>
                <For each={allowedSites()}>
                  {(origin) => (
                    <SettingsRowV2 title={origin} description="">
                      <ButtonV2
                        type="button"
                        variant="ghost"
                        size="small"
                        disabled={saving()}
                        onClick={() => void revokeSite(origin)}
                      >
                        {language.t("settings.computerUse.browser.sites.revoke")}
                      </ButtonV2>
                    </SettingsRowV2>
                  )}
                </For>
              </SettingsListV2>
            </Show>
            <p class="settings-v2-note">{language.t("settings.computerUse.browser.sites.note")}</p>
          </div>

          <Show when={desktop()}>
            <div class="settings-v2-section">
              <h3 class="settings-v2-section-title">{language.t("settings.computerUse.browser.cookies")}</h3>
              <SettingsListV2>
                <SettingsRowV2
                  title={language.t("settings.computerUse.browser.cookies")}
                  description={language.t("settings.computerUse.browser.cookies.description")}
                >
                  <SelectV2
                    appearance="inline"
                    data-action="settings-browser-cookies"
                    options={RETENTION_OPTIONS}
                    current={retention()}
                    placement="bottom-end"
                    gutter={6}
                    label={(option) => language.t(`settings.computerUse.browser.cookies.${option}`)}
                    onSelect={(option) => option && onRetentionChange(option)}
                  />
                </SettingsRowV2>

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
              <p class="settings-v2-note">{language.t("settings.computerUse.browser.cookies.note")}</p>
            </div>
          </Show>
        </Show>

        <Show when={activeTab() === "bridges"}>
          <div class="settings-v2-section">
            <h3 class="settings-v2-section-title">{language.t("settings.computerUse.section.apps")}</h3>
            <p class="settings-v2-note">{language.t("settings.computerUse.apps.description")}</p>
            <Show
              when={localApps().length > 0}
              fallback={<div class="settings-v2-skills-status">{language.t("settings.computerUse.empty")}</div>}
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
                            ? language.t("settings.computerUse.apps.connected")
                            : language.t("settings.computerUse.apps.disconnected")}
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
