export * as ConfigExperimental from "./experimental"

import { Schema } from "effect"
import { Catalog } from "../catalog"
import { Policy as PolicyV2 } from "../policy"

// Each core domain exports the policy actions it supports. Adding an action to
// this union makes it valid in authored config while keeping Policy generic.
export const PolicyAction = Schema.Union([Catalog.PolicyActions])

export class Policy extends Schema.Class<Policy>("ConfigV2.Experimental.Policy")({
  ...PolicyV2.Info.fields,
  action: PolicyAction,
}) {}

/**
 * Capability switches the desktop app exposes under Settings → Intelligence.
 *
 * These live in the server config rather than the renderer's local storage because the
 * behaviour they gate runs server-side: the system prompt builder and the bash tool read
 * them. A setting kept only in localStorage can never reach either.
 *
 * Every field is optional and treated as ON when absent, so an existing config keeps today's
 * behaviour and nothing changes for users who never open the tab.
 */
export class Intelligence extends Schema.Class<Intelligence>("ConfigV2.Experimental.Intelligence")({
  userMemory: Schema.Boolean.pipe(Schema.optional).annotate({
    description: "Inject USER.md (cross-project preferences) into the system prompt",
  }),
  projectMemory: Schema.Boolean.pipe(Schema.optional).annotate({
    description: "Inject .tiancode/MEMORY.md (this repository's learnings) into the system prompt",
  }),
  guardrails: Schema.Boolean.pipe(Schema.optional).annotate({
    description: "Screen shell commands with AgentShield before running them",
  }),
  codeGraph: Schema.Boolean.pipe(Schema.optional).annotate({
    description: "Allow the agent to query the code graph (symbol, dependents, dependencies, outline)",
  }),
}) {}

/**
 * Messaging gateways the desktop app exposes under Settings → Conexiones.
 *
 * Only non-secret settings live here. Bot tokens, webhook URLs and signing keys go through the
 * credential store (`connection:<provider>`), so a config file can be shared or committed
 * without leaking them. Nothing is enabled until the user turns it on.
 */
export const TelegramConnection = Schema.Struct({
  enabled: Schema.Boolean.pipe(Schema.optional),
  chatId: Schema.String.pipe(Schema.optional).annotate({
    description: "Chat the bot posts to, and the only chat it accepts commands from",
  }),
  notifyIdle: Schema.Boolean.pipe(Schema.optional).annotate({ description: "Send the reply when a session finishes" }),
  notifyError: Schema.Boolean.pipe(Schema.optional).annotate({ description: "Send session errors" }),
  inbound: Schema.Boolean.pipe(Schema.optional).annotate({
    description: "Poll the bot for messages and run them as prompts",
  }),
  directory: Schema.String.pipe(Schema.optional).annotate({ description: "Project directory inbound prompts run in" }),
})

export const DiscordConnection = Schema.Struct({
  enabled: Schema.Boolean.pipe(Schema.optional),
  mode: Schema.Literals(["webhook", "bot"]).pipe(Schema.optional),
  channelId: Schema.String.pipe(Schema.optional).annotate({ description: "Bot mode only: channel snowflake" }),
  notifyIdle: Schema.Boolean.pipe(Schema.optional),
  notifyError: Schema.Boolean.pipe(Schema.optional),
})

export const SlackConnection = Schema.Struct({
  enabled: Schema.Boolean.pipe(Schema.optional),
  notifyIdle: Schema.Boolean.pipe(Schema.optional),
  notifyError: Schema.Boolean.pipe(Schema.optional),
})

export const WebhookConnection = Schema.Struct({
  enabled: Schema.Boolean.pipe(Schema.optional),
  url: Schema.String.pipe(Schema.optional),
  events: Schema.Array(Schema.String).pipe(Schema.optional).annotate({
    description: "Which events are delivered: session.idle, session.error",
  }),
})

export class Connections extends Schema.Class<Connections>("ConfigV2.Experimental.Connections")({
  telegram: TelegramConnection.pipe(Schema.optional),
  discord: DiscordConnection.pipe(Schema.optional),
  slack: SlackConnection.pipe(Schema.optional),
  webhook: WebhookConnection.pipe(Schema.optional),
}) {}

export class Experimental extends Schema.Class<Experimental>("ConfigV2.Experimental")({
  policies: Policy.pipe(Schema.Array, Schema.optional),
  intelligence: Intelligence.pipe(Schema.optional),
  connections: Connections.pipe(Schema.optional),
}) {}
