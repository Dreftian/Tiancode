import { app } from "electron"
import { existsSync } from "node:fs"
import { mkdir, open, rename } from "node:fs/promises"
import { join } from "node:path"
import { write as writeLog } from "./logging"

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

export function getAsrStatus() {
  return {
    ready: status === "ready",
    downloading: status === "downloading" || undefined,
    progress,
    ...(failure ? { error: failure } : {}),
  }
}

function setStatus(next: AsrStatus) {
  status = next
  for (const win of app.getAllWindows()) {
    if (win.isDestroyed() || win.webContents.isDestroyed()) continue
    win.webContents.send("asr-status", getAsrStatus())
  }
}

function modelDir() {
  return join(app.getPath("userData"), MODEL_DIR)
}

export function ensureAsrModel(): Promise<void> {
  if (status === "ready") return Promise.resolve()
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

async function downloadFile(url: string, dest: string) {
  const res = await fetch(url, { redirect: "follow" })
  if (!res.ok || !res.body) throw new Error(`GET ${url} failed: HTTP ${res.status}`)
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
        for (const win of app.getAllWindows()) {
          if (win.isDestroyed() || win.webContents.isDestroyed()) continue
          win.webContents.send("asr-progress", payload)
        }
      }
    }
    await handle.sync()
  } finally {
    await handle.close()
  }
  await rename(part, dest)
}

async function getRecognizer(language: "es" | "en"): Promise<OfflineRecognizerLike> {
  await ensureAsrModel()
  if (recognizer && recognizerLanguage === language) return recognizer
  recognizer?.free()
  recognizer = undefined
  const { createOfflineRecognizer } = await import("sherpa-onnx")
  recognizer = createOfflineRecognizer({
    tokens: join(modelDir(), ASR_MODEL.tokens),
    encoder: join(modelDir(), ASR_MODEL.encoder),
    decoder: join(modelDir(), ASR_MODEL.decoder),
    numThreads: 2,
    sampleRate: 16000,
    featureDim: 80,
    language,
  }) as OfflineRecognizerLike
  recognizerLanguage = language
  return recognizer
}

export function asrStart(language: "es" | "en") {
  if (recording) return
  recording = true
  activeLanguage = language
  chunks = []
}

export function asrChunk(samples: Float32Array) {
  if (!recording) return
  chunks.push(new Float32Array(samples))
}

export async function asrStop(): Promise<{ text?: string; error?: string }> {
  if (!recording) return { error: "Not recording." }
  recording = false
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0)
  const samples = new Float32Array(total)
  let offset = 0
  for (const chunk of chunks) {
    samples.set(chunk, offset)
    offset += chunk.length
  }
  chunks = []
  // Ignora clips de menos de ~0.5s (16 kHz): no hay voz detectable.
  if (total < 8000) return { error: "No speech detected." }
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
