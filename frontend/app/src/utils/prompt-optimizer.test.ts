import { describe, expect, test } from "bun:test"
import { enhancePromptText, normalizeSpellingAndTerms } from "./prompt-optimizer"

describe("prompt-optimizer", () => {
  test("corrects spelling mistakes and typos in Spanish", () => {
    const raw = "arregla el microfono y el inpurt para que funsione bien y axcrtualizar el portavle"
    const result = enhancePromptText(raw, true)

    expect(result).toContain("micrófono")
    expect(result).toContain("input")
    expect(result).toContain("funcione")
    expect(result).toContain("actualizar")
    expect(result).toContain("portable")
  })

  test("handles the user prompt scenario with multiple typos", () => {
    const raw = "Verifica que el microfono, mejorar input y x2 funcionene correctamente, detecta los microfonos de la pc y mejorar inpurt o prompt"
    const result = enhancePromptText(raw, true)

    expect(result).toContain("micrófono")
    expect(result).toContain("micrófonos")
    expect(result).toContain("funcionen")
    expect(result).toContain("input")
    expect(result).toContain("🎯 Objetivo Principal")
  })

  test("detects debugging intent and formats resolution directives", () => {
    const raw = "corrige el error en main.py donde la coneccion falla"
    const result = enhancePromptText(raw, true)

    expect(result).toContain("🐛 Diagnóstico y Corrección de Error")
    expect(result).toContain("conexión")
    expect(result).toContain("main.py")
  })

  test("detects refactoring intent properly", () => {
    const raw = "optimiza el rendimiento y desacopla la logica en audio.ts"
    const result = enhancePromptText(raw, true)

    expect(result).toContain("♻️ Plan de Refactorización y Optimización")
    expect(result).toContain("audio.ts")
  })

  test("structures generic feature requests with clean directives instead of rigid boilerplate", () => {
    const raw = "agrega soporte para exportar reporte en formato json"
    const result = enhancePromptText(raw, true)

    expect(result).toContain("🎯 Objetivo Principal")
    expect(result).toContain("📋 Requerimientos y Directivas Clave")
    expect(result).not.toContain("1. **Modelado & Tipos:**")
  })

  test("normalizes repeated characters and abbreviations", () => {
    const raw = "quee xfa se haga tb el build rapido"
    const normalized = normalizeSpellingAndTerms(raw)

    expect(normalized).toContain("que")
    expect(normalized).toContain("por favor")
    expect(normalized).toContain("también")
    expect(normalized).toContain("rápido")
  })

  test("supports English intent and terms", () => {
    const raw = "fix the bug in server.ts where the inpurt is undefined"
    const result = enhancePromptText(raw, false)

    expect(result).toContain("🐛 Bug Diagnosis & Resolution")
    expect(result).toContain("input")
    expect(result).toContain("server.ts")
  })
})
