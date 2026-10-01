import { test, expect } from "bun:test"
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import path from "node:path"
import { Effect, Layer } from "effect"
import { LayerNode } from "@tiancode-ai/core/effect/layer-node"
import { httpClient } from "@tiancode-ai/core/effect/app-node-platform"
import { HttpClient } from "effect/unstable/http"
import { FSUtil } from "@tiancode-ai/core/fs-util"
import { Npm } from "@tiancode-ai/core/npm"
import { CrossSpawnSpawner } from "@tiancode-ai/core/cross-spawn-spawner"
import { Config } from "@/config/config"
import { unredactConfigInfo } from "@/server/redact-config"
import { Global } from "@tiancode-ai/core/global"
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

// Settings sends partial patches ({ agent: { pentest: { disable: true } } }) through the HTTP
// handler, which restores redacted secrets first. That step used to add `provider: undefined`
// and `mcp: undefined`, and the merge then deleted both sections from the user's file.
test("a partial patch from the HTTP handler keeps the provider and mcp sections", async () => {
  await run((dir) =>
    Effect.gen(function* () {
      const file = path.join(dir, "tiancode.json")
      writeFileSync(
        file,
        JSON.stringify(
          {
            provider: { demo: { options: { apiKey: "{env:TIANCODE_TEST_SECRET}" } } },
            mcp: { docs: { type: "remote", url: "https://example.com/mcp" } },
          },
          null,
          2,
        ),
      )

      const svc = yield* Config.Service
      yield* svc.update(unredactConfigInfo({ agent: { pentest: { disable: true } } }, yield* svc.get()))

      const after = JSON.parse(readFileSync(file, "utf8"))
      expect(after.agent).toEqual({ pentest: { disable: true } })
      expect(after.provider).toEqual({ demo: { options: { apiKey: "{env:TIANCODE_TEST_SECRET}" } } })
      expect(after.mcp).toEqual({ docs: { type: "remote", url: "https://example.com/mcp" } })
    }),
  )
})

test("a partial patch keeps provider and mcp in a .jsonc project config", async () => {
  await run((dir) =>
    Effect.gen(function* () {
      const file = path.join(dir, "tiancode.jsonc")
      writeFileSync(
        file,
        [
          "{",
          "  // my providers",
          '  "provider": { "demo": { "options": { "baseURL": "http://localhost:1234" } } },',
          '  "mcp": { "docs": { "type": "remote", "url": "https://example.com/mcp" } }',
          "}",
        ].join("\n"),
      )

      const svc = yield* Config.Service
      yield* svc.update(unredactConfigInfo({ agent: { pentest: { disable: true } } }, yield* svc.get()))

      const after = readFileSync(file, "utf8")
      expect(after).toContain("// my providers")
      expect(after).toContain('"baseURL": "http://localhost:1234"')
      expect(after).toContain('"url": "https://example.com/mcp"')
      expect(after).toContain('"pentest"')
    }),
  )
})

test("a partial patch to the global config keeps provider, mcp and unknown keys", async () => {
  const file = path.join(Global.Path.config, "tiancode.json")
  const others = ["tiancode.jsonc", "config.json"].map((name) => path.join(Global.Path.config, name))
  const saved = [file, ...others].map((name) => [name, existsSync(name) ? readFileSync(name, "utf8") : undefined] as const)
  others.forEach((name) => rmSync(name, { force: true }))
  writeFileSync(
    file,
    JSON.stringify(
      {
        provider: { demo: { options: { apiKey: "{env:TIANCODE_TEST_SECRET}" } } },
        mcp: { docs: { type: "remote", url: "https://example.com/mcp" } },
        someFutureKey: { keep: true },
      },
      null,
      2,
    ),
  )
  try {
    await run(() =>
      Effect.gen(function* () {
        const svc = yield* Config.Service
        yield* svc.updateGlobal(unredactConfigInfo({ agent: { pentest: { disable: true } } }, yield* svc.getGlobal()))
        const after = JSON.parse(readFileSync(file, "utf8"))
        expect(after.agent).toEqual({ pentest: { disable: true } })
        expect(after.provider).toEqual({ demo: { options: { apiKey: "{env:TIANCODE_TEST_SECRET}" } } })
        expect(after.mcp).toEqual({ docs: { type: "remote", url: "https://example.com/mcp" } })
        expect(after.someFutureKey).toEqual({ keep: true })
      }),
    )
  } finally {
    saved.forEach(([name, text]) => (text === undefined ? rmSync(name, { force: true }) : writeFileSync(name, text)))
  }
})
