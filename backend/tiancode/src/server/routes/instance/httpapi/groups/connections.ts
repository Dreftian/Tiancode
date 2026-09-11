import { Schema } from "effect"
import { HttpApiEndpoint, HttpApiGroup, OpenApi } from "effect/unstable/httpapi"
import { Connections } from "@/connections/connections"
import { described } from "./metadata"

export const ConnectionProvider = Schema.Literals(["telegram", "discord", "slack", "webhook"]).annotate({
  identifier: "ConnectionProvider",
})

export const ConnectionStatus = Schema.Struct({
  provider: ConnectionProvider,
  enabled: Schema.Boolean,
  configured: Schema.Boolean,
  hasSecret: Schema.Boolean,
  settings: Schema.Record(Schema.String, Schema.Unknown),
  lastDeliveryAt: Schema.optional(Schema.Number),
  lastError: Schema.optional(Schema.String),
  inbound: Schema.optional(
    Schema.Struct({
      running: Schema.Boolean,
      lastUpdateAt: Schema.optional(Schema.Number),
      sessions: Schema.Number,
    }),
  ),
}).annotate({ identifier: "ConnectionStatus" })

export const ConnectionsUpdateInput = Schema.Struct({
  settings: Schema.optional(Schema.Record(Schema.String, Schema.Unknown)),
  /** Bot token, webhook URL or signing key. Empty string removes it. Never echoed back. */
  secret: Schema.optional(Schema.String),
}).annotate({ identifier: "ConnectionsUpdateInput" })

export const ConnectionTestResult = Schema.Struct({
  ok: Schema.Boolean,
  status: Schema.optional(Schema.Number),
  message: Schema.String,
  latencyMs: Schema.Number,
}).annotate({ identifier: "ConnectionTestResult" })

export const ConnectionsPaths = {
  list: "/global/connections",
  item: "/global/connections/:provider",
  test: "/global/connections/:provider/test",
} as const

export const ConnectionsGroup = HttpApiGroup.make("connections")
  .add(
    HttpApiEndpoint.get("connectionsList", ConnectionsPaths.list, {
      success: described(Schema.Struct({ data: Schema.Array(ConnectionStatus) }), "Status of every gateway"),
    }).annotateMerge(
      OpenApi.annotations({
        identifier: "global.connections.list",
        summary: "List messaging gateways",
        description: "Status and non-secret settings of the Telegram, Discord, Slack and webhook gateways.",
      }),
    ),
    HttpApiEndpoint.put("connectionsUpdate", ConnectionsPaths.item, {
      params: { provider: ConnectionProvider },
      payload: ConnectionsUpdateInput,
      success: described(ConnectionStatus, "Updated gateway status"),
      error: [Connections.InvalidSettingsError],
    }).annotateMerge(
      OpenApi.annotations({
        identifier: "global.connections.update",
        summary: "Configure a messaging gateway",
        description: "Save non-secret settings to the global config and the secret to the credential store.",
      }),
    ),
    HttpApiEndpoint.delete("connectionsRemove", ConnectionsPaths.item, {
      params: { provider: ConnectionProvider },
      success: described(ConnectionStatus, "Gateway disabled and its secret removed"),
    }).annotateMerge(
      OpenApi.annotations({
        identifier: "global.connections.remove",
        summary: "Disconnect a messaging gateway",
        description: "Disable the gateway, forget its secret and stop any inbound polling.",
      }),
    ),
    HttpApiEndpoint.post("connectionsTest", ConnectionsPaths.test, {
      params: { provider: ConnectionProvider },
      success: described(ConnectionTestResult, "Outcome of a real delivery"),
    }).annotateMerge(
      OpenApi.annotations({
        identifier: "global.connections.test",
        summary: "Test a messaging gateway",
        description: "Send a real test message through the gateway and report what the provider answered.",
      }),
    ),
  )
  .annotateMerge(OpenApi.annotations({ title: "connections", description: "Messaging gateways." }))
