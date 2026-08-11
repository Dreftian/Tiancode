import { Effect } from "effect"
import { HttpApiBuilder } from "effect/unstable/httpapi"
import * as InstanceState from "@/effect/instance-state"
import { InstanceHttpApi } from "../api"
import { getPreviewLogs, getPreviewState, restartPreviewServer, startPreviewServer, stopPreviewServer } from "@/preview/dev-server-manager"
import type { PreviewState } from "@/preview/types"

function failed(message: string): PreviewState {
  return {
    status: "error",
    url: null,
    port: null,
    framework: null,
    packageManager: null,
    command: null,
    errors: [],
    startedAt: null,
    errorMessage: message,
  }
}

export const previewHandlers = HttpApiBuilder.group(InstanceHttpApi, "preview", (handlers) =>
  Effect.gen(function* () {
    const status = Effect.fn("PreviewHttpApi.status")(function* () {
      const directory = (yield* InstanceState.context).directory
      return getPreviewState(directory)
    })

    const start = Effect.fn("PreviewHttpApi.start")(function* () {
      const directory = (yield* InstanceState.context).directory
      return yield* Effect.tryPromise({
        try: () => startPreviewServer(directory),
        catch: (error) => new Error(String(error)),
      }).pipe(Effect.catch((error) => Effect.succeed(failed(String(error)))))
    })

    const stop = Effect.fn("PreviewHttpApi.stop")(function* () {
      const directory = (yield* InstanceState.context).directory
      return stopPreviewServer(directory)
    })

    const restart = Effect.fn("PreviewHttpApi.restart")(function* () {
      const directory = (yield* InstanceState.context).directory
      return yield* Effect.tryPromise({
        try: () => restartPreviewServer(directory),
        catch: (error) => new Error(String(error)),
      }).pipe(Effect.catch((error) => Effect.succeed(failed(String(error)))))
    })

    const logs = Effect.fn("PreviewHttpApi.logs")(function* () {
      const directory = (yield* InstanceState.context).directory
      return getPreviewLogs(directory)
    })

    return handlers
      .handle("status", status)
      .handle("start", start)
      .handle("stop", stop)
      .handle("restart", restart)
      .handle("logs", logs)
  }),
)
