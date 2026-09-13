import type { DesktopMenuAction } from "@tiancode-ai/app/desktop-menu"
import type { WslServersPlatform } from "@tiancode-ai/app/wsl/types"
import type { UpdaterState } from "@tiancode-ai/app/updater"
import type { DesktopNativeBundle } from "@tiancode-ai/app/i18n/desktop-native"
export type {
  WslDistroProbe,
  WslInstalledDistro,
  WslJob,
  WslOnlineDistro,
  WslTiancodeCheck,
  WslOpencodeCheck,
  WslRuntimeCheck,
  WslServerConfig,
  WslServerItem,
  WslServerRuntime,
  WslServersEvent,
  WslServersState,
} from "@tiancode-ai/app/wsl/types"

export type ServerReadyData = {
  url: string
  username: string | null
  password: string | null
}

export type WslServersAPI = WslServersPlatform
export type UpdaterAPI = {
  subscribe: (cb: (state: UpdaterState) => void) => Promise<() => void>
  check: () => Promise<UpdaterState>
  install: () => Promise<void>
}

// "kokoro" ya no tiene voces en el catálogo (las 10 inglesas se retiraron en 1.0.45); se conserva
// en la unión porque una preferencia guardada de un usuario antiguo todavía puede traer ese valor.
export type VoiceEngine = "kokoro" | "piper" | "kokoro-es"

export type VoiceInfo = {
  id: string
  name: string
  language: string
  gender: "female" | "male"
  // Siempre true desde 1.0.45: el catálogo son 6 voces españolas (ef_dora en kokoro-es y 5 de
  // piper) y todas se sintetizan. Se mantiene el campo como guarda para una futura voz que llegue
  // sin soporte en la plataforma del usuario.
  supported: boolean
  // Motor de síntesis. Ninguna voz viene dentro del instalador: kokoro-es y piper se descargan
  // bajo demanda (sherpa-onnx + el fonemizador espeak-ng).
  engine: VoiceEngine
  // Whether this is the app's default voice for Spanish announcements.
  default?: boolean
  // Piper only: whether the model files are present on disk.
  downloaded?: boolean
  // Whether the voice is enabled for selection and dictation defaults.
  enabled?: boolean
  // Approximate model size in MiB (piper voices only).
  sizeMb?: number
  // Voice model license.
  license?: string
}

export type VoicesStatus = {
  ready: boolean
  downloading?: boolean
  progress?: number
  voices: VoiceInfo[]
  selected?: string
  error?: string
}

export type VoicesProgress = {
  progress: number
  file?: string
}

export type VoicesPiperProgress = {
  voiceId: string
  progress: number
  file?: string
  done?: boolean
}

export type VoicesSpeakResult = {
  wav?: Uint8Array
  error?: string
}

export type VoicesSpeakOptions = {
  // Automatic narration must never start a model download or compete with a
  // user-initiated probe. It is best-effort and can be skipped when the
  // selected local voice is not ready.
  automatic?: boolean
}

export type VoicesAPI = {
  status: () => Promise<VoicesStatus>
  download: () => Promise<void>
  list: () => Promise<VoiceInfo[]>
  speak: (text: string, voiceId?: string, options?: VoicesSpeakOptions) => Promise<VoicesSpeakResult>
  select: (voiceId: string) => Promise<boolean>
  onProgress: (cb: (event: VoicesProgress) => void) => () => void
  downloadVoice: (voiceId: string) => Promise<void>
  deleteVoice: (voiceId: string) => Promise<void>
  setEnabled: (voiceId: string, enabled: boolean) => Promise<void>
  onPiperProgress: (cb: (event: VoicesPiperProgress) => void) => () => void
  speakFish?: (
    text: string,
    voiceId?: string,
    apiKey?: string,
    speed?: number,
  ) => Promise<{ mp3?: Uint8Array; error?: string }>
}

// Local speech-to-text (sherpa-onnx Whisper) for mic dictation. The renderer
// captures audio with getUserMedia and streams PCM chunks to the main process.

// The bundled Whisper tiny model is multilingual, so every app locale is
// decoded in its own language instead of being forced through English.
export type AsrLanguage = "en" | "es" | "ja" | "ko" | "ru" | "zh"

export type AsrStatus = {
  ready: boolean
  downloading?: boolean
  progress?: number
  error?: string
  // Download size announced to the user before they consent to it.
  sizeMb: number
}

