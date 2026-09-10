// Estado del Preview Server (dev server gestionado por el agente).
// Por workspace: un solo servidor, sin duplicados.

export type PreviewStatus = "idle" | "starting" | "ready" | "error" | "stopped"

export type PreviewError = {
  file: string | null
  line: number | null
  message: string
}

/**
 * Progress of an incremental rebuild triggered by a file change (the agent writing code, or
 * the user editing). This is separate from `status`: the server stays "ready" while a rebuild
 * runs, so without this the UI has no way to show that work is in flight.
 */
export type PreviewBuild = {
  /** True from the moment the build script is spawned until it exits. */
  running: boolean
  /** Epoch ms when the current (or last) build started; null before the first one. */
  startedAt: number | null
  /** Wall-clock duration of the last finished build, in ms. */
  durationMs: number | null
  /** Whether the last finished build exited 0. Null until one finishes. */
  ok: boolean | null
  /** The file whose change triggered the current build, workspace-relative. */
  trigger: string | null
  /** Monotonic counter, so clients can tell a fresh build from a repeated poll. */
  sequence: number
}

export type PreviewState = {
  status: PreviewStatus
  url: string | null
  port: number | null
  framework: string | null
  packageManager: string | null
  command: string | null
  errors: PreviewError[]
  startedAt: number | null
  errorMessage: string | null
  isDesktop?: boolean
  build: PreviewBuild
}

export const IDLE_BUILD: PreviewBuild = {
  running: false,
  startedAt: null,
  durationMs: null,
  ok: null,
  trigger: null,
  sequence: 0,
}
