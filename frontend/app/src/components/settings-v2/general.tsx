import { UI_SCALES } from "@/ui-scale"
import { ButtonV2 } from "@tiancode-ai/ui/v2/button-v2"
import { SegmentedControlItemV2, SegmentedControlV2 } from "@tiancode-ai/ui/v2/segmented-control-v2"
import { SelectV2 } from "@tiancode-ai/ui/v2/select-v2"
import { Switch } from "@tiancode-ai/ui/v2/switch-v2"
import { TextInputV2 } from "@tiancode-ai/ui/v2/text-input-v2"
import { Icon, type IconName } from "@tiancode-ai/ui/icon"
import { useDialog } from "@tiancode-ai/ui/context/dialog"
import { type Component, createEffect, createMemo, createResource, For, type JSX, on, Show } from "solid-js"
import { createStore } from "solid-js/store"
import { useConfirmSkipPermissions } from "@/components/dialogs/dialog-skip-permissions"
import { useLanguage } from "@/context/language"
import { usePlatform } from "@/context/platform"
import {
  previewOnFinishOptions,
  tabLayouts,
  terminalPlacements,
  transcriptTextSizes,
  transcriptWidths,
  useSettings,
  workspaceDestinations,
} from "@/context/settings"
import { DESIGN_STYLES, type DesignStyle } from "@/utils/design-style"
import { showToast } from "@/utils/toast"
import { useUpdaterAction } from "../updater-action"
import {
  createAppearanceSettingsController,
  createPermissionScopeController,
  createShellOptions,
  createShellSettingsController,
  type AppearanceSettingsController,
} from "./general-controllers"
import { SettingsConfirmDialog } from "./parts/confirm-dialog"
import { goToSettings } from "./parts/goto"
import { SettingsHubHeader } from "./parts/hub-header"
import { SettingsListV2 } from "./parts/list"
import { SettingsRowV2 } from "./parts/row"
import { SettingsTimelineDetailV2 } from "./timeline-detail"
import "./parts/kit.css"
import "./settings-v2.css"

export type GeneralSection = "chat" | "view" | "workspace" | "desktop" | "data"
// Sub-tabs of the earlier General page, kept so their links and search results still land.
const LEGACY_SECTIONS: Record<string, GeneralSection> = {
  general: "chat",
  timeline: "view",
  appearance: "view",
  preview: "workspace",
  titlebar: "workspace",
  updates: "desktop",
  display: "desktop",
  data: "data",
}
export const generalSection = (value: string | undefined): GeneralSection =>
  (["chat", "view", "workspace", "desktop", "data"] as const).find((id) => id === value) ?? LEGACY_SECTIONS[value ?? ""] ?? "chat"

const STORE = "tiancode.settings"
const MINIMIZE_TO_TRAY = "minimizeToTray"
const FILE_WATCHER = "fileWatcher"
const CHECK_UPDATES = "checkUpdatesOnStart"
const AUTO_BACKUP = "autoBackup"
// The chat's top bar from left to right (session-header.tsx).
const TITLEBAR: readonly { key: TitlebarKey; icon: IconName }[] = [
  { key: "showCapture", icon: "photo" },
  { key: "showStatus", icon: "status" },
  { key: "showVoice", icon: "speech-bubble" },
  { key: "showTerminal", icon: "terminal" },
  { key: "showBrowser", icon: "window-cursor" },
  { key: "showReview", icon: "review" },
  { key: "showFileTree", icon: "file-tree" },
]
type TitlebarKey = "showCapture" | "showStatus" | "showVoice" | "showTerminal" | "showBrowser" | "showReview" | "showFileTree"
type Setter = `set${Capitalize<TitlebarKey>}`

/**
 * Settings › General: compact on purpose. Five tiles split what used to be eight tabs of
 * identical rows; small choices are segmented controls so their state reads at a glance.
 */
