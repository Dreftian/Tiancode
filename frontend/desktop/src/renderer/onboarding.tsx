import { ServerConnection, useLanguage, useServer, useSettings, useTabs } from "@tiancode-ai/app"
import { useTheme } from "@tiancode-ai/ui/theme/context"
import { ButtonV2 } from "@tiancode-ai/ui/v2/button-v2"
import { Show, createSignal, onMount, type JSX } from "solid-js"
import "./onboarding.css"

type OnboardingStep = "disclaimer" | "preferences"
type OnboardingScheme = "light" | "dark"
type OnboardingLocale = "en" | "es"

export function DesktopFirstLaunchOnboarding(props: { initialUrl: string; onLoaded: () => void }) {
  const server = useServer()
  const settings = useSettings()
  const tabs = useTabs()
  const language = useLanguage()
  const theme = useTheme()

  const [visible, setVisible] = createSignal(false)
  const [step, setStep] = createSignal<OnboardingStep>("disclaimer")
  const [scheme, setScheme] = createSignal<OnboardingScheme>(theme.mode() === "dark" ? "dark" : "light")
  const [locale, setLocale] = createSignal<OnboardingLocale>(language.locale() === "es" ? "es" : "en")
  const [completing, setCompleting] = createSignal(false)
  const [createDefaultProject, setCreateDefaultProject] = createSignal(false)

  onMount(() => {
    void runFirstLaunchOnboarding().finally(() => {
      // Resolve the startup gate right away when there is nothing to show; the
      // UI resolves it itself once the user finishes the flow.
      if (!visible()) props.onLoaded()
    })
  })

  async function runFirstLaunchOnboarding() {
    try {
      await Promise.all(
        [server.ready.promise, tabs.ready.promise, tabs.recentReady.promise].map((p) => p ?? Promise.resolve()),
      )
      const existingInstall = await window.api.isOldLayoutEligible()
      settings.general.setOldLayoutEligible(existingInstall)
      settings.general.initializeAgentVisibility(existingInstall)
      if (!server.isLocal()) return

      const pending = await window.api.isFirstLaunchOnboardingPending()
      if (!pending) return

      const shouldTrigger =
        !existingInstall &&
        props.initialUrl === "/" &&
        tabs.store.length === 0 &&
        server.list.every(ServerConnection.builtin)

      console.info("[desktop-onboarding] first launch onboarding evaluated", {
        pending,
        shouldTrigger,
        existingInstall,
        initialUrl: props.initialUrl,
        tabs: tabs.store.length,
        servers: server.list.map(ServerConnection.key),
      })

      setCreateDefaultProject(shouldTrigger)
      setVisible(true)
    } catch (error) {
      console.error("[desktop-onboarding] first launch onboarding failed", error)
    }
  }

  async function completeOnboarding() {
    if (completing()) return
    setCompleting(true)
    try {
      const directory = await window.api.finishFirstLaunchOnboarding(createDefaultProject())
      if (!createDefaultProject() || !directory) return

      console.info("[desktop-onboarding] starting first launch draft", { directory })
      server.projects.open(directory)
      server.projects.touch(directory)
      tabs.select(await tabs.newDraft({ server: server.key, directory }))
    } catch (error) {
      console.error("[desktop-onboarding] finishing first launch onboarding failed", error)
    } finally {
      setVisible(false)
      props.onLoaded()
    }
  }

  function selectScheme(next: OnboardingScheme) {
    setScheme(next)
    theme.setColorScheme(next)
  }

  function selectLocale(next: OnboardingLocale) {
    setLocale(next)
    language.setLocale(next)
  }

  const primaryAction = () => (step() === "disclaimer" ? () => setStep("preferences") : completeOnboarding)
  const primaryLabel = () =>
    step() === "disclaimer" ? language.t("onboarding.accept") : language.t("onboarding.start")

  return (
    <Show when={visible()}>
      <div class="onboarding-overlay" role="dialog" aria-modal="true" aria-labelledby="onboarding-title">
        <div class="onboarding-card">
          <div class="onboarding-card-header">
            <span class="onboarding-kicker">
              {language.t("onboarding.step", { current: step() === "disclaimer" ? 1 : 2, total: 2 })}
            </span>
            <h1 id="onboarding-title" class="onboarding-title">
              {step() === "disclaimer"
                ? language.t("onboarding.title")
                : language.t("onboarding.preferences.title")}
            </h1>
            <Show when={step() === "preferences"}>
              <p class="onboarding-description">{language.t("onboarding.preferences.description")}</p>
            </Show>
          </div>
          <div class="onboarding-card-body">
            <Show when={step() === "disclaimer"} fallback={<PreferencesStep />}>
              <p class="onboarding-paragraph">{language.t("onboarding.disclaimer.p1")}</p>
              <p class="onboarding-paragraph">{language.t("onboarding.disclaimer.p2")}</p>
              <p class="onboarding-paragraph">{language.t("onboarding.disclaimer.p3")}</p>
            </Show>
          </div>
          <div class="onboarding-card-footer">
            <ButtonV2
              variant="contrast"
              size="large"
              autofocus
              onClick={primaryAction()}
              disabled={completing()}
            >
              {primaryLabel()}
            </ButtonV2>
          </div>
        </div>
      </div>
    </Show>
  )

  function PreferencesStep() {
    return (
      <>
        <section class="onboarding-section">
          <h2 class="onboarding-section-label">{language.t("onboarding.theme.title")}</h2>
          <div class="onboarding-option-grid">
            <OnboardingOption
              label={language.t("onboarding.theme.light")}
              selected={scheme() === "light"}
              onClick={() => selectScheme("light")}
            >
              <SunIcon />
            </OnboardingOption>
            <OnboardingOption
              label={language.t("onboarding.theme.dark")}
              selected={scheme() === "dark"}
              onClick={() => selectScheme("dark")}
            >
              <MoonIcon />
            </OnboardingOption>
          </div>
        </section>
        <section class="onboarding-section">
          <h2 class="onboarding-section-label">{language.t("onboarding.language.title")}</h2>
          <div class="onboarding-option-grid">
            <OnboardingOption
              label={language.t("onboarding.language.english")}
              selected={locale() === "en"}
              onClick={() => selectLocale("en")}
            >
              <GlobeIcon />
            </OnboardingOption>
            <OnboardingOption
              label={language.t("onboarding.language.spanish")}
              selected={locale() === "es"}
              onClick={() => selectLocale("es")}
            >
              <GlobeIcon />
            </OnboardingOption>
          </div>
        </section>
      </>
    )
  }
}

