import { afterEach, describe, expect } from "bun:test"
import { Effect } from "effect"
import { ExperimentalPaths } from "../../src/server/routes/instance/httpapi/groups/experimental"
import { Server } from "../../src/server/server"
import { resetDatabase } from "../fixture/db"
import { disposeAllInstances, tmpdir } from "../fixture/fixture"
import { it } from "../lib/effect"
import { TestLLMServer } from "../lib/llm-server"
import { testProviderConfig } from "../lib/test-provider"

/** Must match OPTIMIZE_ERROR_MARK in handlers/experimental.ts. */
const OPTIMIZE_ERROR_MARK = "\u0000"

function app() {
  return Server.Default().app
}

const tmpdirEffect = (options: Parameters<typeof tmpdir>[0]) =>
  Effect.acquireRelease(
    Effect.promise(() => tmpdir(options)),
    (tmp) => Effect.promise(() => tmp[Symbol.asyncDispose]()),
  )

function optimize(directory: string, payload: Record<string, unknown>) {
  return Effect.promise(() =>
    Promise.resolve(
      app().request(ExperimentalPaths.promptOptimize, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-tiancode-directory": directory,
        },
        body: JSON.stringify(payload),
      }),
    ),
  )
}

afterEach(async () => {
  await disposeAllInstances()
  await resetDatabase()
})

describe("prompt optimize HttpApi", () => {
  // The regression this guards: the body is a lazy Stream returned from the handler, so it is
  // pulled only *after* the request middleware's `Effect.provideService(InstanceRef, …)` scope has
  // closed. When the stream did not carry that context itself every call died with "InstanceRef not
  // provided" and the client got nothing but the failure sentinel — 100% of the time, on every
  // model. Nothing below mocks the handler: this is the real route, the real middleware chain and a
  // real (fake) provider over HTTP.
  it.live(
    "streams model text back to the client",
    Effect.gen(function* () {
      const llm = yield* TestLLMServer
      const tmp = yield* tmpdirEffect({ config: testProviderConfig(llm.url) })
      const optimized = "### Objective\nAdd a login form."
      yield* llm.text(optimized)

      const response = yield* optimize(tmp.path, {
        prompt: "add login",
        providerID: "test",
        modelID: "test-model",
      })
      expect(response.status).toBe(200)

      const body = yield* Effect.promise(() => response.text())
      // The sentinel is how the handler reports a mid-stream failure; the body is flushed with a
      // 200 long before the model is called, so the status alone proves nothing.
      expect(body).not.toContain(OPTIMIZE_ERROR_MARK)
      expect(body.length).toBeGreaterThan(0)
      expect(body).toBe(optimized)
    }).pipe(Effect.provide(TestLLMServer.layer)),
    30_000,
  )

  it.live(
    "keeps reasoning out of the body but streams the answer that follows it",
    Effect.gen(function* () {
      const llm = yield* TestLLMServer
      const tmp = yield* tmpdirEffect({ config: testProviderConfig(llm.url) })
      const optimized = "### Objective\nShip the reasoning split."
      yield* llm.reason("the user wants a login form", { text: optimized })

      const response = yield* optimize(tmp.path, {
        prompt: "add login",
        providerID: "test",
        modelID: "test-model",
      })
      expect(response.status).toBe(200)

      const body = yield* Effect.promise(() => response.text())
      expect(body).not.toContain(OPTIMIZE_ERROR_MARK)
      // Chain of thought in the composer would overwrite the prompt the user wrote.
      expect(body).toBe(optimized)
    }).pipe(Effect.provide(TestLLMServer.layer)),
    30_000,
  )

  it.live(
    "reports a reasoning-only answer as its own failure, not as an empty body",
    Effect.gen(function* () {
      const llm = yield* TestLLMServer
      const tmp = yield* tmpdirEffect({ config: testProviderConfig(llm.url) })
      yield* llm.reason("thinking about the login form")

      const response = yield* optimize(tmp.path, {
        prompt: "add login",
        providerID: "test",
        modelID: "test-model",
      })
      expect(response.status).toBe(200)

      const body = yield* Effect.promise(() => response.text())
      const [text, code] = body.split(OPTIMIZE_ERROR_MARK)
      expect(text).toBe("")
      // An empty body alone reads to the client as "the model returned nothing", which is the one
      // thing that did not happen here.
      expect(code).toBe("reasoningOnly")
    }).pipe(Effect.provide(TestLLMServer.layer)),
    30_000,
  )
})
