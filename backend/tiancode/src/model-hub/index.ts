import { LayerNode } from "@tiancode-ai/core/effect/layer-node"
import { makeGlobalNode } from "@tiancode-ai/core/effect/app-node"
import { withTransientReadRetry } from "@/util/effect-http-client"
import { httpClient } from "@tiancode-ai/core/effect/app-node-platform"
import path from "path"
import os from "os"
import { execFile } from "node:child_process"
import { promisify } from "node:util"
import { createHash } from "node:crypto"
import { createReadStream, createWriteStream } from "node:fs"
import { mkdir, rename, rm, stat, statfs } from "node:fs/promises"
import { Transform, Readable } from "node:stream"
import { pipeline } from "node:stream/promises"
import { Context, Effect, Layer, Option, Schema, Scope, Types } from "effect"
import { FetchHttpClient, HttpClient, HttpClientRequest, HttpClientResponse } from "effect/unstable/http"
import { FSUtil } from "@tiancode-ai/core/fs-util"
import { Global } from "@tiancode-ai/core/global"

const execFileAsync = promisify(execFile)

// Detect the primary GPU. Windows exposes it via WMI (works for NVIDIA/AMD/
// Intel); non-Windows falls back to lspci when available. Failures return
// undefined so the settings panel still renders.
const detectGpu = Effect.fn("ModelHub.gpu")(function* () {
  if (process.platform === "win32") {
    const result = yield* Effect.tryPromise(() =>
      execFileAsync("powershell", [
        "-NoProfile",
        "-Command",
        "(Get-CimInstance Win32_VideoController | Where-Object { $_.Name } | Select-Object -First 1).Name",
      ]),
    ).pipe(Effect.catch(() => Effect.succeed(undefined)))
    const name = result?.stdout?.trim()
    if (name) return name
  }
  const lspci = yield* Effect.tryPromise(() => execFileAsync("lspci")).pipe(Effect.catch(() => Effect.succeed(undefined)))
  const vga = lspci?.stdout?.split("\n").find((line) => /vga|3d|display/i.test(line))
  return vga?.split(/\s{2,}/).slice(1).join(" ").trim() || undefined
})

// VRAM is the primary memory for local models: the GPU loads layers there
// first and system RAM only backs it up when the model overflows the GPU.
// NVIDIA reports real numbers through nvidia-smi; AMD/Intel and any fallback
// use DXGI via a small C# shim. Returns total + free bytes or undefined when
// no dedicated GPU is available.
export interface VramInfo {
  readonly total: number
  readonly free: number
}

const NVIDIA_SMI_PATHS = [
  "nvidia-smi",
  "C:\\Program Files\\NVIDIA Corporation\\NVSMI\\nvidia-smi.exe",
  "C:\\Program Files (x86)\\NVIDIA Corporation\\NVSMI\\nvidia-smi.exe",
]

