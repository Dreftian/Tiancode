import { app, BrowserWindow } from "electron"
import { join } from "node:path"
import type { KokoroTTS } from "kokoro-js"
import type { ProgressInfo } from "@huggingface/transformers"
import type { VoiceInfo, VoicesSpeakOptions, VoicesSpeakResult } from "../preload/types"
import { write as writeLog } from "./logging"
import { getStore } from "./store"
import { ENABLED_VOICES_KEY, SELECTED_VOICE_KEY } from "./store-keys"
import { float32ToWav } from "./wav"
import { PIPER_VOICES, deletePiperVoice, downloadPiperVoice, isPiperDownloaded, synthesizePiper } from "./piper"
import { deleteKokoroEs, downloadKokoroEs, isKokoroEsDownloaded, isKokoroEsReadyForSynthesis, synthesizeKokoroEs } from "./kokoro-es"


export const DEFAULT_VOICE = "af_heart"
// Voz femenina de español por defecto: kokoro ef_dora (el mismo style vector
// de la voz "Sol" de Codex/ChatGPT), sintetizada con el motor kokoro de
// sherpa-onnx + espeak-ng (ver kokoro-es.ts). Es la que usa el anuncio
// automático en español (resolveSpanishVoice en frontend/app).
const DEFAULT_ES_FEMALE_VOICE = "ef_dora"
const KOKORO_MODEL_ID = "onnx-community/Kokoro-82M-v1.0-ONNX"
// kokoro-js bundles US/UK English female voices, and kokoro-es / piper
// provide high-quality neural Spanish female voices (ef_dora / Elena / Sofía / Lucía).
const SUPPORTED_VOICE_IDS = [
  "af_heart", "af_alloy", "af_nova", "af_bella", "af_sarah", "af_sky",
  "bf_isabella", "bf_emma", "bf_alice", "bf_lily",
] as const
type SupportedVoiceId = (typeof SUPPORTED_VOICE_IDS)[number]

// Only curated female voices for English and Spanish
const PREFIX_META: Record<string, { language: string; gender: "female" }> = {
  af: { language: "en-US", gender: "female" },
  bf: { language: "en-GB", gender: "female" },
  ef: { language: "es", gender: "female" },
}

// Curated high quality female voices list
const VOICE_IDS = [
  ...SUPPORTED_VOICE_IDS,
  "ef_dora",
] as const

const KOKORO_CATALOG: VoiceInfo[] = VOICE_IDS.map((id) => {
  const prefix = id.slice(0, 2)
  const meta = PREFIX_META[prefix] ?? { language: "en-US", gender: "female" as const }
  const isKokoroEs = id === "ef_dora"
  return {
    id,
    name: voiceName(id),
    language: meta.language,
    gender: "female",
    supported: isKokoroEs || (SUPPORTED_VOICE_IDS as readonly string[]).includes(id),
    engine: isKokoroEs ? "kokoro-es" : "kokoro",
    default: isKokoroEs,
    license: "Apache 2.0",
  }
})

// Piper (sherpa-onnx) voices are downloaded on demand (Spanish female voices).
const PIPER_CATALOG: VoiceInfo[] = PIPER_VOICES.map((voice) => ({
  id: voice.id,
  name: voice.name,
  language: voice.language,
  gender: "female",
  supported: true,
  engine: "piper",
  default: voice.id === DEFAULT_ES_FEMALE_VOICE,
  license: voice.license,
  sizeMb: voice.sizeMb,
}))

const VOICE_CATALOG: VoiceInfo[] = [...KOKORO_CATALOG, ...PIPER_CATALOG]

type VoiceState = "idle" | "downloading" | "ready" | "error"

let state: VoiceState = "idle"
let progress: number | undefined
let failure: string | undefined
let ttsPromise: Promise<KokoroTTS> | undefined
let synthesisBusy = false

const MAX_SPEECH_CHARS = 2_000
const MAX_AUDIO_SAMPLES = 2_000_000

