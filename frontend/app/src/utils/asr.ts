// Local speech-to-text (sherpa-onnx Whisper en el proceso principal) para el
// dictado por micrófono. Electron no expone la Web Speech API, así que el
// renderer captura audio con getUserMedia y envía chunks PCM de 16 kHz por IPC.

// Whisper tiny es multilingüe (99 idiomas). Antes todo lo que no fuera "es"
// se decodificaba como inglés, así que ja/ko/ru/zh salían destrozados.
export type AsrLanguage = "en" | "es" | "ja" | "ko" | "ru" | "zh"

// Códigos estables del proceso principal: los mensajes del motor son literales
// en inglés y acababan tal cual dentro de un toast traducido.
export type AsrErrorCode = "not-recording" | "no-speech" | "engine-failed" | "no-devices"

export type AsrStatus = {
  ready: boolean
  downloading?: boolean
  progress?: number
  error?: string
  // Peso de la descarga, para pedir permiso antes de gastarlo.
  sizeMb: number
}

export type AsrResult = {
  text?: string
  code?: Exclude<AsrErrorCode, "no-devices">
}

// Avisos fuera de banda durante una grabación: se alcanzó el tope de 64 s o
// el proceso del reconocedor murió y hay que soltar el micrófono.
export type AsrNotice = {
  reason: "limit" | "crashed"
  seconds?: number
}

export type AsrAPI = {
  status: () => Promise<AsrStatus>
  ensure: (language: AsrLanguage) => Promise<void>
  start: (language: AsrLanguage) => Promise<void>
  chunk: (samples: Float32Array) => void
  stop: () => Promise<AsrResult>
  onProgress: (cb: (event: { progress: number; file?: string }) => void) => () => void
  onNotice: (cb: (event: AsrNotice) => void) => () => void
}

export const asrAPI = (): AsrAPI | undefined => window.api?.asr

// El locale de la app (incluido en-150, que es inglés) al idioma de Whisper.
const ASR_LANGUAGES: AsrLanguage[] = ["en", "es", "ja", "ko", "ru", "zh"]

export function asrLanguageForLocale(locale: string): AsrLanguage {
  const base = locale.split("-")[0] ?? "en"
  return ASR_LANGUAGES.includes(base as AsrLanguage) ? (base as AsrLanguage) : "en"
}

// Error de dictado con código estable para que quien llama traduzca el texto.
export class DictationError extends Error {
  constructor(readonly code: AsrErrorCode) {
    super(code)
    this.name = "DictationError"
  }
}

export const SELECTED_MIC_KEY = "tiancode.audio.selected_microphone"
export const DICTATION_DICT_KEY = "tiancode.dictation.custom_dictionary"
export const DICTATION_RECORDINGS_KEY = "tiancode.dictation.recent_recordings"

export type DictationRecording = {
  id: string
  timestamp: number
  text: string
  durationSeconds?: number
}

// An empty dictionary is empty. "Jane Doe" used to come back whenever nothing was stored, so the
// last entry could never be removed and a made-up contact sat in every user's list.
export function getDictationDictionary(): string[] {
  if (typeof localStorage === "undefined") return []
  try {
    const raw = localStorage.getItem(DICTATION_DICT_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter((w) => typeof w === "string") : []
  } catch {
    return []
  }
}

export function setDictationDictionary(entries: string[]): void {
  if (typeof localStorage === "undefined") return
  localStorage.setItem(DICTATION_DICT_KEY, JSON.stringify(entries))
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("tiancode:dictation-dict-changed", { detail: { entries } }))
  }
}

export function addDictationDictionaryEntry(entry: string): void {
  const trimmed = entry.trim()
  if (!trimmed) return
  const current = getDictationDictionary()
  if (!current.some((w) => w.toLowerCase() === trimmed.toLowerCase())) {
    setDictationDictionary([...current, trimmed])
  }
}

export function removeDictationDictionaryEntry(entry: string): void {
  const current = getDictationDictionary()
  setDictationDictionary(current.filter((w) => w.toLowerCase() !== entry.toLowerCase()))
}

export function applyDictationDictionary(text: string): string {
  if (!text) return text
  let result = text
  const dict = getDictationDictionary()
  for (const word of dict) {
    if (!word) continue
    const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    const regex = new RegExp(`\\b${escaped}\\b`, "gi")
    result = result.replace(regex, word)
  }
  return result
}

