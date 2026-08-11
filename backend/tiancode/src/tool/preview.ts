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
import type { PreviewState } from "../preview/types"

function describe(state: PreviewState) {
  return JSON.stringify(state, null, 2)
}

const NoArgs = Schema.Struct({})

// El servidor tarda unos segundos en arrancar: espera breve de readiness para
// que el agente reciba la URL en el mismo resultado de la tool.
function waitForReady(directory: string) {
  return new Promise<void>((resolve) => {
    let waited = 0
    const timer = setInterval(() => {
      waited += 500
      if (getPreviewState(directory).status !== "starting" || waited >= 10000) {
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
      "Detecta el proyecto web del workspace (Vite, Next, etc.) y arranca su servidor de desarrollo. Espera hasta que el servidor esté listo y devuelve su URL y puerto. Usa preview_status para leer los errores de compilación.",
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
