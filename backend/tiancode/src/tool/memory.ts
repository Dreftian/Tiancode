import { Effect, Schema } from "effect"
import { Memory, type MemoryCategory } from "@tiancode-ai/core/memory"
import { LocationServiceMap } from "@tiancode-ai/core/location-services"
import { Location } from "@tiancode-ai/core/location"
import { AbsolutePath } from "@tiancode-ai/core/schema"
import { InstanceState } from "@/effect/instance-state"
import * as Tool from "./tool"

export const Parameters = Schema.Struct({
  action: Schema.Literals(["save", "recall"]).annotate({
    description: "Whether to 'save' a new fact or 'recall' existing long-term memories",
  }),
  target: Schema.optional(Schema.Literals(["project", "user"])).annotate({
    description: "Whether this memory is for the current 'project' or global 'user' profile (default: project)",
  }),
  category: Schema.optional(
    Schema.Literals(["preference", "convention", "architecture", "quirk", "general"]),
  ).annotate({
    description: "Category of the memory (default: general)",
  }),
  entry: Schema.optional(Schema.String).annotate({
    description: "The memory fact or learning to save (required for action: 'save')",
  }),
  query: Schema.optional(Schema.String).annotate({
    description: "Search keywords to look up in memory (optional for action: 'recall')",
  }),
})

type Metadata = Record<string, unknown>

export const MemoryTool = Tool.define<typeof Parameters, Metadata, LocationServiceMap.Service>(
  "memory",
  Effect.gen(function* () {
    const locations = yield* LocationServiceMap.Service

    return {
      description:
        "Manage long-term persistent memory across sessions. Use action 'save' to record important project conventions, architectural quirks, build commands, or user preferences. Use action 'recall' to search for past learnings.",
      parameters: Parameters,
      execute: (params: Schema.Schema.Type<typeof Parameters>, ctx: Tool.Context<Metadata>) =>
        Effect.gen(function* () {
          const instCtx = yield* InstanceState.context
          const locRef = Location.Ref.make({ directory: AbsolutePath.make(instCtx.directory) })
          const locLayer = locations.get(locRef)

          const memoryService = yield* Memory.Service.pipe(Effect.provide(locLayer))

          if (params.action === "save") {
            const entryText = params.entry?.trim()
            if (!entryText) {
              return {
                title: "Memory save failed",
                output: "Error: An 'entry' string is required when action is 'save'.",
                metadata: { success: false },
              }
            }

            const target = params.target ?? "project"
            const category: MemoryCategory = params.category ?? "general"

            if (target === "user") {
              yield* memoryService.saveUser(entryText, category)
              return {
                title: "Saved user preference",
                output: `Successfully saved to user profile memory (~/.tiancode/USER.md):\n- [${category.toUpperCase()}] ${entryText}`,
                metadata: { target: "user", category, success: true },
              }
            }

            yield* memoryService.saveProject(entryText, category)
            return {
              title: "Saved project memory",
              output: `Successfully saved to project memory (.tiancode/MEMORY.md):\n- [${category.toUpperCase()}] ${entryText}`,
              metadata: { target: "project", category, success: true },
            }
          }

          const result = yield* memoryService.recall(params.query)
          const lines: string[] = []

          if (params.query) {
            lines.push(`## Memory search results for: "${params.query}"`)
            if (result.matching.length === 0) {
              lines.push("No direct keyword matches found.")
            } else {
              lines.push(...result.matching)
            }
            lines.push("")
          }

          lines.push("## User Memory (~/.tiancode/USER.md)")
          lines.push(result.user ? result.user.trim() : "(Empty)")
          lines.push("")
          lines.push("## Project Memory (.tiancode/MEMORY.md)")
          lines.push(result.project ? result.project.trim() : "(Empty)")

          return {
            title: params.query ? `Memory recall: "${params.query}"` : "Memory recall",
            output: lines.join("\n"),
            metadata: {
              query: params.query,
              matchingCount: result.matching.length,
            },
          }
        }).pipe(Effect.orDie),
    }
  }),
)
