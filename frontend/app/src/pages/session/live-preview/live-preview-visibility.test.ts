import { describe, expect, test } from "bun:test"
import { isBlankPreviewUrl, isWelcomePreviewUrl } from "./live-preview"

describe("live preview visibility", () => {
  test("does not reveal Electron's initial blank page", () => {
    expect(isBlankPreviewUrl(undefined)).toBe(true)
    expect(isBlankPreviewUrl("")).toBe(true)
    expect(isBlankPreviewUrl("about:blank")).toBe(true)
    expect(isBlankPreviewUrl("about:blank#preview")).toBe(true)
    expect(isBlankPreviewUrl("data:text/html,preview")).toBe(false)
    expect(isBlankPreviewUrl("http://127.0.0.1:5173")).toBe(false)
  })
})

describe("stale preview welcome pages", () => {
  test("does not treat the legacy data URL as a project runtime", () => {
    expect(isWelcomePreviewUrl("data:text/html;charset=utf-8,%3Cbody%3Epreview%3C%2Fbody%3E")).toBe(true)
    expect(isWelcomePreviewUrl("http://127.0.0.1:4173")).toBe(false)
  })
})
