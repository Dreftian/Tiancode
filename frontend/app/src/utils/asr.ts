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

// Graba el micrófono y transcribe el clip completo al detenerse. Devuelve una
// función de parada; el transcript llega por onResult (o el código de error
// por onError). onLimit avisa de que se alcanzó el tope de grabación: el audio
// posterior se descartaba en silencio y la grabación parece seguir viva.
export async function startLocalDictation(options: {
  language: AsrLanguage
  deviceId?: string
  onResult: (text: string) => void
  onError: (code: AsrErrorCode) => void
  onLimit?: (seconds: number) => void
}): Promise<() => void> {
  const { language, onResult, onError, onLimit } = options
  const api = asrAPI()
  if (!api) throw new DictationError("engine-failed")

  // Validar si la PC tiene micrófonos conectados
  const availableMics = await getAudioInputDevices()
  if (availableMics.length === 0) throw new DictationError("no-devices")

  const preferredDeviceId = options.deviceId || getSelectedAudioDeviceId() || undefined
  const constraints: MediaTrackConstraints = {
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
    channelCount: 1,
    sampleRate: 16000,
    ...(preferredDeviceId ? { deviceId: { exact: preferredDeviceId } } : {}),
  }

  let stream: MediaStream
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: constraints })
  } catch (error) {
    // Si el dispositivo guardado ya no está disponible, fallback al micrófono predeterminado
    if (preferredDeviceId) {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1,
          sampleRate: 16000,
        },
      })
    } else {
      throw error
    }
  }

  const context = new AudioContext({ sampleRate: 16000 })
  const source = context.createMediaStreamSource(stream)
  const node = context.createScriptProcessor(4096, 1, 1)
  let stopped = false
  const releaseAudio = () => {
    node.onaudioprocess = null
    node.disconnect()
    source.disconnect()
    void context.close().catch(() => {})
    stream.getTracks().forEach((track) => track.stop())
  }
  try {
    await api.start(language)
  } catch (error) {
    // El reconocedor no arrancó: liberar lo ya adquirido. Si no, el indicador
    // del micrófono del SO y el nodo de captura quedarían activos para siempre.
    releaseAudio()
    throw error
  }
  node.onaudioprocess = (event) => {
    if (stopped) return
    api.chunk(new Float32Array(event.inputBuffer.getChannelData(0)))
  }
  source.connect(node)
  node.connect(context.destination)
  const startTime = Date.now()

  const finish = async (transcribe: boolean) => {
    if (stopped) return
    stopped = true
    unsubscribe()
    releaseAudio()
    if (!transcribe) return
    let result: AsrResult
    try {
      result = await api.stop()
    } catch {
      // El proceso del reconocedor cayó con la petición en vuelo.
      onError("engine-failed")
      return
    }
    if (result.code) {
      onError(result.code)
    } else if (result.text) {
      const processed = applyDictationDictionary(result.text)
      const durationSeconds = Math.max(1, Math.round((Date.now() - startTime) / 1000))
      addRecentRecording({ text: processed, durationSeconds })
      onResult(processed)
    }
  }

  const unsubscribe = api.onNotice((notice) => {
    if (notice.reason === "limit") {
      // Se llegó al tope: se transcribe lo grabado y se avisa, en vez de
      // seguir "escuchando" mientras el audio se tira.
      onLimit?.(notice.seconds ?? 0)
      void finish(true)
      return
    }
    onError("engine-failed")
    void finish(false)
  })

  return () => finish(true)
}
