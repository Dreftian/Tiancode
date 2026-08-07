// Helpers puros del reconocimiento de voz (sin dependencias de Electron) para
// poder testearlos con bun test.

// Concatena los chunks PCM de 16 kHz y detecta clips demasiado cortos
// (<0.5s ≈ 8000 muestras) donde no hay voz detectable.
export function concatChunks(chunks: Float32Array[]): { samples: Float32Array; tooShort: boolean } {
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0)
  const samples = new Float32Array(total)
  let offset = 0
  for (const chunk of chunks) {
    samples.set(chunk, offset)
    offset += chunk.length
  }
  return { samples, tooShort: total < 8000 }
}
