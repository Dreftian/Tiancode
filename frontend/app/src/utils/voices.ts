import { createSignal } from "solid-js"
import { getSpeechRecognitionCtor } from "./runtime-adapters"

// Mirrors `frontend/desktop/src/preload/types.ts` so the renderer can type
// `window.api.voices` without depending on the desktop package.
export type VoiceInfo = {
  id: string
  name: string
  language: string
  gender: "female" | "male"
  // Whether kokoro-js can synthesize this voice (English voices only; the
  // bundled espeak-ng phonemizer has no multilingual voices).
  supported: boolean
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
}

export const voicesAPI = (): VoicesAPI | undefined => window.api?.voices

const [speakingKey, setSpeakingKey] = createSignal<string | undefined>()
let activeAudio: HTMLAudioElement | undefined
let activeURL: string | undefined

const clearActive = () => {
  activeAudio = undefined
  if (activeURL) {
    URL.revokeObjectURL(activeURL)
    activeURL = undefined
  }
}

// Stops whatever is currently playing, if anything.
export function stopSpeaking() {
  activeAudio?.pause()
  clearActive()
  setSpeakingKey(undefined)
}

const playWav = (key: string, wav: Uint8Array) => {
  // The IPC layer returns a fresh ArrayBuffer-backed copy, so the cast is safe.
  const blob = new Blob([wav as Uint8Array<ArrayBuffer>], { type: "audio/wav" })
  const url = URL.createObjectURL(blob)
  const audio = new Audio(url)
  activeURL = url
  activeAudio = audio
  audio.onended = () => {
    if (speakingKey() !== key) return
    clearActive()
    setSpeakingKey(undefined)
  }
  audio.onerror = () => {
    if (speakingKey() !== key) return
    clearActive()
    setSpeakingKey(undefined)
  }
  void audio.play()
}

// Speaks `text` with the desktop voice engine. The same `key` is used to
// report the active playback: pass the part id of the message being read.
// Returns an error message when synthesis fails, so callers can surface it.
export async function speakWithVoices(key: string, text: string, voiceId?: string): Promise<string | undefined> {
  const api = voicesAPI()
  if (!api) return
  if (speakingKey() === key) {
    stopSpeaking()
    return
  }
  stopSpeaking()
  setSpeakingKey(key)
  const result = await api.speak(text, voiceId)
  if (speakingKey() !== key) return
  if (result.error || !result.wav) {
    setSpeakingKey(undefined)
    return result.error ?? undefined
  }
  playWav(key, result.wav)
}

export const isVoiceSpeaking = (key: string) => speakingKey() === key

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
