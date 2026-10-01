import { describe, expect, test } from "bun:test"
import { isQuietError } from "./notification"

describe("isQuietError", () => {
  test("stopping a turn and compaction overflow are not reported as errors", () => {
    expect(isQuietError({ name: "MessageAbortedError", data: { message: "Aborted" } })).toBe(true)
    expect(isQuietError({ name: "ContextOverflowError", data: { message: "too long" } })).toBe(true)
  })

  test("real failures still are", () => {
    expect(isQuietError({ name: "APIError", data: { message: "500" } })).toBe(false)
    expect(isQuietError("boom")).toBe(false)
    expect(isQuietError(undefined)).toBe(false)
  })
})
