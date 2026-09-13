import { describe, expect, test } from "bun:test"
import { PIPER_VOICES } from "./piper-catalog"

// El catálogo se recortó a voces femeninas en español verificadas. Las entradas
// retiradas eran modelos masculinos ("ald", "miro", "davefx"), sin cadena de
// licencia ("glados") o con nombre femenino inventado ("carlfm"). "mls_10246"
// salió por duplicar a "mls_9972": mismo tier de 16 kHz y misma medida de
// calidad, así que ocupaba un hueco sin añadir nada.
const EXPECTED_IDS = [
  "piper-es_AR-daniela-high",
  "piper-es_ES-sharvard-medium",
  "piper-es_MX-claude-high",
  "piper-es_ES-mls_9972-low",
  "mimic3-es-m_ailabs-karen_savage",
]

describe("piper catalogue", () => {
  test("ships exactly the five verified Spanish voices", () => {
    expect(PIPER_VOICES.length).toBe(5)
    expect(PIPER_VOICES.map((voice) => voice.id).sort()).toEqual([...EXPECTED_IDS].sort())
  })

  test("every voice is Spanish and female", () => {
    for (const voice of PIPER_VOICES) {
      expect(voice.language.startsWith("es")).toBe(true)
      expect(voice.gender).toBe("female")
    }
  })

  test("sharvard keeps the female speaker index of its two-speaker model", () => {
    expect(PIPER_VOICES.find((voice) => voice.id === "piper-es_ES-sharvard-medium")?.sid).toBe(1)
  })

  // El modelo mimic3 trae tux=0, victor_villarraza=1 y karen_savage=2: si el
  // índice se pierde, el catálogo vuelve a publicar un hombre como voz femenina.
  test("the mimic3 m-ailabs voice points at karen_savage, not at the two male speakers", () => {
    const karen = PIPER_VOICES.find((voice) => voice.id === "mimic3-es-m_ailabs-karen_savage")
    expect(karen?.sid).toBe(2)
    expect(karen?.repo).toBe("csukuangfj/vits-mimic3-es_ES-m-ailabs_low")
    expect(karen?.modelFile).toBe("es_ES-m-ailabs_low.onnx")
  })

  // Un modelo multihablante sin sid sintetiza el hablante 0, que en los dos que
  // hay en el catálogo es masculino.
  test("multi-speaker entries always declare their speaker index", () => {
    for (const voice of PIPER_VOICES) {
      if (voice.sid !== undefined) expect(voice.sid).toBeGreaterThan(0)
    }
  })

  // Un único 16 kHz es el suelo aceptado: el usuario pidió voces suaves y ese
  // tier es el que suena apagado.
  test("at most one voice is below 22 kHz", () => {
    expect(PIPER_VOICES.filter((voice) => voice.sampleRate < 22050).length).toBeLessThanOrEqual(1)
  })

  test("ids are unique", () => {
    expect(new Set(PIPER_VOICES.map((voice) => voice.id)).size).toBe(PIPER_VOICES.length)
  })
})
