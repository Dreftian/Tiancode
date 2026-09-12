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
      codeGraph: true,
      outputDistiller: true,
      toolCallRepair: true,
      loopBreaker: true,
      cleanWeb: true,
      autoSkillLearn: true,
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
    expect(resolved.codeGraph).toBe(true)
  })

  test("the code graph switch resolves like the others", () => {
    expect(ConfigIntelligence.fromEntries([doc({ codeGraph: false })]).codeGraph).toBe(false)
    expect(ConfigIntelligence.fromEntries([doc({ codeGraph: false }), doc({ codeGraph: true })]).codeGraph).toBe(true)
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

  test("the switches gating the agent loop resolve like the others", () => {
    const resolved = ConfigIntelligence.fromEntries([
      doc({ outputDistiller: false, toolCallRepair: false, loopBreaker: false, cleanWeb: false }),
      doc({ autoSkillLearn: false }),
    ])
    expect(resolved.outputDistiller).toBe(false)
    expect(resolved.toolCallRepair).toBe(false)
    expect(resolved.loopBreaker).toBe(false)
    expect(resolved.cleanWeb).toBe(false)
    expect(resolved.autoSkillLearn).toBe(false)
  })
})

describe("ConfigIntelligence.fromConfig", () => {
  test("an absent block is every default", () => {
    expect(ConfigIntelligence.fromConfig(undefined)).toEqual(ConfigIntelligence.DEFAULTS)
    expect(ConfigIntelligence.fromConfig({})).toEqual(ConfigIntelligence.DEFAULTS)
  })

  test("an explicit false wins and the rest stay on", () => {
    const resolved = ConfigIntelligence.fromConfig({ loopBreaker: false })
    expect(resolved.loopBreaker).toBe(false)
    expect(resolved.toolCallRepair).toBe(true)
  })
})
