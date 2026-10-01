import { describe, expect } from "bun:test"
import { Effect, Layer } from "effect"
import { CodeGraph } from "@tiancode-ai/core/graph"
import { Location } from "@tiancode-ai/core/location"
import { AppNodeBuilder } from "@tiancode-ai/core/effect/app-node-builder"
import { testEffect } from "./lib/effect"
import { tmpdir } from "./fixture/tmpdir"
import { AbsolutePath } from "@tiancode-ai/core/schema"
import { Project } from "@tiancode-ai/core/project"
import path from "path"
import fs from "fs/promises"

const it = testEffect(Layer.empty)

const makeGraphLayer = (projectDir: string) =>
  AppNodeBuilder.build(CodeGraph.node, [
    [
      Location.node,
      Layer.succeed(Location.Service, {
        directory: AbsolutePath.make(projectDir),
        project: { id: Project.ID.make("test-proj"), directory: AbsolutePath.make(projectDir) },
      }),
    ],
  ])

describe("CodeGraph service", () => {
  it.live("parses symbols, exports, imports, and formats context", () =>
    Effect.acquireRelease(
      Effect.promise(() => tmpdir()),
      (tmp) => Effect.promise(() => tmp[Symbol.asyncDispose]()),
    ).pipe(
      Effect.flatMap((tmp) =>
        Effect.gen(function* () {
          const sampleFile = path.join(tmp.path, "service.ts")
          const content = [
            `import { Effect } from "effect"`,
            `import { Memory } from "./memory"`,
            ``,
            `export interface Config {`,
            `  timeout: number`,
            `}`,
            ``,
            `export class DatabaseService {`,
            `  connect() {}`,
            `}`,
            ``,
            `export function executeQuery() {`,
            `  return true`,
            `}`,
            ``,
            `export const MAX_RETRY = 3`,
          ].join("\n")

          yield* Effect.promise(() => fs.writeFile(sampleFile, content, "utf-8"))

          const layer = makeGraphLayer(tmp.path)

          yield* Effect.gen(function* () {
            const graph = yield* CodeGraph.Service
            const analyzed = yield* graph.analyzeFile(sampleFile)

            expect(analyzed.filePath).toBe("service.ts")
            expect(analyzed.imports).toContain("effect")
            expect(analyzed.imports).toContain("./memory")

            const exportNames = analyzed.exports.map((e) => e.name)
            expect(exportNames).toContain("Config")
            expect(exportNames).toContain("DatabaseService")
            expect(exportNames).toContain("executeQuery")
            expect(exportNames).toContain("MAX_RETRY")

            const symbols = yield* graph.findSymbol("DatabaseService")
            expect(symbols.length).toBe(1)
            expect(symbols[0].kind).toBe("class")

            const formatted = yield* graph.formatContext(sampleFile)
            expect(formatted).toBeDefined()
            expect(formatted).toContain("<code_graph")
            expect(formatted).toContain("DatabaseService")
            expect(formatted).toContain("import from=\"effect\"")
          }).pipe(Effect.provide(layer))
        }),
      ),
    ),
  )

  it.live("indexes the project to answer dependents and dependencies", () =>
    Effect.acquireRelease(
      Effect.promise(() => tmpdir()),
      (tmp) => Effect.promise(() => tmp[Symbol.asyncDispose]()),
    ).pipe(
      Effect.flatMap((tmp) =>
        Effect.gen(function* () {
          const write = (file: string, text: string) =>
            Effect.promise(async () => {
              await fs.mkdir(path.dirname(path.join(tmp.path, file)), { recursive: true })
              await fs.writeFile(path.join(tmp.path, file), text, "utf-8")
            })
          yield* write("src/util/math.ts", ["export function add(a: number, b: number) {", "  return a + b", "}"].join("\n"))
          yield* write("src/util/index.ts", 'export * from "./math"')
          yield* write(
            "src/app.ts",
            ["import {", "  add,", '} from "./util/math.js"', 'import { z } from "zod"', "export const total = add(1, 2)"].join(
              "\n",
            ),
          )
          yield* write("src/other.ts", 'import "./util"')

          yield* Effect.gen(function* () {
            const graph = yield* CodeGraph.Service
            expect(yield* graph.indexed()).toBe(4)
            expect((yield* graph.findDependents("src/util/math.ts")).sort()).toEqual(["src/app.ts", "src/util/index.ts"])
            expect(yield* graph.findDependents("src/util/index.ts")).toEqual(["src/other.ts"])
            expect(yield* graph.findDependencies("src/app.ts")).toEqual(["src/util/math.ts", "zod"])
            const hits = yield* graph.findSymbol("add")
            expect(hits[0]).toMatchObject({ name: "add", kind: "function", filePath: "src/util/math.ts", line: 1 })
          }).pipe(Effect.provide(makeGraphLayer(tmp.path)))
        }),
      ),
    ),
  )
})
