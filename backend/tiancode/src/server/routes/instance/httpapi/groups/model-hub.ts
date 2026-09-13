import { Schema } from "effect"
import { HttpApi, HttpApiEndpoint, HttpApiGroup, OpenApi } from "effect/unstable/httpapi"
import { Authorization } from "../middleware/authorization"
import { InstanceContextMiddleware } from "../middleware/instance-context"
import {
  WorkspaceRoutingMiddleware,
  WorkspaceRoutingQuery,
  WorkspaceRoutingQueryFields,
} from "../middleware/workspace-routing"
import { described } from "./metadata"

export const ModelSearchQuery = Schema.Struct({
  ...WorkspaceRoutingQueryFields,
  query: Schema.String,
  limit: Schema.optional(Schema.NumberFromString.pipe(Schema.decodeTo(Schema.Int))),
})

export const ModelFilesQuery = Schema.Struct({
  ...WorkspaceRoutingQueryFields,
  model: Schema.String,
})

export const ModelDownloadInput = Schema.Struct({
  model: Schema.String,
  file: Schema.String,
})

// Deleting a local model is not an update: config.update/updateGlobal deep-merge,
// so a models map with the key omitted is a no-op. This endpoint is the removal
// path, and it reports what it actually removed so the UI does not have to guess.
export const ModelForgetInput = Schema.Struct({
  model: Schema.optional(Schema.String),
  file: Schema.String,
})

export const ModelForgetResult = Schema.Struct({
  /** Removed model references, as `providerID/modelKey`. */
  models: Schema.Array(Schema.String),
  /** Provider ids whose entire entry was removed for having no models left. */
  providers: Schema.Array(Schema.String),
  /** Config files actually rewritten (project and/or global). */
  files: Schema.Array(Schema.String),
  /** Empty model directories removed from disk. */
  directories: Schema.Array(Schema.String),
  clearedDefaultModel: Schema.Boolean,
  clearedSmallModel: Schema.Boolean,
})

// LM Studio-style fit estimation attached to each quant file: the tier drives
// the badge color while the label is the human-readable title.
export const ModelFitInfo = Schema.Struct({
  tier: Schema.Literals(["full_gpu", "partial_gpu", "ram_only", "no_fit"]),
  label: Schema.String,
})

export const ModelQuantFile = Schema.Struct({
  file: Schema.String,
  quant: Schema.optional(Schema.String),
  size: Schema.optional(Schema.Number),
  // HuggingFace LFS oid — the sha256 used to verify downloads.
  sha256: Schema.optional(Schema.String),
  fit: Schema.optional(ModelFitInfo),
  recommended: Schema.optional(Schema.Boolean),
})

// A persisted download job. The legacy fields (model, dest, total, received,
// done) are derived from the canonical job so the endpoint stays backward
// compatible with the existing UI polling.
export const ModelDownloadJob = Schema.Struct({
  id: Schema.String,
  model: Schema.String,
  owner: Schema.String,
  repo: Schema.String,
  file: Schema.String,
  url: Schema.String,
  sizeBytes: Schema.optional(Schema.Number),
  sha256: Schema.optional(Schema.String),
  downloadedBytes: Schema.Number,
  status: Schema.Literals(["downloading", "paused", "completed", "failed"]),
  tempPath: Schema.String,
  destPath: Schema.String,
  startedAt: Schema.Number,
  completedAt: Schema.optional(Schema.Number),
  error: Schema.optional(Schema.String),
  dest: Schema.String,
  total: Schema.Number,
  received: Schema.Number,
  done: Schema.Boolean,
  speedBytesPerSec: Schema.optional(Schema.Number),
  percent: Schema.optional(Schema.Number),
  remainingBytes: Schema.optional(Schema.Number),
  etaSeconds: Schema.optional(Schema.Number),
})

export const ModelRuntimeInfo = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  available: Schema.Boolean,
  version: Schema.optional(Schema.String),
  models: Schema.optional(Schema.Array(Schema.String)),
})

export const ModelEngineStatus = Schema.Struct({
  status: Schema.Literals(["stopped", "starting", "running", "error"]),
  port: Schema.Number,
  modelPath: Schema.optional(Schema.String),
  modelName: Schema.optional(Schema.String),
  binaryReady: Schema.Boolean,
  binaryDownloading: Schema.Boolean,
  downloadProgress: Schema.optional(Schema.Number),
  error: Schema.optional(Schema.String),
  gpuLayers: Schema.optional(Schema.Number),
  contextSize: Schema.optional(Schema.Number),
})

export const ModelEngineStartInput = Schema.Struct({
  model: Schema.String,
  file: Schema.String,
  gpuLayers: Schema.optional(Schema.Number),
  contextSize: Schema.optional(Schema.Number),
  port: Schema.optional(Schema.Number),
})

