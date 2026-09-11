// Pure helpers behind the Conexiones panel, kept out of the component so they can be tested
// without Solid.

export type ConnectionProvider = "telegram" | "discord" | "slack" | "webhook"
export const CONNECTION_PROVIDERS: readonly ConnectionProvider[] = ["telegram", "discord", "slack", "webhook"]

/** What the server reports for one gateway (secrets never included). */
export type GatewayStatus = {
  provider: ConnectionProvider
  enabled: boolean
  configured: boolean
  hasSecret: boolean
  settings: Record<string, unknown>
  lastDeliveryAt?: number
  lastError?: string
  inbound?: { running: boolean; lastUpdateAt?: number; sessions: number }
}

export type GatewayState = "active" | "error" | "missing" | "paused" | "off"

/**
 * One word for the badge. "missing" is the case users hit most: the switch is on but the
 * token or URL was never saved, so nothing can be delivered.
 */
export function gatewayState(status: Pick<GatewayStatus, "enabled" | "configured" | "lastError">): GatewayState {
  if (!status.enabled) return status.configured ? "paused" : "off"
  if (!status.configured) return "missing"
  return status.lastError ? "error" : "active"
}

/** The generated SDK types numbers as `number | "NaN" | "Infinity" | …`; normalise once. */
export function asNumber(value: number | string | undefined | null): number | undefined {
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined
  if (typeof value === "string") {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : undefined
  }
  return undefined
}

export function normalizeStatus(raw: {
  provider: ConnectionProvider
  enabled: boolean
  configured: boolean
  hasSecret: boolean
  settings: Record<string, unknown>
  lastDeliveryAt?: number | string
  lastError?: string
  inbound?: { running: boolean; lastUpdateAt?: number | string; sessions: number | string }
}): GatewayStatus {
  return {
    provider: raw.provider,
    enabled: raw.enabled,
    configured: raw.configured,
    hasSecret: raw.hasSecret,
    settings: raw.settings ?? {},
    lastDeliveryAt: asNumber(raw.lastDeliveryAt),
    lastError: raw.lastError,
    inbound: raw.inbound
      ? {
          running: raw.inbound.running,
          lastUpdateAt: asNumber(raw.inbound.lastUpdateAt),
          sessions: asNumber(raw.inbound.sessions) ?? 0,
        }
      : undefined,
  }
}

export type RelativeTimeKey = "justNow" | "minutes" | "hours" | "days"

/** Buckets a past timestamp for an i18n string; the caller formats the words. */
export function relativeTime(then: number | undefined, now: number): { key: RelativeTimeKey; n: number } | undefined {
  if (then === undefined) return undefined
  const seconds = Math.max(0, Math.round((now - then) / 1000))
  if (seconds < 60) return { key: "justNow", n: seconds }
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return { key: "minutes", n: minutes }
  const hours = Math.round(minutes / 60)
  if (hours < 48) return { key: "hours", n: hours }
  return { key: "days", n: Math.round(hours / 24) }
}

export function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value.trim())
    return url.protocol === "https:" || url.protocol === "http:"
  } catch {
    return false
  }
}

/** Telegram bot tokens look like `123456789:AAF...`; catches pasting the bot name by mistake. */
export function looksLikeTelegramToken(value: string): boolean {
  return /^\d{6,}:[A-Za-z0-9_-]{30,}$/.test(value.trim())
}

/** Discord channel ids are snowflakes; a `#name` cannot be posted to. */
export function looksLikeSnowflake(value: string): boolean {
  return /^\d{15,22}$/.test(value.trim())
}

export function providerSettings<T extends Record<string, unknown>>(
  status: GatewayStatus | undefined,
  defaults: T,
): T {
  return { ...defaults, ...((status?.settings ?? {}) as Partial<T>) }
}
