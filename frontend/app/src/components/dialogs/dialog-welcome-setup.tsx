import { createSignal, For, Show, type Component, type JSX } from "solid-js"
import { useDialog } from "@tiancode-ai/ui/context/dialog"
import { useLanguage, type Locale } from "@/context/language"
import { useTheme, type ColorScheme } from "@tiancode-ai/ui/theme/context"
import { usePlatform } from "@/context/platform"
import tianLogo from "@tiancode-ai/ui/assets/logo/tian-white.png"

export const FIRST_LAUNCH_KEY = "tiancode.first_launch.completed"

/** Set when the user asks to connect a provider during onboarding; the shell opens Settings on boot. */
export const PENDING_PROVIDER_SETUP_KEY = "tiancode.first_launch.open_providers"

const TOTAL_STEPS = 3

const LOCALE_OPTIONS: { locale: Locale; badge: string; name: string }[] = [
  { locale: "es", badge: "ES", name: "Español" },
  { locale: "en", badge: "US", name: "English" },
  { locale: "en-150", badge: "EU", name: "English (EU)" },
  { locale: "zh", badge: "ZH", name: "中文" },
  { locale: "ja", badge: "JA", name: "日本語" },
  { locale: "ko", badge: "KO", name: "한국어" },
  { locale: "ru", badge: "RU", name: "Русский" },
]

const THEME_OPTIONS: { mode: ColorScheme; glyph: string; key: string }[] = [
  { mode: "dark", glyph: "🌙", key: "welcome.theme.dark" },
  { mode: "light", glyph: "☀️", key: "welcome.theme.light" },
  { mode: "system", glyph: "💻", key: "welcome.theme.system" },
]

