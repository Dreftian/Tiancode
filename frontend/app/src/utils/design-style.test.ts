import { expect, test } from "bun:test"
import { DESIGN_STYLES, designStyleDirective } from "./design-style"

test("design directions apply only to Web App and preserve the selected requirements", () => {
  expect(designStyleDirective("build", "midnight")).toBeUndefined()
  expect(designStyleDirective("plan", "ask")).toBeUndefined()
  for (const style of DESIGN_STYLES) {
    expect(designStyleDirective("webapp", style.id)).toContain(style.instruction)
    expect(designStyleDirective("webapp", style.id)).toContain("backend behavior")
  }
  expect(designStyleDirective("webapp", "ask")).toContain("question tool")
})
