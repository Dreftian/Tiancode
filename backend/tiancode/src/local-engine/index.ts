import { LayerNode } from "@tiancode-ai/core/effect/layer-node"
import { makeGlobalNode } from "@tiancode-ai/core/effect/app-node"
import { FSUtil } from "@tiancode-ai/core/fs-util"
import { Global } from "@tiancode-ai/core/global"
import { httpClient } from "@tiancode-ai/core/effect/app-node-platform"
import { Context, Effect, Layer } from "effect"
import { type ChildProcess, execFile, spawn } from "node:child_process"
import { promisify } from "node:util"
import { existsSync, createWriteStream } from "node:fs"
import { open, rename, rm } from "node:fs/promises"
import { pipeline } from "node:stream/promises"
import { Readable, Transform } from "node:stream"
import path from "node:path"

const execFileAsync = promisify(execFile)

export type EngineStatusType = "stopped" | "starting" | "running" | "error"

export interface LocalEngineStatus {
  readonly status: EngineStatusType
  readonly port: number
  readonly modelPath?: string
  readonly modelName?: string
  readonly binaryReady: boolean
  readonly binaryDownloading: boolean
  readonly downloadProgress?: number
  readonly error?: string
  readonly gpuLayers?: number
  readonly contextSize?: number
}

export interface StartEngineOptions {
  readonly model: string
  readonly file: string
  readonly gpuLayers?: number
  readonly contextSize?: number
  readonly port?: number
}

export interface Interface {
  readonly status: () => Effect.Effect<LocalEngineStatus>
  readonly ensureBinary: () => Effect.Effect<string>
  readonly start: (options: StartEngineOptions) => Effect.Effect<LocalEngineStatus>
  readonly stop: () => Effect.Effect<LocalEngineStatus>
}

export class Service extends Context.Service<Service, Interface>()("@tiancode/LocalEngine") {}

const DEFAULT_PORT = 58282
const DEFAULT_CTX_SIZE = 8192
const DEFAULT_GPU_LAYERS = 99

// URL de descarga del binario optimizado precompilado de llama-server para Windows (con soporte Vulkan universal)
const LLAMA_CPP_WIN_URL =
  "https://github.com/ggerganov/llama.cpp/releases/download/b4800/llama-b4800-bin-win-vulkan-x64.zip"

