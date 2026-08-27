import type { FileContent } from "@tiancode-ai/sdk/v2"

export type DocumentKind = "pdf" | "docx" | "xlsx"
export type MediaKind = "image" | "audio" | "svg" | DocumentKind

const imageExtensions = new Set(["png", "jpg", "jpeg", "gif", "webp", "avif", "bmp", "ico", "tif", "tiff", "heic"])
const audioExtensions = new Set(["mp3", "wav", "ogg", "m4a", "aac", "flac", "opus"])

const documentMimes: Record<DocumentKind, string[]> = {
  pdf: ["application/pdf"],
  docx: [
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/msword",
  ],
  xlsx: ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
}

const documentExtensions: Record<DocumentKind, string[]> = {
  pdf: ["pdf"],
  docx: ["docx", "doc"],
  xlsx: ["xlsx", "xls"],
}

export function isDocumentKind(kind: MediaKind | undefined): kind is DocumentKind {
  return kind === "pdf" || kind === "docx" || kind === "xlsx"
}

export function documentKindFromPath(path: string | undefined): DocumentKind | undefined {
  const ext = fileExtension(path)
  if (documentExtensions.pdf.includes(ext)) return "pdf"
  if (documentExtensions.docx.includes(ext)) return "docx"
  if (documentExtensions.xlsx.includes(ext)) return "xlsx"
}

export function documentKindFromMime(mime: string | undefined): DocumentKind | undefined {
  const normalized = normalizeMimeType(mime)
  if (!normalized) return
  if (documentMimes.pdf.includes(normalized)) return "pdf"
  if (documentMimes.docx.includes(normalized)) return "docx"
  if (documentMimes.xlsx.includes(normalized)) return "xlsx"
}

export function documentKindFromAttachment(input: { filename?: string; mime?: string }) {
  return documentKindFromMime(input.mime) ?? documentKindFromPath(input.filename)
}

type MediaValue = unknown

function mediaRecord(value: unknown) {
  if (!value || typeof value !== "object") return
  return value as Partial<FileContent> & {
    content?: unknown
    encoding?: unknown
    mimeType?: unknown
    type?: unknown
  }
}

export function normalizeMimeType(type: string | undefined) {
  if (!type) return
  const mime = type.split(";", 1)[0]?.trim().toLowerCase()
  if (!mime) return
  if (mime === "audio/x-aac") return "audio/aac"
  if (mime === "audio/x-m4a") return "audio/mp4"
  return mime
}

export function fileExtension(path: string | undefined) {
  if (!path) return ""
  const idx = path.lastIndexOf(".")
  if (idx === -1) return ""
  return path.slice(idx + 1).toLowerCase()
}

export function mediaKindFromPath(path: string | undefined): MediaKind | undefined {
  const ext = fileExtension(path)
  if (ext === "svg") return "svg"
  if (imageExtensions.has(ext)) return "image"
  if (audioExtensions.has(ext)) return "audio"
  return documentKindFromPath(path)
}

export function isBinaryContent(value: MediaValue) {
  return mediaRecord(value)?.type === "binary"
}

function validDataUrl(value: string, kind: MediaKind) {
  if (kind === "svg") return value.startsWith("data:image/svg+xml") ? value : undefined
  if (kind === "image") return value.startsWith("data:image/") ? value : undefined
  if (value.startsWith("data:audio/x-aac;")) return value.replace("data:audio/x-aac;", "data:audio/aac;")
  if (value.startsWith("data:audio/x-m4a;")) return value.replace("data:audio/x-m4a;", "data:audio/mp4;")
  if (value.startsWith("data:audio/")) return value
}

export function dataUrlFromMediaValue(value: MediaValue, kind: MediaKind) {
  if (!value) return

  if (typeof value === "string") {
    return validDataUrl(value, kind)
  }

  const record = mediaRecord(value)
  if (!record) return

  if (typeof record.content !== "string") return

  const mime = normalizeMimeType(typeof record.mimeType === "string" ? record.mimeType : undefined)
  if (!mime) return

  if (kind === "svg") {
    if (mime !== "image/svg+xml") return
    if (record.encoding === "base64") return `data:image/svg+xml;base64,${record.content}`
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(record.content)}`
  }

  if (kind === "image" && !mime.startsWith("image/")) return
  if (kind === "audio" && !mime.startsWith("audio/")) return
  if (record.encoding !== "base64") return

  return `data:${mime};base64,${record.content}`
}

function decodeBase64Utf8(value: string) {
  if (typeof atob !== "function") return

  try {
    const raw = atob(value)
    const bytes = Uint8Array.from(raw, (x) => x.charCodeAt(0))
    if (typeof TextDecoder === "function") return new TextDecoder().decode(bytes)
    return raw
  } catch {}
}

// Extracts the raw base64 payload of a binary FileContent value, whether it
// arrives as an embedded data URL or as the { content, encoding: "base64" }
// record produced by /file/content.
export function base64FromMediaValue(value: MediaValue): string | undefined {
  if (typeof value === "string") {
    const comma = value.indexOf(",")
    if (comma === -1) return
    return value.slice(comma + 1)
  }

  const record = mediaRecord(value)
  if (!record || record.encoding !== "base64") return
  if (typeof record.content !== "string") return
  return record.content
}

export function decodeBase64Bytes(value: string) {
  if (typeof atob !== "function") return
  try {
    const raw = atob(value)
    return Uint8Array.from(raw, (x) => x.charCodeAt(0))
  } catch {}
}

export function svgTextFromValue(value: MediaValue) {
  const record = mediaRecord(value)
  if (!record) return
  if (typeof record.content !== "string") return

  const mime = normalizeMimeType(typeof record.mimeType === "string" ? record.mimeType : undefined)
  if (mime !== "image/svg+xml") return
  if (record.encoding === "base64") return decodeBase64Utf8(record.content)
  return record.content
}

export function hasMediaValue(value: MediaValue) {
  if (typeof value === "string") return value.length > 0
  const record = mediaRecord(value)
  if (!record) return false
  return typeof record.content === "string" && record.content.length > 0
}
