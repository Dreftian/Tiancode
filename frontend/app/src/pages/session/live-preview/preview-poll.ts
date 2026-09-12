// Cada cuánto preguntar al servidor por el estado de la vista previa.
//
// Era un intervalo fijo de 2 s que además se traía los últimos logs en cada vuelta, estuviera
// pasando algo o no. Con la Vista en vivo abierta y el proyecto parado eso son 1.800 peticiones
// por hora que no cambian nada, y en cambio durante un arranque o una compilación 2 s se notan.
// El ritmo va ahora con lo que está ocurriendo.

export type PreviewPollStatus = "idle" | "starting" | "ready" | "error" | "stopped" | undefined

export type PreviewPollInput = {
  status: PreviewPollStatus
  building: boolean
  /** El panel de consola del Sandbox está a la vista: sus logs sí se miran. */
  desktop: boolean
}

export const PREVIEW_POLL_ACTIVE_MS = 900
export const PREVIEW_POLL_READY_MS = 2_000
export const PREVIEW_POLL_QUIET_MS = 6_000

export function previewPollInterval(input: PreviewPollInput): number {
  if (input.status === "starting" || input.building) return PREVIEW_POLL_ACTIVE_MS
  if (input.status === "ready") return PREVIEW_POLL_READY_MS
  return PREVIEW_POLL_QUIET_MS
}

/**
 * Los logs sólo se piden cuando hay algo que mirar: la consola del Sandbox está delante, o el
 * servidor está arrancando o compilando (que es cuando aparece el error que importa).
 */
export function shouldFetchPreviewLogs(input: PreviewPollInput): boolean {
  if (input.desktop) return true
  if (input.status === "starting") return true
  if (input.building) return true
  return false
}
