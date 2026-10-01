import { describe, expect, test } from "bun:test"
import { redactConfig } from "@/cli/cmd/debug/redact"

const config = {
  provider: {
    example: {
      options: {
        apiKey: "sk-example",
        timeout: 1200,
        headers: { Authorization: "Bearer example", "X-API-Key": "key" },
      },
      models: { demo: { variants: { fast: { api_key: "variant-secret" } } } },
    },
  },
  mcp: {
    remote: { oauth: { clientSecret: "oauth-secret", clientId: "public" }, headers: { "x-custom": "opaque" } },
    local: { environment: { SERVICE_TOKEN: "env-secret", PATH: "/usr/bin" } },
  },
  url: "https://user:pass@example.com/path",
  query: "https://example.com/hook?token=abc",
  plain: "https://example.com/docs",
  normal: { context_tokens: 200000, name: "example" },
}

describe("debug config redaction", () => {
  test("masks credentials, headers and credentialed URLs without touching the rest", () => {
    const before = structuredClone(config)
    expect(redactConfig(config)).toEqual({
      provider: {
        example: {
          options: { apiKey: "***", timeout: 1200, headers: { Authorization: "***", "X-API-Key": "***" } },
          models: { demo: { variants: { fast: { api_key: "***" } } } },
        },
      },
      mcp: {
        remote: { oauth: { clientSecret: "***", clientId: "public" }, headers: { "x-custom": "***" } },
        local: { environment: { SERVICE_TOKEN: "***", PATH: "/usr/bin" } },
      },
      url: "***",
      query: "***",
      plain: "https://example.com/docs",
      normal: config.normal,
    })
    expect(config).toEqual(before)
  })
})
