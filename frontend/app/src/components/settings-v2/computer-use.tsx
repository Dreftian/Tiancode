import { ButtonV2 } from "@tiancode-ai/ui/v2/button-v2"
import { SegmentedControlItemV2, SegmentedControlV2 } from "@tiancode-ai/ui/v2/segmented-control-v2"
import { SelectV2 } from "@tiancode-ai/ui/v2/select-v2"
import { Switch } from "@tiancode-ai/ui/v2/switch-v2"
import { TextInputV2 } from "@tiancode-ai/ui/v2/text-input-v2"
import { Icon, type IconName } from "@tiancode-ai/ui/icon"
import { useDialog } from "@tiancode-ai/ui/context/dialog"
import type { Config } from "@tiancode-ai/sdk/v2/client"
import {
  type Component,
  createEffect,
  createMemo,
  createResource,
  createSignal,
  For,
  on,
  onCleanup,
  Show,
} from "solid-js"
import { createStore } from "solid-js/store"
import { useLanguage } from "@/context/language"
import { usePlatform } from "@/context/platform"
import { useServerSDK } from "@/context/server-sdk"
import { useSettings } from "@/context/settings"
import { showToast } from "@/utils/toast"
import {
  browserExceptions,
  isAction,
  permissionRules,
  resolveRule,
  type PermissionAction,
  toExecutable,
  toOrigin,
} from "./computer-use-logic"
import { SettingsConfirmDialog } from "./parts/confirm-dialog"
import { SettingsHubHeader } from "./parts/hub-header"
import { SettingsListV2 } from "./parts/list"
import { SettingsRowV2 } from "./parts/row"
import { SettingsPairingSection } from "./pairing"
import "./parts/kit.css"

export type ComputerUseSection = "desktop" | "browser" | "remote"
export const COMPUTER_USE_SECTIONS: readonly ComputerUseSection[] = ["desktop", "browser", "remote"]
// Earlier versions linked to these sections; they still land on the page that now holds them.
export const LEGACY_COMPUTER_USE_SECTIONS: Record<string, ComputerUseSection> = {
  tools: "desktop",
  bridges: "desktop",
  pairing: "remote",
  experimental: "browser",
}

type BrowserLinks = "integrated" | "system" | "chrome"
type CookieRetention = "always" | "session"
type Tool = "screenshot" | "clipboard" | "computer"

// Settings the desktop main process keeps, not tiancode.json: the agent can rewrite a project's
// tiancode.json with its edit tool, so the computer-use kill switch must not live there.
const SETTINGS_STORE = "tiancode.settings"
const COMPUTER_ENABLED_KEY = "computerUseEnabled"
const COMPUTER_DENIED_KEY = "computerUseDeniedApps"
const COMPUTER_RESTORE_KEY = "computerUseRestoreWindows"
const COMPUTER_DISPLAY_KEY = "computerUseDisplay"
const WEBVIEW_RETENTION_KEY = "webviewRetention"

const ACTIONS: readonly PermissionAction[] = ["ask", "allow", "deny"]
const TOOLS: readonly Tool[] = ["screenshot", "clipboard", "computer"]
// What each tool does when no rule is written (agent defaults in backend/tiancode/src/agent/agent.ts).
const TOOL_DEFAULTS: Record<Tool, PermissionAction> = { screenshot: "ask", clipboard: "ask", computer: "allow" }
const TOOL_ICONS: Record<Tool, IconName> = { screenshot: "photo", clipboard: "copy", computer: "window-cursor" }

/**
 * Settings › Uso de la PC: what the agent may do on this computer (screen, clipboard, mouse and
 * keyboard), in the built-in browser, and from other devices on the local network. Permissions
 * are written to the global config so they hold in every project.
 */
