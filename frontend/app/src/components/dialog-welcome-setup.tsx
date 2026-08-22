import { createSignal, type Component, Show } from "solid-js"
import { useDialog } from "@tiancode-ai/ui/context/dialog"
import { useLanguage, type Locale } from "@/context/language"
import { useTheme, type ColorScheme } from "@tiancode-ai/ui/theme/context"
import { useSettings } from "@/context/settings"
import { usePlatform } from "@/context/platform"

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
  const version = () => platform.version || "1.0.95"

  return (
    <div class="relative w-full max-w-[560px] rounded-3xl bg-[#090d1a]/95 border border-white/12 shadow-[0_24px_64px_rgba(0,0,0,0.7)] p-7 flex flex-col gap-6 text-slate-100 backdrop-blur-2xl animate-fade-in z-10 select-none overflow-hidden">
      {/* Ambient background glows */}
      <div class="absolute -top-16 -left-16 w-64 h-64 bg-cyan-500/20 rounded-full blur-3xl pointer-events-none" />
      <div class="absolute -bottom-16 -right-16 w-64 h-64 bg-indigo-500/20 rounded-full blur-3xl pointer-events-none" />

      {/* Header with Tiancode Cat Mascot */}
      <div class="flex items-center justify-between border-b border-white/10 pb-5">
        <div class="flex items-center gap-4">
          <div class="relative group">
            <div class="w-13 h-13 rounded-2xl bg-gradient-to-br from-cyan-400 via-sky-500 to-indigo-600 p-[1.5px] shadow-[0_0_20px_rgba(56,189,248,0.35)] flex items-center justify-center shrink-0">
              <div class="w-full h-full bg-[#070b16] rounded-[14px] flex items-center justify-center p-2">
                {/* Authentic Tiancode Cat Logo SVG */}
                <svg viewBox="0 0 100 100" class="w-full h-full text-white drop-shadow-[0_0_8px_rgba(56,189,248,0.6)]" fill="currentColor">
                  {/* Ears */}
                  <polygon points="18,12 36,44 14,48" fill="currentColor" />
                  <polygon points="82,12 86,48 64,44" fill="currentColor" />
                  {/* Head outline */}
                  <path d="M22,38 C32,24 68,24 78,38 C88,52 88,78 72,90 C58,98 42,98 28,90 C12,78 12,52 22,38 Z" fill="currentColor" />
                  {/* Inner eye diamond cutouts (dark) */}
                  <polygon points="34,44 44,54 34,64 24,54" fill="#070b16" />
                  <polygon points="66,44 76,54 66,64 56,54" fill="#070b16" />
                  {/* Eye pupils */}
                  <ellipse cx="34" cy="54" rx="3.2" ry="4.5" fill="currentColor" />
                  <ellipse cx="66" cy="54" rx="3.2" ry="4.5" fill="currentColor" />
                  {/* Nose */}
                  <polygon points="50,62 44,56 56,56" fill="#070b16" />
                  {/* Mouth and chin */}
                  <path d="M50,62 L50,68 C46,68 44,72 44,74 M50,68 C54,68 56,72 56,74" stroke="#070b16" stroke-width="2.5" stroke-linecap="round" fill="none" />
                  {/* Whiskers */}
                  <line x1="8" y1="62" x2="26" y2="64" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" />
                  <line x1="6" y1="70" x2="26" y2="70" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" />
                  <line x1="8" y1="78" x2="26" y2="76" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" />
                  <line x1="92" y1="62" x2="74" y2="64" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" />
                  <line x1="94" y1="70" x2="74" y2="70" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" />
                  <line x1="92" y1="78" x2="74" y2="76" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" />
                </svg>
              </div>
            </div>
            <div class="absolute -bottom-1 -right-1 w-3.5 h-3.5 rounded-full bg-emerald-400 border-2 border-[#090d1a] shadow-[0_0_8px_#34d399]" />
          </div>

          <div class="flex flex-col gap-0.5">
            <div class="flex items-center gap-2.5">
              <h2 class="text-lg font-bold tracking-tight text-white">
                {isEs() ? "Configuración Inicial de Tiancode" : "Tiancode Initial Setup"}
              </h2>
              <span class="px-2 py-0.5 text-[10px] font-mono font-bold rounded-md bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 shadow-[0_0_8px_rgba(56,189,248,0.2)]">
                v{version()}
              </span>
            </div>
            <p class="text-xs text-slate-400 font-medium">
              {isEs()
                ? step() === 1
                  ? "Paso 1 de 3: Elige tu idioma y tema"
                  : step() === 2
                  ? "Paso 2 de 3: Personaliza módulos y sonido"
                  : "Paso 3 de 3: Descargo de responsabilidad y privacidad"
                : step() === 1
                ? "Step 1 of 3: Choose language & theme"
                : step() === 2
                ? "Step 2 of 3: Customize sound & options"
                : "Step 3 of 3: Disclaimer & privacy notice"}
            </p>
          </div>
        </div>

        {/* Step Indicator */}
        <div class="flex items-center gap-2 bg-slate-900/90 px-3 py-1.5 rounded-full border border-white/10 shadow-inner">
          <div class={`w-2.5 h-2.5 rounded-full transition-all duration-300 ${step() >= 1 ? "bg-cyan-400 shadow-[0_0_8px_#38bdf8]" : "bg-slate-700"}`} />
          <div class={`w-2.5 h-2.5 rounded-full transition-all duration-300 ${step() >= 2 ? "bg-cyan-400 shadow-[0_0_8px_#38bdf8]" : "bg-slate-700"}`} />
          <div class={`w-2.5 h-2.5 rounded-full transition-all duration-300 ${step() >= 3 ? "bg-cyan-400 shadow-[0_0_8px_#38bdf8]" : "bg-slate-700"}`} />
        </div>
      </div>

      {/* Step 1: Language and Appearance */}
      <Show when={step() === 1}>
        <div class="flex flex-col gap-5 animate-fade-in">
          {/* Language Selection */}
          <div class="flex flex-col gap-2.5">
            <label class="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-2">
              <span>🌐</span>
              <span>{isEs() ? "Idioma de la Aplicación" : "Application Language"}</span>
            </label>
            <div class="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => handleSelectLanguage("es")}
                class={`flex items-center gap-3.5 p-3.5 rounded-2xl border transition-all duration-200 text-left cursor-pointer ${
                  selectedLocale() === "es"
                    ? "bg-cyan-500/20 border-cyan-400 text-white shadow-[0_0_20px_rgba(56,189,248,0.25)] ring-1 ring-cyan-400/50"
                    : "bg-slate-800/60 border-white/10 text-slate-300 hover:border-white/20 hover:bg-slate-800/90"
                }`}
              >
                <span class="text-2xl drop-shadow">🇪🇸</span>
                <div class="flex flex-col flex-1">
                  <div class="flex items-center justify-between">
                    <span class="text-sm font-bold">Español</span>
                    <Show when={selectedLocale() === "es"}>
                      <span class="text-[10px] bg-cyan-400/20 text-cyan-300 font-bold px-1.5 py-0.5 rounded border border-cyan-400/30">✓</span>
                    </Show>
                  </div>
                  <span class="text-xs text-slate-400">Predeterminado (Local)</span>
                </div>
              </button>

              <button
                type="button"
                onClick={() => handleSelectLanguage("en")}
                class={`flex items-center gap-3.5 p-3.5 rounded-2xl border transition-all duration-200 text-left cursor-pointer ${
                  selectedLocale() === "en"
                    ? "bg-cyan-500/20 border-cyan-400 text-white shadow-[0_0_20px_rgba(56,189,248,0.25)] ring-1 ring-cyan-400/50"
                    : "bg-slate-800/60 border-white/10 text-slate-300 hover:border-white/20 hover:bg-slate-800/90"
                }`}
              >
                <span class="text-2xl drop-shadow">🇺🇸</span>
                <div class="flex flex-col flex-1">
                  <div class="flex items-center justify-between">
                    <span class="text-sm font-bold">English</span>
                    <Show when={selectedLocale() === "en"}>
                      <span class="text-[10px] bg-cyan-400/20 text-cyan-300 font-bold px-1.5 py-0.5 rounded border border-cyan-400/30">✓</span>
                    </Show>
                  </div>
                  <span class="text-xs text-slate-400">Fluent Studio UI</span>
                </div>
              </button>
            </div>
          </div>

          {/* Theme Selection */}
          <div class="flex flex-col gap-2.5">
            <label class="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-2">
              <span>🎨</span>
              <span>{isEs() ? "Tema Visual" : "Theme Preference"}</span>
            </label>
            <div class="grid grid-cols-3 gap-3">
              <button
                type="button"
                onClick={() => handleSelectTheme("dark")}
                class={`flex flex-col items-center gap-2 p-3.5 rounded-2xl border transition-all duration-200 cursor-pointer ${
                  selectedTheme() === "dark"
                    ? "bg-cyan-500/20 border-cyan-400 text-white shadow-[0_0_20px_rgba(56,189,248,0.25)] ring-1 ring-cyan-400/50"
                    : "bg-slate-800/60 border-white/10 text-slate-300 hover:border-white/20 hover:bg-slate-800/90"
                }`}
              >
                <span class="text-2xl">🌙</span>
                <span class="text-xs font-bold">{isEs() ? "Oscuro (Neon)" : "Dark (Neon)"}</span>
              </button>

              <button
                type="button"
                onClick={() => handleSelectTheme("light")}
                class={`flex flex-col items-center gap-2 p-3.5 rounded-2xl border transition-all duration-200 cursor-pointer ${
                  selectedTheme() === "light"
                    ? "bg-cyan-500/20 border-cyan-400 text-white shadow-[0_0_20px_rgba(56,189,248,0.25)] ring-1 ring-cyan-400/50"
                    : "bg-slate-800/60 border-white/10 text-slate-300 hover:border-white/20 hover:bg-slate-800/90"
                }`}
              >
                <span class="text-2xl">☀️</span>
                <span class="text-xs font-bold">{isEs() ? "Claro (Light)" : "Light"}</span>
              </button>

              <button
                type="button"
                onClick={() => handleSelectTheme("system")}
                class={`flex flex-col items-center gap-2 p-3.5 rounded-2xl border transition-all duration-200 cursor-pointer ${
                  selectedTheme() === "system"
                    ? "bg-cyan-500/20 border-cyan-400 text-white shadow-[0_0_20px_rgba(56,189,248,0.25)] ring-1 ring-cyan-400/50"
                    : "bg-slate-800/60 border-white/10 text-slate-300 hover:border-white/20 hover:bg-slate-800/90"
                }`}
              >
                <span class="text-2xl">💻</span>
                <span class="text-xs font-bold">{isEs() ? "Automático" : "System Sync"}</span>
              </button>
            </div>
          </div>
        </div>
      </Show>

      {/* Step 2: System Configuration */}
      <Show when={step() === 2}>
        <div class="flex flex-col gap-4 animate-fade-in">
          <label class="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-2">
            <span>⚙️</span>
            <span>{isEs() ? "Opciones y Módulos del Sistema" : "System Options & Modules"}</span>
          </label>

          {/* Sound toggle card */}
          <div
            onClick={() => setEnableSound(!enableSound())}
            class="flex items-center justify-between p-4 rounded-2xl bg-slate-800/60 border border-white/10 hover:border-cyan-400/40 hover:bg-slate-800/90 transition-all duration-200 cursor-pointer"
          >
            <div class="flex items-center gap-3.5">
              <div class="w-10 h-10 rounded-xl bg-cyan-500/15 border border-cyan-500/30 flex items-center justify-center text-xl shrink-0">
                🔊
              </div>
              <div class="flex flex-col">
                <span class="text-sm font-bold text-white">
                  {isEs() ? "Efectos de Sonido y Voz TTS" : "Sound Effects & Voice TTS"}
                </span>
                <span class="text-xs text-slate-400">
                  {isEs()
                    ? "Respuestas con síntesis Kokoro/Piper y retroalimentación auditiva"
                    : "Kokoro/Piper TTS voices and audio notifications"}
                </span>
              </div>
            </div>
            {/* Custom Toggle Switch */}
            <div class={`w-12 h-6.5 rounded-full p-0.5 transition-colors duration-200 flex items-center shrink-0 ${enableSound() ? "bg-cyan-500 shadow-[0_0_12px_rgba(56,189,248,0.4)]" : "bg-slate-700"}`}>
              <div class={`w-5.5 h-5.5 rounded-full bg-white shadow-md transform transition-transform duration-200 ${enableSound() ? "translate-x-5.5" : "translate-x-0"}`} />
            </div>
          </div>

          {/* Auto update toggle card */}
          <div
            onClick={() => setAutoUpdates(!autoUpdates())}
            class="flex items-center justify-between p-4 rounded-2xl bg-slate-800/60 border border-white/10 hover:border-cyan-400/40 hover:bg-slate-800/90 transition-all duration-200 cursor-pointer"
          >
            <div class="flex items-center gap-3.5">
              <div class="w-10 h-10 rounded-xl bg-sky-500/15 border border-sky-500/30 flex items-center justify-center text-xl shrink-0">
                🔄
              </div>
              <div class="flex flex-col">
                <span class="text-sm font-bold text-white">
                  {isEs() ? "Actualizaciones Automáticas" : "Automatic Updates"}
                </span>
                <span class="text-xs text-slate-400">
                  {isEs()
                    ? "Buscar nuevas versiones y mejoras no destructivas en segundo plano"
                    : "Background non-destructive updates for models & tools"}
                </span>
              </div>
            </div>
            {/* Custom Toggle Switch */}
            <div class={`w-12 h-6.5 rounded-full p-0.5 transition-colors duration-200 flex items-center shrink-0 ${autoUpdates() ? "bg-cyan-500 shadow-[0_0_12px_rgba(56,189,248,0.4)]" : "bg-slate-700"}`}>
              <div class={`w-5.5 h-5.5 rounded-full bg-white shadow-md transform transition-transform duration-200 ${autoUpdates() ? "translate-x-5.5" : "translate-x-0"}`} />
            </div>
          </div>

          {/* Info callout */}
          <div class="p-3.5 rounded-2xl bg-gradient-to-r from-cyan-950/40 to-indigo-950/40 border border-cyan-500/25 text-xs text-cyan-200 flex items-start gap-3 shadow-inner">
            <span class="text-base text-cyan-400 mt-0.5">💡</span>
            <div class="flex flex-col gap-0.5">
              <span class="font-bold text-cyan-300">
                {isEs() ? "Servidores MCP y Proveedores Disponibles" : "MCP Servers & AI Providers"}
              </span>
              <span class="text-slate-300 leading-relaxed text-[11px]">
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
        <div class="flex flex-col gap-4 animate-fade-in">
          <label class="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-2">
            <span>🛡️</span>
            <span>{isEs() ? "Descargo de Responsabilidad y Privacidad" : "Disclaimer & Privacy Notice"}</span>
          </label>

          <div class="p-4 rounded-2xl bg-slate-900/95 border border-white/10 text-xs text-slate-300 flex flex-col gap-2.5 max-h-[170px] overflow-y-auto leading-relaxed shadow-inner">
            <div class="flex items-center gap-2 text-cyan-400 font-bold">
              <span>🔒</span>
              <span>{isEs() ? "Ejecución Local y Supervisión Asistida:" : "Local Execution & Supervised Assistance:"}</span>
            </div>
            <p class="text-slate-300 text-[11px]">
              {isEs()
                ? "1. Tiancode ejecuta código, comandos de terminal y herramientas de depuración localmente en tu sistema bajo tu supervisión directa."
                : "1. Tiancode runs code, terminal commands, and debugging tools locally on your machine under your supervision."}
            </p>
            <p class="text-slate-300 text-[11px]">
              {isEs()
                ? "2. Las respuestas generadas por modelos de IA son sugerencias asistivas. Verifica siempre el código antes de desplegar en producción."
                : "2. AI responses are assistive suggestions. Always review changes before applying to production environments."}
            </p>
            <p class="text-slate-300 text-[11px]">
              {isEs()
                ? "3. Tus claves API, sesiones y configuraciones se guardan de forma cifrada y privada en tu equipo local."
                : "3. Your API keys, sessions, and configuration are encrypted and stored solely on your local device."}
            </p>
          </div>

          <label class="flex items-center gap-3.5 p-3.5 rounded-2xl bg-slate-800/60 border border-white/10 hover:border-cyan-500/50 hover:bg-slate-800/90 transition-all duration-200 cursor-pointer">
            <input
              type="checkbox"
              checked={disclaimerAccepted()}
              onChange={(e) => setDisclaimerAccepted(e.currentTarget.checked)}
              class="w-5 h-5 accent-cyan-400 rounded-md cursor-pointer shrink-0"
            />
            <span class="text-xs text-slate-200 font-semibold leading-snug">
              {isEs()
                ? "He leído y acepto el descargo de responsabilidad y las condiciones de uso responsable"
                : "I have read and agree to the disclaimer and terms of responsible use"}
            </span>
          </label>
        </div>
      </Show>

      {/* Navigation and Action Buttons */}
      <div class="flex items-center justify-between pt-3 border-t border-white/10">
        <Show
          when={step() > 1}
          fallback={<div />}
        >
          <button
            type="button"
            onClick={() => setStep((s) => (s - 1) as 1 | 2)}
            class="py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold transition-all duration-150 cursor-pointer flex items-center gap-2"
          >
            <span>←</span>
            <span>{isEs() ? "Atrás" : "Back"}</span>
          </button>
        </Show>

        <Show
          when={step() < 3}
          fallback={
            <button
              type="button"
              disabled={!disclaimerAccepted()}
              onClick={handleFinish}
              class="py-3 px-6 rounded-2xl bg-gradient-to-r from-cyan-500 via-sky-500 to-indigo-600 hover:from-cyan-400 hover:to-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold text-xs tracking-wide uppercase transition-all shadow-[0_0_24px_rgba(56,189,248,0.35)] active:scale-[0.98] cursor-pointer flex items-center gap-2.5"
            >
              <span>{isEs() ? "Comenzar a Programar" : "Start Coding"}</span>
              <span class="text-sm">🚀</span>
            </button>
          }
        >
          <button
            type="button"
            onClick={() => setStep((s) => (s + 1) as 2 | 3)}
            class="py-2.5 px-5 rounded-2xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs transition-all shadow-[0_0_16px_rgba(56,189,248,0.3)] active:scale-[0.98] cursor-pointer flex items-center gap-2"
          >
            <span>{isEs() ? "Siguiente" : "Next"}</span>
            <span>→</span>
          </button>
        </Show>
      </div>
    </div>
  )
}

