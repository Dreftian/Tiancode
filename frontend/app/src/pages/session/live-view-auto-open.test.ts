import { describe, expect, test } from "bun:test"
import { managedPreviewTargetOf } from "./live-view-auto-open"

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
