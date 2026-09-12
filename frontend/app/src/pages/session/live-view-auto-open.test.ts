import { describe, expect, test } from "bun:test"
import { liveViewDemandKey, managedPreviewTargetOf } from "./live-view-auto-open"

describe("managedPreviewTargetOf", () => {
  test("only opens a ready HTTP preview", () => {
    expect(managedPreviewTargetOf({ status: "starting", url: "http://127.0.0.1:5173" })).toBeUndefined()
    expect(managedPreviewTargetOf({ status: "ready", url: "file:///C:/work/index.html" })).toBeUndefined()
    expect(managedPreviewTargetOf({ status: "ready", url: "http://127.0.0.1:5173", startedAt: 42 })).toEqual({
      url: "http://127.0.0.1:5173/",
      key: "managed:http://127.0.0.1:5173/:42",
    })
  })

  test("uses the URL as a stable fallback key", () => {
    expect(managedPreviewTargetOf({ status: "ready", url: "https://preview.example.test/app" })).toEqual({
      url: "https://preview.example.test/app",
      key: "managed:https://preview.example.test/app:https://preview.example.test/app",
    })
  })
})

describe("liveViewDemandKey", () => {
  test("opens the panel once per pending agent action", () => {
    // Keyed on the command id so one action reopens the panel once. A user who closes it again
    // during that same action is not fought; the next action gets a fresh key.
    expect(liveViewDemandKey({ pending: 1, id: "abc", since: 1 })).toBe("agent:abc")
    expect(liveViewDemandKey({ pending: 2, id: "abc", since: 1 })).toBe("agent:abc")
  })

  test("nothing pending is not a reason to open anything", () => {
    expect(liveViewDemandKey({ pending: 0, id: null, since: null })).toBeUndefined()
  })

  test("a malformed payload cannot start an open loop", () => {
    expect(liveViewDemandKey({ pending: 2 })).toBeUndefined()
    expect(liveViewDemandKey({ pending: 1, id: "" })).toBeUndefined()
    expect(liveViewDemandKey("nope")).toBeUndefined()
    expect(liveViewDemandKey(undefined)).toBeUndefined()
  })
})