export const SettingsGeneralV2: Component<{
  sessionID?: string
  section?: string
  onSectionChange?: (section: string) => void
}> = (props) => {
  const language = useLanguage()
  const platform = usePlatform()
  const dialog = useDialog()
  const settings = useSettings()
  const updater = useUpdaterAction()
  const permissionScope = createPermissionScopeController(() => props.sessionID)
  const shell = createShellSettingsController()
  const appearance = createAppearanceSettingsController()
  const confirmSkip = useConfirmSkipPermissions()
  const desktop = createMemo(() => platform.platform === "desktop")
  const [ui, setUi] = createStore({ section: generalSection(props.section) })
  createEffect(on(() => props.section, (section) => setUi("section", generalSection(section)), { defer: true }))
  const section = () => (!desktop() && (ui.section === "desktop" || ui.section === "data") ? "chat" : ui.section)
  const select = (next: GeneralSection) => {
    setUi("section", next)
    props.onSectionChange?.(next)
  }

  // ------------------------------------------------------------------ Desktop store

  const storeGet = (key: string) => window.api?.storeGet?.(STORE, key).catch(() => null) ?? Promise.resolve(null)
  const [machine, setMachine] = createStore({
    tray: false,
    watcher: true,
    updates: true,
    backup: true,
    login: false,
    pinch: false,
  })
  createEffect(() => {
    if (!desktop()) return
    void Promise.all([
      storeGet(MINIMIZE_TO_TRAY),
      storeGet(FILE_WATCHER),
      storeGet(CHECK_UPDATES),
      storeGet(AUTO_BACKUP),
      window.api?.getLoginItem?.().catch(() => false) ?? Promise.resolve(false),
      Promise.resolve(platform.getPinchZoomEnabled?.() ?? false).catch(() => false),
    ]).then(([tray, watcher, updates, backup, login, pinch]) =>
      setMachine({
        tray: tray === "true",
        watcher: watcher !== "false",
        updates: updates !== "false",
        backup: backup !== "false",
        login: login === true,
        pinch: pinch === true,
      }),
    )
  })
  const storeSet = async (key: keyof typeof machine, storeKey: string, value: boolean) => {
    const previous = machine[key]
    setMachine(key, value)
    const ok = await (window.api?.storeSet?.(STORE, storeKey, String(value)) ?? Promise.resolve()).then(
      () => true,
      () => false,
    )
    if (ok) return true
    setMachine(key, previous)
    showToast({ variant: "error", title: language.t("settings.general.save.failed") })
    return false
  }

  const setLogin = (value: boolean) => {
    setMachine("login", value)
    void window.api
      ?.setLoginItem?.(value)
      .then((actual) => setMachine("login", actual))
      .catch(() => setMachine("login", !value))
  }

  const setPinch = (value: boolean) => {
    setMachine("pinch", value)
    void Promise.resolve(platform.setPinchZoomEnabled?.(value)).catch(() => setMachine("pinch", !value))
  }

  // The sidecar reads the watcher flag only when it starts, so the change asks for a restart.
  const setWatcher = (value: boolean) =>
    dialog.push(() => (
      <SettingsConfirmDialog
        title={language.t("settings.general.fileWatcher.restart.title")}
        description={language.t("settings.general.fileWatcher.restart.description")}
        confirm={language.t("settings.general.restart")}
        onConfirm={() =>
          void storeSet("watcher", FILE_WATCHER, value).then((ok) => ok && void window.api?.relaunchApp?.())
        }
        onClose={() => dialog.close()}
      />
    ))

  // ------------------------------------------------------------------ Data

  const [dataFolder] = createResource(
    () => desktop() && platform.dataFolder,
    (folder) => folder.info().catch(() => undefined),
  )
  const [backups, { refetch: refetchBackups }] = createResource(
    () => desktop(),
    () => platform.listBackups?.().catch(() => []) ?? Promise.resolve([]),
    { initialValue: [] as { name: string; createdAt: number }[] },
  )
  const backupsFolder = () => {
    const root = dataFolder()?.path
    if (!root) return undefined
    return `${root}${root.includes("\\") ? "\\" : "/"}backups`
  }
  const relative = (time: number) => {
    const minutes = Math.round((time - Date.now()) / 60_000)
    const format = new Intl.RelativeTimeFormat(language.intl(), { numeric: "auto" })
    if (Math.abs(minutes) < 60) return format.format(minutes, "minute")
    const hours = Math.round(minutes / 60)
    if (Math.abs(hours) < 24) return format.format(hours, "hour")
    return format.format(Math.round(hours / 24), "day")
  }

  const backupNow = async () => {
    const name = await platform.backupNow?.().catch(() => undefined)
    if (name === undefined) return showToast({ variant: "error", title: language.t("settings.general.backup.now.error") })
    if (!name) return showToast({ title: language.t("settings.general.backup.now.failed") })
    showToast({ variant: "success", title: language.t("settings.general.backup.now.success") })
    void refetchBackups()
  }

  // Restoring replaces the databases the server has open, so it happens at the next start.
  const restoreBackup = (name: string, createdAt: number) =>
    dialog.push(() => (
      <SettingsConfirmDialog
        title={language.t("settings.general.backup.restore.title")}
        description={language.t("settings.general.backup.restore.next", { date: new Date(createdAt).toLocaleString(language.intl()) })}
        confirm={language.t("settings.general.backup.restore.confirmButton")}
        onConfirm={async () => {
          const ok = await (platform.restoreBackup?.(name) ?? Promise.resolve()).then(
            () => true,
            () => false,
          )
          if (!ok) return showToast({ variant: "error", title: language.t("settings.general.backup.restore.failed") })
          void window.api?.relaunchApp?.()
        }}
        onClose={() => dialog.close()}
      />
    ))

  const deleteBackup = (name: string, createdAt: number) =>
    dialog.push(() => (
      <SettingsConfirmDialog
        title={language.t("settings.general.backup.delete.title")}
        description={language.t("settings.general.backup.delete.description", {
          date: new Date(createdAt).toLocaleString(language.intl()),
        })}
        confirm={language.t("settings.general.row.restore.delete")}
        onConfirm={async () => {
          const ok = await (platform.deleteBackup?.(name) ?? Promise.resolve()).then(
            () => true,
            () => false,
          )
          showToast(
            ok
              ? { variant: "success", title: language.t("settings.general.backup.delete.success") }
              : { variant: "error", title: language.t("settings.general.backup.delete.failed") },
          )
          void refetchBackups()
        }}
        onClose={() => dialog.close()}
      />
    ))

  const switchDataFolder = (path: string) =>
    dialog.push(() => (
      <SettingsConfirmDialog
        title={language.t("settings.general.dataFolder.switch.title")}
        description={language.t("settings.general.dataFolder.switch.confirm", { path })}
        confirm={language.t("settings.general.row.otherDataFolder.button")}
        onConfirm={async () => {
          const switched = await platform.dataFolder?.switchTo(path).catch(() => false)
          if (!switched) showToast({ variant: "error", title: language.t("settings.general.dataFolder.switch.failed") })
        }}
        onClose={() => dialog.close()}
      />
    ))

  // ------------------------------------------------------------------ Pieces

  const setAutoAccept = async (checked: boolean) => {
    if (checked && !permissionScope.accepting() && !(await confirmSkip(undefined))) return
    permissionScope.set(checked)
  }

  const shellOptions = createMemo(() => createShellOptions({ shells: shell.shells(), current: shell.current() }))

  const segmented = <T extends string>(input: {
    value: T
    options: readonly T[]
    label: (option: T) => string
    onChange: (value: T) => void
    aria: string
    action?: string
  }) => (
    <SegmentedControlV2
      class="settings-v2-kit-segmented"
      data-action={input.action}
      value={input.value}
      onChange={(value) => {
        const option = input.options.find((item) => item === value)
        if (option) input.onChange(option)
      }}
      aria-label={input.aria}
    >
      <For each={input.options}>{(option) => <SegmentedControlItemV2 value={option}>{input.label(option)}</SegmentedControlItemV2>}</For>
    </SegmentedControlV2>
  )

  const toggle = (input: { title: string; description: string; checked: boolean; onChange: (value: boolean) => void; action?: string; disabled?: boolean }) => (
    <SettingsRowV2 title={input.title} description={input.description}>
      <div data-action={input.action}>
        <Switch checked={input.checked} disabled={input.disabled} onChange={input.onChange} hideLabel>
          {input.title}
        </Switch>
      </div>
    </SettingsRowV2>
  )

  const label = (text: string) => <p class="settings-v2-kit-label">{text}</p>

  const sections = () => [
    {
      id: "chat" as const,
      label: language.t("settings.general.tab.chat"),
      hint: `${language.label(language.locale())} · ${language.t(`settings.general.row.followup.option.${settings.general.followup()}`)}`,
      icon: "bubble-5" as const,
    },
    {
      id: "view" as const,
      label: language.t("settings.general.tab.view"),
      hint: `${appearance.theme.current()?.name ?? ""} · ${language.t(`settings.general.row.transcriptText.option.${settings.appearance.transcriptText()}`)}`,
      icon: "eye" as const,
    },
    {
      id: "workspace" as const,
      label: language.t("settings.general.tab.workspace"),
      hint: language.t(`settings.general.row.terminalPlacement.${settings.general.terminalPlacement()}`),
      icon: "terminal" as const,
    },
    ...(desktop()
      ? [
          {
            id: "desktop" as const,
            label: language.t("settings.general.tab.desktop"),
            hint: language.t(updater.action().label),
            icon: "window-cursor" as const,
          },
          {
            id: "data" as const,
            label: language.t("settings.general.tab.data"),
            hint: backups()[0]
              ? language.t("settings.general.hint.lastBackup", { when: relative(backups()[0]!.createdAt) })
              : language.t("settings.general.hint.noBackup"),
            icon: "archive" as const,
          },
        ]
      : []),
  ]

  return (
    <div class="settings-v2-tab settings-v2-general">
      <SettingsHubHeader
        icon="sliders"
        title={language.t("settings.tab.general")}
        description={language.t("settings.general.page.description")}
        sections={sections()}
        value={section()}
        onChange={select}
      />

      <div class="settings-v2-tab-body settings-v2-kit-page">
        <Show when={section() === "chat"}>
          <SettingsListV2 density="compact">
            <SettingsRowV2 title={language.t("settings.general.row.language.title")} description={language.t("settings.general.row.language.description")}>
              <SelectV2
                appearance="inline"
                data-action="settings-language"
                options={language.locales.map((locale) => ({ value: locale, label: language.label(locale) }))}
                current={{ value: language.locale(), label: language.label(language.locale()) }}
                value={(option) => option.value}
                label={(option) => option.label}
                onSelect={(option) => option && language.setLocale(option.value)}
                placement="bottom-end"
                gutter={6}
              />
            </SettingsRowV2>
            {toggle({
              title: language.t("command.permissions.autoaccept.enable"),
              description: language.t("settings.general.autoAccept.description"),
              checked: permissionScope.accepting(),
              onChange: (value) => void setAutoAccept(value),
              action: "settings-auto-accept-permissions",
            })}
            <SettingsRowV2
              title={language.t("settings.general.row.followup.title")}
              description={language.t("settings.general.row.followup.descriptionKeybind", {
                keybind: platform.os === "macos" ? "⌘ Enter" : "Ctrl+Enter",
              })}
            >
              {segmented({
                value: settings.general.followup(),
                options: ["steer", "queue"] as const,
                label: (option) => language.t(`settings.general.row.followup.option.${option}`),
                onChange: (value) => settings.general.setFollowup(value),
                aria: language.t("settings.general.row.followup.title"),
                action: "settings-follow-up-behavior",
              })}
            </SettingsRowV2>
            <SettingsRowV2 title={language.t("settings.workspaces.default.title")} description={language.t("settings.workspaces.default.description")}>
              <SelectV2
                appearance="inline"
                data-action="settings-workspace-destination"
                options={[...workspaceDestinations]}
                current={settings.workspaces.defaultDestination()}
                label={(option) => language.t(`settings.workspaces.default.${option}`)}
                onSelect={(option) => option && settings.workspaces.setDefaultDestination(option)}
                placement="bottom-end"
                gutter={6}
              />
            </SettingsRowV2>
            {toggle({
              title: language.t("settings.general.row.showCustomAgents.title"),
              description: language.t("settings.general.showAgent.short"),
              checked: settings.general.showCustomAgents(),
              onChange: (value) => settings.general.setShowCustomAgents(value),
              action: "settings-show-custom-agents",
            })}
            {toggle({
              title: language.t("settings.responses.clear"),
              description: language.t("settings.responses.clear.description"),
              checked: settings.general.clearResponses(),
              onChange: (value) => settings.general.setClearResponses(value),
              action: "settings-clear-responses",
            })}
            <SettingsRowV2 title={language.t("design.style.title")} description={language.t("settings.general.designStyle.description")}>
              <SelectV2
                appearance="inline"
                data-action="settings-design-style"
                options={["ask", ...DESIGN_STYLES.map((style) => style.id)] as DesignStyle[]}
                current={settings.general.designStyle()}
                label={(option) => language.t(`design.style.${option}`)}
                onSelect={(option) => option && settings.general.setDesignStyle(option)}
                placement="bottom-end"
                gutter={6}
              />
            </SettingsRowV2>
            {toggle({
              title: language.t("settings.general.row.showComposerMic.title"),
              description: language.t("settings.general.row.showComposerMic.description"),
              checked: settings.general.showComposerMic(),
              onChange: (value) => settings.general.setShowComposerMic(value),
              action: "settings-show-composer-mic",
            })}
            <SettingsRowV2 title={language.t("settings.general.wizard.title")} description={language.t("settings.general.wizard.short")}>
              <ButtonV2
                variant="outline"
                size="small"
                onClick={() => {
                  dialog.close()
                  window.dispatchEvent(new CustomEvent("tiancode:open-welcome-setup"))
                }}
              >
                {language.t("settings.general.wizard.button")}
              </ButtonV2>
            </SettingsRowV2>
          </SettingsListV2>
        </Show>

        <Show when={section() === "view"}>
          <SettingsListV2 density="compact">
            <SettingsRowV2 title={language.t("settings.general.row.colorScheme.title")} description={language.t("settings.general.row.colorScheme.description")}>
              {segmented({
                value: appearance.scheme.current(),
                options: ["system", "light", "dark"] as const,
                label: (option) => language.t(`theme.scheme.${option}`),
                onChange: (value) => appearance.scheme.select(value),
                aria: language.t("settings.general.row.colorScheme.title"),
                action: "settings-color-scheme",
              })}
            </SettingsRowV2>
            <SettingsRowV2 title={language.t("settings.general.row.theme.title")} description={language.t("settings.general.row.theme.description")}>
              <SelectV2
                appearance="inline"
                data-action="settings-theme"
                options={appearance.theme.options()}
                current={appearance.theme.current()}
                value={(option) => option.id}
                label={(option) => option.name}
                onSelect={appearance.theme.select}
                placement="bottom-end"
                gutter={6}
              />
            </SettingsRowV2>
            <SettingsRowV2 title={language.t("settings.general.row.transcriptText.title")} description={language.t("settings.general.row.transcriptText.description")}>
              {segmented({
                value: settings.appearance.transcriptText(),
                options: transcriptTextSizes,
                label: (option) => language.t(`settings.general.row.transcriptText.option.${option}`),
                onChange: (value) => settings.appearance.setTranscriptText(value),
                aria: language.t("settings.general.row.transcriptText.title"),
                action: "settings-transcript-text",
              })}
            </SettingsRowV2>
            <SettingsRowV2 title={language.t("settings.general.row.transcriptWidth.title")} description={language.t("settings.general.row.transcriptWidth.description")}>
              {segmented({
                value: settings.appearance.transcriptWidth(),
                options: transcriptWidths,
                label: (option) => language.t(`settings.general.row.transcriptWidth.option.${option}`),
                onChange: (value) => settings.appearance.setTranscriptWidth(value),
                aria: language.t("settings.general.row.transcriptWidth.title"),
                action: "settings-transcript-width",
              })}
            </SettingsRowV2>
            <SettingsRowV2 title={language.t("settings.experimental.tabs.title")} description={language.t("settings.general.tabs.description")}>
              {segmented({
                value: settings.appearance.tabLayout(),
                options: tabLayouts,
                label: (option) => language.t(`settings.experimental.tabs.${option}`),
                onChange: (value) => settings.appearance.setTabLayout(value),
                aria: language.t("settings.experimental.tabs.title"),
                action: "settings-tab-layout",
              })}
            </SettingsRowV2>
            <Show when={settings.appearance.tabLayout() === "vertical"}>
              <div class="settings-v2-kit-subrow" data-action="settings-show-project-name">
                <span>{language.t("settings.experimental.projectNames.title")}</span>
                <Switch checked={settings.appearance.showProjectName()} onChange={(value) => settings.appearance.setShowProjectName(value)} hideLabel>
                  {language.t("settings.experimental.projectNames.title")}
                </Switch>
              </div>
            </Show>
          </SettingsListV2>

          <div class="settings-v2-kit-section">
            {label(language.t("settings.general.section.timeline"))}
            <div data-component="settings-v2-list">
              <SettingsTimelineDetailV2 />
            </div>
          </div>

          <div class="settings-v2-kit-section">
            {label(language.t("settings.general.fonts"))}
            <div class="settings-v2-kit-cards settings-v2-general-fonts">
              <FontCard kind="ui" fonts={appearance.fonts} />
              <FontCard kind="code" fonts={appearance.fonts} />
              <FontCard kind="terminal" fonts={appearance.fonts} />
            </div>
          </div>
        </Show>

        <Show when={section() === "workspace"}>
          <SettingsListV2 density="compact">
            <SettingsRowV2 title={language.t("settings.general.row.shell.title")} description={language.t("settings.general.shell.short")}>
              <SelectV2
                appearance="inline"
                data-action="settings-shell"
                options={shellOptions()}
                current={shellOptions().find((option) => option.value === shell.current()) ?? shellOptions()[0]}
                value={(option) => option.id}
                label={(option) => {
                  if (option.id === "auto") return language.t("settings.general.row.shell.autoDefault")
                  if (!option.terminalOnly) return option.name
                  return `${option.name} (${language.t("settings.general.row.shell.terminalOnly")})`
                }}
                onSelect={(option) => option && shell.select(option.value)}
                placement="bottom-end"
                gutter={6}
              />
            </SettingsRowV2>
            <SettingsRowV2 title={language.t("settings.general.row.terminalPlacement.title")} description={language.t("settings.general.row.terminalPlacement.description")}>
              {segmented({
                value: settings.general.terminalPlacement(),
                options: terminalPlacements,
                label: (option) => language.t(`settings.general.row.terminalPlacement.${option}`),
                onChange: (value) => settings.general.setTerminalPlacement(value),
                aria: language.t("settings.general.row.terminalPlacement.title"),
                action: "settings-terminal-placement",
              })}
            </SettingsRowV2>
            {toggle({
              title: language.t("session.review.wrapLines"),
              description: language.t("settings.general.row.diffWrap.description"),
              checked: settings.general.diffWrap(),
              onChange: (value) => settings.general.setDiffWrap(value),
              action: "settings-diff-wrap",
            })}
            <SettingsRowV2 title={language.t("settings.general.row.previewOnFinish.title")} description={language.t("settings.general.row.previewOnFinish.description")}>
              <SelectV2
                appearance="inline"
                data-action="settings-preview-on-finish"
                options={[...previewOnFinishOptions]}
                current={settings.general.previewOnFinish()}
                label={(option) => language.t(`settings.general.row.previewOnFinish.${option}`)}
                onSelect={(option) => option && settings.general.setPreviewOnFinish(option)}
                placement="bottom-end"
                gutter={6}
              />
            </SettingsRowV2>
            <SettingsRowV2
              title={language.t("settings.general.row.previewWhileWorking.title")}
              description={
                settings.general.agentBrowser()
                  ? language.t("settings.general.row.previewWhileWorking.description")
                  : language.t("settings.general.previewWhileWorking.needsBrowser")
              }
            >
              <div class="settings-v2-row-inline" data-action="settings-preview-auto-open">
                <Show when={!settings.general.agentBrowser()}>
                  <ButtonV2 size="small" variant="ghost" onClick={() => goToSettings("browser")}>
                    {language.t("settings.general.previewWhileWorking.enable")}
                  </ButtonV2>
                </Show>
                <Switch
                  checked={settings.general.previewAutoOpen()}
                  disabled={!settings.general.agentBrowser()}
                  onChange={(value) => settings.general.setPreviewAutoOpen(value)}
                  hideLabel
                >
                  {language.t("settings.general.row.previewWhileWorking.title")}
                </Switch>
              </div>
            </SettingsRowV2>
          </SettingsListV2>

          <div class="settings-v2-kit-section">
            {label(language.t("settings.general.section.titlebar"))}
            <div class="settings-v2-kit-card">
              <span class="settings-v2-kit-card-description">{language.t("settings.general.titlebar.description")}</span>
              <div class="settings-v2-general-titlebar" role="group" aria-label={language.t("settings.general.section.titlebar")}>
                <For each={TITLEBAR}>
                  {(item) => {
                    const checked = () => settings.general[item.key]()
                    const setter = `set${item.key[0]!.toUpperCase()}${item.key.slice(1)}` as Setter
                    return (
                      <button
                        type="button"
                        class="settings-v2-general-titlebar-item"
                        aria-pressed={checked()}
                        data-action={`settings-${item.key.replace(/^show/, "show-").replace(/([a-z])([A-Z])/g, "$1-$2").toLowerCase()}`}
                        title={language.t(`settings.general.row.${item.key}.description`)}
                        onClick={() => settings.general[setter](!checked())}
                      >
                        <Icon name={item.icon} size="small" />
                        <span>{language.t(`settings.general.titlebar.${item.key}`)}</span>
                      </button>
                    )
                  }}
                </For>
              </div>
            </div>
          </div>
        </Show>

        <Show when={section() === "desktop"}>
          <div class="settings-v2-kit-hero" data-action="settings-updates-startup">
            <span class="settings-v2-kit-hero-icon" aria-hidden="true">
              <Icon name="download" />
            </span>
            <div class="settings-v2-kit-hero-copy">
              <span class="settings-v2-kit-hero-title">{language.t("settings.general.section.updates")}</span>
              <span class="settings-v2-kit-hero-description">{language.t("settings.general.updates.auto")}</span>
            </div>
            <div class="settings-v2-kit-actions">
              <ButtonV2 size="small" variant="outline" disabled={!updater.action().run} onClick={() => updater.run()}>
                {language.t(updater.action().label)}
              </ButtonV2>
              <Switch checked={machine.updates} onChange={(value) => void storeSet("updates", CHECK_UPDATES, value)} hideLabel>
                {language.t("settings.general.updates.auto")}
              </Switch>
            </div>
          </div>

          <SettingsListV2 density="compact">
            <Show when={platform.os === "windows" || platform.os === "macos"}>
              {toggle({
                title: language.t("settings.general.loginItem.title"),
                description: language.t("settings.general.row.loginItem.description"),
                checked: machine.login,
                onChange: setLogin,
                action: "settings-login-item",
              })}
            </Show>
            <Show when={platform.os !== "macos"}>
              {toggle({
                title: language.t("settings.general.row.minimizeToTray.title"),
                description: language.t("settings.general.row.minimizeToTray.description"),
                checked: machine.tray,
                onChange: (value) => void storeSet("tray", MINIMIZE_TO_TRAY, value),
                action: "settings-minimize-to-tray",
              })}
            </Show>
            <Show when={platform.setUiZoom}>
              <SettingsRowV2 title={language.t("settings.general.scale.title")} description={language.t("settings.general.scale.description")}>
                {segmented({
                  value: String(UI_SCALES.find((scale) => Math.abs(scale - (platform.webviewZoom?.() ?? 1)) < 0.01) ?? ""),
                  options: UI_SCALES.map(String),
                  label: (option) => `${Math.round(Number(option) * 100)}%`,
                  onChange: (value) => platform.setUiZoom?.(Number(value)),
                  aria: language.t("settings.general.scale.title"),
                  action: "settings-ui-scale",
                })}
              </SettingsRowV2>
            </Show>
            {toggle({
              title: language.t("settings.general.row.pinchZoom.title"),
              description: language.t("settings.general.row.pinchZoom.description"),
              checked: machine.pinch,
              onChange: setPinch,
              action: "settings-pinch-zoom",
            })}
            <SettingsRowV2 title={language.t("settings.general.row.fileWatcher.title")} description={language.t("settings.general.fileWatcher.short")}>
              <div class="settings-v2-row-inline" data-action="settings-file-watcher">
                <span class="settings-v2-kit-pill" data-tone="warn">{language.t("settings.general.restartPill")}</span>
                <Switch checked={machine.watcher} onChange={(value) => setWatcher(value)} hideLabel>
                  {language.t("settings.general.row.fileWatcher.title")}
                </Switch>
              </div>
            </SettingsRowV2>
          </SettingsListV2>
        </Show>

        <Show when={section() === "data"}>
          <Show when={dataFolder()}>
            {(folder) => (
              <div class="settings-v2-kit-hero" data-action="settings-data-folder">
                <span class="settings-v2-kit-hero-icon" aria-hidden="true">
                  <Icon name="folder" />
                </span>
                <div class="settings-v2-kit-hero-copy">
                  <span class="settings-v2-kit-hero-title">{language.t("settings.general.row.dataFolder.title")}</span>
                  <span class="settings-v2-kit-path" title={folder().path}>
                    {folder().path}
                  </span>
                  <span class="settings-v2-kit-hero-description">{language.t("settings.general.dataFolder.short")}</span>
                </div>
                <div class="settings-v2-kit-actions">
                  <ButtonV2 size="small" variant="outline" disabled={!platform.openPath} onClick={() => void platform.openPath?.(folder().path).catch(() => undefined)}>
                    {language.t("settings.general.row.dataFolder.open")}
                  </ButtonV2>
                </div>
              </div>
            )}
          </Show>
          <Show when={dataFolder()?.alternative}>
            {(other) => (
              <p class="settings-v2-kit-note" data-tone="info" data-action="settings-other-data-folder">
                {language.t("settings.general.row.otherDataFolder.description", {
                  path: other().path,
                  details: [
                    other().sessions === undefined
                      ? language.t("settings.general.dataFolder.sessionsUnknown")
                      : language.t("settings.general.dataFolder.sessions", { count: other().sessions! }),
                    ...(other().keys ? [language.t("settings.general.dataFolder.keys")] : []),
                  ].join(" · "),
                })}{" "}
                <ButtonV2 size="small" variant="outline" onClick={() => switchDataFolder(other().path)}>
                  {language.t("settings.general.row.otherDataFolder.button")}
                </ButtonV2>
              </p>
            )}
          </Show>

          <div class="settings-v2-kit-section">
            {label(language.t("settings.general.backups"))}
            <div class="settings-v2-kit-card" data-action="settings-auto-backup">
              <div class="settings-v2-kit-card-head">
                <span class="settings-v2-kit-card-icon" aria-hidden="true">
                  <Icon name="archive" size="small" />
                </span>
                <div class="settings-v2-kit-card-copy">
                  <span class="settings-v2-kit-card-title">{language.t("settings.general.row.autoBackup.title")}</span>
                  <span class="settings-v2-kit-card-description">{language.t("settings.general.backups.description")}</span>
                </div>
                <Switch checked={machine.backup} onChange={(value) => void storeSet("backup", AUTO_BACKUP, value)} hideLabel>
                  {language.t("settings.general.row.autoBackup.title")}
                </Switch>
              </div>
              <div class="settings-v2-kit-card-foot">
                <ButtonV2 size="small" variant="contrast" onClick={() => void backupNow()}>
                  {language.t("settings.general.row.backupNow.button")}
                </ButtonV2>
                <Show when={platform.openPath && backupsFolder()}>
                  <ButtonV2 size="small" variant="ghost" onClick={() => void platform.openPath?.(backupsFolder()!).catch(() => undefined)}>
                    {language.t("settings.general.backups.folder")}
                  </ButtonV2>
                </Show>
              </div>
              <Show
                when={backups().length > 0}
                fallback={<span class="settings-v2-kit-card-description">{language.t("settings.general.backups.none")}</span>}
              >
                <ul class="settings-v2-general-backups">
                  <For each={backups()}>
                    {(backup) => (
                      <li>
                        <span class="settings-v2-general-backup-date" title={new Date(backup.createdAt).toLocaleString(language.intl())}>
                          {new Date(backup.createdAt).toLocaleString(language.intl(), { dateStyle: "medium", timeStyle: "short" })}
                          <span>{relative(backup.createdAt)}</span>
                        </span>
                        <ButtonV2 size="small" variant="ghost" onClick={() => restoreBackup(backup.name, backup.createdAt)}>
                          {language.t("settings.general.row.restore.button")}
                        </ButtonV2>
                        <ButtonV2 size="small" variant="ghost" disabled={!platform.deleteBackup} onClick={() => deleteBackup(backup.name, backup.createdAt)}>
                          {language.t("settings.general.row.restore.delete")}
                        </ButtonV2>
                      </li>
                    )}
                  </For>
                </ul>
              </Show>
            </div>
          </div>
        </Show>
      </div>
    </div>
  )
}

