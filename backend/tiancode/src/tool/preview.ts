// Tools del Preview Server: el agente arranca/detiene/reinicia el dev server
// del proyecto y lee su estado y errores de compilación (ciclo
// WRITE → BUILD → ERROR → FIX). El renderer consume el mismo estado por
// HttpApi (/preview).
//
// Nota: el directorio del workspace se resuelve DENTRO del execute (el init
// del registry no tiene InstanceRef — resolverlo ahí tumbaría el arranque).

import { Effect, Schema } from "effect"
import { InstanceState } from "@/effect/instance-state"
import * as Tool from "./tool"
import { getPreviewLogs, getPreviewState, restartPreviewServer, startPreviewServer, stopPreviewServer } from "../preview/dev-server-manager"
import {
  previewBridgePresence,
  requestPreviewAction,
  type PreviewAgentAction,
  type PreviewBridgePresence,
} from "../preview/agent-bridge"
import type { PreviewState } from "../preview/types"

function describe(state: PreviewState) {
  return JSON.stringify(state, null, 2)
}

const NoArgs = Schema.Struct({})
const PREVIEW_READY_TIMEOUT_MS = 45_000

// El servidor tarda unos segundos en arrancar: espera breve de readiness para
// que el agente reciba la URL en el mismo resultado de la tool.
function waitForReady(directory: string) {
  return new Promise<void>((resolve) => {
    let waited = 0
    const timer = setInterval(() => {
      waited += 500
      if (getPreviewState(directory).status !== "starting" || waited >= PREVIEW_READY_TIMEOUT_MS) {
        clearInterval(timer)
        resolve()
      }
    }, 500)
  })
}

export const PreviewStartTool = Tool.define(
  "preview_start",
  Effect.succeed({
    description:
      "Detecta el proyecto web del workspace (Vite, Next, etc.) y arranca su servidor de desarrollo; también sirve proyectos estáticos con index.html y apps JSX/TSX sin configuración con una entrada convencional o declarada por index.html. La vista JSX sin configuración admite React/react-dom y módulos relativos; los paquetes externos requieren package.json y un script de desarrollo real. Para Python, Go, .NET, PHP, Ruby u otro runtime HTTP usa un tiancode.preview.json explícito (command como array y URL localhost). Espera hasta que el servidor responda por HTTP y devuelve su URL y puerto. Usa preview_status para leer los errores de compilación. Esta es la única ruta para una vista previa durante la implementación: nunca abras Chrome, el navegador del sistema ni un archivo HTML mediante Start-Process, explorer, browser tools o comandos de shell. Tiancode muestra la URL automáticamente dentro de Vista en vivo; abrir fuera solo corresponde a una petición explícita del usuario.",
    parameters: NoArgs,
    execute: () =>
      Effect.gen(function* () {
        const directory = yield* InstanceState.directory
        return yield* Effect.tryPromise({
          try: async () => {
            await startPreviewServer(directory)
            await waitForReady(directory)
            return { title: "Preview iniciado", output: describe(getPreviewState(directory)), metadata: {} }
          },
          catch: (error) => new Error(error instanceof Error ? error.message : String(error)),
        }).pipe(
          Effect.catch((error) =>
            Effect.succeed({ title: "Preview falló", output: `Error al iniciar el preview: ${String(error)}`, metadata: {} }),
          ),
        )
      }),
  }),
)

export const PreviewStopTool = Tool.define(
  "preview_stop",
  Effect.succeed({
    description:
      "Detiene el servidor de desarrollo del proyecto actual y mata su árbol de procesos sin dejar huérfanos.",
    parameters: NoArgs,
    execute: () =>
      Effect.gen(function* () {
        const directory = yield* InstanceState.directory
        return {
          title: "Preview detenido",
          output: describe(stopPreviewServer(directory)),
          metadata: {},
        }
      }),
  }),
)

export const PreviewRestartTool = Tool.define(
  "preview_restart",
  Effect.succeed({
    description:
      "Reinicia el servidor de desarrollo del proyecto actual (útil tras un error que no se recupera con HMR).",
    parameters: NoArgs,
    execute: () =>
      Effect.gen(function* () {
        const directory = yield* InstanceState.directory
        return yield* Effect.tryPromise({
          try: async () => {
            await restartPreviewServer(directory)
            await waitForReady(directory)
            return { title: "Preview reiniciado", output: describe(getPreviewState(directory)), metadata: {} }
          },
          catch: (error) => new Error(error instanceof Error ? error.message : String(error)),
        }).pipe(
          Effect.catch((error) =>
            Effect.succeed({ title: "Preview falló", output: `Error al reiniciar el preview: ${String(error)}`, metadata: {} }),
          ),
        )
      }),
  }),
)

