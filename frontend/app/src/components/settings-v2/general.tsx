import { Component, For, Show, createMemo, createResource } from "solid-js"
import { createMediaQuery } from "@solid-primitives/media"
import { ButtonV2 } from "@tiancode-ai/ui/v2/button-v2"
import { SelectV2 } from "@tiancode-ai/ui/v2/select-v2"
import { Switch } from "@tiancode-ai/ui/v2/switch-v2"
import { TextInputV2 } from "@tiancode-ai/ui/v2/text-input-v2"
import { useDialog } from "@tiancode-ai/ui/context/dialog"
import { useLanguage } from "@/context/language"
import { usePlatform } from "@/context/platform"
import { useUpdaterAction } from "../updater-action"
import {
  transcriptTextSizes,
  transcriptViews,
  transcriptWidths,
  useSettings,
  type TranscriptTextSize,
  type TranscriptView,
  type TranscriptWidth,
} from "@/context/settings"
import { ExternalLink } from "../external-link"
import { showToast } from "@/utils/toast"
import { SettingsListV2 } from "./parts/list"
import { SettingsRowV2 } from "./parts/row"
import { LayoutRetirementNotice } from "./interface-transition"
import {
  createAppearanceSettingsController,
  createPermissionScopeController,
  createShellOptions,
  createShellSettingsController,
  createSoundSettingsController,
  soundOptions,
  type AppearanceSettingsController,
  type PermissionScopeController,
  type ShellSettingsController,
  type SoundSettingsController,
} from "./general-controllers"
import "./settings-v2.css"

const schemeOptions: ("system" | "light" | "dark")[] = ["system", "light", "dark"]
const transcriptTextOptions: TranscriptTextSize[] = [...transcriptTextSizes]
const transcriptWidthOptions: TranscriptWidth[] = [...transcriptWidths]
const transcriptViewOptions: TranscriptView[] = [...transcriptViews]
// Electron store shared with the desktop main process via the store IPC.
const settingsStoreName = "tiancode.settings"
const minimizeToTrayKey = "minimizeToTray"
const fileWatcherKey = "fileWatcher"
const checkUpdatesOnStartKey = "checkUpdatesOnStart"
const autoBackupKey = "autoBackup"
const fontSettings = {
  ui: {
    action: "settings-ui-font",
    title: "settings.general.row.uiFont.title",
    description: "settings.general.row.uiFont.description",
    font: "ui",
    input: "setUI",
  },
  code: {
    action: "settings-code-font",
    title: "settings.general.row.font.title",
    description: "settings.general.row.font.description",
    font: "code",
    input: "setCode",
  },
  terminal: {
    action: "settings-terminal-font",
    title: "settings.general.row.terminalFont.title",
    description: "settings.general.row.terminalFont.description",
    font: "terminal",
    input: "setTerminal",
  },
} as const
const soundSettings = {
  agent: {
    action: "settings-sounds-agent",
    title: "settings.general.sounds.agent.title",
    description: "settings.general.sounds.agent.description",
  },
  errors: {
    action: "settings-sounds-errors",
    title: "settings.general.sounds.errors.title",
    description: "settings.general.sounds.errors.description",
  },
} as const

const PermissionScopeSetting: Component<{ controller: PermissionScopeController }> = (props) => {
  const language = useLanguage()
  return (
    <SettingsRowV2
      title={language.t("command.permissions.autoaccept.enable")}
      description={language.t("toast.permissions.autoaccept.on.description")}
    >
      <div data-action="settings-auto-accept-permissions">
        <Switch
          checked={props.controller.accepting()}
          disabled={!props.controller.enabled()}
          onChange={props.controller.set}
        />
      </div>
    </SettingsRowV2>
  )
}

