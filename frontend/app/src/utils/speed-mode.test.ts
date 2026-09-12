import { describe, expect, test, beforeEach } from "bun:test"
import {
  getSpeed2xActive,
  isSpeed2xActive,
  resolveSpeedVariant,
  setSpeed2xActive,
  SPEED_MODE_2X_DIRECTIVE,
  toggleSpeed2x,
} from "./speed-mode"

describe("speed-mode", () => {
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

  test("SPEED_MODE_2X_DIRECTIVE trims the talk, not the thinking", () => {
    expect(SPEED_MODE_2X_DIRECTIVE).toContain("UNIVERSAL SPEED MODE")
    expect(SPEED_MODE_2X_DIRECTIVE).toContain("Zero conversational filler")
    expect(SPEED_MODE_2X_DIRECTIVE).toContain("Immediate tool use")
    expect(SPEED_MODE_2X_DIRECTIVE).toContain("Surgical edits")
    expect(SPEED_MODE_2X_DIRECTIVE).toContain("Full reasoning depth")
    // It must never tell the model to think less: that is the user's setting, not ours.
    expect(SPEED_MODE_2X_DIRECTIVE).not.toContain("concise chain-of-thought")
    expect(SPEED_MODE_2X_DIRECTIVE).not.toContain("Ultra-fast reasoning")
  })
})
