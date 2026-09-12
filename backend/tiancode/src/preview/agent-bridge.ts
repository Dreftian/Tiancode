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
  type: PreviewPageActionType | DesktopActionType
  /**
   * Acciones de página: referencia (`e12`) de un inspect previo, selector CSS o texto visible.
   * `capture`: qué se fotografía — `screen`, `window` o `area`.
   */
  target?: string
  /** Texto a escribir en un campo, o el texto que `clipboard_write` pone en el portapapeles. */
  value?: string
  key?: string
  url?: string
  direction?: string
  /** `capture` sobre `area`: recorte en coordenadas CSS de la pantalla principal. */
  bounds?: { x: number; y: number; width: number; height: number }
}

export type PreviewPageActionType = "inspect" | "click" | "fill" | "press" | "select" | "scroll" | "navigate"

/**
 * Acciones que no tocan la página: las ejecuta el proceso principal de Electron contra el
 * escritorio (captura de pantalla, portapapeles). Viajan por este mismo puente porque el
 * servidor es un proceso Bun sin acceso a Electron, pero a diferencia de las de página no
 * necesitan que haya un frame cargado — sólo una ventana de Tiancode que pueda ejecutarlas.
 */
export type DesktopActionType = "capture" | "clipboard_read" | "clipboard_write"

const DESKTOP_ACTIONS = new Set<string>(["capture", "clipboard_read", "clipboard_write"] satisfies DesktopActionType[])

