import { createSignal, For, Show, type Component } from "solid-js"
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
import { usePlatform } from "@/context/platform"
import { isAppUpgrade, useSettings } from "@/context/settings"
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

/**
 * Por qué se abre el asistente:
 * - `first-run`: instalación nueva, no hay nada guardado → configuración completa.
 * - `upgrade`: la versión en marcha es más nueva que la que lo completó → confirmación rápida.
 * - `review`: lo abrió el usuario desde Ajustes → misma confirmación, otro encabezado.
 */
export type WelcomeSetupMode = "first-run" | "upgrade" | "review"

const VERSION_PATTERN = /^v?\d+\.\d+\.\d+(?:[-+].*)?$/i

/** La versión que ve el asistente: el escritorio la trae en Platform; la web, en el define de Vite. */
export function welcomeSetupVersion(version?: string) {
  return version || import.meta.env.VITE_TIANCODE_VERSION || ""
}

/**
 * Decide si toca abrirlo y con qué encabezado; `undefined` es «no abrir».
 *
 * Un valor guardado que no es una versión solo puede venir del "true" de 1.0.48: esa instalación
 * ya pasó por el asistente, así que se trata como actualización (una confirmación de un clic) y
 * al terminar queda sellada con la versión real. Sin versión en marcha no se puede comparar, y
 * abrirlo «por si acaso» en cada arranque sería peor que no abrirlo.
 */
export function welcomeSetupMode(completed: string | null, current: string): WelcomeSetupMode | undefined {
  if (!completed) return "first-run"
  if (!current) return undefined
  if (!VERSION_PATTERN.test(completed.trim())) return "upgrade"
  return isAppUpgrade(completed, current) ? "upgrade" : undefined
}

const STEPS = ["welcome.step.preferences", "welcome.step.workspace"] as const

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

