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
1. Zero conversational filler: Skip greetings, pleasantries, preambles (e.g. "Sure, I can help with that", "Let me check...", "I will now edit..."), and closing summaries.
2. Immediate tool use: Invoke tools directly to inspect, search, or edit files without announcing your intent beforehand.
3. Surgical edits: Never rewrite whole files when a targeted modification or concise replacement suffices.
4. Minimal output: Deliver only the necessary code changes or direct answers. Complete the task with maximum speed and minimal token overhead.`

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
 * Resolves the fastest variant for models that support reasoning variants (CoT/effort).
 */
export function resolveFastVariant(variants: string[] | undefined): string | undefined {
  if (!variants || variants.length === 0) return undefined
  const candidates = ["none", "off", "low", "fast", "minimal", "standard"]
  for (const candidate of candidates) {
    const match = variants.find((v) => v.toLowerCase() === candidate)
    if (match) return match
  }
  return variants[0]
}
