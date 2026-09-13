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
  // Un arranque que acaba en error deja sus últimas líneas —justo las que explican el fallo—
  // después del último sondeo de "starting". Sin esta vuelta extra la consola se queda en la
  // penúltima línea y el motivo no llega a verse.
  if (input.status === "error") return true
  return false
}

export type PreviewLogsVisibility = PreviewPollInput & {
  /** Líneas ya recibidas: una consola vacía es peor que ninguna consola. */
  lines: number
}

/**
 * Si la cola de logs debe estar en pantalla.
 *
 * Se traía ya para proyectos web mientras arrancan (shouldFetchPreviewLogs) y se tiraba, porque
 * la consola sólo se pintaba en la rama de escritorio: el usuario miraba un panel en blanco con
 * la palabra "Iniciando…" durante un minuto teniendo la salida real a mano.
 */
export function shouldShowPreviewLogs(input: PreviewLogsVisibility): boolean {
  // La app de escritorio no tiene otra ventana dentro de Tiancode: su consola es el panel.
  if (input.desktop) return true
  if (input.lines === 0) return false
  if (input.building) return true
  return input.status === "starting" || input.status === "error"
}

// ── Espejo de la ventana de escritorio ─────────────────────────────────────────

export type MirrorCadenceInput = {
  /** El panel está a la vista. */
  visible: boolean
  /** La ventana de Tiancode tiene el foco. */
  focused: boolean
}

export const MIRROR_FOCUSED_MS = 500
export const MIRROR_BLURRED_MS = 2_000
/** Cero significa "para el temporizador": capturar para nadie sale caro. */
export const MIRROR_STOPPED_MS = 0

/**
 * Cada captura fotografía TODAS las ventanas del escritorio — no hay API para una sola — así que
 * el ritmo importa más aquí que en cualquier otro sondeo de la app.
 */
export function mirrorFrameInterval(input: MirrorCadenceInput): number {
  if (!input.visible) return MIRROR_STOPPED_MS
  return input.focused ? MIRROR_FOCUSED_MS : MIRROR_BLURRED_MS
}

export type MirrorArmInput = {
  isDesktop: boolean
  status: PreviewPollStatus
  pid: number | null | undefined
  /** El servidor es el sidecar local: un pid remoto o de WSL no tiene ventana en este escritorio. */
  local: boolean
  /** La plataforma expone el espejo (solo Windows en la app de escritorio). */
  available: boolean
}

/** Whether there is anything worth mirroring. Every condition here is load-bearing. */
export function shouldArmMirror(input: MirrorArmInput): boolean {
  if (!input.available || !input.local) return false
  if (!input.isDesktop) return false
  if (input.status !== "ready") return false
  return typeof input.pid === "number" && input.pid > 0
}
