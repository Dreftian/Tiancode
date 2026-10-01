import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { COMPUTER_USE_SECTIONS } from "./computer-use"
import { INTELLIGENCE_SECTIONS } from "./intelligence"
import { SETTINGS_PAGES, SETTINGS_ROWS } from "./search-catalog"

// The tabs the settings dialog renders, read from its panels so a removed page fails here.
const panels = new Set(
  Array.from(
    readFileSync(join(import.meta.dir, "dialog-settings-v2.tsx"), "utf8").matchAll(/TabsV2\.Content forceMount value="([^"]+)"/g),
    (match) => match[1],
  ),
)
const entries = [...SETTINGS_PAGES, ...SETTINGS_ROWS]

describe("settings search catalog", () => {
  test("every entry opens a tab the dialog has", () => {
    expect(panels.size).toBeGreaterThan(10)
    expect(entries.filter((entry) => !panels.has(entry.tab)).map((entry) => entry.label)).toEqual([])
  })

  test("Servidores, Proyectos and Worktrees live in Servidor, and GitHub in Conexiones", () => {
    for (const old of ["servers", "projects", "worktrees", "github"]) expect(panels.has(old)).toBe(false)
    const server = entries.filter((entry) => entry.tab === "server").map((entry) => entry.section)
    expect(server).toEqual(expect.arrayContaining(["servers", "projects", "worktrees"]))
    expect(entries.some((entry) => entry.tab === "connections" && entry.section === "github")).toBe(true)
  })

  test("Escritorio, Navegador and Acceso remoto are sections of Uso de la PC", () => {
    expect(panels.has("pairing")).toBe(false)
    expect(panels.has("experimental")).toBe(false)
    const computerUse = entries.filter((entry) => entry.tab === "computer-use")
    expect(computerUse.filter((entry) => entry.section && !COMPUTER_USE_SECTIONS.includes(entry.section as never))).toEqual([])
    expect(computerUse.filter((entry) => entry.section === "remote").length).toBeGreaterThan(1)
    expect(computerUse.filter((entry) => entry.section === "browser").length).toBeGreaterThan(1)
    // Rows name their section so the result line reads "Uso de la PC › Acceso remoto".
    expect(computerUse.filter((entry) => entry.target && !entry.context)).toEqual([])
  })

  test("Inteligencia rows point at its tiles", () => {
    const intelligence = entries.filter((entry) => entry.tab === "intelligence" && entry.section)
    expect(intelligence.filter((entry) => !INTELLIGENCE_SECTIONS.includes(entry.section as never))).toEqual([])
    expect(intelligence.some((entry) => entry.section === "decisions")).toBe(true)
  })
})