export const SettingsComputerUseV2: Component<{
  directory?: string
  active?: boolean
  section?: ComputerUseSection
  onSectionChange?: (section: ComputerUseSection) => void
}> = (props) => {
  const language = useLanguage()
  const platform = usePlatform()
  const settings = useSettings()
  const dialog = useDialog()
  const serverSdk = useServerSDK()
  const desktop = createMemo(() => platform.platform === "desktop")
  const windows = createMemo(() => desktop() && platform.os === "windows")
  const remoteAvailable = () => !!(platform.pairing || platform.setKeepScreenActive)
  const [ui, setUi] = createStore({
    section: props.section ?? ("desktop" as ComputerUseSection),
    site: "",
    siteAction: "deny" as PermissionAction,
    app: "",
    clearing: false,
  })
  createEffect(
    on(
      () => props.section,
      (section) => section && setUi("section", section),
      { defer: true },
    ),
  )
  const section = () => (ui.section === "remote" && !remoteAvailable() ? "desktop" : ui.section)
  const select = (next: ComputerUseSection) => {
    setUi("section", next)
    props.onSectionChange?.(next)
  }

  // ------------------------------------------------------------------ Global config

  // A signal, not a store: which rule wins depends on their order, and a store merge appends new
  // keys after the existing ones, so a new default looked as if it overrode every site rule.
  const [shown, setShown] = createSignal<Config["permission"]>()
  // A failed load leaves the defaults on screen; letting the resource throw replaced the whole
  // window with the error page.
  const [remote, { refetch }] = createResource(
    () => serverSdk(),
    () =>
      Promise.resolve()
        .then(() => serverSdk().client.global.config.get({ throwOnError: true }))
        .then((result) => result.data ?? null)
        .catch(() => null),
  )
  createEffect(() => {
    const value = remote()
    if (value) setShown(() => value.permission)
  })
  const permission = () => {
    const value = shown()
    return value && typeof value === "object" ? (value as Record<string, unknown>) : {}
  }
  const rules = () => permissionRules(shown())
  const toolAction = (tool: Tool): PermissionAction => resolveRule(rules(), tool) ?? TOOL_DEFAULTS[tool]
  const browserDefault = () => resolveRule(rules(), "browser") ?? "allow"
  const exceptions = () => browserExceptions(rules())

  // Config loaded after the global one (the project's tiancode.json, .tiancode/, ~/.tiancode or a
  // managed config) overrides these rules in the open project; 1.0.5 wrote them into the project.
  // The page edits only the global config, so it says what applies here instead of writing files
  // it cannot rank. Both are read together, so a difference means another layer sets the rule.
  const [layers, { refetch: refetchLayers }] = createResource(
    () => props.directory,
    (directory) =>
      Promise.all([
        serverSdk().client.global.config.get({ throwOnError: true }),
        serverSdk().client.config.get({ directory }, { throwOnError: true }),
      ])
        .then(([global, merged]) => ({
          global: permissionRules(global.data?.permission),
          merged: permissionRules(merged.data?.permission),
        }))
        .catch(() => undefined),
  )
  // A global save reopens the projects; read both layers again once the server says it did (read
  // before that, the project still answered with the old merge).
  onCleanup(
    serverSdk().event.listen((event) => {
      if (event.details?.type === "global.disposed") void refetchLayers()
    }),
  )
  // A top-level `*` written after a key in the global config wins over it, so edits to that key save
  // but change nothing; the page says so instead of failing silently.
  const shadowed = (keys: readonly string[]) =>
    keys.some((key) => {
      const own = rules().findLastIndex((rule) => rule.key === key)
      return own !== -1 && rules().findLastIndex((rule) => rule.key === "*") > own
    })
  const overridden = (key: string, fallback: PermissionAction) => {
    const value = layers()
    if (!value) return undefined
    const here = resolveRule(value.merged, key) ?? fallback
    return here === (resolveRule(value.global, key) ?? fallback) ? undefined : here
  }
  const browserOverridden = () => {
    const value = layers()
    if (!value) return false
    return (
      overridden("browser", "allow") !== undefined ||
      JSON.stringify(browserExceptions(value.merged)) !== JSON.stringify(browserExceptions(value.global))
    )
  }

  const savePermission = async (patch: Record<string, unknown>) => {
    const before = shown()
    setShown(() => mergePatch(before, patch) as Config["permission"])
    const saved = await serverSdk()
      .client.global.config.update({ config: { permission: patch as Config["permission"] } }, { throwOnError: true })
      .then(() => true)
      .catch(() => false)
    if (saved) return
    setShown(() => before)
    showToast({ variant: "error", title: language.t("settings.computerUse.save.failed") })
    void refetch()
  }

  // ------------------------------------------------------------------ Desktop (main process)

  const store = {
    get: (key: string) => window.api?.storeGet?.(SETTINGS_STORE, key).catch(() => null) ?? Promise.resolve(null),
    set: (key: string, value: string) =>
      (window.api?.storeSet?.(SETTINGS_STORE, key, value) ?? Promise.resolve()).then(
        () => true,
        () => false,
      ),
  }
  const [machine, setMachine] = createStore({
    enabled: true,
    restore: true,
    denied: [] as string[],
    retention: "always" as CookieRetention,
    displayId: "",
  })
  createEffect(() => {
    if (!desktop()) return
    void Promise.all([
      store.get(COMPUTER_ENABLED_KEY),
      store.get(COMPUTER_RESTORE_KEY),
      store.get(COMPUTER_DENIED_KEY),
      store.get(WEBVIEW_RETENTION_KEY),
      store.get(COMPUTER_DISPLAY_KEY),
    ]).then(([enabled, restore, denied, retention, displayId]) =>
      setMachine({
        enabled: enabled !== "false",
        restore: restore !== "false",
        denied: parseList(denied),
        retention: retention === "session" ? "session" : "always",
        displayId: displayId ?? "",
      }),
    )
  })
  const setMachineValue = async <K extends keyof typeof machine>(
    key: K,
    value: (typeof machine)[K],
    storeKey: string,
    raw: string,
  ) => {
    const previous = machine[key]
    setMachine(key, value)
    if (await store.set(storeKey, raw)) return
    setMachine(key, previous)
    showToast({ variant: "error", title: language.t("settings.computerUse.save.failed") })
  }

  // Live state of the mouse-and-keyboard control, refreshed while this section is on screen.
  const [status, { refetch: refetchStatus }] = createResource(
    () => windows() && section() === "desktop" && (props.active ?? true),
    () => window.api?.computer?.status().catch(() => undefined) ?? Promise.resolve(undefined),
  )
  const displayOptions = createMemo(
    () => ["primary", ...(status()?.displays ?? []).map((display) => display.id)],
    undefined,
    {
      equals: (before, after) => before.length === after.length && before.every((id, index) => id === after[index]),
    },
  )
  createEffect(() => {
    if (!windows() || section() !== "desktop" || !(props.active ?? true)) return
    const timer = setInterval(() => void refetchStatus(), 2000)
    onCleanup(() => clearInterval(timer))
  })
  const stopControl = () =>
    void window.api?.computer
      ?.stop()
      .then(() => refetchStatus())
      .catch(() => showToast({ variant: "error", title: language.t("common.requestFailed") }))

  const controlState = () => {
    if (!desktop()) return { tone: "warn", label: language.t("settings.computerUse.tool.desktopOnly") }
    if (!windows()) return { tone: "warn", label: language.t("settings.computerUse.computer.windowsOnly") }
    if (!machine.enabled) return { tone: undefined, label: language.t("settings.computerUse.state.off") }
    if (status()?.active)
      return { tone: "busy", label: language.t("settings.computerUse.state.active", { count: status()?.actions ?? 0 }) }
    return { tone: "ok", label: language.t("settings.computerUse.state.ready") }
  }

  const addDeniedApp = () => {
    const name = toExecutable(ui.app)
    if (!name) return showToast({ variant: "error", title: language.t("settings.computerUse.denied.invalid") })
    if (machine.denied.includes(name))
      return showToast({ variant: "error", title: language.t("settings.computerUse.denied.duplicate") })
    const next = [...machine.denied, name]
    void setMachineValue("denied", next, COMPUTER_DENIED_KEY, JSON.stringify(next))
    setUi("app", "")
  }
  const removeDeniedApp = (name: string) => {
    const next = machine.denied.filter((item) => item !== name)
    void setMachineValue("denied", next, COMPUTER_DENIED_KEY, JSON.stringify(next))
  }

  // ------------------------------------------------------------------ Browser

  // `permission.browser` written as one action ("ask") becomes a map once a site is added; the
  // action is carried over as the "*" rule so the default does not silently turn into "allow".
  const browserPatch = (entries: Record<string, PermissionAction>) => {
    const current = permission().browser
    return { browser: isAction(current) ? { "*": current, ...entries } : entries }
  }
  const addSite = () => {
    const origin = toOrigin(ui.site)
    if (!origin) return showToast({ variant: "error", title: language.t("settings.computerUse.browser.sites.invalid") })
    // Only exceptions are listed: a rule equal to the default would be saved and then vanish.
    if (ui.siteAction === browserDefault())
      return showToast({ title: language.t("settings.computerUse.browser.sites.sameAsDefault", { site: origin }) })
    void savePermission(browserPatch({ [origin]: ui.siteAction }))
    setUi("site", "")
  }
  // A key cannot be deleted by a config merge, so "remove" makes the site follow the default again.
  const removeSite = (site: string) => void savePermission(browserPatch({ [site]: browserDefault() }))

  const setLinks = (option: BrowserLinks) => {
    settings.general.setBrowserLinks(option)
    void store.set("browserLinkTarget", option).then((ok) => {
      if (!ok) showToast({ variant: "error", title: language.t("settings.computerUse.save.failed") })
    })
  }

  const clearData = () =>
    dialog.push(() => (
      <SettingsConfirmDialog
        title={language.t("settings.computerUse.browser.clear.title")}
        description={language.t("settings.browser.clearData.confirm")}
        confirm={language.t("settings.browser.clearData.button")}
        onConfirm={async () => {
          setUi("clearing", true)
          const ok = await (window.api?.clearWebviewData?.() ?? Promise.resolve()).then(
            () => true,
            () => false,
          )
          setUi("clearing", false)
          showToast(
            ok
              ? { variant: "success", title: language.t("settings.browser.clearData.done") }
              : { variant: "error", title: language.t("settings.browser.clearData.failed") },
          )
        }}
        onClose={() => dialog.close()}
      />
    ))

  // ------------------------------------------------------------------ Layout

  const actionLabel = (action: PermissionAction) => language.t(`settings.computerUse.action.${action}`)
  const sections = () => [
    {
      id: "desktop" as const,
      label: language.t("settings.computerUse.tab.desktop"),
      hint: controlState().label,
      icon: "window-cursor" as const,
    },
    {
      id: "browser" as const,
      label: language.t("settings.computerUse.tab.browser"),
      hint: settings.general.agentBrowser()
        ? language.t("settings.computerUse.hint.browser", { action: actionLabel(browserDefault()).toLowerCase() })
        : language.t("settings.computerUse.state.off"),
      icon: "eye" as const,
    },
    ...(remoteAvailable()
      ? [
          {
            id: "remote" as const,
            label: language.t("settings.computerUse.tab.remote"),
            hint: language.t("settings.computerUse.hint.remote"),
            icon: "share" as const,
          },
        ]
      : []),
  ]

  const segmented = (value: PermissionAction, onChange: (action: PermissionAction) => void, label: string) => (
    <SegmentedControlV2
      class="settings-v2-kit-segmented"
      value={value}
      onChange={(next) => isAction(next) && onChange(next)}
      aria-label={label}
    >
      <For each={ACTIONS}>
        {(action) => <SegmentedControlItemV2 value={action}>{actionLabel(action)}</SegmentedControlItemV2>}
      </For>
    </SegmentedControlV2>
  )

  return (
    <div class="settings-v2-tab settings-v2-computer-use">
      <SettingsHubHeader
        icon="window-cursor"
        title={language.t("settings.computerUse.title")}
        description={language.t("settings.computerUse.page.description")}
        sections={sections()}
        value={section()}
        onChange={select}
      />

      <div class="settings-v2-tab-body settings-v2-kit-page">
        <Show when={remote() === null}>
          <p class="settings-v2-kit-note" data-tone="warn">
            {language.t("settings.config.loadFailed")}
          </p>
        </Show>
        <Show when={section() === "desktop"}>
          <div
            class="settings-v2-kit-hero"
            data-active={windows() && machine.enabled ? "" : undefined}
            data-action="settings-computer-use-enabled"
          >
            <span class="settings-v2-kit-hero-icon" aria-hidden="true">
              <Icon name="window-cursor" />
            </span>
            <div class="settings-v2-kit-hero-copy">
              <span class="settings-v2-kit-hero-title">
                {language.t("settings.computerUse.mouse.title")}
                <span class="settings-v2-kit-pill" data-tone={controlState().tone}>
                  {controlState().label}
                </span>
              </span>
              <span class="settings-v2-kit-hero-description">
                {language.t("settings.computerUse.computer.summary")}
              </span>
              <Show when={windows()}>
                <div class="settings-v2-kit-chips">
                  <Show when={status()?.stopShortcut}>
                    {(shortcut) => (
                      <span class="settings-v2-kit-chip" data-muted>
                        {language.t("settings.computerUse.computer.stopShortcut")}
                        <kbd class="settings-v2-kit-kbd">{shortcut()}</kbd>
                      </span>
                    )}
                  </Show>
                  <For each={status()?.active ? (status()?.allowed ?? []) : []}>
                    {(app) => <span class="settings-v2-kit-chip">{app}</span>}
                  </For>
                </div>
              </Show>
            </div>
            <Show when={windows()}>
              <div class="settings-v2-kit-actions">
                <Show when={status()?.active}>
                  <ButtonV2 size="small" variant="danger" onClick={stopControl}>
                    {language.t("settings.computerUse.computer.stop")}
                  </ButtonV2>
                </Show>
                <Switch
                  checked={machine.enabled}
                  onChange={(value) => void setMachineValue("enabled", value, COMPUTER_ENABLED_KEY, String(value))}
                  hideLabel
                >
                  {language.t("settings.computerUse.computer.enable")}
                </Switch>
              </div>
            </Show>
          </div>

          <div class="settings-v2-kit-section" data-action="settings-computer-use-visual">
            <p class="settings-v2-kit-label">{language.t("settings.computerUse.visual.title")}</p>
            <div class="settings-v2-kit-cards">
              <For each={["observe", "act", "verify"] as const}>
                {(step, index) => (
                  <div class="settings-v2-kit-card">
                    <div class="settings-v2-kit-card-head">
                      <span class="settings-v2-kit-card-icon" aria-hidden="true">
                        {index() + 1}
                      </span>
                      <div class="settings-v2-kit-card-copy">
                        <span class="settings-v2-kit-card-title">
                          {language.t(`settings.computerUse.visual.${step}`)}
                        </span>
                        <span class="settings-v2-kit-card-description">
                          {language.t(`settings.computerUse.visual.${step}Description`)}
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </For>
            </div>
            <p class="settings-v2-kit-note">{language.t("settings.computerUse.visual.description")}</p>
            <Show when={windows()}>
              <SettingsListV2 density="compact">
                <SettingsRowV2
                  title={language.t("settings.computerUse.visual.monitor")}
                  description={language.t("settings.computerUse.visual.monitorDescription")}
                >
                  <SelectV2
                    appearance="inline"
                    data-action="settings-computer-use-monitor"
                    options={displayOptions()}
                    current={machine.displayId || "primary"}
                    label={(id) => {
                      const display = status()?.displays.find((item) => item.id === id)
                      return display
                        ? `${display.label} · ${display.bounds.width} × ${display.bounds.height}`
                        : language.t("settings.computerUse.visual.primary")
                    }}
                    onSelect={(id) =>
                      id != null &&
                      void setMachineValue(
                        "displayId",
                        id === "primary" ? "" : id,
                        COMPUTER_DISPLAY_KEY,
                        id === "primary" ? "" : id,
                      )
                    }
                  />
                </SettingsRowV2>
                <SettingsRowV2
                  title={language.t("settings.computerUse.visual.promptTitle")}
                  description={language.t("settings.computerUse.visual.prompt")}
                >
                  <ButtonV2
                    size="small"
                    variant="outline"
                    onClick={() =>
                      void navigator.clipboard
                        .writeText(language.t("settings.computerUse.visual.prompt"))
                        .then(() => showToast({ title: language.t("settings.computerUse.visual.copied") }))
                        .catch(() => showToast({ variant: "error", title: language.t("common.requestFailed") }))
                    }
                  >
                    {language.t("settings.computerUse.visual.copy")}
                  </ButtonV2>
                </SettingsRowV2>
              </SettingsListV2>
            </Show>
            <p class="settings-v2-kit-note">{language.t("settings.computerUse.visual.compatibility")}</p>
          </div>

          <div class="settings-v2-kit-section">
            <p class="settings-v2-kit-label">{language.t("settings.computerUse.section.permissions")}</p>
            <div class="settings-v2-kit-cards">
              <For each={["screenshot", "clipboard", "computer"] as const}>
                {(tool) => (
                  <div class="settings-v2-kit-card" data-action={`settings-computer-use-${tool}`}>
                    <div class="settings-v2-kit-card-head">
                      <span class="settings-v2-kit-card-icon" aria-hidden="true">
                        <Icon name={TOOL_ICONS[tool]} size="small" />
                      </span>
                      <div class="settings-v2-kit-card-copy">
                        <span class="settings-v2-kit-card-title">
                          {language.t(`settings.computerUse.tool.${tool}.title`)}
                        </span>
                        <span class="settings-v2-kit-card-description">
                          {language.t(`settings.computerUse.tool.${tool}.description`)}
                        </span>
                        <Show when={overridden(tool, TOOL_DEFAULTS[tool])}>
                          {(action) => (
                            <span class="settings-v2-kit-card-description" data-tone="warn">
                              {language.t("settings.computerUse.projectOverride", { action: actionLabel(action()) })}
                            </span>
                          )}
                        </Show>
                      </div>
                    </div>
                    <div class="settings-v2-kit-card-foot">
                      {segmented(
                        toolAction(tool),
                        (action) => void savePermission({ [tool]: action }),
                        language.t(`settings.computerUse.tool.${tool}.title`),
                      )}
                    </div>
                  </div>
                )}
              </For>
            </div>
            <p class="settings-v2-kit-note">{language.t("settings.computerUse.permissions.note")}</p>
            <Show when={shadowed(TOOLS)}>
              <p class="settings-v2-kit-note" data-tone="warn">
                {language.t("settings.computerUse.wildcardWins")}
              </p>
            </Show>
          </div>

          <Show when={windows()}>
            <div class="settings-v2-kit-section">
              <p class="settings-v2-kit-label">{language.t("settings.computerUse.section.protections")}</p>
              <SettingsListV2 density="compact">
                <SettingsRowV2
                  title={language.t("settings.computerUse.restore.title")}
                  description={language.t("settings.computerUse.restore.description")}
                >
                  <Switch
                    checked={machine.restore}
                    onChange={(value) => void setMachineValue("restore", value, COMPUTER_RESTORE_KEY, String(value))}
                    hideLabel
                  >
                    {language.t("settings.computerUse.restore.title")}
                  </Switch>
                </SettingsRowV2>
                <SettingsRowV2
                  title={language.t("settings.computerUse.denied.title")}
                  description={language.t("settings.computerUse.denied.short")}
                >
                  <div class="settings-v2-row-inline">
                    <TextInputV2
                      appearance="base"
                      value={ui.app}
                      onInput={(event) => setUi("app", event.currentTarget.value)}
                      onKeyDown={(event) => event.key === "Enter" && addDeniedApp()}
                      placeholder={language.t("settings.computerUse.denied.placeholder")}
                      spellcheck={false}
                      autocomplete="off"
                      aria-label={language.t("settings.computerUse.denied.title")}
                    />
                    <ButtonV2 variant="outline" size="small" disabled={!ui.app.trim()} onClick={addDeniedApp}>
                      {language.t("settings.computerUse.denied.add")}
                    </ButtonV2>
                  </div>
                </SettingsRowV2>
              </SettingsListV2>
              <div class="settings-v2-kit-chips">
                <For each={machine.denied}>
                  {(name) => (
                    <span class="settings-v2-kit-chip">
                      {name}
                      <button
                        type="button"
                        aria-label={language.t("settings.computerUse.denied.removeNamed", { name })}
                        onClick={() => removeDeniedApp(name)}
                      >
                        <Icon name="close-small" size="small" />
                      </button>
                    </span>
                  )}
                </For>
              </div>
              <p class="settings-v2-kit-note">{language.t("settings.computerUse.denied.always")}</p>
            </div>
          </Show>
        </Show>

        <Show when={section() === "browser"}>
          <div
            class="settings-v2-kit-hero"
            data-active={settings.general.agentBrowser() ? "" : undefined}
            data-action="settings-agent-browser"
          >
            <span class="settings-v2-kit-hero-icon" aria-hidden="true">
              <Icon name="eye" />
            </span>
            <div class="settings-v2-kit-hero-copy">
              <span class="settings-v2-kit-hero-title">{language.t("settings.computerUse.browser.agent.title")}</span>
              <span class="settings-v2-kit-hero-description">
                {language.t("settings.computerUse.browser.agent.description")}
              </span>
            </div>
            <Switch
              checked={settings.general.agentBrowser()}
              onChange={(value) => settings.general.setAgentBrowser(value)}
              hideLabel
            >
              {language.t("settings.computerUse.browser.agent.title")}
            </Switch>
          </div>

          <SettingsListV2 density="compact">
            <SettingsRowV2
              title={language.t("settings.computerUse.browser.default")}
              description={language.t("settings.computerUse.browser.default.description")}
            >
              <div data-action="settings-browser-permission">
                {segmented(
                  browserDefault(),
                  (action) => void savePermission(browserPatch({ "*": action })),
                  language.t("settings.computerUse.browser.default"),
                )}
              </div>
            </SettingsRowV2>
            <SettingsRowV2
              title={language.t("settings.browser.links")}
              description={language.t("settings.browser.links.description")}
            >
              <SelectV2
                appearance="inline"
                data-action="settings-browser-links"
                options={
                  windows()
                    ? (["integrated", "system", "chrome"] as BrowserLinks[])
                    : (["integrated", "system"] as BrowserLinks[])
                }
                current={settings.general.browserLinks()}
                placement="bottom-end"
                gutter={6}
                label={(option) => language.t(`settings.browser.links.${option}`)}
                onSelect={(option) => option && setLinks(option)}
              />
            </SettingsRowV2>
          </SettingsListV2>

          <div class="settings-v2-kit-section">
            <p class="settings-v2-kit-label">{language.t("settings.computerUse.browser.sites.label")}</p>
            <div class="settings-v2-kit-card">
              <span class="settings-v2-kit-card-description">
                {language.t("settings.computerUse.browser.sites.summary")}
              </span>
              <div class="settings-v2-row-inline">
                <TextInputV2
                  type="url"
                  appearance="base"
                  value={ui.site}
                  onInput={(event) => setUi("site", event.currentTarget.value)}
                  onKeyDown={(event) => event.key === "Enter" && addSite()}
                  placeholder={language.t("settings.computerUse.browser.sites.placeholder")}
                  spellcheck={false}
                  autocomplete="off"
                  aria-label={language.t("settings.computerUse.browser.sites.placeholder")}
                />
                <SegmentedControlV2
                  class="settings-v2-kit-segmented"
                  value={ui.siteAction}
                  onChange={(value) => isAction(value) && setUi("siteAction", value)}
                  aria-label={language.t("settings.computerUse.browser.sites.addButton")}
                >
                  <SegmentedControlItemV2 value="allow">{actionLabel("allow")}</SegmentedControlItemV2>
                  <SegmentedControlItemV2 value="deny">{actionLabel("deny")}</SegmentedControlItemV2>
                </SegmentedControlV2>
                <ButtonV2 variant="outline" size="small" disabled={!ui.site.trim()} onClick={addSite}>
                  {language.t("settings.computerUse.browser.sites.addButton")}
                </ButtonV2>
              </div>
              <Show
                when={exceptions().length > 0}
                fallback={
                  <span class="settings-v2-kit-card-description">
                    {language.t("settings.computerUse.browser.sites.none")}
                  </span>
                }
              >
                <div class="settings-v2-kit-chips">
                  <For each={exceptions()}>
                    {(item) => (
                      <span class="settings-v2-kit-chip">
                        <span
                          class="settings-v2-kit-pill"
                          data-tone={item.action === "allow" ? "ok" : item.action === "deny" ? "error" : "warn"}
                        >
                          {actionLabel(item.action)}
                        </span>
                        {item.site}
                        <button
                          type="button"
                          aria-label={language.t("settings.computerUse.browser.sites.removeNamed", { site: item.site })}
                          onClick={() => removeSite(item.site)}
                        >
                          <Icon name="close-small" size="small" />
                        </button>
                      </span>
                    )}
                  </For>
                </div>
              </Show>
            </div>
            <Show when={shadowed(["browser"])}>
              <p class="settings-v2-kit-note" data-tone="warn">
                {language.t("settings.computerUse.wildcardWins")}
              </p>
            </Show>
            <Show when={browserOverridden()}>
              <p class="settings-v2-kit-note" data-tone="warn">
                {language.t("settings.computerUse.projectRules")}
              </p>
            </Show>
          </div>

          <Show when={desktop()}>
            <div class="settings-v2-kit-section">
              <p class="settings-v2-kit-label">{language.t("settings.computerUse.browser.data")}</p>
              <SettingsListV2 density="compact">
                <SettingsRowV2
                  title={language.t("settings.computerUse.browser.cookies")}
                  description={language.t("settings.computerUse.browser.cookies.short")}
                >
                  <div data-action="settings-browser-cookies">
                    <SegmentedControlV2
                      class="settings-v2-kit-segmented"
                      value={machine.retention}
                      onChange={(value) =>
                        (value === "always" || value === "session") &&
                        void setMachineValue("retention", value, WEBVIEW_RETENTION_KEY, value)
                      }
                      aria-label={language.t("settings.computerUse.browser.cookies")}
                    >
                      <SegmentedControlItemV2 value="always">
                        {language.t("settings.computerUse.browser.cookies.always")}
                      </SegmentedControlItemV2>
                      <SegmentedControlItemV2 value="session">
                        {language.t("settings.computerUse.browser.cookies.session")}
                      </SegmentedControlItemV2>
                    </SegmentedControlV2>
                  </div>
                </SettingsRowV2>
                <SettingsRowV2
                  title={language.t("settings.browser.clearData")}
                  description={language.t("settings.browser.clearData.description")}
                >
                  <ButtonV2 variant="danger" size="small" disabled={ui.clearing} onClick={clearData}>
                    {language.t(
                      ui.clearing ? "settings.browser.clearData.clearing" : "settings.browser.clearData.button",
                    )}
                  </ButtonV2>
                </SettingsRowV2>
              </SettingsListV2>
            </div>
          </Show>
        </Show>

        <Show when={section() === "remote"}>
          <SettingsPairingSection />
        </Show>
      </div>
    </div>
  )
}

function parseList(raw: string | null): string[] {
  if (!raw) return []
  const parsed: unknown = (() => {
    try {
      return JSON.parse(raw)
    } catch {
      return undefined
    }
  })()
  return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : []
}

// Mirrors the server's merge (permissionBase in config.ts): a single action is its `*` rule, and a
// new `*` goes before the rules it yields to, since the last matching rule wins.
function mergePatch(base: unknown, patch: Record<string, unknown>): Record<string, unknown> {
  const record = (value: unknown): value is Record<string, unknown> =>
    !!value && typeof value === "object" && !Array.isArray(value)
  const current = record(base) ? base : typeof base === "string" ? { "*": base } : {}
  const ordered = "*" in patch && !("*" in current) ? { "*": patch["*"], ...current } : current
  return Object.fromEntries([
    ...Object.entries(ordered),
    ...Object.entries(patch).map(([key, value]) => [key, record(value) ? mergePatch(ordered[key], value) : value]),
  ])
}