// Stable machine codes: the engine's own messages are English literals and
// used to land verbatim in a translated toast.
export type AsrErrorCode = "not-recording" | "no-speech" | "engine-failed"

export type AsrResult = {
  text?: string
  code?: AsrErrorCode
}

// Out-of-band events during a recording: the 64 s cap was reached, or the
// recognizer process died and the renderer must release the microphone.
export type AsrNotice = {
  reason: "limit" | "crashed"
  seconds?: number
}

export type AsrAPI = {
  status: () => Promise<AsrStatus>
  ensure: (language: AsrLanguage) => Promise<void>
  start: (language: AsrLanguage) => Promise<void>
  chunk: (samples: Float32Array) => void
  stop: () => Promise<AsrResult>
  onProgress: (cb: (event: { progress: number; file?: string }) => void) => () => void
  onNotice: (cb: (event: AsrNotice) => void) => () => void
}

// Instalación local de runtimes de modelos (Ollama / LM Studio).
export type RuntimeInstallState =
  | { status: "idle" }
  | { status: "downloading"; progress: number }
  | { status: "installing" }
  | { status: "error"; error: string }

export type RuntimeAPI = {
  install: (kind: "ollama" | "lmstudio") => Promise<{ ok: boolean; error?: string }>
  state: () => Promise<RuntimeInstallState>
  onState: (cb: (state: RuntimeInstallState) => void) => () => void
}

export type LinuxDisplayBackend = "wayland" | "auto"
export type TitlebarTheme = {
  mode: "light" | "dark"
  scheme?: "system" | "light" | "dark"
}
export type FatalRendererError = {
  error: string
  url: string
  version?: string
  platform: string
  os?: string
}

// Vista en vivo del panel de sesión: estado del WebContentsView del preview
// (frontend/desktop/src/main/preview-view.ts).
export type PreviewViewState = {
  url: string
  loading: boolean
  canGoBack: boolean
  canGoForward: boolean
  visible: boolean
  selectMode: boolean
}

export type PreviewViewSelection = {
  tag: string
  text: string
  className: string
  id: string
  selector: string
  url: string
  pathname: string
  dims: { width: number; height: number }
  rect: { x: number; y: number; width: number; height: number }
}

export type PreviewViewEvent =
  | { type: "state"; state: PreviewViewState }
  | { type: "loaded"; url: string }
  | { type: "console"; message: { level: number; message: string; line: number; sourceId: string } }
  | { type: "fail"; fail: { code: number; description: string; url: string; isMainFrame: boolean } }

export type PreviewViewAPI = {
  setBounds: (bounds: { x: number; y: number; width: number; height: number }) => Promise<void>
  setVisible: (visible: boolean) => Promise<void>
  navigate: (url: string) => Promise<void>
  reload: () => Promise<void>
  back: () => Promise<void>
  forward: () => Promise<void>
  setZoom: (factor: number) => Promise<void>
  getState: () => Promise<PreviewViewState | null>
  capture: () => Promise<{ buffer: ArrayBuffer; width: number; height: number }>
  setSelectMode: (enabled: boolean) => Promise<void>
  getSelection: () => Promise<PreviewViewSelection | null>
  onEvent: (cb: (event: PreviewViewEvent) => void) => () => void
}

// Espejo de la ventana de una app de escritorio lanzada por el Sandbox
// (frontend/desktop/src/main/window-mirror.ts). Es una imagen, no un embebido: no se puede
// pulsar ni escribir en ella.
export type WindowMirrorSource = { id: string; name: string; icon: string | null; thumb: string }

export type WindowMirrorEvent =
  | { type: "frame"; dataUrl: string; width: number; height: number; seq: number; title: string }
  | { type: "gone" }
  | { type: "blank" }

export type WindowMirrorAPI = {
  supported: () => Promise<boolean>
  listSources: () => Promise<WindowMirrorSource[]>
  snapshot: () => Promise<string[]>
  match: (input: { pid: number | null; hints: string[]; before?: string[] }) => Promise<string | null>
  start: (input: { sourceId: string; intervalMs?: number; width?: number }) => Promise<boolean>
  setInterval: (intervalMs: number) => Promise<void>
  /** Stop capturing but keep the chosen window, so set-interval can resume it. */
  pause: () => Promise<boolean>
  stop: () => Promise<void>
  onEvent: (cb: (event: WindowMirrorEvent) => void) => () => void
}

