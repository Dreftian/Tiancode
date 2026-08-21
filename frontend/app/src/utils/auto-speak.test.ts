import { describe, expect, test } from "bun:test"
import { isCompletedAutoSpeakMessage, prepareAutoSpeakText } from "./auto-speak"

describe("automatic speech eligibility", () => {
  test("accepts completed visible prose and removes markdown decoration", () => {
    expect(prepareAutoSpeakText("**Listo:** crearé el panel y luego verificaré la vista previa.")).toBe(
      "Listo: crearé el panel y luego verificaré la vista previa.",
    )
  })

  test("never prepares code, structured payloads, or oversized stream content", () => {
    expect(prepareAutoSpeakText("```tsx\nexport const App = () => <main />\n```")).toBeUndefined()
    expect(prepareAutoSpeakText('{"tool":"write","path":"App.tsx"}')).toBeUndefined()
    expect(prepareAutoSpeakText("a".repeat(8_001))).toBeUndefined()
  })

  test("requires a finalized non-summary assistant message", () => {
    const now = 1_000_000
    expect(isCompletedAutoSpeakMessage({ created: now - 500, completed: now - 1, now })).toBe(true)
    expect(isCompletedAutoSpeakMessage({ created: now - 500, now })).toBe(false)
    expect(isCompletedAutoSpeakMessage({ created: now - 500, completed: now - 1, error: {}, now })).toBe(false)
    expect(isCompletedAutoSpeakMessage({ created: now - 500, completed: now - 1, summary: true, now })).toBe(false)
    expect(isCompletedAutoSpeakMessage({ created: now - 120_001, completed: now - 1, now })).toBe(false)
  })
})
