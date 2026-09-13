import { createStore, reconcile } from "solid-js/store"
import { batch, createEffect, createMemo, createSignal, onCleanup } from "solid-js"
import { createMediaQuery } from "@solid-primitives/media"
import { createSimpleContext } from "@tiancode-ai/ui/context"
import { persisted } from "@/utils/persist"
import { usePlatform } from "@/context/platform"

export interface NotificationSettings {
  agent: boolean
  permissions: boolean
  errors: boolean
}

export interface SoundSettings {
  agentEnabled: boolean
  agent: string
  permissionsEnabled: boolean
  permissions: string
  errorsEnabled: boolean
  errors: string
}

export const petKinds = [
  "dewey",
  "fireball",
  "hoots",
  "rocky",
  "seedy",
  "stacky",
  "bsod",
  "nullsignal",
  "cat",
  "dog",
  "rabbit",
  "panda",
  "fox",
] as const
export type PetKind = (typeof petKinds)[number]
export const petPositions = ["bottom-right", "bottom-left", "top-right", "top-left"] as const
export type PetPosition = (typeof petPositions)[number]
export const defaultPetSettings = {
  enabled: false,
  kind: "cat" as PetKind,
  position: "bottom-right" as PetPosition,
}

/**
 * Settings → Intelligence.
 *
 * One field per switch the server config actually honours, named exactly as it is named under
 * `experimental.intelligence`: the panel mirrors this block to the server and seeds it back on
 * mount, so a name that drifts here silently stops reaching the agent. The defaults match the
 * server's own (everything on), which is what a client sees before the first read answers.
 */
export interface IntelligenceSettings {
  userMemory: boolean
  projectMemory: boolean
  codeGraph: boolean
  cleanWeb: boolean
  autoSkillLearn: boolean
  guardrails: boolean
  outputDistiller: boolean
  toolCallRepair: boolean
  loopBreaker: boolean
}

export const defaultIntelligenceSettings: IntelligenceSettings = {
  userMemory: true,
  projectMemory: true,
  codeGraph: true,
  cleanWeb: true,
  autoSkillLearn: true,
  guardrails: true,
  outputDistiller: true,
  toolCallRepair: true,
  loopBreaker: true,
}

export const transcriptTextSizes = ["small", "medium", "large"] as const
export type TranscriptTextSize = (typeof transcriptTextSizes)[number]
export const transcriptWidths = ["narrow", "medium", "wide"] as const
export type TranscriptWidth = (typeof transcriptWidths)[number]
export const transcriptViews = ["normal", "thinking", "detailed"] as const
export type TranscriptView = (typeof transcriptViews)[number]

/**
 * Escalón de texto de la transcripción a partir de lo que haya en disco.
 *
 * La clave `appearance.fontSize` almacenaba píxeles sueltos, así que un número
 * se traduce al escalón más cercano en lugar de descartarse: quien tuviera un
 * valor guardado conserva su intención al actualizar.
 */
export function transcriptTextSize(value: TranscriptTextSize | number | undefined): TranscriptTextSize {
  if (typeof value === "number") {
    if (value <= 13) return "small"
    if (value >= 16) return "large"
    return "medium"
  }
  return value && transcriptTextSizes.includes(value) ? value : "medium"
}

export function transcriptWidth(value: TranscriptWidth | undefined): TranscriptWidth {
  return value && transcriptWidths.includes(value) ? value : "medium"
}

/**
 * Topes de ancho de la transcripción: [base, a partir del breakpoint 2xl].
 *
 * La transcripción siempre ensanchó en pantallas grandes (`md:max-w-200` con un
 * salto a 1000px en 2xl), así que cada opción conserva ese par y `medium`
 * reproduce exactamente los valores previos: quien no toque el ajuste no ve
 * ningún cambio de ancho.
 */
const transcriptMaxWidths: Record<TranscriptWidth, readonly [string, string]> = {
  narrow: ["40rem", "48rem"],
  medium: ["50rem", "62.5rem"],
  wide: ["62.5rem", "80rem"],
}

