export * as ConfigConnections from "./connections"

import { Effect } from "effect"
import { Config } from "../config"
import type { ConfigExperimental } from "./experimental"

/**
 * Resolved messaging-gateway settings, with defaults applied.
 *
 * Nothing is enabled until the user turns it on: unlike the Intelligence switches, a gateway
 * that is "on by default" would try to talk to a service nobody configured. Secrets (bot
 * tokens, webhook URLs, signing keys) are not here — they live in the credential store under
 * `connection:<provider>` and never in a config document.
 */
export type Provider = "telegram" | "discord" | "slack" | "webhook"
export const PROVIDERS: readonly Provider[] = ["telegram", "discord", "slack", "webhook"]

export interface Telegram {
  readonly enabled: boolean
  /** Chat the bot posts to, and the only chat it accepts commands from. */
  readonly chatId: string
  readonly notifyIdle: boolean
  readonly notifyError: boolean
  /** Poll the bot for incoming messages and run them as prompts. */
  readonly inbound: boolean
  /** Project directory inbound prompts run in. */
  readonly directory: string
}

export interface Discord {
  readonly enabled: boolean
  readonly mode: "webhook" | "bot"
  /** Only used in bot mode: the channel snowflake the bot posts to. */
  readonly channelId: string
  readonly notifyIdle: boolean
  readonly notifyError: boolean
}

export interface Slack {
  readonly enabled: boolean
  readonly notifyIdle: boolean
  readonly notifyError: boolean
}

export interface Webhook {
  readonly enabled: boolean
  readonly url: string
  readonly events: readonly string[]
}

export interface Resolved {
  readonly telegram: Telegram
  readonly discord: Discord
  readonly slack: Slack
  readonly webhook: Webhook
}

export const WEBHOOK_EVENTS = ["session.idle", "session.error"] as const

export const DEFAULTS: Resolved = {
  telegram: { enabled: false, chatId: "", notifyIdle: true, notifyError: true, inbound: false, directory: "" },
  discord: { enabled: false, mode: "webhook", channelId: "", notifyIdle: true, notifyError: true },
  slack: { enabled: false, notifyIdle: true, notifyError: true },
  webhook: { enabled: false, url: "", events: [...WEBHOOK_EVENTS] },
}

type Documents = readonly Config.Entry[]

function merge<T extends object>(base: T, patch: Partial<T> | undefined): T {
  if (!patch) return base
  const next = { ...base }
  for (const key of Object.keys(patch) as (keyof T)[]) {
    const value = patch[key]
    if (value !== undefined) next[key] = value as T[keyof T]
  }
  return next
}

/** Applies one document's block on top of already-resolved settings. */
export function apply(base: Resolved, connections: ConfigExperimental.Connections | undefined): Resolved {
  if (!connections) return base
  return {
    telegram: merge(base.telegram, connections.telegram),
    discord: merge(base.discord, connections.discord),
    slack: merge(base.slack, connections.slack),
    webhook: merge(base.webhook, connections.webhook),
  }
}

/**
 * Folds the layered config documents into the effective settings. Later documents override
 * earlier ones key by key, matching Config.entries() order (general first, most specific last).
 */
export function fromEntries(entries: Documents): Resolved {
  let resolved = DEFAULTS
  for (const entry of entries) {
    if (entry.type !== "document") continue
    resolved = apply(resolved, entry.info.experimental?.connections)
  }
  return resolved
}

/** Convenience wrapper for callers that can require Config.Service. */
export const resolve = Effect.fn("ConfigConnections.resolve")(function* () {
  const config = yield* Config.Service
  return fromEntries(yield* config.entries())
})
