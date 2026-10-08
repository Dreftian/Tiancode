import { createMemo, createSignal, For, type JSX, onMount, type ParentProps, Show, type Component } from "solid-js"
import { setSpeed2xActive } from "@/utils/speed-mode"
import { useDialog } from "@tiancode-ai/ui/context/dialog"
import { ButtonV2 } from "@tiancode-ai/ui/v2/button-v2"
import { Tag } from "@tiancode-ai/ui/v2/badge-v2"
import { Icon } from "@tiancode-ai/ui/v2/icon"
import { SegmentedControlItemV2, SegmentedControlV2 } from "@tiancode-ai/ui/v2/segmented-control-v2"
import { SelectV2 } from "@tiancode-ai/ui/v2/select-v2"
import { Switch } from "@tiancode-ai/ui/v2/switch-v2"
import { Mark } from "@tiancode-ai/ui/logo"
import { useLanguage, type Locale } from "@/context/language"
import { useTheme, type ColorScheme } from "@tiancode-ai/ui/theme/context"
import { useGlobal } from "@/context/global"
import { usePlatform } from "@/context/platform"
import { ServerConnection, useServer } from "@/context/server"
import {
  previewOnFinishOptions,
  tabLayouts,
  terminalPlacements,
  transcriptTextSizes,
  transcriptWidths,
  useSettings,
} from "@/context/settings"
import { freeZenModels, PENDING_FREE_MODELS_KEY } from "@/components/settings-v2/free-models"
import { SettingsTimelineDetailV2 } from "@/components/settings-v2/timeline-detail"
import { UI_SCALES } from "@/ui-scale"
import "@/components/settings-v2/settings-v2.css"
import "./dialog-welcome-setup.css"

/**
 * Versión que completó el asistente por última vez.
 *
 * Hasta 1.0.48 guardaba el literal "true"; ahora guarda la versión para poder distinguir
 * «nunca se hizo» de «se hizo con una versión anterior». La clave es la misma a propósito: el
 * único almacén de versiones que ya existe (`app-version.v1`, en el contexto de ajustes) guarda
 * la última versión ARRANCADA, no la última que terminó el asistente, y se reescribe en cada
 * arranque; añadir un segundo almacén de versiones para esto sobraba.
 */
export const FIRST_LAUNCH_KEY = "tiancode.first_launch.completed"

/** Set when onboarding finishes; the shell opens Settings › Providers once on the next boot. */
export const PENDING_PROVIDER_SETUP_KEY = "tiancode.first_launch.open_providers"
/** Where the first main window opens: a ready-to-type chat or the home screen. */
export const START_MODE_KEY = "tiancode.first_launch.start"
/** One-shot flag the home page consumes to open the chat draft the first time. */
export const START_PENDING_KEY = "tiancode.first_launch.start_pending"
export type StartMode = "chat" | "code" | "home"
const START_MODES: readonly StartMode[] = ["chat", "code", "home"]
export function readStartMode(): StartMode {
  try {
    const value = localStorage.getItem(START_MODE_KEY)
    return START_MODES.includes(value as StartMode) ? (value as StartMode) : "chat"
  } catch {
    return "chat"
  }
}

/**
 * Por qué se abre el asistente:
 * - `first-run`: instalación nueva, no hay nada guardado → configuración completa.
 * - `upgrade`: ya no se abre solo; queda para ventanas antiguas que lo pidan.
 * - `review`: lo abrió el usuario desde Ajustes → los mismos pasos con lo ya guardado.
 */
export type WelcomeSetupMode = "first-run" | "upgrade" | "review"

/** La versión que ve el asistente: el escritorio la trae en Platform; la web, en el define de Vite. */
export function welcomeSetupVersion(version?: string) {
  return version || import.meta.env.VITE_TIANCODE_VERSION || ""
}

/**
 * Decide si toca abrirlo; `undefined` es «no abrir».
 *
 * Solo una instalación que nunca lo terminó lo ve. Una actualización conserva todo lo que el
 * usuario eligió, así que no abre nada (antes volvía a preguntar tras cada versión); desde
 * Ajustes › General se puede abrir cuando se quiera.
 */
