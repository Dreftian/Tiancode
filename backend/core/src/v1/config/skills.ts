export * as ConfigSkillsV1 from "./skills"

import { Schema } from "effect"

export const Info = Schema.Struct({
  paths: Schema.optional(Schema.Array(Schema.String)).annotate({
    description: "Additional paths to skill folders",
  }),
  urls: Schema.optional(Schema.Array(Schema.String)).annotate({
    description: "URLs to fetch skills from (e.g., https://example.com/.well-known/skills/)",
  }),
  disabled: Schema.optional(Schema.Array(Schema.String)).annotate({
    description: "Skill names the user has disabled",
  }),
  autoSelect: Schema.optional(Schema.Boolean).annotate({
    description: "Automatically load the skills that match the project type (default: true)",
  }),
})
export type Info = Schema.Schema.Type<typeof Info>
