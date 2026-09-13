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

/** Must match OPTIMIZE_HEARTBEAT_MARK in handlers/experimental.ts. */
const OPTIMIZE_HEARTBEAT_MARK = "\u0001"

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

  // The bug this guards: reasoning deltas are filtered out of the body, so while a reasoning model
  // thinks the client receives zero bytes on a healthy connection. The composer could not tell that
  // from a dead stream and aborted it on its own deadline, reporting a generic failure. The
  // heartbeat makes the silence observable — and must never leak into the optimized text.
  it.live(
    "heartbeats for a caller that asked, while the model is still thinking",
    Effect.gen(function* () {
      const llm = yield* TestLLMServer
      const tmp = yield* tmpdirEffect({ config: testProviderConfig(llm.url) })
      const optimized = "### Objective\nOutlast the thinking phase."
      // Longer than one heartbeat interval: the model opens its response and then says nothing.
      yield* llm.hold(optimized, new Promise<void>((resolve) => setTimeout(resolve, 6_500)))

      const response = yield* optimize(tmp.path, {
        prompt: "add login",
        providerID: "test",
        modelID: "test-model",
        heartbeat: true,
      })
      expect(response.status).toBe(200)

      const body = yield* Effect.promise(() => response.text())
      expect(body).not.toContain(OPTIMIZE_ERROR_MARK)
      // Heartbeats are transport, not content: stripping them must leave exactly the answer. This
      // is the whole guarantee — NOT that they all precede the text. The emit-side filter is
      // evaluated when a tick resolves and `Stream.merge` rendezvouses with the body, so a
      // heartbeat that passed the filter just before the first text delta may be handed on after
      // it. Asserting on the position of the last one would be asserting on that race.
      expect(body.split(OPTIMIZE_HEARTBEAT_MARK).join("")).toBe(optimized)
      // Two at least: one immediately (it is what flushes the headers out of Node's buffer, so the
      // client's `await fetch()` resolves now rather than in 6.5 s) and one 5 s into the silence.
      expect(body.split(OPTIMIZE_HEARTBEAT_MARK).length - 1).toBeGreaterThanOrEqual(2)
    }).pipe(Effect.provide(TestLLMServer.layer)),
    30_000,
  )

  // The heartbeat is an addition to a body documented as text/plain, and the callers that already
  // exist do not strip it: the generated SDK's `optimize()` hands back the raw body, and so does
  // any desktop build older than the `heartbeat` field. Silence for them is a display bug, not a
  // hang — so the bytes have to stay exactly as they were.
  it.live(
    "sends no heartbeat to a caller that did not ask, however long the model thinks",
    Effect.gen(function* () {
      const llm = yield* TestLLMServer
      const tmp = yield* tmpdirEffect({ config: testProviderConfig(llm.url) })
      const optimized = "### Objective\nKeep the old body byte-identical."
      // Same silence as above: long enough that an ungated heartbeat would have fired twice.
      yield* llm.hold(optimized, new Promise<void>((resolve) => setTimeout(resolve, 6_500)))

      const response = yield* optimize(tmp.path, {
        prompt: "add login",
        providerID: "test",
        modelID: "test-model",
      })
      expect(response.status).toBe(200)

      const body = yield* Effect.promise(() => response.text())
      expect(body).not.toContain(OPTIMIZE_HEARTBEAT_MARK)
      expect(body).toBe(optimized)
    }).pipe(Effect.provide(TestLLMServer.layer)),
    30_000,
  )
})
