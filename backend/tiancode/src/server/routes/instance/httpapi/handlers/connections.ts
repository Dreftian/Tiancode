import { Effect } from "effect"
import { HttpApiBuilder } from "effect/unstable/httpapi"
import { Connections } from "@/connections/connections"
import { RootHttpApi } from "../api"

export const connectionsHandlers = HttpApiBuilder.group(RootHttpApi, "connections", (handlers) =>
  Effect.gen(function* () {
    const connections = yield* Connections.Service

    const list = Effect.fn("ConnectionsHttpApi.list")(function* () {
      return { data: yield* connections.list() }
    })

    const update = Effect.fn("ConnectionsHttpApi.update")(function* (ctx: {
      params: { provider: Connections.Provider }
      payload: { settings?: Record<string, unknown>; secret?: string }
    }) {
      return yield* connections.configure(ctx.params.provider, ctx.payload)
    })

    const remove = Effect.fn("ConnectionsHttpApi.remove")(function* (ctx: {
      params: { provider: Connections.Provider }
    }) {
      return yield* connections.remove(ctx.params.provider)
    })

    const test = Effect.fn("ConnectionsHttpApi.test")(function* (ctx: { params: { provider: Connections.Provider } }) {
      return yield* connections.test(ctx.params.provider)
    })

    return handlers
      .handle("connectionsList", list)
      .handle("connectionsUpdate", update)
      .handle("connectionsRemove", remove)
      .handle("connectionsTest", test)
  }),
)
