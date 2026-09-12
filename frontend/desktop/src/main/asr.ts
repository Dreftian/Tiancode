import { app, BrowserWindow, utilityProcess, type UtilityProcess } from "electron"
import { createHash } from "node:crypto"
import { createReadStream, existsSync } from "node:fs"
import { mkdir, open, rename, rm } from "node:fs/promises"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { write as writeLog } from "./logging"
import type { AsrLanguage, AsrNotice, AsrResult } from "../preload/types"

// Local speech-to-text for mic dictation. Electron does not ship the Web
// Speech API, so the renderer captures audio (getUserMedia) and streams PCM
// chunks here; sherpa-onnx (the same WASM engine as piper TTS) transcribes
// the full clip with the multilingual Whisper tiny model
// (csukuangfj/sherpa-onnx-whisper-tiny). 146MB on first use, cached under
// userData, fully offline afterwards. The recognizer itself lives in
// asr-worker.ts: decoding is a blocking native call and froze every window
// while it ran in this process.

export type AsrModelFile = {
  name: string
  bytes: number
}

export type AsrModelDef = {
  repo: string
  encoder: string
  decoder: string
  tokens: string
  sizeMb: number
}

// Tamaños reales en disco. Se usan para ponderar el progreso de descarga
// (si no, la barra se reiniciaba en cada uno de los tres archivos) y para
// derivar el tamaño que se le anuncia al usuario antes de descargar.
export const ASR_MODEL_FILES: AsrModelFile[] = [
  { name: "tiny-tokens.txt", bytes: 816_730 },
  { name: "tiny-encoder.onnx", bytes: 37_647_080 },
  { name: "tiny-decoder.onnx", bytes: 114_505_801 },
]

export const ASR_MODEL_BYTES = ASR_MODEL_FILES.reduce((sum, file) => sum + file.bytes, 0)

export const ASR_MODEL: AsrModelDef = {
  repo: "csukuangfj/sherpa-onnx-whisper-tiny",
  encoder: "tiny-encoder.onnx",
  decoder: "tiny-decoder.onnx",
  tokens: "tiny-tokens.txt",
  // 152.969.611 B = 146 MB. El número viaja hasta el aviso de consentimiento
  // del renderer, así que no puede divergir del peso real.
  sizeMb: Math.round(ASR_MODEL_BYTES / (1024 * 1024)),
}

// Whisper tiny es multilingüe (99 idiomas): se acepta cualquier idioma de la
// app en vez de colapsarlo todo a inglés.
const ASR_LANGUAGES: AsrLanguage[] = ["en", "es", "ja", "ko", "ru", "zh"]

export function resolveAsrLanguage(value: unknown): AsrLanguage {
  return ASR_LANGUAGES.includes(value as AsrLanguage) ? (value as AsrLanguage) : "en"
}

const HF_BASE = "https://huggingface.co"
const MODEL_DIR = "asr-whisper-tiny"

type AsrStatus = "idle" | "downloading" | "ready" | "error"

let status: AsrStatus = "idle"
let failure: string | undefined
let progress: number | undefined
let modelPromise: Promise<void> | undefined
let recording = false

function checkModelReady(): boolean {
  try {
    const dir = modelDir()
    return ASR_MODEL_FILES.every((file) => existsSync(join(dir, file.name)))
  } catch {
    return false
  }
}

export function getAsrStatus() {
  if (status === "idle" && checkModelReady()) {
    status = "ready"
  }
  return {
    ready: status === "ready",
    downloading: status === "downloading" || undefined,
    progress,
    sizeMb: ASR_MODEL.sizeMb,
    ...(failure ? { error: failure } : {}),
  }
}

function broadcast(channel: string, payload: unknown) {
  for (const win of BrowserWindow.getAllWindows()) {
    if (win.isDestroyed() || win.webContents.isDestroyed()) continue
    win.webContents.send(channel, payload)
  }
}

function setStatus(next: AsrStatus) {
  status = next
  broadcast("asr-status", getAsrStatus())
}

function modelDir() {
  return join(app.getPath("userData"), MODEL_DIR)
}

// ── utilityProcess ────────────────────────────────────────────────────────
// El reconocimiento se hace fuera del proceso principal (ver asr-worker.ts).

