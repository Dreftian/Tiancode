import { Schema } from "effect"
import { HttpApiEndpoint, HttpApiGroup, OpenApi } from "effect/unstable/httpapi"
import { described } from "./metadata"

export const DecisionStatus = Schema.Struct({
  state: Schema.Literals(["unavailable", "missing", "downloading", "ready", "error"]),
  loaded: Schema.Boolean,
  totalBytes: Schema.Finite,
  receivedBytes: Schema.Finite,
  message: Schema.optional(Schema.String),
  loadMs: Schema.optional(Schema.Finite),
  model: Schema.String,
  base: Schema.String,
}).annotate({ identifier: "DecisionStatus" })

export const DecisionPreset = Schema.Literals(["outcome", "area"]).annotate({ identifier: "DecisionPreset" })

export const DecisionClassifyInput = Schema.Struct({
  preset: DecisionPreset,
  text: Schema.String,
  /** Give up after this many milliseconds (default 5000). */
  timeoutMs: Schema.optional(Schema.Finite),
}).annotate({ identifier: "DecisionClassifyInput" })

export const DecisionAnswer = Schema.Struct({
  choice: Schema.String,
  confidence: Schema.Finite,
  probabilities: Schema.Record(Schema.String, Schema.Finite),
  ms: Schema.Finite,
}).annotate({ identifier: "DecisionAnswer" })

export const DecisionPaths = {
  status: "/global/decision",
  install: "/global/decision/install",
  cancel: "/global/decision/cancel",
  classify: "/global/decision/classify",
} as const

export const DecisionGroup = HttpApiGroup.make("decision")
  .add(
    HttpApiEndpoint.get("decisionStatus", DecisionPaths.status, {
      success: described(DecisionStatus, "Local decision model status"),
    }).annotateMerge(
      OpenApi.annotations({
        identifier: "global.decision.status",
        summary: "Local decision model status",
        description: "Whether the offline laya model is available, downloading, installed and loaded.",
      }),
    ),
    HttpApiEndpoint.post("decisionInstall", DecisionPaths.install, {
      success: described(DecisionStatus, "Status after starting the download"),
    }).annotateMerge(
      OpenApi.annotations({
        identifier: "global.decision.install",
        summary: "Download the local decision model",
        description: "Start downloading the pinned laya model (about 360 MB) in the background.",
      }),
    ),
    HttpApiEndpoint.post("decisionCancel", DecisionPaths.cancel, {
      success: described(DecisionStatus, "Status after cancelling"),
    }).annotateMerge(
      OpenApi.annotations({
        identifier: "global.decision.cancel",
        summary: "Cancel the model download",
        description: "Stop a running download; the partial file is kept so a later download resumes.",
      }),
    ),
    HttpApiEndpoint.delete("decisionRemove", DecisionPaths.status, {
      success: described(DecisionStatus, "Status after removing the model"),
    }).annotateMerge(
      OpenApi.annotations({
        identifier: "global.decision.remove",
        summary: "Remove the local decision model",
        description: "Unload the model and delete its files.",
      }),
    ),
    HttpApiEndpoint.post("decisionClassify", DecisionPaths.classify, {
      payload: DecisionClassifyInput,
      success: described(Schema.NullOr(DecisionAnswer), "The answer, or null when the model is not ready"),
    }).annotateMerge(
      OpenApi.annotations({
        identifier: "global.decision.classify",
        summary: "Classify a text locally",
        description: "Answer one of Tiancode's built-in questions about a text with the offline laya model.",
      }),
    ),
  )
  .annotateMerge(OpenApi.annotations({ title: "decision", description: "Offline decision model (laya)." }))
