import { describe, expect, test } from "bun:test"
import { releaseHighlights } from "./update-assistant"

describe("update assistant", () => {
  test("reads the bold first-level bullets of the release notes", () => {
    const notes = [
      "# Tiancode 1.0.7",
      "",
      "Intro paragraph.",
      "",
      "- **Catálogo completo:** el registro oficial de MCP y los plugins de Claude Code en `Descubrir`.",
      "  - **Nested:** not a highlight.",
      "- **Conectores**: Gmail, Notion y [Linear](https://linear.app) con su logo.",
      "- Plain bullet without a title.",
      "- **Escala de la interfaz** de 80 a 120 %.",
    ].join("\n")

    expect(releaseHighlights(notes)).toEqual([
      { title: "Catálogo completo", text: "el registro oficial de MCP y los plugins de Claude Code en Descubrir." },
      { title: "Conectores", text: "Gmail, Notion y Linear con su logo." },
      { title: "Escala de la interfaz", text: "de 80 a 120 %." },
    ])
  })

  test("keeps at most four highlights and shortens long ones", () => {
    const notes = Array.from({ length: 6 }, (_, i) => `- **Item ${i}:** ${"x".repeat(200)}`).join("\n")
    const highlights = releaseHighlights(notes)
    expect(highlights).toHaveLength(4)
    expect(highlights[0].text.length).toBeLessThanOrEqual(148)
    expect(highlights[0].text.endsWith("…")).toBe(true)
  })
})
