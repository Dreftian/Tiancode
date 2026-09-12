import { afterEach, describe, expect } from "bun:test"
import { Effect } from "effect"
import { Server } from "../../src/server/server"
import { resetDatabase } from "../fixture/db"
import { disposeAllInstances, tmpdir } from "../fixture/fixture"
import { it } from "../lib/effect"

function app() {
  return Server.Default().app
}

const tmpdirEffect = (options: Parameters<typeof tmpdir>[0]) =>
  Effect.acquireRelease(
    Effect.promise(() => tmpdir(options)),
    (tmp) => Effect.promise(() => tmp[Symbol.asyncDispose]()),
  )

afterEach(async () => {
  await disposeAllInstances()
  await resetDatabase()
})

describe("skill HttpApi", () => {
  it.live(
    "serves the built-in catalogue with each skill's full body",
    Effect.gen(function* () {
      const tmp = yield* tmpdirEffect({ config: { formatter: false, lsp: false } })

      const response = yield* Effect.promise(() =>
        Promise.resolve(app().request("/skill", { headers: { "x-tiancode-directory": tmp.path } })),
      )

      expect(response.status).toBe(200)
      const skills = (yield* Effect.promise(() => response.json())) as {
        name: string
        description?: string
        content: string
        location: string
      }[]

      // The Settings panel has no fallback catalogue any more: whatever this endpoint returns is
      // what the user sees. An empty answer here is an empty panel.
      expect(Array.isArray(skills)).toBe(true)
      expect(skills.length).toBeGreaterThan(50)

      const review = skills.find((skill) => skill.name === "code-review-and-quality")
      expect(review).toBeDefined()
      // The panel renders this body as the skill's documentation, so a stub would be a silent
      // downgrade — the real file is ~20 KB.
      expect(review!.content.length).toBeGreaterThan(2_000)
      expect(review!.description ?? "").not.toBe("")
      for (const skill of skills) expect(skill.name).not.toBe("")
    }),
  )
})
