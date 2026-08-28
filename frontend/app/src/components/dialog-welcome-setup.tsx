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
  const version = () => platform.version || import.meta.env.VITE_TIANCODE_VERSION || "1.0.104"

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
    `flex items-center gap-3.5 p-3.5 rounded-2xl border cursor-pointer transition-all duration-200 ${
      selected
        ? "border-cyan-400/50 bg-cyan-500/10 shadow-[0_0_16px_rgba(56,189,248,0.15)]"
        : "border-white/8 bg-white/3 hover:border-white/15 hover:bg-white/6"
    }`

  return (
    <div
      class="relative w-full max-w-[500px] rounded-3xl border border-white/10 bg-[#12141c]/95 shadow-[0_24px_60px_rgba(0,0,0,0.65)] p-7 flex flex-col gap-6 text-white select-none overflow-hidden backdrop-blur-2xl font-sans"
    >
      {/* Ambient background glows */}
      <div class="absolute -top-16 -left-16 w-60 h-60 bg-cyan-500/15 rounded-full blur-3xl pointer-events-none" />
      <div class="absolute -bottom-16 -right-16 w-60 h-60 bg-indigo-500/15 rounded-full blur-3xl pointer-events-none" />

      {/* Header with Official Tiancode Emblem */}
      <div class="flex items-center justify-between border-b border-white/10 pb-5">
        <div class="flex items-center gap-3.5">
          <div class="relative flex items-center justify-center w-12 h-12 rounded-2xl bg-gradient-to-br from-cyan-400 via-sky-500 to-indigo-600 p-[1.5px] shadow-lg shadow-cyan-500/25 shrink-0">
            <div class="w-full h-full bg-[#0a0d16] rounded-[14px] flex items-center justify-center">
              <svg viewBox="0 0 24 24" class="w-6 h-6 text-cyan-400 drop-shadow-[0_0_6px_rgba(56,189,248,0.6)]" fill="none" stroke="currentColor" stroke-width="2.2">
                <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
              </svg>
            </div>
          </div>

          <div class="flex flex-col gap-0.5">
            <div class="flex items-center gap-2">
              <h2 class="text-[16px] font-bold text-white tracking-tight">
                {isEs() ? "Configuración Inicial de Tiancode" : "Tiancode Initial Setup"}
              </h2>
              <span class="px-2 py-0.5 text-[10px] font-mono font-bold rounded-full border border-cyan-400/30 bg-cyan-400/10 text-cyan-300">
                v{version()}
              </span>
            </div>
            <p class="text-[12px] text-slate-400 font-medium">{stepLabel()}</p>
          </div>
        </div>

        {/* Step Indicator */}
        <div class="flex items-center gap-1.5 border border-white/10 bg-white/5 px-2.5 py-1 rounded-full">
          {[1, 2, 3].map((s) => (
            <div
              class={`size-2 rounded-full transition-all duration-300 ${
                step() >= s ? "bg-cyan-400 shadow-[0_0_6px_rgba(56,189,248,0.8)]" : "bg-slate-700"
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
            <label class="text-[11px] font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
              <span>🌐</span>
              <span>{isEs() ? "Idioma de la Aplicación" : "Application Language"}</span>
            </label>
            <div class="grid grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => handleSelectLanguage("es")}
                class={cardClass(selectedLocale() === "es")}
              >
                <span class="text-2xl">🇪🇸</span>
                <div class="flex flex-col flex-1 min-w-0 text-left">
                  <div class="flex items-center justify-between gap-1">
                    <span class="text-[13px] font-semibold text-white truncate">Español</span>
                    <Show when={selectedLocale() === "es"}>
                      <span class="text-[11px] text-cyan-400 font-bold">✓</span>
                    </Show>
                  </div>
                  <span class="text-[11.5px] text-slate-400">Predeterminado (Local)</span>
                </div>
              </button>

              <button
                type="button"
                onClick={() => handleSelectLanguage("en")}
                class={cardClass(selectedLocale() === "en")}
              >
                <span class="text-2xl">🇺🇸</span>
                <div class="flex flex-col flex-1 min-w-0 text-left">
                  <div class="flex items-center justify-between gap-1">
                    <span class="text-[13px] font-semibold text-white truncate">English</span>
                    <Show when={selectedLocale() === "en"}>
                      <span class="text-[11px] text-cyan-400 font-bold">✓</span>
                    </Show>
                  </div>
                  <span class="text-[11.5px] text-slate-400">Fluent Studio UI</span>
                </div>
              </button>
            </div>
          </div>

          {/* Theme Selection */}
          <div class="flex flex-col gap-2.5">
            <label class="text-[11px] font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
              <span>🎨</span>
              <span>{isEs() ? "Tema Visual" : "Theme Preference"}</span>
            </label>
            <div class="grid grid-cols-3 gap-2.5">
              <button
                type="button"
                onClick={() => handleSelectTheme("dark")}
                class={`flex flex-col items-center gap-1.5 p-3 rounded-2xl border cursor-pointer transition-all duration-200 text-[12px] font-medium ${
                  selectedTheme() === "dark"
                    ? "border-cyan-400/50 bg-cyan-500/10 shadow-[0_0_14px_rgba(56,189,248,0.15)] text-white"
                    : "border-white/8 bg-white/3 hover:border-white/15 text-slate-400 hover:text-white"
                }`}
              >
                <span class="text-xl">🌙</span>
                <span>{isEs() ? "Oscuro (Neon)" : "Dark"}</span>
              </button>

              <button
                type="button"
                onClick={() => handleSelectTheme("light")}
                class={`flex flex-col items-center gap-1.5 p-3 rounded-2xl border cursor-pointer transition-all duration-200 text-[12px] font-medium ${
                  selectedTheme() === "light"
                    ? "border-cyan-400/50 bg-cyan-500/10 shadow-[0_0_14px_rgba(56,189,248,0.15)] text-white"
                    : "border-white/8 bg-white/3 hover:border-white/15 text-slate-400 hover:text-white"
                }`}
              >
                <span class="text-xl">☀️</span>
                <span>{isEs() ? "Claro (Light)" : "Light"}</span>
              </button>

              <button
                type="button"
                onClick={() => handleSelectTheme("system")}
                class={`flex flex-col items-center gap-1.5 p-3 rounded-2xl border cursor-pointer transition-all duration-200 text-[12px] font-medium ${
                  selectedTheme() === "system"
                    ? "border-cyan-400/50 bg-cyan-500/10 shadow-[0_0_14px_rgba(56,189,248,0.15)] text-white"
                    : "border-white/8 bg-white/3 hover:border-white/15 text-slate-400 hover:text-white"
                }`}
              >
                <span class="text-xl">💻</span>
                <span>{isEs() ? "Automático" : "System"}</span>
              </button>
            </div>
          </div>
        </div>
      </Show>

      {/* Step 2: System Configuration */}
      <Show when={step() === 2}>
        <div class="flex flex-col gap-3">
          <label class="text-[11px] font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
            <span>⚙️</span>
            <span>{isEs() ? "Opciones del Sistema" : "System Options"}</span>
          </label>

          {/* Sound toggle card */}
          <div
            onClick={() => setEnableSound(!enableSound())}
            class="flex items-center justify-between p-3.5 rounded-2xl border border-white/8 bg-white/3 hover:border-white/15 transition-all duration-200 cursor-pointer"
          >
            <div class="flex items-center gap-3">
              <div class="w-9 h-9 rounded-xl border border-white/10 bg-white/5 flex items-center justify-center text-lg shrink-0">
                🔊
              </div>
              <div class="flex flex-col text-left">
                <span class="text-[13px] font-semibold text-white">
                  {isEs() ? "Efectos de Sonido y Voz TTS" : "Sound Effects & Voice TTS"}
                </span>
                <span class="text-[11.5px] text-slate-400">
                  {isEs()
                    ? "Síntesis neural de voz y retroalimentación auditiva"
                    : "Kokoro/Piper TTS voices and notifications"}
                </span>
              </div>
            </div>
            <Switch checked={enableSound()} onChange={(checked) => setEnableSound(checked)} />
          </div>

          {/* Auto update toggle card */}
          <div
            onClick={() => setAutoUpdates(!autoUpdates())}
            class="flex items-center justify-between p-3.5 rounded-2xl border border-white/8 bg-white/3 hover:border-white/15 transition-all duration-200 cursor-pointer"
          >
            <div class="flex items-center gap-3">
              <div class="w-9 h-9 rounded-xl border border-white/10 bg-white/5 flex items-center justify-center text-lg shrink-0">
                🔄
              </div>
              <div class="flex flex-col text-left">
                <span class="text-[13px] font-semibold text-white">
                  {isEs() ? "Actualizaciones Automáticas" : "Automatic Updates"}
                </span>
                <span class="text-[11.5px] text-slate-400">
                  {isEs()
                    ? "Buscar nuevas versiones y mejoras sin interrumpir tu trabajo"
                    : "Seamless non-destructive updates"}
                </span>
              </div>
            </div>
            <Switch checked={autoUpdates()} onChange={(checked) => setAutoUpdates(checked)} />
          </div>

          {/* Info callout */}
          <div class="p-3 rounded-2xl border border-white/8 bg-white/3 text-[11.5px] leading-relaxed text-slate-400 flex items-start gap-2.5">
            <span class="text-base shrink-0 mt-0.5">💡</span>
            <div class="flex flex-col gap-0.5">
              <span class="font-semibold text-slate-200">
                {isEs() ? "Servidores MCP y Proveedores Disponibles" : "MCP Servers & AI Providers"}
              </span>
              <span>
                {isEs()
                  ? "Podrás conectar servidores MCP y modelos locales GGUF o en la nube directamente desde Ajustes."
                  : "You can manage MCP servers and local GGUF models anytime in Settings."}
              </span>
            </div>
          </div>
        </div>
      </Show>

      {/* Step 3: Disclaimer & Terms */}
      <Show when={step() === 3}>
        <div class="flex flex-col gap-3">
          <label class="text-[11px] font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
            <span>🛡️</span>
            <span>{isEs() ? "Descargo de Responsabilidad y Privacidad" : "Disclaimer & Privacy Notice"}</span>
          </label>

          <div class="p-3.5 rounded-2xl border border-white/8 bg-white/3 text-[11.5px] leading-relaxed text-slate-300 flex flex-col gap-2 max-h-[160px] overflow-y-auto">
            <div class="flex items-center gap-1.5 font-semibold text-white">
              <span>🔒</span>
              <span>{isEs() ? "Ejecución Local y Privacidad:" : "Local Execution & Privacy:"}</span>
            </div>
            <p>
              {isEs()
                ? "1. Tiancode ejecuta código y comandos localmente en tu sistema bajo tu supervisión directa."
                : "1. Tiancode executes code and tools locally on your system under your supervision."}
            </p>
            <p>
              {isEs()
                ? "2. Las respuestas generadas son sugerencias asistivas. Verifica el código antes de usarlo en producción."
                : "2. AI responses are suggestions. Review code carefully before production use."}
            </p>
            <p>
              {isEs()
                ? "3. Tus claves API y datos se almacenan de forma privada y cifrada en tu equipo local."
                : "3. Your API keys and data remain encrypted locally on your machine."}
            </p>
          </div>

          <label class="flex items-center gap-3 p-3 rounded-2xl border border-white/8 bg-white/3 hover:border-white/15 transition-all duration-200 cursor-pointer">
            <input
              type="checkbox"
              checked={disclaimerAccepted()}
              onChange={(e) => setDisclaimerAccepted(e.currentTarget.checked)}
              class="size-4 accent-cyan-400 rounded cursor-pointer shrink-0"
            />
            <span class="text-[12px] text-slate-300 font-medium">
              {isEs()
                ? "Acepto el descargo de responsabilidad y las condiciones de uso responsable"
                : "I agree to the disclaimer and responsible use terms"}
            </span>
          </label>
        </div>
      </Show>

      {/* Navigation and Action Buttons */}
      <div class="flex items-center justify-between pt-2 border-t border-white/10">
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
              <span>🚀</span>
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
