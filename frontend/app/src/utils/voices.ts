import { createSignal } from "solid-js"
import { getSpeechRecognitionCtor } from "./runtime-adapters"

// Mirrors `frontend/desktop/src/preload/types.ts` so the renderer can type
// `window.api.voices` without depending on the desktop package.
export type VoiceEngine = "kokoro" | "piper" | "kokoro-es"

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
  // Whether this is the app's default voice for Spanish announcements.
  default?: boolean
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

export type VoicesSpeakOptions = {
  automatic?: boolean
}

export type VoicesAPI = {
  status: () => Promise<VoicesStatus>
  download: () => Promise<void>
  list: () => Promise<VoiceInfo[]>
  speak: (text: string, voiceId?: string, options?: VoicesSpeakOptions) => Promise<VoicesSpeakResult>
  select: (voiceId: string) => Promise<boolean>
  onProgress: (cb: (event: VoicesProgress) => void) => () => void
  downloadVoice: (voiceId: string) => Promise<void>
  deleteVoice: (voiceId: string) => Promise<void>
  setEnabled: (voiceId: string, enabled: boolean) => Promise<void>
  onPiperProgress: (cb: (event: VoicesPiperProgress) => void) => () => void
  speakFish?: (
    text: string,
    voiceId?: string,
    apiKey?: string,
    speed?: number,
  ) => Promise<{ mp3?: Uint8Array; error?: string }>
}

export const voicesAPI = (): VoicesAPI | undefined => window.api?.voices

const [speakingKey, setSpeakingKey] = createSignal<string | undefined>()
let activeAudio: HTMLAudioElement | undefined
let activeURL: string | undefined
let pendingPlay: (() => void) | undefined
let speechGeneration = 0

const MAX_SPEECH_CHARS = 2_000

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
  speechGeneration += 1
  activeAudio?.pause()
  if (typeof window !== "undefined" && "speechSynthesis" in window) {
    try {
      window.speechSynthesis.cancel()
    } catch {}
  }
  const finish = pendingPlay
  pendingPlay = undefined
  clearActive()
  setSpeakingKey(undefined)
  finish?.()
}

// Preferencias dinámicas de audio (velocidad, tono, barge-in, motor)
const SPEED_KEY = "tiancode.voice.speed"
const PITCH_KEY = "tiancode.voice.pitch"
const BARGE_IN_KEY = "tiancode.voice.barge_in"
const CUSTOM_VOICES_KEY = "tiancode.voice.custom_list"
const ENGINE_KEY = "tiancode.voice.engine"

export type VoiceEngineMode = "auto" | "fish" | "system" | "neural"

export const [voiceEngineMode, setVoiceEngineState] = createSignal<VoiceEngineMode>(
  typeof localStorage !== "undefined" ? ((localStorage.getItem(ENGINE_KEY) as VoiceEngineMode) ?? "auto") : "auto",
)

export function getVoiceEngineMode(): VoiceEngineMode {
  return voiceEngineMode()
}

export function setVoiceEngineMode(mode: VoiceEngineMode) {
  setVoiceEngineState(mode)
  if (typeof localStorage !== "undefined") {
    localStorage.setItem(ENGINE_KEY, mode)
  }
}

// Fish Audio S2.1 Pro API (Ultra-Fluida / Free Tier)
export const FISH_AUDIO_API_URL = "https://api.fish.audio/v1/tts"
const FISH_KEY_STORAGE = "tiancode.voice.fish_audio_key"
const FISH_VOICE_STORAGE = "tiancode.voice.fish_audio_voice_id"
export const DEFAULT_FISH_KEY = "sk-fish-JctE9rsGvKF4LthXgq0dZRxno7Wqm5ftrSAA3cfO8Uk"
export const DEFAULT_FISH_VOICE = "07a03f5ca90849b3bf0638135b0a40c3" // Natasha (Spanish)