export function getRecentRecordings(): DictationRecording[] {
  if (typeof localStorage === "undefined") return []
  try {
    const raw = localStorage.getItem(DICTATION_RECORDINGS_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function addRecentRecording(entry: { text: string; durationSeconds?: number }): void {
  if (typeof localStorage === "undefined" || !entry.text.trim()) return
  const current = getRecentRecordings()
  const newRecord: DictationRecording = {
    id: `rec-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    timestamp: Date.now(),
    text: entry.text.trim(),
    durationSeconds: entry.durationSeconds,
  }
  const next = [newRecord, ...current].slice(0, 20)
  localStorage.setItem(DICTATION_RECORDINGS_KEY, JSON.stringify(next))
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("tiancode:recent-recordings-changed", { detail: { recordings: next } }))
  }
}

export function clearRecentRecordings(): void {
  if (typeof localStorage === "undefined") return
  localStorage.removeItem(DICTATION_RECORDINGS_KEY)
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("tiancode:recent-recordings-changed", { detail: { recordings: [] } }))
  }
}

/**
 * Detecta y enumera todos los micrófonos disponibles en la PC.
 */
export async function getAudioInputDevices(): Promise<MediaDeviceInfo[]> {
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.enumerateDevices) {
    return []
  }
  try {
    const devices = await navigator.mediaDevices.enumerateDevices()
    return devices.filter((d) => d.kind === "audioinput")
  } catch {
    return []
  }
}

export function getSelectedAudioDeviceId(): string | null {
  if (typeof localStorage === "undefined") return null
  return localStorage.getItem(SELECTED_MIC_KEY)
}

export function setSelectedAudioDeviceId(id: string | null): void {
  if (typeof localStorage === "undefined") return
  if (id) {
    localStorage.setItem(SELECTED_MIC_KEY, id)
  } else {
    localStorage.removeItem(SELECTED_MIC_KEY)
  }
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("tiancode:microphone-changed", { detail: { deviceId: id } }))
  }
}

export function onAudioDeviceChange(cb: () => void): () => void {
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.addEventListener) {
    return () => {}
  }
  navigator.mediaDevices.addEventListener("devicechange", cb)
  return () => {
    navigator.mediaDevices.removeEventListener("devicechange", cb)
  }
}

// Minimal WebCodecs shapes: the DOM lib in this toolchain does not ship them yet.
type AudioDataLike = {
  format: string | null
  sampleRate: number
  numberOfFrames: number
  numberOfChannels: number
  copyTo(destination: ArrayBufferView, options: { planeIndex: number; format?: string }): void
  close(): void
}
type TrackProcessorCtor = new (init: { track: MediaStreamTrack }) => { readable: ReadableStream<AudioDataLike> }
type Capture = { release: () => void }

const TARGET_RATE = 16000
// The renderer streams 4096-sample chunks; the worker caps the recording by counting them.
const CHUNK = 4096

// Linear-interpolation resampler from the device rate (usually 48 kHz) down to Whisper's 16 kHz,
// emitting fixed-size chunks so the worker's time limit stays accurate.
function createResampler(onChunk: (samples: Float32Array) => void) {
  let tail = new Float32Array(0)
  let position = 0
  let pending = new Float32Array(CHUNK)
  let filled = 0
  return (input: Float32Array, rate: number) => {
    const ratio = rate / TARGET_RATE
    const source = new Float32Array(tail.length + input.length)
    source.set(tail)
    source.set(input, tail.length)
    while (position + 1 < source.length) {
      const index = Math.floor(position)
      const fraction = position - index
      pending[filled++] = source[index]! + (source[index + 1]! - source[index]!) * fraction
      if (filled === CHUNK) {
        onChunk(pending)
        pending = new Float32Array(CHUNK)
        filled = 0
      }
      position += ratio
    }
    const consumed = Math.floor(position)
    tail = source.slice(consumed)
    position -= consumed
  }
}

function monoFrame(frame: AudioDataLike) {
  const out = new Float32Array(frame.numberOfFrames)
  const format = frame.format ?? "f32-planar"
  if (format === "f32-planar") {
    frame.copyTo(out, { planeIndex: 0 })
    return out
  }
  if (format === "f32") {
    const interleaved = new Float32Array(frame.numberOfFrames * frame.numberOfChannels)
    frame.copyTo(interleaved, { planeIndex: 0 })
    for (let index = 0; index < out.length; index++) out[index] = interleaved[index * frame.numberOfChannels]!
    return out
  }
  if (format === "s16" || format === "s16-planar") {
    const channels = format === "s16" ? frame.numberOfChannels : 1
    const raw = new Int16Array(frame.numberOfFrames * channels)
    frame.copyTo(raw, { planeIndex: 0 })
    for (let index = 0; index < out.length; index++) out[index] = raw[index * channels]! / 32768
    return out
  }
  frame.copyTo(out, { planeIndex: 0, format: "f32-planar" })
  return out
}

// Insertable streams read frames straight from the track. No AudioContext is involved, so a
// suspended or output-less audio graph (the reason the mic "listened" but heard nothing) cannot
// starve the recognizer.
function captureWithTrackProcessor(stream: MediaStream, onSamples: (samples: Float32Array) => void): Capture | undefined {
  const Processor = (window as unknown as { MediaStreamTrackProcessor?: TrackProcessorCtor }).MediaStreamTrackProcessor
  const track = stream.getAudioTracks()[0]
  if (!Processor || !track) return
  const reader = new Processor({ track }).readable.getReader()
  const resample = createResampler(onSamples)
  let running = true
  void (async () => {
    try {
      while (running) {
        const { value, done } = await reader.read()
        if (done || !value) break
        try {
          resample(monoFrame(value), value.sampleRate)
        } finally {
          value.close()
        }
      }
    } catch (error) {
      if (running) console.warn("[dictation] track processor stopped", error)
    }
  })()
  return {
    release: () => {
      running = false
      void reader.cancel().catch(() => {})
    },
  }
}

async function captureWithAudioContext(stream: MediaStream, onSamples: (samples: Float32Array) => void): Promise<Capture> {
  const context = new AudioContext({ sampleRate: TARGET_RATE })
  const source = context.createMediaStreamSource(stream)
  const node = context.createScriptProcessor(CHUNK, 1, 1)
  node.onaudioprocess = (event) => onSamples(new Float32Array(event.inputBuffer.getChannelData(0)))
  source.connect(node)
  node.connect(context.destination)
  await context.resume().catch(() => {})
  if (context.state !== "running") console.warn("[dictation] audio context is", context.state)
  return {
    release: () => {
      node.onaudioprocess = null
      node.disconnect()
      source.disconnect()
      void context.close().catch(() => {})
    },
  }
}

// Records the microphone and transcribes the whole clip when it stops. Returns a stop function;
// the transcript arrives through onResult (or an error code through onError). A spoken phrase
// followed by a pause finishes on its own, so the user never has to find the stop button.
export async function startLocalDictation(options: {
  language: AsrLanguage
  deviceId?: string
  onResult: (text: string) => void
  onError: (code: AsrErrorCode, detail?: string) => void
  onLimit?: (seconds: number) => void
  onLevel?: (level: number) => void
  onTranscribing?: () => void
}): Promise<() => void> {
  const { language, onResult, onError, onLimit } = options
  const api = asrAPI()
  if (!api) throw new DictationError("engine-failed")

  const availableMics = await getAudioInputDevices()
  if (availableMics.length === 0) throw new DictationError("no-devices")

  const preferredDeviceId = options.deviceId || getSelectedAudioDeviceId() || undefined
  const base: MediaTrackConstraints = {
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
    channelCount: 1,
  }
  let stream: MediaStream
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: preferredDeviceId ? { ...base, deviceId: { exact: preferredDeviceId } } : base,
    })
  } catch (error) {
    // The saved device is gone: fall back to the system default instead of failing.
    if (!preferredDeviceId) throw error
    stream = await navigator.mediaDevices.getUserMedia({ audio: base })
  }

  let stopped = false
  let receivedSamples = false
  let heardSpeech = false
  let lastSpeech = 0
  let capture: Capture | undefined
  let watchdog: ReturnType<typeof setInterval> | undefined
  const startTime = Date.now()
  const push = (samples: Float32Array) => {
    if (stopped) return
    receivedSamples = true
    const rms = Math.sqrt(samples.reduce((sum, value) => sum + value * value, 0) / samples.length)
    options.onLevel?.(Math.min(1, rms * 12))
    if (rms > 0.008) {
      heardSpeech = true
      lastSpeech = Date.now()
    }
    api.chunk(samples)
  }
  const releaseAudio = () => {
    clearInterval(watchdog)
    options.onLevel?.(0)
    capture?.release()
    capture = undefined
    stream.getTracks().forEach((track) => track.stop())
  }
  try {
    await api.start(language)
    capture = captureWithTrackProcessor(stream, push) ?? (await captureWithAudioContext(stream, push))
  } catch (error) {
    // The recognizer or the capture did not start: release the microphone so the OS indicator
    // and the worker do not stay busy forever.
    releaseAudio()
    void api.stop().catch(() => {})
    throw error
  }

  const finish = async (transcribe: boolean) => {
    if (stopped) return
    stopped = true
    unsubscribe()
    releaseAudio()
    if (!transcribe) return
    options.onTranscribing?.()
    let result: AsrResult
    try {
      result = await api.stop()
    } catch (error) {
      onError("engine-failed", error instanceof Error ? error.message : String(error))
      return
    }
    if (result.code) {
      onError(result.code)
    } else if (result.text) {
      const processed = applyDictationDictionary(result.text)
      const durationSeconds = Math.max(1, Math.round((Date.now() - startTime) / 1000))
      addRecentRecording({ text: processed, durationSeconds })
      onResult(processed)
    } else {
      onError("no-speech")
    }
  }

  const unsubscribe = api.onNotice((notice) => {
    if (notice.reason === "limit") {
      onLimit?.(notice.seconds ?? 0)
      void finish(true)
      return
    }
    void finish(false)
    onError("engine-failed", "recognizer process exited")
  })

  watchdog = setInterval(() => {
    if (stopped) return
    const elapsed = Date.now() - startTime
    if (!receivedSamples && elapsed > 6000) {
      void finish(false)
      void api.stop().catch(() => {})
      onError("engine-failed", "no audio samples arrived from the microphone")
      return
    }
    if ((heardSpeech && Date.now() - lastSpeech > 2200) || (elapsed > 15000 && !heardSpeech)) void finish(true)
  }, 250)

  return () => finish(true)
}
