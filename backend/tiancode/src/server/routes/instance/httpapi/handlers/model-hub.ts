import { Effect } from "effect"
import { HttpApiBuilder } from "effect/unstable/httpapi"
import { ModelHub } from "@/model-hub"
import { InstanceHttpApi } from "../api"

export const modelHubHandlers = HttpApiBuilder.group(InstanceHttpApi, "model-hub", (handlers) =>
  Effect.gen(function* () {
    const hub = yield* ModelHub.Service

    const search = Effect.fn("ModelHubHttpApi.search")(function* (ctx) {
      const models = yield* hub.search(ctx.query.query, ctx.query.limit ?? 20)
      return models.map((model) => ({
        id: model.id,
        downloads: model.downloads,
        likes: model.likes,
        pipeline_tag: model.pipeline_tag,
        quantFiles: ModelHub.parseQuantFiles(model.siblings),
      }))
    })

    const files = Effect.fn("ModelHubHttpApi.files")(function* (ctx) {
      return yield* hub.files(ctx.query.model)
    })

    const system = Effect.fn("ModelHubHttpApi.system")(function* () {
      return yield* hub.system()
    })

    const downloads = Effect.fn("ModelHubHttpApi.downloads")(function* () {
      return yield* hub.downloads()
    })

    const download = Effect.fn("ModelHubHttpApi.download")(function* (ctx) {
      return yield* hub.download(ctx.payload.model, ctx.payload.file)
    })

    return handlers
      .handle("search", search)
      .handle("files", files)
      .handle("system", system)
      .handle("downloads", downloads)
      .handle("download", download)
  }),
)
