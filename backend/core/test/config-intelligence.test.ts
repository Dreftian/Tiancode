import { describe, expect, test } from "bun:test"
import { ConfigIntelligence } from "@tiancode-ai/core/config/intelligence"

// Config.entries() returns layered documents; only `type` and `info` matter here.
const doc = (intelligence?: Record<string, boolean>) =>
  ({ type: "document", info: { experimental: intelligence ? { intelligence } : undefined } }) as never

describe("ConfigIntelligence.fromEntries", () => {
  test("everything is on when nothing is configured", () => {
    expect(ConfigIntelligence.fromEntries([])).toEqual({
      userMemory: true,
      projectMemory: true,
      guardrails: true,
    })
  })

  test("a document without an intelligence block changes nothing", () => {
    expect(ConfigIntelligence.fromEntries([doc()])).toEqual(ConfigIntelligence.DEFAULTS)
  })

  test("an explicit false switches a capability off", () => {
    const resolved = ConfigIntelligence.fromEntries([doc({ userMemory: false })])
    expect(resolved.userMemory).toBe(false)
    // Untouched switches keep their default.
    expect(resolved.projectMemory).toBe(true)
    expect(resolved.guardrails).toBe(true)
  })

  test("a later document wins, since entries run general-to-specific", () => {
    const resolved = ConfigIntelligence.fromEntries([doc({ guardrails: false }), doc({ guardrails: true })])
    expect(resolved.guardrails).toBe(true)
  })

  test("a later document that omits a switch does not resurrect its default", () => {
    // The project config turns memory off; a `.tiancode` file that says nothing about it
    // must leave it off rather than silently re-enabling it.
    const resolved = ConfigIntelligence.fromEntries([doc({ projectMemory: false }), doc({ guardrails: false })])
    expect(resolved.projectMemory).toBe(false)
    expect(resolved.guardrails).toBe(false)
  })

  test("directory entries are ignored", () => {
    const directory = { type: "directory" } as never
    expect(ConfigIntelligence.fromEntries([directory, doc({ userMemory: false })]).userMemory).toBe(false)
  })
})
