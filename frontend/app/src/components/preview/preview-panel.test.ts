import { describe, expect, test } from "bun:test"
import { normalizeUrl, supportsPreviewPanel } from "./preview-panel"

describe("preview availability", () => {
  test("only enables the webview in the desktop renderer", () => {
    expect(supportsPreviewPanel("desktop")).toBe(true)
    expect(supportsPreviewPanel("web")).toBe(false)
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
