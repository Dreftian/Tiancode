import { createSignal, type Component } from "solid-js"
import { useDialog } from "@tiancode-ai/ui/context/dialog"
import { useLanguage, type Locale } from "@/context/language"
import { useTheme, type ColorScheme } from "@tiancode-ai/ui/theme/context"
import { usePlatform } from "@/context/platform"
import tianLogo from "../../../ui/src/assets/logo/tian-white.png"

export const FIRST_LAUNCH_KEY = "tiancode.first_launch.completed"

export const DialogWelcomeSetup: Component<{ onDone?: () => void }> = (props) => {
  const dialog = useDialog()
  const language = useLanguage()
  const theme = useTheme()
  const platform = usePlatform()

  const [selectedLocale, setSelectedLocale] = createSignal<Locale>(language.locale())
  const [selectedTheme, setSelectedTheme] = createSignal<ColorScheme>(theme.colorScheme())

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
      localStorage.setItem("tiancode.sound.enabled", "true")
      localStorage.setItem("tiancode.autoupdate.enabled", "true")
      if (typeof window !== "undefined" && window.api?.finishFirstLaunchOnboarding) {
        await window.api.finishFirstLaunchOnboarding(false)
      }
    } catch {}
    props.onDone?.()
    dialog.close()
  }

  const isEs = () => selectedLocale() === "es"
  const version = () => platform.version || import.meta.env.VITE_TIANCODE_VERSION || "1.0.21"

  const isDark = () => selectedTheme() === "dark" || (selectedTheme() === "system" && theme.colorScheme() === "dark")

  const cardClass = (selected: boolean) => {
    if (isDark()) {
      return `flex items-center justify-between p-3.5 rounded-xl border cursor-pointer transition-all duration-150 select-none ${
        selected
          ? "border-cyan-400 bg-cyan-500/15 shadow-[0_0_16px_rgba(56,189,248,0.25)] text-white"
          : "border-white/[0.08] bg-white/[0.03] hover:bg-white/[0.06] hover:border-cyan-500/30 text-slate-200"
      }`
    }
    return `flex items-center justify-between p-3.5 rounded-xl border cursor-pointer transition-all duration-150 select-none ${
      selected
        ? "border-sky-500 bg-sky-50/90 shadow-[0_0_16px_rgba(2,132,199,0.15)] text-slate-900"
        : "border-slate-200 bg-slate-50/70 hover:bg-slate-100 hover:border-slate-300 text-slate-700"
    }`
  }

  return (
    <div
      class={`relative w-full max-w-[510px] rounded-2xl p-6 flex flex-col justify-between select-none overflow-hidden font-sans transition-colors duration-200 ${
        isDark()
          ? "bg-[#0c0d12]/95 backdrop-blur-3xl border border-white/[0.1] text-white shadow-[0_24px_64px_rgba(0,0,0,0.85),0_0_40px_rgba(56,189,248,0.15)]"
          : "bg-white/98 backdrop-blur-3xl border border-slate-200 text-slate-900 shadow-[0_24px_64px_rgba(0,0,0,0.12),0_0_30px_rgba(2,132,199,0.1)]"
      }`}
      style={{
        "font-family": "Segoe UI Variable, Segoe UI, -apple-system, BlinkMacSystemFont, Roboto, sans-serif",
        "overflow": "hidden !important",
      }}
    >
      {/* Subtle glowing highlights */}
      <div
        class={`absolute -top-24 -right-24 w-64 h-64 rounded-full blur-3xl pointer-events-none transition-colors duration-300 ${
          isDark() ? "bg-cyan-500/20" : "bg-sky-400/20"
        }`}
      />
      <div
        class={`absolute -bottom-24 -left-24 w-64 h-64 rounded-full blur-3xl pointer-events-none transition-colors duration-300 ${
          isDark() ? "bg-indigo-500/20" : "bg-blue-400/15"
        }`}
      />

      {/* Header */}
      <div
        class={`flex items-start justify-between border-b pb-4 mb-4 transition-colors duration-200 ${
          isDark() ? "border-white/[0.08]" : "border-slate-200"
        }`}
      >
        <div class="flex items-center gap-3.5">
          <div
            class={`relative flex items-center justify-center size-10 rounded-xl border shrink-0 transition-colors duration-200 ${
              isDark()
                ? "bg-cyan-500/10 border-cyan-400/30 shadow-[0_0_14px_rgba(56,189,248,0.25)]"
                : "bg-slate-900 border-sky-500/30 shadow-[0_0_14px_rgba(2,132,199,0.2)]"
            }`}
          >
            <img
              src={tianLogo}
              alt="Tiancode"
              class="h-6 w-auto object-contain drop-shadow-[0_0_10px_rgba(56,189,248,0.6)]"
              draggable={false}
            />
          </div>

          <div class="flex flex-col">
            <div class="flex items-center gap-2">
              <h2
                class={`text-[16px] font-semibold tracking-tight transition-colors duration-200 ${
                  isDark() ? "text-white" : "text-slate-900"
                }`}
              >
                {isEs() ? "Configuración de Tiancode" : "Tiancode Setup"}
              </h2>
              <span
                class={`px-2 py-0.5 text-[10px] font-mono font-medium rounded-md border transition-colors duration-200 ${
                  isDark()
                    ? "border-cyan-400/40 bg-cyan-500/15 text-cyan-300"
                    : "border-sky-400 bg-sky-50 text-sky-700"
                }`}
              >
                v{version()}
              </span>
            </div>
            <p
              class={`text-[12px] transition-colors duration-200 ${
                isDark() ? "text-cyan-200/60" : "text-slate-500"
              }`}
            >
              {isEs() ? "Paso 1 de 3: Elige tu idioma y tema" : "Step 1 of 3: Choose language & theme"}
            </p>
          </div>
        </div>

        {/* Step Progress Pill */}
        <div
          class={`flex items-center gap-1.5 border px-2.5 py-1.5 rounded-full transition-colors duration-200 ${
            isDark() ? "bg-black/40 border-cyan-500/20" : "bg-slate-100 border-slate-300/80"
          }`}
        >
          <div
            class={`h-1.5 rounded-full transition-all duration-300 ${
              isDark()
                ? "w-5 bg-gradient-to-r from-cyan-400 to-sky-400 shadow-[0_0_10px_rgba(56,189,248,0.9)]"
                : "w-5 bg-sky-500 shadow-[0_0_8px_rgba(2,132,199,0.4)]"
            }`}
          />
        </div>
      </div>

      {/* Main Body: Language and Color Mode */}
      <div class="flex flex-col gap-4 my-1">
        {/* Language Selection */}
        <div class="flex flex-col gap-2">
          <span
            class={`text-[12px] font-medium transition-colors duration-200 ${
              isDark() ? "text-neutral-400" : "text-slate-600"
            }`}
          >
            {isEs() ? "Elige el idioma del sistema" : "Choose display language"}
          </span>
          <div class="grid grid-cols-2 gap-2.5">
            {/* ES */}
            <div
              role="button"
              tabIndex={0}
              onClick={() => handleSelectLanguage("es")}
              class={cardClass(selectedLocale() === "es")}
            >
              <div class="flex items-center gap-3">
                <span
                  class={`text-xs font-bold px-1.5 py-0.5 rounded border transition-colors ${
                    isDark()
                      ? "bg-white/10 text-cyan-300 border-white/15"
                      : "bg-sky-100 text-sky-800 border-sky-300"
                  }`}
                >
                  ES
                </span>
                <div class="flex flex-col text-left">
                  <span
                    class={`text-[13px] font-medium transition-colors ${
                      isDark() ? "text-white" : "text-slate-900"
                    }`}
                  >
                    Español
                  </span>
                  <span
                    class={`text-[11px] transition-colors ${
                      isDark() ? "text-neutral-400" : "text-slate-500"
                    }`}
                  >
                    Predeterminado
                  </span>
                </div>
              </div>
              {/* Radio circle */}
              <div
                class={`size-4 rounded-full border flex items-center justify-center transition-all ${
                  selectedLocale() === "es"
                    ? isDark()
                      ? "border-cyan-400 bg-cyan-400 shadow-[0_0_8px_rgba(56,189,248,0.8)]"
                      : "border-sky-500 bg-sky-500 shadow-[0_0_8px_rgba(2,132,199,0.5)]"
                    : isDark()
                      ? "border-white/30 bg-transparent"
                      : "border-slate-300 bg-white"
                }`}
              >
                {selectedLocale() === "es" && (
                  <div
                    class={`size-1.5 rounded-full ${
                      isDark() ? "bg-black" : "bg-white"
                    }`}
                  />
                )}
              </div>
            </div>

            {/* EN */}
            <div
              role="button"
              tabIndex={0}
              onClick={() => handleSelectLanguage("en")}
              class={cardClass(selectedLocale() === "en")}
            >
              <div class="flex items-center gap-3">
                <span
                  class={`text-xs font-bold px-1.5 py-0.5 rounded border transition-colors ${
                    isDark()
                      ? "bg-white/10 text-cyan-300 border-white/15"
                      : "bg-sky-100 text-sky-800 border-sky-300"
                  }`}
                >
                  US
                </span>
                <div class="flex flex-col text-left">
                  <span
                    class={`text-[13px] font-medium transition-colors ${
                      isDark() ? "text-white" : "text-slate-900"
                    }`}
                  >
                    English
                  </span>
                  <span
                    class={`text-[11px] transition-colors ${
                      isDark() ? "text-neutral-400" : "text-slate-500"
                    }`}
                  >
                    Fluent Studio
                  </span>
                </div>
              </div>
              {/* Radio circle */}
              <div
                class={`size-4 rounded-full border flex items-center justify-center transition-all ${
                  selectedLocale() === "en"
                    ? isDark()
                      ? "border-cyan-400 bg-cyan-400 shadow-[0_0_8px_rgba(56,189,248,0.8)]"
                      : "border-sky-500 bg-sky-500 shadow-[0_0_8px_rgba(2,132,199,0.5)]"
                    : isDark()
                      ? "border-white/30 bg-transparent"
                      : "border-slate-300 bg-white"
                }`}
              >
                {selectedLocale() === "en" && (
                  <div
                    class={`size-1.5 rounded-full ${
                      isDark() ? "bg-black" : "bg-white"
                    }`}
                  />
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Theme Selection */}
        <div class="flex flex-col gap-2">
          <span
            class={`text-[12px] font-medium transition-colors duration-200 ${
              isDark() ? "text-neutral-400" : "text-slate-600"
            }`}
          >
            {isEs() ? "Modo de color" : "Color mode"}
          </span>
          <div class="grid grid-cols-3 gap-2.5">
            {/* Oscuro */}
            <div
              role="button"
              tabIndex={0}
              onClick={() => handleSelectTheme("dark")}
              class={`flex flex-col items-center gap-2 p-3 rounded-xl border cursor-pointer transition-all duration-150 ${
                selectedTheme() === "dark"
                  ? isDark()
                    ? "border-cyan-400 bg-cyan-500/20 shadow-[0_0_14px_rgba(56,189,248,0.25)] text-white font-medium"
                    : "border-sky-500 bg-sky-50 shadow-[0_0_14px_rgba(2,132,199,0.2)] text-sky-950 font-semibold"
                  : isDark()
                    ? "border-white/[0.08] bg-white/[0.03] hover:bg-white/[0.06] hover:border-cyan-500/30 text-neutral-300"
                    : "border-slate-200 bg-slate-50/60 hover:bg-slate-100 hover:border-slate-300 text-slate-600"
              }`}
            >
              <div
                class={`size-8 rounded-lg flex items-center justify-center text-sm shadow-inner transition-colors ${
                  isDark()
                    ? "bg-neutral-900 border border-neutral-700"
                    : "bg-slate-800 border border-slate-700 text-white"
                }`}
              >
                🌙
              </div>
              <span class="text-[12px]">{isEs() ? "Oscuro" : "Dark"}</span>
            </div>

            {/* Claro */}
            <div
              role="button"
              tabIndex={0}
              onClick={() => handleSelectTheme("light")}
              class={`flex flex-col items-center gap-2 p-3 rounded-xl border cursor-pointer transition-all duration-150 ${
                selectedTheme() === "light"
                  ? isDark()
                    ? "border-cyan-400 bg-cyan-500/20 shadow-[0_0_14px_rgba(56,189,248,0.25)] text-white font-medium"
                    : "border-sky-500 bg-sky-50 shadow-[0_0_14px_rgba(2,132,199,0.2)] text-sky-950 font-semibold"
                  : isDark()
                    ? "border-white/[0.08] bg-white/[0.03] hover:bg-white/[0.06] hover:border-cyan-500/30 text-neutral-300"
                    : "border-slate-200 bg-slate-50/60 hover:bg-slate-100 hover:border-slate-300 text-slate-600"
              }`}
            >
              <div
                class={`size-8 rounded-lg flex items-center justify-center text-sm shadow-inner transition-colors ${
                  isDark()
                    ? "bg-slate-100 border border-slate-300 text-slate-800"
                    : "bg-amber-50 border border-amber-300 text-amber-600 shadow-sm"
                }`}
              >
                ☀️
              </div>
              <span class="text-[12px]">{isEs() ? "Claro" : "Light"}</span>
            </div>

            {/* Sistema */}
            <div
              role="button"
              tabIndex={0}
              onClick={() => handleSelectTheme("system")}
              class={`flex flex-col items-center gap-2 p-3 rounded-xl border cursor-pointer transition-all duration-150 ${
                selectedTheme() === "system"
                  ? isDark()
                    ? "border-cyan-400 bg-cyan-500/20 shadow-[0_0_14px_rgba(56,189,248,0.25)] text-white font-medium"
                    : "border-sky-500 bg-sky-50 shadow-[0_0_14px_rgba(2,132,199,0.2)] text-sky-950 font-semibold"
                  : isDark()
                    ? "border-white/[0.08] bg-white/[0.03] hover:bg-white/[0.06] hover:border-cyan-500/30 text-neutral-300"
                    : "border-slate-200 bg-slate-50/60 hover:bg-slate-100 hover:border-slate-300 text-slate-600"
              }`}
            >
              <div
                class={`size-8 rounded-lg flex items-center justify-center text-sm shadow-inner transition-colors ${
                  isDark()
                    ? "bg-gradient-to-tr from-neutral-900 to-slate-200 border border-white/20"
                    : "bg-gradient-to-tr from-slate-100 to-slate-200 border border-slate-300"
                }`}
              >
                💻
              </div>
              <span class="text-[12px]">{isEs() ? "Sistema" : "System"}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Action Button Footer */}
      <div
        class={`flex items-center justify-end pt-3 mt-3 border-t transition-colors duration-200 ${
          isDark() ? "border-white/[0.08]" : "border-slate-200"
        }`}
      >
        <button
          type="button"
          onClick={() => void handleFinish()}
          class={`px-6 py-2 rounded-lg text-white text-[13px] font-semibold transition-all flex items-center gap-1.5 active:scale-[0.99] ${
            isDark()
              ? "bg-gradient-to-r from-cyan-500 via-sky-500 to-indigo-500 hover:from-cyan-400 hover:to-indigo-400 shadow-[0_0_20px_rgba(56,189,248,0.4)]"
              : "bg-gradient-to-r from-sky-600 via-blue-600 to-indigo-600 hover:from-sky-500 hover:to-indigo-500 shadow-[0_0_20px_rgba(2,132,199,0.35)]"
          }`}
        >
          <span>{isEs() ? "Siguiente" : "Next"}</span>
          <span>→</span>
        </button>
      </div>
    </div>
  )
}