const detectVram = Effect.fn("ModelHub.vram")(function* () {
  // nvidia-smi is authoritative for NVIDIA: it reports real total/free in MiB
  // (noheader,nounits). Iterate every GPU line and pick the one with the most
  // dedicated memory (the primary GPU on multi-GPU and hybrid laptops).
  for (const binary of NVIDIA_SMI_PATHS) {
    const result = yield* Effect.tryPromise(() =>
      execFileAsync(binary, [
        "--query-gpu=memory.total,memory.free,memory.used",
        "--format=csv,noheader,nounits",
      ]),
    ).pipe(Effect.catch(() => Effect.succeed(undefined)))
    let best: VramInfo | undefined
    for (const line of (result?.stdout ?? "").split("\n")) {
      const [total, free] = line.split(",").map((part) => Number(part.trim()) * 1024 * 1024)
      if (!total || free === undefined || Number.isNaN(total) || Number.isNaN(free)) continue
      if (!best || total > best.total) best = { total, free }
    }
    if (best) return best
  }
  if (process.platform !== "win32") return undefined
  // DXGI path for AMD/Intel and any fallback. The C# shim walks the vtable
  // with explicit function pointers (the [ComImport] pattern does not work
  // here), skips the Microsoft Basic Render Driver (0x1414) and picks the
  // adapter with the most dedicated memory. Prints "total,free" in bytes with
  // free derived from QueryVideoMemoryInfo (Budget minus CurrentUsage) so the
  // green tier caps offload at the VRAM actually available right now.
  const script = `
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;

[StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
public struct DXGI_ADAPTER_DESC {
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 128)] public string Description;
    public uint VendorId; public uint DeviceId; public uint SubSysId; public uint Revision;
    public IntPtr DedicatedVideoMemory; public IntPtr DedicatedSystemMemory; public IntPtr SharedSystemMemory;
    public long AdapterLuid;
}
[StructLayout(LayoutKind.Sequential)]
public struct DXGI_QUERY_VIDEO_MEMORY_INFO { public ulong Budget; public ulong CurrentUsage; public ulong AvailableForReservation; public ulong CurrentReservation; }

public static class Vram {
    [DllImport("dxgi.dll")] public static extern int CreateDXGIFactory1(ref Guid riid, out IntPtr factory);
    [UnmanagedFunctionPointer(CallingConvention.StdCall)] public delegate int DEnumAdapters(IntPtr self, uint index, out IntPtr adapter);
    [UnmanagedFunctionPointer(CallingConvention.StdCall)] public delegate int DGetDesc(IntPtr self, out DXGI_ADAPTER_DESC desc);
    [UnmanagedFunctionPointer(CallingConvention.StdCall)] public delegate int DQueryInterface(IntPtr self, ref Guid riid, out IntPtr ppv);
    [UnmanagedFunctionPointer(CallingConvention.StdCall)] public delegate int DQueryVideoMemoryInfo(IntPtr self, uint node, uint segment, out DXGI_QUERY_VIDEO_MEMORY_INFO info);

    private static readonly Guid IID_FACTORY1 = new Guid("770aae78-f26f-4dba-a829-253c83d1b387");
    private static readonly Guid IID_ADAPTER3 = new Guid("645967a4-1392-4310-a798-8053ce3e93fd");

    public static string Get() {
        long best = 0; long bestFree = 0;
        Guid fGuid = IID_FACTORY1;
        IntPtr factoryPtr;
        int hr = CreateDXGIFactory1(ref fGuid, out factoryPtr);
        if (hr != 0) return "";
        try {
            var enumAdapters = (DEnumAdapters)Marshal.GetDelegateForFunctionPointer(
                Marshal.ReadIntPtr(Marshal.ReadIntPtr(factoryPtr), 7 * IntPtr.Size), typeof(DEnumAdapters));
            uint i = 0;
            while (true) {
                IntPtr adapterPtr;
                hr = enumAdapters(factoryPtr, i, out adapterPtr);
                if (hr != 0) break;
                IntPtr vt = Marshal.ReadIntPtr(adapterPtr);
                DXGI_ADAPTER_DESC desc;
                var getDesc = (DGetDesc)Marshal.GetDelegateForFunctionPointer(Marshal.ReadIntPtr(vt, 8 * IntPtr.Size), typeof(DGetDesc));
                if (getDesc(adapterPtr, out desc) == 0 && desc.VendorId != 0x1414) {
                    long total = desc.DedicatedVideoMemory.ToInt64();
                    long free = total;
                    var qi = (DQueryInterface)Marshal.GetDelegateForFunctionPointer(Marshal.ReadIntPtr(vt, 0), typeof(DQueryInterface));
                    Guid a3Guid = IID_ADAPTER3; IntPtr a3;
                    if (qi(adapterPtr, ref a3Guid, out a3) == 0) {
                        var qvmi = (DQueryVideoMemoryInfo)Marshal.GetDelegateForFunctionPointer(
                            Marshal.ReadIntPtr(Marshal.ReadIntPtr(a3), 14 * IntPtr.Size), typeof(DQueryVideoMemoryInfo));
                        DXGI_QUERY_VIDEO_MEMORY_INFO info;
                        if (qvmi(a3, 0, 0, out info) == 0 && info.Budget > info.CurrentUsage)
                            free = (long)(info.Budget - info.CurrentUsage);
                        Marshal.Release(a3);
                    }
                    if (total > best) { best = total; bestFree = free; }
                }
                Marshal.Release(adapterPtr);
                i++;
            }
        } finally { Marshal.Release(factoryPtr); }
        return best > 0 ? best + "," + bestFree : "";
    }
}
"@
[Vram]::Get()`
  const result = yield* Effect.tryPromise(() => execFileAsync("powershell", ["-NoProfile", "-Command", script])).pipe(
    Effect.catch(() => Effect.succeed(undefined)),
  )
  // The shim prints "total,free" (bytes); both are needed — free caps the
  // full-offload tier while total bounds the partial-offload tier.
  const [totalText, freeText] = (result?.stdout?.trim() ?? "").split(",")
  const total = Number(totalText)
  const free = Number(freeText)
  if (!total || Number.isNaN(total)) return undefined
  return { total, free: free > 0 ? free : total }
})

