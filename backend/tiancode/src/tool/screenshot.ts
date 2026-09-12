// Tool de captura de pantalla: el agente mira lo que el usuario está viendo.
//
// El servidor es un proceso Bun sin acceso a Electron, así que la captura no se hace aquí: se
// encola en el mismo puente que usan preview_inspect/preview_interact y la ejecuta el proceso
// principal de la app de escritorio (main/capture.ts). La imagen vuelve como data URL por el
// canal de texto del puente y se adjunta al resultado para que el modelo la vea.

import { Effect, Schema } from "effect"
import { InstanceState } from "@/effect/instance-state"
import * as Tool from "./tool"
import { previewBridgePresence, requestDesktopAction, type PreviewBridgePresence } from "../preview/agent-bridge"

const Parameters = Schema.Struct({
  target: Schema.Literals(["screen", "window", "area"]).annotate({
    description:
      "`screen`: la pantalla principal completa. `window`: sólo la ventana de Tiancode. `area`: un recorte de la pantalla principal, que exige `bounds`.",
  }),
  bounds: Schema.optional(
    Schema.Struct({
      x: Schema.Number,
      y: Schema.Number,
      width: Schema.Number,
      height: Schema.Number,
    }),
  ).annotate({
    description:
      "Sólo para `area`: recorte en coordenadas CSS de la pantalla principal (origen arriba a la izquierda).",
  }),
})

type ScreenshotMetadata = { ok: boolean; target: string; presence?: PreviewBridgePresence }

const PNG_PREFIX = "data:image/png;base64,"

export const ScreenshotTool = Tool.define<typeof Parameters, ScreenshotMetadata, never>(
  "screenshot",
  Effect.succeed({
    description:
      "Fotografía la pantalla del usuario y te devuelve la imagen: úsala cuando necesites ver algo que no está en el código — una app abierta, un error que el usuario describe, el resultado visual de un cambio fuera de la Vista en vivo. `target` elige qué se fotografía: `screen` (la pantalla principal entera), `window` (sólo la ventana de Tiancode) o `area` (un recorte, con `bounds`). Requiere la app de escritorio: en una sesión abierta en el navegador no hay acceso a la pantalla y la tool te lo dirá; no insistas. En macOS hace falta el permiso de grabación de pantalla del sistema, y la tool devuelve un error explicándolo en vez de una imagen en negro. En Linux con Wayland el compositor muestra un selector de pantalla en CADA captura, así que el usuario tiene que confirmar a mano cada vez: no encadenes capturas ahí.",
    parameters: Parameters,
    execute: (args, ctx) =>
      Effect.gen(function* () {
        const directory = yield* InstanceState.directory

        // Una captura muestra todo lo que haya delante, no sólo el proyecto: se pregunta antes de
        // mirar, con el patrón puesto en qué se va a fotografiar.
        //
        // `always` se limita a ese mismo objetivo, no a `*`: reply() apunta una regla «allow» por
        // cada patrón de `always`, así que con `*` aprobar para siempre una captura de la ventana
        // de Tiancode aprobaba también, en silencio, la pantalla entera del usuario.
        yield* ctx.ask({
          permission: "screenshot",
          patterns: [args.target],
          always: [args.target],
          metadata: { target: args.target, bounds: args.bounds },
        })

        const result = yield* Effect.promise(() =>
          requestDesktopAction(directory, { type: "capture", target: args.target, bounds: args.bounds }),
        )
        const presence = previewBridgePresence(directory)
        if (!result.ok || !result.output.startsWith(PNG_PREFIX)) {
          return {
            title: "Captura fallida",
            output: result.output || "Tiancode no devolvió ninguna imagen.",
            metadata: { ok: false, target: args.target, presence },
          }
        }

        return {
          title: "Captura de pantalla",
          output: `Captura de ${args.target} adjunta.`,
          metadata: { ok: true, target: args.target, presence },
          attachments: [{ type: "file" as const, mime: "image/png", url: result.output }],
        }
      }),
  }),
)