export type FishVoice = {
  id: string
  name: string
  desc: string
  lang: string
  gender: "female" | "male"
}

export const CURATED_FISH_VOICES: FishVoice[] = [
  { id: "07a03f5ca90849b3bf0638135b0a40c3", name: "Natasha (Español Natural)", desc: "Cálida, empática, dicción perfecta y tono femenino joven", lang: "es", gender: "female" },
  { id: "2ac5be5c9fe4494989a8a21b43c7729f", name: "Española Conversacional y Viva", desc: "Alegre, fluida, animada y conversacional", lang: "es", gender: "female" },
  { id: "b221a81a09324e0a8428c13bc6391985", name: "Española Profesional", desc: "Clara, rítmica, didáctica para explicaciones de código", lang: "es", gender: "female" },
  { id: "ffce9b71653646149b8832b89054cc7d", name: "Española Brillante y Dinámica", desc: "Dinámica, juvenil y enérgica", lang: "es", gender: "female" },
  { id: "82985a30bc9a4f759dde5f701ce3dcf3", name: "Española Neutra y Suave", desc: "Elegante, clara y cadencia relajada", lang: "es", gender: "female" },
  { id: "f4e6fd540b6b4408805952c419a581a1", name: "Española Conversación Natural", desc: "Muy humana, cadencia realista y natural", lang: "es", gender: "female" },
]

export const [fishAudioKey, setFishAudioKeyState] = createSignal<string>(
  typeof localStorage !== "undefined" ? localStorage.getItem(FISH_KEY_STORAGE) || DEFAULT_FISH_KEY : DEFAULT_FISH_KEY,
)
export const [fishAudioVoice, setFishAudioVoiceState] = createSignal<string>(
  typeof localStorage !== "undefined" ? localStorage.getItem(FISH_VOICE_STORAGE) || DEFAULT_FISH_VOICE : DEFAULT_FISH_VOICE,
)

export function getFishAudioKey(): string {
  return fishAudioKey()
}

export function setFishAudioKey(key: string) {
  setFishAudioKeyState(key.trim())
  if (typeof localStorage !== "undefined") {
    localStorage.setItem(FISH_KEY_STORAGE, key.trim())
  }
}

export function getFishAudioVoice(): string {
  return fishAudioVoice()
}

export function setFishAudioVoice(voiceId: string) {
  setFishAudioVoiceState(voiceId.trim())
  if (typeof localStorage !== "undefined") {
    localStorage.setItem(FISH_VOICE_STORAGE, voiceId.trim())
  }
}

const [voiceSpeed, setVoiceSpeedState] = createSignal<number>(
  typeof localStorage !== "undefined" ? Number(localStorage.getItem(SPEED_KEY) ?? "1.0") : 1.0,
)
const [voicePitch, setVoicePitchState] = createSignal<number>(
  typeof localStorage !== "undefined" ? Number(localStorage.getItem(PITCH_KEY) ?? "1.0") : 1.0,
)
const [bargeInEnabled, setBargeInState] = createSignal<boolean>(
  typeof localStorage !== "undefined" ? localStorage.getItem(BARGE_IN_KEY) === "true" : true,
)
const [customVoices, setCustomVoicesState] = createSignal<VoiceInfo[]>(
  typeof localStorage !== "undefined" ? parseCustomVoices(localStorage.getItem(CUSTOM_VOICES_KEY)) : [],
)

// Un valor corrupto en localStorage no debe tumbar el arranque del módulo.
function parseCustomVoices(raw: string | null): VoiceInfo[] {
  if (!raw) return []
  try {
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as VoiceInfo[]) : []
  } catch {
    return []
  }
}

export const getVoiceSpeed = () => voiceSpeed()
export const setVoiceSpeed = (val: number) => {
  setVoiceSpeedState(val)
  if (typeof localStorage !== "undefined") localStorage.setItem(SPEED_KEY, String(val))
}