const ShellSetting: Component<{ controller: ShellSettingsController }> = (props) => {
  const language = useLanguage()
  const options = createMemo(() =>
    createShellOptions({
      shells: props.controller.shells(),
      current: props.controller.current(),
    }),
  )
  return (
    <SettingsRowV2
      title={language.t("settings.general.row.shell.title")}
      description={language.t("settings.general.row.shell.description")}
    >
      <SelectV2
        appearance="inline"
        data-action="settings-shell"
        options={options()}
        current={options().find((option) => option.value === props.controller.current()) ?? options()[0]}
        placement="bottom-end"
        gutter={6}
        value={(option) => option.id}
        label={(option) => {
          if (option.id === "auto") return language.t("settings.general.row.shell.autoDefault")
          if (!option.terminalOnly) return option.name
          return `${option.name} (${language.t("settings.general.row.shell.terminalOnly")})`
        }}
        onSelect={(option) => option && props.controller.select(option.value)}
      />
    </SettingsRowV2>
  )
}

const TranscriptTextSetting = () => {
  const language = useLanguage()
  const settings = useSettings()
  return (
    <SettingsRowV2
      title={language.t("settings.general.row.transcriptText.title")}
      description={language.t("settings.general.row.transcriptText.description")}
    >
      <SelectV2
        appearance="inline"
        data-action="settings-transcript-text"
        options={transcriptTextOptions}
        current={transcriptTextOptions.find((option) => option === settings.appearance.transcriptText())}
        placement="bottom-end"
        gutter={6}
        label={(option) => language.t(`settings.general.row.transcriptText.option.${option}`)}
        onSelect={(option) => option && settings.appearance.setTranscriptText(option)}
      />
    </SettingsRowV2>
  )
}

const TranscriptWidthSetting = () => {
  const language = useLanguage()
  const settings = useSettings()
  return (
    <SettingsRowV2
      title={language.t("settings.general.row.transcriptWidth.title")}
      description={language.t("settings.general.row.transcriptWidth.description")}
    >
      <SelectV2
        appearance="inline"
        data-action="settings-transcript-width"
        options={transcriptWidthOptions}
        current={transcriptWidthOptions.find((option) => option === settings.appearance.transcriptWidth())}
        placement="bottom-end"
        gutter={6}
        label={(option) => language.t(`settings.general.row.transcriptWidth.option.${option}`)}
        onSelect={(option) => option && settings.appearance.setTranscriptWidth(option)}
      />
    </SettingsRowV2>
  )
}

const TranscriptViewSetting = () => {
  const language = useLanguage()
  const settings = useSettings()
  return (
    <SettingsRowV2
      title={language.t("settings.general.row.transcriptView.title")}
      description={language.t("settings.general.row.transcriptView.description")}
    >
      <SelectV2
        appearance="inline"
        data-action="settings-transcript-view"
        options={transcriptViewOptions}
        current={transcriptViewOptions.find((option) => option === settings.general.transcriptView())}
        placement="bottom-end"
        gutter={6}
        label={(option) => language.t(`settings.general.row.transcriptView.option.${option}`)}
        onSelect={(option) => option && settings.general.setTranscriptView(option)}
      />
    </SettingsRowV2>
  )
}