export const ModelHubApi = HttpApi.make("model-hub")
  .add(
    HttpApiGroup.make("model-hub")
      .add(
        HttpApiEndpoint.get("search", "/models/search", {
          query: ModelSearchQuery,
          success: described(
            Schema.Array(
              Schema.Struct({
                id: Schema.String,
                downloads: Schema.optional(Schema.Number),
                likes: Schema.optional(Schema.Number),
                pipeline_tag: Schema.optional(Schema.String),
                quantFiles: Schema.Array(ModelQuantFile),
              }),
            ),
            "HuggingFace GGUF models",
          ),
        }).annotateMerge(
          OpenApi.annotations({
            identifier: "modelhub.search",
            summary: "Search GGUF models",
            description: "Search HuggingFace for GGUF models compatible with local inference.",
          }),
        ),
        HttpApiEndpoint.get("files", "/models/files", {
          query: ModelFilesQuery,
          success: described(
            Schema.Array(ModelQuantFile),
            "GGUF files of a model",
          ),
        }).annotateMerge(
          OpenApi.annotations({
            identifier: "modelhub.files",
            summary: "List model GGUF files",
            description:
              "List the GGUF files of a HuggingFace model with exact sizes, sha256, per-quant fit estimation and the recommended variant.",
          }),
        ),
        HttpApiEndpoint.get("system", "/models/system", {
          query: WorkspaceRoutingQuery,
          success: described(
            Schema.Struct({
              ram: Schema.Number,
              diskFree: Schema.Number,
              cpu: Schema.optional(Schema.String),
              gpu: Schema.optional(Schema.String),
              vram: Schema.optional(
                Schema.Struct({
                  total: Schema.Number,
                  free: Schema.Number,
                }),
              ),
              modelsDir: Schema.String,
            }),
            "System capabilities",
          ),
        }).annotateMerge(
          OpenApi.annotations({
            identifier: "modelhub.system",
            summary: "Get system capabilities",
            description:
              "Report the machine RAM, GPU VRAM, free disk space, CPU, GPU and the local models directory for compatibility checks.",
          }),
        ),
        HttpApiEndpoint.get("runtimes", "/models/runtimes", {
          query: WorkspaceRoutingQuery,
          success: described(
            Schema.Array(ModelRuntimeInfo),
            "Detected local runtimes",
          ),
        }).annotateMerge(
          OpenApi.annotations({
            identifier: "modelhub.runtimes",
            summary: "Detect local runtimes",
            description:
              "Probe local inference runtimes (Ollama, LM Studio) and report whether they are available on this machine.",
          }),
        ),
        HttpApiEndpoint.get("downloads", "/models/downloads", {
          query: WorkspaceRoutingQuery,
          success: described(
            Schema.Array(ModelDownloadJob),
            "Active and finished downloads",
          ),
        }).annotateMerge(
          OpenApi.annotations({
            identifier: "modelhub.downloads",
            summary: "List model downloads",
            description: "Return the persisted registry of model download jobs with progress and status.",
          }),
        ),
        HttpApiEndpoint.post("download", "/models/download", {
          query: WorkspaceRoutingQuery,
          payload: ModelDownloadInput,
          success: described(
            ModelDownloadJob,
            "Started download",
          ),
        }).annotateMerge(
          OpenApi.annotations({
            identifier: "modelhub.download",
            summary: "Download a GGUF model",
            description:
              "Start or resume a download of a GGUF file from HuggingFace into the local models directory.",
          }),
        ),
        HttpApiEndpoint.post("forget", "/models/forget", {
          query: WorkspaceRoutingQuery,
          payload: ModelForgetInput,
          success: described(ModelForgetResult, "Removed config entries"),
        }).annotateMerge(
          OpenApi.annotations({
            identifier: "modelhub.forget",
            summary: "Forget a local model",
            description:
              "Remove a deleted local model from the provider registry in the project and global config, drop the local engine provider when it is left empty, clear the default model when it pointed at the removed entry, and prune empty model directories.",
          }),
        ),
        HttpApiEndpoint.delete("cancel", "/models/downloads/:id", {
          params: Schema.Struct({ id: Schema.String }),
          query: WorkspaceRoutingQuery,
          success: described(Schema.Boolean, "Cancelled download"),
        }).annotateMerge(
          OpenApi.annotations({
            identifier: "modelhub.cancel",
            summary: "Cancel a model download",
            description: "Cancel a download job and remove its partial .part file.",
          }),
        ),
        HttpApiEndpoint.get("engine", "/models/engine", {
          query: WorkspaceRoutingQuery,
          success: described(ModelEngineStatus, "Tiancode native engine status"),
        }).annotateMerge(
          OpenApi.annotations({
            identifier: "modelhub.engine",
            summary: "Get native engine status",
            description: "Report the status of Tiancode's embedded llama-server engine, active model, and memory state.",
          }),
        ),
        HttpApiEndpoint.post("engineStart", "/models/engine/start", {
          query: WorkspaceRoutingQuery,
          payload: ModelEngineStartInput,
          success: described(ModelEngineStatus, "Started native engine"),
        }).annotateMerge(
          OpenApi.annotations({
            identifier: "modelhub.engineStart",
            summary: "Start native engine",
            description: "Start or switch the embedded llama-server with a local GGUF model.",
          }),
        ),
        HttpApiEndpoint.post("engineStop", "/models/engine/stop", {
          query: WorkspaceRoutingQuery,
          success: described(ModelEngineStatus, "Stopped native engine"),
        }).annotateMerge(
          OpenApi.annotations({
            identifier: "modelhub.engineStop",
            summary: "Stop native engine",
            description: "Stop the embedded llama-server and release GPU VRAM.",
          }),
        ),
      )
      .annotateMerge(
        OpenApi.annotations({
          title: "model-hub",
          description: "Local GGUF model hub backed by HuggingFace.",
        }),
      )
      .middleware(InstanceContextMiddleware)
      .middleware(WorkspaceRoutingMiddleware)
      .middleware(Authorization),
  )
  .annotateMerge(
    OpenApi.annotations({
      title: "tiancode model hub HttpApi",
      version: "0.0.1",
      description: "Download and manage local GGUF models.",
    }),
  )
