import { concatChunks } from "./asr-utils"

// Local speech-to-text (sherpa-onnx Whisper) running in a dedicated
// utilityProcess. Decoding a clip is a synchronous native call that takes
// 0.9 s at 3 s of audio and up to 2.1 s at the recording cap: running it in
// the main process froze every window for that long on each dictation, so the
// recognizer lives here instead (same pattern as voice-worker.ts for TTS).
// The worker also buffers the PCM chunks so the main process never touches
// the audio at all.

type ModelPaths = {
  encoder: string
  decoder: string
  tokens: string
}

type OfflineRecognizerLike = {
  createStream(): OfflineStreamLike
  decode(stream: OfflineStreamLike): void
  getResult(stream: OfflineStreamLike): { text: string } | string
  free(): void
}

type OfflineStreamLike = {
  acceptWaveform(sampleRate: number, samples: Float32Array): void
  free(): void
}

const SAMPLE_RATE = 16000
// The renderer's ScriptProcessor emits 4096 samples per chunk, so 250 chunks
// is 64 s of audio. Anything past that used to be dropped silently; now the
// worker announces the cap so the renderer can stop and tell the user.
const CHUNK_SAMPLES = 4096
export const MAX_CHUNKS = 250
export const MAX_RECORDING_SECONDS = Math.round((MAX_CHUNKS * CHUNK_SAMPLES) / SAMPLE_RATE)

let paths: ModelPaths | undefined
let recognizer: OfflineRecognizerLike | undefined
let recognizerLanguage: string | undefined
let recording = false
let activeLanguage = "en"
let chunks: Float32Array[] = []
let limitAnnounced = false

function post(message: unknown) {
  process.parentPort?.postMessage(message)
}

async function getOrCreateRecognizer(language: string): Promise<OfflineRecognizerLike> {
  if (!paths) throw new Error("ASR worker received no model paths")
  if (recognizer && recognizerLanguage === language) return recognizer
  recognizer?.free()
  recognizer = undefined
  recognizerLanguage = undefined
  const sherpa = (await import("sherpa-onnx")) as unknown as {
    createOfflineRecognizer(config: unknown): OfflineRecognizerLike
  }
  recognizer = sherpa.createOfflineRecognizer({
    featConfig: {
      sampleRate: SAMPLE_RATE,
      featureDim: 80,
    },
    modelConfig: {
      whisper: {
        encoder: paths.encoder,
        decoder: paths.decoder,
        language,
        task: "transcribe",
      },
      tokens: paths.tokens,
      numThreads: 2,
      provider: "cpu",
      modelType: "whisper",
      // sherpa-onnx defaults debug to true and dumps its whole ~2 KB config
      // block to stderr every time a recognizer is created.
      debug: false,
    },
  })
  recognizerLanguage = language
  return recognizer
}

function toFloat32(value: unknown): Float32Array {
  if (value instanceof Float32Array) return value
  if (Array.isArray(value)) return Float32Array.from(value as number[])
  return new Float32Array(0)
}

function transcribe(rec: OfflineRecognizerLike, samples: Float32Array): string {
  const stream = rec.createStream()
  try {
    stream.acceptWaveform(SAMPLE_RATE, samples)
    rec.decode(stream)
    const result = rec.getResult(stream)
    const text = typeof result === "string" ? result : (result?.text ?? "")
    return text.trim()
  } finally {
    stream.free()
  }
}

if (process.parentPort) {
  process.parentPort.on("message", async (event) => {
    const data = event.data as {
      id?: string
      type: string
      payload?: Record<string, unknown>
    }
    if (!data || !data.type) return

    const { id, type, payload } = data

    try {
      switch (type) {
        case "init": {
          paths = {
            encoder: String(payload?.encoder ?? ""),
            decoder: String(payload?.decoder ?? ""),
            tokens: String(payload?.tokens ?? ""),
          }
          post({ id, type: "init-complete" })
          break
        }

        // Loading ~146 MB of ONNX weights is itself a blocking call, so the
        // first click warms the recognizer here rather than on the first stop.
        case "ensure": {
          await getOrCreateRecognizer(String(payload?.language ?? "en"))
          post({ id, type: "ensure-complete" })
          break
        }

        case "start": {
          activeLanguage = String(payload?.language ?? "en")
          chunks = []
          recording = true
          limitAnnounced = false
          post({ id, type: "start-complete" })
          break
        }

        // Fire and forget: the renderer streams a chunk every ~0.26 s and does
        // not wait for an answer.
        case "chunk": {
          if (!recording) break
          if (chunks.length >= MAX_CHUNKS) break
          chunks.push(toFloat32(payload?.samples))
          if (chunks.length >= MAX_CHUNKS && !limitAnnounced) {
            limitAnnounced = true
            post({ type: "limit", payload: { seconds: MAX_RECORDING_SECONDS } })
          }
          break
        }

        case "stop": {
          if (!recording) {
            post({ id, type: "stop-complete", payload: { code: "not-recording" } })
            break
          }
          recording = false
          const { samples, tooShort } = concatChunks(chunks)
          chunks = []
          // Clips under ~0.5 s carry no detectable speech.
          if (tooShort) {
            post({ id, type: "stop-complete", payload: { code: "no-speech" } })
            break
          }
          const rec = await getOrCreateRecognizer(activeLanguage)
          post({ id, type: "stop-complete", payload: { text: transcribe(rec, samples) } })
          break
        }

        default:
          post({ id, type: "error", error: `Unknown asr worker action: ${type}` })
      }
    } catch (err: unknown) {
      // A failed decode must not leave the worker believing it is still
      // recording, or every later stop would answer "not-recording".
      recording = false
      chunks = []
      const message = err instanceof Error ? err.message : String(err)
      post({ id, type: "error", error: message })
    }
  })
}