function isDesktopAction(action: PreviewAgentAction) {
  return DESKTOP_ACTIONS.has(action.type)
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

/** Un long-poll parado: `surface` decide qué acciones puede recibir. */
type Listener = {
  surface: boolean
  deliver: (commands: PreviewAgentCommand[]) => void
}

type Bridge = {
  queue: PreviewAgentCommand[]
  waiters: Map<string, Waiter>
  /** Polls pendientes de clientes que pueden ejecutar algo, para entregar sin esperar al siguiente ciclo. */
  listeners: Set<Listener>
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

const DESKTOP_INCAPABLE_MESSAGE =
  "Esta sesión se está viendo en el navegador, donde Tiancode no tiene acceso al escritorio: no hay captura de pantalla ni portapapeles. No repitas la acción: pide al usuario que la haga desde la app de escritorio."

function incapableMessage(action: PreviewAgentAction) {
  return isDesktopAction(action) ? DESKTOP_INCAPABLE_MESSAGE : INCAPABLE_MESSAGE
}

function timeoutMessage(presence: PreviewBridgePresence, action: PreviewAgentAction) {
  if (isDesktopAction(action)) {
    if (presence === "incapable") return DESKTOP_INCAPABLE_MESSAGE
    if (presence === "none")
      return "No hay ninguna ventana de Tiancode con esta carpeta abierta, así que nadie puede llegar al escritorio. No repitas la acción: dile al usuario que abra la app de escritorio."
    return "La app de escritorio no devolvió el resultado a tiempo. Vuelve a intentarlo una vez; si vuelve a fallar, pide al usuario que lo compruebe."
  }
  if (presence === "surface")
    return "La vista previa no respondió a tiempo. Puede estar recargando o bloqueada por un error de JavaScript; revisa preview_status y vuelve a intentarlo."
  if (presence === "opening")
    return "La Vista en vivo se estaba abriendo pero la página aún no ha cargado. Comprueba preview_status y vuelve a intentarlo en unos segundos."
  if (presence === "incapable") return INCAPABLE_MESSAGE
  return "No hay ninguna ventana de Tiancode con esta carpeta abierta, así que nadie puede ejecutar la acción. No repitas la acción: sigue con preview_status y preview_logs."
}

function timeoutFor(presence: PreviewBridgePresence, desktop: boolean) {
  if (presence === "surface") return SURFACE_ACTION_TIMEOUT_MS
  // Una acción de escritorio no necesita la página, así que con una ventana capaz delante no hay
  // ninguna carga que esperar: darle los 45 s del panel sólo quemaría el tiempo del agente.
  if (presence === "opening") return desktop ? SURFACE_ACTION_TIMEOUT_MS : OPENING_ACTION_TIMEOUT_MS
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
    return Promise.resolve({ id: command.id, ok: false, output: incapableMessage(action) })
  }

  const bridge = bridgeFor(directory)
  const wait = timeoutMs ?? timeoutFor(presence, isDesktopAction(action))

  return new Promise<PreviewAgentResult>((resolve) => {
    const timer = setTimeout(() => {
      bridge.waiters.delete(command.id)
      bridge.queue = bridge.queue.filter((item) => item.id !== command.id)
      // La presencia se lee AHORA, no al encolar: el panel pudo abrirse mientras esperábamos.
      resolve({ id: command.id, ok: false, output: timeoutMessage(previewBridgePresence(directory), action) })
    }, wait)

    bridge.waiters.set(command.id, { resolve, timer, command })
    bridge.queue.push(command)
    flush(bridge)
  })
}

/** Una acción que ejecuta el proceso principal de Electron, no la página. */
export type DesktopAgentAction = PreviewAgentAction & { type: DesktopActionType }

/**
 * Hermana de `requestPreviewAction` para lo que vive fuera de la página: la captura de pantalla y
 * el portapapeles del sistema.
 *
 * La diferencia no está aquí sino en la entrega: estas acciones no necesitan un frame cargado, así
 * que `takePreviewCommands` también se las da a una ventana de escritorio con la Vista en vivo
 * todavía abriéndose. La presencia es la misma de siempre — un cliente que no puede ejecutar
 * scripts en la página tampoco puede llegar al escritorio.
 */
export function requestDesktopAction(
  directory: string,
  action: DesktopAgentAction,
  timeoutMs?: number,
): Promise<PreviewAgentResult> {
  return requestPreviewAction(directory, action, timeoutMs)
}

function flush(bridge: Bridge) {
  if (bridge.queue.length === 0) return
  if (bridge.listeners.size === 0) return
  const now = Date.now()
  bridge.queue = bridge.queue.filter((item) => now - item.createdAt < COMMAND_TTL_MS)
  // Exactly one listener gets a given command. Two windows on the same folder both poll, and
  // handing the action to both would click the button twice. A listener without a page only
  // takes desktop actions: giving it a page action would destroy it.
  for (const listener of bridge.listeners) {
    if (bridge.queue.length === 0) return
    const batch = bridge.queue.filter((item) => listener.surface || isDesktopAction(item.action))
    if (batch.length === 0) continue
    bridge.queue = bridge.queue.filter((item) => !batch.includes(item))
    bridge.listeners.delete(listener)
    listener.deliver(batch)
  }
}

/**
 * Long-poll del renderer: devuelve las acciones pendientes, o espera `waitMs` a que llegue una.
 * Esperar en vez de sondear cada pocos cientos de milisegundos mantiene la latencia de un clic
 * por debajo de lo que el usuario percibe sin encender la CPU mientras no pasa nada.
 *
 * Un cliente sin página recibe sólo las acciones de escritorio (captura, portapapeles), que no
 * necesitan un frame: la entrega vacía la cola, así que darle una acción de página a quien no
 * puede ejecutarla la destruiría. Un cliente web no recibe nada en absoluto.
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

  if (!client.capable) {
    return new Promise<PreviewAgentCommand[]>((resolve) => {
      setTimeout(() => resolve([]), waitMs)
    })
  }

  const takes = (item: PreviewAgentCommand) => client.surface || isDesktopAction(item.action)
  const ready = bridge.queue.filter((item) => now - item.createdAt < COMMAND_TTL_MS && takes(item))
  if (ready.length > 0) {
    bridge.queue = bridge.queue.filter((item) => now - item.createdAt < COMMAND_TTL_MS && !ready.includes(item))
    return Promise.resolve(ready)
  }

  return new Promise<PreviewAgentCommand[]>((resolve) => {
    const listener: Listener = {
      surface: client.surface,
      deliver: (commands) => {
        clearTimeout(timer)
        bridge.listeners.delete(listener)
        resolve(commands)
      },
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
