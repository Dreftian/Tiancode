/**
 * Minimal GGUF header reader.
 *
 * Reads only the metadata key/value section of a `.gguf` file (never the tensors) and keeps the
 * handful of fields the load recommendations need: architecture, training context, layer and
 * head counts, quantisation and tokenizer facts. Large values (the vocabulary arrays, the chat
 * template) are skipped instead of decoded so a 30 GB model costs a few megabytes of reads.
 *
 * Format reference: https://github.com/ggml-org/ggml/blob/master/docs/gguf.md
 */
import { closeSync, openSync, readSync, statSync } from "node:fs"

export interface GgufMetadata {
  readonly version: number
  readonly tensorCount: number
  readonly architecture?: string
  readonly name?: string
  readonly sizeLabel?: string
  readonly contextLength?: number
  readonly blockCount?: number
  readonly embeddingLength?: number
  readonly headCount?: number
  readonly headCountKv?: number
  readonly expertCount?: number
  readonly fileType?: number
  readonly quantization?: string
  readonly parameterCount?: number
  readonly vocabSize?: number
  readonly hasChatTemplate: boolean
}

const GGUF_MAGIC = 0x46554747 // "GGUF" little-endian
const MAX_HEADER_BYTES = 96 * 1024 * 1024
const CHUNK = 1 << 20

// ggml_ftype values as written in general.file_type.
export const GGUF_FILE_TYPES: Readonly<Record<number, string>> = {
  0: "F32",
  1: "F16",
  2: "Q4_0",
  3: "Q4_1",
  7: "Q8_0",
  8: "Q5_0",
  9: "Q5_1",
  10: "Q2_K",
  11: "Q3_K_S",
  12: "Q3_K_M",
  13: "Q3_K_L",
  14: "Q4_K_S",
  15: "Q4_K_M",
  16: "Q5_K_S",
  17: "Q5_K_M",
  18: "Q6_K",
  19: "IQ2_XXS",
  20: "IQ2_XS",
  21: "Q2_K_S",
  22: "IQ3_XS",
  23: "IQ3_XXS",
  24: "IQ1_S",
  25: "IQ4_NL",
  26: "IQ3_S",
  27: "IQ3_M",
  28: "IQ2_S",
  29: "IQ2_M",
  30: "IQ4_XS",
  31: "IQ1_M",
  32: "BF16",
  36: "TQ1_0",
  37: "TQ2_0",
}

const enum Type {
  UINT8 = 0,
  INT8 = 1,
  UINT16 = 2,
  INT16 = 3,
  UINT32 = 4,
  INT32 = 5,
  FLOAT32 = 6,
  BOOL = 7,
  STRING = 8,
  ARRAY = 9,
  UINT64 = 10,
  INT64 = 11,
  FLOAT64 = 12,
}

const SCALAR_SIZE: Readonly<Record<number, number>> = {
  [Type.UINT8]: 1,
  [Type.INT8]: 1,
  [Type.UINT16]: 2,
  [Type.INT16]: 2,
  [Type.UINT32]: 4,
  [Type.INT32]: 4,
  [Type.FLOAT32]: 4,
  [Type.BOOL]: 1,
  [Type.UINT64]: 8,
  [Type.INT64]: 8,
  [Type.FLOAT64]: 8,
}

interface ByteSource {
  readonly size: number
  read(position: number, length: number): Buffer
}

class Cursor {
  private buffer: Buffer = Buffer.alloc(0)
  private bufferStart = 0
  position = 0

  constructor(private readonly source: ByteSource) {}

  private ensure(length: number) {
    if (this.position + length > MAX_HEADER_BYTES) throw new Error("GGUF header is larger than the read limit")
    if (this.position + length > this.source.size) throw new Error("GGUF header ends before the metadata does")
    if (this.position >= this.bufferStart && this.position + length <= this.bufferStart + this.buffer.length) return
    const want = Math.max(length, CHUNK)
    this.buffer = this.source.read(this.position, Math.min(want, this.source.size - this.position))
    this.bufferStart = this.position
    if (this.buffer.length < length) throw new Error("GGUF header ends before the metadata does")
  }

  private take(length: number) {
    this.ensure(length)
    const offset = this.position - this.bufferStart
    this.position += length
    return offset
  }

  skip(length: number) {
    this.position += length
  }

  u8() {
    const offset = this.take(1)
    return this.buffer.readUInt8(offset)
  }
  i8() {
    const offset = this.take(1)
    return this.buffer.readInt8(offset)
  }
  u16() {
    const offset = this.take(2)
    return this.buffer.readUInt16LE(offset)
  }
  i16() {
    const offset = this.take(2)
    return this.buffer.readInt16LE(offset)
  }
  u32() {
    const offset = this.take(4)
    return this.buffer.readUInt32LE(offset)
  }
  i32() {
    const offset = this.take(4)
    return this.buffer.readInt32LE(offset)
  }
  f32() {
    const offset = this.take(4)
    return this.buffer.readFloatLE(offset)
  }
  u64() {
    const offset = this.take(8)
    return Number(this.buffer.readBigUInt64LE(offset))
  }
  i64() {
    const offset = this.take(8)
    return Number(this.buffer.readBigInt64LE(offset))
  }
  f64() {
    const offset = this.take(8)
    return this.buffer.readDoubleLE(offset)
  }
  string(maxKeep = 4096): string | undefined {
    const length = this.u64()
    if (length > maxKeep) {
      this.skip(length)
      return undefined
    }
    const offset = this.take(length)
    return this.buffer.toString("utf8", offset, offset + length)
  }
}

