// Minimal verification of the Float32Array -> WAV encoder used by the TTS
// engine. Run with `bun run scripts/verify-wav.ts` from frontend/desktop.
import { float32ToWav } from "../src/main/wav"

const failures: string[] = []
const check = (label: string, actual: unknown, expected: unknown) => {
  if (actual !== expected) failures.push(`${label}: expected ${expected}, got ${actual}`)
}

// 1 second of a 440Hz sine at 24kHz, mixed with clipping boundaries.
const sampleRate = 24000
const samples = new Float32Array(sampleRate)
for (let i = 0; i < samples.length; i++) {
  samples[i] = 0.25 * Math.sin((2 * Math.PI * 440 * i) / sampleRate)
}
samples[100] = 1 // positive clip boundary
samples[101] = -1 // negative clip boundary
samples[102] = 2 // must clamp to 1
samples[103] = -2 // must clamp to -1
samples[104] = 0.5

const wav = float32ToWav(samples, sampleRate)
const view = new DataView(wav.buffer, wav.byteOffset, wav.byteLength)

check("size", wav.length, 44 + samples.length * 2)
check("riff id", wav.toString("ascii", 0, 4), "RIFF")
check("riff size", view.getUint32(4, true), 36 + samples.length * 2)
check("wave id", wav.toString("ascii", 8, 12), "WAVE")
check("fmt id", wav.toString("ascii", 12, 16), "fmt ")
check("fmt chunk size", view.getUint32(16, true), 16)
check("audio format", view.getUint16(20, true), 1)
check("channels", view.getUint16(22, true), 1)
check("sample rate", view.getUint32(24, true), sampleRate)
check("byte rate", view.getUint32(28, true), sampleRate * 2)
check("block align", view.getUint16(32, true), 2)
check("bits per sample", view.getUint16(34, true), 16)
check("data id", wav.toString("ascii", 36, 40), "data")
check("data size", view.getUint32(40, true), samples.length * 2)
check("sample 0.5", view.getInt16(44 + 104 * 2, true), 16384)
check("sample 1.0", view.getInt16(44 + 100 * 2, true), 32767)
// Symmetric mapping: sample * 32767 with clamping, so -1.0 rounds to -32767
// (not -32768). Full-scale positive is 32767; negative side is symmetric.
check("sample -1.0", view.getInt16(44 + 101 * 2, true), -32767)
check("clamped 2.0", view.getInt16(44 + 102 * 2, true), 32767)
check("clamped -2.0", view.getInt16(44 + 103 * 2, true), -32767)

if (failures.length > 0) {
  console.error("WAV verification FAILED:\n" + failures.join("\n"))
  process.exit(1)
}
console.log(`WAV OK: ${wav.length} bytes, ${samples.length} samples @ ${sampleRate}Hz, 16-bit mono PCM`)
