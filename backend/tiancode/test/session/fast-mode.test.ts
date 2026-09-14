import { describe, expect, test } from "bun:test"
import { createAnthropic } from "@ai-sdk/anthropic"
import { generateText } from "ai"
import { nativeFastOptions } from "../../src/session/llm/fast-mode"

describe("native fast mode", () => {
  test("does not accelerate unsupported models or other providers", () => {
    const input = {
      providerID: "anthropic",
      apiID: "claude-opus-5",
      npm: "@ai-sdk/anthropic",
      system: "[TIANCODE_NATIVE_FAST]",
    }
    expect(nativeFastOptions(input)).toEqual({ speed: "fast" })
    expect(nativeFastOptions({ ...input, apiID: "claude-opus-4-7" })).toEqual({})
    expect(nativeFastOptions({ ...input, providerID: "openrouter" })).toEqual({})
    expect(nativeFastOptions({ ...input, system: undefined })).toEqual({})
  })

  test("real Anthropic SDK sends speed and beta header without reducing effort", async () => {
    const requests: { body: unknown; beta: string | null }[] = []
    const server = Bun.serve({
      port: 0,
      hostname: "127.0.0.1",
      async fetch(request) {
        requests.push({ body: await request.json(), beta: request.headers.get("anthropic-beta") })
        return Response.json({
          id: "msg_test",
          type: "message",
          role: "assistant",
          model: "claude-opus-5",
          content: [{ type: "text", text: "Done" }],
          stop_reason: "end_turn",
          stop_sequence: null,
          usage: { input_tokens: 1, output_tokens: 1 },
        })
      },
    })
    try {
      const provider = createAnthropic({ apiKey: "test", baseURL: `http://127.0.0.1:${server.port}` })
      const result = await generateText({
        model: provider("claude-opus-5"),
        prompt: "test",
        providerOptions: {
          anthropic: {
            effort: "xhigh",
            ...nativeFastOptions({
              providerID: "anthropic",
              apiID: "claude-opus-5",
              npm: "@ai-sdk/anthropic",
              system: "[TIANCODE_NATIVE_FAST]",
            }),
          },
        },
      })
      expect(result.text).toBe("Done")
      expect(requests[0]?.body).toMatchObject({ speed: "fast", output_config: { effort: "xhigh" } })
      expect(requests[0]?.beta).toContain("fast-mode-2026-02-01")
    } finally {
      await server.stop(true)
    }
  })
})
