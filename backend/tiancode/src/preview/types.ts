// Estado del Preview Server (dev server gestionado por el agente).
// Por workspace: un solo servidor, sin duplicados.

export type PreviewStatus = "idle" | "starting" | "ready" | "error" | "stopped"

export type PreviewError = {
  file: string | null
  line: number | null
  message: string
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
}
