// Encodes Float32 PCM samples (-1..1) as a 16-bit mono WAV buffer.
export function float32ToWav(samples: Float32Array, sampleRate = 24000) {
  const buffer = Buffer.alloc(44 + samples.length * 2)
  buffer.write("RIFF", 0, "ascii")
  buffer.writeUInt32LE(36 + samples.length * 2, 4)
  buffer.write("WAVE", 8, "ascii")
  buffer.write("fmt ", 12, "ascii")
  buffer.writeUInt32LE(16, 16) // fmt chunk size
  buffer.writeUInt16LE(1, 20) // PCM
  buffer.writeUInt16LE(1, 22) // mono
  buffer.writeUInt32LE(sampleRate, 24)
  buffer.writeUInt32LE(sampleRate * 2, 28) // byte rate
  buffer.writeUInt16LE(2, 32) // block align
  buffer.writeUInt16LE(16, 34) // bits per sample
  buffer.write("data", 36, "ascii")
  buffer.writeUInt32LE(samples.length * 2, 40)
  let offset = 44
  for (let i = 0; i < samples.length; i++) {
    const sample = Math.max(-1, Math.min(1, samples[i]))
    buffer.writeInt16LE(Math.round(sample * 32767), offset)
    offset += 2
  }
  return buffer
}