export const PreviewStatusTool = Tool.define(
  "preview_status",
  Effect.succeed({
    description:
      "Devuelve el estado del servidor de desarrollo del proyecto actual: URL, puerto, framework y los errores de compilación activos (con archivo y línea) para corregirlos. Usa esta tool después de modificar código para comprobar que compila.",
    parameters: NoArgs,
    execute: () =>
      Effect.gen(function* () {
        const directory = yield* InstanceState.directory
        return {
          title: "Estado del preview",
          output: describe(getPreviewState(directory)),
          metadata: {},
        }
      }),
  }),
)

export const PreviewLogsTool = Tool.define(
  "preview_logs",
  Effect.succeed({
    description:
      "Devuelve las últimas líneas del log del servidor de desarrollo del proyecto actual.",
    parameters: NoArgs,
    execute: () =>
      Effect.gen(function* () {
        const directory = yield* InstanceState.directory
        return {
          title: "Logs del preview",
          output: getPreviewLogs(directory).slice(-120).join("\n") || "(sin logs)",
          metadata: {},
        }
      }),
  }),
)

// ---------------------------------------------------------------------------
// El agente dentro de la app: ver y manejar la página del Sandbox.
//
// Sin esto el agente escribe código, comprueba que compila y termina diciendo "no pude abrir
// la ventana, así que no sé si funciona". Con esto abre la pantalla, lee lo que hay, pulsa un
// botón y comprueba el resultado — que es lo que haría el usuario.
// ---------------------------------------------------------------------------

const NOT_RUNNING =
  "La vista previa no está en marcha. Ejecuta preview_start antes de inspeccionar o manejar la página."

// A desktop app launched as a process has no DOM to reach: the Sandbox mirrors its OS window as
// an image, and Electron cannot send input into a foreign window. Say that plainly instead of
// letting the agent hit an opaque "no frame" failure and retry it.
//
// The test is "no URL", NOT `isDesktop`: an Electron project whose web UI Tiancode serves out of
// dist/ is detected as both static AND isDesktop, and that one really is a page.
const DESKTOP_NO_DOM = [
  "Este proyecto es una app de escritorio: el Sandbox refleja su ventana real como imagen, no como página.",
  "No hay DOM que leer ni elementos que pulsar, así que esta herramienta no aplica aquí.",
  "Usa preview_logs para stdout/stderr y preview_status para el estado, y pide al usuario que mire la ventana reflejada en Vista en vivo.",
].join(" ")

const NO_ORIGIN =
  "La vista previa aún no tiene URL: espera a que preview_start termine de arrancar el servidor y vuelve a intentarlo."

const BROWSER_NO_PAGE = [
  "El navegador integrado no tiene ninguna página cargada.",
  "Ábrelo desde el panel del navegador y navega a un sitio antes de usar `surface: \"browser\"`.",
].join(" ")

type AgentMetadata = {
  ok: boolean
  presence?: PreviewBridgePresence
  /** Origen de la página sobre la que se pidió permiso, tal cual se le mostró al usuario. */
  origin?: string
}

function previewRunning(state: PreviewState) {
  return state.status === "ready" || state.status === "starting"
}

/**
 * El origen del dev server, que es lo que acaba en el patrón del permiso.
 *
 * Identifica el sitio sin arrastrar la ruta ni la query, que cambian a cada clic y convertirían
 * cada pantalla en una pregunta nueva.
 *
 * La normalización del host replica la de `iframePreviewUrl`
 * (frontend/app/src/pages/session/live-preview/live-preview-transport.ts): el servidor puede
 * anunciarse en `0.0.0.0` o `[::1]` y el panel lo carga en la forma navegable, así que sin esto el
 * patrón nombraría un origen distinto del de la página sobre la que se va a actuar. El renderer
 * sólo deja actuar sobre uno de esos dos deletreos, así que los dos son el mismo servidor.
 */
