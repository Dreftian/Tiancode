// Local speech-to-text (sherpa-onnx Whisper en el proceso principal) para el
// dictado por micrófono. Electron no expone la Web Speech API, así que el
// renderer captura audio con getUserMedia y envía chunks PCM de 16 kHz por IPC.

export type AsrStatus = {
  ready: boolean
  downloading?: boolean
  progress?: number
  error?: string
}

export type AsrResult = {
  text?: string
  error?: string
}

export type AsrAPI = {
  status: () => Promise<AsrStatus>
  ensure: () => Promise<void>
  start: (language: "es" | "en") => Promise<void>
  chunk: (samples: Float32Array) => void
  stop: () => Promise<AsrResult>
  onProgress: (cb: (event: { progress: number; file?: string }) => void) => () => void
}

export const asrAPI = (): AsrAPI | undefined => window.api?.asr

export const SELECTED_MIC_KEY = "tiancode.audio.selected_microphone"
export const DICTATION_DICT_KEY = "tiancode.dictation.custom_dictionary"
export const DICTATION_RECORDINGS_KEY = "tiancode.dictation.recent_recordings"
export const DICTATION_HOLD_KEY = "tiancode.dictation.hold_shortcut"
export const DICTATION_TOGGLE_KEY = "tiancode.dictation.toggle_shortcut"

export type DictationRecording = {
  id: string
  timestamp: number
  text: string
  durationSeconds?: number
}

export function getDictationDictionary(): string[] {
  if (typeof localStorage === "undefined") return ["Jane Doe"]
  try {
    const raw = localStorage.getItem(DICTATION_DICT_KEY)
    if (!raw) return ["Jane Doe"]
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : ["Jane Doe"]
  } catch {
    return ["Jane Doe"]
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

export function getHoldDictationShortcut(): string {
  if (typeof localStorage === "undefined") return "Desactivado"
  return localStorage.getItem(DICTATION_HOLD_KEY) ?? "Desactivado"
}

export function setHoldDictationShortcut(shortcut: string): void {
  if (typeof localStorage === "undefined") return
  localStorage.setItem(DICTATION_HOLD_KEY, shortcut)
}

export function getToggleDictationShortcut(): string {
  if (typeof localStorage === "undefined") return "Ctrl+Shift+M"
  return localStorage.getItem(DICTATION_TOGGLE_KEY) ?? "Ctrl+Shift+M"
}

export function setToggleDictationShortcut(shortcut: string): void {
  if (typeof localStorage === "undefined") return
  localStorage.setItem(DICTATION_TOGGLE_KEY, shortcut)
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
// función de parada; el transcript llega por onResult (o el error por onError).
export async function startLocalDictation(
  language: "es" | "en",
  onResult: (text: string) => void,
  onError: (message: string) => void,
  targetDeviceId?: string,
): Promise<() => void> {
  const api = asrAPI()
  if (!api) throw new Error("Local dictation is unavailable")

  // Validar si la PC tiene micrófonos conectados
  const availableMics = await getAudioInputDevices()
  if (availableMics.length === 0) {
    throw new Error(
      language === "es"
        ? "No se detectó ningún micrófono conectado a la PC."
        : "No microphone detected on this PC.",
    )
  }

  const preferredDeviceId = targetDeviceId || getSelectedAudioDeviceId() || undefined
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
  try {
    await api.start(language)
  } catch (error) {
    // El reconocedor no arrancó: liberar lo ya adquirido. Si no, el indicador
    // del micrófono del SO y el nodo de captura quedarían activos para siempre.
    node.disconnect()
    source.disconnect()
    void context.close().catch(() => {})
    stream.getTracks().forEach((track) => track.stop())
    throw error
  }
  node.onaudioprocess = (event) => {
    if (stopped) return
    api.chunk(new Float32Array(event.inputBuffer.getChannelData(0)))
  }
  source.connect(node)
  node.connect(context.destination)
  const startTime = Date.now()
  const stop = async () => {
    if (stopped) return
    stopped = true
    node.disconnect()
    source.disconnect()
    await context.close().catch(() => {})
    stream.getTracks().forEach((track) => track.stop())
    const result = await api.stop()
    if (result.error) {
      onError(result.error)
    } else if (result.text) {
      const processed = applyDictationDictionary(result.text)
      const durationSeconds = Math.max(1, Math.round((Date.now() - startTime) / 1000))
      addRecentRecording({ text: processed, durationSeconds })
      onResult(processed)
    }
  }
  return stop
}
