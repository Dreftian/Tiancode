import { describe, expect, test } from "bun:test"
import {
  asNumber,
  gatewayState,
  isHttpUrl,
  looksLikeSnowflake,
  looksLikeTelegramToken,
  normalizeStatus,
  providerSettings,
  relativeTime,
} from "./connections-logic"

describe("gatewayState", () => {
  test("names the state a user needs to act on", () => {
    expect(gatewayState({ enabled: false, configured: false })).toBe("off")
    expect(gatewayState({ enabled: false, configured: true })).toBe("paused")
    // Switched on without a token: the most common misconfiguration.
    expect(gatewayState({ enabled: true, configured: false })).toBe("missing")
    expect(gatewayState({ enabled: true, configured: true })).toBe("active")
    expect(gatewayState({ enabled: true, configured: true, lastError: "HTTP 401" })).toBe("error")
  })
})

describe("normalizeStatus", () => {
  test("turns the SDK's stringly numbers back into numbers and keeps secrets out", () => {
    const status = normalizeStatus({
      provider: "telegram",
      enabled: true,
      configured: true,
      hasSecret: true,
      settings: { chatId: "42" },
      lastDeliveryAt: "NaN",
      inbound: { running: true, lastUpdateAt: 1700000000000, sessions: "2" },
    })
    expect(status.lastDeliveryAt).toBeUndefined()
    expect(status.inbound).toEqual({ running: true, lastUpdateAt: 1700000000000, sessions: 2 })
    expect(JSON.stringify(status)).not.toContain("secret")
  })

  test("asNumber", () => {
    expect(asNumber(3)).toBe(3)
    expect(asNumber("Infinity")).toBeUndefined()
    expect(asNumber(undefined)).toBeUndefined()
  })
})

describe("relativeTime", () => {
  const now = 1_000_000_000_000
  test("buckets by the unit a person would say", () => {
    expect(relativeTime(undefined, now)).toBeUndefined()
    expect(relativeTime(now - 20_000, now)).toEqual({ key: "justNow", n: 20 })
    expect(relativeTime(now - 5 * 60_000, now)).toEqual({ key: "minutes", n: 5 })
    expect(relativeTime(now - 3 * 3_600_000, now)).toEqual({ key: "hours", n: 3 })
    expect(relativeTime(now - 4 * 86_400_000, now)).toEqual({ key: "days", n: 4 })
  })
})

describe("input sanity checks", () => {
  test("recognise the shapes the providers expect", () => {
    expect(looksLikeTelegramToken("123456789:AAFwv3Q7aZk9x1r0PqL3sD8fG2hJ4kL6mN8")).toBe(true)
    expect(looksLikeTelegramToken("@my_bot")).toBe(false)
    expect(looksLikeSnowflake("1234567890123456789")).toBe(true)
    expect(looksLikeSnowflake("#tiancode-builds")).toBe(false)
    expect(isHttpUrl("https://hooks.slack.com/services/T0/B0/x")).toBe(true)
    expect(isHttpUrl("hooks.slack.com")).toBe(false)
  })
})

describe("providerSettings", () => {
  test("layers server settings over the panel defaults", () => {
    const merged = providerSettings(
      { provider: "slack", enabled: true, configured: false, hasSecret: false, settings: { notifyIdle: false } },
      { notifyIdle: true, notifyError: true },
    )
    expect(merged).toEqual({ notifyIdle: false, notifyError: true })
    expect(providerSettings(undefined, { a: 1 })).toEqual({ a: 1 })
  })
})
