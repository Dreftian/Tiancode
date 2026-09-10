import { describe, expect, test, beforeEach } from "bun:test"
import {
  getSpeed2xActive,
  isSpeed2xActive,
  resolveFastVariant,
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

  test("resolveFastVariant identifies fastest variant", () => {
    expect(resolveFastVariant(undefined)).toBeUndefined()
    expect(resolveFastVariant([])).toBeUndefined()

    // Selects "none" when available (thinking off)
    expect(resolveFastVariant(["high", "none", "max"])).toBe("none")

    // Selects "low" when none is not available
    expect(resolveFastVariant(["high", "low", "medium"])).toBe("low")

    // Prefers the cheapest tier, not merely the first recognised one
    expect(resolveFastVariant(["medium", "low"])).toBe("low")
    expect(resolveFastVariant(["low", "minimal"])).toBe("minimal")

    // Matches case-insensitively
    expect(resolveFastVariant(["High", "Low"])).toBe("Low")

    // Selects "fast" when available
    expect(resolveFastVariant(["standard", "fast"])).toBe("fast")

    // Unknown variant names are NOT ranked: guessing could pick the slowest entry
    // (e.g. ["high", "medium"] where the first item is the most expensive one).
    expect(resolveFastVariant(["v1", "v2"])).toBeUndefined()
  })

  test("resolveSpeedVariant only overrides while 2x is active", () => {
    // Inactive: always the user's own selection, untouched.
    expect(resolveSpeedVariant({ variants: ["high", "low"], selected: "high", active: false })).toBe("high")
    expect(resolveSpeedVariant({ variants: ["high", "low"], selected: undefined, active: false })).toBeUndefined()

    // Active: drops to the cheapest reasoning tier the model exposes.
    expect(resolveSpeedVariant({ variants: ["high", "low"], selected: "high", active: true })).toBe("low")
    expect(resolveSpeedVariant({ variants: ["high", "none"], selected: "high", active: true })).toBe("none")

    // Active but nothing rankable: keep the user's choice rather than risk slowing it down.
    expect(resolveSpeedVariant({ variants: ["v1", "v2"], selected: "v2", active: true })).toBe("v2")
    expect(resolveSpeedVariant({ variants: [], selected: "high", active: true })).toBe("high")
    expect(resolveSpeedVariant({ variants: undefined, selected: undefined, active: true })).toBeUndefined()
  })

  test("SPEED_MODE_2X_DIRECTIVE contains high-speed execution directives", () => {
    expect(SPEED_MODE_2X_DIRECTIVE).toContain("UNIVERSAL SPEED MODE")
    expect(SPEED_MODE_2X_DIRECTIVE).toContain("Zero conversational filler")
    expect(SPEED_MODE_2X_DIRECTIVE).toContain("Immediate tool use")
    expect(SPEED_MODE_2X_DIRECTIVE).toContain("Surgical edits")
  })
})