const HUGGINGFACE_API = "https://huggingface.co/api"
const HUGGINGFACE_RESOLVE = "https://huggingface.co"

// --- Schemas for the HuggingFace API responses ---------------------------------

export class HfSibling extends Schema.Class<HfSibling>("ModelHub.HfSibling")({
  rfilename: Schema.String,
  size: Schema.optional(Schema.Number),
  lfs: Schema.optional(
    Schema.Struct({
      size: Schema.Number,
      oid: Schema.optional(Schema.String),
    }),
  ),
}) {}

export class HfModel extends Schema.Class<HfModel>("ModelHub.HfModel")({
  id: Schema.String,
  downloads: Schema.optional(Schema.Number),
  likes: Schema.optional(Schema.Number),
  pipeline_tag: Schema.optional(Schema.String),
  library_name: Schema.optional(Schema.String),
  tags: Schema.optional(Schema.Array(Schema.String)),
  siblings: Schema.optional(Schema.Array(HfSibling)),
}) {}

// File listing from GET /api/models/{id}/tree/main — carries exact LFS sizes.
export class HfTreeEntry extends Schema.Class<HfTreeEntry>("ModelHub.HfTreeEntry")({
  type: Schema.Literals(["file", "directory"]),
  path: Schema.String,
  size: Schema.optional(Schema.Number),
  lfs: Schema.optional(
    Schema.Struct({
      size: Schema.Number,
      oid: Schema.optional(Schema.String),
    }),
  ),
}) {}

// --- GGUF file parsing ----------------------------------------------------------

// Standard GGUF quantisation labels ordered roughly by size (small → large).
const QUANTS = [
  "IQ1_S",
  "IQ1_M",
  "IQ2_XS",
  "IQ2_S",
  "IQ2_M",
  "Q2_K",
  "IQ3_XS",
  "IQ3_XXS",
  "Q3_K_S",
  "IQ3_S",
  "IQ3_M",
  "Q3_K_M",
  "Q3_K_L",
  "IQ4_XS",
  "IQ4_NL",
  "Q4_0",
  "Q4_K_S",
  "Q4_K_M",
  "Q4_K_L",
  "Q5_0",
  "Q5_K_S",
  "Q5_K_M",
  "Q5_K_L",
  "Q6_K",
  "Q8_0",
  "BF16",
  "F16",
  "F32",
] as const

// Case-insensitive: repos use both conventions ("Q4_K_M" and "q4_k_m").
// Quant labels are canonicalized to uppercase so sorting and the UI stay
// consistent regardless of the repo's casing.
const QUANT_PATTERN = new RegExp(`(${QUANTS.join("|")})`, "i")

export interface QuantFile {
  readonly file: string
  readonly quant: string | undefined
  readonly size: number | undefined
  // HuggingFace LFS oid — the sha256 of the file, used to verify downloads.
  readonly sha256: string | undefined
  // LM Studio-style fit estimation for this exact quant on this machine.
  readonly fit: FitInfo | undefined
  readonly recommended: boolean
}

