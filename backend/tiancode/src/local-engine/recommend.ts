/**
 * Automatic load configuration for a GGUF model on this machine.
 *
 * Pure: takes the file size, the GGUF metadata and the hardware, returns the llama-server knobs
 * (context, GPU layers, threads, batch, KV cache type…) plus the reasoning so the UI can explain
 * the choice. The numbers follow what LM Studio and llama.cpp document:
 *
 * - KV cache per token = 2 (K and V) × layers × kv_heads × head_dim × bytes per element.
 * - A model fits the GPU when weights + KV cache + a working buffer stay under ~92 % of the VRAM.
 * - When it does not fit, layers are split (hybrid) and the KV cache is quantised to q8_0.
 */
import type { GgufMetadata } from "./gguf"

export interface HardwareInfo {
  readonly ram: number
  readonly vramTotal?: number
  readonly vramFree?: number
  readonly cpuCores: number
  readonly gpu?: string
}

export type Placement = "gpu" | "hybrid" | "cpu"
export type KvCacheType = "f16" | "q8_0" | "q4_0"

export interface LoadRecommendation {
  readonly contextSize: number
  readonly gpuLayers: number
  readonly threads: number
  readonly batchSize: number
  readonly flashAttention: boolean | undefined
  readonly kvCacheType: KvCacheType
  readonly useMmap: boolean
  readonly keepInMemory: boolean
  readonly kvOffload: boolean
  readonly parallel: number
  readonly placement: Placement
  readonly layers: number
  readonly trainContext: number | undefined
  readonly kvBytesPerToken: number
  readonly estimatedBytes: number
  readonly budgetBytes: number
  readonly reasons: readonly string[]
}

const CONTEXT_STEPS = [2048, 4096, 8192, 16384, 32768, 65536, 131072] as const
const MIB = 1024 * 1024
const GIB = 1024 * MIB
// Agentic prompts (system prompt + tools + files) rarely fit below 8k tokens.
const AGENT_MIN_CONTEXT = 8192

// Bytes per K+V element pair. q8_0 only quantises K here: V quantisation needs flash attention,
// which is not guaranteed on every Vulkan GPU (see buildServerArgs).
const KV_BYTES: Readonly<Record<KvCacheType, number>> = { f16: 4, q8_0: 3, q4_0: 2.5 }

export function kvBytesPerToken(metadata: GgufMetadata | undefined, cache: KvCacheType = "f16"): number {
  const layers = metadata?.blockCount ?? 32
  const heads = metadata?.headCount ?? 32
  const kvHeads = metadata?.headCountKv ?? heads
  const headDim = metadata?.embeddingLength && heads ? Math.round(metadata.embeddingLength / heads) : 128
  return layers * kvHeads * headDim * KV_BYTES[cache]
}

function estimateLayers(sizeBytes: number, metadata: GgufMetadata | undefined) {
  if (metadata?.blockCount && metadata.blockCount > 0) return metadata.blockCount
  // ~4 bits per weight and ~0.2 GB per layer at that density is a fair guess for dense models.
  return Math.max(16, Math.min(96, Math.round(sizeBytes / (110 * MIB))))
}

export interface Budgets {
  /** Percent of the VRAM / RAM / CPU cores the model may use. */
  readonly vram?: number
  readonly ram?: number
  readonly cpu?: number
}

const DEFAULT_BUDGETS = { vram: 90, ram: 60, cpu: 75 } as const

function percent(value: number | undefined, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? Math.min(100, Math.max(10, value)) / 100 : fallback / 100
}

