import { createSignal, type Component, Show } from "solid-js"
import { useDialog } from "@tiancode-ai/ui/context/dialog"
import { useLanguage, type Locale } from "@/context/language"
import { useTheme, type ColorScheme } from "@tiancode-ai/ui/theme/context"
import { useSettings } from "@/context/settings"

export const FIRST_LAUNCH_KEY = "tiancode.first_launch.completed"

export const DialogWelcomeSetup: Component<{ onDone?: () => void }> = (props) => {
  const dialog = useDialog()
  const language = useLanguage()
  const theme = useTheme()
  const settings = useSettings()

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

  return (
    <div class="relative w-full max-w-[480px] rounded-2xl bg-[#0b1120]/95 border border-white/10 shadow-2xl p-6 flex flex-col gap-5 text-slate-100 backdrop-blur-2xl animate-fade-in z-10 select-none">
      {/* Subtle background ambient glows */}
      <div class="absolute -top-12 -left-12 w-56 h-56 bg-cyan-500/15 rounded-full blur-3xl pointer-events-none" />
      <div class="absolute -bottom-12 -right-12 w-56 h-56 bg-indigo-500/15 rounded-full blur-3xl pointer-events-none" />

      {/* Header */}
      <div class="flex items-center justify-between border-b border-white/10 pb-4">
        <div class="flex items-center gap-3.5">
          <div class="w-11 h-11 rounded-xl bg-gradient-to-br from-cyan-400 via-sky-500 to-indigo-600 p-[1.5px] shadow-lg shadow-cyan-500/20 flex items-center justify-center shrink-0">
            <div class="w-full h-full bg-[#070c18] rounded-[10px] flex items-center justify-center">
              <svg viewBox="0 0 24 24" class="w-6 h-6 text-cyan-400 drop-shadow-[0_0_6px_rgba(56,189,248,0.5)]" fill="none" stroke="currentColor" stroke-width="2.2">
                <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
              </svg>
            </div>
          </div>
          <div class="flex flex-col">
            <div class="flex items-center gap-2">
              <h2 class="text-base font-bold tracking-tight text-white">
                {isEs() ? "Configuración Inicial de Tiancode" : "Tiancode Initial Setup"}
              </h2>
              <span class="px-1.5 py-0.2 text-[9px] font-mono font-bold rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                v1.0.90
              </span>
            </div>
            <p class="text-xs text-slate-400">
              {isEs() ? `Paso ${step()} de 3: Personaliza tu entorno` : `Step ${step()} of 3: Customize your workspace`}
            </p>
          </div>
        </div>

        {/* Step Indicator */}
        <div class="flex items-center gap-1.5 bg-slate-900/80 px-2 py-1 rounded-lg border border-white/5">
          <div class={`w-2 h-2 rounded-full transition-all ${step() === 1 ? "bg-cyan-400 scale-110 shadow-[0_0_6px_#38bdf8]" : "bg-slate-600"}`} />
          <div class={`w-2 h-2 rounded-full transition-all ${step() === 2 ? "bg-cyan-400 scale-110 shadow-[0_0_6px_#38bdf8]" : "bg-slate-600"}`} />
          <div class={`w-2 h-2 rounded-full transition-all ${step() === 3 ? "bg-cyan-400 scale-110 shadow-[0_0_6px_#38bdf8]" : "bg-slate-600"}`} />
        </div>
      </div>

      {/* Step 1: Language and Appearance */}
      <Show when={step() === 1}>
        <div class="flex flex-col gap-4 animate-fade-in">
          {/* Language Selection */}
          <div class="flex flex-col gap-2">
            <label class="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
              {isEs() ? "Idioma de la Aplicación" : "Application Language"}
            </label>
            <div class="grid grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => handleSelectLanguage("es")}
                class={`flex items-center gap-2.5 p-2.5 rounded-xl border transition-all text-left cursor-pointer ${
                  selectedLocale() === "es"
                    ? "bg-cyan-500/15 border-cyan-400 text-white shadow-[0_0_12px_rgba(56,189,248,0.2)]"
                    : "bg-slate-805/60 border-white/10 text-slate-300 hover:border-white/20 hover:bg-slate-800/90"
                }`}
              >
                <span class="text-xl">🇪🇸</span>
                <div class="flex flex-col">
                  <span class="text-xs font-semibold">Español</span>
                  <span class="text-[10px] text-slate-400">Predeterminado</span>
                </div>
              </button>

              <button
                type="button"
                onClick={() => handleSelectLanguage("en")}
                class={`flex items-center gap-2.5 p-2.5 rounded-xl border transition-all text-left cursor-pointer ${
                  selectedLocale() === "en"
                    ? "bg-cyan-500/15 border-cyan-400 text-white shadow-[0_0_12px_rgba(56,189,248,0.2)]"
                    : "bg-slate-805/60 border-white/10 text-slate-300 hover:border-white/20 hover:bg-slate-800/90"
                }`}
              >
                <span class="text-xl">🇺🇸</span>
                <div class="flex flex-col">
                  <span class="text-xs font-semibold">English</span>
                  <span class="text-[10px] text-slate-400">Fluent UI</span>
                </div>
              </button>
            </div>
          </div>

          {/* Theme Selection */}
          <div class="flex flex-col gap-2">
            <label class="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
              {isEs() ? "Tema Visual" : "Theme Preference"}
            </label>
            <div class="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => handleSelectTheme("dark")}
                class={`flex flex-col items-center gap-1.5 p-2.5 rounded-xl border transition-all cursor-pointer ${
                  selectedTheme() === "dark"
                    ? "bg-cyan-500/15 border-cyan-400 text-white shadow-[0_0_12px_rgba(56,189,248,0.2)]"
                    : "bg-slate-800/60 border-white/10 text-slate-300 hover:border-white/20 hover:bg-slate-800/90"
                }`}
              >
                <span class="text-lg">🌙</span>
                <span class="text-xs font-semibold">{isEs() ? "Oscuro" : "Dark"}</span>
              </button>

              <button
                type="button"
                onClick={() => handleSelectTheme("light")}
                class={`flex flex-col items-center gap-1.5 p-2.5 rounded-xl border transition-all cursor-pointer ${
                  selectedTheme() === "light"
                    ? "bg-cyan-500/15 border-cyan-400 text-white shadow-[0_0_12px_rgba(56,189,248,0.2)]"
                    : "bg-slate-800/60 border-white/10 text-slate-300 hover:border-white/20 hover:bg-slate-800/90"
                }`}
              >
                <span class="text-lg">☀️</span>
                <span class="text-xs font-semibold">{isEs() ? "Claro" : "Light"}</span>
              </button>

              <button
                type="button"
                onClick={() => handleSelectTheme("system")}
                class={`flex flex-col items-center gap-1.5 p-2.5 rounded-xl border transition-all cursor-pointer ${
                  selectedTheme() === "system"
                    ? "bg-cyan-500/15 border-cyan-400 text-white shadow-[0_0_12px_rgba(56,189,248,0.2)]"
                    : "bg-slate-800/60 border-white/10 text-slate-300 hover:border-white/20 hover:bg-slate-800/90"
                }`}
              >
                <span class="text-lg">💻</span>
                <span class="text-xs font-semibold">{isEs() ? "Sistema" : "System"}</span>
              </button>
            </div>
          </div>
        </div>
      </Show>

      {/* Step 2: System Configuration */}
      <Show when={step() === 2}>
        <div class="flex flex-col gap-3 animate-fade-in">
          <label class="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
            {isEs() ? "Opciones y Módulos del Sistema" : "System Options & Modules"}
          </label>

          <label class="flex items-center justify-between p-3 rounded-xl bg-slate-800/50 border border-white/10 hover:border-white/20 transition-all cursor-pointer">
            <div class="flex items-center gap-3">
              <span class="text-xl">🔊</span>
              <div class="flex flex-col">
                <span class="text-xs font-semibold text-white">{isEs() ? "Efectos de Sonido y Voz TTS" : "Sound Effects & Voice TTS"}</span>
                <span class="text-[10px] text-slate-400">{isEs() ? "Retroalimentación auditiva y voz Kokoro/Piper" : "Audio cues & Kokoro/Piper TTS"}</span>
              </div>
            </div>
            <input
              type="checkbox"
              checked={enableSound()}
              onChange={(e) => setEnableSound(e.currentTarget.checked)}
              class="w-4 h-4 accent-cyan-400 rounded cursor-pointer"
            />
          </label>

          <label class="flex items-center justify-between p-3 rounded-xl bg-slate-800/50 border border-white/10 hover:border-white/20 transition-all cursor-pointer">
            <div class="flex items-center gap-3">
              <span class="text-xl">🔄</span>
              <div class="flex flex-col">
                <span class="text-xs font-semibold text-white">{isEs() ? "Actualizaciones Automáticas" : "Automatic Updates"}</span>
                <span class="text-[10px] text-slate-400">{isEs() ? "Buscar nuevas versiones sin interrumpir trabajo" : "Check for new releases non-destructively"}</span>
              </div>
            </div>
            <input
              type="checkbox"
              checked={autoUpdates()}
              onChange={(e) => setAutoUpdates(e.currentTarget.checked)}
              class="w-4 h-4 accent-cyan-400 rounded cursor-pointer"
            />
          </label>

          <div class="p-3 rounded-xl bg-cyan-950/30 border border-cyan-500/20 text-[11px] text-cyan-200 flex items-start gap-2.5">
            <span class="text-cyan-400 mt-0.5">💡</span>
            <span>
              {isEs()
                ? "Podrás gestionar servidores MCP (Playwright, NotebookLM, etc.) y proveedores de IA desde el menú Ajustes en cualquier momento."
                : "You can manage MCP servers (Playwright, NotebookLM, etc.) and AI providers in Settings at any time."}
            </span>
          </div>
        </div>
      </Show>

      {/* Step 3: Disclaimer & Terms */}
      <Show when={step() === 3}>
        <div class="flex flex-col gap-3 animate-fade-in">
          <label class="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
            {isEs() ? "Descargo de Responsabilidad y Privacidad" : "Disclaimer & Privacy Notice"}
          </label>

          <div class="p-3.5 rounded-xl bg-slate-900/90 border border-white/10 text-xs text-slate-300 flex flex-col gap-2 max-h-[160px] overflow-y-auto font-mono text-[11px] leading-relaxed">
            <p class="font-bold text-cyan-400">
              {isEs() ? "🔒 Ejecución Local y Supervisión Asistida:" : "🔒 Local Execution & Supervised Assistance:"}
            </p>
            <p>
              {isEs()
                ? "1. Tiancode ejecuta código, comandos de terminal y herramientas de depuración localmente en tu sistema bajo tu supervisión."
                : "1. Tiancode runs code, terminal commands, and debugging tools locally on your system under your supervision."}
            </p>
            <p>
              {isEs()
                ? "2. Las respuestas generadas por modelos de IA son sugerencias asistivas. Verifica siempre el código antes de desplegar en producción."
                : "2. AI responses are assistive suggestions. Always review code changes before deploying to production."}
            </p>
            <p>
              {isEs()
                ? "3. Tus claves API y configuraciones se guardan de forma cifrada y privada en tu equipo local."
                : "3. Your API keys and configuration remain private and encrypted on your local machine."}
            </p>
          </div>

          <label class="flex items-center gap-2.5 p-2.5 rounded-xl bg-slate-800/60 border border-white/10 hover:border-cyan-500/40 transition-all cursor-pointer">
            <input
              type="checkbox"
              checked={disclaimerAccepted()}
              onChange={(e) => setDisclaimerAccepted(e.currentTarget.checked)}
              class="w-4 h-4 accent-cyan-400 rounded cursor-pointer shrink-0"
            />
            <span class="text-xs text-slate-200 font-medium">
              {isEs()
                ? "He leído y acepto el descargo de responsabilidad y las condiciones de uso"
                : "I have read and agree to the disclaimer and terms of responsible use"}
            </span>
          </label>
        </div>
      </Show>

      {/* Navigation and Action Buttons */}
      <div class="flex items-center justify-between pt-2 border-t border-white/10">
        <Show
          when={step() > 1}
          fallback={<div />}
        >
          <button
            type="button"
            onClick={() => setStep((s) => (s - 1) as 1 | 2)}
            class="py-2 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition-all cursor-pointer"
          >
            {isEs() ? "← Atrás" : "← Back"}
          </button>
        </Show>

        <Show
          when={step() < 3}
          fallback={
            <button
              type="button"
              disabled={!disclaimerAccepted()}
              onClick={handleFinish}
              class="py-2.5 px-5 rounded-xl bg-gradient-to-r from-cyan-500 via-sky-500 to-indigo-600 hover:from-cyan-400 hover:to-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold text-xs tracking-wide uppercase transition-all shadow-lg shadow-cyan-500/25 active:scale-[0.98] cursor-pointer flex items-center gap-2"
            >
              {isEs() ? "Comenzar a Programar 🚀" : "Start Coding 🚀"}
            </button>
          }
        >
          <button
            type="button"
            onClick={() => setStep((s) => (s + 1) as 2 | 3)}
            class="py-2 px-4 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs transition-all shadow-md shadow-cyan-500/20 active:scale-[0.98] cursor-pointer flex items-center gap-1.5"
          >
            <span>{isEs() ? "Siguiente" : "Next"}</span>
            <span>→</span>
          </button>
        </Show>
      </div>
    </div>
  )
}
