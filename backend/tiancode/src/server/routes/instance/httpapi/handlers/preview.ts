import { Effect, Option } from "effect"
import { HttpApiBuilder } from "effect/unstable/httpapi"
import * as InstanceState from "@/effect/instance-state"
import { InstanceHttpApi } from "../api"
import { WorkspaceRouteContext } from "../middleware/workspace-routing"
import { detectPreviewState, getPreviewLogs, getPreviewState, restartPreviewServer, startPreviewServer, stopPreviewServer } from "@/preview/dev-server-manager"
import { settlePreviewCommand, takePreviewCommands } from "@/preview/agent-bridge"
import type { PreviewState } from "@/preview/types"
import { IDLE_BUILD } from "@/preview/types"

/** Tope del long-poll: por debajo del timeout habitual de un proxy y de la tool del agente. */
const AGENT_POLL_MAX_MS = 20_000

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
    build: { ...IDLE_BUILD },
  }
}

export const previewHandlers = HttpApiBuilder.group(InstanceHttpApi, "preview", (handlers) =>
  Effect.gen(function* () {
    const resolveDirectory = Effect.gen(function* () {
      const route = yield* Effect.serviceOption(WorkspaceRouteContext)
      const raw = Option.isSome(route) && route.value.directory
        ? route.value.directory
        : (yield* InstanceState.context).directory
      try {
        return decodeURIComponent(raw)
      } catch {
        return raw
      }
    })

    const status = Effect.fn("PreviewHttpApi.status")(function* () {
      const directory = yield* resolveDirectory
      return yield* Effect.tryPromise({
        try: () => detectPreviewState(directory),
        catch: (error) => new Error(String(error)),
      }).pipe(Effect.catch((error) => Effect.succeed(failed(String(error)))))
    })

    const start = Effect.fn("PreviewHttpApi.start")(function* () {
      const directory = yield* resolveDirectory
      return yield* Effect.tryPromise({
        try: () => startPreviewServer(directory),
        catch: (error) => new Error(String(error)),
      }).pipe(Effect.catch((error) => Effect.succeed(failed(String(error)))))
    })

    const stop = Effect.fn("PreviewHttpApi.stop")(function* () {
      const directory = yield* resolveDirectory
      return stopPreviewServer(directory)
    })

    const restart = Effect.fn("PreviewHttpApi.restart")(function* () {
      const directory = yield* resolveDirectory
      return yield* Effect.tryPromise({
        try: () => restartPreviewServer(directory),
        catch: (error) => new Error(String(error)),
      }).pipe(Effect.catch((error) => Effect.succeed(failed(String(error)))))
    })

    const logs = Effect.fn("PreviewHttpApi.logs")(function* () {
      const directory = yield* resolveDirectory
      return getPreviewLogs(directory)
    })

    const agentPending = Effect.fn("PreviewHttpApi.agentPending")(function* (ctx: {
      readonly query: { readonly wait?: string | undefined }
    }) {
      const directory = yield* resolveDirectory
      const requested = Number.parseInt(ctx.query.wait ?? "", 10)
      const wait = Number.isFinite(requested) ? Math.min(Math.max(requested, 0), AGENT_POLL_MAX_MS) : AGENT_POLL_MAX_MS
      return yield* Effect.promise(() => takePreviewCommands(directory, wait))
    })

    const agentResult = Effect.fn("PreviewHttpApi.agentResult")(function* (ctx: {
      readonly payload: { readonly id: string; readonly ok: boolean; readonly output: string }
    }) {
      const directory = yield* resolveDirectory
      settlePreviewCommand(directory, {
        id: ctx.payload.id,
        ok: ctx.payload.ok,
        output: ctx.payload.output,
      })
      return { ok: true }
    })

    return handlers
      .handle("status", status)
      .handle("start", start)
      .handle("stop", stop)
      .handle("restart", restart)
      .handle("logs", logs)
      .handle("agentPending", agentPending)
      .handle("agentResult", agentResult)
  }),
)
