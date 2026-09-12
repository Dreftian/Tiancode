import path from "path"
import { Effect, Schema } from "effect"
import { Global } from "@tiancode-ai/core/global"
import { FSUtil } from "@tiancode-ai/core/fs-util"
import { ConfigIntelligence } from "@tiancode-ai/core/config/intelligence"
import { Config } from "@tiancode-ai/core/config"
import { LocationServiceMap } from "@tiancode-ai/core/location-services"
import { Location } from "@tiancode-ai/core/location"
import { AbsolutePath } from "@tiancode-ai/core/schema"
import { InstanceState } from "@/effect/instance-state"
import { Skill } from "../skill"
import { Tool } from "./tool"

export const Parameters = Schema.Struct({
  name: Schema.String.annotate({
    description: "The unique identifier name for the skill in kebab-case (e.g. 'deploy-preview', 'db-migrate', 'graphql-codegen')",
  }),
  description: Schema.String.annotate({
    description: "Hermes standard: Concise description of the skill in 60 characters or less for YAML frontmatter (e.g. 'Deploy preview environments with Kamal')",
  }),
  triggers: Schema.optional(Schema.String).annotate({
    description: "Hermes standard: Specific trigger criteria — exact conditions, file patterns, or keywords when this skill must be loaded",
  }),
  procedure: Schema.optional(Schema.String).annotate({
    description: "Hermes standard: Numbered step-by-step procedure to execute the workflow (1. ..., 2. ..., 3. ...)",
  }),
  verification: Schema.optional(Schema.String).annotate({
    description: "Hermes standard: Verification steps and commands to confirm success and validate results",
  }),
  pits: Schema.optional(Schema.String).annotate({
    description: "Hermes standard: Pitfalls, anti-patterns, common mistakes, and things to avoid",
  }),
  content: Schema.optional(Schema.String).annotate({
    description: "Markdown body of the skill. If provided without separate sections, should follow the Hermes standard structure (Trigger Criteria, Procedure, Verification, Pits).",
  }),
  scope: Schema.optional(Schema.Literals(["project", "global"])).annotate({
    description: "Whether this skill is specific to the current 'project' (.tiancode/skills/) or 'global' across all projects (~/.config/tiancode/skills/) (default: project)",
  }),
})

type Metadata = Record<string, unknown>

export const SkillCreateTool = Tool.define<
  typeof Parameters,
  Metadata,
  FSUtil.Service | Global.Service | Skill.Service | LocationServiceMap.Service
>(
  "skill_create",
  Effect.gen(function* () {
    const fsys = yield* FSUtil.Service
    const global = yield* Global.Service
    const skill = yield* Skill.Service
    const locations = yield* LocationServiceMap.Service

    return {
      description:
        "Create, distill, or update a reusable Skill (SKILL.md) following Hermes authoring standards: concise description (<= 60 chars in frontmatter), trigger criteria, numbered procedure, verification steps, and pits (anti-patterns to avoid). Use this after successfully solving a complex task or workflow to make it permanently reusable.",
      parameters: Parameters,
      execute: (params: Schema.Schema.Type<typeof Parameters>, ctx: Tool.Context<Metadata>) =>
        Effect.gen(function* () {
          const instCtx = yield* InstanceState.context

          // Config is location-scoped in core, so it resolves through the same layer.
          const locLayer = locations.get(Location.Ref.make({ directory: AbsolutePath.make(instCtx.directory) }))
          const config = yield* Config.Service.pipe(Effect.provide(locLayer))
          const intelligence = ConfigIntelligence.fromEntries(yield* config.entries())
          if (!intelligence.autoSkillLearn) {
            return {
              title: "Skill creation disabled",
              output:
                "Writing SKILL.md files is turned off in Settings → Intelligence. Enable it there, or write the file yourself with the write tool.",
              metadata: { enabled: false },
            }
          }

          const sanitizedName = params.name.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "-")

          if (!sanitizedName) {
            return {
              title: "Skill creation failed",
              output: "Error: Skill name cannot be empty.",
              metadata: { success: false },
            }
          }

          const rawDescription = params.description.trim().replace(/\r?\n/g, " ")
          const frontmatterDescription =
            rawDescription.length > 60 ? rawDescription.slice(0, 57) + "..." : rawDescription

          let body = ""
          if (params.procedure || params.triggers || params.verification || params.pits) {
            const sections: string[] = []
            if (params.content?.trim()) {
              sections.push(params.content.trim())
            }
            if (params.triggers?.trim()) {
              sections.push(`## Trigger Criteria\n${params.triggers.trim()}`)
            } else if (rawDescription.length > 60) {
              sections.push(`## Trigger Criteria\n${rawDescription}`)
            }
            if (params.procedure?.trim()) {
              sections.push(`## Procedure\n${params.procedure.trim()}`)
            }
            if (params.verification?.trim()) {
              sections.push(`## Verification\n${params.verification.trim()}`)
            }
            if (params.pits?.trim()) {
              sections.push(`## Pits\n${params.pits.trim()}`)
            }
            body = sections.join("\n\n")
          } else if (params.content?.trim()) {
            body = params.content.trim()
          }

          if (!body) {
            return {
              title: "Skill creation failed",
              output:
                "Error: Skill must include content or procedure following Hermes authoring standards (concise description <= 60 chars, trigger criteria, numbered procedure, verification steps, pits).",
              metadata: { success: false },
            }
          }

          const scope = params.scope ?? "project"
          const targetDir =
            scope === "global"
              ? path.join(global.config, "skills", sanitizedName)
              : path.join(instCtx.worktree, ".tiancode", "skills", sanitizedName)

          const filePath = path.join(targetDir, "SKILL.md")

          const fileContent = [
            "---",
            `name: ${sanitizedName}`,
            `description: ${frontmatterDescription}`,
            "---",
            "",
            body,
            "",
          ].join("\n")

          yield* fsys.writeWithDirs(filePath, fileContent).pipe(Effect.orDie)

          // Invalidate skill catalog cache to reload immediately
          yield* skill.reload()

          return {
            title: `Created skill: ${sanitizedName}`,
            output: [
              `Successfully created skill '${sanitizedName}' (${scope} scope) following Hermes standards.`,
              `Location: ${filePath}`,
              `Description: ${frontmatterDescription}`,
              "",
              "The skill has been indexed and is immediately available for use via the 'skill' tool or auto-selection.",
            ].join("\n"),
            metadata: {
              name: sanitizedName,
              path: filePath,
              scope,
              success: true,
            },
          }
        }).pipe(Effect.orDie),
    }
  }),
)