// El agente maneja la página de la Vista en vivo: el script se evalúa en el frame de la propia
// página desde el proceso principal (frontend/desktop/src/main/preview-agent.ts).
export type PreviewAgentAPI = {
  /** `frameUrl` identifies the iframe the renderer is showing; see main/preview-agent.ts. */
  execute: (code: string, frameUrl?: string) => Promise<{ ok: true; value: string } | { ok: false; error: string }>
  available: (frameUrl?: string) => Promise<boolean>
}

// Uso del computador: entrada real sobre el escritorio de Windows (ratón y teclado). La tool
// `computer` del agente llega hasta aquí por el puente de la Vista en vivo, y el proceso
// principal (frontend/desktop/src/main/computer-use.ts) es quien aplica los controles: ventana
// elevada, lista de apps autorizadas, gestores de contraseñas, indicador y parada.
export type ComputerAction = {
  action: "move" | "click" | "type" | "key" | "scroll" | "cursor_position" | "foreground_window"
  /** Píxeles físicos de la pantalla, con el origen arriba a la izquierda. */
  x?: number
  y?: number
  button?: "left" | "right" | "middle"
  double?: boolean
  text?: string
  /** Acorde tipo "ctrl+shift+p". */
  keys?: string
  direction?: "up" | "down" | "left" | "right"
  amount?: number
}

export type ComputerStatus = {
  /** Sólo Windows en la v1. */
  supported: boolean
  /** Hay una sesión de control viva (indicador abierto). */
  active: boolean
  /** Ejecutables autorizados por el usuario en esta sesión. */
  allowed: string[]
  actions: number
  /** Acelerador de parada que el sistema aceptó, o null si no se pudo registrar ninguno. */
  stopShortcut: string | null
  /** Interruptor general (Ajustes > Uso de la PC). Apagado, ninguna acción llega al escritorio. */
  enabled: boolean
  /** Ejecutables vetados siempre, por nombre en minúsculas. Ver main/computer-use.ts. */
  denied: string[]
}

export type ComputerAPI = {
  /** Acepta la acción suelta o la acción del puente entera, que la lleva anidada en `computer`. */
  perform: (
    action: ComputerAction | { type?: string; computer?: ComputerAction },
  ) => Promise<{ ok: boolean; output: string }>
  /** Interruptor de parada: mata el host de entrada y olvida las apps autorizadas. */
  stop: () => Promise<boolean>
  status: () => Promise<ComputerStatus>
}

