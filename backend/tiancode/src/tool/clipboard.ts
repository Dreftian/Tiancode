// Tool del portapapeles del sistema.
//
// Como la captura de pantalla, el servidor no puede tocarlo: viaja por el puente de la Vista en
// vivo y lo ejecuta el proceso principal de Electron (`read-clipboard-text` / `write-clipboard-text`).
//
// El permiso `clipboard` se queda en el «ask» por defecto y el panel de ajustes no ofrece
// aprobarlo por adelantado: el portapapeles del usuario contiene contraseñas y tokens con total
// normalidad, así que sólo él puede decidir, delante de cada llamada, si el agente lo ve.

import { Effect, Schema } from "effect"
import { InstanceState } from "@/effect/instance-state"
import * as Tool from "./tool"
import { previewBridgePresence, requestDesktopAction, type PreviewBridgePresence } from "../preview/agent-bridge"

const Parameters = Schema.Struct({
  action: Schema.Literals(["read", "write"]).annotate({
    description: "`read` devuelve el texto del portapapeles; `write` lo reemplaza por `text`.",
  }),
  text: Schema.optional(Schema.String).annotate({
    description: "Texto a copiar. Obligatorio en `write`, se ignora en `read`.",
  }),
})

type ClipboardMetadata = { ok: boolean; action: string; presence?: PreviewBridgePresence }

export const ClipboardTool = Tool.define<typeof Parameters, ClipboardMetadata, never>(
  "clipboard",
  Effect.succeed({
    description:
      "Lee el texto del portapapeles del sistema o lo reemplaza. Úsala cuando el usuario dice «lo tengo copiado» en vez de pedirle que lo pegue, o para dejarle un comando o un fragmento listo para pegar. Requiere la app de escritorio: en una sesión abierta en el navegador no hay portapapeles del sistema y la tool te lo dirá. El usuario confirma cada lectura y cada escritura por separado, porque el portapapeles suele contener contraseñas: no la llames de forma especulativa ni repitas la lectura para «comprobar».",
    parameters: Parameters,
    execute: (args, ctx) =>
      Effect.gen(function* () {
        const directory = yield* InstanceState.directory

        if (args.action === "write" && args.text === undefined) {
          return {
            title: "Portapapeles",
            output: "Falta `text`: `write` necesita el texto que se va a copiar.",
            metadata: { ok: false, action: args.action },
          }
        }

        // `always` se limita a la operación pedida, no a `*`: aprobar para siempre una escritura
        // no puede convertirse en aprobar para siempre la lectura de contraseñas.
        yield* ctx.ask({
          permission: "clipboard",
          patterns: [args.action],
          always: [args.action],
          metadata: { action: args.action, length: args.text?.length },
        })

        const result = yield* Effect.promise(() =>
          requestDesktopAction(
            directory,
            args.action === "read" ? { type: "clipboard_read" } : { type: "clipboard_write", value: args.text },
          ),
        )
        const presence = previewBridgePresence(directory)
        if (!result.ok) {
          return {
            title: "Portapapeles",
            output: result.output,
            metadata: { ok: false, action: args.action, presence },
          }
        }

        return {
          title: args.action === "read" ? "Portapapeles leído" : "Portapapeles actualizado",
          output:
            args.action === "read" ? result.output || "El portapapeles está vacío." : "Texto copiado al portapapeles.",
          metadata: { ok: true, action: args.action, presence },
        }
      }),
  }),
)
