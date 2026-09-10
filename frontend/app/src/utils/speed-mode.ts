import { createSignal } from "solid-js"

const SPEED_MODE_KEY = "tiancode.chat.speed_mode_2x"

/**
 * Universal directive injected into the system prompt when 2x Speed Mode is active.
 * Applies to ALL models and providers (OpenAI, Anthropic, Gemini, DeepSeek, Ollama, Groq, etc.)
 * to eliminate token wastage on pleasantries, preambles, and full-file rewrites.
 */
export const SPEED_MODE_2X_DIRECTIVE = `[UNIVERSAL SPEED MODE: 2X FAST EXECUTION ACTIVE]
You are running in 2x High-Speed Execution Mode.
Strict execution rules:
1. Ultra-fast reasoning & thinking: Keep internal chain-of-thought concise, direct, and focused solely on the immediate action. Do not repeat problem descriptions or over-analyze trivial steps.
2. Zero conversational filler: Skip all greetings, pleasantries, preambles (e.g. "Sure, I can help with that", "Let me check...", "I will now edit..."), and closing summaries.
3. Immediate tool use: Invoke tools directly to inspect, search, or edit files without announcing your intent beforehand.
4. Surgical edits: Never rewrite whole files when a targeted modification or concise replacement suffices.
5. High-speed response: Deliver code and answers with maximum brevity, speed, and precision.`

export const [isSpeed2xActive, setSpeed2xActiveState] = createSignal<boolean>(
  typeof localStorage !== "undefined" ? localStorage.getItem(SPEED_MODE_KEY) === "true" : false,
)

export function getSpeed2xActive(): boolean {
  return isSpeed2xActive()
}

export function setSpeed2xActive(active: boolean) {
  setSpeed2xActiveState(active)
  if (typeof localStorage !== "undefined") {
    localStorage.setItem(SPEED_MODE_KEY, active ? "true" : "false")
  }
}

export function toggleSpeed2x() {
  setSpeed2xActive(!getSpeed2xActive())
}

/**
 * Reasoning-effort variant names ordered from cheapest/fastest to most expensive.
 * Providers expose these under different names, so we match case-insensitively.
 */
const FAST_VARIANT_CANDIDATES = ["none", "off", "disabled", "minimal", "low", "fast", "quick", "standard", "medium"]

/**
 * Resolves the fastest reasoning variant a model exposes.
 *
 * Returns `undefined` when the model has no variant we can confidently rank as fast:
 * picking an arbitrary entry would be a coin flip, and guessing wrong makes 2x Mode
 * *slower* than the user's own selection (e.g. `["high", "medium", "low"]` — the first
 * entry is the slowest one).
 */
export function resolveFastVariant(variants: string[] | undefined): string | undefined {
  if (!variants || variants.length === 0) return undefined
  for (const candidate of FAST_VARIANT_CANDIDATES) {
    const match = variants.find((v) => v.toLowerCase() === candidate)
    if (match) return match
  }
  return undefined
}

/**
 * The variant to actually send while 2x Mode is active.
 *
 * This overrides the request only — the user's saved variant selection is untouched, so
 * toggling 2x off restores their choice. When the model exposes no rankable fast variant
 * we keep whatever the user picked rather than risk slowing the model down.
 */
export function resolveSpeedVariant(input: {
  variants: string[] | undefined
  selected: string | undefined
  active: boolean
}): string | undefined {
  if (!input.active) return input.selected
  return resolveFastVariant(input.variants) ?? input.selected
}