interface WorkerMessage {
  id?: string
  type: string
  payload?: {
    text?: string
    code?: AsrResult["code"]
    seconds?: number
  }
  error?: string
}

let asrWorker: UtilityProcess | undefined
const pendingWorkerRequests = new Map<
  string,
  {
    resolve: (data: unknown) => void
    reject: (err: Error) => void
  }
>()
let requestIdCounter = 0

function getAsrWorker(): UtilityProcess {
  if (asrWorker && !asrWorker.pid) {
    asrWorker = undefined
  }
  if (!asrWorker) {
    const workerScript = join(dirname(fileURLToPath(import.meta.url)), "asr-worker.js")
    const worker = utilityProcess.fork(workerScript, [], {
      serviceName: "tiancode-asr-worker",
      stdio: "pipe",
    })

    worker.on("message", (rawEvent: unknown) => {
      const event = rawEvent as WorkerMessage | undefined
      if (!event) return
      // Se alcanzó el tope de grabación: el renderer debe parar solo, si no el
      // audio siguiente se descartaría en silencio.
      if (event.type === "limit") {
        notify({ reason: "limit", seconds: event.payload?.seconds })
        return
      }
      if (event.id) {
        const pending = pendingWorkerRequests.get(event.id)
        if (pending) {
          pendingWorkerRequests.delete(event.id)
          if (event.type === "error" || event.error) {
            pending.reject(new Error(event.error || "ASR worker error"))
          } else {
            pending.resolve(event.payload ?? event)
          }
        }
      }
    })

    // Sin esto, una caída del worker dejaría el stop() del renderer colgado
    // para siempre: el botón se quedaría en "escuchando" con el indicador de
    // micrófono del sistema encendido.
    worker.on("exit", (code) => {
      writeLog("asr", "asr worker exited", { code }, "warn")
      asrWorker = undefined
      for (const pending of pendingWorkerRequests.values()) {
        pending.reject(new Error(`ASR worker process terminated unexpectedly (code ${code})`))
      }
      pendingWorkerRequests.clear()
      if (recording) {
        recording = false
        notify({ reason: "crashed" })
      }
    })

    const dir = modelDir()
    worker.postMessage({
      type: "init",
      payload: {
        encoder: join(dir, ASR_MODEL.encoder),
        decoder: join(dir, ASR_MODEL.decoder),
        tokens: join(dir, ASR_MODEL.tokens),
      },
    })

    asrWorker = worker
  }
  return asrWorker
}

function notify(notice: AsrNotice) {
  broadcast("asr-notice", notice)
}

function sendWorkerRequest<T>(type: string, payload?: Record<string, unknown>): Promise<T> {
  const worker = getAsrWorker()
  const id = `asr_${++requestIdCounter}_${Date.now()}`
  return new Promise<T>((resolve, reject) => {
    pendingWorkerRequests.set(id, {
      resolve: (data: unknown) => resolve(data as T),
      reject,
    })
    worker.postMessage({ id, type, payload })
  })
}

// ── Modelo ────────────────────────────────────────────────────────────────

export function ensureAsrModel(language: AsrLanguage): Promise<void> {
  if (status === "ready" || checkModelReady()) {
    status = "ready"
    return warmRecognizer(language)
  }
  if (modelPromise) return modelPromise
  modelPromise = (async () => {
    setStatus("downloading")
    progress = 0
    failure = undefined
    const dir = modelDir()
    await mkdir(dir, { recursive: true })
    const pending = ASR_MODEL_FILES.filter((file) => !existsSync(join(dir, file.name)))
    const totalBytes = pending.reduce((sum, file) => sum + file.bytes, 0)
    let doneBytes = 0
    for (const file of pending) {
      await downloadFile(`${HF_BASE}/${ASR_MODEL.repo}/resolve/main/${file.name}`, join(dir, file.name), (loaded) => {
        // Progreso global sobre los tres archivos: por archivo la barra
        // volvía a cero tres veces durante los 146 MB.
        const percent = totalBytes > 0 ? Math.round(((doneBytes + loaded) / totalBytes) * 100) : 0
        progress = Math.max(0, Math.min(100, percent))
        broadcast("asr-progress", { progress, file: file.name })
      })
      doneBytes += file.bytes
    }
    progress = 100
    setStatus("ready")
    writeLog("asr", "model ready", { sizeMb: ASR_MODEL.sizeMb })
    await warmRecognizer(language)
  })().catch((error) => {
    failure = error instanceof Error ? error.message : String(error)
    modelPromise = undefined
    setStatus("error")
    writeLog("asr", "failed to load model", { error: failure }, "error")
    throw error
  })
  return modelPromise
}

