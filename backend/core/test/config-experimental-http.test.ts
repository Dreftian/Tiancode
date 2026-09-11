import { describe, expect, test } from "bun:test"
import { Schema } from "effect"
import { ConfigV1 } from "@tiancode-ai/core/v1/config/config"
import { ConfigConnections } from "@tiancode-ai/core/config/connections"
import type { Config } from "@tiancode-ai/core/config"

// PATCH /global/config decodes its body with ConfigV1.Info. The settings panels write
// experimental.intelligence and experimental.connections through that route; if the V1 struct
// does not declare them the decoder silently drops them and the switches never reach disk.
// That is exactly what happened to the Intelligence tab in 1.0.40.

describe("experimental settings survive the V1 config schema", () => {
  test("intelligence and connections are kept, unknown keys are still dropped", () => {
    const decoded = Schema.decodeUnknownSync(ConfigV1.Info)({
      experimental: {
        batch_tool: true,
        intelligence: { guardrails: false, codeGraph: true },
        connections: { telegram: { enabled: true, chatId: "42", inbound: true }, webhook: { events: ["session.idle"] } },
        somethingElse: { dropped: true },
      },
    })
    expect(decoded.experimental).toEqual({
      batch_tool: true,
      intelligence: { guardrails: false, codeGraph: true },
      connections: { telegram: { enabled: true, chatId: "42", inbound: true }, webhook: { events: ["session.idle"] } },
    })
  })
})

describe("ConfigConnections.fromEntries", () => {
  const doc = (experimental: unknown): Config.Entry =>
    ({ type: "document", info: { experimental } }) as unknown as Config.Entry

  test("nothing is enabled until a document says so", () => {
    const resolved = ConfigConnections.fromEntries([])
    expect(resolved).toEqual(ConfigConnections.DEFAULTS)
    expect(ConfigConnections.PROVIDERS.every((p) => resolved[p].enabled === false)).toBe(true)
  })

  test("later documents override earlier ones key by key, keeping the rest", () => {
    const resolved = ConfigConnections.fromEntries([
      doc({ connections: { telegram: { enabled: true, chatId: "1", notifyError: false } } }),
      doc({ connections: { telegram: { chatId: "2" }, slack: { enabled: true } } }),
      doc({}),
    ])
    expect(resolved.telegram).toEqual({ ...ConfigConnections.DEFAULTS.telegram, enabled: true, chatId: "2", notifyError: false })
    expect(resolved.slack.enabled).toBe(true)
    expect(resolved.discord).toEqual(ConfigConnections.DEFAULTS.discord)
  })
})
