import { describe, expect, test, beforeEach } from "bun:test"
import {
  getSpeed2xActive,
  isSpeed2xActive,
  resolveSpeedVariant,
  setSpeed2xActive,
  SPEED_MODE_2X_DIRECTIVE,
  toggleSpeed2x,
  supportsNativeFast,
  ultracodeVariant,
  ULTRACODE_DIRECTIVE,
  speedModeDirective,
} from "./speed-mode"

describe("speed-mode", () => {
  test("fast workflow works on all models and only requests native acceleration where supported", () => {
    expect(speedModeDirective(false, false)).toBeUndefined()
    expect(speedModeDirective(true, false)).toContain("batch independent searches")
    expect(speedModeDirective(true, false)).not.toContain(SPEED_MODE_2X_DIRECTIVE)
    expect(speedModeDirective(true, true)).toContain(SPEED_MODE_2X_DIRECTIVE)
    expect(speedModeDirective(true, false)).toContain("Preserve the requested scope, reasoning effort")
  })
  beforeEach(() => {
    setSpeed2xActive(false)
  })

  test("toggles speed 2x active state correctly", () => {
    expect(getSpeed2xActive()).toBe(false)
    expect(isSpeed2xActive()).toBe(false)

    setSpeed2xActive(true)
    expect(getSpeed2xActive()).toBe(true)
    expect(isSpeed2xActive()).toBe(true)

    toggleSpeed2x()
    expect(getSpeed2xActive()).toBe(false)

    toggleSpeed2x()
    expect(getSpeed2xActive()).toBe(true)
  })

  test("resolveSpeedVariant never changes the reasoning the user picked", () => {
    // Inactive: the user's own selection, untouched.
    expect(resolveSpeedVariant({ variants: ["high", "low"], selected: "high", active: false })).toBe("high")
    expect(resolveSpeedVariant({ variants: ["high", "low"], selected: undefined, active: false })).toBeUndefined()

    // Active: still the user's selection. 2x Mode used to drop to the cheapest tier, so
    // choosing "Max" and turning 2x on quietly gave you a shallower model than you asked for.
    expect(resolveSpeedVariant({ variants: ["high", "low"], selected: "high", active: true })).toBe("high")
    expect(resolveSpeedVariant({ variants: ["high", "none", "max"], selected: "max", active: true })).toBe("max")
    expect(resolveSpeedVariant({ variants: ["v1", "v2"], selected: "v2", active: true })).toBe("v2")
    expect(resolveSpeedVariant({ variants: [], selected: "high", active: true })).toBe("high")
    expect(resolveSpeedVariant({ variants: undefined, selected: undefined, active: true })).toBeUndefined()
  })

  test("native fast mode is offered only on supported Anthropic models", () => {
    expect(supportsNativeFast({ id: "claude-opus-5", provider: { id: "anthropic" } })).toBe(true)
    expect(supportsNativeFast({ id: "claude-opus-4-8", provider: { id: "anthropic" } })).toBe(true)
    expect(supportsNativeFast({ id: "claude-opus-4-7", provider: { id: "anthropic" } })).toBe(false)
    expect(supportsNativeFast({ id: "claude-opus-5", provider: { id: "openrouter" } })).toBe(false)
    expect(supportsNativeFast({ id: "glm-5", provider: { id: "zai" } })).toBe(false)
    expect(SPEED_MODE_2X_DIRECTIVE).not.toContain("2X")
  })

  test("Ultracode uses xhigh where available and never invents an API effort", () => {
    expect(ultracodeVariant(["low", "xhigh", "max"])).toBe("xhigh")
    expect(ultracodeVariant(["high", "max"])).toBe("max")
    expect(ultracodeVariant(["custom-a"])).toBeUndefined()
    expect(ultracodeVariant([])).toBeUndefined()
    expect(ULTRACODE_DIRECTIVE).toContain("verify")
  })
})
