import { createSignal, type Component, Show } from "solid-js"
import { useDialog } from "@tiancode-ai/ui/context/dialog"
import { useLanguage, type Locale } from "@/context/language"
import { useTheme, type ColorScheme } from "@tiancode-ai/ui/theme/context"
import { useSettings } from "@/context/settings"
import { usePlatform } from "@/context/platform"
import { ButtonV2 } from "@tiancode-ai/ui/v2/button-v2"
import { Switch } from "@tiancode-ai/ui/v2/switch-v2"

export const FIRST_LAUNCH_KEY = "tiancode.first_launch.completed"

export const DialogWelcomeSetup: Component<{ onDone?: () => void }> = (props) => {
  const dialog = useDialog()
  const language = useLanguage()
  const theme = useTheme()
  const settings = useSettings()
  const platform = usePlatform()

  const [step, setStep] = createSignal<1 | 2 | 3>(1)
  const [selectedLocale, setSelectedLocale] = createSignal<Locale>(language.locale())
  const [selectedTheme, setSelectedTheme] = createSignal<ColorScheme>(theme.colorScheme())
  const [enableSound, setEnableSound] = createSignal(true)
  const [autoUpdates, setAutoUpdates] = createSignal(true)
  const [disclaimerAccepted, setDisclaimerAccepted] = createSignal(false)

  const handleSelectLanguage = (loc: Locale) => {
    setSelectedLocale(loc)
    language.setLocale(loc)
    try {
      localStorage.setItem("tiancode-lang", loc)
    } catch {}
  }

  const handleSelectTheme = (mode: ColorScheme) => {
    setSelectedTheme(mode)
    theme.setColorScheme(mode)
    try {
      localStorage.setItem("tiancode-theme", mode)
      document.documentElement.setAttribute("data-theme", mode)
    } catch {}
  }

  const handleFinish = async () => {
    try {
      localStorage.setItem(FIRST_LAUNCH_KEY, "true")
      localStorage.setItem("tiancode.sound.enabled", String(enableSound()))
      localStorage.setItem("tiancode.autoupdate.enabled", String(autoUpdates()))
      if (typeof window !== "undefined" && window.api?.finishFirstLaunchOnboarding) {
        await window.api.finishFirstLaunchOnboarding(true)
      }
    } catch {}
    props.onDone?.()
    dialog.close()
  }

  const isEs = () => selectedLocale() === "es"
  const version = () => platform.version || import.meta.env.VITE_TIANCODE_VERSION || ""

  const stepLabel = () =>
    step() === 1
      ? isEs()
        ? "Paso 1 de 3: Elige tu idioma y tema"
        : "Step 1 of 3: Choose language & theme"
      : step() === 2
        ? isEs()
          ? "Paso 2 de 3: Personaliza módulos y sonido"
          : "Step 2 of 3: Customize sound & options"
        : isEs()
          ? "Paso 3 de 3: Descargo de responsabilidad y privacidad"
          : "Step 3 of 3: Disclaimer & privacy notice"

  const cardClass = (selected: boolean) =>
    `flex items-center gap-3.5 p-3.5 rounded-[10px] border cursor-pointer transition-colors duration-150 ${
      selected
        ? "border-v2-border-border-strong bg-v2-background-bg-base"
        : "border-v2-border-border-muted bg-v2-background-bg-layer-02 hover:border-v2-border-border-hover"
    }`

  return (
    <div
      class={`
        relative w-full max-w-[560px] rounded-[20px] border border-v2-border-border-muted
        bg-v2-background-bg-layer-01 shadow-[var(--v2-elevation-floating)] p-7
        flex flex-col gap-6 text-v2-text-text-base select-none overflow-hidden
      `}
    >
      {/* Ambient background glows */}
      <div class="absolute -top-16 -left-16 w-64 h-64 bg-cyan-500/12 rounded-full blur-3xl pointer-events-none" />
      <div class="absolute -bottom-16 -right-16 w-64 h-64 bg-indigo-500/12 rounded-full blur-3xl pointer-events-none" />

      {/* Header with Tiancode Cat Mascot */}
      <div class="flex items-center justify-between border-b border-v2-border-border-muted pb-5">
        <div class="flex items-center gap-4">
          <div class="relative group">
            <div class="w-13 h-13 rounded-2xl border border-v2-border-border-hover bg-v2-background-bg-layer-02 p-2 flex items-center justify-center shrink-0">
              {/* Authentic Tiancode Cat Logo SVG */}
              <svg viewBox="0 0 100 100" class="w-full h-full text-v2-text-text-base" fill="currentColor">
                {/* Ears */}
                <polygon points="18,12 36,44 14,48" fill="currentColor" />
                <polygon points="82,12 86,48 64,44" fill="currentColor" />
                {/* Head outline */}
                <path d="M22,38 C32,24 68,24 78,38 C88,52 88,78 72,90 C58,98 42,98 28,90 C12,78 12,52 22,38 Z" fill="currentColor" />
                {/* Inner eye diamond cutouts */}
                <polygon points="34,44 44,54 34,64 24,54" fill="var(--v2-background-bg-layer-01)" />
                <polygon points="66,44 76,54 66,64 56,54" fill="var(--v2-background-bg-layer-01)" />
                {/* Eye pupils */}
                <ellipse cx="34" cy="54" rx="3.2" ry="4.5" fill="currentColor" />
                <ellipse cx="66" cy="54" rx="3.2" ry="4.5" fill="currentColor" />
                {/* Nose */}
                <polygon points="50,62 44,56 56,56" fill="var(--v2-background-bg-layer-01)" />
                {/* Mouth and chin */}
                <path d="M50,62 L50,68 C46,68 44,72 44,74 M50,68 C54,68 56,72 56,74" stroke="var(--v2-background-bg-layer-01)" stroke-width="2.5" stroke-linecap="round" fill="none" />
                {/* Whiskers */}
                <line x1="8" y1="62" x2="26" y2="64" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" />
                <line x1="6" y1="70" x2="26" y2="70" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" />
                <line x1="8" y1="78" x2="26" y2="76" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" />
                <line x1="92" y1="62" x2="74" y2="64" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" />
                <line x1="94" y1="70" x2="74" y2="70" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" />
                <line x1="92" y1="78" x2="74" y2="76" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" />
              </svg>
            </div>
            <div class="absolute -bottom-1 -right-1 w-3.5 h-3.5 rounded-full bg-v2-icon-icon-success border-2 border-v2-background-bg-base" />
          </div>

          <div class="flex flex-col gap-0.5">
            <div class="flex items-center gap-2.5">
              <h2 class="text-[16px] leading-6 [font-weight:600] tracking-[-0.02px]">
                {isEs() ? "Configuración Inicial de Tiancode" : "Tiancode Initial Setup"}
              </h2>
              <Show when={version()}>
                <span class="px-2 py-0.5 text-[10px] font-mono [font-weight:600] rounded-full border border-v2-border-border-muted bg-v2-background-bg-layer-02 text-v2-text-text-faint">
                  v{version()}
                </span>
              </Show>
            </div>
            <p class="text-[12px] leading-4 text-v2-text-text-muted [font-weight:440]">{stepLabel()}</p>
          </div>
        </div>

        {/* Step Indicator */}
        <div class="flex items-center gap-2 border border-v2-border-border-muted bg-v2-background-bg-layer-02 px-3 py-1.5 rounded-full">
          {[1, 2, 3].map((s) => (
            <div
              class={`size-2 rounded-full transition-colors duration-300 ${
                step() >= s ? "bg-v2-icon-icon-accent" : "bg-v2-icon-icon-faint"
              }`}
            />
          ))}
        </div>
      </div>

      {/* Step 1: Language and Appearance */}
      <Show when={step() === 1}>
        <div class="flex flex-col gap-5">
          {/* Language Selection */}
          <div class="flex flex-col gap-2.5">
            <label class="text-[11px] [font-weight:550] text-v2-text-text-muted uppercase tracking-[0.04em] flex items-center gap-2">
              <span>🌐</span>
              <span>{isEs() ? "Idioma de la Aplicación" : "Application Language"}</span>
            </label>
            <div class="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => handleSelectLanguage("es")}
                class={cardClass(selectedLocale() === "es")}
              >
                <span class="text-2xl">🇪🇸</span>
                <div class="flex flex-col flex-1 min-w-0">
                  <div class="flex items-center justify-between gap-2">
                    <span class="text-[13px] leading-5 [font-weight:530] truncate">Español</span>
                    <Show when={selectedLocale() === "es"}>
                      <span class="text-[10px] text-v2-text-text-accent [font-weight:600]">✓</span>
                    </Show>
                  </div>
                  <span class="text-[12px] leading-4 text-v2-text-text-muted">Predeterminado (Local)</span>
                </div>
              </button>

              <button
                type="button"
                onClick={() => handleSelectLanguage("en")}
                class={cardClass(selectedLocale() === "en")}
              >
                <span class="text-2xl">🇺🇸</span>
                <div class="flex flex-col flex-1 min-w-0">
                  <div class="flex items-center justify-between gap-2">
                    <span class="text-[13px] leading-5 [font-weight:530] truncate">English</span>
                    <Show when={selectedLocale() === "en"}>
                      <span class="text-[10px] text-v2-text-text-accent [font-weight:600]">✓</span>
                    </Show>
                  </div>
                  <span class="text-[12px] leading-4 text-v2-text-text-muted">Fluent Studio UI</span>
                </div>
              </button>
            </div>
          </div>

          {/* Theme Selection */}
          <div class="flex flex-col gap-2.5">
            <label class="text-[11px] [font-weight:550] text-v2-text-text-muted uppercase tracking-[0.04em] flex items-center gap-2">
              <span>🎨</span>
              <span>{isEs() ? "Tema Visual" : "Theme Preference"}</span>
            </label>
            <div class="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => handleSelectTheme("dark")}
                class={`flex flex-col items-center gap-2 p-3.5 rounded-[10px] border cursor-pointer transition-colors duration-150 text-[12px] [font-weight:520] ${
                  selectedTheme() === "dark"
                    ? "border-v2-border-border-strong bg-v2-background-bg-base"
                    : "border-v2-border-border-muted bg-v2-background-bg-layer-02 hover:border-v2-border-border-hover"
                }`}
              >
                <span class="text-2xl">🌙</span>
                <span>{isEs() ? "Oscuro (Neon)" : "Dark (Neon)"}</span>
              </button>

              <button
                type="button"
                onClick={() => handleSelectTheme("light")}
                class={`flex flex-col items-center gap-2 p-3.5 rounded-[10px] border cursor-pointer transition-colors duration-150 text-[12px] [font-weight:520] ${
                  selectedTheme() === "light"
                    ? "border-v2-border-border-strong bg-v2-background-bg-base"
                    : "border-v2-border-border-muted bg-v2-background-bg-layer-02 hover:border-v2-border-border-hover"
                }`}
              >
                <span class="text-2xl">☀️</span>
                <span>{isEs() ? "Claro (Light)" : "Light"}</span>
              </button>

              <button
                type="button"
                onClick={() => handleSelectTheme("system")}
                class={`flex flex-col items-center gap-2 p-3.5 rounded-[10px] border cursor-pointer transition-colors duration-150 text-[12px] [font-weight:520] ${
                  selectedTheme() === "system"
                    ? "border-v2-border-border-strong bg-v2-background-bg-base"
                    : "border-v2-border-border-muted bg-v2-background-bg-layer-02 hover:border-v2-border-border-hover"
                }`}
              >
                <span class="text-2xl">💻</span>
                <span>{isEs() ? "Automático" : "System Sync"}</span>
              </button>
            </div>
          </div>
        </div>
      </Show>

      {/* Step 2: System Configuration */}
      <Show when={step() === 2}>
        <div class="flex flex-col gap-3">
          <label class="text-[11px] [font-weight:550] text-v2-text-text-muted uppercase tracking-[0.04em] flex items-center gap-2">
            <span>⚙️</span>
            <span>{isEs() ? "Opciones y Módulos del Sistema" : "System Options & Modules"}</span>
          </label>

          {/* Sound toggle card */}
          <div
            onClick={() => setEnableSound(!enableSound())}
            class="flex items-center justify-between p-4 rounded-[10px] border border-v2-border-border-muted bg-v2-background-bg-layer-02 hover:border-v2-border-border-hover transition-colors duration-150 cursor-pointer"
          >
            <div class="flex items-center gap-3.5">
              <div class="w-10 h-10 rounded-[8px] border border-v2-border-border-muted bg-v2-background-bg-base flex items-center justify-center text-xl shrink-0">
                🔊
              </div>
              <div class="flex flex-col">
                <span class="text-[13px] leading-5 [font-weight:530]">
                  {isEs() ? "Efectos de Sonido y Voz TTS" : "Sound Effects & Voice TTS"}
                </span>
                <span class="text-[12px] leading-4 text-v2-text-text-muted">
                  {isEs()
                    ? "Respuestas con síntesis Kokoro/Piper y retroalimentación auditiva"
                    : "Kokoro/Piper TTS voices and audio notifications"}
                </span>
              </div>
            </div>
            <Switch checked={enableSound()} onChange={(checked) => setEnableSound(checked)} />
          </div>

          {/* Auto update toggle card */}
          <div
            onClick={() => setAutoUpdates(!autoUpdates())}
            class="flex items-center justify-between p-4 rounded-[10px] border border-v2-border-border-muted bg-v2-background-bg-layer-02 hover:border-v2-border-border-hover transition-colors duration-150 cursor-pointer"
          >
            <div class="flex items-center gap-3.5">
              <div class="w-10 h-10 rounded-[8px] border border-v2-border-border-muted bg-v2-background-bg-base flex items-center justify-center text-xl shrink-0">
                🔄
              </div>
              <div class="flex flex-col">
                <span class="text-[13px] leading-5 [font-weight:530]">
                  {isEs() ? "Actualizaciones Automáticas" : "Automatic Updates"}
                </span>
                <span class="text-[12px] leading-4 text-v2-text-text-muted">
                  {isEs()
                    ? "Buscar nuevas versiones y mejoras no destructivas en segundo plano"
                    : "Background non-destructive updates for models & tools"}
                </span>
              </div>
            </div>
            <Switch checked={autoUpdates()} onChange={(checked) => setAutoUpdates(checked)} />
          </div>

          {/* Info callout */}
          <div class="p-3.5 rounded-[10px] border border-v2-border-border-muted bg-v2-background-bg-layer-02 text-[12px] leading-5 text-v2-text-text-muted flex items-start gap-3">
            <span class="text-base shrink-0 mt-0.5">💡</span>
            <div class="flex flex-col gap-0.5">
              <span class="[font-weight:530] text-v2-text-text-base">
                {isEs() ? "Servidores MCP y Proveedores Disponibles" : "MCP Servers & AI Providers"}
              </span>
              <span class="text-[11px] leading-4">
                {isEs()
                  ? "Podrás conectar servidores MCP (Playwright, NotebookLM, SQLite, etc.) y configurar claves de OpenAI, Anthropic, Gemini o modelos locales GGUF en Ajustes."
                  : "You can manage MCP servers (Playwright, NotebookLM, SQLite) and connect OpenAI, Anthropic, Gemini, or local GGUF models in Settings."}
              </span>
            </div>
          </div>
        </div>
      </Show>

      {/* Step 3: Disclaimer & Terms */}
      <Show when={step() === 3}>
        <div class="flex flex-col gap-3">
          <label class="text-[11px] [font-weight:550] text-v2-text-text-muted uppercase tracking-[0.04em] flex items-center gap-2">
            <span>🛡️</span>
            <span>{isEs() ? "Descargo de Responsabilidad y Privacidad" : "Disclaimer & Privacy Notice"}</span>
          </label>

          <div class="p-4 rounded-[10px] border border-v2-border-border-muted bg-v2-background-bg-layer-02 text-[12px] leading-5 text-v2-text-text-muted flex flex-col gap-2.5 max-h-[170px] overflow-y-auto">
            <div class="flex items-center gap-2 [font-weight:530] text-v2-text-text-base">
              <span>🔒</span>
              <span>{isEs() ? "Ejecución Local y Supervisión Asistida:" : "Local Execution & Supervised Assistance:"}</span>
            </div>
            <p class="text-[11px] leading-4">
              {isEs()
                ? "1. Tiancode ejecuta código, comandos de terminal y herramientas de depuración localmente en tu sistema bajo tu supervisión directa."
                : "1. Tiancode runs code, terminal commands, and debugging tools locally on your machine under your supervision."}
            </p>
            <p class="text-[11px] leading-4">
              {isEs()
                ? "2. Las respuestas generadas por modelos de IA son sugerencias asistivas. Verifica siempre el código antes de desplegar en producción."
                : "2. AI responses are assistive suggestions. Always review changes before applying to production environments."}
            </p>
            <p class="text-[11px] leading-4">
              {isEs()
                ? "3. Tus claves API, sesiones y configuraciones se guardan de forma cifrada y privada en tu equipo local."
                : "3. Your API keys, sessions, and configuration are encrypted and stored solely on your local device."}
            </p>
          </div>

          <label class="flex items-center gap-3.5 p-3.5 rounded-[10px] border border-v2-border-border-muted bg-v2-background-bg-layer-02 hover:border-v2-border-border-hover transition-colors duration-150 cursor-pointer">
            <input
              type="checkbox"
              checked={disclaimerAccepted()}
              onChange={(e) => setDisclaimerAccepted(e.currentTarget.checked)}
              class="size-4 accent-v2-icon-icon-accent rounded cursor-pointer shrink-0"
            />
            <span class="text-[12px] leading-5 [font-weight:480]">
              {isEs()
                ? "He leído y acepto el descargo de responsabilidad y las condiciones de uso responsable"
                : "I have read and agree to the disclaimer and terms of responsible use"}
            </span>
          </label>
        </div>
      </Show>

      {/* Navigation and Action Buttons */}
      <div class="flex items-center justify-between pt-3 border-t border-v2-border-border-muted">
        <Show when={step() > 1} fallback={<div />}>
          <ButtonV2 variant="ghost-muted" size="normal" onClick={() => setStep((s) => (s - 1) as 1 | 2)}>
            <span>←</span>
            <span>{isEs() ? "Atrás" : "Back"}</span>
          </ButtonV2>
        </Show>

        <Show
          when={step() < 3}
          fallback={
            <ButtonV2
              variant="neutral"
              size="normal"
              disabled={!disclaimerAccepted()}
              onClick={() => void handleFinish()}
            >
              <span>{isEs() ? "Comenzar a Programar" : "Start Coding"}</span>
              <span class="text-sm">🚀</span>
            </ButtonV2>
          }
        >
          <ButtonV2 variant="contrast" size="normal" onClick={() => setStep((s) => (s + 1) as 2 | 3)}>
            <span>{isEs() ? "Siguiente" : "Next"}</span>
            <span>→</span>
          </ButtonV2>
        </Show>
      </div>
    </div>
  )
}
