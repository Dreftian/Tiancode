import { Schema } from "effect"
import { HttpApi, HttpApiEndpoint, HttpApiGroup, OpenApi } from "effect/unstable/httpapi"
import { Authorization } from "../middleware/authorization"
import { InstanceContextMiddleware } from "../middleware/instance-context"
import { WorkspaceRoutingMiddleware, WorkspaceRoutingQuery, WorkspaceRoutingQueryFields } from "../middleware/workspace-routing"
import { described } from "./metadata"

const root = "/preview"
export const PreviewPaths = {
  status: root,
  start: `${root}/start`,
  stop: `${root}/stop`,
  restart: `${root}/restart`,
  logs: `${root}/logs`,
  agentPending: `${root}/agent/pending`,
  agentResult: `${root}/agent/result`,
  agentDemand: `${root}/agent/demand`,
} as const

export const PreviewErrorSchema = Schema.Struct({
  file: Schema.Union([Schema.Null, Schema.String]),
  line: Schema.Union([Schema.Null, Schema.Number]),
  message: Schema.String,
})

/** Progress of an incremental rebuild; see PreviewBuild in @/preview/types. */
export const PreviewBuildSchema = Schema.Struct({
  running: Schema.Boolean,
  startedAt: Schema.Union([Schema.Null, Schema.Number]),
  durationMs: Schema.Union([Schema.Null, Schema.Number]),
  ok: Schema.Union([Schema.Null, Schema.Boolean]),
  trigger: Schema.Union([Schema.Null, Schema.String]),
  sequence: Schema.Number,
})

export const PreviewStateSchema = Schema.Struct({
  status: Schema.Literals(["idle", "starting", "ready", "error", "stopped"]),
  url: Schema.Union([Schema.Null, Schema.String]),
  port: Schema.Union([Schema.Null, Schema.Number]),
  framework: Schema.Union([Schema.Null, Schema.String]),
  packageManager: Schema.Union([Schema.Null, Schema.String]),
  command: Schema.Union([Schema.Null, Schema.String]),
  errors: Schema.Array(PreviewErrorSchema),
  startedAt: Schema.Union([Schema.Null, Schema.Number]),
  errorMessage: Schema.Union([Schema.Null, Schema.String]),
  isDesktop: Schema.optional(Schema.Boolean),
  pid: Schema.optional(Schema.Union([Schema.Null, Schema.Number])),
  build: PreviewBuildSchema,
})

/**
 * Una acción que el agente quiere ejecutar sobre la página de la Vista en vivo. Los campos son
 * opcionales porque cada `type` usa los suyos; el renderer valida lo que necesita.
 */
export const PreviewAgentActionSchema = Schema.Struct({
  // `capture` y las dos de portapapeles no tocan la página: viajan por este mismo puente porque
  // sólo el proceso principal de Electron puede atenderlas, y ya existe una cola por directorio.
  type: Schema.Literals([
    "inspect",
    "click",
    "fill",
    "press",
    "select",
    "scroll",
    "navigate",
    "capture",
    "clipboard_read",
    "clipboard_write",
  ]),
  target: Schema.optional(Schema.String),
  value: Schema.optional(Schema.String),
  key: Schema.optional(Schema.String),
  url: Schema.optional(Schema.String),
  direction: Schema.optional(Schema.String),
  /** Región de la captura cuando `type` es "capture" y el objetivo es un área. */
  bounds: Schema.optional(
    Schema.Struct({ x: Schema.Number, y: Schema.Number, width: Schema.Number, height: Schema.Number }),
  ),
})

export const PreviewAgentCommandSchema = Schema.Struct({
  id: Schema.String,
  action: PreviewAgentActionSchema,
  createdAt: Schema.Number,
})

export const PreviewAgentResultSchema = Schema.Struct({
  id: Schema.String,
  ok: Schema.Boolean,
  output: Schema.String,
  /** El cliente reclamó la acción y se cerró antes de ejecutarla: vuelve a la cola. */
  requeue: Schema.optional(Schema.Boolean),
})