export function parseQuantFiles(siblings: readonly HfSibling[] | undefined): QuantFile[] {
  return (siblings ?? [])
    .filter((sibling) => sibling.rfilename.endsWith(".gguf"))
    .map((sibling) => {
      const match = sibling.rfilename.match(QUANT_PATTERN)
      const size = sibling.lfs?.size ?? sibling.size
      return {
        file: sibling.rfilename,
        quant: match?.[1].toUpperCase(),
        size,
        sha256: sibling.lfs?.oid,
        fit: undefined,
        recommended: false,
      }
    })
    .toSorted((a, b) => {
      const ai = a.quant ? QUANTS.indexOf(a.quant as (typeof QUANTS)[number]) : -1
      const bi = b.quant ? QUANTS.indexOf(b.quant as (typeof QUANTS)[number]) : -1
      if (ai === -1 && bi === -1) return 0
      if (ai === -1) return 1
      if (bi === -1) return -1
      return ai - bi
    })
}

// --- Memory compatibility (LM Studio-style fit tiers) ----------------------------

// LM Studio-style fit estimation. The GPU VRAM is the primary memory for
// local models (fast), and system RAM backs it up when the model overflows
// the GPU:
// - full_gpu:  the model fits entirely in the free VRAM (full GPU offload)
// - partial_gpu: it does not fit in VRAM but fits in VRAM + RAM (partial
//   offload, the RAM portion backs up the layers that overflow the GPU)
// - ram_only:  it does not fit with GPU offload but fits in RAM alone — the
//   model can still run CPU-only ("Fits without GPU")
// - no_fit:    it does not fit anywhere (will not run)
// A ~10% overhead is added for the KV cache and runtime buffers.
const MEMORY_OVERHEAD = 1.1

export type FitTier = "full_gpu" | "partial_gpu" | "ram_only" | "no_fit"

export const FIT_LABELS: Record<FitTier, string> = {
  full_gpu: "Full GPU Offload Possible",
  partial_gpu: "Partial GPU Offload Possible",
  ram_only: "Fits without GPU",
  no_fit: "Will not fit",
}

export interface FitInfo {
  readonly tier: FitTier
  readonly label: string
}

export function fitFor(
  sizeBytes: number | undefined,
  ramBytes: number,
  vram: VramInfo | undefined,
  useGpu = true,
  useRamFallback = true,
): FitInfo {
  const tier = compatibilityFor(sizeBytes, ramBytes, vram, useGpu, useRamFallback)
  return { tier, label: FIT_LABELS[tier] }
}

export function compatibilityFor(
  sizeBytes: number | undefined,
  ramBytes: number,
  vram: VramInfo | undefined,
  useGpu = true,
  useRamFallback = true,
): FitTier {
  if (sizeBytes === undefined) return "partial_gpu"
  const needed = sizeBytes * MEMORY_OVERHEAD
  const gpuOn = useGpu && vram !== undefined && vram.total > 0
  const ramOn = useRamFallback && ramBytes > 0
  if (gpuOn && ramOn) {
    // Prefer free VRAM for the full-offload tier (LM Studio caps offload to
    // the available VRAM); fall back to total when free is unknown.
    const fullCap = vram.free > 0 ? vram.free : vram.total
    if (needed <= fullCap) return "full_gpu"
    if (needed <= vram.total + ramBytes) return "partial_gpu"
    if (needed <= ramBytes) return "ram_only"
    return "no_fit"
  }
  if (gpuOn) {
    const cap = vram.free > 0 ? vram.free : vram.total
    if (needed <= cap) return "full_gpu"
    return "no_fit"
  }
  if (ramOn) {
    if (needed <= ramBytes) return "ram_only"
    return "no_fit"
  }
  return "partial_gpu"
}

// --- Local runtime detection (Ollama / LM Studio) ---------------------------------

const RUNTIME_PROBES = [
  { id: "ollama", name: "Ollama", url: "http://localhost:11434/api/version" },
  { id: "lmstudio", name: "LM Studio", url: "http://localhost:1234/v1/models" },
] as const

export interface RuntimeInfo {
  readonly id: string
  readonly name: string
  readonly available: boolean
  readonly version: string | undefined
}

// Short probe so the settings panel never hangs on a dead runtime; a reachable
// server without a version field (LM Studio's OpenAI-compatible /v1/models)
// still counts as available.
const probeRuntime = async (url: string): Promise<{ reachable: boolean; version?: string }> => {
  const response = await fetch(url, { signal: AbortSignal.timeout(1000) })
  if (!response.ok) return { reachable: false }
  const body = await response.json().catch(() => undefined)
  return { reachable: true, version: typeof body?.version === "string" ? body.version : undefined }
}