const AppearanceSection: Component<{ controller: AppearanceSettingsController }> = (props) => {
  const language = useLanguage()
  return (
    <div class="settings-v2-section">
      <h3 class="settings-v2-section-title">{language.t("settings.general.section.appearance")}</h3>
      <SettingsListV2>
        <SettingsRowV2
          title={language.t("settings.general.row.colorScheme.title")}
          description={language.t("settings.general.row.colorScheme.description")}
        >
          <SelectV2
            appearance="inline"
            data-action="settings-color-scheme"
            options={schemeOptions}
            current={schemeOptions.find((option) => option === props.controller.scheme.current())}
            placement="bottom-end"
            gutter={6}
            label={(option) => {
              if (option === "system") return language.t("theme.scheme.system")
              if (option === "light") return language.t("theme.scheme.light")
              return language.t("theme.scheme.dark")
            }}
            onSelect={(option) => option && props.controller.scheme.select(option)}
          />
        </SettingsRowV2>

        <SettingsRowV2
          title={language.t("settings.general.row.theme.title")}
          description={
            <>
              {language.t("settings.general.row.theme.description")}{" "}
              <ExternalLink class="settings-v2-link" href="https://tiancode.ai/docs/themes/">
                {language.t("common.learnMore")}
              </ExternalLink>
            </>
          }
        >
          <SelectV2
            appearance="inline"
            data-action="settings-theme"
            options={props.controller.theme.options()}
            current={props.controller.theme.current()}
            placement="bottom-end"
            gutter={6}
            value={(option) => option.id}
            label={(option) => option.name}
            onSelect={props.controller.theme.select}
          />
        </SettingsRowV2>

        <TranscriptTextSetting />
        <TranscriptWidthSetting />
        <TranscriptViewSetting />

        <FontSetting kind="ui" fonts={props.controller.fonts} />
        <FontSetting kind="code" fonts={props.controller.fonts} />
        <FontSetting kind="terminal" fonts={props.controller.fonts} />
      </SettingsListV2>
    </div>
  )
}

const FontSetting: Component<{
  kind: "ui" | "code" | "terminal"
  fonts: AppearanceSettingsController["fonts"]
}> = (props) => {
  const language = useLanguage()
  const config = () => fontSettings[props.kind]
  return (
    <SettingsRowV2 title={language.t(config().title)} description={language.t(config().description)}>
      <div class="w-full sm:w-[220px]">
        <TextInputV2
          data-action={config().action}
          type="text"
          appearance="base"
          value={props.fonts[config().font]().value}
          onInput={(event) => props.fonts[config().input](event.currentTarget.value)}
          placeholder={props.fonts[config().font]().placeholder}
          spellcheck={false}
          autocorrect="off"
          autocomplete="off"
          autocapitalize="off"
          aria-label={language.t(config().title)}
          style={{ "font-family": props.fonts[config().font]().family }}
        />
      </div>
    </SettingsRowV2>
  )
}

const SoundsSection: Component<{ controller: SoundSettingsController }> = (props) => {
  const language = useLanguage()
  return (
    <div class="settings-v2-section">
      <h3 class="settings-v2-section-title">{language.t("settings.general.section.sounds")}</h3>
      <SettingsListV2>
        <SoundSetting kind="agent" channel={props.controller.agent} />
        <SoundSetting kind="errors" channel={props.controller.errors} />
      </SettingsListV2>
    </div>
  )
}

const SoundSetting: Component<{
  kind: "agent" | "errors"
  channel: SoundSettingsController["agent"]
}> = (props) => {
  const language = useLanguage()
  const config = () => soundSettings[props.kind]
  return (
    <SettingsRowV2 title={language.t(config().title)} description={language.t(config().description)}>
      <SelectV2
        appearance="inline"
        data-action={config().action}
        options={soundOptions}
        current={props.channel.current()}
        value={(option) => option.id}
        label={(option) => language.t(option.label)}
        onHighlight={props.channel.highlight}
        onSelect={props.channel.select}
        placement="bottom-end"
        gutter={6}
      />
    </SettingsRowV2>
  )
}

const LanguageSetting = () => {
  const language = useLanguage()
  const options = createMemo(() =>
    language.locales.map((locale) => ({
      value: locale,
      label: language.label(locale),
    })),
  )
  return (
    <SettingsRowV2
      title={language.t("settings.general.row.language.title")}
      description={language.t("settings.general.row.language.description")}
    >
      <SelectV2
        appearance="inline"
        data-action="settings-language"
        options={options()}
        placement="bottom-end"
        gutter={6}
        current={options().find((option) => option.value === language.locale())}
        value={(option) => option.value}
        label={(option) => option.label}
        onSelect={(option) => option && language.setLocale(option.value)}
      />
    </SettingsRowV2>
  )
}

