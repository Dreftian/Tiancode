import { describe, expect, test } from "bun:test"
import type { PromptInputV2Prompt } from "@tiancode-ai/session-ui/v2/prompt-input/types"
import { promptWithOptimizedText } from "./optimized-prompt"

const image = {
  type: "image",
  id: "img_1",
  filename: "screenshot.png",
  mime: "image/png",
  blob: { id: "blob_1", url: "blob:screenshot" },
} as const

describe("promptWithOptimizedText", () => {
  test("keeps image attachments when the text is replaced", () => {
    const parts: PromptInputV2Prompt = [{ type: "text", content: "arregla esto", start: 0, end: 12 }, image]

    const result = promptWithOptimizedText(parts, "### Objetivo\nArreglar el fallo")

    expect(result).toEqual([
      { type: "text", content: "### Objetivo\nArreglar el fallo", start: 0, end: 30 },
      image,
    ])
  })

  test("drops file and agent mentions already folded into the rewrite", () => {
    const parts: PromptInputV2Prompt = [
      { type: "text", content: "revisa ", start: 0, end: 7 },
      { type: "file", path: "src/foo.ts", content: "@src/foo.ts", start: 7, end: 18 },
      { type: "agent", name: "planner", content: "@planner", start: 18, end: 26 },
      image,
    ]

    const result = promptWithOptimizedText(parts, "revisa src/foo.ts con el planner")

    expect(result.filter((part) => part.type === "file" || part.type === "agent")).toEqual([])
    expect(result.filter((part) => part.type === "image")).toEqual([image])
  })

  test("spans the whole text so the caret can be placed at the end", () => {
    const result = promptWithOptimizedText([], "hola")

    expect(result).toEqual([{ type: "text", content: "hola", start: 0, end: 4 }])
  })
})