function OnboardingOption(props: {
  label: string
  selected: boolean
  onClick: () => void
  children: JSX.Element
}) {
  return (
    <button
      type="button"
      class="onboarding-option"
      classList={{ "is-selected": props.selected }}
      aria-pressed={props.selected}
      onClick={props.onClick}
    >
      {props.children}
      <span>{props.label}</span>
    </button>
  )
}

function SunIcon() {
  return (
    <svg class="onboarding-option-icon" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="8" cy="8" r="3.2" stroke="currentColor" stroke-width="1.3" />
      <path
        d="M8 1.4V2.9M8 13.1V14.6M1.4 8H2.9M13.1 8H14.6M3.33 3.33L4.38 4.38M11.62 11.62L12.67 12.67M12.67 3.33L11.62 4.38M4.38 11.62L3.33 12.67"
        stroke="currentColor"
        stroke-width="1.3"
        stroke-linecap="round"
      />
    </svg>
  )
}

function MoonIcon() {
  return (
    <svg class="onboarding-option-icon" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M13.3 9.6C11.6 10.15 9.7 9.8 8.3 8.4C6.9 7 6.55 5.1 7.1 3.4C5.3 3.55 3.7 4.35 2.65 5.7C1.45 7.25 1.15 9.3 1.9 11.1C2.8 13.2 4.9 14.55 7.15 14.55C9.5 14.55 11.6 13.15 12.45 11.05C12.75 10.35 12.7 9.65 12.35 9.05C12.65 9.25 12.95 9.45 13.3 9.6Z"
        stroke="currentColor"
        stroke-width="1.3"
        stroke-linejoin="round"
      />
    </svg>
  )
}

function GlobeIcon() {
  return (
    <svg class="onboarding-option-icon" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="8" cy="8" r="5.6" stroke="currentColor" stroke-width="1.3" />
      <ellipse cx="8" cy="8" rx="2.5" ry="5.6" stroke="currentColor" stroke-width="1.3" />
      <path d="M2.4 8H13.6M2.4 5.4H13.6M2.4 10.6H13.6" stroke="currentColor" stroke-width="1.3" />
    </svg>
  )
}
