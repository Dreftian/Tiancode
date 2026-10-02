import { Config } from "@/config/config"
import { Provider } from "@/provider/provider"
import * as InstanceState from "@/effect/instance-state"
import { Effect } from "effect"
import { HttpApiBuilder } from "effect/unstable/httpapi"
import { InstanceHttpApi } from "../api"
import { markInstanceForDisposal } from "../lifecycle"
import { redactConfigInfo, unredactConfigInfo } from "@/server/redact-config"

export const configHandlers = HttpApiBuilder.group(InstanceHttpApi, "config", (handlers) =>
  Effect.gen(function* () {
    const providerSvc = yield* Provider.Service
    const configSvc = yield* Config.Service

    const get = Effect.fn("ConfigHttpApi.get")(function* () {
      // Los secretos nunca salen por HTTP: /config y /global/config son
      // legibles por el renderer y por cualquier origen con CORS permitido.
      return redactConfigInfo(yield* configSvc.get())
    })

    const update = Effect.fn("ConfigHttpApi.update")(function* (ctx) {
      // El formulario viene de un GET redactado: los placeholders se
      // restauran contra la config real antes del merge.
      yield* configSvc.update(unredactConfigInfo(ctx.payload, yield* configSvc.get()))
      yield* markInstanceForDisposal(yield* InstanceState.context)
      return ctx.payload
    })

    const resetAgent = Effect.fn("ConfigHttpApi.resetAgent")(function* (ctx: {
      params: { name: string }
      query: { fields?: string }
    }) {
      const changed = yield* configSvc.resetAgent(ctx.params.name, "project", splitFields(ctx.query.fields))
      if (changed) yield* markInstanceForDisposal(yield* InstanceState.context)
      return changed
    })

    const providers = Effect.fn("ConfigHttpApi.providers")(function* () {
      const providers = yield* providerSvc.list()
      return {
        providers: Object.values(providers).map(Provider.toPublicInfo),
        default: Provider.defaultModelIDs(providers),
      }
    })

    return handlers
      .handle("get", get)
      .handle("update", update)
      .handle("resetAgent", resetAgent)
      .handle("providers", providers)
  }),
)

// "model,permission.bash" → ["model", "permission.bash"]; undefined resets the whole entry.
export function splitFields(fields: string | undefined) {
  const list = (fields ?? "").split(",").map((field) => field.trim()).filter(Boolean)
  return list.length > 0 ? list : undefined
}
