import { describe, expect, test } from "bun:test"
import {
  enhancePromptText,
  normalizeSpellingAndTerms,
  resolveModelFamily,
  detectIntent,
} from "./prompt-optimizer"

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

  test("preserves protected tokens (code, URLs, variables)", () => {
    const raw = "actualiza https://api.tiancode.ai/v1/auth y el helper `getUserSession()` con {{authToken}}"
    const result = enhancePromptText(raw, true)

    expect(result).toContain("https://api.tiancode.ai/v1/auth")
    expect(result).toContain("`getUserSession()`")
    expect(result).toContain("{{authToken}}")
  })

  test("adapts output for Claude model family with XML tags", () => {
    const raw = "agrega un boton de exportar pdf en report.tsx"
    const result = enhancePromptText(raw, true, { modelFamily: "claude" })

    expect(result).toContain("<context>")
    expect(result).toContain("<instructions>")
    expect(result).toContain("<constraints>")
    expect(result).toContain("<verification>")
    expect(result).toContain("report.tsx")
    expect(result).toContain("Alcance mínimo")
  })

  test("adapts output for OpenAI model family with outcome-driven sections", () => {
    const raw = "create a redis cache client in cache.ts"
    const result = enhancePromptText(raw, false, { modelFamily: "openai" })

    expect(result).toContain("## 🎯 Primary Goal")
    expect(result).toContain("## 📋 Acceptance Criteria")
    expect(result).toContain("## 🛡️ Invariants & Constraints")
    expect(result).toContain("## 🧪 Verification Bar")
    expect(result).toContain("cache.ts")
  })

  test("adapts output for Gemini model family with direct headings", () => {
    const raw = "implementa la busqueda semantica en search.ts"
    const result = enhancePromptText(raw, true, { modelFamily: "gemini" })

    expect(result).toContain("### 🎯 Objetivo")
    expect(result).toContain("### 📋 Directivas de Implementación")
    expect(result).toContain("### 🛡️ Restricciones")
    expect(result).toContain("### 🧪 Verificación")
  })

  test("detects scripting and review intents", () => {
    expect(detectIntent("crea un script en bash para automatizar el deploy")).toBe("scripting")
    expect(detectIntent("revisa el codigo y audita la seguridad en auth.ts")).toBe("review")
  })

  test("resolves model family from names and providers accurately", () => {
    expect(resolveModelFamily("claude-3-7-sonnet")).toBe("claude")
    expect(resolveModelFamily("anthropic")).toBe("claude")
    expect(resolveModelFamily("gpt-4o")).toBe("openai")
    expect(resolveModelFamily("o3-mini")).toBe("openai")
    expect(resolveModelFamily("gemini-2.5-pro")).toBe("gemini")
    expect(resolveModelFamily("deepseek-chat")).toBe("deepseek")
    expect(resolveModelFamily("mistral")).toBe("generic")
  })
})
