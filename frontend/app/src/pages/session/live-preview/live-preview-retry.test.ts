import { describe, expect, test } from "bun:test"
import { PREVIEW_RETRY_MAX_ATTEMPTS, isRetryablePreviewLoadFailure, previewRetryDelay, samePreviewUrl } from "./live-preview-retry"

describe("live preview retry", () => {
  test("retries transient main-frame localhost failures", () => {
    expect(isRetryablePreviewLoadFailure({ code: -102, url: "http://localhost:5173/", isMainFrame: true })).toBe(true)
    expect(isRetryablePreviewLoadFailure({ code: -118, url: "http://127.0.0.1:3000/", isMainFrame: true })).toBe(true)
  })

  test("does not retry aborted, subframe, or remote loads", () => {
    expect(isRetryablePreviewLoadFailure({ code: -3, url: "http://localhost:5173/", isMainFrame: true })).toBe(false)
    expect(isRetryablePreviewLoadFailure({ code: -102, url: "http://localhost:5173/", isMainFrame: false })).toBe(false)
    expect(isRetryablePreviewLoadFailure({ code: -102, url: "https://example.com/", isMainFrame: true })).toBe(false)
  })

  test("backs off while keeping a finite retry budget", () => {
    expect(previewRetryDelay(0)).toBe(500)
    expect(previewRetryDelay(3)).toBe(4000)
    expect(previewRetryDelay(10)).toBe(4000)
    expect(PREVIEW_RETRY_MAX_ATTEMPTS).toBeGreaterThan(1)
  })

  test("compares equivalent preview URLs without trailing slashes", () => {
    expect(samePreviewUrl("http://localhost:5173", "http://localhost:5173/")).toBe(true)
    expect(samePreviewUrl("http://127.0.0.1:5173", "http://localhost:5173/")).toBe(true)
    expect(samePreviewUrl("http://localhost:5173/a", "http://localhost:5173/b")).toBe(false)
  })
})
