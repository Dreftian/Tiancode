export * as Connections from "./connections"

import { Context, Effect, Fiber, Layer, Schema } from "effect"
import { LayerNode } from "@tiancode-ai/core/effect/layer-node"
import { Flag } from "@tiancode-ai/core/flag/flag"
import { ConfigConnections } from "@tiancode-ai/core/config/connections"
import { ConfigExperimental } from "@tiancode-ai/core/config/experimental"
import { ConfigV1 } from "@tiancode-ai/core/v1/config/config"
import { Auth } from "@/auth"
import { Config } from "@/config/config"
import { EventV2Bridge } from "@/event-v2-bridge"
import { ConnectionSenders as Senders } from "./senders"

// Messaging gateways behind Settings → Conexiones. One global service: it delivers session
// outcomes to Telegram / Discord / Slack / a signed webhook, answers the "test" buttons with
// real requests, and — for Telegram — polls the bot so a chat can drive a session.
//
// Non-secret settings live in the global config (experimental.connections); tokens and
// webhook URLs live in the credential store under connection:<provider> and are never
// returned to the renderer.

export type Provider = ConfigConnections.Provider
export type Settings = ConfigConnections.Resolved

export type Status = {
  readonly provider: Provider
  readonly enabled: boolean
  /** Enough is in place to deliver: a secret (or, for the webhook, a URL). */
  readonly configured: boolean
  readonly hasSecret: boolean
  readonly settings: Record<string, unknown>
  readonly lastDeliveryAt?: number
  readonly lastError?: string
  readonly inbound?: { readonly running: boolean; readonly lastUpdateAt?: number; readonly sessions: number }
}

export type TestResult = Senders.Result

export class InvalidSettingsError extends Schema.TaggedErrorClass<InvalidSettingsError>()(
  "ConnectionsInvalidSettingsError",
  { message: Schema.String },
  { httpApiStatus: 400 },
) {}

export interface Interface {
  readonly list: () => Effect.Effect<Status[]>
  readonly configure: (
    provider: Provider,
    input: { readonly settings?: Record<string, unknown>; readonly secret?: string },
  ) => Effect.Effect<Status, InvalidSettingsError>
  readonly remove: (provider: Provider) => Effect.Effect<Status>
  readonly test: (provider: Provider) => Effect.Effect<TestResult>
}

export class Service extends Context.Service<Service, Interface>()("@tiancode/Connections") {}

/** Injected so tests can drive the gateways without the network. */
export const FetchRef = Context.Reference<Senders.Fetch>("@tiancode/Connections/fetch", {
  defaultValue: () => globalThis.fetch,
})

export const secretKey = (provider: Provider) => `connection:${provider}`

const SETTINGS_SCHEMA: Record<Provider, Schema.Codec<unknown, unknown, never, never>> = {
  telegram: ConfigExperimental.TelegramConnection,
  discord: ConfigExperimental.DiscordConnection,
  slack: ConfigExperimental.SlackConnection,
  webhook: ConfigExperimental.WebhookConnection,
}

/** How often the Telegram supervisor re-reads the settings to start or stop the poller. */
const SUPERVISOR_TICK_MS = 2_000
const POLL_TIMEOUT_SECONDS = 25
const POLL_FAILURE_BACKOFF_MS = 5_000
/** session.status(idle) and the deprecated session.idle both fire; deliver once. */
const IDLE_DEDUPE_MS = 3_000
const TEXT_LIMIT = 3_500

const HELP =
  "Tiancode\n" +
  "Escribe un mensaje y lo ejecuto en el proyecto configurado; te respondo cuando termine.\n" +
  "/status — sesión vinculada y proyecto\n" +
  "/new — empezar una conversación nueva\n" +
  "/help — esta ayuda"

type MessagePayload =
  | { data?: Array<{ type?: string; role?: string; content?: Array<{ type?: string; text?: string }> }> }
  | Array<{ info?: { role?: string }; parts?: Array<{ type?: string; text?: string }> }>

/**
 * Last assistant text in a session's message list. Accepts both the v2 shape
 * (`{data:[{type:"assistant",content:[...]}]}`) and the v1 one (`[{info:{role},parts:[...]}]`).
 */