export const DialogWelcomeSetup: Component<{ onDone?: () => void; mode?: WelcomeSetupMode }> = (props) => {
  const dialog = useDialog()
  const language = useLanguage()
  const theme = useTheme()
  const platform = usePlatform()
  const settings = useSettings()

  const [step, setStep] = createSignal(1)
  const [finishing, setFinishing] = createSignal(false)
  const [createDefaultProject, setCreateDefaultProject] = createSignal(true)
  const [selectedLocale, setSelectedLocale] = createSignal<Locale>(language.locale())
  const [selectedTheme, setSelectedTheme] = createSignal<ColorScheme>(theme.colorScheme())

  const t = (key: string, params?: Record<string, string | number>) => language.t(key, params)

  // Reabrirlo en cada actualización solo es aceptable si no vuelve a preguntar lo ya respondido:
  // en este modo los cuatro controles llegan con el valor guardado, no hay paso de espacio de
  // trabajo (ya existe uno) y terminar es un clic.
  const confirming = () => props.mode !== undefined && props.mode !== "first-run"
  const totalSteps = () => (confirming() ? 1 : STEPS.length)

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

  const handleFinish = async () => {
    if (finishing()) return
    setFinishing(true)
    try {
      localStorage.setItem(FIRST_LAUNCH_KEY, version() || "true")
      // Una instalación nueva no tiene ningún proveedor, así que siempre dejamos abiertos los
      // ajustes: es lo único que hace utilizable la app y se cierra con Esc si no toca ahora.
      // Al confirmar tras una actualización no: esa instalación ya eligió proveedor.
      if (!confirming()) localStorage.setItem(PENDING_PROVIDER_SETUP_KEY, "true")
    } catch {
      // Onboarding must never trap the user behind a storage failure — continue to the app.
    }
    try {
      // Segunda llamada inofensiva cuando solo se confirma: marca la clave del electron-store
      // (el único registro que sobrevive a un borrado de localStorage) y, con `false`, no crea
      // ninguna carpeta.
      await window.api?.finishFirstLaunchOnboarding?.(confirming() ? false : createDefaultProject())
    } catch {
      // The desktop shell may be unavailable in the browser build; the app still opens.
    }
    props.onDone?.()
    dialog.close()
  }

  const goNext = () => {
    if (step() >= totalSteps()) return void handleFinish()
    setStep((s) => Math.min(totalSteps(), s + 1))
  }
  const goBack = () => setStep((s) => Math.max(1, s - 1))

  const version = () => welcomeSetupVersion(platform.version)
  const stepLabel = () => t("welcome.stepLabel", { current: step(), total: totalSteps() })
  const currentLocale = () => LOCALE_OPTIONS.find((option) => option.locale === selectedLocale())
  const title = () => (confirming() ? t("welcome.confirm.title") : t("welcome.title"))
  const subtitle = () => {
    if (props.mode === "upgrade") return t("welcome.confirm.updated")
    if (confirming()) return t("welcome.confirm.review")
    return `${stepLabel()} · ${t(STEPS[step() - 1])}`
  }

  return (
    <div class="welcome-setup" role="dialog" aria-labelledby="welcome-setup-title">
      <div class="welcome-setup-header">
        <div class="welcome-setup-mark">
          {/* Mark alterna el logo blanco/negro desde data-color-scheme, que el preload ya estampó
              antes de que hidrate el contexto de tema: aquí eso importa porque es el primer pintado. */}
          <Mark class="welcome-setup-mark-logo" />
        </div>
        <div class="welcome-setup-heading">
          <div class="welcome-setup-titlerow">
            <h2 class="welcome-setup-title" id="welcome-setup-title">
              {title()}
            </h2>
            <Show when={version()}>
              <Tag variant="neutral">v{version()}</Tag>
            </Show>
          </div>
          <p class="welcome-setup-subtitle">{subtitle()}</p>
        </div>
      </div>

      {/* Una sola pantalla no tiene progreso que enseñar: la barra solo aparece cuando hay pasos. */}
      <Show when={!confirming()}>
        <div
          class="welcome-setup-progress"
          role="progressbar"
          aria-label={t("welcome.progress")}
          aria-valuemin={1}
          aria-valuemax={totalSteps()}
          aria-valuenow={step()}
          aria-valuetext={stepLabel()}
        >
          <For each={STEPS}>
            {(_, index) => (
              <span
                class="welcome-setup-progress-segment"
                data-state={index() + 1 < step() ? "done" : index() + 1 === step() ? "current" : "todo"}
              />
            )}
          </For>
        </div>
      </Show>

      <div class="welcome-setup-body" classList={{ "welcome-setup-body--flush": confirming() }}>
        <Show when={step() === 1}>
          <div class="welcome-setup-panel">
            <div class="welcome-setup-field" role="group" aria-labelledby="welcome-setup-language-label">
              <span class="welcome-setup-field-name" id="welcome-setup-language-label">
                {t("welcome.language.field")}
              </span>
              <div class="welcome-setup-field-control">
                <SelectV2
                  options={LOCALE_OPTIONS}
                  current={currentLocale()}
                  value={(option) => option.locale}
                  label={(option) => option.name}
                  placement="bottom-end"
                  gutter={6}
                  onSelect={(option) => option && handleSelectLanguage(option.locale)}
                />
              </div>
            </div>

            <div class="welcome-setup-field" role="group" aria-labelledby="welcome-setup-theme-label">
              <span class="welcome-setup-field-name" id="welcome-setup-theme-label">
                {t("welcome.theme.label")}
              </span>
              <div class="welcome-setup-field-control">
                <SegmentedControlV2
                  value={selectedTheme()}
                  onChange={(value) => value && handleSelectTheme(value as ColorScheme)}
                >
                  <For each={THEME_OPTIONS}>
                    {(option) => <SegmentedControlItemV2 value={option.mode}>{t(option.key)}</SegmentedControlItemV2>}
                  </For>
                </SegmentedControlV2>
              </div>
            </div>

            {/*
              Las dos preguntas nuevas escriben directamente en settings.v3 —la misma clave que
              lee el panel de Ajustes—, así que al reabrirse tras una actualización llegan ya con
              la respuesta anterior sin copiarla a ningún sitio. Mientras el store todavía se lee
              del disco los interruptores van desactivados: enseñar "apagado" cuando el valor
              guardado aún no ha llegado sería mentir, y escribir antes de tiempo se perdería.
            */}
            <div class="welcome-setup-field welcome-setup-field--switch">
              <span class="welcome-setup-field-text">
                <span class="welcome-setup-field-name">{t("welcome.pet.label")}</span>
                <span class="welcome-setup-hint">{t("welcome.pet.desc")}</span>
              </span>
              <div class="welcome-setup-field-control">
                <Switch
                  hideLabel
                  checked={settings.general.petEnabled()}
                  disabled={!settings.ready()}
                  onChange={(checked) => settings.general.setPetEnabled(checked)}
                >
                  {t("welcome.pet.label")}
                </Switch>
              </div>
            </div>

            <div class="welcome-setup-field welcome-setup-field--switch">
              <span class="welcome-setup-field-text">
                <span class="welcome-setup-field-name">{t("welcome.speak.label")}</span>
                <span class="welcome-setup-hint">{t("welcome.speak.desc")}</span>
              </span>
              <div class="welcome-setup-field-control">
                <Switch
                  hideLabel
                  checked={settings.general.autoSpeak()}
                  disabled={!settings.ready()}
                  onChange={(checked) => settings.general.setAutoSpeak(checked)}
                >
                  {t("welcome.speak.label")}
                </Switch>
              </div>
            </div>
          </div>
        </Show>

        <Show when={step() === 2}>
          <div class="welcome-setup-panel">
            <div class="welcome-setup-stack" role="group" aria-labelledby="welcome-setup-workspace-label">
              <span class="welcome-setup-field-name" id="welcome-setup-workspace-label">
                {t("welcome.workspace.title")}
              </span>
              <SegmentedControlV2
                class="segmented-control-v2--full-width"
                value={createDefaultProject() ? "starter" : "own"}
                onChange={(value) => value && setCreateDefaultProject(value === "starter")}
              >
                <SegmentedControlItemV2 value="starter">{t("welcome.workspace.createDefault")}</SegmentedControlItemV2>
                <SegmentedControlItemV2 value="own">{t("welcome.workspace.chooseLater")}</SegmentedControlItemV2>
              </SegmentedControlV2>
              <p class="welcome-setup-hint">
                {createDefaultProject()
                  ? t("welcome.workspace.createDefault.desc")
                  : t("welcome.workspace.chooseLater.desc")}
              </p>
            </div>

            {/* El asistente ya no pregunta por el proveedor: siempre abre sus ajustes al terminar,
                así que hay que decirlo antes de pulsar Finalizar. */}
            <p class="welcome-setup-note">
              <Icon name="settings-gear" size="small" />
              <span>{t("welcome.provider.autoOpen")}</span>
            </p>
          </div>
        </Show>
      </div>

      <div class="welcome-setup-footer">
        <Show when={step() > 1} fallback={<span />}>
          <ButtonV2 variant="ghost-muted" icon="arrow-left" onClick={goBack} disabled={finishing()}>
            {t("welcome.back")}
          </ButtonV2>
        </Show>

        <div class="welcome-setup-footer-actions">
          {/* Al confirmar no hay nada que omitir: el único botón ya termina. */}
          <Show when={!confirming() && step() < totalSteps()}>
            <ButtonV2 variant="ghost-muted" onClick={() => void handleFinish()} disabled={finishing()}>
              {t("welcome.skip")}
            </ButtonV2>
          </Show>
          <ButtonV2
            variant="contrast"
            icon={step() === totalSteps() ? "check" : undefined}
            onClick={goNext}
            disabled={finishing()}
          >
            {confirming() ? t("welcome.confirm.done") : step() === totalSteps() ? t("welcome.finish") : t("welcome.next")}
          </ButtonV2>
        </div>
      </div>
    </div>
  )
}
