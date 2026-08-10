import { createSignal } from "solid-js"
import { getSpeechRecognitionCtor } from "./runtime-adapters"

// Mirrors `frontend/desktop/src/preload/types.ts` so the renderer can type
// `window.api.voices` without depending on the desktop package.
export type VoiceEngine = "kokoro" | "piper"

export type VoiceInfo = {
  id: string
  name: string
  language: string
  gender: "female" | "male"
  // Whether kokoro-js can synthesize this voice (English voices only; the
  // bundled espeak-ng phonemizer has no multilingual voices). Piper voices
  // are always supported once downloaded.
  supported: boolean
  engine: VoiceEngine
  downloaded?: boolean
  enabled?: boolean
  sizeMb?: number
  license?: string
}

export type VoicesStatus = {
  ready: boolean
  downloading?: boolean
  progress?: number
  voices: VoiceInfo[]
  selected?: string
  error?: string
}

export type VoicesProgress = {
  progress: number
  file?: string
}

export type VoicesPiperProgress = {
  voiceId: string
  progress: number
  file?: string
  done?: boolean
}

export type VoicesSpeakResult = {
  wav?: Uint8Array
  error?: string
}

export type VoicesAPI = {
  status: () => Promise<VoicesStatus>
  download: () => Promise<void>
  list: () => Promise<VoiceInfo[]>
  speak: (text: string, voiceId?: string) => Promise<VoicesSpeakResult>
  select: (voiceId: string) => Promise<boolean>
  onProgress: (cb: (event: VoicesProgress) => void) => () => void
  downloadVoice: (voiceId: string) => Promise<void>
  deleteVoice: (voiceId: string) => Promise<void>
  setEnabled: (voiceId: string, enabled: boolean) => Promise<void>
  onPiperProgress: (cb: (event: VoicesPiperProgress) => void) => () => void
}

export const voicesAPI = (): VoicesAPI | undefined => window.api?.voices

const [speakingKey, setSpeakingKey] = createSignal<string | undefined>()
let activeAudio: HTMLAudioElement | undefined
let activeURL: string | undefined
let pendingPlay: (() => void) | undefined

const clearActive = () => {
  activeAudio = undefined
  if (activeURL) {
    URL.revokeObjectURL(activeURL)
    activeURL = undefined
  }
}

// Stops whatever is currently playing, if anything, and resolves the playback
// promise so awaiting callers (the auto-speak queue) can react.
export function stopSpeaking() {
  activeAudio?.pause()
  const finish = pendingPlay
  pendingPlay = undefined
  clearActive()
  setSpeakingKey(undefined)
  finish?.()
}

const playWav = (key: string, wav: Uint8Array) =>
  new Promise<void>((resolve) => {
    // The IPC layer returns a fresh ArrayBuffer-backed copy, so the cast is safe.
    const blob = new Blob([wav as Uint8Array<ArrayBuffer>], { type: "audio/wav" })
    const url = URL.createObjectURL(blob)
    const audio = new Audio(url)
    activeURL = url
    activeAudio = audio
    const finish = () => {
      if (pendingPlay === finish) {
        pendingPlay = undefined
        clearActive()
        setSpeakingKey(undefined)
      }
      resolve()
    }
    audio.onended = finish
    audio.onerror = finish
    pendingPlay = finish
    void audio.play()
  })

// Cache de la lista de voces para la selección por idioma (la lista es pequeña).
let voicesCache: VoiceInfo[] | undefined
async function voicesList(): Promise<VoiceInfo[]> {
  if (voicesCache) return voicesCache
  const api = voicesAPI()
  if (!api?.list) return []
  voicesCache = await api.list().catch(() => [])
  return voicesCache
}

// Detección ligera de español para elegir la voz correcta: primero señales
// inequívocas (ñ, ¿, ¡) y luego una comparación de palabras frecuentes.
const SPANISH_CHARS = /[¿¡ñ]/
const ES_WORDS = new Set([
  "voy", "vamos", "crear", "hacer", "para", "que", "una", "con", "del", "los", "las",
  "este", "esta", "ahora", "luego", "después", "entonces", "también", "puedo",
  "quiero", "necesito", "primero", "pero", "porque", "más", "bien",
])
const EN_WORDS = new Set([
  "i", "will", "the", "to", "and", "of", "for", "with", "this", "that", "you",
  "your", "we", "are", "going", "create", "make", "build", "first", "then",
  "now", "can", "want", "need", "but", "because", "more", "well",
])
export function isSpanishText(text: string) {
  if (SPANISH_CHARS.test(text)) return true
  const words = text.toLowerCase().match(/[a-záéíóúñü]+/g) ?? []
  let es = 0
  let en = 0
  for (const word of words) {
    if (ES_WORDS.has(word)) es++
    if (EN_WORDS.has(word)) en++
  }
  return es > en
}

// Si el texto es español y hay una voz de español descargada, la usa; en otro
// caso devuelve undefined y se usa la voz seleccionada por el usuario.
async function resolveSpanishVoice(text: string): Promise<string | undefined> {
  if (!isSpanishText(text)) return undefined
  const list = await voicesList()
  return list.find((voice) => voice.language.toLowerCase().startsWith("es") && voice.downloaded)?.id
}

// Speaks `text` with the desktop voice engine. The same `key` is used to
// report the active playback: pass the part id of the message being read.
// Resolves when the audio finishes playing (or is stopped). Returns an error
// message when synthesis fails, so callers can surface it.
export async function speakWithVoices(key: string, text: string, voiceId?: string): Promise<string | undefined> {
  const api = voicesAPI()
  if (!api) return
  if (speakingKey() === key) {
    stopSpeaking()
    return
  }
  stopSpeaking()
  setSpeakingKey(key)
  // El texto en español usa una voz de español descargada cuando existe; el
  // inglés y el resto usan la voz seleccionada por el usuario.
  const effectiveVoice = voiceId ?? (await resolveSpanishVoice(text))
  let result: VoicesSpeakResult
  try {
    result = await api.speak(text, effectiveVoice)
  } catch (error) {
    // Fallo de transporte del IPC: nunca dejar una promesa sin resolver.
    setSpeakingKey(undefined)
    return error instanceof Error ? error.message : String(error)
  }
  if (speakingKey() !== key) return
  if (result.error || !result.wav) {
    setSpeakingKey(undefined)
    return result.error ?? undefined
  }
  await playWav(key, result.wav)
  return
}

export const isVoiceSpeaking = (key: string) => speakingKey() === key

// Id de la reproducción activa (o undefined si nada suena). La cola de
// auto-speak lo usa para detectar si el usuario tomó el control manualmente.
export const currentSpeakingKey = () => speakingKey()

export type SpeechRecognitionLike = {
  lang: string
  continuous: boolean
  interimResults: boolean
  start: () => void
  stop: () => void
  abort: () => void
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null
  onerror: ((event: { error: string }) => void) | null
  onend: (() => void) | null
}

export const getSpeechRecognition = () => getSpeechRecognitionCtor<SpeechRecognitionLike>(window)

// Dictation language for the Web Speech API follows the app locale; anything
// that is not Spanish falls back to English.
export const speechRecognitionLang = (locale: string) => (locale === "es" ? "es-ES" : "en-US")
