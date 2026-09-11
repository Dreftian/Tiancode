export * as ConnectionSenders from "./senders"

import { createHmac } from "node:crypto"

// Outbound side of the messaging gateways. Plain functions over an injected fetch so every
// request shape is testable without the network; the service in connections.ts owns state.

export type Fetch = typeof globalThis.fetch

export type Result = {
  readonly ok: boolean
  readonly status?: number
  /** Human-readable outcome: the bot's name, the provider's error text, or the HTTP status. */
  readonly message: string
  readonly latencyMs: number
}

export const TELEGRAM_MAX = 4096
export const DISCORD_MAX = 2000
export const SLACK_MAX = 3000

/** Splits on paragraph, then line, then word boundaries so chunks stay readable. */
export function chunk(text: string, max: number): string[] {
  const out: string[] = []
  let rest = text.trim()
  while (rest.length > max) {
    let cut = -1
    for (const separator of ["\n\n", "\n", " "]) {
      cut = rest.lastIndexOf(separator, max)
      if (cut > max * 0.5) break
      cut = -1
    }
    if (cut === -1) cut = max
    out.push(rest.slice(0, cut).trimEnd())
    rest = rest.slice(cut).trimStart()
  }
  if (rest.length > 0) out.push(rest)
  return out
}

export function sign(secret: string, body: string) {
  return `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`
}

function describe(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

async function request(fetch: Fetch, input: string, init: RequestInit): Promise<Result & { body: string }> {
  const started = Date.now()
  try {
    const response = await fetch(input, init)
    const body = await response.text().catch(() => "")
    return {
      ok: response.ok,
      status: response.status,
      message: response.ok ? `HTTP ${response.status}` : errorText(body, response.status),
      latencyMs: Date.now() - started,
      body,
    }
  } catch (error) {
    return { ok: false, message: describe(error), latencyMs: Date.now() - started, body: "" }
  }
}

/** Pulls the provider's own explanation out of an error body when there is one. */
function errorText(body: string, status: number) {
  try {
    const parsed = JSON.parse(body) as { description?: string; message?: string; error?: string }
    const text = parsed.description ?? parsed.message ?? parsed.error
    if (typeof text === "string" && text) return `HTTP ${status}: ${text}`
  } catch {}
  const trimmed = body.trim()
  return trimmed ? `HTTP ${status}: ${trimmed.slice(0, 200)}` : `HTTP ${status}`
}

const json = (body: unknown): RequestInit => ({
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
})

async function sendChunks(parts: string[], send: (part: string) => Promise<Result>): Promise<Result> {
  let last: Result = { ok: true, message: "nothing to send", latencyMs: 0 }
  for (const part of parts) {
    last = await send(part)
    if (!last.ok) return last
  }
  return last
}

// --- Telegram -----------------------------------------------------------------------------

export type TelegramUpdate = {
  update_id: number
  message?: {
    message_id: number
    text?: string
    chat: { id: number | string; type?: string; title?: string; username?: string }
    from?: { id: number; username?: string; first_name?: string }
  }
}

export const telegram = {
  api: (token: string, method: string) => `https://api.telegram.org/bot${token}/${method}`,

  send: (fetch: Fetch, token: string, chatId: string, text: string) =>
    sendChunks(chunk(text, TELEGRAM_MAX), (part) =>
      request(fetch, telegram.api(token, "sendMessage"), json({ chat_id: chatId, text: part })),
    ),

  /** getMe proves the token; a real message proves the chat id. */
  test: async (fetch: Fetch, token: string, chatId: string): Promise<Result> => {
    const me = await request(fetch, telegram.api(token, "getMe"), { method: "GET" })
    if (!me.ok) return me
    let name = "bot"
    try {
      const parsed = JSON.parse(me.body) as { result?: { username?: string } }
      if (parsed.result?.username) name = `@${parsed.result.username}`
    } catch {}
    if (!chatId) return { ok: false, status: me.status, message: `${name}: chat id missing`, latencyMs: me.latencyMs }
    const sent = await telegram.send(fetch, token, chatId, "Tiancode conectado ✓")
    return { ...sent, message: sent.ok ? name : `${name}: ${sent.message}` }
  },

  updates: async (
    fetch: Fetch,
    token: string,
    offset: number | undefined,
    timeoutSeconds: number,
    signal?: AbortSignal,
  ): Promise<TelegramUpdate[]> => {
    const url = new URL(telegram.api(token, "getUpdates"))
    url.searchParams.set("timeout", String(timeoutSeconds))
    url.searchParams.set("allowed_updates", JSON.stringify(["message"]))
    if (offset !== undefined) url.searchParams.set("offset", String(offset))
    const response = await fetch(url, { method: "GET", signal })
    const body = (await response.json()) as { ok: boolean; result?: TelegramUpdate[]; description?: string }
    if (!response.ok || !body.ok) throw new Error(body.description ?? `HTTP ${response.status}`)
    return body.result ?? []
  },
}

// --- Discord ------------------------------------------------------------------------------

export const discord = {
  sendWebhook: (fetch: Fetch, url: string, text: string) =>
    sendChunks(chunk(text, DISCORD_MAX), (part) => request(fetch, url, json({ content: part }))),

  sendBot: (fetch: Fetch, token: string, channelId: string, text: string) =>
    sendChunks(chunk(text, DISCORD_MAX), (part) =>
      request(fetch, `https://discord.com/api/v10/channels/${channelId}/messages`, {
        ...json({ content: part }),
        headers: { "content-type": "application/json", authorization: `Bot ${token}` },
      }),
    ),

  test: (fetch: Fetch, input: { mode: "webhook" | "bot"; secret: string; channelId: string }) =>
    input.mode === "bot"
      ? discord.sendBot(fetch, input.secret, input.channelId, "Tiancode conectado ✓")
      : discord.sendWebhook(fetch, input.secret, "Tiancode conectado ✓"),
}

// --- Slack --------------------------------------------------------------------------------

export const slack = {
  send: (fetch: Fetch, url: string, text: string) =>
    sendChunks(chunk(text, SLACK_MAX), (part) => request(fetch, url, json({ text: part }))),
  test: (fetch: Fetch, url: string) => slack.send(fetch, url, "Tiancode conectado ✓"),
}

// --- Generic webhook ----------------------------------------------------------------------

export type WebhookPayload = {
  readonly event: string
  readonly at: string
  readonly sessionID?: string
  readonly directory?: string
  readonly title?: string
  readonly text?: string
  readonly error?: string
}

export const webhook = {
  send: (fetch: Fetch, url: string, secret: string, payload: WebhookPayload) => {
    const body = JSON.stringify(payload)
    const headers: Record<string, string> = {
      "content-type": "application/json",
      "x-tiancode-event": payload.event,
    }
    if (secret) headers["x-tiancode-signature"] = sign(secret, body)
    return request(fetch, url, { method: "POST", headers, body })
  },
  test: (fetch: Fetch, url: string, secret: string) =>
    webhook.send(fetch, url, secret, { event: "tiancode.test", at: new Date().toISOString() }),
}
