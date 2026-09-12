import { describe, expect, test } from "bun:test"
import { petKinds } from "@/context/settings"
import { PET_GLYPHS } from "./pets-catalogue"

describe("PET_GLYPHS", () => {
  test("cubre exactamente los petKinds declarados", () => {
    // El mapa es una copia de desktop-pet.ts que no se puede importar (app no depende de desktop),
    // así que esta es la única red que avisa cuando se añade o se quita una mascota.
    expect(Object.keys(PET_GLYPHS).sort()).toEqual([...petKinds].sort())
  })

  test("ningún glifo queda vacío", () => {
    for (const glyph of Object.values(PET_GLYPHS)) expect(glyph.trim().length).toBeGreaterThan(0)
  })
})
