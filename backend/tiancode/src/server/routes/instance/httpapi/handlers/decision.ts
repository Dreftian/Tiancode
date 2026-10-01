import { Effect, Option } from "effect"
import { HttpApiBuilder } from "effect/unstable/httpapi"
import { DecisionEngine } from "@/decision/engine"
import { DecisionPresets } from "@/decision/presets"
import { RootHttpApi } from "../api"

export const decisionHandlers = HttpApiBuilder.group(RootHttpApi, "decision", (handlers) =>
  Effect.gen(function* () {
    const engine = yield* DecisionEngine.Service
    const describe = (status: DecisionEngine.Status) => ({
      ...status,
      model: DecisionEngine.MODEL.name,
      base: DecisionEngine.MODEL.base,
    })

    const status = Effect.fn("DecisionHttpApi.status")(function* () {
      return describe(yield* engine.status())
    })

    const install = Effect.fn("DecisionHttpApi.install")(function* () {
      return describe(yield* engine.install())
    })

    const cancel = Effect.fn("DecisionHttpApi.cancel")(function* () {
      return describe(yield* engine.cancel())
    })

    const remove = Effect.fn("DecisionHttpApi.remove")(function* () {
      return describe(yield* engine.remove())
    })

    const classify = Effect.fn("DecisionHttpApi.classify")(function* (ctx: {
      payload: { preset: DecisionPresets.Name; text: string; timeoutMs?: number }
    }) {
      const answer = yield* engine.decide(
        ctx.payload.text,
        DecisionPresets.all[ctx.payload.preset],
        ctx.payload.timeoutMs ?? 5000,
      )
      return Option.getOrNull(answer)
    })

    return handlers
      .handle("decisionStatus", status)
      .handle("decisionInstall", install)
      .handle("decisionCancel", cancel)
      .handle("decisionRemove", remove)
      .handle("decisionClassify", classify)
  }),
)