function previewOrigin(value: string | null): string | null {
  if (!value) return null
  let url: URL
  try {
    url = new URL(value.trim())
  } catch {
    return null
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null
  if (url.hostname === "0.0.0.0") url.hostname = "127.0.0.1"
  if (url.hostname === "[::1]" || url.hostname === "::1") url.hostname = "localhost"
  return url.origin
}

// What the agent should do next, which differs sharply by state: "opening" fixes itself and is
// worth retrying, the other two will not and retrying just burns turns.
function bridgeHint(presence: PreviewBridgePresence) {
  if (presence === "surface") return ""
  const note =
    presence === "opening"
      ? "Nota: la Vista en vivo estaba cerrada y Tiancode la ha abierto para esta acción; la página necesita unos segundos para cargar. Vuelve a intentarlo."
      : presence === "incapable"
        ? "Nota: esta sesión se ve en el navegador, donde no se pueden ejecutar acciones dentro de la página. No insistas: valida con preview_status y preview_logs."
        : "Nota: no hay ninguna ventana de Tiancode con esta carpeta abierta. No insistas: sigue con preview_status y preview_logs, y di al usuario qué debería comprobar."
  return ["", "", note].join("\n")
}

/**
 * Ejecuta una acción de página con el usuario delante.
 *
 * Leer y pulsar una página viva no preguntaba nada: estaba menos vigilado que `glob`. Ahora se
 * pide permiso con el ORIGEN del dev server en el patrón, así que el usuario ve el sitio concreto
 * y un «siempre» para este proyecto no se convierte en un «siempre» para el siguiente.
 *
 * El origen sale del estado del dev server, no de la página: el renderer sólo entrega el frame
 * cuando su origen es el de ese mismo servidor (`previewFrameHint` en live-preview.tsx), así que
 * lo que se aprueba y lo que se toca son el mismo sitio por construcción.
 */
const runAction = (
  action: PreviewAgentAction,
  title: string,
  ctx: Tool.Context,
): Effect.Effect<Tool.ExecuteResult<AgentMetadata>> =>
  Effect.gen(function* () {
    const directory = yield* InstanceState.directory
    const browser = action.surface === "browser"

    // El navegador integrado no depende del dev server del proyecto: tiene su propia página, su
    // propia sesión y su propio origen. Se le pregunta cuál es ANTES de tocarlo, para que el
    // permiso nombre el sitio real — pedir permiso citando el dev server y actuar sobre otra
    // página sería un aviso que miente.
    if (browser) {
      const probe = yield* Effect.promise(() => requestPreviewAction(directory, { type: "origin", surface: "browser" }))
      const origin = probe.ok ? probe.output.trim() : ""
      if (!origin) {
        return { title, output: probe.ok ? BROWSER_NO_PAGE : probe.output, metadata: { ok: false } }
      }
      yield* ctx.ask({
        permission: "browser",
        patterns: [origin],
        always: [origin],
        metadata: { origin, surface: "browser", action: action.type, target: action.target },
      })
      const result = yield* Effect.promise(() => requestPreviewAction(directory, action))
      return {
        title,
        output: result.ok ? result.output : result.output,
        metadata: { ok: result.ok, presence: previewBridgePresence(directory), origin },
      }
    }

    const state = getPreviewState(directory)
    if (!previewRunning(state)) {
      return { title, output: NOT_RUNNING, metadata: { ok: false } }
    }
    if (state.isDesktop && !state.url) {
      return { title, output: DESKTOP_NO_DOM, metadata: { ok: false } }
    }
    const origin = previewOrigin(state.url)
    if (!origin) {
      return { title, output: NO_ORIGIN, metadata: { ok: false } }
    }

    // El patrón es el origen, y `always` también: reply() apunta una regla «allow» por cada patrón
    // de `always`, así que con `*` un sí para el dev server de este proyecto sería un sí para
    // cualquier página que se abra después.
    yield* ctx.ask({
      permission: "preview",
      patterns: [origin],
      always: [origin],
      metadata: { origin, url: state.url, action: action.type, target: action.target },
    })

    const result = yield* Effect.promise(() => requestPreviewAction(directory, action))
    const presence = previewBridgePresence(directory)
    return {
      title,
      output: result.ok ? result.output : `${result.output}${bridgeHint(presence)}`,
      metadata: { ok: result.ok, presence, origin },
    }
  })

const InspectParameters = Schema.Struct({
  surface: Schema.optional(Schema.Literals(["preview", "browser"])).annotate({
    description:
      "Dónde actuar: `preview` (por defecto) es la vista previa del proyecto; `browser` es el navegador integrado de Tiancode, con la sesión del usuario. `browser` pide permiso aparte nombrando el sitio concreto.",
  }),
  target: Schema.optional(Schema.String).annotate({
    description:
      "Opcional: selector CSS o texto visible para limitar la lectura a una parte de la pantalla (por ejemplo un diálogo o un panel).",
  }),
})

const InteractParameters = Schema.Struct({
  action: Schema.Literals(["click", "fill", "select", "press", "scroll", "navigate"]).annotate({
    description: "Qué hacer sobre la página.",
  }),
  target: Schema.optional(Schema.String).annotate({
    description:
      "Elemento sobre el que actuar: referencia `e12` de preview_inspect, selector CSS o texto visible. Obligatorio salvo en `navigate` y en `scroll` sobre toda la página.",
  }),
  value: Schema.optional(Schema.String).annotate({
    description: "Texto a escribir (`fill`) o valor de la opción a elegir (`select`).",
  }),
  key: Schema.optional(Schema.String).annotate({
    description: "Tecla para `press`: Enter, Escape, Tab, ArrowDown, a…",
  }),
  url: Schema.optional(Schema.String).annotate({
    description: "Ruta o URL para `navigate`, por ejemplo `/ajustes`.",
  }),
  direction: Schema.optional(Schema.String).annotate({
    description: "Para `scroll`: up, down, top o bottom (por defecto down).",
  }),
  surface: Schema.optional(Schema.Literals(["preview", "browser"])).annotate({
    description:
      "Dónde actuar: `preview` (por defecto) es la vista previa del proyecto; `browser` es el navegador integrado de Tiancode, con la sesión del usuario. `browser` pide permiso aparte nombrando el sitio concreto.",
  }),
})

export const PreviewInspectTool = Tool.define<typeof InspectParameters, AgentMetadata, never>(
  "preview_inspect",
  Effect.succeed({
    description:
      "Lee la página que se está mostrando en la Vista en vivo (el Sandbox): URL y título reales, el texto visible, los elementos con los que se puede interactuar (botones, enlaces, campos, selectores) cada uno con una referencia estable tipo `e12`, y los errores de JavaScript de la consola. Úsala después de preview_start y después de cada cambio para comprobar con tus propios ojos que la pantalla es la que esperabas, en vez de suponerlo desde el código. Las referencias que devuelve se usan tal cual en preview_interact. Sólo llega a la vista previa del propio proyecto, no a cualquier página que el usuario tenga abierta en el panel, y el usuario aprueba el sitio antes de que leas nada: no la llames de forma especulativa. Si el resultado dice que no hay ninguna superficie disponible (build web, sin ventana abierta o el panel llevado a otra web), no repitas la acción: continúa con preview_status y preview_logs y di al usuario qué debería comprobar.",
    parameters: InspectParameters,
    execute: (args, ctx) =>
      runAction({ type: "inspect", target: args.target, surface: args.surface }, "Vista previa inspeccionada", ctx),
  }),
)

export const PreviewInteractTool = Tool.define<typeof InteractParameters, AgentMetadata, never>(
  "preview_interact",
  Effect.succeed({
    description:
      "Maneja la página de la Vista en vivo como lo haría el usuario y devuelve el estado de la pantalla después de la acción. Acciones: `click` (pulsa un botón, enlace o pestaña), `fill` (escribe en un campo), `select` (elige una opción de un desplegable), `press` (pulsa una tecla, por ejemplo Enter o Escape), `scroll` (desplaza la página o un contenedor) y `navigate` (va a otra ruta de la misma app; sólo dentro del mismo origen). `target` acepta una referencia de preview_inspect (`e12`), un selector CSS o el texto visible del elemento. Úsala para recorrer la app y verificar de verdad un flujo antes de darlo por terminado; no sustituye a preguntar al usuario por decisiones de producto. Sólo llega a la vista previa del propio proyecto, no a cualquier página que el usuario tenga abierta en el panel, y él aprueba el sitio antes de que pulses nada. Si el resultado dice que no hay ninguna superficie disponible (build web, sin ventana abierta o el panel llevado a otra web), no repitas la acción: continúa con preview_status y preview_logs y di al usuario qué debería comprobar.",
    parameters: InteractParameters,
    execute: (args, ctx) =>
      runAction(
        {
          type: args.action,
          target: args.target,
          value: args.value,
          key: args.key,
          url: args.url,
          direction: args.direction,
          surface: args.surface,
        },
        "Vista previa manejada",
        ctx,
      ),
  }),
)
