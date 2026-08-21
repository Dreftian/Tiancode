import { describe, expect, test } from "bun:test"
import { concatChunks } from "./asr-utils"

describe("asr concatChunks", () => {
  test("concatena chunks PCM en el orden recibido", () => {
    const { samples, tooShort } = concatChunks([new Float32Array([1, 2, 3]), new Float32Array([4, 5])])
    expect(Array.from(samples)).toEqual([1, 2, 3, 4, 5])
    expect(tooShort).toBe(true)
  })

  test("clips >= 0.5s (8000 muestras a 16kHz) no se marcan como cortos", () => {
    const { samples, tooShort } = concatChunks([new Float32Array(8000)])
    expect(samples.length).toBe(8000)
    expect(tooShort).toBe(false)
  })

  test("lista vacía produce muestras vacías y marca clip corto", () => {
    const { samples, tooShort } = concatChunks([])
    expect(samples.length).toBe(0)
    expect(tooShort).toBe(true)
  })

  test("los chunks de entrada no se mutan", () => {
    const first = new Float32Array([9, 9])
    concatChunks([first, new Float32Array([1])])
    expect(Array.from(first)).toEqual([9, 9])
  })
})
