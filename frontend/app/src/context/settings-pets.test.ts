import { describe, expect, test } from "bun:test"
import { defaultPetSettings, petKinds, petPositions } from "./settings"

describe("pet settings", () => {
  test("are optional by default and use stable values", () => {
    expect(defaultPetSettings).toEqual({ enabled: false, kind: "cat", position: "bottom-right" })
    expect(petKinds).toEqual(["cat", "dog", "rabbit"])
    expect(petPositions).toEqual(["bottom-right", "bottom-left", "top-right", "top-left"])
  })
})
