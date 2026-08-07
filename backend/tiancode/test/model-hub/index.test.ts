import { describe, expect, test } from "bun:test"
import { ModelHub } from "../../src/model-hub"

describe("model-hub", () => {
  describe("parseQuantFiles", () => {
    test("extracts quant labels, sizes and lfs sha256 from gguf siblings", () => {
      const files = ModelHub.parseQuantFiles([
        { rfilename: "model-q4_k_m.gguf", lfs: { size: 100, oid: "abc123" } },
        { rfilename: "model-F16.gguf", lfs: { size: 400 } },
        { rfilename: "README.md", size: 10 },
      ])
      expect(files).toEqual([
        { file: "model-q4_k_m.gguf", quant: "Q4_K_M", size: 100, sha256: "abc123", fit: undefined, recommended: false },
        { file: "model-F16.gguf", quant: "F16", size: 400, sha256: undefined, fit: undefined, recommended: false },
      ])
    })
  })

  describe("compatibilityFor", () => {
    const vram = { total: 8e9, free: 6e9 }
    // 5 GB model with the 1.1x overhead needs 5.5 GB.
    const fiveGb = 5e9
    // 10 GB model needs 11 GB.
    const tenGb = 10e9
    // 20 GB model needs 22 GB.
    const twentyGb = 20e9

    test("fits fully in free VRAM → full_gpu", () => {
      expect(ModelHub.compatibilityFor(fiveGb, 16e9, vram)).toBe("full_gpu")
    })

    test("overflows free VRAM but fits VRAM + RAM → partial_gpu", () => {
      // 5.5 GB > 6 GB free but < 8 + 16 GB total.
      expect(ModelHub.compatibilityFor(tenGb, 16e9, vram)).toBe("partial_gpu")
    })

    test("fits neither with GPU offload nor in RAM → no_fit", () => {
      expect(ModelHub.compatibilityFor(twentyGb, 8e9, vram)).toBe("no_fit")
    })

    test("no GPU → ram_only when it fits in RAM, no_fit otherwise", () => {
      expect(ModelHub.compatibilityFor(fiveGb, 16e9, undefined)).toBe("ram_only")
      expect(ModelHub.compatibilityFor(twentyGb, 8e9, undefined)).toBe("no_fit")
    })

    test("gpu off disabled → ram_only / no_fit from RAM alone", () => {
      expect(ModelHub.compatibilityFor(fiveGb, 16e9, vram, false, true)).toBe("ram_only")
      expect(ModelHub.compatibilityFor(twentyGb, 8e9, vram, false, true)).toBe("no_fit")
    })

    test("unknown size stays neutral (partial_gpu)", () => {
      expect(ModelHub.compatibilityFor(undefined, 16e9, vram)).toBe("partial_gpu")
    })
  })

  describe("fitFor", () => {
    test("carries the descriptive LM Studio-style label", () => {
      expect(ModelHub.fitFor(5e9, 16e9, { total: 8e9, free: 6e9 })).toEqual({
        tier: "full_gpu",
        label: "Full GPU Offload Possible",
      })
      expect(ModelHub.fitFor(5e9, 16e9, undefined)).toEqual({ tier: "ram_only", label: "Fits without GPU" })
    })
  })
})