export function recommendLoadOptions(input: {
  readonly sizeBytes: number
  readonly metadata?: GgufMetadata
  readonly hardware: HardwareInfo
  readonly budgets?: Budgets
  readonly placement?: Placement | "auto"
}): LoadRecommendation {
  const { sizeBytes, metadata, hardware } = input
  const wanted = input.placement && input.placement !== "auto" ? input.placement : undefined
  const layers = estimateLayers(sizeBytes, metadata)
  const trainContext = metadata?.contextLength && metadata.contextLength > 0 ? metadata.contextLength : undefined
  const maxContext = Math.min(trainContext ?? 8192, 131072)
  const candidates = CONTEXT_STEPS.filter((step) => step <= maxContext)
  if (candidates.length === 0) candidates.push(maxContext as (typeof CONTEXT_STEPS)[number])
  const overhead = 400 * MIB + sizeBytes * 0.12
  const vram = wanted === "cpu" ? undefined : hardware.vramTotal && hardware.vramTotal > 0 ? hardware.vramTotal : undefined
  const gpuBudget = vram ? vram * percent(input.budgets?.vram, DEFAULT_BUDGETS.vram) : 0
  const ramBudget = hardware.ram * percent(input.budgets?.ram, DEFAULT_BUDGETS.ram)
  const threads = Math.max(
    1,
    Math.min(hardware.cpuCores, Math.round(hardware.cpuCores * percent(input.budgets?.cpu, DEFAULT_BUDGETS.cpu))),
  )
  const reasons: string[] = []

  const pickContext = (budget: number, cache: KvCacheType, fixedBytes: number) => {
    let best = candidates[0]
    for (const step of candidates) {
      if (fixedBytes + kvBytesPerToken(metadata, cache) * step + overhead <= budget) best = step
    }
    return best
  }
  const build = (partial: {
    contextSize: number
    gpuLayers: number
    kvCacheType: KvCacheType
    placement: Placement
    batchSize: number
    budgetBytes: number
  }): LoadRecommendation => ({
    ...partial,
    threads,
    // "auto": llama-server enables flash attention when the backend supports it.
    flashAttention: undefined,
    useMmap: true,
    keepInMemory: false,
    kvOffload: partial.gpuLayers > 0,
    parallel: 1,
    layers,
    trainContext,
    kvBytesPerToken: kvBytesPerToken(metadata, partial.kvCacheType),
    estimatedBytes: Math.round(sizeBytes + kvBytesPerToken(metadata, partial.kvCacheType) * partial.contextSize + overhead),
    reasons,
  })

  // 1. Everything on the GPU (unless the user asked for a GPU + RAM split).
  if (wanted !== "hybrid" && vram && sizeBytes + overhead + kvBytesPerToken(metadata, "f16") * candidates[0] <= gpuBudget) {
    let kvCacheType: KvCacheType = "f16"
    let contextSize = pickContext(gpuBudget, "f16", sizeBytes)
    if (contextSize < AGENT_MIN_CONTEXT && candidates.includes(AGENT_MIN_CONTEXT)) {
      const quantised = pickContext(gpuBudget, "q8_0", sizeBytes)
      if (quantised > contextSize) {
        contextSize = quantised
        kvCacheType = "q8_0"
        reasons.push("kv_q8_for_context")
      }
    }
    reasons.unshift("fits_gpu")
    reasons.push(trainContext && contextSize >= trainContext ? "ctx_train_limit" : "ctx_vram_limit")
    return build({ contextSize, gpuLayers: 99, kvCacheType, placement: "gpu", batchSize: 512, budgetBytes: gpuBudget })
  }

  // 2. Split between GPU and RAM.
  if (vram && gpuBudget > overhead + 512 * MIB) {
    const kvCacheType: KvCacheType = "q8_0"
    const contextSize = Math.min(pickContext(gpuBudget + ramBudget, kvCacheType, sizeBytes), 16384)
    const kvBytes = kvBytesPerToken(metadata, kvCacheType) * contextSize
    const perLayer = sizeBytes / layers
    const gpuLayers = Math.max(0, Math.min(layers - 1, Math.floor((gpuBudget - overhead - kvBytes) / perLayer)))
    reasons.push(gpuLayers > 0 ? "hybrid" : "cpu_only", "kv_q8_for_memory")
    if (sizeBytes + kvBytes + overhead > gpuBudget + ramBudget) reasons.push("exceeds_memory")
    return build({
      contextSize,
      gpuLayers,
      kvCacheType,
      placement: gpuLayers > 0 ? "hybrid" : "cpu",
      batchSize: 256,
      budgetBytes: gpuBudget + ramBudget,
    })
  }

  // 3. CPU only.
  const kvCacheType: KvCacheType = "q8_0"
  const contextSize = Math.min(pickContext(ramBudget, kvCacheType, sizeBytes), 8192)
  reasons.push("cpu_only")
  if (sizeBytes + kvBytesPerToken(metadata, kvCacheType) * contextSize + overhead > ramBudget) reasons.push("exceeds_memory")
  return build({ contextSize, gpuLayers: 0, kvCacheType, placement: "cpu", batchSize: 256, budgetBytes: ramBudget })
}

export function describeBytes(bytes: number) {
  if (bytes >= GIB) return `${(bytes / GIB).toFixed(1)} GB`
  return `${Math.round(bytes / MIB)} MB`
}
