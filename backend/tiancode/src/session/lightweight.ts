/**
 * Lightweight mode for small-context models.
 *
 * The full agent payload (default prompt, fourteen specialists, the skills catalogue, MCP
 * instructions, memory and ~30 tool schemas) weighs 30k+ tokens: fine for a 200k cloud model,
 * impossible for a local GGUF running at 8k–32k. llama-server rejects the request, Tiancode treats
 * that as an overflow and compacts an empty conversation, and the user sees a summary instead of
 * an answer. Local and small-context models therefore get a compact prompt and the core tools only.
 */
import type { Provider } from "@/provider/provider"

/** Models at or below this context get the lightweight payload. */
export const LIGHTWEIGHT_CONTEXT_MAX = 65_536

export const LOCAL_PROVIDERS: ReadonlySet<string> = new Set(["local", "ollama", "lmstudio", "tiancode-native"])

/** Core tools whose schemas stay small and that a local model can actually drive. */
export const LIGHTWEIGHT_TOOLS: ReadonlySet<string> = new Set([
  "read",
  "write",
  "edit",
  "apply_patch",
  "bash",
  "glob",
  "grep",
  "list",
  "ls",
  "todowrite",
  "todoread",
  "question",
  "webfetch",
])

export type LightweightMode = "auto" | "always" | "never"

export function lightweightMode(): LightweightMode {
  const value = process.env.TIANCODE_LIGHTWEIGHT?.trim().toLowerCase()
  return value === "always" || value === "never" ? value : "auto"
}

export function isLightweightModel(
  model: Pick<Provider.Model, "providerID"> & { limit: { context: number } },
  mode: LightweightMode = lightweightMode(),
): boolean {
  if (mode === "never") return false
  if (mode === "always") return true
  if (LOCAL_PROVIDERS.has(model.providerID)) return true
  return model.limit.context > 0 && model.limit.context <= LIGHTWEIGHT_CONTEXT_MAX
}

/** Project instructions (AGENTS.md and friends) capped so they cannot eat the whole context. */
export function trimInstructions(instructions: readonly string[], maxChars = 6000): string[] {
  const out: string[] = []
  let budget = maxChars
  for (const item of instructions) {
    if (budget <= 0) break
    if (item.length <= budget) {
      out.push(item)
      budget -= item.length
      continue
    }
    out.push(item.slice(0, budget) + "\n[…instructions truncated for a small-context model]")
    budget = 0
  }
  return out
}

/** The few environment facts a small model needs, without the workspace directives. */
export function lightweightEnvironment(input: {
  readonly model: Pick<Provider.Model, "name" | "providerID"> & { api: { id: string } }
  readonly directory: string
  readonly worktree: string
}): string[] {
  return [
    [
      `Environment: working directory "${input.directory}"${input.worktree && input.worktree !== input.directory ? `, workspace root "${input.worktree}"` : ""}, platform ${process.platform}, date ${new Date().toDateString()}.`,
      `Model: "${input.model.name}" (${input.model.providerID}/${input.model.api.id}).`,
    ].join("\n"),
  ]
}
