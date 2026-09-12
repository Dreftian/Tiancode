// Puente entre el agente y la página que corre en la Vista en vivo (Sandbox).
//
// Hasta ahora el agente sólo podía arrancar el dev server y leer logs: escribía código a
// ciegas y terminaba diciendo "no puedo abrir la ventana, así que sólo validé que compila".
// Este módulo le da la página en sí — qué se ve, qué botones hay, qué pasa al pulsarlos.
//
// El servidor no puede tocar el DOM: la página vive en el proceso de la ventana. Así que el
// agente encola una acción aquí, el renderer la recoge (long-poll) y la ejecuta contra el
// frame real (Electron ejecuta el script desde el proceso principal, así que también funciona
// en el iframe de origen cruzado), y devuelve el resultado por el mismo canal.
//
// "Hay alguien al otro lado" no es una sola cosa. Un cliente puede estar sondeando y aun así no
// poder ejecutar nada: la Vista en vivo cerrada (no hay iframe), o una sesión abierta en el
// navegador (no hay proceso principal que evalúe el script). Entregarle una acción a uno de esos
// la destruiría, así que la presencia se mide en tres niveles y sólo el más alto recibe trabajo.

import { randomUUID } from "node:crypto"

export type PreviewAgentAction = {
  type: "inspect" | "click" | "fill" | "press" | "select" | "scroll" | "navigate"
  /** Referencia (`e12`) de un inspect previo, selector CSS o texto visible del elemento. */
  target?: string
  value?: string
  key?: string
  url?: string
  direction?: string
}

export type PreviewAgentCommand = {
  id: string
  action: PreviewAgentAction
  createdAt: number
}

export type PreviewAgentResult = {
  id: string
  ok: boolean
  output: string
}

/**
 * - `surface`: hay una página cargada que puede recibir la acción ahora mismo.
 * - `opening`: hay una app de escritorio con esta carpeta, pero sin página (panel cerrado o
 *   cargando). La acción espera en la cola y el vigía abre el panel.
 * - `incapable`: hay un cliente, pero no puede ejecutar scripts en la página (build web).
 * - `none`: no hay ninguna ventana de Tiancode con esta carpeta.
 */
export type PreviewBridgePresence = "surface" | "opening" | "incapable" | "none"

type Waiter = {
  resolve: (result: PreviewAgentResult) => void
  timer: ReturnType<typeof setTimeout>
  /** Copia viva del comando: tras `flush` ya no está en la cola y hay que poder reencolarlo. */
  command: PreviewAgentCommand
}

type Bridge = {
  queue: PreviewAgentCommand[]
  waiters: Map<string, Waiter>
  /** Poll pendiente de un cliente CON página, para entregar sin esperar al siguiente ciclo. */
  listeners: Set<(commands: PreviewAgentCommand[]) => void>
  /** Alguien preguntó, sea cual sea su capacidad. */
  attachedAt: number
  /** Un cliente que podría ejecutar la acción si hubiera página (app de escritorio). */
  capableAt: number
  /** Un cliente con una página cargada ahora mismo. */
  surfaceAt: number
}

/** Sin un poll reciente damos el nivel por perdido. Por encima del long-poll de 20 s. */
const ATTACH_TTL_MS = 30_000
/** Hay página: lo que tarde la página. */
const SURFACE_ACTION_TIMEOUT_MS = 20_000
/** El panel se está abriendo y la página aún tiene que cargar. */
const OPENING_ACTION_TIMEOUT_MS = 45_000
/** Nadie ha preguntado: se le da un momento a una ventana recién abierta y se contesta. */
const COLD_ACTION_TIMEOUT_MS = 6_000
/** Las acciones viejas no se entregan: quien las pidió ya se rindió. Por encima del mayor timeout. */
const COMMAND_TTL_MS = 60_000

const bridges = new Map<string, Bridge>()

function key(directory: string) {
  return directory.replace(/[\\/]+$/, "").toLowerCase()
}

