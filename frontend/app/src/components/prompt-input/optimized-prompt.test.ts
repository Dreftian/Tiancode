import { describe, expect, test } from "bun:test"
import type { PromptInputV2Prompt } from "@tiancode-ai/session-ui/v2/prompt-input/types"
import { promptWithBlock, promptWithOptimizedText, promptWithDictation } from "./optimized-prompt"

const image = {
  type: "image",
  id: "img_1",
  filename: "screenshot.png",
  mime: "image/png",
  blob: { id: "blob_1", url: "blob:screenshot" },
} as const

describe("promptWithOptimizedText", () => {
  test("dictation appends speech while preserving structured mentions and attachments", () => {
    const parts: PromptInputV2Prompt = [
      { type: "file", path: "src/foo.ts", content: "@src/foo.ts", start: 0, end: 11 },
      image,
    ]
    expect(promptWithDictation(parts, "review this")).toEqual([
      ...parts,
      { type: "text", content: " review this", start: 11, end: 23 },
    ])
  })
  test("keeps image attachments when the text is replaced", () => {
    const parts: PromptInputV2Prompt = [{ type: "text", content: "arregla esto", start: 0, end: 12 }, image]

    const result = promptWithOptimizedText(parts, "### Objetivo\nArreglar el fallo")

    expect(result).toEqual([{ type: "text", content: "### Objetivo\nArreglar el fallo", start: 0, end: 30 }, image])
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

describe("promptWithBlock", () => {
  test("starts an empty prompt with the block", () => {
    expect(promptWithBlock([], "ctx")).toEqual([{ type: "text", content: "ctx", start: 0, end: 3 }])
  })

  test("keeps the draft and its mentions, then adds the block after a blank line", () => {
    const parts: PromptInputV2Prompt = [
      { type: "text", content: "cambia ", start: 0, end: 7 },
      { type: "file", path: "src/a.ts", content: "@src/a.ts", start: 7, end: 16 },
    ]
    const result = promptWithBlock(parts, "ctx")
    expect(result.slice(0, 2)).toEqual(parts)
    expect(result[2]).toEqual({ type: "text", content: String.fromCharCode(10, 10) + "ctx", start: 16, end: 21 })
  })
})
