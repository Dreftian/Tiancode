import { createSignal } from "solid-js"

// Native inference has different billing; the old verbosity toggle is not consent to enable it.
const SPEED_MODE_KEY = "tiancode.chat.native_fast"

// Retain exported names for compatibility with existing callers.
// The backend consumes this marker only for supported Anthropic API models.
export const SPEED_MODE_2X_DIRECTIVE = "[TIANCODE_NATIVE_FAST]"

export function speedModeDirective(active: boolean, native: boolean) {
  if (!active) return undefined
  return [
    "[TIANCODE FAST WORKFLOW] Work directly on the requested task. Keep explanations concise, batch independent searches and tool calls when supported, reuse verified context and avoid redundant work. Preserve the requested scope, reasoning effort, permissions, required tests and correctness. Never skip necessary validation or claim unperformed work.",
    native ? SPEED_MODE_2X_DIRECTIVE : undefined,
  ]
    .filter(Boolean)
    .join("\n")
}

export const ULTRACODE_DIRECTIVE = `[TIANCODE ULTRACODE WORKFLOW]
For substantive tasks, inspect the relevant context, make a brief plan, implement in focused steps, and verify the result against the user's requirements. Adapt this workflow to task complexity; simple questions do not need a plan. Use available subagents for independent research or review when useful. Report meaningful progress and concrete validation, and continue until the requested outcome is complete or an actual blocker requires user input. Respect the user's permission mode. Never claim tools, tests, or verification you did not perform.`

export function supportsNativeFast(
  model: { id: string; provider?: { id: string }; api?: { id?: string; npm?: string } } | undefined,
) {
  if (model?.provider?.id !== "anthropic") return false
  return /^claude-opus-(?:5|4[.-]8)(?:-\d{8})?$/.test(model.api?.id ?? model.id)
}

const ULTRACODE_KEY = "tiancode.chat.ultracode"
export const [isUltracodeActive, setUltracodeState] = createSignal(
  typeof localStorage !== "undefined" && localStorage.getItem(ULTRACODE_KEY) === "true",
)
export function setUltracodeActive(value: boolean) {
  setUltracodeState(value)
  localStorage.setItem(ULTRACODE_KEY, String(value))
}
export function ultracodeVariant(variants: string[]) {
  return ["xhigh", "max", "high", "thinking", "medium"].find((value) => variants.includes(value))
}

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
 * Native acceleration never reduces the effort selected by the user.
 */
export function resolveSpeedVariant(input: {
  variants: string[] | undefined
  selected: string | undefined
  active: boolean
}): string | undefined {
  return input.selected
}
