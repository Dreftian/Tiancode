import { describe, expect, test } from "bun:test"
import { createHmac } from "node:crypto"
import { ConnectionSenders } from "../../src/connections/senders"

type Call = { url: string; init: RequestInit }

function fakeFetch(respond: (call: Call) => Response | Promise<Response>) {
  const calls: Call[] = []
  const fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const call = { url: input instanceof Request ? input.url : String(input), init: init ?? {} }
    calls.push(call)
    return respond(call)
  }) as typeof globalThis.fetch
  return { fetch, calls }
}

const ok = (body: unknown = { ok: true }) =>
  new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } })

describe("ConnectionSenders.chunk", () => {
  test("keeps short text whole and splits long text on paragraph boundaries", () => {
    expect(ConnectionSenders.chunk("hello", 10)).toEqual(["hello"])
    const parts = ConnectionSenders.chunk("aaaa aaaa\n\nbbbb bbbb\n\ncccc", 12)
    expect(parts).toEqual(["aaaa aaaa", "bbbb bbbb", "cccc"])
    expect(parts.every((p) => p.length <= 12)).toBe(true)
  })

  test("hard-cuts a single word longer than the limit instead of looping forever", () => {
    expect(ConnectionSenders.chunk("x".repeat(25), 10)).toEqual(["x".repeat(10), "x".repeat(10), "x".repeat(5)])
  })
})

describe("ConnectionSenders.sign", () => {
  test("is the hex HMAC-SHA256 of the body, prefixed like GitHub/Stripe do", () => {
    const body = '{"event":"tiancode.test"}'
    const expected = `sha256=${createHmac("sha256", "s3cret").update(body).digest("hex")}`
    expect(ConnectionSenders.sign("s3cret", body)).toBe(expected)
  })
})

describe("telegram", () => {
  test("test() proves the token with getMe, then the chat with a real message", async () => {
    const { fetch, calls } = fakeFetch((call) =>
      call.url.endsWith("/getMe") ? ok({ ok: true, result: { username: "tian_bot" } }) : ok(),
    )
    const result = await ConnectionSenders.telegram.test(fetch, "123:abc", "42")
    expect(result.ok).toBe(true)
    expect(result.message).toBe("@tian_bot")
    expect(calls.map((c) => c.url)).toEqual([
      "https://api.telegram.org/bot123:abc/getMe",
      "https://api.telegram.org/bot123:abc/sendMessage",
    ])
    expect(JSON.parse(String(calls[1].init.body))).toEqual({ chat_id: "42", text: "Tiancode conectado ✓" })
  })

  test("surfaces Telegram's own description on a bad token", async () => {
    const { fetch } = fakeFetch(
      () => new Response(JSON.stringify({ ok: false, description: "Unauthorized" }), { status: 401 }),
    )
    const result = await ConnectionSenders.telegram.test(fetch, "bad", "42")
    expect(result.ok).toBe(false)
    expect(result.message).toBe("HTTP 401: Unauthorized")
  })

  test("send() splits at 4096 and stops at the first failure", async () => {
    let n = 0
    const { fetch, calls } = fakeFetch(() => (++n === 2 ? new Response("nope", { status: 500 }) : ok()))
    const result = await ConnectionSenders.telegram.send(fetch, "t", "42", "a".repeat(9000))
    expect(result.ok).toBe(false)
    expect(result.message).toBe("HTTP 500: nope")
    expect(calls).toHaveLength(2)
  })
})

describe("webhook", () => {
  test("posts the JSON payload with an event header and an HMAC signature when a secret is set", async () => {
    const { fetch, calls } = fakeFetch(() => new Response(null, { status: 204 }))
    const result = await ConnectionSenders.webhook.send(fetch, "https://example.test/hook", "k", {
      event: "session.idle",
      at: "2026-09-11T00:00:00.000Z",
      sessionID: "s1",
      text: "done",
    })
    expect(result.ok).toBe(true)
    const headers = calls[0].init.headers as Record<string, string>
    expect(headers["x-tiancode-event"]).toBe("session.idle")
    expect(headers["x-tiancode-signature"]).toBe(ConnectionSenders.sign("k", String(calls[0].init.body)))
  })

  test("sends no signature header without a secret", async () => {
    const { fetch, calls } = fakeFetch(() => new Response(null, { status: 200 }))
    await ConnectionSenders.webhook.test(fetch, "https://example.test/hook", "")
    expect((calls[0].init.headers as Record<string, string>)["x-tiancode-signature"]).toBeUndefined()
  })
})

describe("discord and slack", () => {
  test("discord bot mode posts to the channel with a Bot token", async () => {
    const { fetch, calls } = fakeFetch(() => ok())
    await ConnectionSenders.discord.test(fetch, { mode: "bot", secret: "tok", channelId: "999" })
    expect(calls[0].url).toBe("https://discord.com/api/v10/channels/999/messages")
    expect((calls[0].init.headers as Record<string, string>).authorization).toBe("Bot tok")
  })

  test("slack reports the plain-text error body Slack returns", async () => {
    const { fetch } = fakeFetch(() => new Response("invalid_token", { status: 403 }))
    const result = await ConnectionSenders.slack.test(fetch, "https://hooks.slack.test/x")
    expect(result.ok).toBe(false)
    expect(result.message).toBe("HTTP 403: invalid_token")
  })
})
