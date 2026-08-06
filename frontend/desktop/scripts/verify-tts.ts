// End-to-end check of the kokoro-js stack used by the TTS engine: downloads
// the model (q8 to keep it small; the app uses fp32), synthesizes one
// sentence, and writes the WAV through the same encoder the app uses.
// Run with `bun run scripts/verify-tts.ts` from frontend/desktop.
import { mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { env } from "@huggingface/transformers"
import { KokoroTTS } from "kokoro-js"
import { float32ToWav } from "../src/main/wav"

env.cacheDir = mkdtempSync(join(tmpdir(), "kokoro-verify-"))

const tts = await KokoroTTS.from_pretrained("onnx-community/Kokoro-82M-v1.0-ONNX", {
  dtype: "q8",
  device: "cpu",
  progress_callback: (info) => {
    if (info.status === "progress") console.log(`download ${info.file}: ${Math.round((info.loaded / info.total) * 100)}%`)
  },
})

const audio = await tts.generate("Hello from Tiancode, this is a text to speech verification.", { voice: "af_heart" })
const samples = Array.isArray(audio.audio) ? concat(audio.audio) : audio.audio
console.log("synthesized", samples.length, "samples @", audio.sampling_rate, "Hz")

const wav = float32ToWav(samples, audio.sampling_rate)
const out = join(env.cacheDir, "out.wav")
writeFileSync(out, wav)
console.log("wrote", out, wav.length, "bytes; header:", wav.toString("ascii", 0, 4), wav.toString("ascii", 8, 12))

function concat(chunks: Float32Array[]) {
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0)
  const result = new Float32Array(total)
  let offset = 0
  for (const chunk of chunks) {
    result.set(chunk, offset)
    offset += chunk.length
  }
  return result
}
