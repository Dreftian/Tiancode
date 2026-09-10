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
}) {}

export class Experimental extends Schema.Class<Experimental>("ConfigV2.Experimental")({
  policies: Policy.pipe(Schema.Array, Schema.optional),
  intelligence: Intelligence.pipe(Schema.optional),
}) {}
