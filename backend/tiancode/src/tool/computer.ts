// Tool de uso del computador: el agente mueve el ratón y teclea en el PC del usuario.
//
// Como la captura y el portapapeles, el servidor no puede hacerlo: es un proceso Bun sin acceso
// al escritorio. La acción viaja por el puente de la Vista en vivo y la ejecuta el proceso
// principal de Electron (frontend/desktop/src/main/computer-use.ts) contra user32 de Windows.
//
// Aquí hay UN control: el permiso, y limitado a la operación pedida. Los demás — ventana elevada,
// lista de apps autorizadas por el usuario, gestores de contraseñas, indicador visible y parada —
// viven en el proceso principal, donde el modelo no llega. Un control que dependiera del prompt
// no sería un control.

import { Effect, Schema } from "effect"
import { InstanceState } from "@/effect/instance-state"
import * as Tool from "./tool"
import {
  previewBridgePresence,
  requestDesktopAction,
  type DesktopAgentAction,
  type PreviewBridgePresence,
} from "../preview/agent-bridge"

const Parameters = Schema.Struct({
  action: Schema.Literals(["move", "click", "type", "key", "scroll", "cursor_position", "foreground_window"]).annotate(
    {
      description:
        "`move` lleva el cursor a (x, y). `click` pulsa donde diga (x, y) o donde esté el cursor. `type` escribe `text`. `key` manda el acorde `keys`. `scroll` gira la rueda. `cursor_position` y `foreground_window` sólo leen y no tocan nada.",
    },
  ),
  x: Schema.optional(Schema.Number).annotate({
    description:
      "Píxeles físicos de la pantalla, origen arriba a la izquierda. Obligatorio en `move`, opcional en `click`.",
  }),
  y: Schema.optional(Schema.Number).annotate({ description: "Píxeles físicos de la pantalla, hacia abajo." }),
  button: Schema.optional(Schema.Literals(["left", "right", "middle"])).annotate({
    description: "Botón del ratón para `click`. Por defecto `left`.",
  }),
  double: Schema.optional(Schema.Boolean).annotate({ description: "`click` doble." }),
  text: Schema.optional(Schema.String).annotate({
    description:
      "Texto a escribir en `type`, máximo 2000 caracteres. Va por Unicode, así que los acentos y los símbolos no dependen de la distribución del teclado. `\\n` pulsa Intro y `\\t` tabula.",
  }),
  keys: Schema.optional(Schema.String).annotate({
    description:
      'Acorde para `key`: "enter", "f5", "ctrl+s", "ctrl+shift+p", "alt+left". Modificadores: ctrl, shift, alt, win.',
  }),
  direction: Schema.optional(Schema.Literals(["up", "down", "left", "right"])).annotate({
    description: "Sentido del `scroll`.",
  }),
  amount: Schema.optional(Schema.Number).annotate({
    description: "Muescas de rueda del `scroll`, de 1 a 10. Por defecto 3.",
  }),
})

type ComputerMetadata = { ok: boolean; action: string; presence?: PreviewBridgePresence }

const UNSUPPORTED_PLATFORM =
  "El uso del computador sólo está implementado en Windows. En macOS haría falta el permiso de Accesibilidad del sistema y otro backend; en Linux depende de X11 o Wayland. No repitas la acción aquí: dile al usuario qué tendría que hacer él a mano."

export const ComputerTool = Tool.define<typeof Parameters, ComputerMetadata, never>(
  "computer",
  Effect.succeed({
    description:
      "Controla el ordenador del usuario: mueve el ratón, hace clic, escribe y pulsa teclas en la aplicación que tenga delante. Úsala cuando lo que hay que hacer no está en el código ni en la Vista en vivo, sino en otra app del escritorio. SÓLO WINDOWS en esta versión: en macOS y en Linux la tool te lo dirá y no debes insistir. Requiere la app de escritorio; en una sesión abierta en el navegador no hay escritorio al que llegar. Trabaja siempre así: `screenshot` para ver, esta tool para actuar, `screenshot` otra vez para comprobar — nunca encadenes clics a ciegas. Las coordenadas son píxeles físicos de la pantalla; si la captura que estás mirando venía reducida, escálalas (`cursor_position` te devuelve el tamaño real de la pantalla principal). La primera acción de cada sesión abre un diálogo en el que el usuario autoriza UNA aplicación por su nombre, y el control caduca solo; si el usuario lo detiene, para y pregúntale. Tiancode rechaza actuar sobre ventanas que corren como administrador (Windows descartaría la entrada en silencio), sobre su propia ventana y sobre gestores de contraseñas. Eso último NO es una garantía de que no escribirás una contraseña: no se puede ver el contenido de otra aplicación, así que no teclees credenciales ni las pidas.",
    parameters: Parameters,
    execute: (args, ctx) =>
      Effect.gen(function* () {
        const directory = yield* InstanceState.directory

        // Antes del permiso: pedirle al usuario que autorice algo que esta máquina no sabe hacer
        // sería gastarle una decisión.
        if (process.platform !== "win32") {
          return {
            title: "Uso del computador",
            output: UNSUPPORTED_PLATFORM,
            metadata: { ok: false, action: args.action },
          }
        }

        const missing = missingArgument(args)
        if (missing) {
          return {
            title: "Uso del computador",
            output: missing,
            metadata: { ok: false, action: args.action },
          }
        }

        // `always` se limita a la operación pedida, no a `*`: aprobar para siempre un `scroll` no
        // puede convertirse en aprobar para siempre que se escriba con el teclado.
        yield* ctx.ask({
          permission: "computer",
          patterns: [args.action],
          always: [args.action],
          metadata: {
            action: args.action,
            x: args.x,
            y: args.y,
            button: args.button,
            keys: args.keys,
            length: args.text?.length,
          },
        })

        // El puente tipa `type` con las acciones que ya conocía; "computer" todavía no está en
        // DesktopActionType (backend/tiancode/src/preview/agent-bridge.ts), que este cambio no
        // toca. El campo sí viaja: lo lleva PreviewAgentActionSchema.
        const action = {
          type: "computer",
          computer: {
            action: args.action,
            x: args.x,
            y: args.y,
            button: args.button,
            double: args.double,
            text: args.text,
            keys: args.keys,
            direction: args.direction,
            amount: args.amount,
          },
        } as unknown as DesktopAgentAction

        const result = yield* Effect.promise(() => requestDesktopAction(directory, action))
        const presence = previewBridgePresence(directory)
        if (!result.ok) {
          return {
            title: "Uso del computador",
            output: result.output,
            metadata: { ok: false, action: args.action, presence },
          }
        }

        return {
          title: titleFor(args.action),
          output: result.output,
          metadata: { ok: true, action: args.action, presence },
        }
      }),
  }),
)

/** Lo que falta se dice antes de molestar al usuario con el permiso. */
function missingArgument(args: { action: string; x?: number; y?: number; text?: string; keys?: string; direction?: string }) {
  if (args.action === "move" && (args.x === undefined || args.y === undefined)) {
    return "Falta la posición: `move` necesita `x` e `y` en píxeles de pantalla."
  }
  if (args.action === "type" && !args.text) return "Falta `text`: `type` necesita el texto que hay que escribir."
  if (args.action === "key" && !args.keys) return 'Falta `keys`: por ejemplo "ctrl+s" o "enter".'
  if (args.action === "scroll" && !args.direction) return "Falta `direction`: up, down, left o right."
  return undefined
}

function titleFor(action: string) {
  if (action === "cursor_position") return "Posición del cursor"
  if (action === "foreground_window") return "Ventana en primer plano"
  return "Uso del computador"
}