// Cargar los pesos ONNX también bloquea, así que el primer clic (el que ya
// espera por la descarga) deja el reconocedor listo. Si falla, el fallo real
// aparece en el stop con su código; no se convierte en un error de descarga.
async function warmRecognizer(language: AsrLanguage): Promise<void> {
  try {
    await sendWorkerRequest("ensure", { language })
  } catch (error) {
    writeLog("asr", "recognizer warm-up failed", { error: String(error) }, "warn")
  }
}

// Downloads the model files with retries: the first use pulls 146MB from
// HuggingFace and flaky connections should not leave the mic permanently
// broken (previously a single failed fetch surfaced as a bare "network" error
// in the toast).
async function downloadFile(url: string, dest: string, onProgress: (loaded: number) => void) {
  let lastError: unknown
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      return await downloadFileOnce(url, dest, onProgress)
    } catch (error) {
      lastError = error
      if (attempt < 3) {
        writeLog("asr", "model download failed, retrying", { url, attempt, error: String(error) })
        await new Promise((resolve) => setTimeout(resolve, attempt * 1500))
      }
    }
  }
  throw lastError
}

async function downloadFileOnce(url: string, dest: string, onProgress: (loaded: number) => void) {
  let res: Response
  try {
    res = await fetch(url, { redirect: "follow" })
  } catch (error) {
    throw new Error(`network error: ${error instanceof Error ? error.message : String(error)}`)
  }
  if (!res.ok || !res.body) throw new Error(`HTTP ${res.status} for ${url.split("/").pop()}`)
  const part = `${dest}.part`
  await mkdir(join(dest, ".."), { recursive: true })
  const handle = await open(part, "w")
  let loaded = 0
  try {
    for await (const chunk of res.body as AsyncIterable<Uint8Array>) {
      await handle.write(chunk)
      loaded += chunk.length
      onProgress(loaded)
    }
    await handle.sync()
  } finally {
    await handle.close()
  }
  await verifyDownload(url, part)
  await rename(part, dest)
}

// Verifica la descarga contra el puntero LFS de HuggingFace: la URL raw
// devuelve un puntero de texto con el oid sha256 canónico para archivos LFS.
// Sin puntero (archivos pequeños versionados en git, p. ej. tiny-tokens.txt)
// no hay digest publicado y la descarga se acepta tal cual. Ante un fallo se
// elimina el temporal y se lanza el error para que downloadFile reintente.
async function verifyDownload(url: string, part: string) {
  const fileName = url.split("/").pop()
  try {
    const res = await fetch(url.replace("/resolve/", "/raw/"), { redirect: "follow" })
    if (!res.ok) return
    const oid = (await res.text()).match(/oid sha256:([0-9a-fA-F]{64})/)?.[1]
    if (!oid) return
    const hash = createHash("sha256")
    for await (const chunk of createReadStream(part)) hash.update(chunk)
    if (hash.digest("hex") !== oid.toLowerCase()) {
      await rm(part, { force: true })
      throw new Error(`la suma sha256 de ${fileName} no coincide con el puntero LFS`)
    }
  } catch (error) {
    if (error instanceof Error && error.message.includes("no coincide")) throw error
    // Si la verificación LFS falla por red pero el archivo existe y es válido, lo dejamos continuar
  }
}

// ── Grabación ─────────────────────────────────────────────────────────────

export async function asrStart(language: AsrLanguage): Promise<void> {
  if (recording) return
  await sendWorkerRequest("start", { language })
  recording = true
}

export function asrChunk(samples: Float32Array) {
  if (!recording) return
  getAsrWorker().postMessage({ type: "chunk", payload: { samples } })
}

export async function asrStop(): Promise<AsrResult> {
  if (!recording) return { code: "not-recording" }
  recording = false
  try {
    return await sendWorkerRequest<AsrResult>("stop")
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    writeLog("asr", "recognition failed", { error: message }, "error")
    // El mensaje del motor no es traducible: el renderer recibe un código
    // estable y decide qué texto enseñar.
    return { code: "engine-failed" }
  }
}