export function getVoicesStatus() {
  return {
    ready: state === "ready",
    downloading: state === "downloading" || undefined,
    progress,
    voices: VOICE_CATALOG.map((voice) => ({
      ...voice,
      downloaded:
        voice.engine === "piper" ? isPiperDownloaded(voice.id) : voice.engine === "kokoro-es" ? isKokoroEsDownloaded() : true,
      enabled: isVoiceEnabled(voice.id),
    })),
    selected: getSelectedVoice(),
    ...(failure ? { error: failure } : {}),
  }
}

export async function downloadVoices() {
  await ensureReady()
}

export function listVoices() {
  return getVoicesStatus().voices
}

export async function speakVoice(text: string, voiceId?: string, options?: VoicesSpeakOptions): Promise<VoicesSpeakResult> {
  const normalized = typeof text === "string" ? text.replace(/\s+/g, " ").trim() : ""
  if (!normalized) return { error: "Text must be a non-empty string." }
  if (normalized.length > MAX_SPEECH_CHARS) return { error: "Text is too long to synthesize safely." }
  const voice = resolveVoice(voiceId ?? getSelectedVoice())
  if (!voice) return { error: `Unknown voice "${voiceId}".` }
  if (!isVoiceEnabled(voice.id)) return { error: `Voice "${voice.id}" is disabled.` }
  if (options?.automatic && !isVoiceReadyForAutomaticSpeech(voice)) {
    return { error: "The selected local voice is not ready for automatic speech." }
  }
  if (synthesisBusy) return { error: "Speech synthesis is already in progress." }

  synthesisBusy = true
  try {
    const timeoutPromise = new Promise<VoicesSpeakResult>((_, reject) => {
      const timer = setTimeout(() => reject(new Error("Voice synthesis timed out")), 15000)
      if (typeof timer === "object" && "unref" in timer) timer.unref()
    })
    return await Promise.race([synthesizeVoice(normalized, voice), timeoutPromise])
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    writeLog("voices", "synthesis exception caught", { error: message, voiceId }, "error")
    return { error: message }
  } finally {
    synthesisBusy = false
  }
}

async function synthesizeVoice(text: string, voice: VoiceInfo): Promise<VoicesSpeakResult> {
  if (voice.engine === "piper") {
    try {
      const audio = await synthesizePiper(text, voice.id)
      return wavResult(audio.samples, audio.sampleRate)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      writeLog("voices", "piper synthesis failed", { error: message, voice: voice.id }, "error")
      return { error: message }
    }
  }
  if (voice.engine === "kokoro-es") {
    try {
      const audio = await synthesizeKokoroEs(text)
      return wavResult(audio.samples, audio.sampleRate)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      writeLog("voices", "kokoro es synthesis failed", { error: message, voice: voice.id }, "error")
      return { error: message }
    }
  }
  if (!voice.supported) {
    return {
      error:
        `Voice "${voice.id}" (${voice.language}) is not supported yet: ` +
        "kokoro-js 1.2.1 can only synthesize English voices (af, am, bf, bm).",
    }
  }
  try {
    const tts = await ensureReady()
    // speed > 1 acelera el habla; 1.0 por defecto se percibe lento.
    const audio = await tts.generate(text, { voice: voice.id as SupportedVoiceId, speed: 1.15 })
    return wavResult(audio.audio, audio.sampling_rate)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    writeLog("voices", "synthesis failed", { error: message }, "error")
    return { error: message }
  }
}

function isVoiceReadyForAutomaticSpeech(voice: VoiceInfo) {
  if (voice.engine === "piper") return isPiperDownloaded(voice.id)
  if (voice.engine === "kokoro-es") return isKokoroEsReadyForSynthesis()
  return state === "ready"
}

function wavResult(samples: Float32Array, sampleRate: number): VoicesSpeakResult {
  if (samples.length > MAX_AUDIO_SAMPLES) return { error: "Generated audio is too large to play safely." }
  return { wav: new Uint8Array(float32ToWav(samples, sampleRate)) }
}

