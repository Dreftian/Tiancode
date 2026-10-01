import path from "node:path"
import { Effect } from "effect"
import { HttpApiBuilder } from "effect/unstable/httpapi"
import { Config } from "@/config/config"
import { InstanceState } from "@/effect/instance-state"
import { markInstanceForDisposal } from "../lifecycle"
import { ModelHub } from "@/model-hub"
import { LocalEngine } from "@/local-engine"
import { InstanceHttpApi } from "../api"

export const modelHubHandlers = HttpApiBuilder.group(InstanceHttpApi, "model-hub", (handlers) =>
  Effect.gen(function* () {
    const hub = yield* ModelHub.Service
    const engine = yield* LocalEngine.Service
    const config = yield* Config.Service

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
        version: engStatus.status,
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

    // The removal counterpart of `download`. It has to live on the server because
    // the config update endpoints deep-merge: a patch cannot delete a key.
    const forget = Effect.fn("ModelHubHttpApi.forget")(function* (ctx) {
      const removed = yield* config.forgetProviderModel({
        file: ctx.payload.file,
        model: ctx.payload.model,
        engineProvider: "local",
      })
      // Done after the config surgery so a failure to tidy disk cannot leave the
      // registry pointing at a model that is no longer there — and only when the
      // forget actually removed something. pruneEmptyDirs walks every models root
      // and rmdir's what it finds empty; running it after a forget that matched
      // nothing (a stale file name, or the httpapi exercise's deliberate miss) is
      // a delete with no cause behind it.
      const directories = ModelHub.forgetRemovedSomething(removed)
        ? yield* hub.pruneEmptyDirs()
        : ([] as readonly string[])
      return { ...removed, directories }
    })

    const getEngineStatus = Effect.fn("ModelHubHttpApi.engine")(function* () {
      return yield* engine.status()
    })

    const startEngine = Effect.fn("ModelHubHttpApi.engineStart")(function* (ctx) {
      const manual = {
        model: ctx.payload.model,
        file: ctx.payload.file,
        gpuLayers: ctx.payload.gpuLayers,
        contextSize: ctx.payload.contextSize,
        port: ctx.payload.port,
        batchSize: ctx.payload.batchSize,
        flashAttention: ctx.payload.flashAttention,
        kvCacheType: ctx.payload.kvCacheType,
        keepInMemory: ctx.payload.keepInMemory,
        useMmap: ctx.payload.useMmap,
        seed: ctx.payload.seed,
        threads: ctx.payload.threads,
        ropeFrequencyBase: ctx.payload.ropeFrequencyBase,
        ropeFrequencyScale: ctx.payload.ropeFrequencyScale,
        kvOffload: ctx.payload.kvOffload,
        parallel: ctx.payload.parallel,
        vramBudget: ctx.payload.vramBudget,
        ramBudget: ctx.payload.ramBudget,
        cpuBudget: ctx.payload.cpuBudget,
        placement: ctx.payload.placement,
        idleUnloadMinutes: ctx.payload.idleUnloadMinutes,
        ubatchSize: ctx.payload.ubatchSize,
        threadsBatch: ctx.payload.threadsBatch,
        nCpuMoe: ctx.payload.nCpuMoe,
        loadTimeoutMinutes: ctx.payload.loadTimeoutMinutes,
      }
      // The engine merges the saved defaults and, with `auto`, the per-model recommendation.
      return yield* engine.start({ ...manual, auto: ctx.payload.auto })
    })

    const engineDefaults = Effect.fn("ModelHubHttpApi.engineDefaults")(function* () {
      return yield* engine.loadDefaults()
    })

    // No instance reload here: Settings saves on every change, and a reload cancels the sessions
    // running in the project. The light mode is read on each request; a new context size applies
    // the next time the model loads.
    const engineDefaultsSet = Effect.fn("ModelHubHttpApi.engineDefaultsSet")(function* (ctx) {
      return yield* engine.setLoadDefaults(ctx.payload)
    })

    const engineLogs = Effect.fn("ModelHubHttpApi.engineLogs")(function* () {
      return { lines: [...(yield* engine.logs())] }
    })

    const deleteLocal = Effect.fn("ModelHubHttpApi.deleteLocal")(function* (ctx) {
      const target = path.resolve(ctx.payload.path)
      const status = yield* engine.status()
      const serving =
        status.modelPath !== undefined &&
        (process.platform === "win32"
          ? path.resolve(status.modelPath).toLowerCase() === target.toLowerCase()
          : path.resolve(status.modelPath) === target)
      // Only the engine that holds this file stops (Windows keeps a loaded file locked).
      if (serving) yield* engine.stop()
      const deleted = yield* hub.deleteLocal(target)
      if (deleted) yield* markInstanceForDisposal(yield* InstanceState.context)
      return { deleted, stopped: serving }
    })

    const local = Effect.fn("ModelHubHttpApi.local")(function* () {
      return yield* hub.listLocal()
    })

    const estimate = Effect.fn("ModelHubHttpApi.estimate")(function* (ctx) {
      return yield* hub.estimate(ctx.query.model, ctx.query.file)
    })

    // A new folder brings other models: the provider re-discovers them on the next request.
    const setDir = Effect.fn("ModelHubHttpApi.setDir")(function* (ctx) {
      const system = yield* hub.setDir(ctx.payload.dir)
      yield* markInstanceForDisposal(yield* InstanceState.context)
      return system
    })

    const stopEngine = Effect.fn("ModelHubHttpApi.engineStop")(function* () {
      return yield* engine.stop()
    })

    return handlers
      .handle("search", search)
      .handle("files", files)
      .handle("system", system)
      .handle("local", local)
      .handle("setDir", setDir)
      .handle("estimate", estimate)
      .handle("runtimes", runtimes)
      .handle("downloads", downloads)
      .handle("download", download)
      .handle("cancel", cancel)
      .handle("deleteLocal", deleteLocal)
      .handle("engineLogs", engineLogs)
      .handle("forget", forget)
      .handle("engine", getEngineStatus)
      .handle("engineStart", startEngine)
      .handle("engineDefaults", engineDefaults)
      .handle("engineDefaultsSet", engineDefaultsSet)
      .handle("engineStop", stopEngine)
  }),
)
