import { describe, expect, test } from "bun:test"
import { hasCustomAgent, primaryAgents, resolveAgent } from "./local-agent"

test("primary selector contains only Build and Plan without deleting custom agents", () => {
  const agents = [
    { name: "dreitz" },
    { name: "webapp" },
    { name: "fullstack-coder", mode: "subagent" },
    { name: "plan" },
    { name: "build" },
  ]
  expect(primaryAgents(agents).map((agent) => agent.name)).toEqual(["build", "plan"])
  expect(agents).toHaveLength(5)
  expect(primaryAgents([{ name: "plan", hidden: true }])).toEqual([])
})

describe("hasCustomAgent", () => {
  test("detects explicitly custom agents", () => {
    expect(hasCustomAgent([{ native: true }, { native: false }])).toBe(true)
  })

  test("ignores built-in and unclassified agents", () => {
    expect(hasCustomAgent([{ native: true }, {}])).toBe(false)
  })
})

describe("resolveAgent", () => {
  const agents = [{ name: "plan" }, { name: "build" }, { name: "custom" }]

  test("uses the requested available agent", () => {
    expect(resolveAgent(agents, "custom")?.name).toBe("custom")
  })

  test("defaults to build", () => {
    expect(resolveAgent(agents)?.name).toBe("build")
    expect(resolveAgent(agents, "missing")?.name).toBe("build")
  })

  test("uses the first agent when build is unavailable", () => {
    expect(resolveAgent([{ name: "custom" }], "missing")?.name).toBe("custom")
  })
})