export function selectVoice(voiceId: string) {
  const voice = resolveVoice(voiceId)
  if (!voice) return false
  if (!isVoiceEnabled(voice.id)) setVoiceEnabled(voice.id, true)
  getStore().set(SELECTED_VOICE_KEY, voice.id)
  if (voice.engine === "piper" && !isPiperDownloaded(voice.id)) {
    void downloadPiperVoice(voice.id)
  } else if (voice.engine === "kokoro-es" && !isKokoroEsDownloaded()) {
    void downloadKokoroEs(voice.id)
  }
  return true
}

export function downloadVoice(voiceId: string) {
  const voice = resolveVoice(voiceId)
  if (!voice || (voice.engine !== "piper" && voice.engine !== "kokoro-es")) {
    throw new Error(`Voice "${voiceId}" is not a downloadable voice.`)
  }
  return voice.engine === "kokoro-es" ? downloadKokoroEs(voice.id) : downloadPiperVoice(voice.id)
}

export async function deleteVoice(voiceId: string) {
  const voice = resolveVoice(voiceId)
  if (!voice || (voice.engine !== "piper" && voice.engine !== "kokoro-es")) {
    throw new Error(`Voice "${voiceId}" is not a piper voice.`)
  }
  if (voice.engine === "kokoro-es") await deleteKokoroEs()
  else await deletePiperVoice(voice.id)
  // A deleted voice can no longer be selected; fall back to the first
  // selectable voice so getSelectedVoice() never returns a broken id.
  if (getStore().get(SELECTED_VOICE_KEY) === voice.id) {
    const fallback = firstSelectableVoice()
    getStore().set(SELECTED_VOICE_KEY, fallback ? fallback.id : VOICE_CATALOG[0].id)
  }
}

export function setVoiceEnabled(voiceId: string, enabled: boolean) {
  const voice = resolveVoice(voiceId)
  if (!voice) return
  const store = getStore()
  // The key holds the ids of enabled voices; an absent key means "all
  // enabled", so the first toggle materializes the full catalog.
  const stored = store.get(ENABLED_VOICES_KEY)
  const current = stored === undefined ? VOICE_CATALOG.map((entry) => entry.id) : readEnabledVoices(stored)
  const next = enabled ? [...current, voice.id] : current.filter((id) => id !== voice.id)
  store.set(ENABLED_VOICES_KEY, next)
  if (!enabled && getStore().get(SELECTED_VOICE_KEY) === voice.id) {
    const fallback = firstSelectableVoice()
    getStore().set(SELECTED_VOICE_KEY, fallback ? fallback.id : VOICE_CATALOG[0].id)
  }
}

async function ensureReady() {
  if (!ttsPromise) {
    state = "downloading"
    progress = 0
    failure = undefined
    ttsPromise = loadTTS().then(
      (tts) => {
        state = "ready"
        progress = 100
        reportProgress({ progress: 100 })
        return tts
      },
      (error) => {
        state = "error"
        failure = error instanceof Error ? error.message : String(error)
        ttsPromise = undefined
        writeLog("voices", "failed to load kokoro tts", { error: failure }, "error")
        throw error
      },
    )
  }
  return ttsPromise
}

async function loadTTS() {
  const { env } = await import("@huggingface/transformers")
  // transformers.js defaults its cache next to the package dir; move it under
  // userData so downloads survive across app launches in the packaged app.
  env.cacheDir = join(app.getPath("userData"), "huggingface-cache")
  const { KokoroTTS } = await import("kokoro-js")
  return KokoroTTS.from_pretrained(KOKORO_MODEL_ID, {
    dtype: "fp32",
    device: "cpu",
    progress_callback: onProgress,
  })
}