// --- Download registry (persisted jobs) ------------------------------------------

export type DownloadStatus = "downloading" | "paused" | "completed" | "failed"

// Canonical shape of a persisted download job. Jobs live in
// `Global.Path.data/models/.jobs.json` so downloads survive restarts: the
// registry is rehydrated at startup, in-flight "downloading" entries become
// "paused", and `download()` resumes from the `.part` file with a Range
// request instead of restarting from zero.
export class DownloadJob extends Schema.Class<DownloadJob>("ModelHub.DownloadJob")({
  id: Schema.String,
  owner: Schema.String,
  repo: Schema.String,
  file: Schema.String,
  url: Schema.String,
  sizeBytes: Schema.optional(Schema.Number),
  sha256: Schema.optional(Schema.String),
  downloadedBytes: Schema.Number,
  status: Schema.Literals(["downloading", "paused", "completed", "failed"]),
  tempPath: Schema.String,
  destPath: Schema.String,
  startedAt: Schema.Number,
  completedAt: Schema.optional(Schema.Number),
  error: Schema.optional(Schema.String),
}) {}

// Mutable working entry kept in the registry while a download runs.
type MutableDownloadJob = Types.DeepMutable<DownloadJob>

// API-facing shape: the canonical job plus the legacy fields the existing UI
// polls (`model`, `dest`, `total`, `received`, `done`) so the endpoints stay
// backward compatible.
export interface DownloadState extends DownloadJob {
  readonly model: string
  readonly dest: string
  readonly total: number
  readonly received: number
  readonly done: boolean
}

// Stable, URL-safe id so a resumed download finds the same job after a
// restart without any extra bookkeeping.
const jobId = (model: string, file: string) => createHash("sha256").update(`${model}/${file}`).digest("hex").slice(0, 16)

const toDownloadState = (job: DownloadJob): DownloadState => ({
  ...job,
  model: `${job.owner}/${job.repo}`,
  dest: job.destPath,
  total: job.sizeBytes ?? 0,
  received: job.downloadedBytes,
  done: job.status === "completed",
})

export interface SystemInfo {
  readonly ram: number
  readonly diskFree: number
  readonly cpu: string | undefined
  readonly gpu: string | undefined
  readonly vram: VramInfo | undefined
  readonly modelsDir: string
}

export interface Interface {
  readonly search: (query: string, limit: number) => Effect.Effect<HfModel[]>
  readonly files: (model: string) => Effect.Effect<QuantFile[]>
  readonly system: () => Effect.Effect<SystemInfo>
  readonly runtimes: () => Effect.Effect<RuntimeInfo[]>
  readonly downloads: () => Effect.Effect<DownloadState[]>
  readonly download: (model: string, file: string) => Effect.Effect<DownloadState>
  readonly cancelDownload: (id: string) => Effect.Effect<boolean>
}

export class Service extends Context.Service<Service, Interface>()("@tiancode/ModelHub") {}