function bridgeFor(directory: string): Bridge {
  const id = key(directory)
  const existing = bridges.get(id)
  if (existing) return existing
  const created: Bridge = {
    queue: [],
    waiters: new Map(),
    listeners: new Set(),
    attachedAt: 0,
    capableAt: 0,
    surfaceAt: 0,
  }
  bridges.set(id, created)
  return created
}

export function previewBridgePresence(directory: string): PreviewBridgePresence {
  const bridge = bridges.get(key(directory))
  if (!bridge) return "none"
  const now = Date.now()
  if (now - bridge.attachedAt >= ATTACH_TTL_MS) return "none"
  if (now - bridge.surfaceAt < ATTACH_TTL_MS) return "surface"
  if (now - bridge.capableAt < ATTACH_TTL_MS) return "opening"
  return "incapable"
}

/**
 * Whether an action can be executed right now.
 *
 * Deliberately narrower than "somebody polled": with the demand endpoint every open session polls,
 * so a looser definition would be permanently true and the tools would lose the one signal that
 * tells the agent to stop retrying.
 */
export function isPreviewBridgeAttached(directory: string): boolean {
  return previewBridgePresence(directory) === "surface"
}

const INCAPABLE_MESSAGE =
  "Esta sesión se está viendo en el navegador, donde Tiancode no puede ejecutar acciones dentro de la página. No repitas la acción: usa preview_status y preview_logs, y describe al usuario qué debería ver."

function timeoutMessage(presence: PreviewBridgePresence) {
  if (presence === "surface")
    return "La vista previa no respondió a tiempo. Puede estar recargando o bloqueada por un error de JavaScript; revisa preview_status y vuelve a intentarlo."
  if (presence === "opening")
    return "La Vista en vivo se estaba abriendo pero la página aún no ha cargado. Comprueba preview_status y vuelve a intentarlo en unos segundos."
  if (presence === "incapable") return INCAPABLE_MESSAGE
  return "No hay ninguna ventana de Tiancode con esta carpeta abierta, así que nadie puede ejecutar la acción. No repitas la acción: sigue con preview_status y preview_logs."
}

function timeoutFor(presence: PreviewBridgePresence) {
  if (presence === "surface") return SURFACE_ACTION_TIMEOUT_MS
  if (presence === "opening") return OPENING_ACTION_TIMEOUT_MS
  return COLD_ACTION_TIMEOUT_MS
}

/**
 * Encola una acción y espera su resultado.
 *
 * Nunca lanza: un fallo se devuelve como `ok: false` con un mensaje que el agente puede leer,
 * porque una tool que explota le dice mucho menos que una que explica qué falta.
 */
export function requestPreviewAction(
  directory: string,
  action: PreviewAgentAction,
  timeoutMs?: number,
): Promise<PreviewAgentResult> {
  const presence = previewBridgePresence(directory)
  const command: PreviewAgentCommand = { id: randomUUID(), action, createdAt: Date.now() }

  // Encolar para un cliente que estructuralmente no puede actuar sólo gasta el tiempo del agente.
  if (presence === "incapable") {
    return Promise.resolve({ id: command.id, ok: false, output: INCAPABLE_MESSAGE })
  }

  const bridge = bridgeFor(directory)
  const wait = timeoutMs ?? timeoutFor(presence)

  return new Promise<PreviewAgentResult>((resolve) => {
    const timer = setTimeout(() => {
      bridge.waiters.delete(command.id)
      bridge.queue = bridge.queue.filter((item) => item.id !== command.id)
      // La presencia se lee AHORA, no al encolar: el panel pudo abrirse mientras esperábamos.
      resolve({ id: command.id, ok: false, output: timeoutMessage(previewBridgePresence(directory)) })
    }, wait)

    bridge.waiters.set(command.id, { resolve, timer, command })
    bridge.queue.push(command)
    flush(bridge)
  })
}

function flush(bridge: Bridge) {
  if (bridge.queue.length === 0) return
  if (bridge.listeners.size === 0) return
  const now = Date.now()
  const fresh = bridge.queue.filter((item) => now - item.createdAt < COMMAND_TTL_MS)
  bridge.queue = []
  if (fresh.length === 0) return
  // Exactly one listener gets the batch. Two windows on the same folder both poll, and handing
  // the action to both would click the button twice.
  const [first] = bridge.listeners
  if (!first) return
  bridge.listeners.delete(first)
  first(fresh)
}