// transformers.js 3.x reports per-file download progress only (no overall
// percentage), so progress reflects the current file while it downloads. The
// module-level `progress` is updated too so voices-status stays live, not only
// the streamed event.
function onProgress(info: ProgressInfo) {
  if (info.status !== "progress" || info.total <= 0) return
  progress = Math.round((info.loaded / info.total) * 100)
  reportProgress({ progress, file: info.file })
}

function reportProgress(payload: { progress: number; file?: string }) {
  for (const win of BrowserWindow.getAllWindows()) {
    if (win.isDestroyed() || win.webContents.isDestroyed()) continue
    win.webContents.send("voices-progress", payload)
  }
}

function getSelectedVoice() {
  const stored = getStore().get(SELECTED_VOICE_KEY)
  if (typeof stored === "string") {
    const voice = resolveVoice(stored)
    if (voice && isSelectable(voice)) return stored
  }
  const fallback = firstSelectableVoice()
  if (fallback) {
    if (fallback.id !== stored) getStore().set(SELECTED_VOICE_KEY, fallback.id)
    return fallback.id
  }
  return "ef_dora"
}

function isSelectable(voice: VoiceInfo | undefined) {
  if (!voice) return false
  if (!voice.supported || !isVoiceEnabled(voice.id)) return false
  if (voice.engine === "kokoro-es") return isKokoroEsDownloaded()
  return voice.engine === "kokoro" || isPiperDownloaded(voice.id)
}

function firstSelectableVoice() {
  const femaleEs = VOICE_CATALOG.find((v) => v.id === "ef_dora" && isSelectable(v))
  if (femaleEs) return femaleEs
  const femaleEn = VOICE_CATALOG.find((v) => v.id === "af_heart" && isSelectable(v))
  if (femaleEn) return femaleEn
  const anyFemale = VOICE_CATALOG.find((v) => v.gender === "female" && isSelectable(v))
  if (anyFemale) return anyFemale
  return VOICE_CATALOG.find(isSelectable)
}

function readEnabledVoices(value: unknown) {
  return Array.isArray(value) ? value.filter((id): id is string => typeof id === "string") : []
}

function isVoiceEnabled(voiceId: string) {
  const stored = getStore().get(ENABLED_VOICES_KEY)
  if (stored === undefined) return true
  return readEnabledVoices(stored).includes(voiceId)
}

function resolveVoice(id: string) {
  return VOICE_CATALOG.find((voice) => voice.id === id)
}

function voiceName(id: string) {
  const name = id.slice(id.indexOf("_") + 1)
  return name.charAt(0).toUpperCase() + name.slice(1)
}

export async function speakFishVoice(
  text: string,
  voiceId?: string,
  apiKey?: string,
  speed?: number,
): Promise<{ mp3?: Uint8Array; error?: string }> {
  const normalized = typeof text === "string" ? text.replace(/\s+/g, " ").trim() : ""
  if (!normalized) return { error: "Text must be a non-empty string." }
  const key = apiKey?.trim() || "sk-fish-JctE9rsGvKF4LthXgq0dZRxno7Wqm5ftrSAA3cfO8Uk"
  try {
    const response = await fetch("https://api.fish.audio/v1/tts", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        model: "s2.1-pro-free",
      },
      body: JSON.stringify({
        text: normalized,
        reference_id: voiceId || undefined,
        format: "mp3",
        latency: "normal",
        prosody: {
          speed: speed ?? 1.0,
          volume: 0,
        },
      }),
    })

    if (!response.ok) {
      const errText = await response.text().catch(() => "")
      return { error: `Fish Audio HTTP ${response.status}: ${errText || response.statusText}` }
    }

    const arrayBuffer = await response.arrayBuffer()
    if (!arrayBuffer || arrayBuffer.byteLength === 0) {
      return { error: "Fish Audio devolvió un buffer de audio vacío." }
    }

    return { mp3: new Uint8Array(arrayBuffer) }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return { error: `Error de red al conectar con Fish Audio: ${message}` }
  }
}
