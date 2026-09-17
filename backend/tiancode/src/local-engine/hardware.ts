/**
 * GPU and memory detection shared by the local engine (automatic load configuration) and the
 * Models Hub (fit badges, system panel). Results are cached for the life of the process: the
 * WMI/PowerShell probes cost about a second each and the answers do not change while running.
 */
import { execFile } from "node:child_process"
import os from "node:os"
import { promisify } from "node:util"
import { Effect } from "effect"
import type { VramInfo } from "@tiancode-ai/core/model-fit"
import type { HardwareInfo } from "./recommend"

const execFileAsync = promisify(execFile)

let cachedGpu: string | undefined
let cachedGpuChecked = false
let cachedVram: VramInfo | undefined
let cachedVramChecked = false

// Detect the primary GPU. Windows exposes it via WMI (works for NVIDIA/AMD/
// Intel); non-Windows falls back to lspci when available. Failures return
// undefined so the settings panel still renders quickly without freezing.
export const detectGpu = Effect.fn("Hardware.gpu")(function* () {
  if (cachedGpuChecked) return cachedGpu
  cachedGpuChecked = true
  if (process.platform === "win32") {
    const result = yield* Effect.tryPromise(() =>
      execFileAsync(
        "powershell",
        [
          "-NoProfile",
          "-NonInteractive",
          "-WindowStyle",
          "Hidden",
          "-Command",
          "(Get-CimInstance Win32_VideoController | Where-Object { $_.Name } | Select-Object -First 1).Name",
        ],
        { timeout: 3000, windowsHide: true },
      ),
    ).pipe(Effect.catch(() => Effect.succeed(undefined)))
    const name = result?.stdout?.trim()
    if (name) {
      cachedGpu = name
      return name
    }
  }
  const lspci = yield* Effect.tryPromise(() => execFileAsync("lspci", [], { timeout: 3000, windowsHide: true })).pipe(
    Effect.catch(() => Effect.succeed(undefined)),
  )
  const vga = lspci?.stdout?.split("\n").find((line) => /vga|3d|display/i.test(line))
  cachedGpu =
    vga
      ?.split(/\s{2,}/)
      .slice(1)
      .join(" ")
      .trim() || undefined
  return cachedGpu
})

// VRAM is the primary memory for local models: the GPU loads layers there
// first and system RAM only backs it up when the model overflows the GPU.
// NVIDIA reports real numbers through nvidia-smi; AMD/Intel and any fallback
// use fast cached queries. Returns total + free bytes or undefined.
const NVIDIA_SMI_PATHS = [
  "nvidia-smi",
  "C:\\Program Files\\NVIDIA Corporation\\NVSMI\\nvidia-smi.exe",
  "C:\\Program Files (x86)\\NVIDIA Corporation\\NVSMI\\nvidia-smi.exe",
]

export const detectVram = Effect.fn("Hardware.vram")(function* () {
  if (cachedVram !== undefined) return cachedVram
  if (cachedVramChecked) return cachedVram
  cachedVramChecked = true

  // nvidia-smi is authoritative for NVIDIA: reports real total/free in MiB
  for (const binary of NVIDIA_SMI_PATHS) {
    const result = yield* Effect.tryPromise(() =>
      execFileAsync(
        binary,
        ["--query-gpu=memory.total,memory.free,memory.used", "--format=csv,noheader,nounits"],
        { timeout: 2000, windowsHide: true },
      ),
    ).pipe(Effect.catch(() => Effect.succeed(undefined)))
    let best: VramInfo | undefined
    for (const line of (result?.stdout ?? "").split("\n")) {
      const [total, free] = line.split(",").map((part) => Number(part.trim()) * 1024 * 1024)
      if (!total || free === undefined || Number.isNaN(total) || Number.isNaN(free)) continue
      if (!best || total > best.total) best = { total, free }
    }
    if (best) {
      cachedVram = best
      return best
    }
  }

  if (process.platform !== "win32") return undefined

  // Fast WMI AdapterRAM query for Intel/AMD/fallback GPUs (instant execution)
  const wmiResult = yield* Effect.tryPromise(() =>
    execFileAsync(
      "powershell",
      [
        "-NoProfile",
        "-NonInteractive",
        "-WindowStyle",
        "Hidden",
        "-Command",
        "(Get-CimInstance Win32_VideoController | Select-Object -ExpandProperty AdapterRAM | Measure-Object -Maximum).Maximum",
      ],
      { timeout: 3000, windowsHide: true },
    ),
  ).pipe(Effect.catch(() => Effect.succeed(undefined)))

  const wmiBytes = Number(wmiResult?.stdout?.trim())
  if (wmiBytes && !Number.isNaN(wmiBytes) && wmiBytes > 0) {
    cachedVram = { total: wmiBytes, free: wmiBytes }
    return cachedVram
  }

  return undefined
})

/** Everything the load recommendation needs, in one call. */
export const hardwareInfo = Effect.fn("Hardware.info")(function* (): Generator<
  Effect.Effect<unknown, never, never>,
  HardwareInfo
> {
  const vram = yield* detectVram()
  const gpu = yield* detectGpu()
  return { ram: os.totalmem(), vramTotal: vram?.total, vramFree: vram?.free, cpuCores: os.cpus().length, gpu }
})
