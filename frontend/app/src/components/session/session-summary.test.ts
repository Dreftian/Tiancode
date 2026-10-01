import { describe, expect, test } from "bun:test"
import { mcpStatusLabel, pluginEntries, pluginName, summaryConfigPath } from "./session-summary"

describe("session summary helpers", () => {
  test("MCP status text only for states the switch cannot express", () => {
    expect(mcpStatusLabel("failed")).toBe("session.summary.failed")
    expect(mcpStatusLabel("pending")).toBe("session.summary.connecting")
    expect(mcpStatusLabel("needs_auth")).toBe("session.summary.needsAuth")
    expect(mcpStatusLabel("connected")).toBeUndefined()
    expect(mcpStatusLabel("disabled")).toBeUndefined()
  })

  test("plugins keep their enabled state and drop UI-only builtin markers", () => {
    expect(
      pluginEntries(["zeta@1.0.0", ["@scope/alpha@^2", { enabled: false }], "builtin-voice", ["mid", { other: 1 }]]),
    ).toEqual([
      { spec: "@scope/alpha@^2", name: "@scope/alpha", enabled: false },
      { spec: "mid", name: "mid", enabled: true },
      { spec: "zeta@1.0.0", name: "zeta", enabled: true },
    ])
    expect(pluginEntries(undefined)).toEqual([])
  })

  test("local plugin paths show their file name", () => {
    expect(pluginName("file:///C:/plugins/env-guard.ts")).toBe("env-guard")
    expect(pluginName("./plugins/notify-idle.js")).toBe("notify-idle")
    expect(pluginName("C:\\tools\\commit-helper.ts")).toBe("commit-helper")
  })

  test("config candidates: project files first, then the global folder", () => {
    expect(summaryConfigPath({ directory: "/srv/app", config: "/home/u/.config/tiancode" })).toEqual([
      "/srv/app/tiancode.json",
      "/srv/app/tiancode.jsonc",
      "/srv/app/.tiancode/tiancode.json",
      "/home/u/.config/tiancode/tiancode.json",
      "/home/u/.config/tiancode/tiancode.jsonc",
    ])
    expect(summaryConfigPath({ directory: "C:\\proj\\" })[0]).toBe("C:\\proj\\tiancode.json")
  })
})