export function welcomeSetupMode(completed: string | null): WelcomeSetupMode | undefined {
  return completed ? undefined : "first-run"
}

const STEPS = ["preferences", "interface", "layout", "conversation", "models", "start"] as const
type StepID = (typeof STEPS)[number]

/** Los nombres de idioma van en su propia lengua a propósito: no se traducen. */
const LOCALE_OPTIONS: { locale: Locale; name: string }[] = [
  { locale: "es", name: "Español" },
  { locale: "en", name: "English" },
  { locale: "en-150", name: "English (EU)" },
  { locale: "zh", name: "中文" },
  { locale: "ja", name: "日本語" },
  { locale: "ko", name: "한국어" },
  { locale: "ru", name: "Русский" },
]

const THEME_OPTIONS: { mode: ColorScheme; key: string }[] = [
  { mode: "dark", key: "welcome.theme.dark" },
  { mode: "light", key: "welcome.theme.light" },
  { mode: "system", key: "welcome.theme.system" },
]
const THEME_MODES = THEME_OPTIONS.map((option) => option.mode)
const UI_SCALE_OPTIONS = UI_SCALES.map(String)
const WORKSPACE_OPTIONS = ["starter", "own"] as const
const FOLLOWUP_OPTIONS = ["steer", "queue"] as const

