import { app, BrowserWindow } from "electron"
import { join } from "node:path"
import type { KokoroTTS } from "kokoro-js"
import type { ProgressInfo } from "@huggingface/transformers"
import type { VoiceInfo, VoicesSpeakResult } from "../preload/types"
import { write as writeLog } from "./logging"
import { getStore } from "./store"
import { ENABLED_VOICES_KEY, SELECTED_VOICE_KEY } from "./store-keys"
import { float32ToWav } from "./wav"
import { PIPER_VOICES, deletePiperVoice, downloadPiperVoice, isPiperDownloaded, synthesizePiper } from "./piper"

export const DEFAULT_VOICE = "af_heart"
// Voz femenina de español por defecto: piper sharvard (hablante F, 22kHz), la
// más natural de las voces piper de español y la que usa el anuncio automático
// (ver resolveSpanishVoice en frontend/app). Kokoro no puede sintetizar
// español hoy: kokoro-js 1.2.1 solo fonemiza inglés y el soporte kokoro del
// wasm de sherpa-onnx aborta al cargar el modelo multilingüe.
const DEFAULT_ES_FEMALE_VOICE = "piper-es_ES-sharvard-medium"
const KOKORO_MODEL_ID = "onnx-community/Kokoro-82M-v1.0-ONNX"
// kokoro-js bundles an espeak-ng phonemizer with English voices only, so its
// public generate() API accepts just the US/UK English voices (af/am/bf/bm)
// and phonemizes everything as English. The other model voices (es, fr, hi,
// it, ja, pt, zh) ship style vectors in the package but cannot be
// synthesized through the JS port yet.
const SUPPORTED_VOICE_IDS = [
  "af_heart", "af_alloy", "af_aoede", "af_bella", "af_jessica", "af_kore", "af_nicole", "af_nova", "af_river",
  "af_sarah", "af_sky",
  "am_adam", "am_echo", "am_eric", "am_fenrir", "am_liam", "am_michael", "am_onyx", "am_puck", "am_santa",
  "bf_alice", "bf_emma", "bf_isabella", "bf_lily",
  "bm_daniel", "bm_fable", "bm_george", "bm_lewis",
] as const
type SupportedVoiceId = (typeof SUPPORTED_VOICE_IDS)[number]

// Language and gender per Kokoro voice prefix. "af" = American English
// female, "am" = American English male, "bf"/"bm" = British English; the
// remaining prefixes follow espeak-ng language codes (es, fr, hi, it, ja, pt,
// zh) and are listed for the catalog even though synthesis is English-only.
const PREFIX_META: Record<string, { language: string; gender: "female" | "male" }> = {
  af: { language: "en-US", gender: "female" },
  am: { language: "en-US", gender: "male" },
  bf: { language: "en-GB", gender: "female" },
  bm: { language: "en-GB", gender: "male" },
  ef: { language: "es", gender: "female" },
  em: { language: "es", gender: "male" },
  ff: { language: "fr", gender: "female" },
  hf: { language: "hi", gender: "female" },
  hm: { language: "hi", gender: "male" },
  if: { language: "it", gender: "female" },
  im: { language: "it", gender: "male" },
  jf: { language: "ja", gender: "female" },
  jm: { language: "ja", gender: "male" },
  pf: { language: "pt", gender: "female" },
  pm: { language: "pt", gender: "male" },
  zf: { language: "zh", gender: "female" },
  zm: { language: "zh", gender: "male" },
}

// All voices shipped with kokoro-js 1.2.1 (node_modules/kokoro-js/voices).
const VOICE_IDS = [
  ...SUPPORTED_VOICE_IDS,
  "ef_dora", "em_alex", "em_santa",
  "ff_siwis",
  "hf_alpha", "hf_beta", "hm_omega", "hm_psi",
  "if_sara", "im_nicola",
  "jf_alpha", "jf_gongitsune", "jf_nezumi", "jf_tebukuro", "jm_kumo",
  "pf_dora", "pm_alex", "pm_santa",
  "zf_xiaobei", "zf_xiaoni", "zf_xiaoxiao", "zf_xiaoyi",
  "zm_yunjian", "zm_yunxi", "zm_yunxia", "zm_yunyang",
] as const

const KOKORO_CATALOG: VoiceInfo[] = VOICE_IDS.map((id) => {
  const prefix = id.slice(0, 2)
  const meta = PREFIX_META[prefix]
  return {
    id,
    name: voiceName(id),
    language: meta.language,
    gender: meta.gender,
    supported: (SUPPORTED_VOICE_IDS as readonly string[]).includes(id),
    engine: "kokoro",
    license: "Apache 2.0",
  }
})

