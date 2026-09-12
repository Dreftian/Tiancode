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

type Waiter = {
  resolve: (result: PreviewAgentResult) => void
  timer: ReturnType<typeof setTimeout>
}

type Bridge = {
  queue: PreviewAgentCommand[]
  waiters: Map<string, Waiter>
  /** Poll pendiente del renderer, para entregar una acción sin esperar al siguiente ciclo. */
  listeners: Set<(commands: PreviewAgentCommand[]) => void>
  /** Última vez que el renderer preguntó por trabajo: sin esto no hay nadie al otro lado. */
  attachedAt: number
}

/** Sin un poll reciente damos el puente por desconectado (la Vista en vivo está cerrada). */
const ATTACH_TTL_MS = 30_000
const DEFAULT_ACTION_TIMEOUT_MS = 20_000
/** Las acciones viejas no se entregan: quien las pidió ya se rindió. */
const COMMAND_TTL_MS = 60_000

const bridges = new Map<string, Bridge>()

function key(directory: string) {
  return directory.replace(/[\\/]+$/, "").toLowerCase()
}

function bridgeFor(directory: string): Bridge {
  const id = key(directory)
  const existing = bridges.get(id)
  if (existing) return existing
  const created: Bridge = { queue: [], waiters: new Map(), listeners: new Set(), attachedAt: 0 }
  bridges.set(id, created)
  return created
}

export function isPreviewBridgeAttached(directory: string): boolean {
  const bridge = bridges.get(key(directory))
  if (!bridge) return false
  return Date.now() - bridge.attachedAt < ATTACH_TTL_MS
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
  timeoutMs = DEFAULT_ACTION_TIMEOUT_MS,
): Promise<PreviewAgentResult> {
  const bridge = bridgeFor(directory)
  const command: PreviewAgentCommand = { id: randomUUID(), action, createdAt: Date.now() }

  return new Promise<PreviewAgentResult>((resolve) => {
    const timer = setTimeout(() => {
      bridge.waiters.delete(command.id)
      bridge.queue = bridge.queue.filter((item) => item.id !== command.id)
      resolve({
        id: command.id,
        ok: false,
        output: isPreviewBridgeAttached(directory)
          ? "La vista previa no respondió a tiempo. Puede estar recargando o bloqueada por un error de JavaScript; revisa preview_status y vuelve a intentarlo."
          : "La Vista en vivo no está abierta en esta sesión, así que no hay ninguna página que manejar. Arranca la vista previa (preview_start) y pide al usuario que abra el panel de Vista en vivo.",
      })
    }, timeoutMs)

    bridge.waiters.set(command.id, { resolve, timer })
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
 */
export function takePreviewCommands(directory: string, waitMs: number): Promise<PreviewAgentCommand[]> {
  const bridge = bridgeFor(directory)
  bridge.attachedAt = Date.now()

  const now = Date.now()
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

export function settlePreviewCommand(directory: string, result: PreviewAgentResult): void {
  const bridge = bridgeFor(directory)
  bridge.attachedAt = Date.now()
  const waiter = bridge.waiters.get(result.id)
  if (!waiter) return
  bridge.waiters.delete(result.id)
  clearTimeout(waiter.timer)
  waiter.resolve(result)
}

/** Sólo para los tests: deja el puente sin estado entre casos. */
export function resetPreviewBridge(): void {
  for (const bridge of bridges.values()) {
    for (const waiter of bridge.waiters.values()) clearTimeout(waiter.timer)
  }
  bridges.clear()
}