export function lastAssistantText(payload: unknown): string {
  const texts = (parts: Array<{ type?: string; text?: string }> | undefined) =>
    (parts ?? [])
      .filter((p) => p.type === "text" && typeof p.text === "string")
      .map((p) => p.text!.trim())
      .filter(Boolean)
      .join("\n\n")
  if (Array.isArray(payload)) {
    for (let i = payload.length - 1; i >= 0; i--) {
      const item = payload[i] as { info?: { role?: string }; parts?: Array<{ type?: string; text?: string }> }
      if (item?.info?.role !== "assistant") continue
      const text = texts(item.parts)
      if (text) return text
    }
    return ""
  }
  const data = (payload as { data?: unknown[] } | null)?.data
  if (!Array.isArray(data)) return ""
  for (let i = data.length - 1; i >= 0; i--) {
    const item = data[i] as { type?: string; content?: Array<{ type?: string; text?: string }> }
    if (item?.type !== "assistant") continue
    const text = texts(item.content)
    if (text) return text
  }
  return ""
}

function clip(text: string, max = TEXT_LIMIT) {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text
}

export function formatIdle(input: { title?: string; text?: string; directory?: string }) {
  const head = input.title ? `✅ ${input.title}` : "✅ Sesión terminada"
  const body = input.text ? clip(input.text) : "(sin respuesta de texto)"
  return `${head}\n\n${body}`
}

export function formatError(input: { title?: string; error?: string }) {
  return `❌ ${input.title ?? "Sesión"}: ${input.error ?? "error desconocido"}`
}

