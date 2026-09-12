// Helpers puros del reconocimiento de voz (sin dependencias de Electron) para
// poder testearlos con bun test.

/** Por debajo de este RMS el clip es silencio a efectos prácticos. */
const SILENCE_RMS = 0.002

// Concatena los chunks PCM de 16 kHz y decide si vale la pena decodificarlo.
// Dos motivos para no hacerlo: clips demasiado cortos (<0,5 s ≈ 8000 muestras) y
// clips en silencio. El segundo importa porque Whisper NO devuelve cadena vacía
// ante silencio: alucina una anotación del tipo "[Música]" y, sin esta guarda,
// eso acababa escrito en el chat del usuario como si lo hubiera dictado.
export function concatChunks(chunks: Float32Array[]): {
  samples: Float32Array
  tooShort: boolean
  silent: boolean
} {
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0)
  const samples = new Float32Array(total)
  let offset = 0
  for (const chunk of chunks) {
    samples.set(chunk, offset)
    offset += chunk.length
  }
  let sum = 0
  for (const sample of samples) sum += sample * sample
  const rms = total > 0 ? Math.sqrt(sum / total) : 0
  return { samples, tooShort: total < 8000, silent: rms < SILENCE_RMS }
}

// Anotaciones de sonido no verbal que Whisper emite entre corchetes o paréntesis
// ("[Música]", "(music)", "[BLANK_AUDIO]"). Si eso es TODO lo que devolvió, no se
// dijo nada: no es una transcripción, es el modelo describiendo la pista.
const NON_SPEECH = /^[\s]*[[(][^\])]*[\])][\s]*$/

export function isNonSpeechTranscript(text: string): boolean {
  const trimmed = text.trim()
  return trimmed.length === 0 || NON_SPEECH.test(trimmed)
}
