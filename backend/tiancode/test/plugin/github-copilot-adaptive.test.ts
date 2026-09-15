import { expect, test } from "bun:test"
import { CopilotModels } from "@/plugin/github-copilot/models"

test("requests summarized adaptive thinking for every compatible Copilot model", async () => {
  const ids = ["claude-opus-4.7", "claude-opus-4.8", "claude-sonnet-4.6"]
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch(request) {
      if (new URL(request.url).pathname !== "/models") return new Response(null, { status: 404 })
      return Response.json({
        data: ids.map((id) => ({
          model_picker_enabled: true,
          id,
          name: id,
          version: `${id}-test`,
          supported_endpoints: ["/v1/messages"],
          capabilities: {
            family: "claude",
            limits: { max_context_window_tokens: 200000, max_output_tokens: 64000, max_prompt_tokens: 128000 },
            supports: { adaptive_thinking: true, reasoning_effort: ["low", "high"], streaming: true, tool_calls: true },
          },
        })),
      })
    },
  })
  try {
    const result = await CopilotModels.get(server.url.origin)
    expect(Object.keys(result.models)).toEqual(ids)
    ids.forEach((id) => {
      expect(result.models[id].variants).toEqual({
        low: { thinking: { type: "adaptive", display: "summarized" }, effort: "low" },
        high: { thinking: { type: "adaptive", display: "summarized" }, effort: "high" },
      })
    })
  } finally {
    await server.stop(true)
  }
})