export const DialogWelcomeSetup: Component<{ onDone?: () => void; mode?: WelcomeSetupMode }> = (props) => {
  const dialog = useDialog()
  const language = useLanguage()
  const theme = useTheme()
  const platform = usePlatform()
  const settings = useSettings()
  const global = useGlobal()
  const server = useServer()

  // The welcome window has no server sync of its own, but the global context already holds the
  // connection to the app's server (the sidecar boots while this card is on screen).
  const serverCtx = () => {
    const list = global.servers.list()
    const conn = list.find((item) => ServerConnection.key(item) === server.key) ?? list[0]
    return conn ? global.ensureServerCtx(conn) : undefined
  }
  const savedFreeModels = () => serverCtx()?.sync.data.config?.free_models === true
  const zenModels = createMemo(() => freeZenModels(serverCtx()?.sync.data.provider?.all?.get("opencode")))

  const [step, setStep] = createSignal(0)
  const [visited, setVisited] = createSignal(1)
  const [finishing, setFinishing] = createSignal(false)
  const [createDefaultProject, setCreateDefaultProject] = createSignal(true)
  const [startMode, setStartMode] = createSignal<StartMode>(readStartMode())
  const [selectedLocale, setSelectedLocale] = createSignal<Locale>(language.locale())
  const [selectedTheme, setSelectedTheme] = createSignal<ColorScheme>(theme.colorScheme())
  // Only a choice the user makes here is saved. The switch shows the saved value until then: the
  // server's config can arrive after this card opens, and reading it once at mount turned an
  // untouched switch into `free_models: false` on Finish.
  const [freeChoice, setFreeChoice] = createSignal<boolean>()
  const freeModels = () => freeChoice() ?? savedFreeModels()

  const t = (key: string, params?: Record<string, string | number>) => language.t(key, params)
  const firstRun = () => props.mode === undefined || props.mode === "first-run"
  const current = () => STEPS[step()]!
  const last = () => step() === STEPS.length - 1
  const themes = createMemo(() => theme.ids().map((id) => ({ id, name: theme.name(id) })))
  const scale = () => UI_SCALES.find((value) => Math.abs(value - (platform.webviewZoom?.() ?? 1)) < 0.01)

  onMount(() => void theme.loadThemes())

  let stepsNav: HTMLElement | undefined
  const go = (index: number) => {
    const next = Math.max(0, Math.min(STEPS.length - 1, index))
    setStep(next)
    setVisited((count) => Math.max(count, next + 1))
    // On narrow windows the steps are a scrolling row: keep the current one in view.
    stepsNav?.children[next]?.scrollIntoView({ block: "nearest", inline: "nearest" })
  }

  const handleSelectLanguage = (loc: Locale) => {
    setSelectedLocale(loc)
    // setLocale ya persiste el idioma en el store "language": no hay segunda copia que escribir.
    language.setLocale(loc)
  }

  const handleSelectTheme = (mode: ColorScheme) => {
    setSelectedTheme(mode)
    // setColorScheme ya persiste en "tiancode-color-scheme" y estampa data-color-scheme en <html>.
    // No tocamos data-theme aquí: ese atributo guarda el ID del tema (oc-2), no el esquema, y
    // escribirle "dark"/"light" desactivaba las reglas html[data-theme="oc-2"] hasta el siguiente render.
    theme.setColorScheme(mode)
  }

  // The switch reaches the server directly when it can. Otherwise the main window applies it once
  // its server answers (PendingFreeModelsRunner), before any session can be running.
  const saveFreeModels = async () => {
    const choice = freeChoice()
    if (choice === undefined || choice === savedFreeModels()) return
    const ctx = serverCtx()
    const applied = ctx?.sync.data.path
      ? await ctx.sdk.client.global.config.update({ config: { free_models: choice } }).then(
          () => true,
          () => false,
        )
      : false
    if (applied) return
    try {
      localStorage.setItem(PENDING_FREE_MODELS_KEY, choice ? "on" : "off")
    } catch {
      // Without storage the choice is lost; Settings › Providers still offers the same switch.
    }
  }

  const handleFinish = async () => {
    if (finishing()) return
    setFinishing(true)
    try {
      localStorage.setItem(FIRST_LAUNCH_KEY, version() || "true")
      localStorage.setItem(START_MODE_KEY, startMode())
      if (firstRun()) {
        // The chat opens with reasoning on Auto, fast mode off and permissions on Auto: the app's
        // defaults, so only the persisted fast-mode switch needs resetting.
        setSpeed2xActive(false)
        localStorage.setItem(START_PENDING_KEY, startMode())
        // Una instalación nueva no tiene ningún proveedor, así que siempre dejamos abiertos los
        // ajustes: es lo único que hace utilizable la app y se cierra con Esc si no toca ahora.
        localStorage.setItem(PENDING_PROVIDER_SETUP_KEY, "true")
      }
    } catch {
      // Onboarding must never trap the user behind a storage failure — continue to the app.
    }
    await saveFreeModels()
    try {
      // Al repasarlo desde Ajustes marca la clave del electron-store (el único registro que
      // sobrevive a un borrado de localStorage) y, con `false`, no crea ninguna carpeta.
      await window.api?.finishFirstLaunchOnboarding?.(firstRun() ? createDefaultProject() : false)
    } catch {
      // The desktop shell may be unavailable in the browser build; the app still opens.
    }
    props.onDone?.()
    dialog.close()
  }

  const version = () => welcomeSetupVersion(platform.version)

  const startChooser = () => (
    <div class="welcome-setup-start" role="radiogroup" aria-label={t("welcome.start.title")}>
      <For each={START_MODES}>
        {(mode) => (
          <button
            type="button"
            class="welcome-setup-start-card"
            role="radio"
            aria-checked={startMode() === mode}
            data-selected={startMode() === mode}
            onClick={() => setStartMode(mode)}
          >
            <span
              class="welcome-setup-start-art"
              classList={{
                "welcome-setup-start-art--code": mode === "code",
                "welcome-setup-start-art--home": mode === "home",
              }}
              aria-hidden="true"
            >
              <Show when={mode === "chat"}>
                <span class="welcome-setup-start-art-word">TIANCODE</span>
                <span class="welcome-setup-start-art-box">
                  <i />
                  <b />
                </span>
              </Show>
              <Show when={mode === "code"}>
                <span class="welcome-setup-start-art-folder">
                  <i />
                  <b />
                </span>
                <span class="welcome-setup-start-art-box">
                  <i />
                  <b />
                </span>
              </Show>
              <Show when={mode === "home"}>
                <span class="welcome-setup-start-art-side">
                  <i />
                  <i />
                  <i />
                </span>
                <span class="welcome-setup-start-art-main">
                  <i />
                  <b />
                </span>
              </Show>
            </span>
            <span class="welcome-setup-start-name">{t(`welcome.start.${mode}`)}</span>
            <span class="welcome-setup-start-desc">{t(`welcome.start.${mode}.desc`)}</span>
          </button>
        )}
      </For>
    </div>
  )

  // A small conversation drawn with the transcript's own CSS variables, so the size and width
  // picked on this step show up here exactly as they will in the chat.
  const transcriptPreview = () => (
    <div class="welcome-setup-preview" aria-hidden="true">
      <span class="welcome-setup-preview-label">{t("welcome.preview.title")}</span>
      <div class="welcome-setup-preview-transcript">
        <p class="welcome-setup-preview-user">{t("welcome.preview.user")}</p>
        <p class="welcome-setup-preview-assistant">{t("welcome.preview.assistant")}</p>
        <span class="welcome-setup-preview-status">
          <i />
          {t("welcome.preview.status")}
        </span>
      </div>
    </div>
  )

  const tabsPreview = (layout: (typeof tabLayouts)[number]) => (
    <button
      type="button"
      class="welcome-setup-layout-card"
      role="radio"
      aria-checked={settings.appearance.tabLayout() === layout}
      data-selected={settings.appearance.tabLayout() === layout}
      onClick={() => settings.appearance.setTabLayout(layout)}
    >
      <span class={`welcome-setup-layout-art welcome-setup-layout-art--${layout}`} aria-hidden="true">
        <span class="welcome-setup-layout-tabs">
          <i />
          <i />
          <i />
        </span>
        <span class="welcome-setup-layout-page" />
      </span>
      <span class="welcome-setup-start-name">{t(`settings.experimental.tabs.${layout}`)}</span>
    </button>
  )

  // Each control is a component with lazy props: a value change updates it in place, so keyboard
  // focus stays on it (helpers that read their values when called rebuilt it on every change).
  const panels: Record<StepID, () => JSX.Element> = {
    preferences: () => (
      <>
        <WelcomeField name={t("welcome.language.field")}>
          <SelectV2
            options={LOCALE_OPTIONS}
            current={LOCALE_OPTIONS.find((option) => option.locale === selectedLocale())}
            value={(option) => option.locale}
            label={(option) => option.name}
            placement="bottom-end"
            gutter={6}
            onSelect={(option) => option && handleSelectLanguage(option.locale)}
          />
        </WelcomeField>
        <WelcomeField name={t("welcome.theme.label")}>
          <WelcomeSegmented
            value={selectedTheme()}
            options={THEME_MODES}
            label={(mode) => t(THEME_OPTIONS.find((option) => option.mode === mode)!.key)}
            onChange={handleSelectTheme}
            aria={t("welcome.theme.label")}
          />
        </WelcomeField>
        <WelcomeField name={t("settings.general.row.theme.title")} hint={t("settings.general.row.theme.description")}>
          <SelectV2
            options={themes()}
            current={themes().find((option) => option.id === theme.themeId())}
            value={(option) => option.id}
            label={(option) => option.name}
            placement="bottom-end"
            gutter={6}
            onSelect={(option) => option && theme.setTheme(option.id)}
          />
        </WelcomeField>
        {/* Mientras el store todavía se lee del disco los interruptores van desactivados: enseñar
            "apagado" cuando el valor guardado aún no ha llegado sería mentir. */}
        <WelcomeToggle
          name={t("welcome.pet.label")}
          hint={t("welcome.pet.desc")}
          checked={settings.general.petEnabled()}
          disabled={!settings.ready()}
          onChange={(checked) => settings.general.setPetEnabled(checked)}
        />
        <WelcomeToggle
          name={t("welcome.speak.label")}
          hint={t("welcome.speak.desc")}
          checked={settings.general.autoSpeak()}
          disabled={!settings.ready()}
          onChange={(checked) => settings.general.setAutoSpeak(checked)}
        />
      </>
    ),
    interface: () => (
      <div class="welcome-setup-split">
        <div class="welcome-setup-fields">
          <Show when={platform.setUiZoom}>
            <WelcomeField name={t("settings.general.scale.title")} hint={t("welcome.scale.hint")} stack>
              <WelcomeSegmented
                value={scale() === undefined ? undefined : String(scale())}
                options={UI_SCALE_OPTIONS}
                label={(option) => `${Math.round(Number(option) * 100)} %`}
                onChange={(value) => platform.setUiZoom?.(Number(value))}
                aria={t("settings.general.scale.title")}
              />
            </WelcomeField>
          </Show>
          <WelcomeField
            name={t("settings.general.row.transcriptText.title")}
            hint={t("settings.general.row.transcriptText.description")}
            stack
          >
            <WelcomeSegmented
              value={settings.appearance.transcriptText()}
              options={transcriptTextSizes}
              label={(option) => t(`settings.general.row.transcriptText.option.${option}`)}
              onChange={(value) => settings.appearance.setTranscriptText(value)}
              aria={t("settings.general.row.transcriptText.title")}
            />
          </WelcomeField>
          <WelcomeField
            name={t("settings.general.row.transcriptWidth.title")}
            hint={t("settings.general.row.transcriptWidth.description")}
            stack
          >
            <WelcomeSegmented
              value={settings.appearance.transcriptWidth()}
              options={transcriptWidths}
              label={(option) => t(`settings.general.row.transcriptWidth.option.${option}`)}
              onChange={(value) => settings.appearance.setTranscriptWidth(value)}
              aria={t("settings.general.row.transcriptWidth.title")}
            />
          </WelcomeField>
        </div>
        {transcriptPreview()}
      </div>
    ),
    layout: () => (
      <>
        <div class="welcome-setup-stack">
          <span class="welcome-setup-field-name">{t("settings.experimental.tabs.title")}</span>
          <span class="welcome-setup-hint">{t("settings.general.tabs.description")}</span>
          <div class="welcome-setup-layout" role="radiogroup" aria-label={t("settings.experimental.tabs.title")}>
            <For each={tabLayouts}>{(layout) => tabsPreview(layout)}</For>
          </div>
        </div>
        <Show when={settings.appearance.tabLayout() === "vertical"}>
          <WelcomeToggle
            name={t("settings.experimental.projectNames.title")}
            hint={t("welcome.projectNames.hint")}
            checked={settings.appearance.showProjectName()}
            onChange={(value) => settings.appearance.setShowProjectName(value)}
          />
        </Show>
        <WelcomeField
          name={t("settings.general.row.terminalPlacement.title")}
          hint={t("settings.general.row.terminalPlacement.description")}
        >
          <WelcomeSegmented
            value={settings.general.terminalPlacement()}
            options={terminalPlacements}
            label={(option) => t(`settings.general.row.terminalPlacement.${option}`)}
            onChange={(value) => settings.general.setTerminalPlacement(value)}
            aria={t("settings.general.row.terminalPlacement.title")}
          />
        </WelcomeField>
        <WelcomeField
          name={t("settings.general.row.previewOnFinish.title")}
          hint={t("settings.general.row.previewOnFinish.description")}
        >
          <SelectV2
            options={[...previewOnFinishOptions]}
            current={settings.general.previewOnFinish()}
            label={(option) => t(`settings.general.row.previewOnFinish.${option}`)}
            onSelect={(option) => option && settings.general.setPreviewOnFinish(option)}
            placement="bottom-end"
            gutter={6}
          />
        </WelcomeField>
        <Show when={firstRun()}>
          <div class="welcome-setup-stack">
            <span class="welcome-setup-field-name">{t("welcome.workspace.title")}</span>
            <WelcomeSegmented
              value={createDefaultProject() ? "starter" : "own"}
              options={WORKSPACE_OPTIONS}
              label={(option) =>
                t(option === "starter" ? "welcome.workspace.createDefault" : "welcome.workspace.chooseLater")
              }
              onChange={(value) => setCreateDefaultProject(value === "starter")}
              aria={t("welcome.workspace.title")}
            />
            <span class="welcome-setup-hint">
              {createDefaultProject() ? t("welcome.workspace.createDefault.desc") : t("welcome.workspace.chooseLater.desc")}
            </span>
          </div>
        </Show>
      </>
    ),
    conversation: () => (
      <>
        <div class="welcome-setup-timeline">
          <SettingsTimelineDetailV2 />
        </div>
        <WelcomeField name={t("settings.general.row.followup.title")} hint={t("welcome.followup.hint")}>
          <WelcomeSegmented
            value={settings.general.followup()}
            options={FOLLOWUP_OPTIONS}
            label={(option) => t(`settings.general.row.followup.option.${option}`)}
            onChange={(value) => settings.general.setFollowup(value)}
            aria={t("settings.general.row.followup.title")}
          />
        </WelcomeField>
        <WelcomeToggle
          name={t("welcome.petStatus.label")}
          hint={t("welcome.petStatus.desc")}
          checked={settings.general.petInChat()}
          disabled={!settings.ready()}
          onChange={(value) => settings.general.setPetInChat(value)}
        />
      </>
    ),
    models: () => (
      <>
        <WelcomeToggle
          name={t("settings.providers.free.title")}
          hint={t("settings.providers.free.description")}
          checked={freeModels()}
          onChange={setFreeChoice}
        />
        <Show when={freeModels() && zenModels().length > 0}>
          <div class="settings-v2-free-models-list welcome-setup-free-list" aria-label={t("settings.providers.free.available")}>
            <For each={zenModels()}>{(name) => <span class="settings-v2-free-models-chip">{name}</span>}</For>
          </div>
        </Show>
        <p class="welcome-setup-hint">{t("settings.providers.free.note")}</p>
        <p class="welcome-setup-note">
          <Icon name="settings-gear" size="small" />
          <span>{t(firstRun() ? "welcome.provider.autoOpen" : "welcome.models.review")}</span>
        </p>
      </>
    ),
    start: () => (
      <>
        <div class="welcome-setup-stack welcome-setup-stack--start">
          <span class="welcome-setup-field-name">{t("welcome.start.title")}</span>
          {startChooser()}
          <span class="welcome-setup-hint">{t(firstRun() ? "welcome.start.defaults" : "welcome.start.every")}</span>
        </div>
      </>
    ),
  }

  return (
    <div class="welcome-setup" role="dialog" aria-labelledby="welcome-setup-title">
      <aside class="welcome-setup-sidebar">
        <div class="welcome-setup-header">
          <div class="welcome-setup-mark">
            {/* Mark alterna el logo blanco/negro desde data-color-scheme, que el preload ya estampó
                antes de que hidrate el contexto de tema: aquí eso importa porque es el primer pintado. */}
            <Mark class="welcome-setup-mark-logo" />
          </div>
          <div class="welcome-setup-heading">
            <div class="welcome-setup-titlerow">
              <h2 class="welcome-setup-title" id="welcome-setup-title">
                {firstRun() ? t("welcome.title") : t("welcome.confirm.title")}
              </h2>
              <Show when={version()}>
                <Tag variant="neutral">v{version()}</Tag>
              </Show>
            </div>
            <p class="welcome-setup-subtitle">{t("welcome.tagline")}</p>
          </div>
        </div>

        <nav ref={stepsNav} class="welcome-setup-steps" aria-label={t("welcome.progress")}>
          <For each={STEPS}>
            {(id, index) => (
              <button
                type="button"
                class="welcome-setup-step"
                data-state={index() === step() ? "current" : index() < visited() ? "done" : "todo"}
                aria-current={index() === step() ? "step" : undefined}
                disabled={finishing()}
                onClick={() => go(index())}
              >
                <span class="welcome-setup-step-index">
                  <Show when={index() < visited() && index() !== step()} fallback={index() + 1}>
                    <Icon name="check" size="small" />
                  </Show>
                </span>
                <span class="welcome-setup-step-copy">
                  <span class="welcome-setup-step-name">{t(`welcome.step.${id}`)}</span>
                  <span class="welcome-setup-step-desc">{t(`welcome.step.${id}.short`)}</span>
                </span>
              </button>
            )}
          </For>
        </nav>

        <p class="welcome-setup-sidebar-note">{t("welcome.everythingLater")}</p>
      </aside>

      <section class="welcome-setup-main">
        <header class="welcome-setup-main-header">
          <span class="welcome-setup-step-label">{t("welcome.stepLabel", { current: step() + 1, total: STEPS.length })}</span>
          <h3 class="welcome-setup-main-title">{t(`welcome.step.${current()}`)}</h3>
          <p class="welcome-setup-main-desc">{t(`welcome.step.${current()}.desc`)}</p>
        </header>

        <div class="welcome-setup-body">
          <Show when={current()} keyed>
            {(id) => <div class="welcome-setup-panel">{panels[id]()}</div>}
          </Show>
        </div>

        <footer class="welcome-setup-footer">
          <Show when={step() > 0} fallback={<span />}>
            <ButtonV2 variant="ghost-muted" icon="arrow-left" onClick={() => go(step() - 1)} disabled={finishing()}>
              {t("welcome.back")}
            </ButtonV2>
          </Show>
          <div class="welcome-setup-footer-actions">
            <Show when={!last()}>
              <ButtonV2 variant="ghost-muted" onClick={() => void handleFinish()} disabled={finishing()}>
                {firstRun() ? t("welcome.skip") : t("welcome.confirm.done")}
              </ButtonV2>
            </Show>
            <ButtonV2
              variant="contrast"
              icon={last() ? "check" : undefined}
              onClick={() => (last() ? void handleFinish() : go(step() + 1))}
              disabled={finishing()}
            >
              {last() ? (firstRun() ? t("welcome.finish") : t("welcome.confirm.done")) : t("welcome.next")}
            </ButtonV2>
          </div>
        </footer>
      </section>
    </div>
  )
}

