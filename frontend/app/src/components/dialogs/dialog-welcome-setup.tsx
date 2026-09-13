import { createSignal, For, Show, type Component } from "solid-js"
import { useDialog } from "@tiancode-ai/ui/context/dialog"
import { ButtonV2 } from "@tiancode-ai/ui/v2/button-v2"
import { Tag } from "@tiancode-ai/ui/v2/badge-v2"
import { Icon } from "@tiancode-ai/ui/v2/icon"
import { SegmentedControlItemV2, SegmentedControlV2 } from "@tiancode-ai/ui/v2/segmented-control-v2"
import { SelectV2 } from "@tiancode-ai/ui/v2/select-v2"
import { Mark } from "@tiancode-ai/ui/logo"
import { useLanguage, type Locale } from "@/context/language"
import { useTheme, type ColorScheme } from "@tiancode-ai/ui/theme/context"
import { usePlatform } from "@/context/platform"
import "./dialog-welcome-setup.css"

export const FIRST_LAUNCH_KEY = "tiancode.first_launch.completed"

/** Set when onboarding finishes; the shell opens Settings › Providers once on the next boot. */
export const PENDING_PROVIDER_SETUP_KEY = "tiancode.first_launch.open_providers"

const STEPS = ["welcome.step.appearance", "welcome.step.workspace"] as const
const TOTAL_STEPS = STEPS.length

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

export const DialogWelcomeSetup: Component<{ onDone?: () => void }> = (props) => {
  const dialog = useDialog()
  const language = useLanguage()
  const theme = useTheme()
  const platform = usePlatform()

  const [step, setStep] = createSignal(1)
  const [finishing, setFinishing] = createSignal(false)
  const [createDefaultProject, setCreateDefaultProject] = createSignal(true)
  const [selectedLocale, setSelectedLocale] = createSignal<Locale>(language.locale())
  const [selectedTheme, setSelectedTheme] = createSignal<ColorScheme>(theme.colorScheme())

  const t = (key: string, params?: Record<string, string | number>) => language.t(key, params)

  const handleSelectLanguage = (loc: Locale) => {
    setSelectedLocale(loc)
    language.setLocale(loc)
    try {
      // Clave heredada: la persistencia real la hace setLocale a través del store "language".
      localStorage.setItem("tiancode-lang", loc)
    } catch {
      // A blocked localStorage only costs the persisted preference; the in-memory locale still applies.
    }
  }

  const handleSelectTheme = (mode: ColorScheme) => {
    setSelectedTheme(mode)
    // setColorScheme ya persiste en "tiancode-color-scheme" y estampa data-color-scheme en <html>.
    // No tocamos data-theme aquí: ese atributo guarda el ID del tema (oc-2), no el esquema, y
    // escribirle "dark"/"light" desactivaba las reglas html[data-theme="oc-2"] hasta el siguiente render.
    theme.setColorScheme(mode)
    try {
      localStorage.setItem("tiancode-theme", mode)
    } catch {
      // Same as above: the theme is already applied through the theme context.
    }
  }

  const handleFinish = async () => {
    if (finishing()) return
    setFinishing(true)
    try {
      localStorage.setItem(FIRST_LAUNCH_KEY, "true")
      localStorage.setItem("tiancode.sound.enabled", "true")
      localStorage.setItem("tiancode.autoupdate.enabled", "true")
      // Una instalación nueva no tiene ningún proveedor, así que siempre dejamos abiertos los
      // ajustes: es lo único que hace utilizable la app y se cierra con Esc si no toca ahora.
      localStorage.setItem(PENDING_PROVIDER_SETUP_KEY, "true")
    } catch {
      // Onboarding must never trap the user behind a storage failure — continue to the app.
    }
    try {
      await window.api?.finishFirstLaunchOnboarding?.(createDefaultProject())
    } catch {
      // The desktop shell may be unavailable in the browser build; the app still opens.
    }
    props.onDone?.()
    dialog.close()
  }

  const goNext = () => {
    if (step() >= TOTAL_STEPS) return void handleFinish()
    setStep((s) => Math.min(TOTAL_STEPS, s + 1))
  }
  const goBack = () => setStep((s) => Math.max(1, s - 1))

  const version = () => platform.version || import.meta.env.VITE_TIANCODE_VERSION || ""
  const stepLabel = () => t("welcome.stepLabel", { current: step(), total: TOTAL_STEPS })
  const currentLocale = () => LOCALE_OPTIONS.find((option) => option.locale === selectedLocale())

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
              {t("welcome.title")}
            </h2>
            <Show when={version()}>
              <Tag variant="neutral">v{version()}</Tag>
            </Show>
          </div>
          <p class="welcome-setup-subtitle">
            {stepLabel()} · {t(STEPS[step() - 1])}
          </p>
        </div>
      </div>

      <div
        class="welcome-setup-progress"
        role="progressbar"
        aria-label={t("welcome.progress")}
        aria-valuemin={1}
        aria-valuemax={TOTAL_STEPS}
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

      <div class="welcome-setup-body">
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
          <Show when={step() < TOTAL_STEPS}>
            <ButtonV2 variant="ghost-muted" onClick={() => void handleFinish()} disabled={finishing()}>
              {t("welcome.skip")}
            </ButtonV2>
          </Show>
          <ButtonV2
            variant="contrast"
            icon={step() === TOTAL_STEPS ? "check" : undefined}
            onClick={goNext}
            disabled={finishing()}
          >
            {step() === TOTAL_STEPS ? t("welcome.finish") : t("welcome.next")}
          </ButtonV2>
        </div>
      </div>
    </div>
  )
}
