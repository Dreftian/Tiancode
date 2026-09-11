import { describe, expect, test } from "bun:test"
import { Effect, Layer } from "effect"
import type { EventV2 } from "@tiancode-ai/core/event"
import { Auth } from "../../src/auth"
import { Config } from "../../src/config/config"
import { Connections } from "../../src/connections/connections"
import { EventV2Bridge } from "../../src/event-v2-bridge"

type Call = { url: string; body: unknown }

/**
 * Drives the service with in-memory config, credential store and event bus, and a fetch
 * that records every outbound request. Nothing here touches the network or disk.
 */
function harness(initial: Record<string, unknown>) {
  let global: Record<string, unknown> = initial
  const secrets = new Map<string, string>()
  const calls: Call[] = []
  const listeners: EventV2.Subscriber[] = []

  const fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = input instanceof Request ? input.url : String(input)
    calls.push({ url, body: init?.body ? JSON.parse(String(init.body)) : undefined })
    if (url.endsWith("/getMe")) return Response.json({ ok: true, result: { username: "tian_bot" } })
    return Response.json({ ok: true })
  }) as typeof globalThis.fetch

  const layer = Connections.layer.pipe(
    Layer.provide(
      Layer.mock(Config.Service)({
        getGlobal: () => Effect.succeed(global as never),
        updateGlobal: (patch) => {
          const next = patch as { experimental?: { connections?: Record<string, Record<string, unknown>> } }
          const current = (global.experimental as { connections?: Record<string, Record<string, unknown>> } | undefined)
            ?.connections ?? {}
          const merged: Record<string, Record<string, unknown>> = { ...current }
          for (const [provider, settings] of Object.entries(next.experimental?.connections ?? {})) {
            merged[provider] = { ...(current[provider] ?? {}), ...settings }
          }
          global = { ...global, experimental: { ...(global.experimental as object), connections: merged } }
          return Effect.succeed({ info: global as never, changed: true })
        },
      }),
    ),
    Layer.provide(
      Layer.mock(Auth.Service)({
        get: (key) => Effect.succeed(secrets.has(key) ? ({ type: "api", key: secrets.get(key)! } as never) : undefined),
        set: (key, info) => Effect.sync(() => void secrets.set(key, (info as { key: string }).key)),
        remove: (key) => Effect.sync(() => void secrets.delete(key)),
      }),
    ),
    Layer.provide(
      Layer.mock(EventV2Bridge.Service)({
        listen: (listener) =>
          Effect.sync(() => {
            listeners.push(listener)
            return Effect.void
          }),
      }),
    ),
    Layer.provide(Layer.succeed(Connections.FetchRef)(fetch)),
  )

  const run = <A, E>(f: (svc: Connections.Interface) => Effect.Effect<A, E>) =>
    Effect.runPromise(
      Effect.gen(function* () {
        const svc = yield* Connections.Service
        return yield* f(svc)
      }).pipe(Effect.provide(layer)),
    )

  const emit = (event: { type: string; data: Record<string, unknown>; directory?: string }) =>
    Effect.runPromise(
      Effect.forEach(listeners, (listener) =>
        listener({
          id: "evt",
          type: event.type,
          data: event.data,
          location: event.directory ? ({ directory: event.directory } as never) : undefined,
        } as never),
      ),
    )

  return { run, calls, secrets, emit, global: () => global }
}

