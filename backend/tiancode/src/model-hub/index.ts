import { LayerNode } from "@tiancode-ai/core/effect/layer-node"
import { makeGlobalNode } from "@tiancode-ai/core/effect/app-node"
import { withTransientReadRetry } from "@/util/effect-http-client"
import { httpClient } from "@tiancode-ai/core/effect/app-node-platform"
import path from "path"
import os from "os"
import { execFile } from "node:child_process"
import { promisify } from "node:util"
import { createWriteStream } from "node:fs"
import { mkdir, statfs } from "node:fs/promises"
import { Transform, Readable } from "node:stream"
import { pipeline } from "node:stream/promises"
import { Context, Effect, Layer, Schema, Scope, Types } from "effect"
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
  // adapter with the most dedicated memory. Prints "total,free" in bytes.
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
  const total = Number(result?.stdout?.trim())
  if (!total || Number.isNaN(total)) return undefined
  return { total, free: total }
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

const QUANT_PATTERN = new RegExp(`(${QUANTS.join("|")})`)

export interface QuantFile {
  readonly file: string
  readonly quant: string | undefined
  readonly size: number | undefined
}

export function parseQuantFiles(siblings: readonly HfSibling[] | undefined): QuantFile[] {
  return (siblings ?? [])
    .filter((sibling) => sibling.rfilename.endsWith(".gguf"))
    .map((sibling) => {
      const match = sibling.rfilename.match(QUANT_PATTERN)
      const size = sibling.lfs?.size ?? sibling.size
      return { file: sibling.rfilename, quant: match?.[1], size }
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

// --- Memory compatibility (green / blue / red) -------------------------------------

export type Compatibility = "green" | "blue" | "red"

// LM Studio-style fit estimation. The GPU VRAM is the primary memory for
// local models (fast), and system RAM backs it up when the model overflows
// the GPU:
// - green: the model fits entirely in VRAM (full GPU offload)
// - blue:  it does not fit in VRAM but fits in VRAM + RAM (partial offload)
// - red:   it does not fit even in VRAM + RAM (will not run)
// A ~10% overhead is added for the KV cache and runtime buffers.
const MEMORY_OVERHEAD = 1.1

export function compatibilityFor(
  sizeBytes: number | undefined,
  ramBytes: number,
  vram: VramInfo | undefined,
  useGpu = true,
  useRamFallback = true,
): Compatibility {
  if (sizeBytes === undefined) return "blue"
  const needed = sizeBytes * MEMORY_OVERHEAD
  const gpuOn = useGpu && vram !== undefined && vram.total > 0
  const ramOn = useRamFallback && ramBytes > 0
  if (gpuOn && ramOn) {
    // Prefer free VRAM for the green tier (LM Studio caps offload to the
    // available VRAM); fall back to total when free is unknown.
    const greenCap = vram.free > 0 ? vram.free : vram.total
    if (needed <= greenCap) return "green"
    if (needed <= vram.total + ramBytes) return "blue"
    return "red"
  }
  if (gpuOn) {
    const cap = vram.free > 0 ? vram.free : vram.total
    if (needed <= cap) return "green"
    return "red"
  }
  if (ramOn) {
    const ratio = needed / ramBytes
    if (ratio <= 0.6) return "green"
    if (ratio <= 1) return "blue"
    return "red"
  }
  return "blue"
}

// --- Download registry ------------------------------------------------------------

export interface DownloadState {
  readonly model: string
  readonly file: string
  readonly dest: string
  readonly total: number
  readonly received: number
  readonly done: boolean
}

// Mutable working entry kept in the registry while a download runs.
type MutableDownloadState = Types.DeepMutable<DownloadState>

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
  readonly downloads: () => Effect.Effect<DownloadState[]>
  readonly download: (model: string, file: string) => Effect.Effect<DownloadState>
}

export class Service extends Context.Service<Service, Interface>()("@tiancode/ModelHub") {}

const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
      const http = HttpClient.filterStatusOk(withTransientReadRetry(yield* HttpClient.HttpClient))
      const scope = yield* Scope.Scope
      const modelsDir = path.join(Global.Path.data, "models")

      const downloads = new Map<string, MutableDownloadState>()

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
        return parseQuantFiles(
          Array.from(data).map((entry) => ({
            rfilename: entry.path,
            size: entry.size,
            lfs: entry.lfs,
          })),
        )
      })

      const system = Effect.fn("ModelHub.system")(function* () {
        yield* Effect.tryPromise(() => mkdir(modelsDir, { recursive: true })).pipe(Effect.orDie)
        const diskFree = yield* Effect.tryPromise(() => statfs(modelsDir)).pipe(
          Effect.map((stats) => Number(stats.bavail) * Number(stats.bsize)),
          Effect.catch(() => Effect.succeed(undefined)),
        )
        const cpu = os.cpus()[0]?.model.trim()
        const gpu = yield* detectGpu()
        const vram = yield* detectVram()
        return { ram: os.totalmem(), diskFree: diskFree ?? 0, cpu, gpu, vram, modelsDir }
      })

      const listDownloads = Effect.fn("ModelHub.downloads")(function* () {
        return Array.from(downloads.values())
      })

      const download = Effect.fn("ModelHub.download")(function* (model: string, file: string) {
        const key = `${model}/${file}`
        const existing = downloads.get(key)
        if (existing) return existing

        const dest = path.join(modelsDir, model, file)
        const state: MutableDownloadState = { model, file, dest, total: 0, received: 0, done: false }
        downloads.set(key, state)

        const url = `${HUGGINGFACE_RESOLVE}/${model}/resolve/main/${file}`
        yield* Effect.gen(function* () {
          yield* Effect.tryPromise(() => mkdir(path.dirname(dest), { recursive: true })).pipe(Effect.orDie)
          yield* Effect.tryPromise(async () => {
            const response = await fetch(url, { redirect: "follow" })
            if (!response.ok || !response.body) {
              throw new Error(`HTTP ${response.status} downloading ${url}`)
            }
            state.total = Number(response.headers.get("content-length") ?? 0)
            const progress = new Transform({
              transform(chunk, _encoding, callback) {
                state.received += chunk.byteLength
                callback(null, chunk)
              },
            })
            await pipeline(Readable.fromWeb(response.body as never), progress, createWriteStream(dest))
            state.done = true
          }).pipe(
            Effect.catch((error) => {
              downloads.delete(key)
              return Effect.logError("failed to download model", { model, file, error })
            }),
          )
        }).pipe(Effect.forkIn(scope, { startImmediately: true }), Effect.asVoid)
        return state
      })

      return Service.of({ search, files, system, downloads: listDownloads, download })
    }),
  )

export const node = makeGlobalNode({
  service: Service,
  layer: layer,
  deps: [httpClient, FSUtil.node, Global.node],
})

export * as ModelHub from "."
