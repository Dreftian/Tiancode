import { createSignal, type Component, Show } from "solid-js"
import { useDialog } from "@tiancode-ai/ui/context/dialog"
import { useLanguage, type Locale } from "@/context/language"
import { useTheme, type ColorScheme } from "@tiancode-ai/ui/theme/context"
import { useSettings } from "@/context/settings"
import { usePlatform } from "@/context/platform"
import { Switch } from "@tiancode-ai/ui/v2/switch-v2"
import tianLogo from "../../../ui/src/assets/logo/tian-white.png"

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
        await window.api.finishFirstLaunchOnboarding(false)
      }
    } catch {}
    props.onDone?.()
    dialog.close()
  }

  const isEs = () => selectedLocale() === "es"
  const version = () => platform.version || import.meta.env.VITE_TIANCODE_VERSION || "1.0.0"

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

  const isDark = () => selectedTheme() === "dark" || (selectedTheme() === "system" && theme.colorScheme() === "dark")

  const cardClass = (selected: boolean) =>
    `flex items-center justify-between p-3.5 rounded-xl border cursor-pointer transition-all duration-150 select-none ${
      selected
        ? "border-[#0078d4] bg-[#0078d4]/10 shadow-[0_0_0_1px_#0078d4] text-white"
        : "border-white/[0.08] bg-white/[0.03] hover:bg-white/[0.06] hover:border-white/[0.14] text-slate-200"
    }`

  return (
    <div
      class="relative w-full max-w-[560px] max-h-[92vh] bg-[#202020]/95 backdrop-blur-3xl border border-white/[0.12] rounded-2xl p-6 flex flex-col justify-between text-white select-none overflow-hidden font-sans shadow-[0_32px_64px_rgba(0,0,0,0.55),0_1px_0_rgba(255,255,255,0.1)_inset]"
      style={{
        "font-family": "Segoe UI Variable, Segoe UI, -apple-system, BlinkMacSystemFont, Roboto, sans-serif",
      }}
    >
      {/* Windows 11 Mica subtle highlight */}
      <div class="absolute -top-24 -right-24 w-64 h-64 bg-[#0078d4]/15 rounded-full blur-3xl pointer-events-none" />
      <div class="absolute -bottom-24 -left-24 w-64 h-64 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />

      {/* Header - Windows 11 OOBE / Fluent Style */}
      <div class="flex items-start justify-between border-b border-white/[0.08] pb-4 mb-4">
        <div class="flex items-center gap-3.5">
          <div class="relative flex items-center justify-center size-10 rounded-xl bg-white/[0.06] border border-white/[0.12] shadow-sm shrink-0">
            <img
              src={tianLogo}
              alt="Tiancode"
              class="h-6 w-auto object-contain drop-shadow-[0_2px_8px_rgba(0,120,212,0.4)]"
              draggable={false}
            />
          </div>

          <div class="flex flex-col">
            <div class="flex items-center gap-2">
              <h2 class="text-[16px] font-semibold text-white tracking-tight">
                {isEs() ? "Configuración de Tiancode" : "Tiancode Setup"}
              </h2>
              <span class="px-2 py-0.5 text-[10px] font-mono font-medium rounded-md border border-[#0078d4]/40 bg-[#0078d4]/15 text-[#60cdff]">
                v{version()}
              </span>
            </div>
            <p class="text-[12px] text-neutral-400">{stepLabel()}</p>
          </div>
        </div>

        {/* Windows 11 Step Progress Pills */}
        <div class="flex items-center gap-1.5 bg-black/20 border border-white/[0.08] px-2.5 py-1.5 rounded-full">
          {[1, 2, 3].map((s) => (
            <div
              class={`h-1.5 rounded-full transition-all duration-300 ${
                step() === s
                  ? "w-5 bg-[#0078d4] shadow-[0_0_8px_#0078d4]"
                  : step() > s
                    ? "w-2 bg-[#0078d4]/60"
                    : "w-2 bg-white/20"
              }`}
            />
          ))}
        </div>
      </div>

      {/* Step 1: Language and Appearance */}
      <Show when={step() === 1}>
        <div class="flex flex-col gap-4 my-1">
          {/* Language Selection */}
          <div class="flex flex-col gap-2">
            <span class="text-[12px] font-medium text-neutral-400">
              {isEs() ? "Elige el idioma del sistema" : "Choose display language"}
            </span>
            <div class="grid grid-cols-2 gap-2.5">
              <div
                role="button"
                tabIndex={0}
                onClick={() => handleSelectLanguage("es")}
                class={cardClass(selectedLocale() === "es")}
              >
                <div class="flex items-center gap-3">
                  <span class="text-xl">🇪🇸</span>
                  <div class="flex flex-col text-left">
                    <span class="text-[13px] font-medium text-white">Español</span>
                    <span class="text-[11px] text-neutral-400">Predeterminado</span>
                  </div>
                </div>
                {/* Win11 Radio circle */}
                <div
                  class={`size-4 rounded-full border flex items-center justify-center transition-all ${
                    selectedLocale() === "es"
                      ? "border-[#0078d4] bg-[#0078d4]"
                      : "border-white/30 bg-transparent"
                  }`}
                >
                  {selectedLocale() === "es" && <div class="size-1.5 rounded-full bg-white" />}
                </div>
              </div>

              <div
                role="button"
                tabIndex={0}
                onClick={() => handleSelectLanguage("en")}
                class={cardClass(selectedLocale() === "en")}
              >
                <div class="flex items-center gap-3">
                  <span class="text-xl">🇺🇸</span>
                  <div class="flex flex-col text-left">
                    <span class="text-[13px] font-medium text-white">English</span>
                    <span class="text-[11px] text-neutral-400">Fluent Studio</span>
                  </div>
                </div>
                {/* Win11 Radio circle */}
                <div
                  class={`size-4 rounded-full border flex items-center justify-center transition-all ${
                    selectedLocale() === "en"
                      ? "border-[#0078d4] bg-[#0078d4]"
                      : "border-white/30 bg-transparent"
                  }`}
                >
                  {selectedLocale() === "en" && <div class="size-1.5 rounded-full bg-white" />}
                </div>
              </div>
            </div>
          </div>

          {/* Theme Selection */}
          <div class="flex flex-col gap-2">
            <span class="text-[12px] font-medium text-neutral-400">
              {isEs() ? "Modo de color" : "Color mode"}
            </span>
            <div class="grid grid-cols-3 gap-2.5">
              <div
                role="button"
                tabIndex={0}
                onClick={() => handleSelectTheme("dark")}
                class={`flex flex-col items-center gap-2 p-3 rounded-xl border cursor-pointer transition-all duration-150 ${
                  selectedTheme() === "dark"
                    ? "border-[#0078d4] bg-[#0078d4]/10 shadow-[0_0_0_1px_#0078d4] text-white"
                    : "border-white/[0.08] bg-white/[0.03] hover:bg-white/[0.06] hover:border-white/[0.14] text-neutral-300"
                }`}
              >
                <div class="size-8 rounded-lg bg-neutral-900 border border-neutral-700 flex items-center justify-center text-sm shadow-inner">
                  🌙
                </div>
                <span class="text-[12px] font-medium">{isEs() ? "Oscuro" : "Dark"}</span>
              </div>

              <div
                role="button"
                tabIndex={0}
                onClick={() => handleSelectTheme("light")}
                class={`flex flex-col items-center gap-2 p-3 rounded-xl border cursor-pointer transition-all duration-150 ${
                  selectedTheme() === "light"
                    ? "border-[#0078d4] bg-[#0078d4]/10 shadow-[0_0_0_1px_#0078d4] text-white"
                    : "border-white/[0.08] bg-white/[0.03] hover:bg-white/[0.06] hover:border-white/[0.14] text-neutral-300"
                }`}
              >
                <div class="size-8 rounded-lg bg-slate-100 border border-slate-300 text-slate-800 flex items-center justify-center text-sm shadow-inner">
                  ☀️
                </div>
                <span class="text-[12px] font-medium">{isEs() ? "Claro" : "Light"}</span>
              </div>

              <div
                role="button"
                tabIndex={0}
                onClick={() => handleSelectTheme("system")}
                class={`flex flex-col items-center gap-2 p-3 rounded-xl border cursor-pointer transition-all duration-150 ${
                  selectedTheme() === "system"
                    ? "border-[#0078d4] bg-[#0078d4]/10 shadow-[0_0_0_1px_#0078d4] text-white"
                    : "border-white/[0.08] bg-white/[0.03] hover:bg-white/[0.06] hover:border-white/[0.14] text-neutral-300"
                }`}
              >
                <div class="size-8 rounded-lg bg-gradient-to-tr from-neutral-900 to-slate-200 border border-white/20 flex items-center justify-center text-sm shadow-inner">
                  💻
                </div>
                <span class="text-[12px] font-medium">{isEs() ? "Sistema" : "System"}</span>
              </div>
            </div>
          </div>
        </div>
      </Show>

      {/* Step 2: System Configuration (Windows 11 Settings Group Style) */}
      <Show when={step() === 2}>
        <div class="flex flex-col gap-3 my-1">
          <span class="text-[12px] font-medium text-neutral-400">
            {isEs() ? "Preferencias del sistema y accesibilidad" : "System preferences & accessibility"}
          </span>

          {/* Windows 11 Group Container */}
          <div class="flex flex-col rounded-xl border border-white/[0.08] bg-white/[0.03] overflow-hidden divide-y divide-white/[0.06]">
            {/* Sound toggle card */}
            <div
              onClick={() => setEnableSound(!enableSound())}
              class="flex items-center justify-between p-3.5 hover:bg-white/[0.04] transition-colors cursor-pointer"
            >
              <div class="flex items-center gap-3">
                <div class="size-8 rounded-lg bg-white/[0.06] border border-white/[0.1] flex items-center justify-center text-base shrink-0">
                  🔊
                </div>
                <div class="flex flex-col text-left">
                  <span class="text-[13px] font-medium text-white">
                    {isEs() ? "Sonido del sistema y voz neural" : "System sounds & neural voice"}
                  </span>
                  <span class="text-[11.5px] text-neutral-400">
                    {isEs()
                      ? "Respuestas por voz neural Kokoro TTS y avisos de compilación"
                      : "Neural Kokoro voice TTS and compilation alerts"}
                  </span>
                </div>
              </div>
              <Switch checked={enableSound()} onChange={(checked) => setEnableSound(checked)} />
            </div>

            {/* Auto update toggle card */}
            <div
              onClick={() => setAutoUpdates(!autoUpdates())}
              class="flex items-center justify-between p-3.5 hover:bg-white/[0.04] transition-colors cursor-pointer"
            >
              <div class="flex items-center gap-3">
                <div class="size-8 rounded-lg bg-white/[0.06] border border-white/[0.1] flex items-center justify-center text-base shrink-0">
                  🔄
                </div>
                <div class="flex flex-col text-left">
                  <span class="text-[13px] font-medium text-white">
                    {isEs() ? "Actualizaciones automáticas" : "Automatic updates"}
                  </span>
                  <span class="text-[11.5px] text-neutral-400">
                    {isEs()
                      ? "Mantener Tiancode actualizado de forma no destructiva"
                      : "Keep Tiancode updated non-destructively"}
                  </span>
                </div>
              </div>
              <Switch checked={autoUpdates()} onChange={(checked) => setAutoUpdates(checked)} />
            </div>
          </div>

          {/* Windows 11 Info Badge */}
          <div class="p-3 rounded-xl border border-[#0078d4]/20 bg-[#0078d4]/10 text-[11.5px] text-neutral-300 flex items-start gap-2.5">
            <span class="text-[#60cdff] text-base shrink-0 mt-0.5">ℹ️</span>
            <div class="flex flex-col gap-0.5">
              <span class="font-medium text-white">
                {isEs() ? "Modelos locales GGUF y servidores MCP" : "Local GGUF models & MCP servers"}
              </span>
              <span class="text-neutral-400">
                {isEs()
                  ? "Puedes configurar inferencia offline con GPU, plugins y servidores MCP en cualquier momento desde Ajustes."
                  : "You can configure offline GPU models, plugins and MCP servers anytime from Settings."}
              </span>
            </div>
          </div>
        </div>
      </Show>

      {/* Step 3: Disclaimer & Terms */}
      <Show when={step() === 3}>
        <div class="flex flex-col gap-3 my-1">
          <span class="text-[12px] font-medium text-neutral-400">
            {isEs() ? "Condiciones de uso y seguridad" : "Terms of use and security"}
          </span>

          <div class="p-3.5 rounded-xl border border-white/[0.08] bg-white/[0.03] text-[12px] leading-relaxed text-neutral-300 flex flex-col gap-2 max-h-[170px] overflow-y-auto">
            <div class="flex items-center gap-1.5 font-semibold text-white">
              <span>🛡️</span>
              <span>{isEs() ? "Compromiso de Privacidad y Ejecución Local:" : "Local Privacy & Execution Commitment:"}</span>
            </div>
            <p>
              {isEs()
                ? "1. Tiancode ejecuta código y herramientas localmente en tu sistema bajo tu supervisión directa."
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

          <label class="flex items-center gap-3 p-3 rounded-xl border border-white/[0.08] bg-white/[0.03] hover:bg-white/[0.06] transition-colors cursor-pointer select-none">
            <input
              type="checkbox"
              checked={disclaimerAccepted()}
              onChange={(e) => setDisclaimerAccepted(e.currentTarget.checked)}
              class="size-4.5 accent-[#0078d4] rounded cursor-pointer shrink-0"
            />
            <span class="text-[12.5px] text-white font-medium">
              {isEs()
                ? "He leído y acepto el uso responsable de la aplicación"
                : "I have read and agree to the responsible use terms"}
            </span>
          </label>
        </div>
      </Show>

      {/* Navigation and Action Buttons - Windows 11 Fluent style */}
      <div class="flex items-center justify-between pt-3 mt-3 border-t border-white/[0.08]">
        <Show when={step() > 1} fallback={<div />}>
          <button
            type="button"
            onClick={() => setStep((s) => (s - 1) as 1 | 2)}
            class="px-4 py-2 rounded-lg bg-white/[0.06] hover:bg-white/[0.1] active:bg-white/[0.04] border border-white/[0.1] text-neutral-300 hover:text-white text-[13px] font-medium transition-all"
          >
            {isEs() ? "Atrás" : "Back"}
          </button>
        </Show>

        <Show
          when={step() < 3}
          fallback={
            <button
              type="button"
              disabled={!disclaimerAccepted()}
              onClick={() => void handleFinish()}
              class="px-5 py-2 rounded-lg bg-[#0078d4] hover:bg-[#106ebe] active:bg-[#005a9e] disabled:opacity-40 disabled:cursor-not-allowed text-white text-[13px] font-semibold shadow-[0_2px_8px_rgba(0,120,212,0.4)] transition-all flex items-center gap-2"
            >
              <span>{isEs() ? "Comenzar" : "Get Started"}</span>
              <span>→</span>
            </button>
          }
        >
          <button
            type="button"
            onClick={() => setStep((s) => (s + 1) as 2 | 3)}
            class="px-5 py-2 rounded-lg bg-[#0078d4] hover:bg-[#106ebe] active:bg-[#005a9e] text-white text-[13px] font-semibold shadow-[0_2px_8px_rgba(0,120,212,0.4)] transition-all flex items-center gap-1.5"
          >
            <span>{isEs() ? "Siguiente" : "Next"}</span>
            <span>→</span>
          </button>
        </Show>
      </div>
    </div>
  )
}
