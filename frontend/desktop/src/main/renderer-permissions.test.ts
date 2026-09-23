import { describe, expect, test } from "bun:test"
import { createRendererPermissionPolicy } from "./renderer-permissions"

describe("renderer permissions", () => {
  test("preserves microphone access across welcome and multiple app windows", () => {
    const policy = createRendererPermissionPolicy((url) => url?.startsWith("oc://renderer/") === true)
    const request = { permission: "media", topURL: "oc://renderer/index.html", requestingURL: "oc://renderer/index.html" }
    policy.register(1)
    policy.register(2)
    expect(policy.allows({ ...request, id: 1 })).toBe(true)
    expect(policy.allows({ ...request, id: 2 })).toBe(true)
    policy.unregister(2)
    expect(policy.allows({ ...request, id: 1 })).toBe(true)
    expect(policy.allows({ ...request, id: 2 })).toBe(false)
  })

  test("denies guest windows, external frames, navigation and unsupported permissions", () => {
    const policy = createRendererPermissionPolicy((url) => url === "oc://renderer/index.html")
    policy.register(1)
    const request = { id: 1, permission: "media", topURL: "oc://renderer/index.html", requestingURL: "oc://renderer/index.html" }
    expect(policy.allows({ ...request, id: 99 })).toBe(false)
    expect(policy.allows({ ...request, id: undefined })).toBe(false)
    expect(policy.allows({ ...request, requestingURL: "http://localhost:3000" })).toBe(false)
    expect(policy.allows({ ...request, requestingURL: "https://example.com" })).toBe(false)
    expect(policy.allows({ ...request, topURL: "https://example.com" })).toBe(false)
    expect(policy.allows({ ...request, permission: "geolocation" })).toBe(false)
  })
})
