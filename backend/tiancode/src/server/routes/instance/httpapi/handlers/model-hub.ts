import { Effect } from "effect"
import { HttpApiBuilder } from "effect/unstable/httpapi"
import { ModelHub } from "@/model-hub"
import { InstanceHttpApi } from "../api"

export const modelHubHandlers = HttpApiBuilder.group(InstanceHttpApi, "model-hub", (handlers) =>
  Effect.gen(function* () {
    const hub = yield* ModelHub.Service

    const search = Effect.fn("ModelHubHttpApi.search")(function* (ctx) {
      const models = yield* hub.search(ctx.query.query, ctx.query.limit ?? 20)
      // Attach the per-quant fit estimation using this machine's memory so
      // the model list can badge the best variant without a second probe.
      const { ram, vram } = yield* hub.system()
      return models.map((model) => ({
        id: model.id,
        downloads: model.downloads,
        likes: model.likes,
        pipeline_tag: model.pipeline_tag,
        quantFiles: ModelHub.parseQuantFiles(model.siblings).map((file) => ({
          ...file,
          fit: ModelHub.fitFor(file.size, ram, vram),
        })),
      }))
    })

    const files = Effect.fn("ModelHubHttpApi.files")(function* (ctx) {
      return yield* hub.files(ctx.query.model)
    })

    const system = Effect.fn("ModelHubHttpApi.system")(function* () {
      return yield* hub.system()
    })

    const runtimes = Effect.fn("ModelHubHttpApi.runtimes")(function* () {
      return yield* hub.runtimes()
    })

    const downloads = Effect.fn("ModelHubHttpApi.downloads")(function* () {
      return yield* hub.downloads()
    })

    const download = Effect.fn("ModelHubHttpApi.download")(function* (ctx) {
      return yield* hub.download(ctx.payload.model, ctx.payload.file)
    })

    const cancel = Effect.fn("ModelHubHttpApi.cancel")(function* (ctx) {
      return yield* hub.cancelDownload(ctx.params.id)
    })

    return handlers
      .handle("search", search)
      .handle("files", files)
      .handle("system", system)
      .handle("runtimes", runtimes)
      .handle("downloads", downloads)
      .handle("download", download)
      .handle("cancel", cancel)
  }),
)
