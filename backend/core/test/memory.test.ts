import { describe, expect } from "bun:test"
import { Effect, Layer } from "effect"
import { Memory } from "@tiancode-ai/core/memory"
import { Location } from "@tiancode-ai/core/location"
import { Global } from "@tiancode-ai/core/global"
import { AppNodeBuilder } from "@tiancode-ai/core/effect/app-node-builder"
import { testEffect } from "./lib/effect"
import { tmpdir } from "./fixture/tmpdir"
import { AbsolutePath } from "@tiancode-ai/core/schema"
import { Project } from "@tiancode-ai/core/project"
import path from "path"
import fs from "fs/promises"

const it = testEffect(Layer.empty)

const makeMemoryLayer = (input: { config: string; projectDir: string }) =>
  AppNodeBuilder.build(Memory.node, [
    [Global.node, Global.layerWith({ config: input.config })],
    [
      Location.node,
      Layer.succeed(Location.Service, {
        directory: AbsolutePath.make(input.projectDir),
        project: { id: Project.ID.make("test-proj"), directory: AbsolutePath.make(input.projectDir) },
      }),
    ],
  ])

describe("Memory service", () => {
  it.live("reads, writes, trims, and recalls user and project memory", () =>
    Effect.acquireRelease(
      Effect.promise(() => tmpdir()),
      (tmp) => Effect.promise(() => tmp[Symbol.asyncDispose]()),
    ).pipe(
      Effect.flatMap((tmp) =>
        Effect.gen(function* () {
          const configDir = path.join(tmp.path, "config")
          const projectDir = path.join(tmp.path, "project")
          yield* Effect.promise(async () => {
            await fs.mkdir(configDir, { recursive: true })
            await fs.mkdir(projectDir, { recursive: true })
          })

          const layer = makeMemoryLayer({ config: configDir, projectDir })

          yield* Effect.gen(function* () {
            const mem = yield* Memory.Service

            expect(yield* mem.readUser()).toBe("")
            expect(yield* mem.readProject()).toBe("")
            expect(yield* mem.format()).toBeUndefined()

            yield* mem.saveUser("Always prefer bun over npm and strict TypeScript", "preference")
            const userMem = yield* mem.readUser()
            expect(userMem).toContain("Always prefer bun over npm")
            expect(userMem).toContain("## PREFERENCE")

            yield* mem.saveProject("API runs on port 4000 and uses PostgreSQL", "architecture")
            const projMem = yield* mem.readProject()
            expect(projMem).toContain("port 4000")
            expect(projMem).toContain("## ARCHITECTURE")

            const formatted = yield* mem.format()
            expect(formatted).toBeDefined()
            expect(formatted).toContain("<long_term_memory>")
            expect(formatted).toContain("<user_preferences>")
            expect(formatted).toContain("<project_memory>")

            const searchRes = yield* mem.recall("PostgreSQL")
            expect(searchRes.matching.length).toBeGreaterThan(0)
            expect(searchRes.matching[0]).toContain("PostgreSQL")
          }).pipe(Effect.provide(layer))
        }),
      ),
    ),
  )
})