export type ElectronAPI = {
  killSidecar: () => Promise<void>
  relaunchApp: () => Promise<void>
  awaitInitialization: () => Promise<ServerReadyData>
  wslServers: WslServersAPI
  updater: UpdaterAPI
  voices: VoicesAPI
  asr: AsrAPI
  runtime: RuntimeAPI
  consumeInitialDeepLinks: () => Promise<string[]>
  getDefaultServerUrl: () => Promise<string | null>
  setDefaultServerUrl: (url: string | null) => Promise<void>
  isFirstLaunchOnboardingPending: () => Promise<boolean>
  finishFirstLaunchOnboarding: (createDefaultProject: boolean) => Promise<string | null>
  isOldLayoutEligible: () => Promise<boolean>
  getDisplayBackend: () => Promise<LinuxDisplayBackend | null>
  setDisplayBackend: (backend: LinuxDisplayBackend | null) => Promise<void>
  checkAppExists: (appName: string) => Promise<boolean>
  resolveAppPath: (appName: string) => Promise<string | null>
  storeGet: (name: string, key: string) => Promise<string | null>
  storeSet: (name: string, key: string, value: string) => Promise<void>
  storeDelete: (name: string, key: string) => Promise<void>
  storeClear: (name: string) => Promise<void>
  storeKeys: (name: string) => Promise<string[]>
  storeLength: (name: string) => Promise<number>
  draftGet: (key: string) => Promise<string | null>
  draftSet: (key: string, value: string) => Promise<void>
  draftDelete: (key: string) => Promise<void>
  draftBlobPut: (data: ArrayBuffer) => Promise<string>
  draftBlobGet: (id: string) => Promise<ArrayBuffer | null>

  getWindowID: () => Promise<string>
  onMenuCommand: (cb: (id: string) => void) => () => void
  onDeepLink: (cb: (urls: string[]) => void) => () => void

  openDirectoryPicker: (opts?: {
    multiple?: boolean
    title?: string
    defaultPath?: string
  }) => Promise<string | string[] | null>
  openFilePicker: (opts?: {
    multiple?: boolean
    title?: string
    defaultPath?: string
    extensions?: string[]
  }) => Promise<{ token: string; files: { path: string; name: string; size: number }[] } | null>
  readPickedFile: (token: string, path: string) => Promise<ArrayBuffer>
  releasePickedFiles: (token: string) => Promise<void>
  getPathForFile: (file: File) => string
  saveFilePicker: (opts?: { title?: string; defaultPath?: string }) => Promise<string | null>
  writeTextFile: (path: string, content: string) => Promise<boolean>
  openExternal: (url: string) => void
  openLocalFile: (url: string) => void
  onLiveViewNavigate: (cb: (url: string) => void) => () => void
  openPath: (path: string, app?: string) => Promise<void>
  revealPath: (path: string) => Promise<boolean>
  readClipboardImage: () => Promise<{ buffer: ArrayBuffer; width: number; height: number } | null>
  /** Texto del portapapeles del sistema; lo usa la tool `clipboard` del agente. */
  readClipboardText: () => Promise<string>
  writeClipboardText: (text: string) => Promise<boolean>
  capture: {
    screen: () => Promise<{ buffer: ArrayBuffer; width: number; height: number }>
    area: (bounds: { x: number; y: number; width: number; height: number }) => Promise<{ buffer: ArrayBuffer; width: number; height: number }>
    window: () => Promise<{ buffer: ArrayBuffer; width: number; height: number }>
    preview: (webContentsId: number) => Promise<{ buffer: ArrayBuffer; width: number; height: number }>
    liveView: () => Promise<{ buffer: ArrayBuffer; width: number; height: number }>
  }
  setLoginItem: (enabled: boolean) => Promise<boolean>
  getLoginItem: () => Promise<boolean>
  clearWebviewData: () => Promise<void>
  previewView: PreviewViewAPI
  previewAgent: PreviewAgentAPI
  windowMirror: WindowMirrorAPI
  computer: ComputerAPI
  backup: {
    now: () => Promise<string | null>
    list: () => Promise<{ name: string; createdAt: number }[]>
    restore: (name: string) => Promise<void>
  }
  getWindowFocused: () => Promise<boolean>
  getWindowFullscreen: () => Promise<boolean>
  onWindowFullscreenChanged: (cb: (fullscreen: boolean) => void) => () => void
  setCompactWindow: (options?: { width?: number; height?: number }) => Promise<void>
  restoreMainWindow: () => Promise<void>
  setWindowFocus: () => Promise<void>
  showWindow: () => Promise<void>
  relaunch: () => void
  getZoomFactor: () => Promise<number>
  setZoomFactor: (factor: number) => Promise<void>
  getPinchZoomEnabled: () => Promise<boolean>
  setPinchZoomEnabled: (enabled: boolean) => Promise<void>
  onPinchZoomEnabledChanged: (cb: (enabled: boolean) => void) => () => void
  onZoomFactorChanged: (cb: (factor: number) => void) => () => void
  setTitlebar: (theme: TitlebarTheme) => Promise<void>
  runDesktopMenuAction: (action: DesktopMenuAction) => Promise<void>
  setBackgroundColor: (color: string) => Promise<void>
  exportDebugLogs: () => Promise<string>
  setForceFocus: (enabled: boolean) => Promise<void>
  recordFatalRendererError: (error: FatalRendererError) => Promise<void>
  setNativeTranslations: (bundle: DesktopNativeBundle) => Promise<void>
  pet: {
    update: (partial: Partial<DesktopPetState>) => Promise<DesktopPetState>
    toggle: () => Promise<boolean>
    getState: () => Promise<DesktopPetState>
  }
  modelHub: {
    deleteFile: (target: { file?: string; id?: string; destPath?: string }) => Promise<{ success: boolean }>
  }
}

export type DesktopPetState = {
  /** Cualquiera de las 13 de `petKinds`; la lista corta de antes dejaba fuera 10 mascotas reales. */
  kind: string
  status: "ready" | "running" | "needs-input" | "blocked"
  text: string
  petted?: boolean
  visible: boolean
}
