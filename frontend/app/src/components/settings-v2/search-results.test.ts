import { describe, expect, test } from "bun:test"
import { normalizeSearch, rankSettings, type SettingsSearchItem } from "./search-results"

const item = (title: string, keywords: string[], extra: Partial<SettingsSearchItem> = {}): SettingsSearchItem => ({
  tab: "general",
  label: title,
  title,
  keywords,
  secondary: "General",
  ...extra,
})

const items = [
  item("Idioma", ["language", "español"], { target: "settings-language" }),
  item("Tema", ["theme", "oscuro", "dark"], { target: "settings-theme", section: "appearance", secondary: "Apariencia" }),
  item("Notificaciones", ["sonidos"], { tab: "notifications" }),
  item("Agente", ["notificación"], { tab: "notifications", target: "settings-notifications-agent", secondary: "Notificaciones del sistema" }),
  item("Vista previa", ["preview", "escritorio"], { target: "settings-preview-on-finish" }),
]

describe("settings search ranking", () => {
  test("normalizes accents and case", () => {
    expect(normalizeSearch("  Configuración ÁÉ ")).toBe("configuracion ae")
  })

  test("exact and prefix title matches come first", () => {
    expect(rankSettings("tema", items).results[0]?.title).toBe("Tema")
    expect(rankSettings("idio", items).results[0]?.title).toBe("Idioma")
  })

  test("matches start of words only, so tema does not find sistema", () => {
    expect(rankSettings("tema", items).results.map((r) => r.title)).toEqual(["Tema"])
  })

  test("keywords find rows in either language", () => {
    expect(rankSettings("dark", items).results.map((r) => r.title)).toEqual(["Tema"])
    expect(rankSettings("language", items).results.map((r) => r.title)).toEqual(["Idioma"])
  })

  test("the page/section line counts, with a lower score", () => {
    const ranked = rankSettings("notificaciones", items).results
    expect(ranked[0]?.title).toBe("Notificaciones")
    expect(ranked.map((r) => r.title)).toContain("Agente")
  })

  test("pages sort before rows at the same score and empty queries return nothing", () => {
    expect(rankSettings("   ", items)).toEqual({ results: [], truncated: false })
    const many = Array.from({ length: 70 }, (_, index) => item(`Fila ${index}`, ["comun"]))
    const ranked = rankSettings("comun", many)
    expect(ranked.results.length).toBe(60)
    expect(ranked.truncated).toBe(true)
  })
})
