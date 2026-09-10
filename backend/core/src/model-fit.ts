/**
 * Whether a local GGUF model fits in this machine's memory, LM Studio style.
 *
 * Shared by the server (backend/tiancode/src/model-hub) and the Models Hub UI
 * (frontend/app/src/components/settings-v2/models-hub.tsx). Both used to carry their own
 * copy of these rules, which meant a change to one silently disagreed with the other and the
 * badge in the UI could contradict the server's own answer.
 */

export interface VramInfo {
  readonly total: number
  readonly free: number
}

/**
 * - `full_gpu`    — fits entirely in free VRAM, so every layer can be offloaded.
 * - `partial_gpu` — overflows VRAM but fits in VRAM + RAM, so some layers spill to the CPU.
 * - `ram_only`    — will not fit with GPU offload but fits in RAM alone; runs CPU-only.
 * - `no_fit`      — does not fit anywhere and will not run.
 */
export type FitTier = "full_gpu" | "partial_gpu" | "ram_only" | "no_fit"

/** Headroom for the KV cache and runtime buffers on top of the raw weight file. */
export const MEMORY_OVERHEAD = 1.1

export interface FitInput {
  /** Size of the quantised weight file in bytes; undefined when the size is not known yet. */
  readonly sizeBytes: number | undefined
  readonly ramBytes: number
  readonly vram: VramInfo | undefined
  /** Whether GPU offload is enabled in the user's memory preferences. */
  readonly useGpu?: boolean
  /** Whether spilling over into system RAM is enabled. */
  readonly useRamFallback?: boolean
}

export function compatibilityFor(input: FitInput): FitTier {
  const { sizeBytes, ramBytes, vram } = input
  const useGpu = input.useGpu ?? true
  const useRamFallback = input.useRamFallback ?? true

  // An unknown size cannot be ruled in or out; "partial" is the neutral answer that neither
  // promises full offload nor warns the user away from a model that may well run.
  if (sizeBytes === undefined) return "partial_gpu"

  const needed = sizeBytes * MEMORY_OVERHEAD
  const gpuOn = useGpu && vram !== undefined && vram.total > 0
  const ramOn = useRamFallback && ramBytes > 0

  if (gpuOn && ramOn) {
    // Prefer free VRAM for the full-offload tier (LM Studio caps offload to what is
    // actually available); fall back to total when the driver does not report free.
    const fullCap = vram.free > 0 ? vram.free : vram.total
    if (needed <= fullCap) return "full_gpu"
    if (needed <= vram.total + ramBytes) return "partial_gpu"
    if (needed <= ramBytes) return "ram_only"
    return "no_fit"
  }

  if (gpuOn) {
    const cap = vram.free > 0 ? vram.free : vram.total
    return needed <= cap ? "full_gpu" : "no_fit"
  }

  if (ramOn) {
    return needed <= ramBytes ? "ram_only" : "no_fit"
  }

  // Both offload paths are switched off: nothing can be asserted about the fit.
  return "partial_gpu"
}

/** i18n key for the badge shown against each tier. */
export const FIT_TIER_KEYS: Record<FitTier, string> = {
  full_gpu: "settings.modelsHub.fit.fullGpu",
  partial_gpu: "settings.modelsHub.fit.partialGpu",
  ram_only: "settings.modelsHub.fit.ramOnly",
  no_fit: "settings.modelsHub.fit.noFit",
}

/** English fallbacks, for surfaces without a translator (logs, the HTTP API). */
export const FIT_LABELS: Record<FitTier, string> = {
  full_gpu: "Full GPU Offload Possible",
  partial_gpu: "Partial GPU Offload Possible",
  ram_only: "Fits without GPU",
  no_fit: "Will not fit",
}
