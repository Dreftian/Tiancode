import { Effect, Schema } from "effect"
import { CodeGraph } from "@tiancode-ai/core/graph"
import { ConfigIntelligence } from "@tiancode-ai/core/config/intelligence"
import { Config } from "@tiancode-ai/core/config"
import { LocationServiceMap } from "@tiancode-ai/core/location-services"
import { Location } from "@tiancode-ai/core/location"
import { AbsolutePath } from "@tiancode-ai/core/schema"
import { InstanceState } from "@/effect/instance-state"
import * as Tool from "./tool"

export const Parameters = Schema.Struct({
  action: Schema.Literals(["symbol", "dependents", "dependencies", "outline"]).annotate({
    description:
      "'symbol' finds where a name is defined; 'dependents' lists files importing a file; " +
      "'dependencies' lists what a file imports; 'outline' summarises one file's imports and exports",
  }),
  name: Schema.optional(Schema.String).annotate({
    description: "Symbol name to locate (required for action: 'symbol')",
  }),
  file: Schema.optional(Schema.String).annotate({
    description:
      "File path, absolute or relative to the project root (required for 'dependents', 'dependencies' and 'outline')",
  }),
})

type Metadata = Record<string, unknown>

/**
 * Exposes the CodeGraph service to the agent.
 *
 * The service already existed and was registered as a location service, but nothing ever
 * called it — analyzeFile, findSymbol, findDependents, findDependencies and formatContext had
 * no consumers, which also left the Settings → Intelligence "code graph" switch gating nothing.
 *
 * `dependents` is the query that is genuinely hard to answer with grep: it needs the import
 * edges resolved, not a text match.
 */
export const CodeGraphTool = Tool.define<typeof Parameters, Metadata, LocationServiceMap.Service>(
  "codegraph",
  Effect.gen(function* () {
    const locations = yield* LocationServiceMap.Service

    return {
      description:
        "Query the code graph: locate where a symbol is defined, list the files that import a given file " +
        "(its dependents) or the files it imports, or outline one file's imports and exports. Use this " +
        "before changing a shared module, to see what a change would affect.",
      parameters: Parameters,
      execute: (params: Schema.Schema.Type<typeof Parameters>, _ctx: Tool.Context<Metadata>) =>
        Effect.gen(function* () {
          const instCtx = yield* InstanceState.context
          const root = instCtx.directory
          const locLayer = locations.get(Location.Ref.make({ directory: AbsolutePath.make(root) }))

          // Config is location-scoped in core, so it resolves through the same layer.
          const config = yield* Config.Service.pipe(Effect.provide(locLayer))
          const intelligence = ConfigIntelligence.fromEntries(yield* config.entries())
          if (!intelligence.codeGraph) {
            return {
              title: "Code graph disabled",
              output:
                "Code graph analysis is turned off in Settings → Intelligence. Enable it there, or use grep and read instead.",
              metadata: { enabled: false },
            }
          }

          const graph = yield* CodeGraph.Service.pipe(Effect.provide(locLayer))

          const missing = (what: string) => ({
            title: "Code graph query failed",
            output: `Error: '${what}' is required for action '${params.action}'.`,
            metadata: { success: false },
          })

          if (params.action === "symbol") {
            const name = params.name?.trim()
            if (!name) return missing("name")
            const hits = yield* graph.findSymbol(name)
            if (hits.length === 0) {
              return {
                title: `No definition of ${name}`,
                output: `No exported symbol named "${name}" was found in the indexed files.`,
                metadata: { name, count: 0 },
              }
            }
            return {
              title: `${name}: ${hits.length} definition${hits.length === 1 ? "" : "s"}`,
              output: hits.map((h) => `${h.filePath}:${h.line}  ${h.kind} ${h.name}`).join("\n"),
              metadata: { name, count: hits.length },
            }
          }

          const file = params.file?.trim()
          if (!file) return missing("file")

          if (params.action === "dependents") {
            const files = yield* graph.findDependents(file)
            return {
              title: `${files.length} file${files.length === 1 ? "" : "s"} import ${file}`,
              output: files.length > 0 ? files.join("\n") : `Nothing imports ${file}.`,
              metadata: { file, count: files.length },
            }
          }

          if (params.action === "dependencies") {
            const files = yield* graph.findDependencies(file)
            return {
              title: `${file} imports ${files.length} file${files.length === 1 ? "" : "s"}`,
              output: files.length > 0 ? files.join("\n") : `${file} imports nothing resolvable in this project.`,
              metadata: { file, count: files.length },
            }
          }

          const node = yield* graph.analyzeFile(file)
          const lines = [
            `# ${node.filePath}`,
            "",
            `## Imports (${node.imports.length})`,
            node.imports.length > 0 ? node.imports.join("\n") : "(none)",
            "",
            `## Exports (${node.exports.length})`,
            node.exports.length > 0
              ? node.exports.map((e) => `${e.kind} ${e.name}  (line ${e.line})`).join("\n")
              : "(none)",
          ]
          return {
            title: `Outline of ${file}`,
            output: lines.join("\n"),
            metadata: { file, imports: node.imports.length, exports: node.exports.length },
          }
        }).pipe(Effect.orDie),
    }
  }),
)
