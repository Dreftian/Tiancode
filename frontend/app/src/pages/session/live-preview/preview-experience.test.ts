import { describe, expect, test } from "bun:test"
import { appendPreviewTimeline, orientedPreviewDimensions } from "./preview-experience"

describe("orientedPreviewDimensions", () => {
  test("keeps portrait dimensions until rotation is requested", () => {
    expect(orientedPreviewDimensions({ width: 390, height: 844 }, false)).toEqual({ width: 390, height: 844 })
    expect(orientedPreviewDimensions({ width: 390, height: 844 }, true)).toEqual({ width: 844, height: 390 })
  })

  test("keeps fit mode without an artificial device size", () => {
    expect(orientedPreviewDimensions(undefined, true)).toBeUndefined()
  })
})

describe("appendPreviewTimeline", () => {
  test("keeps a bounded, non-duplicated record of confirmed preview events", () => {
    const loaded = { id: 1, at: 1, kind: "loaded" as const, detail: "http://127.0.0.1:5173" }
    expect(appendPreviewTimeline([], loaded, 2)).toEqual([loaded])
    expect(appendPreviewTimeline([loaded], { ...loaded, id: 2, at: 2 }, 2)).toEqual([loaded])
    expect(
      appendPreviewTimeline(
        [loaded, { id: 3, at: 3, kind: "reloaded" as const, detail: "http://127.0.0.1:5173" }],
        { id: 4, at: 4, kind: "failed", detail: "Connection refused" },
        2,
      ),
    ).toEqual([
      { id: 3, at: 3, kind: "reloaded", detail: "http://127.0.0.1:5173" },
      { id: 4, at: 4, kind: "failed", detail: "Connection refused" },
    ])
  })
})
