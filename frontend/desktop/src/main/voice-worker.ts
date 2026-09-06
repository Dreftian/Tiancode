import type { ProgressInfo } from "@huggingface/transformers"
import type { KokoroTTS } from "kokoro-js"

const KOKORO_MODEL_ID = "onnx-community/Kokoro-82M-v1.0-ONNX"

const SUPPORTED_VOICE_IDS = [
  "af_heart", "af_alloy", "af_nova", "af_bella", "af_sarah", "af_sky",
  "bf_isabella", "bf_emma", "bf_alice", "bf_lily",
] as const
type SupportedVoiceId = (typeof SUPPORTED_VOICE_IDS)[number]

let ttsInstance: KokoroTTS | undefined
let loadingPromise: Promise<KokoroTTS> | undefined
let configuredCacheDir: string | undefined

function post(message: unknown) {
  process.parentPort?.postMessage(message)
}

async function getOrLoadTTS(cacheDir?: string): Promise<KokoroTTS> {
  if (ttsInstance) return ttsInstance
  if (loadingPromise) return loadingPromise

  const targetDir = cacheDir ?? configuredCacheDir

  loadingPromise = (async () => {
    const { env } = await import("@huggingface/transformers")
    if (targetDir) {
      env.cacheDir = targetDir
    }
    const { KokoroTTS } = await import("kokoro-js")
    const tts = await KokoroTTS.from_pretrained(KOKORO_MODEL_ID, {
      dtype: "fp32",
      device: "cpu",
      progress_callback: (info: ProgressInfo) => {
        if (info.status === "progress" && info.total > 0) {
          const progress = Math.round((info.loaded / info.total) * 100)
          post({
            type: "progress",
            payload: { progress, file: info.file },
          })
        }
      },
    })
    ttsInstance = tts
    return tts
  })().catch((err) => {
    loadingPromise = undefined
    throw err
  })

  return loadingPromise
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
          if (typeof payload?.cacheDir === "string") {
            configuredCacheDir = payload.cacheDir
          }
          post({ id, type: "init-complete" })
          break
        }

        case "download": {
          await getOrLoadTTS(typeof payload?.cacheDir === "string" ? payload.cacheDir : undefined)
          post({ id, type: "download-complete" })
          break
        }

        case "synthesize": {
          const tts = await getOrLoadTTS(typeof payload?.cacheDir === "string" ? payload.cacheDir : undefined)
          const text = typeof payload?.text === "string" ? payload.text : ""
          const voiceId = typeof payload?.voiceId === "string" ? payload.voiceId : "af_heart"
          const speed = typeof payload?.speed === "number" ? payload.speed : 1.15

          // Perform neural speech synthesis in this dedicated utilityProcess
          const audio = await tts.generate(text, {
            voice: voiceId as SupportedVoiceId,
            speed,
          })

          post({
            id,
            type: "synthesize-complete",
            payload: {
              samples: audio.audio,
              sampleRate: audio.sampling_rate,
            },
          })
          break
        }

        default:
          post({ id, type: "error", error: `Unknown voice worker action: ${type}` })
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      post({ id, type: "error", error: message })
    }
  })
}
