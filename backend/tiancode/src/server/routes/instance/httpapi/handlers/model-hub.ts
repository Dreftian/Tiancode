import { Effect } from "effect"
import { HttpApiBuilder } from "effect/unstable/httpapi"
import { ModelHub } from "@/model-hub"
import { LocalEngine } from "@/local-engine"
import { InstanceHttpApi } from "../api"

export const modelHubHandlers = HttpApiBuilder.group(InstanceHttpApi, "model-hub", (handlers) =>
  Effect.gen(function* () {
    const hub = yield* ModelHub.Service
    const engine = yield* LocalEngine.Service

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
      const list = yield* hub.runtimes()
      const engStatus = yield* engine.status()
      // Include Tiancode Native Engine at the top of the runtimes list
      const nativeEngine = {
        id: "local",
        name: "Tiancode Native Engine (llama.cpp)",
        available: engStatus.status === "running" || engStatus.binaryReady,
        version: engStatus.status === "running" ? `v${engStatus.port} (Activo)` : "Listo",
        models: engStatus.modelName ? [engStatus.modelName] : [],
      }
      return [nativeEngine, ...list]
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

    const getEngineStatus = Effect.fn("ModelHubHttpApi.engine")(function* () {
      return yield* engine.status()
    })

    const startEngine = Effect.fn("ModelHubHttpApi.engineStart")(function* (ctx) {
      return yield* engine.start({
        model: ctx.payload.model,
        file: ctx.payload.file,
        gpuLayers: ctx.payload.gpuLayers,
        contextSize: ctx.payload.contextSize,
        port: ctx.payload.port,
      })
    })

    const stopEngine = Effect.fn("ModelHubHttpApi.engineStop")(function* () {
      return yield* engine.stop()
    })

    return handlers
      .handle("search", search)
      .handle("files", files)
      .handle("system", system)
      .handle("runtimes", runtimes)
      .handle("downloads", downloads)
      .handle("download", download)
      .handle("cancel", cancel)
      .handle("engine", getEngineStatus)
      .handle("engineStart", startEngine)
      .handle("engineStop", stopEngine)
  }),
)
