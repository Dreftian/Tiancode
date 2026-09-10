import type { Hooks, PluginInput } from "@tiancode-ai/plugin"

// Ported from opencode v1.18.30 (release 1.18.20). Cerebras models express their output limit
// through max_completion_tokens; sending maxOutputTokens as well applies a second, lower cap
// and truncates responses.
export async function CerebrasPlugin(_input: PluginInput): Promise<Hooks> {
  return {
    "chat.params": async (input, output) => {
      if (input.model.api.npm !== "@ai-sdk/cerebras") return
      if (output.options.max_completion_tokens === undefined) return
      output.maxOutputTokens = undefined
    },
  }
}