const FONT_CARDS = {
  ui: { action: "settings-ui-font", title: "settings.general.row.uiFont.title", font: "ui", input: "setUI" },
  code: { action: "settings-code-font", title: "settings.general.row.font.title", font: "code", input: "setCode" },
  terminal: { action: "settings-terminal-font", title: "settings.general.row.terminalFont.title", font: "terminal", input: "setTerminal" },
} as const

function FontCard(props: { kind: keyof typeof FONT_CARDS; fonts: AppearanceSettingsController["fonts"] }): JSX.Element {
  const language = useLanguage()
  const config = () => FONT_CARDS[props.kind]
  const font = () => props.fonts[config().font]()
  return (
    <div class="settings-v2-kit-card settings-v2-general-font">
      <span class="settings-v2-kit-card-title">{language.t(config().title)}</span>
      <span class="settings-v2-general-font-sample" style={{ "font-family": font().family }}>
        Aa Ññ 0123 {"{ }"}
      </span>
      <TextInputV2
        data-action={config().action}
        type="text"
        appearance="base"
        value={font().value}
        onInput={(event) => props.fonts[config().input](event.currentTarget.value)}
        placeholder={font().placeholder}
        spellcheck={false}
        autocorrect="off"
        autocomplete="off"
        autocapitalize="off"
        aria-label={language.t(config().title)}
      />
    </div>
  )
}
