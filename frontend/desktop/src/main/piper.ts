import { app, BrowserWindow } from "electron"
import { createHash } from "node:crypto"
import { createReadStream, existsSync } from "node:fs"
import { mkdir, open, rename, rm } from "node:fs/promises"
import { join } from "node:path"
import type { VoicesPiperProgress } from "../preload/types"
import { write as writeLog } from "./logging"

// Piper voices are synthesized locally with sherpa-onnx (WASM build, no native
// addon to rebuild) driving VITS models converted from the rhasspy piper-voices
// project. Each csukuangfj repo bundles the full espeak-ng phonemizer data, so
// the 18MB espeak-ng-data tree is shared across voices and downloaded once.

export type PiperVoiceDef = {
  id: string
  name: string
  language: string
  repo: string
  modelFile: string
  sampleRate: number
  // Speaker index inside multi-speaker models (sharvard ships M=0/F=1).
  sid?: number
  sizeMb: number
  license: string
}

export const PIPER_VOICES: PiperVoiceDef[] = [
  {
    id: "piper-es_ES-mls_9972-low",
    name: "MLS 9972 (Spanish)",
    language: "es-ES",
    repo: "csukuangfj/vits-piper-es_ES-mls_9972-low",
    modelFile: "es_ES-mls_9972-low.onnx",
    sampleRate: 16000,
    sizeMb: 63,
    license: "CC BY 4.0",
  },
  {
    id: "piper-es_ES-mls_10246-low",
    name: "MLS 10246 (Spanish)",
    language: "es-ES",
    repo: "csukuangfj/vits-piper-es_ES-mls_10246-low",
    modelFile: "es_ES-mls_10246-low.onnx",
    sampleRate: 16000,
    sizeMb: 63,
    license: "CC BY 4.0",
  },
  {
    id: "piper-es_ES-sharvard-medium",
    name: "Sharvard (Spanish)",
    language: "es-ES",
    repo: "csukuangfj/vits-piper-es_ES-sharvard-medium",
    modelFile: "es_ES-sharvard-medium.onnx",
    sampleRate: 22050,
    sid: 1,
    sizeMb: 77,
    license: "CC BY 3.0",
  },
  {
    id: "piper-es_AR-daniela-high",
    name: "Daniela (Spanish, Argentina)",
    language: "es-AR",
    repo: "csukuangfj/vits-piper-es_AR-daniela-high",
    modelFile: "es_AR-daniela-high.onnx",
    sampleRate: 22050,
    sizeMb: 114,
    license: "CC BY-SA 4.0",
  },
]

const HF_BASE = "https://huggingface.co"
const HF_API = "https://huggingface.co/api/models"
const SHARED_DATA_DIR = "espeak-ng-data"
const COMPLETE_MARKER = ".complete"

function resolvePiperVoice(id: string) {
  return PIPER_VOICES.find((voice) => voice.id === id)
}

function voiceDir(voiceId: string) {
  return join(app.getPath("userData"), "piper-voices", voiceId)
}

function sharedDataDir() {
  return join(app.getPath("userData"), "piper-voices", SHARED_DATA_DIR)
}

export function isPiperDownloaded(voiceId: string) {
  const def = resolvePiperVoice(voiceId)
  if (!def) return false
  const dir = voiceDir(voiceId)
  return existsSync(join(dir, def.modelFile)) && existsSync(join(dir, "tokens.txt"))
}

// One in-flight promise per voice so concurrent calls (Test + manual download)
// share a single download instead of racing.
const inFlight = new Map<string, Promise<void>>()

export function downloadPiperVoice(voiceId: string) {
  const existing = inFlight.get(voiceId)
  if (existing) return existing
  const promise = downloadPiperVoiceInner(voiceId).finally(() => inFlight.delete(voiceId))
  inFlight.set(voiceId, promise)
  return promise
}

async function downloadPiperVoiceInner(voiceId: string) {
  const def = resolvePiperVoice(voiceId)
  if (!def) throw new Error(`Unknown piper voice "${voiceId}"`)
  await ensureSharedData()
  const dir = voiceDir(voiceId)
  await mkdir(dir, { recursive: true })
  await downloadFile(`${HF_BASE}/${def.repo}/resolve/main/${def.modelFile}`, join(dir, def.modelFile), voiceId)
  await downloadFile(`${HF_BASE}/${def.repo}/resolve/main/tokens.txt`, join(dir, "tokens.txt"), voiceId)
  writeLog("voices", "downloaded piper voice", { voiceId, sizeMb: def.sizeMb })
  // The voice is only complete once both files exist; a done event before that
  // would make the UI refetch and show the voice as not downloaded.
  reportProgress(voiceId, 100, undefined, true)
}