const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const fs = yield* FSUtil.Service

    const binDir = path.join(Global.Path.bin, "llama-server")
    const modelsDir = path.join(Global.Path.data, "models")
    const binaryExecutable = process.platform === "win32" ? "llama-server.exe" : "llama-server"
    const binaryPath = path.join(binDir, binaryExecutable)

    let currentProcess: ChildProcess | undefined
    let currentStatus: EngineStatusType = "stopped"
    let currentModelPath: string | undefined
    let currentModelName: string | undefined
    let currentPort = DEFAULT_PORT
    let currentGpuLayers = DEFAULT_GPU_LAYERS
    let currentContextSize = DEFAULT_CTX_SIZE
    let lastError: string | undefined
    let binaryDownloading = false
    let downloadProgress = 0

    const isBinaryPresent = () => existsSync(binaryPath)

    const getStatus = (): LocalEngineStatus => ({
      status: currentStatus,
      port: currentPort,
      modelPath: currentModelPath,
      modelName: currentModelName,
      binaryReady: isBinaryPresent(),
      binaryDownloading,
      downloadProgress: binaryDownloading ? downloadProgress : undefined,
      error: lastError,
      gpuLayers: currentGpuLayers,
      contextSize: currentContextSize,
    })

    const downloadAndExtractBinary = Effect.fn("LocalEngine.downloadBinary")(function* () {
      if (isBinaryPresent()) return binaryPath

      binaryDownloading = true
      downloadProgress = 0

      yield* fs.ensureDir(binDir).pipe(Effect.orDie)
      const zipPath = path.join(binDir, "llama-server.zip")

      try {
        yield* Effect.tryPromise(async () => {
          const res = await fetch(LLAMA_CPP_WIN_URL, { redirect: "follow" })
          if (!res.ok || !res.body) {
            throw new Error(`HTTP ${res.status} al descargar llama-server desde GitHub`)
          }

          const part = `${zipPath}.part`
          await rm(part, { force: true }).catch(() => {})
          const total = Number(res.headers.get("content-length") ?? 0)
          let loaded = 0

          const progress = new Transform({
            transform(chunk, _encoding, callback) {
              loaded += chunk.byteLength
              if (total > 0) {
                downloadProgress = Math.round((loaded / total) * 100)
              }
              callback(null, chunk)
            },
          })

          await pipeline(Readable.fromWeb(res.body as never), progress, createWriteStream(part))
          await rename(part, zipPath)

          // Extraer el zip en binDir usando PowerShell Expand-Archive o unzip
          if (process.platform === "win32") {
            await execFileAsync("powershell", [
              "-NoProfile",
              "-Command",
              `Expand-Archive -LiteralPath "${zipPath}" -DestinationPath "${binDir}" -Force`,
            ])
          } else {
            await execFileAsync("unzip", ["-o", zipPath, "-d", binDir])
          }

          await rm(zipPath, { force: true }).catch(() => {})
        })
      } catch (err) {
        lastError = err instanceof Error ? err.message : String(err)
        yield* Effect.logError("Error al descargar e instalar llama-server", { error: lastError })
        throw err
      } finally {
        binaryDownloading = false
      }

      if (!isBinaryPresent()) {
        throw new Error("El ejecutable llama-server no se encontró tras descomprimir el paquete.")
      }

      return binaryPath
    })

    const ensureBinary = Effect.fn("LocalEngine.ensureBinary")(function* () {
      if (isBinaryPresent()) return binaryPath

      // Comprobar si llama-server está instalado globalmente en el sistema (PATH)
      const whichCmd = process.platform === "win32" ? "where" : "which"
      const onPath = yield* Effect.tryPromise(() => execFileAsync(whichCmd, ["llama-server"])).pipe(
        Effect.map((res) => res.stdout.split("\n")[0]?.trim()),
        Effect.catch(() => Effect.succeed(undefined)),
      )
      if (onPath && existsSync(onPath)) return onPath

      return yield* downloadAndExtractBinary().pipe(Effect.orDie)
    })

    const stopEngine = Effect.fn("LocalEngine.stop")(function* () {
      if (currentProcess) {
        try {
          if (process.platform === "win32" && currentProcess.pid) {
            // En Windows, matar el árbol de procesos para liberar inmediatamente la VRAM
            yield* Effect.tryPromise(() =>
              execFileAsync("taskkill", ["/PID", String(currentProcess!.pid), "/T", "/F"]),
            ).pipe(Effect.catch(() => Effect.void))
          } else {
            currentProcess.kill("SIGTERM")
          }
        } catch {
          // ignore
        }
        currentProcess = undefined
      }
      currentStatus = "stopped"
      currentModelPath = undefined
      currentModelName = undefined
      lastError = undefined
      return getStatus()
    })

    const probeHealth = async (port: number): Promise<boolean> => {
      try {
        const res = await fetch(`http://127.0.0.1:${port}/health`, { signal: AbortSignal.timeout(1000) })
        return res.ok
      } catch {
        return false
      }
    }

    const startEngine = Effect.fn("LocalEngine.start")(function* (options: StartEngineOptions) {
      // 1. Detener instancia previa si existe
      yield* stopEngine()

      currentStatus = "starting"
      currentPort = options.port ?? DEFAULT_PORT
      currentGpuLayers = options.gpuLayers ?? DEFAULT_GPU_LAYERS
      currentContextSize = options.contextSize ?? DEFAULT_CTX_SIZE
      lastError = undefined

      const resolvedModelFile = path.resolve(modelsDir, options.model, options.file)
      if (!existsSync(resolvedModelFile)) {
        currentStatus = "error"
        lastError = `El archivo del modelo no existe en disco: ${resolvedModelFile}. Descárgalo primero desde el Models Hub.`
        return getStatus()
      }

      currentModelPath = resolvedModelFile
      currentModelName = options.file.replace(/\.gguf$/i, "")

      // 2. Asegurar binario
      const execPath = yield* ensureBinary().pipe(
        Effect.catch(() => Effect.succeed(undefined)),
      )
      if (!execPath) {
        currentStatus = "error"
        lastError = lastError || "No se pudo preparar el binario llama-server."
        return getStatus()
      }

      // 3. Argumentos optimizados para llama-server
      const args = [
        "-m",
        resolvedModelFile,
        "--host",
        "127.0.0.1",
        "--port",
        String(currentPort),
        "-ngl",
        String(currentGpuLayers),
        "-c",
        String(currentContextSize),
        "--parallel",
        "1",
      ]

      yield* Effect.logInfo("Iniciando Tiancode Local Engine (llama-server)", {
        executable: execPath,
        model: resolvedModelFile,
        port: currentPort,
        gpuLayers: currentGpuLayers,
      })

      const child = spawn(execPath, args, {
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true,
        detached: false,
      })

      currentProcess = child

      child.stderr?.on("data", (data) => {
        const text = String(data)
        if (text.includes("error") || text.includes("failed")) {
          lastError = text.trim()
        }
      })

      child.once("exit", () => {
        if (currentStatus === "running" || currentStatus === "starting") {
          currentStatus = "stopped"
          currentProcess = undefined
        }
      })

      // 4. Sondeo de salud hasta que el modelo esté cargado en GPU/VRAM
      let ready = false
      for (let attempt = 0; attempt < 40; attempt++) {
        yield* Effect.sleep("500 millis")
        const ok = yield* Effect.tryPromise(() => probeHealth(currentPort)).pipe(
          Effect.catch(() => Effect.succeed(false)),
        )
        if (ok) {
          ready = true
          break
        }
      }

      if (!ready) {
        currentStatus = "error"
        lastError = lastError || "El motor de inferencia no respondió al chequeo de salud en el tiempo esperado."
        yield* stopEngine()
        return getStatus()
      }

      currentStatus = "running"
      yield* Effect.logInfo("Tiancode Local Engine listo y en ejecución", { port: currentPort, model: currentModelName })
      return getStatus()
    })

    return Service.of({
      status: () => Effect.sync(getStatus),
      ensureBinary,
      start: startEngine,
      stop: stopEngine,
    })
  }),
)

export const node = makeGlobalNode({
  service: Service,
  layer,
  deps: [FSUtil.node, Global.node, httpClient],
})

export * as LocalEngine from "."
