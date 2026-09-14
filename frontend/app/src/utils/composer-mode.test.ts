import { describe, expect, test } from "bun:test"
import { composerPermissionRules, getComposerMode, setComposerMode } from "./composer-mode"

describe("session composer modes", () => {
  const baseline = [{ permission: "browser", pattern: "https://private.example", action: "deny" as const }]

  test("Auto restores the original permission rules and explicit denials survive all modes", () => {
    expect(composerPermissionRules("auto", baseline)).toEqual(baseline)
    for (const mode of ["manual", "accept-edits", "plan", "skip"] as const) {
      expect(composerPermissionRules(mode, baseline).at(-1)).toEqual(baseline[0])
    }
  })

  test("Manual asks, Accept edits allows editing, Plan restricts execution, Skip allows requests", () => {
    expect(composerPermissionRules("manual", [])).toContainEqual({ permission: "*", pattern: "*", action: "ask" })
    expect(composerPermissionRules("accept-edits", [])).toContainEqual({
      permission: "edit",
      pattern: "*",
      action: "allow",
    })
    const plan = composerPermissionRules("plan", [])
    expect(plan).toContainEqual({ permission: "*", pattern: "*", action: "deny" })
    expect(plan.some((rule) => ["edit", "bash", "task"].includes(rule.permission) && rule.action === "allow")).toBe(
      false,
    )
    expect(composerPermissionRules("skip", [])).toEqual([{ permission: "*", pattern: "*", action: "allow" }])
  })

  test("mode and original rules persist independently for each server, directory and session", () => {
    setComposerMode("one", "/repo", "session", { mode: "manual", baseline })
    setComposerMode("two", "/repo", "session", { mode: "plan", baseline: [] })
    expect(getComposerMode("one", "/repo", "session")).toEqual({ mode: "manual", baseline })
    expect(getComposerMode("two", "/repo", "session")?.mode).toBe("plan")
    expect(getComposerMode("one", "/other", "session")).toBeUndefined()
  })
})