describe("Connections", () => {
  test("nothing is configured or enabled out of the box", async () => {
    const h = harness({})
    const statuses = await h.run((svc) => svc.list())
    expect(statuses.map((s) => s.provider)).toEqual(["telegram", "discord", "slack", "webhook"])
    expect(statuses.every((s) => !s.enabled && !s.configured && !s.hasSecret)).toBe(true)
  })

  test("configure writes settings to the config and the secret to the credential store, never echoing it", async () => {
    const h = harness({})
    const status = await h.run((svc) =>
      svc.configure("telegram", { settings: { enabled: true, chatId: "42" }, secret: "123:abc" }),
    )
    expect(status.enabled).toBe(true)
    expect(status.configured).toBe(true)
    expect(JSON.stringify(status)).not.toContain("123:abc")
    expect(h.secrets.get("connection:telegram")).toBe("123:abc")
    expect(h.global()).toEqual({ experimental: { connections: { telegram: { enabled: true, chatId: "42" } } } })
  })

  test("configure rejects settings the schema does not know", async () => {
    const h = harness({})
    const failed = await h.run((svc) => svc.configure("slack", { settings: { enabled: "yes" } }).pipe(Effect.result))
    expect(failed._tag).toBe("Failure")
    if (failed._tag === "Failure") expect(failed.failure).toBeInstanceOf(Connections.InvalidSettingsError)
  })

  test("test() really talks to the provider and records the outcome", async () => {
    const h = harness({ experimental: { connections: { telegram: { enabled: true, chatId: "42" } } } })
    h.secrets.set("connection:telegram", "123:abc")
    const [result, status] = await h.run((svc) =>
      Effect.all([svc.test("telegram"), svc.list().pipe(Effect.map((all) => all[0]))]),
    )
    expect(result.ok).toBe(true)
    expect(result.message).toBe("@tian_bot")
    expect(h.calls.map((c) => c.url)).toEqual([
      "https://api.telegram.org/bot123:abc/getMe",
      "https://api.telegram.org/bot123:abc/sendMessage",
    ])
    expect(status.lastDeliveryAt).toBeGreaterThan(0)
    expect(status.lastError).toBeUndefined()
  })

  test("a session finishing is delivered to every enabled gateway that asked for it, once", async () => {
    const h = harness({
      experimental: {
        connections: {
          telegram: { enabled: true, chatId: "42", notifyIdle: true },
          slack: { enabled: true, notifyIdle: false },
          webhook: { enabled: true, url: "https://hooks.example.test/x", events: ["session.idle"] },
        },
      },
    })
    h.secrets.set("connection:telegram", "123:abc")
    h.secrets.set("connection:slack", "https://hooks.slack.test/y")
    h.secrets.set("connection:webhook", "k")
    await h.run(() => Effect.void) // builds the layer and registers the listener
    await h.emit({ type: "session.status", data: { sessionID: "s1", status: { type: "idle" } } })
    await h.emit({ type: "session.idle", data: { sessionID: "s1" } }) // deprecated twin: must not double-send

    const urls = h.calls.map((c) => c.url)
    expect(urls.filter((u) => u.includes("telegram"))).toHaveLength(1)
    expect(urls.filter((u) => u.includes("hooks.slack"))).toHaveLength(0)
    expect(urls.filter((u) => u.includes("hooks.example.test"))).toHaveLength(1)
    const webhook = h.calls.find((c) => c.url.includes("hooks.example.test"))!.body as { event: string; sessionID: string }
    expect(webhook.event).toBe("session.idle")
    expect(webhook.sessionID).toBe("s1")
  })

  test("remove disables the gateway and forgets its secret", async () => {
    const h = harness({ experimental: { connections: { slack: { enabled: true } } } })
    h.secrets.set("connection:slack", "https://hooks.slack.test/y")
    const status = await h.run((svc) => svc.remove("slack"))
    expect(status.enabled).toBe(false)
    expect(status.hasSecret).toBe(false)
    expect(h.secrets.has("connection:slack")).toBe(false)
  })

  test("lastAssistantText reads both message shapes and skips reasoning", () => {
    expect(
      Connections.lastAssistantText({
        data: [
          { type: "user" },
          { type: "assistant", content: [{ type: "reasoning", text: "hmm" }, { type: "text", text: "Listo." }] },
        ],
      }),
    ).toBe("Listo.")
    expect(
      Connections.lastAssistantText([
        { info: { role: "assistant" }, parts: [{ type: "text", text: "old" }] },
        { info: { role: "user" }, parts: [{ type: "text", text: "q" }] },
        { info: { role: "assistant" }, parts: [{ type: "text", text: "new" }] },
      ]),
    ).toBe("new")
    expect(Connections.lastAssistantText(null)).toBe("")
  })
})
