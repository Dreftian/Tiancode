import { describe, expect, test } from "bun:test"
import { PIPER_VOICES } from "./piper-catalog"

// El catálogo se recortó a voces femeninas en español verificadas. Las entradas
// retiradas eran modelos masculinos ("ald", "miro", "davefx"), sin cadena de
// licencia ("glados") o con nombre femenino inventado ("carlfm").
const EXPECTED_IDS = [
  "piper-es_AR-daniela-high",
  "piper-es_ES-sharvard-medium",
  "piper-es_MX-claude-high",
  "piper-es_ES-mls_9972-low",
  "piper-es_ES-mls_10246-low",
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

  test("ids are unique", () => {
    expect(new Set(PIPER_VOICES.map((voice) => voice.id)).size).toBe(PIPER_VOICES.length)
  })
})
