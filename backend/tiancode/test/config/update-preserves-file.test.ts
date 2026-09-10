import { test, expect } from "bun:test"
import { readFileSync, writeFileSync } from "node:fs"
import path from "node:path"
import { Effect, Layer } from "effect"
import { LayerNode } from "@tiancode-ai/core/effect/layer-node"
import { httpClient } from "@tiancode-ai/core/effect/app-node-platform"
import { HttpClient } from "effect/unstable/http"
import { FSUtil } from "@tiancode-ai/core/fs-util"
import { Npm } from "@tiancode-ai/core/npm"
import { CrossSpawnSpawner } from "@tiancode-ai/core/cross-spawn-spawner"
import { Config } from "@/config/config"
import { Auth } from "../../src/auth"
import { Account } from "../../src/account/account"
import { Env } from "../../src/env"
import { AuthTest } from "../fake/auth"
import { AccountTest } from "../fake/account"
import { NpmTest } from "../fake/npm"
import { provideTmpdirInstance, testInstanceStoreLayer } from "../fixture/fixture"

// Config.update() used to merge into the *loaded* config rather than the file on disk. Loading
// resolves {env:...} / {file:...} and drops every key the V1 schema does not know, so each save
// rewrote the user's file with plaintext secrets and without their unrecognised keys.

const layer = LayerNode.compile(LayerNode.group([Config.node, FSUtil.node, Env.node, CrossSpawnSpawner.node]), [
  [Auth.node, AuthTest.empty],
  [Account.node, AccountTest.empty],
  [Npm.node, NpmTest.noop],
  [httpClient, Layer.succeed(HttpClient.HttpClient, HttpClient.make(() => Effect.die("no http in this test")))],
])

const run = <A, E>(self: (dir: string) => Effect.Effect<A, E, Config.Service>) =>
  provideTmpdirInstance((dir) => Config.Service.use(() => self(dir)), { git: true }).pipe(
    Effect.scoped,
    Effect.provide(Layer.mergeAll(layer, testInstanceStoreLayer)),
    Effect.runPromise,
  )

test("update does not write a resolved {env:...} secret back into the project config", async () => {
  const SECRET = "sk-should-never-be-written-to-disk"
  process.env.TIANCODE_TEST_SECRET = SECRET
  try {
    await run((dir) =>
      Effect.gen(function* () {
        const file = path.join(dir, "tiancode.json")
        writeFileSync(
          file,
          JSON.stringify({ username: "before", provider: { demo: { options: { apiKey: "{env:TIANCODE_TEST_SECRET}" } } } }, null, 2),
        )

        const svc = yield* Config.Service
        yield* svc.update({ username: "after" })

        const after = readFileSync(file, "utf8")
        expect(after).toContain("after")
        // The whole point: the placeholder must survive, not its resolved value.
        expect(after).not.toContain(SECRET)
        expect(after).toContain("{env:TIANCODE_TEST_SECRET}")
      }),
    )
  } finally {
    delete process.env.TIANCODE_TEST_SECRET
  }
})

test("update keeps keys the config schema does not recognise", async () => {
  await run((dir) =>
    Effect.gen(function* () {
      const file = path.join(dir, "tiancode.json")
      writeFileSync(
        file,
        JSON.stringify({ username: "before", someFutureKey: { keep: true }, anotherTool: [1, 2, 3] }, null, 2),
      )

      const svc = yield* Config.Service
      yield* svc.update({ username: "after" })

      const after = JSON.parse(readFileSync(file, "utf8"))
      expect(after.username).toBe("after")
      // A key from a newer release, or another tool's block, must not be deleted by a save.
      expect(after.someFutureKey).toEqual({ keep: true })
      expect(after.anotherTool).toEqual([1, 2, 3])
    }),
  )
})