type Scalar = number | boolean | string | undefined

function readScalar(cursor: Cursor, type: number): Scalar {
  switch (type) {
    case Type.UINT8:
      return cursor.u8()
    case Type.INT8:
      return cursor.i8()
    case Type.UINT16:
      return cursor.u16()
    case Type.INT16:
      return cursor.i16()
    case Type.UINT32:
      return cursor.u32()
    case Type.INT32:
      return cursor.i32()
    case Type.FLOAT32:
      return cursor.f32()
    case Type.BOOL:
      return cursor.u8() !== 0
    case Type.STRING:
      return cursor.string()
    case Type.UINT64:
      return cursor.u64()
    case Type.INT64:
      return cursor.i64()
    case Type.FLOAT64:
      return cursor.f64()
    default:
      throw new Error(`unknown GGUF value type ${type}`)
  }
}

// Arrays are skipped, only their length is kept (vocabulary size comes from tokenizer.ggml.tokens).
function skipArray(cursor: Cursor): number {
  const type = cursor.u32()
  const length = cursor.u64()
  if (type === Type.STRING) {
    for (let index = 0; index < length; index++) cursor.string(0)
  } else if (type === Type.ARRAY) {
    for (let index = 0; index < length; index++) skipArray(cursor)
  } else {
    const size = SCALAR_SIZE[type]
    if (!size) throw new Error(`unknown GGUF array element type ${type}`)
    cursor.skip(length * size)
  }
  return length
}

function asNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined
}

export function parseGguf(source: ByteSource): GgufMetadata {
  const cursor = new Cursor(source)
  if (cursor.u32() !== GGUF_MAGIC) throw new Error("not a GGUF file")
  const version = cursor.u32()
  if (version < 2 || version > 3) throw new Error(`unsupported GGUF version ${version}`)
  const tensorCount = cursor.u64()
  const kvCount = cursor.u64()
  const scalars = new Map<string, Scalar>()
  const arrays = new Map<string, number>()
  let hasChatTemplate = false
  for (let index = 0; index < kvCount; index++) {
    const key = cursor.string(1024) ?? `?${index}`
    const type = cursor.u32()
    if (type === Type.ARRAY) {
      arrays.set(key, skipArray(cursor))
      continue
    }
    if (key === "tokenizer.chat_template") {
      // Templates run to kilobytes; presence is all the recommendations need.
      cursor.string(0)
      hasChatTemplate = true
      continue
    }
    scalars.set(key, readScalar(cursor, type))
  }
  const architecture = asString(scalars.get("general.architecture"))
  const arch = (key: string) => (architecture ? scalars.get(`${architecture}.${key}`) : undefined)
  const fileType = asNumber(scalars.get("general.file_type"))
  return {
    version,
    tensorCount,
    architecture,
    name: asString(scalars.get("general.name")),
    sizeLabel: asString(scalars.get("general.size_label")),
    contextLength: asNumber(arch("context_length")),
    blockCount: asNumber(arch("block_count")),
    embeddingLength: asNumber(arch("embedding_length")),
    headCount: asNumber(arch("attention.head_count")),
    headCountKv: asNumber(arch("attention.head_count_kv")),
    expertCount: asNumber(arch("expert_count")),
    fileType,
    quantization: fileType !== undefined ? GGUF_FILE_TYPES[fileType] : undefined,
    parameterCount: asNumber(scalars.get("general.parameter_count")),
    vocabSize: arrays.get("tokenizer.ggml.tokens"),
    hasChatTemplate,
  }
}

export function bufferSource(buffer: Buffer): ByteSource {
  return {
    size: buffer.length,
    read: (position, length) => buffer.subarray(position, position + length),
  }
}

export function readGgufMetadata(file: string): GgufMetadata {
  const fd = openSync(file, "r")
  try {
    const size = statSync(file).size
    return parseGguf({
      size,
      read: (position, length) => {
        const out = Buffer.alloc(length)
        const read = readSync(fd, out, 0, length, position)
        return read === length ? out : out.subarray(0, read)
      },
    })
  } finally {
    closeSync(fd)
  }
}

const cache = new Map<string, { key: string; metadata: GgufMetadata }>()

/** Metadata for a file, re-read only when the file's size or mtime changed. */
export function readGgufMetadataCached(file: string): GgufMetadata {
  const info = statSync(file)
  const key = `${info.size}:${info.mtimeMs}`
  const hit = cache.get(file)
  if (hit && hit.key === key) return hit.metadata
  const metadata = readGgufMetadata(file)
  cache.set(file, { key, metadata })
  return metadata
}
