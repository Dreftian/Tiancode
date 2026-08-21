import { describe, expect, test } from "bun:test"
import { isBenignRendererError } from "./renderer-error"

describe("isBenignRendererError", () => {
  test("filters Chromium ResizeObserver delivery diagnostics", () => {
    expect(isBenignRendererError("ResizeObserver loop completed with undelivered notifications.")).toBe(true)
    expect(isBenignRendererError("ResizeObserver loop limit exceeded")).toBe(true)
  })

  test("keeps real renderer errors reportable", () => {
    expect(isBenignRendererError("Cannot read properties of undefined")).toBe(false)
  })
})
