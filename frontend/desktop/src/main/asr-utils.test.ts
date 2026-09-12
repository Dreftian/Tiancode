import { describe, expect, test } from "bun:test"
import { concatChunks, isNonSpeechTranscript } from "./asr-utils"
import { MAX_CHUNKS, MAX_RECORDING_SECONDS } from "./asr-worker"

describe("asr concatChunks", () => {
  test("concatena chunks PCM en el orden recibido", () => {
    const { samples, tooShort } = concatChunks([new Float32Array([1, 2, 3]), new Float32Array([4, 5])])
    expect(Array.from(samples)).toEqual([1, 2, 3, 4, 5])
    expect(tooShort).toBe(true)
  })

  test("clips >= 0.5s (8000 muestras a 16kHz) no se marcan como cortos", () => {
    const { samples, tooShort, silent } = concatChunks([new Float32Array(8000)])
    expect(samples.length).toBe(8000)
    expect(tooShort).toBe(false)
    // Buffer de ceros: largo suficiente, pero sin señal.
    expect(silent).toBe(true)
  })

  // Whisper no devuelve cadena vacía ante silencio: alucina "[Música]". Sin esta
  // guarda ese texto acababa escrito en el chat como si el usuario lo hubiera dicho.
  test("detecta silencio aunque el clip sea largo", () => {
    const quiet = new Float32Array(16000).fill(0.0005)
    expect(concatChunks([quiet]).silent).toBe(true)
  })

  test("una señal audible no se marca como silencio", () => {
    const loud = Float32Array.from({ length: 16000 }, (_, i) => Math.sin(i / 8) * 0.3)
    const { tooShort, silent } = concatChunks([loud])
    expect(tooShort).toBe(false)
    expect(silent).toBe(false)
  })

  test("lista vacía produce muestras vacías y marca clip corto", () => {
    const { samples, tooShort, silent } = concatChunks([])
    expect(samples.length).toBe(0)
    expect(tooShort).toBe(true)
    expect(silent).toBe(true)
  })

  test("los chunks de entrada no se mutan", () => {
    const first = new Float32Array([9, 9])
    concatChunks([first, new Float32Array([1])])
    expect(Array.from(first)).toEqual([9, 9])
  })

  // El tope de grabación se le anuncia al usuario en segundos cuando se
  // alcanza, así que la constante del worker y esos segundos no pueden
  // divergir: 250 chunks de 4096 muestras a 16 kHz son exactamente 64 s.
  test("el tope de chunks equivale a los segundos que se reportan", () => {
    const chunks = Array.from({ length: MAX_CHUNKS }, () => new Float32Array(4096))
    const { samples, tooShort } = concatChunks(chunks)
    expect(tooShort).toBe(false)
    expect(samples.length).toBe(MAX_RECORDING_SECONDS * 16000)
    expect(MAX_RECORDING_SECONDS).toBe(64)
  })
})

describe("asr isNonSpeechTranscript", () => {
  // Comprobado ejecutando el reconocedor real contra 3 s de silencio: devuelve
  // "[Música]", no "".
  test("una anotación de sonido no verbal no es una transcripción", () => {
    for (const text of ["[Música]", " [Music] ", "(música)", "[BLANK_AUDIO]", "", "   "]) {
      expect(isNonSpeechTranscript(text)).toBe(true)
    }
  })

  test("texto real se conserva, incluso con paréntesis dentro", () => {
    for (const text of ["hola qué tal", "abre el archivo (el segundo) y corrígelo", "[Música] y luego dime algo"]) {
      expect(isNonSpeechTranscript(text)).toBe(false)
    }
  })
})