export const DialogWelcomeSetup: Component<{ onDone?: () => void }> = (props) => {
  const dialog = useDialog()
  const language = useLanguage()
  const theme = useTheme()
  const platform = usePlatform()

  const [step, setStep] = createSignal(1)
  const [finishing, setFinishing] = createSignal(false)
  const [createDefaultProject, setCreateDefaultProject] = createSignal(true)
  const [connectProvider, setConnectProvider] = createSignal(true)
  const [selectedLocale, setSelectedLocale] = createSignal<Locale>(language.locale())
  const [selectedTheme, setSelectedTheme] = createSignal<ColorScheme>(theme.colorScheme())

  const t = (key: string, params?: Record<string, string | number>) => language.t(key, params)

  const handleSelectLanguage = (loc: Locale) => {
    setSelectedLocale(loc)
    language.setLocale(loc)
    try {
      localStorage.setItem("tiancode-lang", loc)
    } catch {
      // A blocked localStorage only costs the persisted preference; the in-memory locale still applies.
    }
  }

  const handleSelectTheme = (mode: ColorScheme) => {
    setSelectedTheme(mode)
    theme.setColorScheme(mode)
    try {
      localStorage.setItem("tiancode-theme", mode)
      document.documentElement.setAttribute("data-theme", mode)
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
      if (connectProvider()) localStorage.setItem(PENDING_PROVIDER_SETUP_KEY, "true")
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
  const isDark = () => selectedTheme() === "dark" || (selectedTheme() === "system" && theme.colorScheme() === "dark")

  const subtitle = () => t(`welcome.step${step()}.subtitle`)

  const cardClass = (selected: boolean) =>
    `flex items-center justify-between gap-2 p-3 rounded-xl border cursor-pointer transition-all duration-150 select-none text-left ${
      selected
        ? isDark()
          ? "border-cyan-400 bg-cyan-500/15 shadow-[0_0_16px_rgba(56,189,248,0.25)] text-white"
          : "border-sky-500 bg-sky-50/90 shadow-[0_0_16px_rgba(2,132,199,0.15)] text-slate-900"
        : isDark()
          ? "border-white/[0.08] bg-white/[0.03] hover:bg-white/[0.06] hover:border-cyan-500/30 text-slate-200"
          : "border-slate-200 bg-slate-50/70 hover:bg-slate-100 hover:border-slate-300 text-slate-700"
    }`

  const radio = (selected: boolean) => (
    <div
      class={`size-4 shrink-0 rounded-full border flex items-center justify-center transition-all ${
        selected
          ? isDark()
            ? "border-cyan-400 bg-cyan-400 shadow-[0_0_8px_rgba(56,189,248,0.8)]"
            : "border-sky-500 bg-sky-500 shadow-[0_0_8px_rgba(2,132,199,0.5)]"
          : isDark()
            ? "border-white/30 bg-transparent"
            : "border-slate-300 bg-white"
      }`}
    >
      <Show when={selected}>
        <div class={`size-1.5 rounded-full ${isDark() ? "bg-black" : "bg-white"}`} />
      </Show>
    </div>
  )

  const mutedText = () => (isDark() ? "text-neutral-400" : "text-slate-600")

  const ChoiceRow = (props2: {
    selected: boolean
    onSelect: () => void
    title: string
    description: string
    glyph: string
  }): JSX.Element => (
    <div
      role="radio"
      aria-checked={props2.selected}
      tabIndex={0}
      onClick={props2.onSelect}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault()
          props2.onSelect()
        }
      }}
      class={cardClass(props2.selected)}
    >
      <div class="flex items-center gap-3 min-w-0">
        <span class="text-lg shrink-0" aria-hidden="true">
          {props2.glyph}
        </span>
        <div class="flex flex-col min-w-0">
          <span class={`text-[13px] font-medium ${isDark() ? "text-white" : "text-slate-900"}`}>{props2.title}</span>
          <span class={`text-[11px] ${isDark() ? "text-neutral-400" : "text-slate-500"}`}>{props2.description}</span>
        </div>
      </div>
      {radio(props2.selected)}
    </div>
  )

  return (
    <div
      role="dialog"
      aria-label={t("welcome.title")}
      class={`relative w-full max-w-[540px] max-h-[min(88vh,760px)] rounded-2xl p-5 sm:p-6 flex flex-col overflow-hidden font-sans transition-colors duration-200 ${
        isDark()
          ? "bg-[#0c0d12]/95 backdrop-blur-3xl border border-white/[0.1] text-white shadow-[0_24px_64px_rgba(0,0,0,0.85),0_0_40px_rgba(56,189,248,0.15)]"
          : "bg-white/98 backdrop-blur-3xl border border-slate-200 text-slate-900 shadow-[0_24px_64px_rgba(0,0,0,0.12),0_0_30px_rgba(2,132,199,0.1)]"
      }`}
      style={{
        "font-family": "Segoe UI Variable, Segoe UI, -apple-system, BlinkMacSystemFont, Roboto, sans-serif",
      }}
    >
      <div
        class={`absolute -top-24 -right-24 size-64 rounded-full blur-3xl pointer-events-none ${
          isDark() ? "bg-cyan-500/20" : "bg-sky-400/20"
        }`}
      />
      <div
        class={`absolute -bottom-24 -left-24 size-64 rounded-full blur-3xl pointer-events-none ${
          isDark() ? "bg-indigo-500/20" : "bg-blue-400/15"
        }`}
      />

      {/* Header */}
      <div
        class={`relative flex items-start justify-between gap-3 border-b pb-4 mb-4 ${
          isDark() ? "border-white/[0.08]" : "border-slate-200"
        }`}
      >
        <div class="flex items-center gap-3.5 min-w-0">
          <div
            class={`relative flex items-center justify-center size-10 rounded-xl border shrink-0 ${
              isDark()
                ? "bg-cyan-500/10 border-cyan-400/30 shadow-[0_0_14px_rgba(56,189,248,0.25)]"
                : "bg-slate-900 border-sky-500/30 shadow-[0_0_14px_rgba(2,132,199,0.2)]"
            }`}
          >
            <img src={tianLogo} alt="" class="h-6 w-auto object-contain" draggable={false} />
          </div>
          <div class="flex flex-col min-w-0">
            <div class="flex items-center gap-2 flex-wrap">
              <h2 class={`text-[16px] font-semibold tracking-tight ${isDark() ? "text-white" : "text-slate-900"}`}>
                {t("welcome.title")}
              </h2>
              <Show when={version()}>
                <span
                  class={`px-2 py-0.5 text-[10px] font-mono font-medium rounded-md border ${
                    isDark() ? "border-cyan-400/40 bg-cyan-500/15 text-cyan-300" : "border-sky-400 bg-sky-50 text-sky-700"
                  }`}
                >
                  v{version()}
                </span>
              </Show>
            </div>
            <p class={`text-[12px] truncate ${isDark() ? "text-cyan-200/60" : "text-slate-500"}`}>
              {t("welcome.stepLabel", { current: step(), total: TOTAL_STEPS })} · {subtitle()}
            </p>
          </div>
        </div>

        {/* Progress dots — one per step, so the pill matches the announced count */}
        <div
          class={`flex items-center gap-1.5 border px-2.5 py-1.5 rounded-full shrink-0 ${
            isDark() ? "bg-black/40 border-cyan-500/20" : "bg-slate-100 border-slate-300/80"
          }`}
          role="progressbar"
          aria-valuenow={step()}
          aria-valuemin={1}
          aria-valuemax={TOTAL_STEPS}
        >
          <For each={Array.from({ length: TOTAL_STEPS }, (_, i) => i + 1)}>
            {(index) => (
              <div
                class={`h-1.5 rounded-full transition-all duration-300 ${
                  index === step()
                    ? isDark()
                      ? "w-5 bg-gradient-to-r from-cyan-400 to-sky-400 shadow-[0_0_10px_rgba(56,189,248,0.9)]"
                      : "w-5 bg-sky-500 shadow-[0_0_8px_rgba(2,132,199,0.4)]"
                    : index < step()
                      ? isDark()
                        ? "w-1.5 bg-cyan-400/70"
                        : "w-1.5 bg-sky-500/70"
                      : isDark()
                        ? "w-1.5 bg-white/20"
                        : "w-1.5 bg-slate-300"
                }`}
              />
            )}
          </For>
        </div>
      </div>

      {/* Body — scrolls internally so the dialog never outgrows a short window */}
      <div class="relative flex flex-col gap-4 flex-1 min-h-0 overflow-y-auto pr-0.5">
        <Show when={step() === 1}>
          <div class="flex flex-col gap-2">
            <span class={`text-[12px] font-medium ${mutedText()}`}>{t("welcome.language.label")}</span>
            <div class="grid grid-cols-2 sm:grid-cols-3 gap-2.5" role="radiogroup" aria-label={t("welcome.language.label")}>
              <For each={LOCALE_OPTIONS}>
                {(option) => (
                  <div
                    role="radio"
                    aria-checked={selectedLocale() === option.locale}
                    tabIndex={0}
                    onClick={() => handleSelectLanguage(option.locale)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault()
                        handleSelectLanguage(option.locale)
                      }
                    }}
                    class={cardClass(selectedLocale() === option.locale)}
                  >
                    <div class="flex items-center gap-2.5 min-w-0">
                      <span
                        class={`text-[11px] font-bold px-1.5 py-0.5 rounded border shrink-0 ${
                          isDark() ? "bg-white/10 text-cyan-300 border-white/15" : "bg-sky-100 text-sky-800 border-sky-300"
                        }`}
                      >
                        {option.badge}
                      </span>
                      <span class={`text-[13px] font-medium truncate ${isDark() ? "text-white" : "text-slate-900"}`}>
                        {option.name}
                      </span>
                    </div>
                    {radio(selectedLocale() === option.locale)}
                  </div>
                )}
              </For>
            </div>
          </div>

          <div class="flex flex-col gap-2">
            <span class={`text-[12px] font-medium ${mutedText()}`}>{t("welcome.theme.label")}</span>
            <div class="grid grid-cols-3 gap-2.5" role="radiogroup" aria-label={t("welcome.theme.label")}>
              <For each={THEME_OPTIONS}>
                {(option) => (
                  <div
                    role="radio"
                    aria-checked={selectedTheme() === option.mode}
                    tabIndex={0}
                    onClick={() => handleSelectTheme(option.mode)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault()
                        handleSelectTheme(option.mode)
                      }
                    }}
                    class={`flex flex-col items-center gap-2 p-3 rounded-xl border cursor-pointer transition-all duration-150 ${
                      selectedTheme() === option.mode
                        ? isDark()
                          ? "border-cyan-400 bg-cyan-500/20 shadow-[0_0_14px_rgba(56,189,248,0.25)] text-white font-medium"
                          : "border-sky-500 bg-sky-50 shadow-[0_0_14px_rgba(2,132,199,0.2)] text-sky-950 font-semibold"
                        : isDark()
                          ? "border-white/[0.08] bg-white/[0.03] hover:bg-white/[0.06] hover:border-cyan-500/30 text-neutral-300"
                          : "border-slate-200 bg-slate-50/60 hover:bg-slate-100 hover:border-slate-300 text-slate-600"
                    }`}
                  >
                    <div
                      class={`size-8 rounded-lg flex items-center justify-center text-sm shadow-inner ${
                        isDark() ? "bg-neutral-900 border border-neutral-700" : "bg-slate-100 border border-slate-300"
                      }`}
                      aria-hidden="true"
                    >
                      {option.glyph}
                    </div>
                    <span class="text-[12px]">{t(option.key)}</span>
                  </div>
                )}
              </For>
            </div>
          </div>
        </Show>

        <Show when={step() === 2}>
          <p class={`text-[12px] leading-relaxed ${mutedText()}`}>{t("welcome.provider.description")}</p>
          <div class="flex flex-col gap-2.5" role="radiogroup" aria-label={t("welcome.provider.title")}>
            <ChoiceRow
              selected={connectProvider()}
              onSelect={() => setConnectProvider(true)}
              glyph="🔌"
              title={t("welcome.provider.connect")}
              description={t("welcome.provider.connect.desc")}
            />
            <ChoiceRow
              selected={!connectProvider()}
              onSelect={() => setConnectProvider(false)}
              glyph="⏭️"
              title={t("welcome.provider.later")}
              description={t("welcome.provider.later.desc")}
            />
          </div>
        </Show>

        <Show when={step() === 3}>
          <p class={`text-[12px] leading-relaxed ${mutedText()}`}>{t("welcome.workspace.description")}</p>
          <div class="flex flex-col gap-2.5" role="radiogroup" aria-label={t("welcome.workspace.title")}>
            <ChoiceRow
              selected={createDefaultProject()}
              onSelect={() => setCreateDefaultProject(true)}
              glyph="📁"
              title={t("welcome.workspace.createDefault")}
              description={t("welcome.workspace.createDefault.desc")}
            />
            <ChoiceRow
              selected={!createDefaultProject()}
              onSelect={() => setCreateDefaultProject(false)}
              glyph="🗂️"
              title={t("welcome.workspace.chooseLater")}
              description={t("welcome.workspace.chooseLater.desc")}
            />
          </div>
        </Show>
      </div>

      {/* Footer */}
      <div
        class={`relative flex items-center justify-between gap-3 pt-3 mt-3 border-t ${
          isDark() ? "border-white/[0.08]" : "border-slate-200"
        }`}
      >
        <button
          type="button"
          onClick={goBack}
          disabled={step() === 1}
          class={`px-4 py-2 rounded-lg text-[13px] font-medium transition-all disabled:opacity-0 disabled:pointer-events-none ${
            isDark() ? "text-neutral-300 hover:bg-white/[0.07]" : "text-slate-600 hover:bg-slate-100"
          }`}
        >
          ← {t("welcome.back")}
        </button>

        <div class="flex items-center gap-2">
          <Show when={step() < TOTAL_STEPS}>
            <button
              type="button"
              onClick={() => void handleFinish()}
              disabled={finishing()}
              class={`px-3 py-2 rounded-lg text-[13px] font-medium transition-all disabled:opacity-50 ${
                isDark() ? "text-neutral-400 hover:bg-white/[0.07]" : "text-slate-500 hover:bg-slate-100"
              }`}
            >
              {t("welcome.skip")}
            </button>
          </Show>
          <button
            type="button"
            onClick={goNext}
            disabled={finishing()}
            class={`px-6 py-2 rounded-lg text-white text-[13px] font-semibold transition-all flex items-center gap-1.5 active:scale-[0.99] disabled:opacity-60 ${
              isDark()
                ? "bg-gradient-to-r from-cyan-500 via-sky-500 to-indigo-500 hover:from-cyan-400 hover:to-indigo-400 shadow-[0_0_20px_rgba(56,189,248,0.4)]"
                : "bg-gradient-to-r from-sky-600 via-blue-600 to-indigo-600 hover:from-sky-500 hover:to-indigo-500 shadow-[0_0_20px_rgba(2,132,199,0.35)]"
            }`}
          >
            <span>{step() === TOTAL_STEPS ? t("welcome.finish") : t("welcome.next")}</span>
            <span aria-hidden="true">→</span>
          </button>
        </div>
      </div>
    </div>
  )
}
