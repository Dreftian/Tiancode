import { describe, expect, test } from "bun:test"
import { splitChunks } from "./auto-speak"

describe("auto-speak splitChunks", () => {
  test("divide por oraciones y saltos de línea", () => {
    expect(splitChunks("Hola mundo. Esto es una prueba!\nSegunda línea? Sí…")).toEqual([
      "Hola mundo.",
      "Esto es una prueba!",
      "Segunda línea?",
      "Sí…",
    ])
  })

  test("ignora espacios y tramos vacíos", () => {
    expect(splitChunks("   \n  ")).toEqual([])
    expect(splitChunks("Solo una frase.")).toEqual(["Solo una frase."])
  })
})