export const SettingsGeneralV2: Component<{
  sessionID?: string
}> = (props) => {
  const language = useLanguage()
  const platform = usePlatform()
  const dialog = useDialog()
  const settings = useSettings()
  const mobile = createMediaQuery("(max-width: 767px)")
  const updater = useUpdaterAction()
  const permissionScope = createPermissionScopeController(() => props.sessionID)
  const shell = createShellSettingsController()
  const appearance = createAppearanceSettingsController()
  const sounds = createSoundSettingsController()
  const desktop = createMemo(() => platform.platform === "desktop")

  const [pinchZoom, { mutate: setPinchZoom }] = createResource(
    () => desktop() && "getPinchZoomEnabled" in platform,
    () => Promise.resolve(platform.getPinchZoomEnabled?.() ?? false).catch(() => false),
    { initialValue: false },
  )

  const onPinchZoomChange = (checked: boolean) => {
    setPinchZoom(checked)
    const update = platform.setPinchZoomEnabled?.(checked)
    if (!update) return
    void update.catch(() => setPinchZoom(!checked))
  }

  const [minimizeToTray, { mutate: setMinimizeToTray }] = createResource(
    () => desktop() && platform.os !== "macos",
    () =>
      window.api?.storeGet
        ? window.api.storeGet(settingsStoreName, minimizeToTrayKey).then((value) => value === "true")
        : Promise.resolve(false),
    { initialValue: false },
  )

  const onMinimizeToTrayChange = (checked: boolean) => {
    setMinimizeToTray(checked)
    const update = window.api?.storeSet?.(settingsStoreName, minimizeToTrayKey, String(checked))
    if (!update) return
    void update.catch(() => setMinimizeToTray(!checked))
  }

  // Inicio con Windows: el estado real lo gestiona el sistema operativo (el
  // main registra/elimina la entrada de inicio), así que se lee de ahí y el
  // toggle aplica directamente, sin duplicar el estado en el store.
  const [loginItem, { mutate: setLoginItem }] = createResource(
    () => desktop() && platform.os === "windows",
    () => (window.api?.getLoginItem ? window.api.getLoginItem() : Promise.resolve(false)),
    { initialValue: false },
  )

  const onLoginItemChange = (checked: boolean) => {
    if (loginItem() === checked) return
    setLoginItem(checked)
    const update = window.api?.setLoginItem?.(checked)
    if (!update) return
    void update.then((actual) => setLoginItem(actual)).catch(() => setLoginItem(!checked))
  }

  // Respaldo automático de datos (sesiones + configuración): el main copia a
  // userData/backups una vez al día con rotación de 7 días. El main lee la
  // clave una sola vez, al arrancar (main/index.ts), así que el cambio se
  // aplica en el siguiente inicio; la descripción de la fila lo dice.
  const [autoBackup, { mutate: setAutoBackup }] = createResource(
    () => desktop(),
    () =>
      window.api?.storeGet
        ? window.api.storeGet(settingsStoreName, autoBackupKey).then((value) => value !== "false")
        : Promise.resolve(true),
    { initialValue: true },
  )

  const onAutoBackupChange = (checked: boolean) => {
    setAutoBackup(checked)
    const update = window.api?.storeSet?.(settingsStoreName, autoBackupKey, String(checked))
    if (!update) return
    void update.catch(() => setAutoBackup(!checked))
  }

  // Los respaldos se piden por `platform`, no por `window.api`: el preload
  // expone `window.api.backup.{now,list,restore}` y el adaptador de escritorio
  // (desktop/src/renderer/index.tsx) los publica como backupNow/listBackups/
  // restoreBackup. Llamar a `window.api.backupNow` era llamar a `undefined`, y
  // el `?.` lo convertía en un silencio que la UI leía como "no hay datos".
  const [backups, { refetch: refetchBackups }] = createResource(
    () => desktop(),
    () => platform.listBackups?.() ?? Promise.resolve([]),
    { initialValue: [] as { name: string; createdAt: number }[] },
  )

  const backupNow = async () => {
    const create = platform.backupNow
    if (!create) return
    try {
      const name = await create()
      // `backupNow` solo devuelve null cuando no había ni un archivo que
      // copiar; ese, y solo ese, es el caso que `now.failed` describe.
      if (!name) {
        showToast({ variant: "default", title: language.t("settings.general.backup.now.failed") })
        return
      }
      showToast({ variant: "success", title: language.t("settings.general.backup.now.success") })
      void refetchBackups()
    } catch {
      showToast({ variant: "error", title: language.t("settings.general.backup.now.error") })
    }
  }

  const restoreBackup = async (name: string) => {
    const restore = platform.restoreBackup
    if (!restore) return
    const confirmed = window.confirm(language.t("settings.general.backup.restore.confirm", { name }))
    if (!confirmed) return
    try {
      await restore(name)
      showToast({ variant: "success", title: language.t("settings.general.backup.restore.success") })
      // Los datos de la instancia se recargan desde disco; reiniciar la app
      // garantiza un estado totalmente limpio.
      window.api?.relaunchApp?.()
    } catch {
      showToast({ variant: "error", title: language.t("settings.general.backup.restore.failed") })
    }
  }

  const [fileWatcher, { mutate: setFileWatcher }] = createResource(
    () => desktop(),
    () =>
      window.api?.storeGet
        ? window.api.storeGet(settingsStoreName, fileWatcherKey).then((value) => value !== "false")
        : Promise.resolve(true),
    { initialValue: true },
  )

  const onFileWatcherChange = (checked: boolean) => {
    setFileWatcher(checked)
    const update = window.api?.storeSet?.(settingsStoreName, fileWatcherKey, String(checked))
    if (!update) return
    void update
      .then(() => {
        // El watcher vive en el sidecar, que lee el flag solo al arrancar; un
        // reinicio limpio aplica el cambio sin que el usuario tenga que hacerlo.
        if (!window.api?.relaunchApp) return
        if (window.confirm(language.t("settings.general.fileWatcher.restart.confirm"))) {
          void window.api.relaunchApp()
        } else {
          // Rechazado: revierte el toggle y el store para que queden coherentes.
          setFileWatcher(!checked)
          void window.api.storeSet?.(settingsStoreName, fileWatcherKey, String(!checked))
        }
      })
      .catch(() => setFileWatcher(!checked))
  }

  const [checkUpdatesOnStart, { mutate: setCheckUpdatesOnStart }] = createResource(
    () => desktop(),
    () =>
      window.api?.storeGet
        ? window.api.storeGet(settingsStoreName, checkUpdatesOnStartKey).then((value) => value !== "false")
        : Promise.resolve(true),
    { initialValue: true },
  )

  const onCheckUpdatesOnStartChange = (checked: boolean) => {
    setCheckUpdatesOnStart(checked)
    const update = window.api?.storeSet?.(settingsStoreName, checkUpdatesOnStartKey, String(checked))
    if (!update) return
    void update.catch(() => setCheckUpdatesOnStart(!checked))
  }

  const InterfaceNoticeSection = () => (
    <LayoutRetirementNotice
      title={language.t("settings.general.row.newInterfaceNotice.title")}
      description={language.t("settings.general.row.newInterfaceNotice.description")}
      dismiss={language.t("settings.general.row.newInterfaceNotice.dismiss")}
      onDismiss={() => settings.general.dismissNewInterfaceNotice()}
    />
  )

  const GeneralSection = () => (
    <div class="settings-v2-section">
      <SettingsListV2>
        <LanguageSetting />

        <SettingsRowV2
          title={language.intl().toLowerCase().startsWith("es") ? "Asistente de Bienvenida e Inicialización" : "Welcome & Setup Wizard"}
          description={language.intl().toLowerCase().startsWith("es") ? "Vuelve a abrir la pantalla de bienvenida, selección de idioma, temas y descargo de responsabilidad." : "Re-open the initial setup wizard to change language, themes, and disclaimer preferences."}
        >
          <ButtonV2
            type="button"
            variant="outline"
            size="small"
            onClick={() => {
              dialog.close()
              window.dispatchEvent(new CustomEvent("tiancode:open-welcome-setup"))
            }}
          >
            {language.intl().toLowerCase().startsWith("es") ? "Abrir Asistente" : "Open Wizard"}
          </ButtonV2>
        </SettingsRowV2>

        <PermissionScopeSetting controller={permissionScope} />

        <ShellSetting controller={shell} />

        {/* Los tres interruptores de transcripción (razonamiento, shell, edit)
            vivían aquí; ahora los escribe `TranscriptViewSetting` en Apariencia.
            Mantener ambos controles sería fatal: escriben los mismos booleanos,
            así que el último tocado ganaría y el otro mostraría un valor viejo. */}

        <Show when={mobile() && import.meta.env.VITE_TIANCODE_CHANNEL !== "prod"}>
          <SettingsRowV2
            title={language.t("settings.general.row.mobileTitlebarBottom.title")}
            description={language.t("settings.general.row.mobileTitlebarBottom.description")}
          >
            <div data-action="settings-mobile-titlebar-bottom">
              <Switch
                checked={settings.general.mobileTitlebarPosition() === "bottom"}
                onChange={(checked) => settings.general.setMobileTitlebarPosition(checked ? "bottom" : "top")}
              />
            </div>
          </SettingsRowV2>
        </Show>
      </SettingsListV2>
    </div>
  )

  const AdvancedSection = () => (
    <div class="settings-v2-section">
      <h3 class="settings-v2-section-title">{language.t("settings.general.section.advanced")}</h3>

      <SettingsListV2>
        <SettingsRowV2
          title={language.t("settings.general.row.showFileTree.title")}
          description={language.t("settings.general.row.showFileTree.description")}
        >
          <div data-action="settings-show-file-tree">
            <Switch
              checked={settings.general.showFileTree()}
              onChange={(checked) => settings.general.setShowFileTree(checked)}
            />
          </div>
        </SettingsRowV2>

        <SettingsRowV2
          title={language.t("settings.general.row.showSearch.title")}
          description={language.t("settings.general.row.showSearch.description")}
        >
          <div data-action="settings-show-search">
            <Switch
              checked={settings.general.showSearch()}
              onChange={(checked) => settings.general.setShowSearch(checked)}
            />
          </div>
        </SettingsRowV2>

        <SettingsRowV2
          title={language.t("settings.general.row.showStatus.title")}
          description={language.t("settings.general.row.showStatus.description")}
        >
          <div data-action="settings-show-status">
            <Switch
              checked={settings.general.showStatus()}
              onChange={(checked) => settings.general.setShowStatus(checked)}
            />
          </div>
        </SettingsRowV2>

        <SettingsRowV2
          title={language.t("settings.general.row.showNavigation.title")}
          description={language.t("settings.general.row.showNavigation.description")}
        >
          <div data-action="settings-show-navigation">
            <Switch
              checked={settings.general.showNavigation()}
              onChange={(checked) => settings.general.setShowNavigation(checked)}
            />
          </div>
        </SettingsRowV2>

        {/* Aquí vivían "Terminal" y "Navegador interno". Ninguno de los dos
            podía mover nada en la interfaz v2, que es la única que se monta:
            la cabecera v2 (session-header.tsx) dibuja el botón del terminal
            siempre, sin mirar `showTerminal`, y nunca dibuja el del navegador
            aunque calcule su estado (browserVisible/browserOpened), así que
            `showBrowser` tampoco tenía efecto. Se quitan los interruptores en
            lugar de dejarlos mintiendo; las claves siguen en el contexto
            porque la cabecera y preview-panel todavía las leen. Cuando la
            cabecera v2 renderice ambos botones, vuelven. */}

        {/* Apagarlo oculta el selector solo si el proyecto no tiene agentes
            propios: context/local.tsx lo muestra igualmente cuando existe uno
            (`customAgents() || hasCustomAgent(list())`). La descripción lo
            dice en lugar de prometer un ocultado que no ocurre. */}
        <SettingsRowV2
          title={language.t("settings.general.row.showCustomAgents.title")}
          description={language.t("settings.general.row.showCustomAgents.description")}
        >
          <div data-action="settings-show-custom-agents">
            <Switch
              checked={settings.general.showCustomAgents()}
              onChange={(checked) => settings.general.setShowCustomAgents(checked)}
            />
          </div>
        </SettingsRowV2>
      </SettingsListV2>
    </div>
  )

  const NotificationsSection = () => (
    <div class="settings-v2-section">
      <h3 class="settings-v2-section-title">{language.t("settings.general.section.notifications")}</h3>

      <SettingsListV2>
        <SettingsRowV2
          title={language.t("settings.general.notifications.agent.title")}
          description={language.t("settings.general.notifications.agent.description")}
        >
          <div data-action="settings-notifications-agent">
            <Switch
              checked={settings.notifications.agent()}
              onChange={(checked) => settings.notifications.setAgent(checked)}
            />
          </div>
        </SettingsRowV2>

        {/* "Permisos" se quita de Notificaciones y de Sonidos: el único sitio
            que avisa de un `permission.asked` es pages/layout.tsx (LegacyLayout),
            y la v2 navega a /server/:serverKey/session/:id, ruta que no lo monta.
            Los ajustes siguen en el contexto para cuando ese aviso se mude a
            context/notification.tsx, que sí está montado siempre. */}

        <SettingsRowV2
          title={language.t("settings.general.notifications.errors.title")}
          description={language.t("settings.general.notifications.errors.description")}
        >
          <div data-action="settings-notifications-errors">
            <Switch
              checked={settings.notifications.errors()}
              onChange={(checked) => settings.notifications.setErrors(checked)}
            />
          </div>
        </SettingsRowV2>
      </SettingsListV2>
    </div>
  )

  const UpdatesSection = () => (
    <div class="settings-v2-section">
      <h3 class="settings-v2-section-title">{language.t("settings.general.section.updates")}</h3>

      <SettingsListV2>
        <SettingsRowV2
          title={language.t("settings.general.row.releaseNotes.title")}
          description={language.t("settings.general.row.releaseNotes.description")}
        >
          <div data-action="settings-release-notes">
            <Switch
              checked={settings.general.releaseNotes()}
              onChange={(checked) => settings.general.setReleaseNotes(checked)}
            />
          </div>
        </SettingsRowV2>

        <SettingsRowV2
          title={language.t("settings.updates.row.startup.title")}
          description={language.t("settings.updates.row.startup.description")}
        >
          <div data-action="settings-updates-startup">
            <Switch checked={checkUpdatesOnStart.latest} onChange={onCheckUpdatesOnStartChange} />
          </div>
        </SettingsRowV2>

        <SettingsRowV2
          title={language.t("settings.updates.row.check.title")}
          description={language.t("settings.updates.row.check.description")}
        >
          <ButtonV2 size="normal" variant="neutral" disabled={!updater.action().run} onClick={() => updater.run()}>
            {language.t(updater.action().label)}
          </ButtonV2>
        </SettingsRowV2>
      </SettingsListV2>
    </div>
  )

  // We can probably remove this, right?
  const DisplaySection = () => (
    <Show when={desktop()}>
      <div class="settings-v2-section">
        <h3 class="settings-v2-section-title">{language.t("settings.general.section.display")}</h3>

        <SettingsListV2>
          <SettingsRowV2
            title={language.t("settings.general.row.pinchZoom.title")}
            description={language.t("settings.general.row.pinchZoom.description")}
          >
            <div data-action="settings-pinch-zoom">
              <Switch checked={pinchZoom.latest} onChange={onPinchZoomChange} />
            </div>
          </SettingsRowV2>

          <Show when={platform.os !== "macos"}>
            <SettingsRowV2
              title={language.t("settings.general.row.minimizeToTray.title")}
              description={language.t("settings.general.row.minimizeToTray.description")}
            >
              <div data-action="settings-minimize-to-tray">
                <Switch checked={minimizeToTray.latest} onChange={onMinimizeToTrayChange} />
              </div>
            </SettingsRowV2>
          </Show>

          <Show when={platform.os === "windows"}>
            <SettingsRowV2
              title={language.t("settings.general.row.loginItem.title")}
              description={language.t("settings.general.row.loginItem.description")}
            >
              <div data-action="settings-login-item">
                <Switch checked={loginItem.latest} onChange={onLoginItemChange} />
              </div>
            </SettingsRowV2>
          </Show>

          <SettingsRowV2
            title={language.t("settings.general.row.fileWatcher.title")}
            description={language.t("settings.general.row.fileWatcher.description")}
          >
            <div data-action="settings-file-watcher">
              <Switch checked={fileWatcher.latest} onChange={onFileWatcherChange} />
            </div>
          </SettingsRowV2>
        </SettingsListV2>
      </div>
    </Show>
  )

  const DataSection = () => (
    <Show when={desktop()}>
      <div class="settings-v2-section">
        <h3 class="settings-v2-section-title">{language.t("settings.general.section.data")}</h3>

        <SettingsListV2>
          <SettingsRowV2
            title={language.t("settings.general.row.autoBackup.title")}
            description={language.t("settings.general.row.autoBackup.description")}
          >
            <div data-action="settings-auto-backup">
              <Switch checked={autoBackup.latest} onChange={onAutoBackupChange} />
            </div>
          </SettingsRowV2>

          <SettingsRowV2
            title={language.t("settings.general.row.backupNow.title")}
            description={language.t("settings.general.row.backupNow.description")}
          >
            <ButtonV2 type="button" variant="outline" size="small" onClick={() => void backupNow()}>
              {language.t("settings.general.row.backupNow.button")}
            </ButtonV2>
          </SettingsRowV2>

          <Show when={backups()!.length > 0}>
            <SettingsRowV2
              title={language.t("settings.general.row.restore.title")}
              description={language.t("settings.general.row.restore.description")}
            >
              <div class="flex flex-col items-end gap-1">
                <For each={backups()!.slice(0, 3)}>
                  {(backup) => (
                    <div class="flex items-center gap-2 text-12-regular text-text-strong">
                      <span>{new Date(backup.createdAt).toLocaleString()}</span>
                      <ButtonV2
                        type="button"
                        variant="ghost"
                        size="small"
                        onClick={() => void restoreBackup(backup.name)}
                      >
                        {language.t("settings.general.row.restore.button")}
                      </ButtonV2>
                    </div>
                  )}
                </For>
              </div>
            </SettingsRowV2>
          </Show>
        </SettingsListV2>
      </div>
    </Show>
  )

  return (
    <>
      <div class="settings-v2-tab-header">
        <h2 class="settings-v2-tab-title">{language.t("settings.tab.general")}</h2>
      </div>

      <div class="settings-v2-tab-body">
        <Show when={settings.general.newInterfaceNoticeVisible()}>
          <InterfaceNoticeSection />
        </Show>

        <GeneralSection />

        <AppearanceSection controller={appearance} />

        <NotificationsSection />

        <SoundsSection controller={sounds} />

        <Show when={desktop()}>
          <UpdatesSection />
        </Show>

        <DisplaySection />

        <DataSection />

        <AdvancedSection />
      </div>
    </>
  )
}