export const getVoicePitch = () => voicePitch()
export const setVoicePitch = (val: number) => {
  setVoicePitchState(val)
  if (typeof localStorage !== "undefined") localStorage.setItem(PITCH_KEY, String(val))
}

export const getBargeInEnabled = () => bargeInEnabled()
export const setBargeInEnabled = (val: boolean) => {
  setBargeInState(val)
  if (typeof localStorage !== "undefined") localStorage.setItem(BARGE_IN_KEY, String(val))
}

export const getCustomVoices = () => customVoices()
export const addCustomVoice = (voice: VoiceInfo) => {
  const next = [...customVoices().filter((v) => v.id !== voice.id), voice]
  setCustomVoicesState(next)
  if (typeof localStorage !== "undefined") localStorage.setItem(CUSTOM_VOICES_KEY, JSON.stringify(next))
}

// Barge-In Voice Activity Detection (VAD) listener
let vadMediaStream: MediaStream | undefined
let vadAudioContext: AudioContext | undefined

export async function enableBargeInListener() {
  if (typeof window === "undefined" || !navigator.mediaDevices?.getUserMedia) return
  if (vadAudioContext) return
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    vadMediaStream = stream
    const audioCtx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)()
    vadAudioContext = audioCtx
    const source = audioCtx.createMediaStreamSource(stream)
    const analyser = audioCtx.createAnalyser()
    analyser.fftSize = 512
    source.connect(analyser)

    const buffer = new Uint8Array(analyser.frequencyBinCount)
    let speechFrames = 0

    const checkVolume = () => {
      if (!vadAudioContext) return
      analyser.getByteFrequencyData(buffer)
      let sum = 0
      for (let i = 0; i < buffer.length; i++) sum += buffer[i]
      const average = sum / buffer.length

      // Si el usuario habla (volumen por encima del umbral de ruido ambiente) y la IA está hablando:
      if (average > 35) {
        speechFrames++
        if (speechFrames > 2 && bargeInEnabled()) {
          stopSpeaking()
          import("./stream-speech").then((m) => m.StreamSpeech.interrupt()).catch(() => {})
          speechFrames = 0
        }
      } else {
        speechFrames = Math.max(0, speechFrames - 1)
      }
      setTimeout(checkVolume, 80)
    }
    setTimeout(checkVolume, 80)
  } catch {
    // ignore if mic permission not granted
  }
}

const playWav = (key: string, wav: Uint8Array) =>
  new Promise<void>((resolve) => {
    let resolved = false
    const finish = () => {
      if (resolved) return
      resolved = true
      if (pendingPlay === finish) {
        pendingPlay = undefined
        clearActive()
        setSpeakingKey(undefined)
      }
      resolve()
    }
    try {
      const blob = new Blob([wav as Uint8Array<ArrayBuffer>], { type: "audio/wav" })
      const url = URL.createObjectURL(blob)
      const audio = new Audio(url)
      audio.playbackRate = getVoiceSpeed()
      activeURL = url
      activeAudio = audio
      audio.onended = finish
      audio.onerror = finish
      pendingPlay = finish
      audio.play().catch(finish)
      // Watchdog: auto-resolve si el audio no termina en 30s para no trabar la cola
      setTimeout(finish, 30000)
    } catch {
      finish()
    }
  })

