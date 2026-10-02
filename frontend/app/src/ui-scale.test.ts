import { describe, expect, test } from "bun:test"
import { stepUiScale, UI_SCALES } from "./ui-scale"

describe("ui scale", () => {
  test("offers 80 % to 120 % in 5 % steps", () => {
    expect(UI_SCALES.map((scale) => Math.round(scale * 100))).toEqual([80, 85, 90, 95, 100, 105, 110, 115, 120])
  })

  test("Ctrl + and Ctrl - move one step and stop at the ends", () => {
    expect(stepUiScale(1, 1)).toBe(1.05)
    expect(stepUiScale(1, -1)).toBe(0.95)
    expect(stepUiScale(1.2, 1)).toBe(1.2)
    expect(stepUiScale(0.8, -1)).toBe(0.8)
    // A scale from before the list (125 %, or a pinch) steps back into it.
    expect(stepUiScale(1.25, -1)).toBe(1.2)
    expect(stepUiScale(1.02, 1)).toBe(1.05)
    // ...and never against the key: Ctrl + does not shrink 125 % to 120 %.
    expect(stepUiScale(1.25, 1)).toBe(1.25)
    expect(stepUiScale(1.4, 1)).toBe(1.4)
    expect(stepUiScale(0.6, -1)).toBe(0.6)
    expect(stepUiScale(0.6, 1)).toBe(0.8)
  })
})
