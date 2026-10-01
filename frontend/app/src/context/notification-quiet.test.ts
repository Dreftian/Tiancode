import { describe, expect, test } from "bun:test"
import { isQuietError, lastAssistantText } from "./notification"

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

describe("lastAssistantText", () => {
  test("takes the newest assistant message with text", () => {
    const messages = [
      { info: { role: "user" }, parts: [{ type: "text", text: "hazlo" }] },
      { info: { role: "assistant" }, parts: [{ type: "text", text: "Primero" }] },
      { info: { role: "assistant" }, parts: [{ type: "reasoning", text: "pienso" }, { type: "text", text: "¿Sigo?" }] },
      { info: { role: "assistant" }, parts: [{ type: "tool" }] },
    ]
    expect(lastAssistantText(messages)).toBe("¿Sigo?")
    expect(lastAssistantText(undefined)).toBe("")
  })
})