// Factor sobre la base de 14px: 13px, 14px y 16px. Lo leen markdown.css y
// message-part.css, que son las hojas que visten el cuerpo de la conversación.
const transcriptTextScales: Record<TranscriptTextSize, string> = {
  small: "0.929",
  medium: "1",
  large: "1.143",
}

export interface Settings {
  general: {
    autoSave: boolean
    releaseNotes: boolean
    followup: "queue" | "steer"
    showFileTree: boolean
    showNavigation: boolean
    showSearch: boolean
    showStatus: boolean
    showTerminal: boolean
    showBrowser: boolean
    browserLinks: "integrated" | "system"
    petEnabled: boolean
    petDesktop: boolean
    petKind: PetKind
    petPosition: PetPosition
    autoSpeak: boolean
    speakReasoning: boolean
    voiceEngine: "auto" | "fish" | "system" | "neural"
    // Los cuatro booleanos siguen siendo la verdad almacenada: `transcriptView`
    // se deriva de ellos. Guardar un enum en su lugar convertiría en no-ops los
    // ~20 e2e que escriben `settings.v3` general.{shell,edit}ToolPartsExpanded.
    showReasoningSummaries: boolean
    shellToolPartsExpanded: boolean
    editToolPartsExpanded: boolean
    allToolPartsExpanded: boolean
    showCustomAgents: boolean
    mobileTitlebarPosition: "top" | "bottom"
    newLayoutDesigns?: boolean
    layoutTransitionEligible?: boolean
    agentVisibilityInitialized?: boolean
    newInterfaceNoticeDismissed?: boolean
    shouldDisplayTabsToast?: boolean
  }
  appearance: {
    // `fontSize` guardó durante varias versiones un número de píxeles que nunca
    // tuvo consumidor. Ahora nombra el tamaño del texto de la transcripción y el
    // número antiguo se sigue leyendo para no huérfanar lo ya guardado.
    fontSize: TranscriptTextSize | number
    mono: string
    sans: string
    terminal: string
    transcriptWidth: TranscriptWidth
  }
  keybinds: Record<string, string>
  permissions: {
    autoApprove: boolean
  }
  notifications: NotificationSettings
  sounds: SoundSettings
  intelligence: IntelligenceSettings
}

export const monoDefault = "System Mono"
export const sansDefault = "System Sans"
export const terminalDefault = "JetBrainsMono Nerd Font Mono"
const legacyNewLayoutDesignsDefault = import.meta.env.VITE_TIANCODE_CHANNEL !== "prod"
export const newLayoutDesignsDefault = true
// Existing users can switch layouts until local midnight on this date. Set new Date(YYYY, M-1, D) to show.
export const oldInterfaceSunset = new Date(2026, 8, 14)
const newLayoutDesignsUpgradeCutoff = "1.17.19"

