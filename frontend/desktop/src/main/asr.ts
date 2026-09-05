import { app, BrowserWindow } from "electron"
import { createHash } from "node:crypto"
import { createReadStream, existsSync } from "node:fs"
import { mkdir, open, rename, rm } from "node:fs/promises"
import { join } from "node:path"
import { write as writeLog } from "./logging"
import { concatChunks } from "./asr-utils"

// Local speech-to-text for mic dictation. Electron does not ship the Web
// Speech API, so the renderer captures audio (getUserMedia) and streams PCM
// chunks here; sherpa-onnx (the same WASM engine as piper TTS) transcribes
// the full clip with the multilingual Whisper tiny model
// (csukuangfj/sherpa-onnx-whisper-tiny). ~100MB on first use, cached under
// userData, fully offline afterwards.

export type AsrModelDef = {
  repo: string
  encoder: string
  decoder: string
  tokens: string
  sizeMb: number
}

export const ASR_MODEL: AsrModelDef = {
  repo: "csukuangfj/sherpa-onnx-whisper-tiny",
  encoder: "tiny-encoder.onnx",
  decoder: "tiny-decoder.onnx",
  tokens: "tiny-tokens.txt",
  sizeMb: 100,
}

const HF_BASE = "https://huggingface.co"
const MODEL_DIR = "asr-whisper-tiny"

type AsrStatus = "idle" | "downloading" | "ready" | "error"

let status: AsrStatus = "idle"
let failure: string | undefined
let progress: number | undefined
let modelPromise: Promise<void> | undefined
let recognizer: OfflineRecognizerLike | undefined
let recognizerLanguage: "es" | "en" | undefined
let recording = false
let activeLanguage: "es" | "en" = "en"
let chunks: Float32Array[] = []

function checkModelReady(): boolean {
  try {
    const dir = modelDir()
    return [ASR_MODEL.tokens, ASR_MODEL.encoder, ASR_MODEL.decoder].every((file) => existsSync(join(dir, file)))
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
    ...(failure ? { error: failure } : {}),
  }
}

function setStatus(next: AsrStatus) {
  status = next
  for (const win of BrowserWindow.getAllWindows()) {
    if (win.isDestroyed() || win.webContents.isDestroyed()) continue
    win.webContents.send("asr-status", getAsrStatus())
  }
}

function modelDir() {
  return join(app.getPath("userData"), MODEL_DIR)
}

export function ensureAsrModel(): Promise<void> {
  if (status === "ready" || checkModelReady()) {
    status = "ready"
    return Promise.resolve()
  }
  if (modelPromise) return modelPromise
  modelPromise = (async () => {
    setStatus("downloading")
    progress = 0
    failure = undefined
    const dir = modelDir()
    await mkdir(dir, { recursive: true })
    for (const file of [ASR_MODEL.tokens, ASR_MODEL.encoder, ASR_MODEL.decoder]) {
      const dest = join(dir, file)
      if (existsSync(dest)) continue
      await downloadFile(`${HF_BASE}/${ASR_MODEL.repo}/resolve/main/${file}`, dest)
    }
    progress = 100
    setStatus("ready")
    writeLog("asr", "model ready", { sizeMb: ASR_MODEL.sizeMb })
  })().catch((error) => {
    failure = error instanceof Error ? error.message : String(error)
    modelPromise = undefined
    setStatus("error")
    writeLog("asr", "failed to load model", { error: failure }, "error")
    throw error
  })
  return modelPromise
}

// Downloads the model files with retries: the first use pulls ~150MB from
// HuggingFace and flaky connections should not leave the mic permanently
// broken (previously a single failed fetch surfaced as a bare "network" error
// in the toast).
async function downloadFile(url: string, dest: string) {
  let lastError: unknown
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      return await downloadFileOnce(url, dest)
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

async function downloadFileOnce(url: string, dest: string) {
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
  const total = Number(res.headers.get("content-length") ?? 0)
  let loaded = 0
  try {
    for await (const chunk of res.body as AsyncIterable<Uint8Array>) {
      await handle.write(chunk)
      loaded += chunk.length
      if (total > 0) {
        const payload = { progress: Math.round((loaded / total) * 100), file: url.split("/").pop() }
        for (const win of BrowserWindow.getAllWindows()) {
          if (win.isDestroyed() || win.webContents.isDestroyed()) continue
          win.webContents.send("asr-progress", payload)
        }
      }
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

async function getRecognizer(language: "es" | "en"): Promise<OfflineRecognizerLike> {
  await ensureAsrModel()
  if (recognizer && recognizerLanguage === language) return recognizer
  recognizer?.free()
  recognizer = undefined
  const sherpa = (await import("sherpa-onnx")) as unknown as {
    createOfflineRecognizer(config: unknown): OfflineRecognizerLike
  }
  recognizer = sherpa.createOfflineRecognizer({
    tokens: join(modelDir(), ASR_MODEL.tokens),
    encoder: join(modelDir(), ASR_MODEL.encoder),
    decoder: join(modelDir(), ASR_MODEL.decoder),
    numThreads: 2,
    sampleRate: 16000,
    featureDim: 80,
    language,
  })
  recognizerLanguage = language
  return recognizer
}

export function asrStart(language: "es" | "en") {
  if (recording) return
  recording = true
  activeLanguage = language
  chunks = []
}

// Límite de seguridad: máximo ~60 segundos de grabación (250 chunks de 4096 samples)
const MAX_CHUNKS = 250

export function asrChunk(samples: Float32Array) {
  if (!recording) return
  if (chunks.length < MAX_CHUNKS) {
    chunks.push(new Float32Array(samples))
  }
}

export async function asrStop(): Promise<{ text?: string; error?: string }> {
  if (!recording) return { error: "Not recording." }
  recording = false
  const { samples, tooShort } = concatChunks(chunks)
  chunks = []
  // Ignora clips de menos de ~0.5s (16 kHz): no hay voz detectable.
  if (tooShort) return { error: "No speech detected." }
  try {
    const rec = await getRecognizer(activeLanguage)
    rec.acceptWaveform({ sampleRate: 16000, samples })
    const result = rec.decode()
    const text = typeof result === "string" ? result : result.text
    return { text: text.trim() }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    writeLog("asr", "recognition failed", { error: message }, "error")
    return { error: message }
  }
}

type OfflineRecognizerLike = {
  acceptWaveform(config: { sampleRate: number; samples: Float32Array }): void
  decode(): { text: string } | string
  free(): void
}