/**
 * Long-poll del renderer: devuelve las acciones pendientes, o espera `waitMs` a que llegue una.
 * Esperar en vez de sondear cada pocos cientos de milisegundos mantiene la latencia de un clic
 * por debajo de lo que el usuario percibe sin encender la CPU mientras no pasa nada.
 *
 * Un cliente sin página se registra pero NO recibe nada: `flush` vacía la cola al entregar, así
 * que dársela a alguien que no puede ejecutarla la destruiría.
 */
export function takePreviewCommands(
  directory: string,
  waitMs: number,
  client: { surface: boolean; capable: boolean },
): Promise<PreviewAgentCommand[]> {
  const bridge = bridgeFor(directory)
  const now = Date.now()
  bridge.attachedAt = now
  if (client.capable) bridge.capableAt = now
  if (client.surface) bridge.surfaceAt = now

  if (!client.surface) {
    return new Promise<PreviewAgentCommand[]>((resolve) => {
      setTimeout(() => resolve([]), waitMs)
    })
  }

  const ready = bridge.queue.filter((item) => now - item.createdAt < COMMAND_TTL_MS)
  if (ready.length > 0) {
    bridge.queue = []
    return Promise.resolve(ready)
  }

  return new Promise<PreviewAgentCommand[]>((resolve) => {
    const listener = (commands: PreviewAgentCommand[]) => {
      clearTimeout(timer)
      bridge.listeners.delete(listener)
      resolve(commands)
    }
    const timer = setTimeout(() => {
      bridge.listeners.delete(listener)
      resolve([])
    }, waitMs)
    bridge.listeners.add(listener)
  })
}

/**
 * @param options.requeue the client claimed the command and then tore down without running it.
 * Put it back rather than resolving: the waiter is still counting down and a fresh panel can
 * still execute it. Only ever set on the "closed before execute" path — setting it after a real
 * execution would run the action twice.
 */
export function settlePreviewCommand(
  directory: string,
  result: PreviewAgentResult,
  options?: { requeue?: boolean },
): void {
  const bridge = bridgeFor(directory)
  bridge.attachedAt = Date.now()
  const waiter = bridge.waiters.get(result.id)
  if (!waiter) return
  if (options?.requeue) {
    bridge.queue.push(waiter.command)
    // A second window may already be parked on a long-poll; hand it over now instead of making
    // the agent wait out that poll's timeout first.
    flush(bridge)
    return
  }
  bridge.waiters.delete(result.id)
  clearTimeout(waiter.timer)
  waiter.resolve(result)
}

/** Records a client that is present but has no page, without touching the queue. */
export function reportPreviewBridgeClient(directory: string, client: { capable: boolean }): void {
  const bridge = bridgeFor(directory)
  const now = Date.now()
  bridge.attachedAt = now
  if (client.capable) bridge.capableAt = now
}

/**
 * What the agent is waiting for, read-only.
 *
 * The live-view watchdog polls this while the panel is closed and opens it when something is
 * pending. It must never consume the queue, or it would eat the very action it is opening for.
 */
export function pendingPreviewDemand(directory: string): {
  pending: number
  id: string | null
  since: number | null
} {
  const bridge = bridges.get(key(directory))
  if (!bridge) return { pending: 0, id: null, since: null }
  const now = Date.now()
  bridge.queue = bridge.queue.filter((item) => now - item.createdAt < COMMAND_TTL_MS)
  const oldest = bridge.queue[0]
  return {
    pending: bridge.queue.length,
    id: oldest?.id ?? null,
    since: oldest?.createdAt ?? null,
  }
}

/** Sólo para los tests: deja el puente sin estado entre casos. */
export function resetPreviewBridge(): void {
  for (const bridge of bridges.values()) {
    for (const waiter of bridge.waiters.values()) clearTimeout(waiter.timer)
  }
  bridges.clear()
}
