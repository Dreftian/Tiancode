import { describe, expect, test } from "bun:test"
import { ConfigPlugin } from "../../src/config/plugin"

describe("ConfigPlugin.isEnabled", () => {
  test("returns true for plain string specs", () => {
    expect(ConfigPlugin.isEnabled("my-plugin@1.0.0")).toBe(true)
  })

  test("returns true when options.enabled is absent", () => {
    expect(ConfigPlugin.isEnabled(["my-plugin@1.0.0", { config: { key: "value" } }])).toBe(true)
  })

  test("returns true when options.enabled is true", () => {
    expect(ConfigPlugin.isEnabled(["my-plugin@1.0.0", { enabled: true }])).toBe(true)
  })

  test("returns false when options.enabled is false", () => {
    expect(ConfigPlugin.isEnabled(["my-plugin@1.0.0", { enabled: false }])).toBe(false)
  })

  test("returns false when options.enabled is false alongside other options", () => {
    expect(ConfigPlugin.isEnabled(["my-plugin@1.0.0", { enabled: false, config: { key: "value" } }])).toBe(false)
  })
})
