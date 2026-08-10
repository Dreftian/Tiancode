import { describe, expect, test } from "bun:test"
import { pluginOrigin } from "./plugins"

describe("plugin origin", () => {
  test("labels file plugin specs as local", () => {
    expect(pluginOrigin("file:///workspace/.tiancode/plugins/guard.ts")).toBe("local")
    expect(pluginOrigin(".tiancode/plugins/guard.ts")).toBe("local")
  })

  test("labels package plugin specs as npm", () => {
    expect(pluginOrigin("@scope/tiancode-plugin")).toBe("npm")
    expect(pluginOrigin("tiancode-plugin")).toBe("npm")
  })
})