/** One setting: its name and explanation, and the control beside them (or below with `stack`). */
function WelcomeField(props: ParentProps<{ name: string; hint?: string; stack?: boolean; inline?: boolean }>) {
  return (
    <div
      class="welcome-setup-field"
      classList={{ "welcome-setup-field--stack": props.stack, "welcome-setup-field--inline": props.inline }}
    >
      <span class="welcome-setup-field-text">
        <span class="welcome-setup-field-name">{props.name}</span>
        <Show when={props.hint}>
          <span class="welcome-setup-hint">{props.hint}</span>
        </Show>
      </span>
      <div class="welcome-setup-field-control">{props.children}</div>
    </div>
  )
}

function WelcomeToggle(props: {
  name: string
  hint: string
  checked: boolean
  disabled?: boolean
  onChange: (value: boolean) => void
}) {
  return (
    <WelcomeField name={props.name} hint={props.hint} inline>
      <Switch hideLabel checked={props.checked} disabled={props.disabled} onChange={props.onChange}>
        {props.name}
      </Switch>
    </WelcomeField>
  )
}

function WelcomeSegmented<T extends string>(props: {
  value: T | undefined
  options: readonly T[]
  label: (option: T) => string
  onChange: (value: T) => void
  aria: string
}) {
  return (
    <SegmentedControlV2
      value={props.value}
      onChange={(value) => {
        const option = props.options.find((item) => item === value)
        if (option) props.onChange(option)
      }}
      aria-label={props.aria}
    >
      <For each={props.options}>
        {(option) => <SegmentedControlItemV2 value={option}>{props.label(option)}</SegmentedControlItemV2>}
      </For>
    </SegmentedControlV2>
  )
}
