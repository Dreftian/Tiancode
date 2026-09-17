import { describe, expect, test } from "bun:test"
import { bufferSource, parseGguf } from "../../src/local-engine/gguf"
import { kvBytesPerToken, recommendLoadOptions } from "../../src/local-engine/recommend"

const GIB = 1024 * 1024 * 1024

// Builds a tiny GGUF v3 header with the given key/values (scalars and string arrays only).
function gguf(kv: Array<[string, number | string | boolean | string[]]>) {
  const parts: Buffer[] = []
  const u32 = (n: number) => {
    const b = Buffer.alloc(4)
    b.writeUInt32LE(n)
    return b
  }
  const u64 = (n: number) => {
    const b = Buffer.alloc(8)
    b.writeBigUInt64LE(BigInt(n))
    return b
  }
  const str = (s: string) => Buffer.concat([u64(Buffer.byteLength(s)), Buffer.from(s, "utf8")])
  parts.push(Buffer.from("GGUF", "ascii"), u32(3), u64(0), u64(kv.length))
  for (const [key, value] of kv) {
    parts.push(str(key))
    if (typeof value === "string") parts.push(u32(8), str(value))
    else if (typeof value === "boolean") parts.push(u32(7), Buffer.from([value ? 1 : 0]))
    else if (Array.isArray(value)) parts.push(u32(9), u32(8), u64(value.length), ...value.map(str))
    else parts.push(u32(4), u32(value))
  }
  return Buffer.concat(parts)
}

describe("gguf", () => {
  test("reads the fields the recommendations need and skips the big arrays", () => {
    const meta = parseGguf(
      bufferSource(
        gguf([
          ["general.architecture", "qwen2"],
          ["general.name", "Qwen2.5 Coder 7B Instruct"],
          ["general.file_type", 15],
          ["qwen2.context_length", 32768],
          ["qwen2.block_count", 28],
          ["qwen2.embedding_length", 3584],
          ["qwen2.attention.head_count", 28],
          ["qwen2.attention.head_count_kv", 4],
          ["tokenizer.ggml.tokens", ["a", "b", "c"]],
          ["tokenizer.chat_template", "{% for m in messages %}{{ m.content }}{% endfor %}"],
        ]),
      ),
    )
    expect(meta.architecture).toBe("qwen2")
    expect(meta.contextLength).toBe(32768)
    expect(meta.blockCount).toBe(28)
    expect(meta.headCountKv).toBe(4)
    expect(meta.quantization).toBe("Q4_K_M")
    expect(meta.vocabSize).toBe(3)
    expect(meta.hasChatTemplate).toBe(true)
  })

  test("rejects files that are not GGUF", () => {
    expect(() => parseGguf(bufferSource(Buffer.from("not a gguf file at all")))).toThrow("not a GGUF file")
  })
})

describe("recommendLoadOptions", () => {
  const qwen7b = {
    version: 3,
    tensorCount: 0,
    architecture: "qwen2",
    contextLength: 32768,
    blockCount: 28,
    embeddingLength: 3584,
    headCount: 28,
    headCountKv: 4,
    hasChatTemplate: true,
  }

  test("GQA models have a small KV cache per token", () => {
    // 28 layers × 4 kv heads × 128 dims × 4 bytes = 57 KB per token at f16
    expect(kvBytesPerToken(qwen7b, "f16")).toBe(28 * 4 * 128 * 4)
  })

  test("a 4.7 GB model on an 8 GB GPU runs fully on the GPU with an agent-sized context", () => {
    const rec = recommendLoadOptions({
      sizeBytes: 4.7 * GIB,
      metadata: qwen7b,
      hardware: { ram: 32 * GIB, vramTotal: 8 * GIB, cpuCores: 12 },
    })
    expect(rec.placement).toBe("gpu")
    expect(rec.gpuLayers).toBe(99)
    expect(rec.contextSize).toBeGreaterThanOrEqual(8192)
    expect(rec.contextSize).toBeLessThanOrEqual(32768)
    expect(rec.threads).toBe(11)
    expect(rec.reasons).toContain("fits_gpu")
  })

  test("a 20 GB model on an 8 GB GPU is split and quantises the KV cache", () => {
    const rec = recommendLoadOptions({
      sizeBytes: 20 * GIB,
      metadata: { ...qwen7b, blockCount: 64, headCount: 40, headCountKv: 8, embeddingLength: 5120 },
      hardware: { ram: 32 * GIB, vramTotal: 8 * GIB, cpuCores: 8 },
    })
    expect(rec.placement).toBe("hybrid")
    expect(rec.gpuLayers).toBeGreaterThan(0)
    expect(rec.gpuLayers).toBeLessThan(64)
    expect(rec.kvCacheType).toBe("q8_0")
    expect(rec.reasons).toContain("hybrid")
  })

  test("without a GPU everything stays on the CPU and never exceeds 8k context", () => {
    const rec = recommendLoadOptions({
      sizeBytes: 2 * GIB,
      metadata: qwen7b,
      hardware: { ram: 16 * GIB, cpuCores: 4 },
    })
    expect(rec.placement).toBe("cpu")
    expect(rec.gpuLayers).toBe(0)
    expect(rec.kvOffload).toBe(false)
    expect(rec.contextSize).toBeLessThanOrEqual(8192)
    expect(rec.threads).toBe(3)
  })

  test("the training context caps the recommendation", () => {
    const rec = recommendLoadOptions({
      sizeBytes: 1 * GIB,
      metadata: { ...qwen7b, contextLength: 4096 },
      hardware: { ram: 64 * GIB, vramTotal: 24 * GIB, cpuCores: 16 },
    })
    expect(rec.contextSize).toBe(4096)
    expect(rec.reasons).toContain("ctx_train_limit")
  })
})
