import { describe, expect, test } from "bun:test"
import { normalizeUrl, supportsPreviewPanel } from "./preview-panel"

describe("preview availability", () => {
  test("is available on every platform", () => {
    // Desktop-only until "universal preview" (2026-09-03), when the web build gained an
    // iframe fallback for the Electron WebContentsView.
    expect(supportsPreviewPanel()).toBe(true)
  })
})

describe("preview normalizeUrl", () => {
  test("deja intactas las URLs con protocolo", () => {
    expect(normalizeUrl("https://example.com")).toBe("https://example.com")
    expect(normalizeUrl("http://localhost:5173/app")).toBe("http://localhost:5173/app")
  })

  test("añade https:// cuando falta el protocolo", () => {
    expect(normalizeUrl("example.com")).toBe("https://example.com")
    expect(normalizeUrl("  tiancode.vercel.app  ")).toBe("https://tiancode.vercel.app")
  })

  test("devuelve vacío para entradas en blanco", () => {
    expect(normalizeUrl("")).toBe("")
    expect(normalizeUrl("   ")).toBe("")
  })
})
