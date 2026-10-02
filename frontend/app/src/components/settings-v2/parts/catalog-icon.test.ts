import { describe, expect, test } from "bun:test"
import { namedBrand } from "./catalog-icon"

describe("namedBrand", () => {
  test("uses a bundled mark only for entries named after the brand", () => {
    expect(namedBrand("Google Drive")).toBe("googledrive")
    expect(namedBrand("Notion")).toBe("notion")
    expect(namedBrand("Postgres")).toBe("postgresql")
    expect(namedBrand("GitHub Actions")).toBe("github")
    expect(namedBrand("Outlook Calendar")).toBeUndefined()
    expect(namedBrand("Claude Code Setup")).toBeUndefined()
    expect(namedBrand(undefined, "linear")).toBe("linear")
    expect(namedBrand("LegalZoom")).toBeUndefined()
    expect(namedBrand("ZoomInfo")).toBeUndefined()
    expect(namedBrand("Canvas Design")).toBeUndefined()
    expect(namedBrand("Zoom")).toBe("zoom")
    expect(namedBrand("Hugging Face")).toBe("huggingface")
  })
})
