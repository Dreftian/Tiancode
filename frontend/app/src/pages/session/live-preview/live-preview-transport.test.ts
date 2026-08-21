import { describe, expect, test } from "bun:test"
import { iframePreviewUrl, usesIframePreview } from "./live-preview-transport"

describe("live preview iframe transport", () => {
  test("keeps local HTTP and HTTPS project servers in the renderer", () => {
    expect(usesIframePreview("http://127.0.0.1:4173")).toBe(true)
    expect(usesIframePreview("https://localhost:3000/dashboard")).toBe(true)
    expect(usesIframePreview("http://[::1]:5173")).toBe(true)
  })

  test("keeps remote, file, and malformed URLs on the native fallback", () => {
    expect(usesIframePreview("https://example.com")).toBe(false)
    expect(usesIframePreview("file:///C:/project/index.html")).toBe(false)
    expect(usesIframePreview("localhost:4173")).toBe(false)
  })

  test("normalizes wildcard and IPv6 loopback addresses before assigning an iframe src", () => {
    expect(iframePreviewUrl("http://0.0.0.0:4173/app")).toBe("http://127.0.0.1:4173/app")
    expect(iframePreviewUrl("http://[::1]:5173/app")).toBe("http://localhost:5173/app")
    expect(iframePreviewUrl("https://example.com")).toBeUndefined()
  })
})
