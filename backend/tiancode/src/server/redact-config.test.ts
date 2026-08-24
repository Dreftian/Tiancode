import { describe, expect, test } from "bun:test"
import type { ConfigV1 } from "@tiancode-ai/core/v1/config/config"
import { REDACTED, redactConfigInfo, unredactConfigInfo, unredactMcpEntry } from "./redact-config"

describe("redact-config", () => {
  test("redacts provider apiKeys but keeps non-secret options", () => {
    const info = {
      provider: {
        openai: {
          options: { apiKey: "sk-secret", baseURL: "https://api.openai.com/v1" },
        },
      },
    } as unknown as ConfigV1.Info

    const redacted = redactConfigInfo(info)
    const options = (redacted.provider as Record<string, { options: Record<string, string> }>).openai.options
    expect(options.apiKey).toBe(REDACTED)
    expect(options.baseURL).toBe("https://api.openai.com/v1")
  })

  test("redacts sensitive mcp environment and header values only", () => {
    const info = {
      mcp: {
        vision: {
          type: "local",
          command: ["npx", "vision"],
          environment: { VISION_API_KEY: "vk-123", LIVE_FRONTEND_CONFIG: "C:/cfg.json" },
        },
        remote: {
          type: "remote",
          url: "https://mcp.example",
          headers: { Authorization: "Bearer tok" },
        },
      },
    } as unknown as ConfigV1.Info

    const redacted = redactConfigInfo(info)
    const mcp = redacted.mcp as unknown as Record<string, Record<string, Record<string, string>>>
    expect(mcp.vision.environment.VISION_API_KEY).toBe(REDACTED)
    expect(mcp.vision.environment.LIVE_FRONTEND_CONFIG).toBe("C:/cfg.json")
    expect(mcp.remote.headers.Authorization).toBe(REDACTED)
  })

  test("round-trip: placeholders in an update restore the real values", () => {
    const existing = {
      provider: {
        openai: { options: { apiKey: "sk-secret", baseURL: "https://api.openai.com/v1" } },
      },
      mcp: {
        vision: {
          type: "local",
          command: ["npx", "vision"],
          environment: { VISION_API_KEY: "vk-123" },
        },
      },
    } as unknown as ConfigV1.Info

    const redacted = redactConfigInfo(existing)
    // El usuario edita otra cosa y reenvía el formulario tal cual.
    const restored = unredactConfigInfo(redacted, existing)
    expect(restored).toEqual(existing)
  })

  test("a new key typed over the placeholder wins", () => {
    const existing = { provider: { openai: { options: { apiKey: "old" } } } } as unknown as ConfigV1.Info
    const incoming = { provider: { openai: { options: { apiKey: "brand-new" } } } } as unknown as ConfigV1.Info
    const restored = unredactConfigInfo(incoming, existing)
    expect((restored.provider as Record<string, { options: { apiKey: string } }>).openai.options.apiKey).toBe(
      "brand-new",
    )
  })

  test("unredactMcpEntry restores oauth client secrets", () => {
    const existing = { type: "remote", url: "https://mcp.example", oauth: { clientSecret: "s3cret" } } as never
    const incoming = { type: "remote", url: "https://mcp.example", oauth: { clientSecret: REDACTED } } as never
    const restored = unredactMcpEntry(incoming, existing)
    expect((restored as { oauth: { clientSecret: string } }).oauth.clientSecret).toBe("s3cret")
  })
})
