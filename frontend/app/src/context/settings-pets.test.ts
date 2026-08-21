import { describe, expect, test } from "bun:test"
import { defaultPetSettings, petKinds, petPositions } from "./settings"

describe("pet settings", () => {
  test("are optional by default and use stable values", () => {
    expect(defaultPetSettings).toEqual({ enabled: false, kind: "cat", position: "bottom-right" })
    expect(petKinds).toContain("cat")
    expect(petKinds).toContain("dewey")
    expect(petKinds).toContain("fireball")
    expect(petKinds).toContain("hoots")
    expect(petKinds).toContain("rocky")
    expect(petKinds).toContain("seedy")
    expect(petKinds).toContain("stacky")
    expect(petKinds).toContain("bsod")
    expect(petKinds).toContain("nullsignal")
    expect(petPositions).toEqual(["bottom-right", "bottom-left", "top-right", "top-left"])
  })
})
