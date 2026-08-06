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
                quantFiles: Schema.Array(
                  Schema.Struct({
                    file: Schema.String,
                    quant: Schema.optional(Schema.String),
                    size: Schema.optional(Schema.Number),
                  }),
                ),
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
            Schema.Array(
              Schema.Struct({
                file: Schema.String,
                quant: Schema.optional(Schema.String),
                size: Schema.optional(Schema.Number),
              }),
            ),
            "GGUF files of a model",
          ),
        }).annotateMerge(
          OpenApi.annotations({
            identifier: "modelhub.files",
            summary: "List model GGUF files",
            description: "List the GGUF files of a HuggingFace model with exact sizes from the repo tree.",
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
              modelsDir: Schema.String,
            }),
            "System capabilities",
          ),
        }).annotateMerge(
          OpenApi.annotations({
            identifier: "modelhub.system",
            summary: "Get system capabilities",
            description:
              "Report the machine RAM, free disk space, CPU, GPU and the local models directory for compatibility checks.",
          }),
        ),
        HttpApiEndpoint.get("downloads", "/models/downloads", {
          query: WorkspaceRoutingQuery,
          success: described(
            Schema.Array(
              Schema.Struct({
                model: Schema.String,
                file: Schema.String,
                dest: Schema.String,
                total: Schema.Number,
                received: Schema.Number,
                done: Schema.Boolean,
              }),
            ),
            "Active and finished downloads",
          ),
        }).annotateMerge(
          OpenApi.annotations({
            identifier: "modelhub.downloads",
            summary: "List model downloads",
            description: "Return the registry of started model downloads with progress.",
          }),
        ),
        HttpApiEndpoint.post("download", "/models/download", {
          query: WorkspaceRoutingQuery,
          payload: ModelDownloadInput,
          success: described(
            Schema.Struct({
              model: Schema.String,
              file: Schema.String,
              dest: Schema.String,
              total: Schema.Number,
              received: Schema.Number,
              done: Schema.Boolean,
            }),
            "Started download",
          ),
        }).annotateMerge(
          OpenApi.annotations({
            identifier: "modelhub.download",
            summary: "Download a GGUF model",
            description: "Start downloading a GGUF file from HuggingFace into the local models directory.",
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
