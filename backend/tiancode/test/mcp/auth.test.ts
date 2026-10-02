import { expect, test } from "bun:test"
import { setTimeout as sleep } from "node:timers/promises"
import { AppNodeBuilder } from "@tiancode-ai/core/effect/app-node-builder"
import { Effect, Layer } from "effect"
import { FSUtil } from "@tiancode-ai/core/fs-util"
import { randomBytes } from "node:crypto"
import { seal } from "@tiancode-ai/core/credential/cipher"
import { McpAuth } from "../../src/mcp/auth"

function authFile(initial = "") {
  let raw = initial
  let activeWrites = 0
  let sawOverlap = false

  const fsLayer = Layer.effect(
    FSUtil.Service,
    Effect.gen(function* () {
      const fs = yield* FSUtil.Service

      return FSUtil.Service.of({
        ...fs,
        readJson: (file) =>
          file.endsWith("mcp-auth.json")
            ? Effect.try({
                try: () => {
                  if (!raw) throw new Error("mcp-auth.json missing")
                  return JSON.parse(raw)
                },
                catch: (cause) => new FSUtil.FileSystemError({ method: "readJson", cause }),
              })
            : fs.readJson(file),
        writeJson: (file, value, mode) =>
          file.endsWith("mcp-auth.json")
            ? Effect.promise(async () => {
                activeWrites++
                sawOverlap = sawOverlap || activeWrites > 1
                raw = ""
                await sleep(10)
                const next = JSON.stringify(value, null, 2)
                raw = sawOverlap ? `${next}\n}` : next
                activeWrites--
              })
            : fs.writeJson(file, value, mode),
      })
    }),
  ).pipe(Layer.provide(AppNodeBuilder.build(FSUtil.node)))

  return { fsLayer, raw: () => raw }
}

function authService(fsLayer: Layer.Layer<FSUtil.Service>) {
  return McpAuth.Service.use((auth) => Effect.succeed(auth)).pipe(
    Effect.provide(AppNodeBuilder.build(McpAuth.node, [[FSUtil.node, fsLayer]])),
  )
}

test("serializes concurrent auth file updates across service instances", async () => {
  const file = authFile()

  await Effect.runPromise(
    Effect.gen(function* () {
      const first = yield* authService(file.fsLayer)
      const second = yield* authService(file.fsLayer)

      yield* Effect.all(
        [
          first.updateTokens("posthog", { accessToken: "access-token" }, "https://mcp.posthog.com/mcp"),
          second.updateClientInfo("posthog", { clientId: "client-id" }, "https://mcp.posthog.com/mcp"),
        ],
        { concurrency: "unbounded" },
      )

      const entry = yield* first.get("posthog")
      expect(entry?.tokens?.accessToken).toBe("access-token")
      expect(entry?.clientInfo?.clientId).toBe("client-id")
      expect(entry?.serverUrl).toBe("https://mcp.posthog.com/mcp")
      expect(() => JSON.parse(file.raw())).not.toThrow()
    }),
  )
})

test("keeps sign-ins sealed with another key and removes them only when asked", async () => {
  // Sealed with a key this run does not have, as after the profile's key was set aside.
  const foreign = seal(JSON.stringify({ tokens: { accessToken: "old" } }), randomBytes(32))
  const file = authFile(JSON.stringify({ github: foreign }))

  await Effect.runPromise(
    Effect.gen(function* () {
      const auth = yield* authService(file.fsLayer)
      yield* auth.set("linear", { tokens: { accessToken: "new" } })
      expect(JSON.parse(file.raw())).toMatchObject({ github: foreign, linear: { tokens: { accessToken: "new" } } })

      yield* auth.remove("github")
      expect(JSON.parse(file.raw()).github).toBeUndefined()
      expect(JSON.parse(file.raw()).linear).toBeDefined()
    }),
  )
})
