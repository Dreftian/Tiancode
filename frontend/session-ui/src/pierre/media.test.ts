import { describe, expect, test } from "bun:test"
import {
  base64FromMediaValue,
  decodeBase64Bytes,
  documentKindFromAttachment,
  documentKindFromMime,
  documentKindFromPath,
  isDocumentKind,
  mediaKindFromPath,
} from "./media"

describe("media document kinds", () => {
  test("detects document kinds from file paths", () => {
    expect(mediaKindFromPath("/repo/manual.pdf")).toBe("pdf")
    expect(mediaKindFromPath("/repo/notes.PDF")).toBe("pdf")
    expect(mediaKindFromPath("/repo/letter.docx")).toBe("docx")
    expect(mediaKindFromPath("/repo/legacy.doc")).toBe("docx")
    expect(mediaKindFromPath("/repo/sheet.xlsx")).toBe("xlsx")
    expect(mediaKindFromPath("/repo/photo.png")).toBe("image")
    expect(mediaKindFromPath("/repo/src/main.ts")).toBeUndefined()
  })

  test("detects document kinds from mime types", () => {
    expect(documentKindFromMime("application/pdf")).toBe("pdf")
    expect(
      documentKindFromMime("application/vnd.openxmlformats-officedocument.wordprocessingml.document"),
    ).toBe("docx")
    expect(documentKindFromMime("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")).toBe("xlsx")
    expect(documentKindFromMime("image/png")).toBeUndefined()
    expect(documentKindFromMime("text/plain; charset=utf-8")).toBeUndefined()
  })

  test("prefers the mime type and falls back to the filename for attachments", () => {
    expect(documentKindFromAttachment({ filename: "a.pdf", mime: "application/pdf" })).toBe("pdf")
    expect(documentKindFromAttachment({ filename: "a.pdf", mime: "text/plain" })).toBe("pdf")
    expect(documentKindFromAttachment({ filename: "a.docx" })).toBe("docx")
    expect(documentKindFromAttachment({ mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" })).toBe(
      "xlsx",
    )
    expect(documentKindFromAttachment({ filename: "a.md" })).toBeUndefined()
  })

  test("narrows document kinds with isDocumentKind", () => {
    expect(isDocumentKind("pdf")).toBe(true)
    expect(isDocumentKind("docx")).toBe(true)
    expect(isDocumentKind("xlsx")).toBe(true)
    expect(isDocumentKind("image")).toBe(false)
    expect(isDocumentKind(undefined)).toBe(false)
  })
})

describe("media base64 helpers", () => {
  test("extracts base64 from embedded data URLs", () => {
    expect(base64FromMediaValue("data:application/pdf;base64,JVBERg==")).toBe("JVBERg==")
  })

  test("extracts base64 from /file/content binary records", () => {
    expect(
      base64FromMediaValue({
        type: "binary",
        content: "JVBERg==",
        encoding: "base64",
        mimeType: "application/pdf",
      }),
    ).toBe("JVBERg==")
  })

  test("ignores non-base64 and empty values", () => {
    expect(base64FromMediaValue("data:text/plain,hello")).toBe("hello")
    expect(base64FromMediaValue(undefined)).toBeUndefined()
    expect(base64FromMediaValue({ type: "text", content: "hello" })).toBeUndefined()
  })

  test("decodes base64 into bytes", () => {
    const bytes = decodeBase64Bytes("SGVsbG8=")
    expect(bytes).toBeDefined()
    expect([...(bytes as Uint8Array)]).toEqual([72, 101, 108, 108, 111])
    expect(decodeBase64Bytes("not base64!!!")).toBeUndefined()
  })
})
