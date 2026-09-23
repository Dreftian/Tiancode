import { describe, expect, test } from "bun:test"
import { compactPetText, resolvePetCompanionStatus } from "./pet-companion-state"

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

  test("keeps long model announcements compact for the mascot", () => {
    expect(compactPetText("Estoy revisando los archivos del proyecto. Este detalle no debe aparecer en la mascota.")).toBe(
      "Estoy revisando los archivos del proyecto.",
    )
    expect(compactPetText("Una palabra ".repeat(30)).length).toBeLessThanOrEqual(96)
    expect(compactPetText("Una palabra ".repeat(30))).toEndWith("…")
    expect(compactPetText("  cargando\n\n cambios  ")).toBe("cargando cambios")
  })
})