// The list is intentionally fetched again for each narration. A voice can be
// downloaded from Settings while a session is open, so a permanent cache would
// keep automatic speech on an obsolete fallback.
async function voicesList(): Promise<VoiceInfo[]> {
  const api = voicesAPI()
  if (!api?.list) return []
  return api.list().catch(() => [])
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

// Si el texto es español, usa una voz de español ya disponible. Nunca descarga
// un modelo al recibir un mensaje: una descarga o síntesis pesada durante una
// sesión activa puede dejar el renderer sin capacidad de respuesta.
async function resolveSpanishVoice(text: string): Promise<string | undefined> {
  if (!isSpanishText(text)) return undefined
  const list = await voicesList()
  const dora = list.find((voice) => voice.id === "ef_dora" && voice.downloaded)
  if (dora) return dora.id
  const femaleEs = list.find(
    (voice) =>
      voice.language.toLowerCase().startsWith("es") &&
      voice.gender === "female" &&
      voice.downloaded !== false,
  )
  if (femaleEs) return femaleEs.id
  const downloaded = list.find((voice) => voice.language.toLowerCase().startsWith("es") && voice.downloaded)
  if (downloaded) return downloaded.id
  return undefined
}

import { cleanMarkdownForSpeech } from "./speech-cleaner"

// Speaks `text` with the desktop voice engine. The same `key` is used to
// report the active playback: pass the part id of the message being read.
// Resolves when the audio finishes playing (or is stopped). Returns an error
// message when synthesis fails, so callers can surface it.
export async function speakWithVoices(key: string, text: string, voiceId?: string): Promise<string | undefined> {
  return speak(key, text, voiceId)
}

export async function speakAutomaticallyWithVoices(key: string, text: string): Promise<string | undefined> {
  return speak(key, text, undefined, { automatic: true })
}

// Fallback con Web Speech API para voces femeninas en español fluidas (Sol / Elvira / Dalia)
function speakWithWebSpeech(key: string, text: string): Promise<string | undefined> {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) {
    setSpeakingKey(undefined)
    return Promise.resolve(undefined)
  }
  return new Promise((resolve) => {
    try {
      window.speechSynthesis.cancel()
      const utterance = new SpeechSynthesisUtterance(text)
      utterance.lang = "es-ES"
      utterance.rate = getVoiceSpeed() ?? 1.05
      utterance.pitch = 1.0

      const voices = window.speechSynthesis.getVoices()
      // Priorizar voces naturales en español de Windows (Microsoft Sabina, Helena, Laura, Dalia, etc.)
      const femaleEsVoice = voices.find(
        (v) =>
          v.lang.toLowerCase().startsWith("es") &&
          /sabina|helena|laura|elvira|dalia|sol|paulina|monica|paloma|natural|neural|female|mujer/i.test(v.name),
      ) || voices.find((v) => v.lang.toLowerCase().startsWith("es"))

      if (femaleEsVoice) utterance.voice = femaleEsVoice

      utterance.onend = () => {
        if (speakingKey() === key) setSpeakingKey(undefined)
        resolve(undefined)
      }
      utterance.onerror = (e) => {
        if (speakingKey() === key) setSpeakingKey(undefined)
        resolve(e.error ? `Speech error: ${e.error}` : undefined)
      }

      window.speechSynthesis.speak(utterance)
    } catch {
      setSpeakingKey(undefined)
      resolve(undefined)
    }
  })
}

