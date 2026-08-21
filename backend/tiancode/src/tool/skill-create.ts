import path from "path"
import { Effect, Schema } from "effect"
import { Global } from "@tiancode-ai/core/global"
import { FSUtil } from "@tiancode-ai/core/fs-util"
import { InstanceState } from "@/effect/instance-state"
import { Skill } from "../skill"
import * as Tool from "./tool"

export const Parameters = Schema.Struct({
  name: Schema.String.annotate({
    description: "The unique identifier name for the skill in kebab-case (e.g. 'deploy-preview', 'db-migrate', 'graphql-codegen')",
  }),
  description: Schema.String.annotate({
    description: "Clear criteria and explanation of when and why this skill should be automatically or manually loaded",
  }),
  content: Schema.String.annotate({
    description: "The Markdown body of the skill containing instructions, scripts, templates, or workflows",
  }),
  scope: Schema.optional(Schema.Literals(["project", "global"])).annotate({
    description: "Whether this skill is specific to the current 'project' (.tiancode/skills/) or 'global' across all projects (~/.config/tiancode/skills/) (default: project)",
  }),
})

type Metadata = Record<string, unknown>

export const SkillCreateTool = Tool.define<typeof Parameters, Metadata, FSUtil.Service | Global.Service | Skill.Service>(
  "skill_create",
  Effect.gen(function* () {
    const fsys = yield* FSUtil.Service
    const global = yield* Global.Service
    const skill = yield* Skill.Service

    return {
      description:
        "Create, distill, or update a reusable Skill (SKILL.md) for this project or globally. Use this after successfully solving a complex task or workflow to make it permanently reusable in future sessions.",
      parameters: Parameters,
      execute: (params: Schema.Schema.Type<typeof Parameters>, ctx: Tool.Context<Metadata>) =>
        Effect.gen(function* () {
          const instCtx = yield* InstanceState.context
          const sanitizedName = params.name.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "-")

          if (!sanitizedName) {
            return {
              title: "Skill creation failed",
              output: "Error: Skill name cannot be empty.",
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
            `description: ${params.description.trim().replace(/\n/g, " ")}`,
            "---",
            "",
            params.content.trim(),
            "",
          ].join("\n")

          yield* fsys.writeWithDirs(filePath, fileContent).pipe(Effect.orDie)

          // Invalidate skill catalog cache to reload immediately
          yield* skill.reload()

          return {
            title: `Created skill: ${sanitizedName}`,
            output: [
              `Successfully created skill '${sanitizedName}' (${scope} scope).`,
              `Location: ${filePath}`,
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
