import { describe, expect, test, beforeEach } from "bun:test"
import {
  getSpeed2xActive,
  isSpeed2xActive,
  resolveFastVariant,
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

    // Selects "fast" when available
    expect(resolveFastVariant(["standard", "fast"])).toBe("fast")

    // Falls back to first item if custom names
    expect(resolveFastVariant(["v1", "v2"])).toBe("v1")
  })

  test("SPEED_MODE_2X_DIRECTIVE contains high-speed execution directives", () => {
    expect(SPEED_MODE_2X_DIRECTIVE).toContain("UNIVERSAL SPEED MODE")
    expect(SPEED_MODE_2X_DIRECTIVE).toContain("Zero conversational filler")
    expect(SPEED_MODE_2X_DIRECTIVE).toContain("Immediate tool use")
    expect(SPEED_MODE_2X_DIRECTIVE).toContain("Surgical edits")
  })
})