export async function speakWithFishAudio(
  key: string,
  text: string,
  voiceId?: string,
): Promise<string | undefined> {
  const apiKey = getFishAudioKey()
  if (!apiKey) return "Clave de API de Fish Audio no configurada."

  const selectedVoice = voiceId || getFishAudioVoice()
  const speed = getVoiceSpeed()
  const expectedGeneration = speechGeneration

  try {
    let audioBuffer: Uint8Array | ArrayBuffer | undefined

    if (window.api?.voices?.speakFish) {
      const res = await window.api.voices.speakFish(text, selectedVoice, apiKey, speed)
      if (res.error) return res.error
      if (!res.mp3 || res.mp3.byteLength === 0) {
        return "Fish Audio devolvió un buffer de audio vacío."
      }
      audioBuffer = res.mp3
    } else {
      const response = await fetch(FISH_AUDIO_API_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          model: "s2.1-pro-free",
        },
        body: JSON.stringify({
          text,
          reference_id: selectedVoice || undefined,
          format: "mp3",
          latency: "normal",
          prosody: {
            speed: speed ?? 1.0,
            volume: 0,
          },
        }),
      })

      if (!response.ok) {
        const errBody = await response.text().catch(() => "")
        return `Error Fish Audio HTTP ${response.status}: ${errBody || response.statusText}`
      }

      if (speechGeneration !== expectedGeneration || speakingKey() !== key) return

      const buffer = await response.arrayBuffer()
      if (!buffer || buffer.byteLength === 0) {
        return "Fish Audio devolvió un buffer de audio vacío."
      }
      audioBuffer = buffer
    }

    if (speechGeneration !== expectedGeneration || speakingKey() !== key) return

    return new Promise<undefined>((resolve) => {
      let resolved = false
      const finish = () => {
        if (resolved) return
        resolved = true
        if (pendingPlay === finish) {
          pendingPlay = undefined
          clearActive()
          setSpeakingKey(undefined)
        }
        resolve(undefined)
      }

      try {
        const blob = new Blob([audioBuffer as BlobPart], { type: "audio/mpeg" })
        const url = URL.createObjectURL(blob)
        const audio = new Audio(url)
        audio.playbackRate = getVoiceSpeed()
        activeURL = url
        activeAudio = audio
        audio.onended = finish
        audio.onerror = finish
        pendingPlay = finish
        audio.play().catch(finish)
        setTimeout(finish, 45000)
      } catch {
        finish()
      }
    })
  } catch (error) {
    return `Error de red al conectar con Fish Audio: ${error instanceof Error ? error.message : String(error)}`
  }
}

async function speak(key: string, text: string, voiceId?: string, options?: VoicesSpeakOptions): Promise<string | undefined> {
  // Limpia y normaliza Markdown a lenguaje hablado fluido natural (estilo Sol de ChatGPT)
  const cleaned = cleanMarkdownForSpeech(text)
  const normalized = cleaned.replace(/\s+/g, " ").trim()
  if (!normalized) return
  if (normalized.length > MAX_SPEECH_CHARS) return "El texto es demasiado largo para leerlo en voz alta."
  if (speakingKey() === key) {
    stopSpeaking()
    return
  }
  stopSpeaking()
  setSpeakingKey(key)
  const expectedGeneration = speechGeneration

  const isFishVoice = Boolean(voiceId && (CURATED_FISH_VOICES.some((v) => v.id === voiceId) || voiceId.length === 32))
  if (isFishVoice || getVoiceEngineMode() === "fish") {
    const err = await speakWithFishAudio(key, normalized, voiceId)
    if (!err) return
    return speakWithWebSpeech(key, normalized)
  }

  if (getVoiceEngineMode() === "system") {
    return speakWithWebSpeech(key, normalized)
  }

  if (getVoiceEngineMode() === "auto") {
    const fishKey = getFishAudioKey()
    if (fishKey) {
      const err = await speakWithFishAudio(key, normalized, voiceId)
      if (!err) return
    }
  }

  const api = voicesAPI()
  if (!api) {
    return speakWithWebSpeech(key, normalized)
  }

  // El texto en español usa una voz de español descargada cuando existe; el
  // inglés y el resto usan la voz seleccionada por el usuario.
  const effectiveVoice = voiceId ?? (await resolveSpanishVoice(normalized))
  if (speechGeneration !== expectedGeneration || speakingKey() !== key) return
  let result: VoicesSpeakResult
  try {
    result = await api.speak(normalized, effectiveVoice, options)
  } catch {
    return speakWithWebSpeech(key, normalized)
  }
  if (speechGeneration !== expectedGeneration || speakingKey() !== key) return
  if (result.error || !result.wav) {
    return speakWithWebSpeech(key, normalized)
  }
  await playWav(key, result.wav)
  return
}

export const isVoiceSpeaking = (key?: string) => (key !== undefined ? speakingKey() === key : speakingKey() !== undefined)

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