function compareVersions(a: string, b: string) {
  const parse = (version: string) => {
    const match = /^v?(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/i.exec(version.trim())
    if (!match) return
    return match.slice(1).map(Number)
  }
  const left = parse(a)
  const right = parse(b)
  if (!left || !right) return
  const index = left.findIndex((part, index) => part !== right[index])
  return index === -1 ? 0 : left[index]! - right[index]!
}

export function isAppUpgrade(previous: string | undefined, current: string | undefined) {
  if (!previous || !current) return false
  const comparison = compareVersions(current, previous)
  return comparison !== undefined && comparison > 0
}

export function shouldDisplayTabsToast(
  previous: string | undefined,
  current: string | undefined,
  existingInstall: boolean,
) {
  return isAppUpgrade(previous, current) || (!previous && existingInstall)
}

export function hasExistingWebState(settings: Promise<string> | string | null, previousVersion: string | undefined) {
  return settings !== null || previousVersion !== undefined
}

export function initialAgentVisibility(initialized: boolean | undefined, existing: boolean, previousVersion?: string) {
  if (initialized === true) return
  return existing || previousVersion !== undefined
}

export function shouldEnableNewLayout(previous: string | undefined, current: string | undefined) {
  if (!current) return false
  const currentComparison = compareVersions(current, newLayoutDesignsUpgradeCutoff)
  if (!previous) return currentComparison !== undefined && currentComparison > 0
  if (!isAppUpgrade(previous, current)) return false
  const previousComparison = compareVersions(previous, newLayoutDesignsUpgradeCutoff)
  return (
    previousComparison !== undefined &&
    currentComparison !== undefined &&
    previousComparison <= 0 &&
    currentComparison > 0
  )
}

export function layoutTransitionState(scheduled: boolean, eligible: boolean, retired: boolean, dismissed: boolean) {
  return {
    available: scheduled && eligible && !retired,
    notice: scheduled && eligible && retired && !dismissed,
  }
}

export const maximumSunsetTimeout = 2_147_483_647

export function nextSunsetCheckDelay(sunset: number, now: number) {
  return Math.min(Math.max(0, sunset - now), maximumSunsetTimeout)
}

export function resolveNewLayoutDesigns(retired: boolean, preference: boolean | undefined, fallback = true) {
  if (retired) return true
  return preference ?? fallback
}

const monoFallback =
  'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace'
const sansFallback = 'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
const terminalFallback =
  '"JetBrainsMono Nerd Font Mono", ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace'

const monoBase = monoFallback
const sansBase = sansFallback
const terminalBase = terminalFallback

function input(font: string | undefined) {
  return font ?? ""
}

function family(font: string) {
  if (/^[\w-]+$/.test(font)) return font
  return `"${font.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`
}

function stack(font: string | undefined, base: string) {
  const value = font?.trim() ?? ""
  if (!value) return base
  return `${family(value)}, ${base}`
}

export function monoInput(font: string | undefined) {
  return input(font)
}

export function sansInput(font: string | undefined) {
  return input(font)
}

export function monoFontFamily(font: string | undefined) {
  return stack(font, monoBase)
}

export function sansFontFamily(font: string | undefined) {
  return stack(font, sansBase)
}

export function terminalInput(font: string | undefined) {
  return input(font)
}

export function terminalFontFamily(font: string | undefined) {
  return stack(font, terminalBase)
}

const defaultSettings: Settings = {
  general: {
    autoSave: true,
    releaseNotes: true,
    followup: "steer",
    showFileTree: false,
    showNavigation: false,
    showSearch: false,
    showStatus: false,
    showTerminal: true,
    showBrowser: true,
    browserLinks: "integrated",
    petEnabled: defaultPetSettings.enabled,
    petDesktop: true,
    petKind: defaultPetSettings.kind,
    petPosition: defaultPetSettings.position,
    autoSpeak: false,
    speakReasoning: false,
    voiceEngine: "auto",
    showReasoningSummaries: false,
    shellToolPartsExpanded: false,
    editToolPartsExpanded: false,
    allToolPartsExpanded: false,
    showCustomAgents: false,
    mobileTitlebarPosition: "top",
  },
  appearance: {
    fontSize: "medium",
    mono: "",
    sans: "",
    terminal: "",
    transcriptWidth: "medium",
  },
  keybinds: {},
  permissions: {
    autoApprove: false,
  },
  notifications: {
    agent: true,
    permissions: true,
    errors: false,
  },
  sounds: {
    agentEnabled: true,
    agent: "staplebops-01",
    permissionsEnabled: true,
    permissions: "staplebops-02",
    errorsEnabled: true,
    errors: "nope-03",
  },
  intelligence: defaultIntelligenceSettings,
}

function withFallback<T>(read: () => T | undefined, fallback: T) {
  return createMemo(() => read() ?? fallback)
}

export const { use: useSettings, provider: SettingsProvider } = createSimpleContext({
  name: "Settings",
  gate: false,
  init: () => {
    const platform = usePlatform()
    const [store, setStore, settingsInit, ready] = persisted("settings.v3", createStore<Settings>(defaultSettings))
    const [launch, setLaunch, , launchReady] = persisted(
      "app-version.v1",
      createStore<{ version?: string }>({ version: undefined }),
    )
    const [launchState, setLaunchState] = createStore({
      classified: false,
      migrationApplied: false,
      previous: undefined as string | undefined,
    })
    const showFileTree = withFallback(() => store.general?.showFileTree, defaultSettings.general.showFileTree)
    const showSearch = withFallback(() => store.general?.showSearch, defaultSettings.general.showSearch)
    const showStatus = withFallback(() => store.general?.showStatus, defaultSettings.general.showStatus)
    const showCustomAgents = withFallback(
      () => store.general?.showCustomAgents,
      defaultSettings.general.showCustomAgents,
    )
    const showReasoningSummaries = withFallback(
      () => store.general?.showReasoningSummaries,
      defaultSettings.general.showReasoningSummaries,
    )
    const shellToolPartsExpanded = withFallback(
      () => store.general?.shellToolPartsExpanded,
      defaultSettings.general.shellToolPartsExpanded,
    )
    const editToolPartsExpanded = withFallback(
      () => store.general?.editToolPartsExpanded,
      defaultSettings.general.editToolPartsExpanded,
    )
    const allToolPartsExpanded = withFallback(
      () => store.general?.allToolPartsExpanded,
      defaultSettings.general.allToolPartsExpanded,
    )
    // La vista se deriva de los cuatro booleanos en lugar de guardarse aparte:
    // así un ajuste escrito a mano (o por los ~20 e2e que tocan `settings.v3`
    // general.{shell,edit}ToolPartsExpanded) sigue moviendo el selector, y no
    // hay dos verdades que puedan contradecirse según cuál se tocó al final.
    const transcriptView = createMemo<TranscriptView>(() => {
      if (shellToolPartsExpanded() || editToolPartsExpanded() || allToolPartsExpanded()) return "detailed"
      if (showReasoningSummaries()) return "thinking"
      return "normal"
    })
    const sunset = oldInterfaceSunset
    const [oldInterfaceRetired, setOldInterfaceRetired] = createSignal(sunset ? Date.now() >= sunset.getTime() : false)
    const layoutTransitionClassified = createMemo(() => typeof store.general?.layoutTransitionEligible === "boolean")
    const layoutTransitionEligible = withFallback(() => store.general?.layoutTransitionEligible, false)
    const newInterfaceNoticeDismissed = withFallback(() => store.general?.newInterfaceNoticeDismissed, false)
    const layoutUpgrade = createMemo(() =>
      launchState.classified && !launchState.migrationApplied
        ? shouldEnableNewLayout(launchState.previous, platform.version)
        : false,
    )
    const layoutTransition = createMemo(() =>
      layoutTransitionState(!!sunset, layoutTransitionEligible(), oldInterfaceRetired(), newInterfaceNoticeDismissed()),
    )
    // La interfaz v2 es la única desde el sunset; el resto del mecanismo de
    // transición queda inerte (se puede podar en una limpieza futura).
    const newLayoutDesigns = createMemo(() => true)
    const visible = (preference: () => boolean) => createMemo(() => !newLayoutDesigns() || preference())
    const initializeAgentVisibility = (existing: boolean) => {
      const initial = initialAgentVisibility(store.general?.agentVisibilityInitialized, existing, launchState.previous)
      if (initial === undefined) return
      batch(() => {
        setStore("general", "showCustomAgents", initial)
        setStore("general", "agentVisibilityInitialized", true)
      })
    }

    if (sunset && !oldInterfaceRetired()) {
      const timeout = { current: undefined as ReturnType<typeof setTimeout> | undefined }
      const checkSunset = () => {
        if (Date.now() >= sunset.getTime()) {
          setOldInterfaceRetired(true)
          return
        }
        timeout.current = setTimeout(checkSunset, nextSunsetCheckDelay(sunset.getTime(), Date.now()))
      }
      checkSunset()
      onCleanup(() => {
        if (timeout.current !== undefined) clearTimeout(timeout.current)
      })
    }

    createEffect(() => {
      if (!launchReady() || launchState.classified) return
      setLaunchState({
        classified: true,
        previous: launch.version,
      })
      if (!platform.version || launch.version === platform.version) return
      setLaunch("version", platform.version)
    })

    createEffect(() => {
      if (!ready() || !launchState.classified || platform.platform !== "web") return
      const existing = hasExistingWebState(settingsInit, launchState.previous)
      if (!layoutTransitionClassified()) setStore("general", "layoutTransitionEligible", existing)
      initializeAgentVisibility(existing)
    })

    createEffect(() => {
      if (!ready() || !launchState.classified || launchState.migrationApplied) return
      if (layoutUpgrade() && store.general?.newLayoutDesigns !== true) {
        setStore("general", "newLayoutDesigns", true)
      }
      setLaunchState("migrationApplied", true)
    })

    createEffect(() => {
      if (!ready() || !launchState.classified) return
      if (typeof store.general?.shouldDisplayTabsToast === "boolean") return
      if (!launchState.previous && !layoutTransitionClassified()) return
      setStore(
        "general",
        "shouldDisplayTabsToast",
        shouldDisplayTabsToast(launchState.previous, platform.version, layoutTransitionEligible()),
      )
    })

    createEffect(() => {
      if (!ready() || !oldInterfaceRetired()) return
      if (store.general?.newLayoutDesigns === true) return
      setStore("general", "newLayoutDesigns", true)
    })

    // Breakpoint 2xl de Tailwind (96rem): el mismo en el que la transcripción ya
    // ensanchaba antes de que el ancho fuera configurable.
    const wideViewport = createMediaQuery("(min-width: 1536px)")

    createEffect(() => {
      if (typeof document === "undefined") return
      const root = document.documentElement
      root.style.setProperty("--font-family-mono", monoFontFamily(store.appearance?.mono))
      root.style.setProperty("--font-family-sans", sansFontFamily(store.appearance?.sans))
      // La transcripción y el compositor leen estas dos variables para no poder
      // separarse. Los atributos acompañan al valor para poder inspeccionarlo y
      // para que una hoja de estilos pueda apuntar a un escalón concreto.
      const width = transcriptWidth(store.appearance?.transcriptWidth)
      const text = transcriptTextSize(store.appearance?.fontSize)
      root.dataset.transcriptWidth = width
      root.dataset.transcriptText = text
      root.style.setProperty("--transcript-max-width", transcriptMaxWidths[width][wideViewport() ? 1 : 0])
      root.style.setProperty("--transcript-text-scale", transcriptTextScales[text])
    })

    createEffect(() => {
      if (store.general?.followup !== "queue") return
      setStore("general", "followup", "steer")
    })

    // Reescribe el número heredado al escalón equivalente para que el disco deje
    // de guardar la forma vieja en cuanto el usuario abre la app.
    createEffect(() => {
      if (!ready() || typeof store.appearance?.fontSize !== "number") return
      setStore("appearance", "fontSize", transcriptTextSize(store.appearance.fontSize))
    })

    return {
      ready,
      get current() {
        return store
      },
      general: {
        autoSave: withFallback(() => store.general?.autoSave, defaultSettings.general.autoSave),
        setAutoSave(value: boolean) {
          setStore("general", "autoSave", value)
        },
        releaseNotes: withFallback(() => store.general?.releaseNotes, defaultSettings.general.releaseNotes),
        setReleaseNotes(value: boolean) {
          setStore("general", "releaseNotes", value)
        },
        followup: withFallback(
          () => (store.general?.followup === "queue" ? "steer" : store.general?.followup),
          defaultSettings.general.followup,
        ),
        setFollowup(value: "queue" | "steer") {
          setStore("general", "followup", value === "queue" ? "steer" : value)
        },
        showFileTree,
        setShowFileTree(value: boolean) {
          setStore("general", "showFileTree", value)
        },
        showNavigation: withFallback(() => store.general?.showNavigation, defaultSettings.general.showNavigation),
        setShowNavigation(value: boolean) {
          setStore("general", "showNavigation", value)
        },
        showSearch,
        setShowSearch(value: boolean) {
          setStore("general", "showSearch", value)
        },
        showStatus,
        setShowStatus(value: boolean) {
          setStore("general", "showStatus", value)
        },
        // Sin interruptor en Ajustes desde que la v1 se retiró: la cabecera v2
        // dibuja el terminal siempre y todavía no dibuja el navegador. Los
        // valores se conservan (session-header.tsx y preview-panel.tsx los
        // siguen leyendo) para no perder la preferencia de quien ya la guardó.
        showTerminal: withFallback(() => store.general?.showTerminal, defaultSettings.general.showTerminal),
        setShowTerminal(value: boolean) {
          setStore("general", "showTerminal", value)
        },
        showBrowser: withFallback(() => store.general?.showBrowser, defaultSettings.general.showBrowser),
        setShowBrowser(value: boolean) {
          setStore("general", "showBrowser", value)
        },
        browserLinks: withFallback(() => store.general?.browserLinks, defaultSettings.general.browserLinks),
        setBrowserLinks(value: "integrated" | "system") {
          setStore("general", "browserLinks", value)
        },
        petEnabled: withFallback(() => store.general?.petEnabled, defaultSettings.general.petEnabled),
        setPetEnabled(value: boolean) {
          setStore("general", "petEnabled", value)
        },
        petDesktop: withFallback(() => store.general?.petDesktop, defaultSettings.general.petDesktop),
        setPetDesktop(value: boolean) {
          setStore("general", "petDesktop", value)
        },
        petKind: withFallback(() => store.general?.petKind, defaultSettings.general.petKind),
        setPetKind(value: PetKind) {
          setStore("general", "petKind", value)
        },
        petPosition: withFallback(() => store.general?.petPosition, defaultSettings.general.petPosition),
        setPetPosition(value: PetPosition) {
          setStore("general", "petPosition", value)
        },
        autoSpeak: withFallback(() => store.general?.autoSpeak, defaultSettings.general.autoSpeak),
        setAutoSpeak(value: boolean) {
          setStore("general", "autoSpeak", value)
        },
        speakReasoning: withFallback(() => store.general?.speakReasoning, defaultSettings.general.speakReasoning),
        setSpeakReasoning(value: boolean) {
          setStore("general", "speakReasoning", value)
        },
        voiceEngine: withFallback(() => store.general?.voiceEngine, defaultSettings.general.voiceEngine),
        setVoiceEngine(value: "auto" | "fish" | "system" | "neural") {
          setStore("general", "voiceEngine", value)
        },
        showReasoningSummaries,
        setShowReasoningSummaries(value: boolean) {
          setStore("general", "showReasoningSummaries", value)
        },
        shellToolPartsExpanded,
        setShellToolPartsExpanded(value: boolean) {
          setStore("general", "shellToolPartsExpanded", value)
        },
        editToolPartsExpanded,
        setEditToolPartsExpanded(value: boolean) {
          setStore("general", "editToolPartsExpanded", value)
        },
        allToolPartsExpanded,
        setAllToolPartsExpanded(value: boolean) {
          setStore("general", "allToolPartsExpanded", value)
        },
        transcriptView,
        setTranscriptView(value: TranscriptView) {
          const tools = value === "detailed"
          batch(() => {
            setStore("general", "showReasoningSummaries", value !== "normal")
            setStore("general", "shellToolPartsExpanded", tools)
            setStore("general", "editToolPartsExpanded", tools)
            setStore("general", "allToolPartsExpanded", tools)
          })
        },
        showCustomAgents,
        setShowCustomAgents(value: boolean) {
          setStore("general", "showCustomAgents", value)
        },
        mobileTitlebarPosition: withFallback(
          () => store.general?.mobileTitlebarPosition,
          defaultSettings.general.mobileTitlebarPosition,
        ),
        setMobileTitlebarPosition(value: "top" | "bottom") {
          setStore("general", "mobileTitlebarPosition", value)
        },
        newLayoutDesigns,
        setNewLayoutDesigns(value: boolean) {
          const next = oldInterfaceRetired() ? true : value
          if (newLayoutDesigns() === next) return
          setStore("general", "newLayoutDesigns", next)
          if (typeof window !== "undefined") setTimeout(() => window.location.reload())
        },
        layoutTransitionClassified,
        setOldLayoutEligible(eligible: boolean) {
          const current = store.general?.layoutTransitionEligible
          if (typeof current === "boolean") return
          setStore("general", "layoutTransitionEligible", eligible)
        },
        initializeAgentVisibility,
        layoutTransitionAvailable: createMemo(() => ready() && layoutTransition().available),
        newInterfaceNoticeVisible: createMemo(() => ready() && layoutTransition().notice),
        dismissNewInterfaceNotice() {
          setStore("general", "newInterfaceNoticeDismissed", true)
        },
        shouldDisplayTabsToast: withFallback(() => store.general?.shouldDisplayTabsToast, false),
        dismissTabsToast() {
          setStore("general", "shouldDisplayTabsToast", false)
        },
      },
      visibility: {
        fileTree: visible(showFileTree),
        search: visible(showSearch),
        status: visible(showStatus),
        customAgents: visible(showCustomAgents),
      },
      appearance: {
        transcriptText: createMemo(() => transcriptTextSize(store.appearance?.fontSize)),
        setTranscriptText(value: TranscriptTextSize) {
          setStore("appearance", "fontSize", value)
        },
        transcriptWidth: createMemo(() => transcriptWidth(store.appearance?.transcriptWidth)),
        setTranscriptWidth(value: TranscriptWidth) {
          setStore("appearance", "transcriptWidth", value)
        },
        font: withFallback(() => store.appearance?.mono, defaultSettings.appearance.mono),
        setFont(value: string) {
          setStore("appearance", "mono", value.trim() ? value : "")
        },
        uiFont: withFallback(() => store.appearance?.sans, defaultSettings.appearance.sans),
        setUIFont(value: string) {
          setStore("appearance", "sans", value.trim() ? value : "")
        },
        terminalFont: withFallback(() => store.appearance?.terminal, defaultSettings.appearance.terminal),
        setTerminalFont(value: string) {
          setStore("appearance", "terminal", value.trim() ? value : "")
        },
      },
      keybinds: {
        get: (action: string) => store.keybinds?.[action],
        set(action: string, keybind: string) {
          setStore("keybinds", action, keybind)
        },
        reset(action: string) {
          setStore("keybinds", (current) => {
            if (!Object.prototype.hasOwnProperty.call(current, action)) return current
            const next = { ...current }
            delete next[action]
            return next
          })
        },
        resetAll() {
          setStore("keybinds", reconcile({}))
        },
      },
      permissions: {
        autoApprove: withFallback(() => store.permissions?.autoApprove, defaultSettings.permissions.autoApprove),
        setAutoApprove(value: boolean) {
          setStore("permissions", "autoApprove", value)
        },
      },
      notifications: {
        agent: withFallback(() => store.notifications?.agent, defaultSettings.notifications.agent),
        setAgent(value: boolean) {
          setStore("notifications", "agent", value)
        },
        permissions: withFallback(() => store.notifications?.permissions, defaultSettings.notifications.permissions),
        setPermissions(value: boolean) {
          setStore("notifications", "permissions", value)
        },
        errors: withFallback(() => store.notifications?.errors, defaultSettings.notifications.errors),
        setErrors(value: boolean) {
          setStore("notifications", "errors", value)
        },
      },
      sounds: {
        agentEnabled: withFallback(() => store.sounds?.agentEnabled, defaultSettings.sounds.agentEnabled),
        setAgentEnabled(value: boolean) {
          setStore("sounds", "agentEnabled", value)
        },
        agent: withFallback(() => store.sounds?.agent, defaultSettings.sounds.agent),
        setAgent(value: string) {
          setStore("sounds", "agent", value)
        },
        permissionsEnabled: withFallback(
          () => store.sounds?.permissionsEnabled,
          defaultSettings.sounds.permissionsEnabled,
        ),
        setPermissionsEnabled(value: boolean) {
          setStore("sounds", "permissionsEnabled", value)
        },
        permissions: withFallback(() => store.sounds?.permissions, defaultSettings.sounds.permissions),
        setPermissions(value: string) {
          setStore("sounds", "permissions", value)
        },
        errorsEnabled: withFallback(() => store.sounds?.errorsEnabled, defaultSettings.sounds.errorsEnabled),
        setErrorsEnabled(value: boolean) {
          setStore("sounds", "errorsEnabled", value)
        },
        errors: withFallback(() => store.sounds?.errors, defaultSettings.sounds.errors),
        setErrors(value: string) {
          setStore("sounds", "errors", value)
        },
      },
      intelligence: {
        userMemory: withFallback(
          () => store.intelligence?.userMemory,
          defaultSettings.intelligence.userMemory,
        ),
        setUserMemory(value: boolean) {
          setStore("intelligence", "userMemory", value)
        },
        projectMemory: withFallback(
          () => store.intelligence?.projectMemory,
          defaultSettings.intelligence.projectMemory,
        ),
        setProjectMemory(value: boolean) {
          setStore("intelligence", "projectMemory", value)
        },
        codeGraph: withFallback(
          () => store.intelligence?.codeGraph,
          defaultSettings.intelligence.codeGraph,
        ),
        setCodeGraph(value: boolean) {
          setStore("intelligence", "codeGraph", value)
        },
        cleanWeb: withFallback(
          () => store.intelligence?.cleanWeb,
          defaultSettings.intelligence.cleanWeb,
        ),
        setCleanWeb(value: boolean) {
          setStore("intelligence", "cleanWeb", value)
        },
        autoSkillLearn: withFallback(
          () => store.intelligence?.autoSkillLearn,
          defaultSettings.intelligence.autoSkillLearn,
        ),
        setAutoSkillLearn(value: boolean) {
          setStore("intelligence", "autoSkillLearn", value)
        },
        guardrails: withFallback(
          () => store.intelligence?.guardrails,
          defaultSettings.intelligence.guardrails,
        ),
        setGuardrails(value: boolean) {
          setStore("intelligence", "guardrails", value)
        },
        outputDistiller: withFallback(
          () => store.intelligence?.outputDistiller,
          defaultSettings.intelligence.outputDistiller,
        ),
        setOutputDistiller(value: boolean) {
          setStore("intelligence", "outputDistiller", value)
        },
        toolCallRepair: withFallback(
          () => store.intelligence?.toolCallRepair,
          defaultSettings.intelligence.toolCallRepair,
        ),
        setToolCallRepair(value: boolean) {
          setStore("intelligence", "toolCallRepair", value)
        },
        loopBreaker: withFallback(
          () => store.intelligence?.loopBreaker,
          defaultSettings.intelligence.loopBreaker,
        ),
        setLoopBreaker(value: boolean) {
          setStore("intelligence", "loopBreaker", value)
        },
        // Seeds the block from the server config the panel reads on mount. Only booleans are
        // taken, so a switch the server omits — or carries as something else — keeps its
        // current value instead of being reset.
        merge(values: Partial<IntelligenceSettings>) {
          setStore("intelligence", (current) => {
            const next: IntelligenceSettings = { ...defaultSettings.intelligence, ...current }
            for (const [key, value] of Object.entries(values)) {
              if (typeof value === "boolean") next[key as keyof IntelligenceSettings] = value
            }
            return next
          })
        },
      },
    }
  },
})
