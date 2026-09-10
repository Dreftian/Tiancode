import { describe, expect, test } from "bun:test"
import { compatibilityFor, MEMORY_OVERHEAD, type FitTier, type VramInfo } from "../src/model-fit"

const GB = 1024 ** 3

const tier = (over: {
  sizeBytes?: number | undefined
  ramBytes?: number
  vram?: VramInfo | undefined
  useGpu?: boolean
  useRamFallback?: boolean
}): FitTier =>
  compatibilityFor({
    sizeBytes: 4 * GB,
    ramBytes: 32 * GB,
    vram: { total: 8 * GB, free: 8 * GB },
    ...over,
  })

describe("compatibilityFor", () => {
  test("an unknown size is neither promised nor ruled out", () => {
    expect(tier({ sizeBytes: undefined })).toBe("partial_gpu")
  })

  test("a model inside free VRAM offloads fully", () => {
    expect(tier({ sizeBytes: 4 * GB, vram: { total: 8 * GB, free: 8 * GB } })).toBe("full_gpu")
  })

  test("the overhead is charged against the fit, not just the raw file", () => {
    // 7.8 GB of weights is under 8 GB of VRAM, but not once the KV cache is accounted for.
    expect(7.8 * GB * MEMORY_OVERHEAD).toBeGreaterThan(8 * GB)
    expect(tier({ sizeBytes: 7.8 * GB, vram: { total: 8 * GB, free: 8 * GB } })).toBe("partial_gpu")
  })

  test("free VRAM, not total, decides full offload", () => {
    // 6 GB fits the card but not what is currently free, so layers must spill.
    expect(tier({ sizeBytes: 6 * GB, vram: { total: 8 * GB, free: 2 * GB } })).toBe("partial_gpu")
  })

  test("total VRAM is used when the driver reports no free figure", () => {
    expect(tier({ sizeBytes: 6 * GB, vram: { total: 8 * GB, free: 0 } })).toBe("full_gpu")
  })

  test("overflowing VRAM but fitting VRAM+RAM is a partial offload", () => {
    expect(tier({ sizeBytes: 20 * GB, ramBytes: 32 * GB, vram: { total: 8 * GB, free: 8 * GB } })).toBe("partial_gpu")
  })

  test("beyond every pool is a no-fit", () => {
    expect(tier({ sizeBytes: 200 * GB, ramBytes: 32 * GB, vram: { total: 8 * GB, free: 8 * GB } })).toBe("no_fit")
  })

  test("with the GPU switched off, only RAM counts", () => {
    expect(tier({ sizeBytes: 20 * GB, useGpu: false })).toBe("ram_only")
    expect(tier({ sizeBytes: 64 * GB, useGpu: false })).toBe("no_fit")
  })

  test("with RAM fallback switched off, the model must fit the GPU alone", () => {
    expect(tier({ sizeBytes: 4 * GB, useRamFallback: false })).toBe("full_gpu")
    expect(tier({ sizeBytes: 20 * GB, useRamFallback: false })).toBe("no_fit")
  })

  test("absent VRAM info falls back to the RAM-only path", () => {
    expect(tier({ sizeBytes: 20 * GB, vram: undefined })).toBe("ram_only")
  })

  test("with both paths disabled nothing can be asserted", () => {
    expect(tier({ useGpu: false, useRamFallback: false })).toBe("partial_gpu")
  })
})
