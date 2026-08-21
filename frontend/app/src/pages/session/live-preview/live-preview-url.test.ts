import { describe, expect, test } from "bun:test"
import { previewActionUrl, previewStatusUrl } from "./live-preview-url"

describe("live preview endpoints", () => {
  test("uses the preview root for status", () => {
    expect(previewStatusUrl("http://127.0.0.1:4096/", "C:\\work folder")).toBe(
      "http://127.0.0.1:4096/preview?directory=C%3A%5Cwork%20folder",
    )
  })

  test("uses an action route for lifecycle requests", () => {
    expect(previewActionUrl("http://127.0.0.1:4096", "restart", "/work/app")).toBe(
      "http://127.0.0.1:4096/preview/restart?directory=%2Fwork%2Fapp",
    )
  })
})