const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
      const http = HttpClient.filterStatusOk(withTransientReadRetry(yield* HttpClient.HttpClient))
      const fs = yield* FSUtil.Service
      const scope = yield* Scope.Scope
      const modelsDir = path.join(Global.Path.data, "models")
      const jobsFile = path.join(modelsDir, ".jobs.json")

      const jobs = new Map<string, MutableDownloadJob>()
      const controllers = new Map<string, AbortController>()
      let lastPersist = 0

      // Persist the registry; throttled so progress updates do not hammer the
      // disk, with a force flag for status transitions that must survive a
      // crash (start, pause, complete, fail).
      const persistJobs = Effect.fn("ModelHub.persistJobs")(function* (force = false) {
        const now = Date.now()
        if (!force && now - lastPersist < 2000) return
        lastPersist = now
        yield* fs.writeJson(jobsFile, Array.from(jobs.values())).pipe(
          Effect.catch((error) => Effect.logError("failed to persist model hub jobs", { error })),
        )
      })

      // Rehydrate jobs from disk. In-flight downloads become paused — a crash
      // or restart leaves a `.part` file behind that `download()` resumes.
      yield* fs.ensureDir(modelsDir).pipe(Effect.orDie)
      const stored = yield* fs.readJson(jobsFile).pipe(
        Effect.catchReason("PlatformError", "NotFound", () => Effect.succeed(undefined)),
        Effect.catch(() => Effect.succeed(undefined)),
      )
      if (stored !== undefined) {
        for (const job of Option.getOrElse(Schema.decodeUnknownOption(Schema.Array(DownloadJob))(stored), () => [])) {
          const mutable = { ...job, status: job.status === "downloading" ? "paused" : job.status } as MutableDownloadJob
          const partSize = yield* Effect.tryPromise(() => stat(mutable.tempPath)).pipe(
            Effect.map((info) => info.size),
            Effect.catch(() => Effect.succeed(0)),
          )
          if (partSize > 0) mutable.downloadedBytes = partSize
          jobs.set(mutable.id, mutable)
        }
      }

      // Combined RAM + VRAM probe shared by the files list and system info.
      // La detección de GPU lanza nvidia-smi / PowerShell; se cachea 30s para
      // que el panel de ajustes no la re-ejecute en cada poll.
      let memoryCache: { ram: number; vram: VramInfo | undefined } | undefined
      let memoryCachedAt = 0
      const memory = Effect.fn("ModelHub.memory")(function* () {
        const now = Date.now()
        if (memoryCache && now - memoryCachedAt < 30_000) return memoryCache
        const vram = yield* detectVram()
        memoryCache = { ram: os.totalmem(), vram }
        memoryCachedAt = now
        return memoryCache
      })

      const search = Effect.fn("ModelHub.search")(function* (query: string, limit: number) {
      const url = new URL(`${HUGGINGFACE_API}/models`)
      url.searchParams.set("search", query)
      url.searchParams.set("limit", String(limit))
      url.searchParams.set("filter", "gguf")
      url.searchParams.set("sort", "downloads")
      url.searchParams.set("direction", "-1")
      url.searchParams.set("full", "true")
        const data = yield* HttpClientRequest.get(url.href).pipe(
          HttpClientRequest.acceptJson,
          http.execute,
          Effect.flatMap(HttpClientResponse.schemaBodyJson(Schema.Array(HfModel))),
          Effect.catch((error) =>
            Effect.logError("failed to search huggingface models", { query, error }).pipe(Effect.as([] as HfModel[])),
          ),
        )
        return Array.from(data)
      })

      const files = Effect.fn("ModelHub.files")(function* (model: string) {
        const url = `${HUGGINGFACE_API}/models/${model}/tree/main`
        const data = yield* HttpClientRequest.get(url).pipe(
          HttpClientRequest.acceptJson,
          http.execute,
          Effect.flatMap(HttpClientResponse.schemaBodyJson(Schema.Array(HfTreeEntry))),
          Effect.catch((error) =>
            Effect.logError("failed to list model files", { model, error }).pipe(Effect.as([] as HfTreeEntry[])),
          ),
        )
        const { ram, vram } = yield* memory()
        return parseQuantFiles(
          Array.from(data).map((entry) => ({
            rfilename: entry.path,
            size: entry.size,
            lfs: entry.lfs,
          })),
        ).map((file) => ({
          ...file,
          fit: fitFor(file.size, ram, vram),
          // Q4_K_M is the community default sweet spot; flag it when present.
          recommended: file.quant === "Q4_K_M",
        }))
      })

      const system = Effect.fn("ModelHub.system")(function* () {
        const diskFree = yield* Effect.tryPromise(() => statfs(modelsDir)).pipe(
          Effect.map((stats) => Number(stats.bavail) * Number(stats.bsize)),
          Effect.catch(() => Effect.succeed(undefined)),
        )
        const cpu = os.cpus()[0]?.model.trim()
        const gpu = yield* detectGpu()
        const { ram, vram } = yield* memory()
        return { ram, diskFree: diskFree ?? 0, cpu, gpu, vram, modelsDir }
      })

      const runtimes = Effect.fn("ModelHub.runtimes")(function* () {
        return yield* Effect.all(
          RUNTIME_PROBES.map((runtime) =>
            Effect.tryPromise(() => probeRuntime(runtime.url)).pipe(
              Effect.catch(() => Effect.succeed({ reachable: false, version: undefined })),
              Effect.map(({ reachable, version }) => ({
                id: runtime.id,
                name: runtime.name,
                available: reachable,
                version,
              })),
            ),
          ),
          { concurrency: "unbounded" },
        )
      })

      const listDownloads = Effect.fn("ModelHub.downloads")(function* () {
        return Array.from(jobs.values()).map(toDownloadState)
      })

      // Streams the file to `<dest>.part` and verifies the sha256 from the
      // HuggingFace tree when known; on success the file is renamed into
      // place. A resumed download sends `Range: bytes=<offset>-`; servers that
      // ignore it respond 200 and the file restarts from zero.
      const runDownload = Effect.fn("ModelHub.runDownload")(function* (job: MutableDownloadJob) {
        const model = `${job.owner}/${job.repo}`
        const controller = new AbortController()
        controllers.set(job.id, controller)
        yield* Effect.ensuring(
          Effect.gen(function* () {
            yield* Effect.tryPromise(() => mkdir(path.dirname(job.destPath), { recursive: true })).pipe(Effect.orDie)
            // Resolve the exact size + sha256 from the repo tree when the job
            // does not carry them yet.
            if (job.sizeBytes === undefined || job.sha256 === undefined) {
              const tree = yield* HttpClientRequest.get(`${HUGGINGFACE_API}/models/${model}/tree/main`).pipe(
                HttpClientRequest.acceptJson,
                http.execute,
                Effect.flatMap(HttpClientResponse.schemaBodyJson(Schema.Array(HfTreeEntry))),
                Effect.catch(() => Effect.succeed([] as HfTreeEntry[])),
              )
              const info = Array.from(tree).find((entry) => entry.path === job.file)
              if (info?.size) job.sizeBytes = info.size
              if (info?.lfs?.oid) job.sha256 = info.lfs.oid
            }
            // Reconcile the offset with the actual `.part` file on disk.
            const partSize = yield* Effect.tryPromise(() => stat(job.tempPath)).pipe(
              Effect.map((info) => info.size),
              Effect.catch(() => Effect.succeed(0)),
            )
            job.downloadedBytes = partSize
            if (job.sizeBytes !== undefined && job.downloadedBytes >= job.sizeBytes) {
              // Crash recovery: the .part file is complete but was never
              // renamed into place. Move it now; if that fails the job is
              // failed rather than looping on a bad file.
              const renamed = yield* Effect.tryPromise(() => rename(job.tempPath, job.destPath)).pipe(
                Effect.map(() => true),
                Effect.catch(() => Effect.succeed(false)),
              )
              if (!renamed) {
                job.status = "failed"
                job.error = "completed partial file could not be moved into place"
                job.completedAt = Date.now()
                yield* persistJobs(true)
                return
              }
              job.status = "completed"
              job.completedAt = Date.now()
              yield* persistJobs(true)
              return
            }
            // An already-completed destination (e.g. re-adding a job after a
            // manual cleanup) short-circuits without re-downloading.
            if (yield* fs.existsSafe(job.destPath)) {
              job.downloadedBytes = job.sizeBytes ?? 0
              job.status = "completed"
              job.completedAt = Date.now()
              yield* persistJobs(true)
              return
            }
            job.status = "downloading"
            job.error = undefined
            yield* persistJobs(true)
            const outcome = yield* Effect.tryPromise(async () => {
              const offset = job.downloadedBytes
              const response = await fetch(job.url, {
                headers: offset > 0 ? { Range: `bytes=${offset}-` } : undefined,
                redirect: "follow",
                signal: controller.signal,
              })
              if (!response.ok || !response.body) throw new Error(`HTTP ${response.status} downloading ${job.url}`)
              // 206 confirms the server honored the Range; a 200 means it
              // ignored it and the file must restart from zero.
              const resuming = response.status === 206
              if (!resuming) job.downloadedBytes = 0
              const contentRange = response.headers.get("content-range")
              const rangeTotal = contentRange ? Number(contentRange.split("/")[1]) : 0
              job.sizeBytes = rangeTotal > 0 ? rangeTotal : Number(response.headers.get("content-length") ?? 0)
              const progress = new Transform({
                transform(chunk, _encoding, callback) {
                  job.downloadedBytes += chunk.byteLength
                  callback(null, chunk)
                },
              })
              await pipeline(
                Readable.fromWeb(response.body as never),
                progress,
                createWriteStream(job.tempPath, { flags: resuming ? "a" : "w" }),
                { signal: controller.signal },
              )
              if (job.sha256) {
                const digest = createHash("sha256")
                await pipeline(createReadStream(job.tempPath), digest)
                if (digest.digest("hex") !== job.sha256) throw new Error(`sha256 mismatch for ${job.file}`)
              }
              await rename(job.tempPath, job.destPath)
            }).pipe(
              Effect.map(() => "ok" as const),
              Effect.catch((error) => {
                // Cancelled jobs are removed from the registry while the
                // fetch is aborted; never resurrect them as failed.
                if (jobs.get(job.id) !== job) return Effect.succeed("cancelled" as const)
                job.status = "failed"
                job.error = error instanceof Error ? error.message : String(error)
                job.completedAt = Date.now()
                return persistJobs(true).pipe(
                  Effect.flatMap(() => Effect.logError("failed to download model", { model, file: job.file, error })),
                  Effect.as("failed" as const),
                )
              }),
            )
            if (outcome !== "ok") return
            job.status = "completed"
            job.completedAt = Date.now()
            yield* persistJobs(true)
          }),
          Effect.sync(() => controllers.delete(job.id)),
        )
      })

      const download = Effect.fn("ModelHub.download")(function* (model: string, file: string) {
        const id = jobId(model, file)
        const existing = jobs.get(id)
        if (existing) {
          if (existing.status === "downloading") return toDownloadState(existing)
          if (existing.status === "completed") {
            if (yield* fs.existsSafe(existing.destPath)) return toDownloadState(existing)
            // The destination was removed after completion (e.g. manual
            // cleanup) — restart the job from scratch.
            existing.status = "paused"
            existing.completedAt = undefined
            existing.downloadedBytes = 0
          }
          // paused or failed → resume from the `.part` offset. The controller
          // guard keeps a double-resume from forking two concurrent fetches.
          if (controllers.has(id)) return toDownloadState(existing)
          yield* runDownload(existing).pipe(Effect.forkIn(scope, { startImmediately: true }), Effect.asVoid)
          return toDownloadState(existing)
        }
        const [owner, ...rest] = model.split("/")
        const destPath = path.join(modelsDir, model, file)
        const job: MutableDownloadJob = new DownloadJob({
          id,
          owner,
          repo: rest.join("/"),
          file,
          url: `${HUGGINGFACE_RESOLVE}/${model}/resolve/main/${file}`,
          sizeBytes: undefined,
          sha256: undefined,
          downloadedBytes: 0,
          status: "downloading",
          tempPath: `${destPath}.part`,
          destPath,
          startedAt: Date.now(),
          completedAt: undefined,
          error: undefined,
        })
        jobs.set(id, job)
        yield* persistJobs(true)
        yield* runDownload(job).pipe(Effect.forkIn(scope, { startImmediately: true }), Effect.asVoid)
        return toDownloadState(job)
      })

      const cancelDownload = Effect.fn("ModelHub.cancelDownload")(function* (id: string) {
        const job = jobs.get(id)
        if (!job) return false
        controllers.get(id)?.abort()
        controllers.delete(id)
        jobs.delete(id)
        yield* Effect.tryPromise(() => rm(job.tempPath, { force: true })).pipe(Effect.catch(() => Effect.void))
        yield* persistJobs(true)
        return true
      })

      return Service.of({ search, files, system, runtimes, downloads: listDownloads, download, cancelDownload })
    }),
  )

export const node = makeGlobalNode({
  service: Service,
  layer: layer,
  deps: [httpClient, FSUtil.node, Global.node],
})

export * as ModelHub from "."