/** Lo que el agente está esperando, sin consumir la cola. */
export const PreviewAgentDemandSchema = Schema.Struct({
  pending: Schema.Number,
  id: Schema.Union([Schema.Null, Schema.String]),
  since: Schema.Union([Schema.Null, Schema.Number]),
})

export const PreviewApi = HttpApi.make("preview")
  .add(
    HttpApiGroup.make("preview")
      .add(
        HttpApiEndpoint.get("status", PreviewPaths.status, {
          query: WorkspaceRoutingQuery,
          success: described(PreviewStateSchema, "Estado del dev server del proyecto"),
        }).annotateMerge(
          OpenApi.annotations({
            identifier: "preview.status",
            summary: "Estado del dev server del proyecto",
          }),
        ),
        HttpApiEndpoint.post("start", PreviewPaths.start, {
          query: WorkspaceRoutingQuery,
          payload: Schema.Struct({}),
          success: described(PreviewStateSchema, "Servidor iniciado"),
        }).annotateMerge(
          OpenApi.annotations({
            identifier: "preview.start",
            summary: "Arranca el dev server del proyecto",
          }),
        ),
        HttpApiEndpoint.post("stop", PreviewPaths.stop, {
          query: WorkspaceRoutingQuery,
          payload: Schema.Struct({}),
          success: described(PreviewStateSchema, "Servidor detenido"),
        }).annotateMerge(
          OpenApi.annotations({
            identifier: "preview.stop",
            summary: "Detiene el dev server del proyecto",
          }),
        ),
        HttpApiEndpoint.post("restart", PreviewPaths.restart, {
          query: WorkspaceRoutingQuery,
          payload: Schema.Struct({}),
          success: described(PreviewStateSchema, "Servidor reiniciado"),
        }).annotateMerge(
          OpenApi.annotations({
            identifier: "preview.restart",
            summary: "Reinicia el dev server del proyecto",
          }),
        ),
        HttpApiEndpoint.get("logs", PreviewPaths.logs, {
          query: Schema.Struct({ ...WorkspaceRoutingQueryFields }),
          success: described(Schema.Array(Schema.String), "Logs recientes del dev server"),
        }).annotateMerge(
          OpenApi.annotations({
            identifier: "preview.logs",
            summary: "Logs recientes del dev server",
          }),
        ),
        HttpApiEndpoint.get("agentPending", PreviewPaths.agentPending, {
          query: Schema.Struct({
            ...WorkspaceRoutingQueryFields,
            wait: Schema.optional(Schema.String),
            surface: Schema.optional(Schema.String),
            capable: Schema.optional(Schema.String),
          }),
          success: described(
            Schema.Array(PreviewAgentCommandSchema),
            "Acciones que el agente quiere ejecutar sobre la página (long-poll)",
          ),
        }).annotateMerge(
          OpenApi.annotations({
            identifier: "preview.agentPending",
            summary: "Acciones pendientes del agente sobre la vista previa",
          }),
        ),
        HttpApiEndpoint.get("agentDemand", PreviewPaths.agentDemand, {
          query: Schema.Struct({ ...WorkspaceRoutingQueryFields, capable: Schema.optional(Schema.String) }),
          success: described(PreviewAgentDemandSchema, "Acciones del agente esperando una superficie"),
        }).annotateMerge(
          OpenApi.annotations({
            identifier: "preview.agentDemand",
            summary: "Demanda del agente sobre la vista previa",
          }),
        ),
        HttpApiEndpoint.post("agentResult", PreviewPaths.agentResult, {
          query: WorkspaceRoutingQuery,
          payload: PreviewAgentResultSchema,
          success: described(Schema.Struct({ ok: Schema.Boolean }), "Resultado entregado"),
        }).annotateMerge(
          OpenApi.annotations({
            identifier: "preview.agentResult",
            summary: "Devuelve el resultado de una acción del agente",
          }),
        ),
      )
      .middleware(InstanceContextMiddleware)
      .middleware(WorkspaceRoutingMiddleware)
      .middleware(Authorization),
  )
