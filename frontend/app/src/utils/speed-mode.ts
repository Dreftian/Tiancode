import { createSignal } from "solid-js"

const SPEED_MODE_KEY = "tiancode.chat.speed_mode_2x"

/**
 * Universal directive injected into the system prompt when 2x Speed Mode is active.
 * Applies to ALL models and providers to cut the time spent on pleasantries, preambles and
 * full-file rewrites.
 *
 * It deliberately says nothing about how hard to think: the reasoning depth is the user's
 * choice in the model picker (Low / Medium / High / Max), and 2x Mode is about not wasting
 * time around the work, not about doing the work with less care.
 */
export const SPEED_MODE_2X_DIRECTIVE = `[UNIVERSAL SPEED MODE: 2X FAST EXECUTION ACTIVE]
You are running in 2x High-Speed Execution Mode.
Strict execution rules:
1. Full reasoning depth: think exactly as hard as the selected reasoning effort calls for. Never cut analysis short to be fast — speed comes from what you skip around the work, not from the work itself.
2. Zero conversational filler: Skip all greetings, pleasantries, preambles (e.g. "Sure, I can help with that", "Let me check...", "I will now edit..."), and closing summaries.
3. Immediate tool use: Invoke tools directly to inspect, search, or edit files without announcing your intent beforehand.
4. Surgical edits: Never rewrite whole files when a targeted modification or concise replacement suffices.
5. High-speed response: Deliver code and answers with maximum brevity and precision.`

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
 * The variant to actually send while 2x Mode is active.
 *
 * It is the user's own selection, always. 2x Mode used to drop the model to its cheapest
 * reasoning tier, so picking "Max" and then turning 2x on silently gave you a shallower model
 * than the one you chose. Reasoning depth belongs to the model picker; 2x Mode only removes
 * preamble and filler through the system directive.
 */
export function resolveSpeedVariant(input: {
  variants: string[] | undefined
  selected: string | undefined
  active: boolean
}): string | undefined {
  return input.selected
}
