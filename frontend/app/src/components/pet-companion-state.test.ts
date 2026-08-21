import { describe, expect, test } from "bun:test"
import { resolvePetCompanionStatus } from "./pet-companion-state"

describe("pet companion state", () => {
  test("prioritizes an input request over a running session", () => {
    expect(
      resolvePetCompanionStatus({ sessionStatus: { type: "busy" }, pendingPermissions: [{}] }),
    ).toBe("needs-input")
  })

  test("distinguishes running, retrying, and ready sessions", () => {
    expect(resolvePetCompanionStatus({ sessionStatus: { type: "busy" }, pendingPermissions: [] })).toBe("running")
    expect(resolvePetCompanionStatus({ sessionStatus: { type: "retry" }, pendingPermissions: [] })).toBe("blocked")
    expect(resolvePetCompanionStatus({ sessionStatus: { type: "idle" }, pendingPermissions: [] })).toBe("ready")
  })
})
