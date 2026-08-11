import { Schema } from "effect"
import { HttpApi, HttpApiEndpoint, HttpApiGroup, OpenApi } from "effect/unstable/httpapi"
import { WorkspaceRoutingQuery, WorkspaceRoutingQueryFields } from "../middleware/workspace-routing"
import { described } from "./metadata"

const root = "/preview"
export const PreviewPaths = {
  status: root,
  start: `${root}/start`,
  stop: `${root}/stop`,
  restart: `${root}/restart`,
  logs: `${root}/logs`,
} as const

export const PreviewErrorSchema = Schema.Struct({
  file: Schema.Union([Schema.Null, Schema.String]),
  line: Schema.Union([Schema.Null, Schema.Number]),
  message: Schema.String,
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
      ),
  )