// The espeak-ng phonemizer data is shared by every piper voice. The tree API
// lists the full recursive file set in one call; a ".complete" marker turns
// the directory into a downloaded-once cache that survives partial failures.
async function ensureSharedData() {
  const dataDir = sharedDataDir()
  if (existsSync(join(dataDir, COMPLETE_MARKER))) return
  await mkdir(dataDir, { recursive: true })
  const res = await fetch(`${HF_API}/${PIPER_VOICES[0].repo}/tree/main/${SHARED_DATA_DIR}?recursive=true`)
  if (!res.ok) throw new Error(`Failed to list ${SHARED_DATA_DIR}: HTTP ${res.status}`)
  const entries = (await res.json()) as { path: string; type: string; size?: number }[]
  for (const entry of entries) {
    if (entry.type !== "file") continue
    const dest = join(dataDir, entry.path.slice(SHARED_DATA_DIR.length + 1))
    if (existsSync(dest)) continue
    await downloadFile(`${HF_BASE}/${PIPER_VOICES[0].repo}/resolve/main/${entry.path}`, dest, undefined)
  }
  await writeFile(join(dataDir, COMPLETE_MARKER), "")
}

async function downloadFile(url: string, dest: string, voiceId: string | undefined) {
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
      if (voiceId) reportProgress(voiceId, total > 0 ? Math.round((loaded / total) * 100) : 0, url.split("/").pop())
    }
    await handle.sync()
  } finally {
    await handle.close()
  }
  await verifyDownload(url, part)
  await rename(part, dest)
  if (voiceId) reportProgress(voiceId, 100, url.split("/").pop())
}

// Verifica la descarga contra el puntero LFS de HuggingFace: la URL raw
// devuelve un puntero de texto con el oid sha256 canónico para archivos LFS.
// Sin puntero (archivos pequeños versionados en git, p. ej. tokens.txt o los
// diccionarios de espeak-ng-data) no hay digest publicado y la descarga se
// acepta tal cual. Ante un fallo se elimina el temporal y se lanza el error.
async function verifyDownload(url: string, part: string) {
  const fileName = url.split("/").pop()
  const res = await fetch(url.replace("/resolve/", "/raw/"), { redirect: "follow" })
  if (!res.ok) {
    await rm(part, { force: true })
    throw new Error(`no se pudo obtener el puntero LFS de ${fileName}: HTTP ${res.status}`)
  }
  const oid = (await res.text()).match(/oid sha256:([0-9a-fA-F]{64})/)?.[1]
  if (!oid) return
  const hash = createHash("sha256")
  for await (const chunk of createReadStream(part)) hash.update(chunk)
  if (hash.digest("hex") !== oid.toLowerCase()) {
    await rm(part, { force: true })
    throw new Error(`la suma sha256 de ${fileName} no coincide con el puntero LFS`)
  }
}

async function writeFile(path: string, content: string) {
  const handle = await open(path, "w")
  await handle.writeFile(content)
  await handle.close()
}

export async function deletePiperVoice(voiceId: string) {
  const def = resolvePiperVoice(voiceId)
  if (!def) return
  evictTts(voiceId)
  await rm(voiceDir(voiceId), { recursive: true, force: true })
  writeLog("voices", "deleted piper voice", { voiceId })
}

export type PiperAudio = { samples: Float32Array; sampleRate: number }

// Keeps the most recently used TTS instances alive (VITS models load fast);
// older instances are freed so a handful of 60-100MB voices cannot pile up.
const MAX_TTS_CACHE = 2
const ttsCache = new Map<string, OfflineTtsLike>()

export async function synthesizePiper(text: string, voiceId: string): Promise<PiperAudio> {
  const def = resolvePiperVoice(voiceId)
  if (!def) throw new Error(`Unknown piper voice "${voiceId}"`)
  if (!isPiperDownloaded(voiceId)) await downloadPiperVoice(voiceId)
  const tts = await getTts(def)
  const result = tts.generate({ text, sid: def.sid ?? 0, speed: 1 })
  return { samples: result.samples, sampleRate: result.sampleRate }
}

async function getTts(def: PiperVoiceDef): Promise<OfflineTtsLike> {
  const cached = ttsCache.get(def.id)
  if (cached) return cached
  const { createOfflineTts } = await import("sherpa-onnx")
  const tts = createOfflineTts({
    offlineTtsModelConfig: {
      offlineTtsVitsModelConfig: {
        model: join(voiceDir(def.id), def.modelFile),
        tokens: join(voiceDir(def.id), "tokens.txt"),
        dataDir: sharedDataDir(),
        lexicon: "",
      },
      numThreads: 2,
      debug: 0,
      provider: "cpu",
    },
    ruleFsts: "",
    ruleFars: "",
    maxNumSentences: 1,
  }) as OfflineTtsLike
  while (ttsCache.size >= MAX_TTS_CACHE) {
    const [oldest] = ttsCache.keys()
    ttsCache.get(oldest)?.free()
    ttsCache.delete(oldest)
  }
  ttsCache.set(def.id, tts)
  return tts
}

function evictTts(voiceId: string) {
  ttsCache.get(voiceId)?.free()
  ttsCache.delete(voiceId)
}

function reportProgress(voiceId: string, progress: number, file?: string, done?: boolean) {
  const payload: VoicesPiperProgress = { voiceId, progress, file, done }
  for (const win of BrowserWindow.getAllWindows()) {
    if (win.isDestroyed() || win.webContents.isDestroyed()) continue
    win.webContents.send("voices-piper-progress", payload)
  }
}

type OfflineTtsLike = {
  sampleRate: number
  generate(config: { text: string; sid?: number; speed?: number }): { samples: Float32Array; sampleRate: number }
  free(): void
}
