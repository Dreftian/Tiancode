/**
 * The load options the local engine uses when nothing more specific is requested: what the user
 * chose under Settings › Local models › Settings (automatic configuration on/off plus the manual
 * knobs). Persisted next to the models folder choice so the engine that starts on demand from the
 * chat — the common path, most users never open the Models Hub — behaves like the one started
 * from the hub.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import path from "node:path"
import { Global } from "@tiancode-ai/core/global"
import type { EngineLoadOptions } from "./index"

export interface LoadDefaults extends EngineLoadOptions {
  /** Derive context, GPU layers, threads, batch and KV cache from the GGUF header + hardware. */
  readonly auto: boolean
}

const FILE = "local-engine-load.json"
const KEYS: ReadonlyArray<keyof EngineLoadOptions> = [
  "gpuLayers",
  "contextSize",
  "batchSize",
  "flashAttention",
  "kvCacheType",
  "keepInMemory",
  "useMmap",
  "seed",
  "threads",
  "ropeFrequencyBase",
  "ropeFrequencyScale",
  "kvOffload",
  "parallel",
  "vramBudget",
  "ramBudget",
  "cpuBudget",
  "placement",
  "idleUnloadMinutes",
]

let cache: LoadDefaults | undefined

function file() {
  return path.join(Global.Path.data, FILE)
}

function sanitize(input: unknown): LoadDefaults {
  const raw = (input && typeof input === "object" ? input : {}) as Record<string, unknown>
  const out: Record<string, unknown> = { auto: raw.auto !== false }
  for (const key of KEYS) {
    const value = raw[key]
    if (value === undefined || value === null) continue
    if (key === "kvCacheType") {
      if (value === "f16" || value === "q8_0" || value === "q4_0") out[key] = value
    } else if (key === "placement") {
      if (value === "auto" || value === "gpu" || value === "hybrid" || value === "cpu") out[key] = value
    } else if (typeof value === "number" && Number.isFinite(value)) out[key] = value
    else if (typeof value === "boolean") out[key] = value
  }
  return out as unknown as LoadDefaults
}

export function getLoadDefaults(): LoadDefaults {
  if (cache) return cache
  try {
    cache = sanitize(JSON.parse(readFileSync(file(), "utf8")))
  } catch {
    cache = { auto: true }
  }
  return cache
}

export function setLoadDefaults(next: unknown): LoadDefaults {
  cache = sanitize(next)
  try {
    mkdirSync(Global.Path.data, { recursive: true })
    writeFileSync(file(), JSON.stringify(cache, null, 2))
  } catch {
    // keep the in-memory value for this process
  }
  return cache
}

/** Test hook. */
export function resetLoadDefaultsCache() {
  cache = undefined
}