// Piper (sherpa-onnx) voices are downloaded on demand; all of them are
// Spanish so the app finally speaks the languages of the bundled model.
// sharvard es la voz femenina por defecto (la que usa el anuncio automático);
// las voces kokoro-js no pueden hablar español porque su fonemizador espeak-ng
// empaquetado solo trae inglés, y el motor kokoro de sherpa-onnx (wasm) aún no
// puede cargar el modelo multilingüe (aborta en la creación de la sesión).
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

export function getVoicesStatus() {
  return {
    ready: state === "ready",
    downloading: state === "downloading" || undefined,
    progress,
    voices: VOICE_CATALOG.map((voice) => ({
      ...voice,
      downloaded: voice.engine === "piper" ? isPiperDownloaded(voice.id) : true,
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

export async function speakVoice(text: string, voiceId?: string): Promise<VoicesSpeakResult> {
  if (typeof text !== "string" || text.trim().length === 0) return { error: "Text must be a non-empty string." }
  const voice = resolveVoice(voiceId ?? getSelectedVoice())
  if (!voice) return { error: `Unknown voice "${voiceId}".` }
  if (!isVoiceEnabled(voice.id)) return { error: `Voice "${voice.id}" is disabled.` }
  if (voice.engine === "piper") {
    try {
      // Auto-downloads the model first when the voice has not been fetched yet.
      const audio = await synthesizePiper(text, voice.id)
      return { wav: new Uint8Array(float32ToWav(audio.samples, audio.sampleRate)) }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      writeLog("voices", "piper synthesis failed", { error: message, voice: voice.id }, "error")
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
    const samples = Array.isArray(audio.audio) ? concatSamples(audio.audio) : audio.audio
    return { wav: new Uint8Array(float32ToWav(samples, audio.sampling_rate)) }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    writeLog("voices", "synthesis failed", { error: message }, "error")
    return { error: message }
  }
}

export function selectVoice(voiceId: string) {
  const voice = resolveVoice(voiceId)
  if (!voice) return false
  if (!isVoiceEnabled(voice.id)) return false
  if (voice.engine === "piper" && !isPiperDownloaded(voice.id)) return false
  getStore().set(SELECTED_VOICE_KEY, voice.id)
  return true
}

export function downloadVoice(voiceId: string) {
  const voice = resolveVoice(voiceId)
  if (!voice || voice.engine !== "piper") throw new Error(`Voice "${voiceId}" is not a downloadable piper voice.`)
  return downloadPiperVoice(voice.id)
}

export async function deleteVoice(voiceId: string) {
  const voice = resolveVoice(voiceId)
  if (!voice || voice.engine !== "piper") throw new Error(`Voice "${voiceId}" is not a piper voice.`)
  await deletePiperVoice(voice.id)
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

function concatSamples(chunks: Float32Array[]) {
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0)
  const result = new Float32Array(total)
  let offset = 0
  for (const chunk of chunks) {
    result.set(chunk, offset)
    offset += chunk.length
  }
  return result
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

// The selected voice must always be enabled and (for piper) downloaded; when
// the stored selection no longer qualifies, fall back to the first selectable
// voice so dictation and message reading never reference a dead voice. If
// every voice is disabled there is nothing selectable; the stored id is kept
// (speakVoice reports the disabled error instead of persisting a broken pick).
function getSelectedVoice() {
  const stored = getStore().get(SELECTED_VOICE_KEY)
  if (typeof stored === "string" && isSelectable(resolveVoice(stored))) return stored
  const fallback = firstSelectableVoice()
  if (fallback) {
    if (fallback.id !== stored) getStore().set(SELECTED_VOICE_KEY, fallback.id)
    return fallback.id
  }
  return typeof stored === "string" && resolveVoice(stored) ? stored : VOICE_CATALOG[0].id
}

function isSelectable(voice: VoiceInfo | undefined) {
  if (!voice) return false
  if (!voice.supported || !isVoiceEnabled(voice.id)) return false
  return voice.engine === "kokoro" || isPiperDownloaded(voice.id)
}

function firstSelectableVoice() {
  return VOICE_CATALOG.find(isSelectable)
}

function readEnabledVoices(value: unknown) {
  return Array.isArray(value) ? value.filter((id): id is string => typeof id === "string") : []
}

// Voices default to enabled; the store key only exists once the user toggles
// at least one voice, and then lists the enabled ids exactly.
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