/** Exported for tests, which provide the config, credential store and event bus as mocks. */
export const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const config = yield* Config.Service
    const auth = yield* Auth.Service
    const events = yield* EventV2Bridge.Service
    const fetch = yield* FetchRef

    const state = {
      delivery: new Map<Provider, { at?: number; error?: string }>(),
      /** Telegram chat → session it is driving, and the reverse for replies. */
      chats: new Map<string, string>(),
      sessions: new Map<string, string>(),
      warnedChats: new Set<string>(),
      poller: undefined as Fiber.Fiber<void, never> | undefined,
      lastUpdateAt: undefined as number | undefined,
      recentIdle: new Map<string, number>(),
    }

    const settings = Effect.fn("Connections.settings")(function* () {
      const info = yield* config.getGlobal()
      const block = (info.experimental as { connections?: ConfigExperimental.Connections } | undefined)?.connections
      return ConfigConnections.apply(ConfigConnections.DEFAULTS, block)
    })

    const secret = Effect.fn("Connections.secret")(function* (provider: Provider) {
      const info = yield* auth.get(secretKey(provider)).pipe(Effect.orDie)
      return info?.type === "api" ? info.key : ""
    })

    const record = (provider: Provider, result: Senders.Result) => {
      const previous = state.delivery.get(provider)
      state.delivery.set(provider, result.ok ? { at: Date.now() } : { at: previous?.at, error: result.message })
      return result.ok
        ? Effect.logDebug("connection delivered", { provider, latencyMs: result.latencyMs })
        : Effect.logWarning("connection delivery failed", { provider, error: result.message })
    }

    const status = Effect.fn("Connections.status")(function* (provider: Provider, resolved?: Settings) {
      const current = resolved ?? (yield* settings())
      const key = yield* secret(provider)
      const delivery = state.delivery.get(provider)
      const cfg = current[provider]
      const out: Status = {
        provider,
        enabled: cfg.enabled,
        configured: provider === "webhook" ? Boolean(current.webhook.url) : Boolean(key),
        hasSecret: Boolean(key),
        settings: cfg as unknown as Record<string, unknown>,
        lastDeliveryAt: delivery?.at,
        lastError: delivery?.error,
        inbound:
          provider === "telegram"
            ? { running: state.poller !== undefined, lastUpdateAt: state.lastUpdateAt, sessions: state.chats.size }
            : undefined,
      }
      return out
    })

    // --- Talking to our own HTTP API for inbound prompts -------------------------------
    // The service is global; sessions live behind the per-directory instance layer. Going
    // through the API keeps the exact code path the desktop uses.
    const self = Effect.fn("Connections.self")(function* (directory: string, path: string, init?: RequestInit) {
      const server = yield* Effect.promise(() => import("@/server/server") as Promise<{ url?: URL }>)
      if (!server.url) return yield* Effect.fail(new Error("server url unknown"))
      const headers: Record<string, string> = {
        "content-type": "application/json",
        "x-tiancode-directory": directory,
        ...(init?.headers as Record<string, string> | undefined),
      }
      if (Flag.TIANCODE_SERVER_PASSWORD) {
        headers.authorization = `Basic ${Buffer.from(`tiancode:${Flag.TIANCODE_SERVER_PASSWORD}`).toString("base64")}`
      }
      const url = new URL(path, server.url)
      return yield* Effect.promise(() => fetch(url, { ...init, headers }))
    })

    const sessionText = Effect.fn("Connections.sessionText")(function* (sessionID: string, directory: string) {
      for (const path of [`/api/session/${sessionID}/message`, `/session/${sessionID}/message`]) {
        const response = yield* self(directory, path, { method: "GET" }).pipe(Effect.result)
        if (response._tag !== "Success" || !response.success.ok) continue
        const payload = yield* Effect.promise(() => response.success.json().catch(() => undefined))
        const text = lastAssistantText(payload as MessagePayload)
        if (text) return text
      }
      return ""
    })

    // --- Outbound delivery --------------------------------------------------------------
    const deliver = Effect.fn("Connections.deliver")(function* (
      kind: "idle" | "error",
      ctx: { sessionID: string; directory?: string; title?: string; text?: string; error?: string },
    ) {
      const resolved = yield* settings()
      const body = kind === "idle" ? formatIdle(ctx) : formatError(ctx)
      const chat = state.sessions.get(ctx.sessionID)
      const wants = (p: { enabled: boolean; notifyIdle: boolean; notifyError: boolean }) =>
        p.enabled && (kind === "idle" ? p.notifyIdle : p.notifyError)

      const t = resolved.telegram
      // A chat that asked for this session always gets its answer, whatever the notify flags say.
      if (t.enabled && (chat !== undefined || wants(t))) {
        const token = yield* secret("telegram")
        const chatId = chat ?? t.chatId
        if (token && chatId) {
          yield* record("telegram", yield* Effect.promise(() => Senders.telegram.send(fetch, token, chatId, body)))
        }
      }
      const d = resolved.discord
      if (wants(d)) {
        const key = yield* secret("discord")
        if (key) {
          const result =
            d.mode === "bot"
              ? Senders.discord.sendBot(fetch, key, d.channelId, body)
              : Senders.discord.sendWebhook(fetch, key, body)
          yield* record("discord", yield* Effect.promise(() => result))
        }
      }
      const s = resolved.slack
      if (wants(s)) {
        const url = yield* secret("slack")
        if (url) yield* record("slack", yield* Effect.promise(() => Senders.slack.send(fetch, url, body)))
      }
      const w = resolved.webhook
      const event = kind === "idle" ? "session.idle" : "session.error"
      if (w.enabled && w.url && w.events.includes(event)) {
        const key = yield* secret("webhook")
        yield* record(
          "webhook",
          yield* Effect.promise(() =>
            Senders.webhook.send(fetch, w.url, key, {
              event,
              at: new Date().toISOString(),
              sessionID: ctx.sessionID,
              directory: ctx.directory,
              title: ctx.title,
              text: ctx.text,
              error: ctx.error,
            }),
          ),
        )
      }
    })

    const anyoneListening = (resolved: Settings, kind: "idle" | "error", sessionID: string) => {
      if (state.sessions.has(sessionID) && resolved.telegram.enabled) return true
      const flag = kind === "idle" ? "notifyIdle" : "notifyError"
      return (
        (resolved.telegram.enabled && resolved.telegram[flag]) ||
        (resolved.discord.enabled && resolved.discord[flag]) ||
        (resolved.slack.enabled && resolved.slack[flag]) ||
        (resolved.webhook.enabled && resolved.webhook.events.includes(kind === "idle" ? "session.idle" : "session.error"))
      )
    }

    const onIdle = Effect.fn("Connections.onIdle")(function* (sessionID: string, directory: string | undefined) {
      const last = state.recentIdle.get(sessionID)
      if (last !== undefined && Date.now() - last < IDLE_DEDUPE_MS) return
      state.recentIdle.set(sessionID, Date.now())
      if (state.recentIdle.size > 200) state.recentIdle.delete(state.recentIdle.keys().next().value!)
      const resolved = yield* settings()
      if (!anyoneListening(resolved, "idle", sessionID)) return
      const text = directory ? yield* sessionText(sessionID, directory) : ""
      yield* deliver("idle", { sessionID, directory, text })
    })

    const onError = Effect.fn("Connections.onError")(function* (
      sessionID: string,
      directory: string | undefined,
      error: unknown,
    ) {
      const resolved = yield* settings()
      if (!anyoneListening(resolved, "error", sessionID)) return
      const detail = error as { name?: string; data?: { message?: string } } | undefined
      const message = detail?.data?.message ?? detail?.name ?? String(error ?? "")
      yield* deliver("error", { sessionID, directory, error: message })
    })

    const unsubscribe = yield* events.listen((event) =>
      Effect.gen(function* () {
        const directory = event.location?.directory
        if (event.type === "session.status") {
          const data = event.data as { sessionID?: string; status?: { type?: string } }
          if (data.status?.type === "idle" && data.sessionID) yield* onIdle(data.sessionID, directory)
          return
        }
        if (event.type === "session.idle") {
          const data = event.data as { sessionID?: string }
          if (data.sessionID) yield* onIdle(data.sessionID, directory)
          return
        }
        if (event.type === "session.error") {
          const data = event.data as { sessionID?: string; error?: unknown }
          if (data.sessionID) yield* onError(data.sessionID, directory, data.error)
        }
      }).pipe(Effect.catch((error) => Effect.logWarning("connections listener failed", { error: String(error) }))),
    )
    yield* Effect.addFinalizer(() => unsubscribe)

    // --- Telegram inbound -----------------------------------------------------------------
    const reply = (token: string, chatId: string, text: string) =>
      Effect.promise(() => Senders.telegram.send(fetch, token, chatId, text)).pipe(
        Effect.flatMap((result) => record("telegram", result)),
      )

    const runPrompt = Effect.fn("Connections.telegram.prompt")(function* (
      chatId: string,
      text: string,
      directory: string,
    ) {
      let sessionID = state.chats.get(chatId)
      if (!sessionID) {
        const created = yield* self(directory, "/api/session", { method: "POST", body: "{}" })
        if (!created.ok) return yield* Effect.fail(new Error(`no se pudo crear la sesión (HTTP ${created.status})`))
        const payload = (yield* Effect.promise(() => created.json())) as { data?: { id?: string } }
        if (!payload.data?.id) return yield* Effect.fail(new Error("respuesta inesperada al crear la sesión"))
        sessionID = payload.data.id
        state.chats.set(chatId, sessionID)
      }
      state.sessions.set(sessionID, chatId)
      const sent = yield* self(directory, `/api/session/${sessionID}/prompt`, {
        method: "POST",
        body: JSON.stringify({ prompt: { text } }),
      })
      if (!sent.ok) return yield* Effect.fail(new Error(`no se pudo enviar el mensaje (HTTP ${sent.status})`))
    })

    const handleUpdate = Effect.fn("Connections.telegram.update")(function* (
      update: Senders.TelegramUpdate,
      telegram: Settings["telegram"],
      token: string,
    ) {
      const message = update.message
      const text = message?.text?.trim()
      if (!message || !text) return
      const chatId = String(message.chat.id)
      if (chatId !== telegram.chatId) {
        if (!state.warnedChats.has(chatId)) {
          state.warnedChats.add(chatId)
          yield* reply(token, chatId, `Este chat no está autorizado. Su id es ${chatId}; ponlo en Ajustes → Conexiones.`)
        }
        return
      }
      state.lastUpdateAt = Date.now()
      if (text === "/start" || text === "/help") return yield* reply(token, chatId, HELP)
      if (text === "/new") {
        const previous = state.chats.get(chatId)
        state.chats.delete(chatId)
        if (previous) state.sessions.delete(previous)
        return yield* reply(token, chatId, "Conversación nueva. Escribe tu siguiente mensaje.")
      }
      if (text === "/status") {
        const session = state.chats.get(chatId)
        return yield* reply(
          token,
          chatId,
          `Sesión: ${session ?? "ninguna todavía"}\nProyecto: ${telegram.directory || "sin configurar"}`,
        )
      }
      if (!telegram.directory) {
        return yield* reply(token, chatId, "Falta el proyecto: elige la carpeta en Ajustes → Conexiones → Telegram.")
      }
      const result = yield* runPrompt(chatId, text, telegram.directory).pipe(Effect.result)
      if (result._tag === "Failure") {
        const error = result.failure
        yield* Effect.logWarning("telegram prompt failed", { error: String(error) })
        return yield* reply(token, chatId, `No pude ejecutarlo: ${error instanceof Error ? error.message : String(error)}`)
      }
      yield* reply(token, chatId, "⏳ Trabajando… te aviso al terminar.")
    })

    const poll = Effect.fn("Connections.telegram.poll")(function* () {
      let offset: number | undefined
      while (true) {
        const resolved = yield* settings()
        const token = yield* secret("telegram")
        const telegram = resolved.telegram
        if (!telegram.enabled || !telegram.inbound || !token) return
        const updates = yield* Effect.tryPromise({
          try: () => Senders.telegram.updates(fetch, token, offset, POLL_TIMEOUT_SECONDS),
          catch: (error) => (error instanceof Error ? error : new Error(String(error))),
        }).pipe(Effect.result)
        if (updates._tag === "Failure") {
          state.delivery.set("telegram", { at: state.delivery.get("telegram")?.at, error: updates.failure.message })
          yield* Effect.logWarning("telegram poll failed", { error: updates.failure.message })
          yield* Effect.sleep(POLL_FAILURE_BACKOFF_MS)
          continue
        }
        for (const update of updates.success) {
          offset = update.update_id + 1
          yield* handleUpdate(update, telegram, token).pipe(
            Effect.catch((error) => Effect.logWarning("telegram update failed", { error: String(error) })),
          )
        }
      }
    })

    // Starts and stops the poller as the settings change. Child fibers of this supervisor die
    // with it, so the poller can never outlive the layer.
    const supervise = Effect.fn("Connections.supervise")(function* () {
      while (true) {
        const resolved = yield* settings()
        const token = yield* secret("telegram")
        const wanted = resolved.telegram.enabled && resolved.telegram.inbound && Boolean(token)
        if (wanted && state.poller === undefined) {
          const fiber = yield* Effect.forkScoped(
            poll().pipe(
              Effect.catch((error) => Effect.logWarning("telegram poller stopped", { error: String(error) })),
              Effect.ensuring(Effect.sync(() => {
                if (state.poller === fiber) state.poller = undefined
              })),
            ),
          )
          state.poller = fiber
          yield* Effect.logInfo("telegram inbound started")
        } else if (!wanted && state.poller !== undefined) {
          yield* Fiber.interrupt(state.poller)
          state.poller = undefined
          yield* Effect.logInfo("telegram inbound stopped")
        }
        yield* Effect.sleep(SUPERVISOR_TICK_MS)
      }
    })
    yield* supervise().pipe(Effect.forkScoped)

    // --- Public API -----------------------------------------------------------------------
    const list = Effect.fn("Connections.list")(function* () {
      const resolved = yield* settings()
      const out: Status[] = []
      for (const provider of ConfigConnections.PROVIDERS) out.push(yield* status(provider, resolved))
      return out
    })

    const configure = Effect.fn("Connections.configure")(function* (
      provider: Provider,
      input: { readonly settings?: Record<string, unknown>; readonly secret?: string },
    ) {
      if (input.settings) {
        const decoded = yield* Schema.decodeUnknownEffect(SETTINGS_SCHEMA[provider])(input.settings).pipe(
          Effect.mapError((error) => new InvalidSettingsError({ message: String(error) })),
        )
        yield* config
          .updateGlobal({ experimental: { connections: { [provider]: decoded } } } as unknown as ConfigV1.Info)
          .pipe(Effect.orDie)
      }
      if (input.secret !== undefined) {
        if (input.secret === "") yield* auth.remove(secretKey(provider)).pipe(Effect.orDie)
        else yield* auth.set(secretKey(provider), { type: "api", key: input.secret }).pipe(Effect.orDie)
        // Fresh credentials: whatever was recorded no longer says anything about them.
        state.delivery.delete(provider)
      }
      return yield* status(provider)
    })

    const remove = Effect.fn("Connections.remove")(function* (provider: Provider) {
      yield* auth.remove(secretKey(provider)).pipe(Effect.orDie)
      yield* config
        .updateGlobal({ experimental: { connections: { [provider]: { enabled: false } } } } as unknown as ConfigV1.Info)
        .pipe(Effect.orDie)
      state.delivery.delete(provider)
      if (provider === "telegram") {
        state.chats.clear()
        state.sessions.clear()
        state.warnedChats.clear()
      }
      return yield* status(provider)
    })

    const test = Effect.fn("Connections.test")(function* (provider: Provider) {
      const resolved = yield* settings()
      const key = yield* secret(provider)
      const run = (): Promise<TestResult> => {
        switch (provider) {
          case "telegram":
            return key
              ? Senders.telegram.test(fetch, key, resolved.telegram.chatId)
              : Promise.resolve({ ok: false, message: "falta el token del bot", latencyMs: 0 })
          case "discord":
            return key
              ? Senders.discord.test(fetch, { mode: resolved.discord.mode, secret: key, channelId: resolved.discord.channelId })
              : Promise.resolve({ ok: false, message: "falta la URL del webhook o el token", latencyMs: 0 })
          case "slack":
            return key
              ? Senders.slack.test(fetch, key)
              : Promise.resolve({ ok: false, message: "falta la URL del webhook", latencyMs: 0 })
          case "webhook":
            return resolved.webhook.url
              ? Senders.webhook.test(fetch, resolved.webhook.url, key)
              : Promise.resolve({ ok: false, message: "falta la URL del endpoint", latencyMs: 0 })
        }
      }
      const result = yield* Effect.promise(run)
      yield* record(provider, result)
      return result
    })

    return { list, configure, remove, test } satisfies Interface
  }),
)

export const node = LayerNode.make({ service: Service, layer, deps: [Config.node, Auth.node, EventV2Bridge.node] })
