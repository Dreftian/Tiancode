import { describe, expect, test } from "bun:test"
import { dict as enDict } from "@tiancode-ai/ui/i18n/en"
import { dict as esDict } from "@tiancode-ai/ui/i18n/es"
import { toolDisplay } from "./tool-display"

const en: Record<string, string> = enDict
const es: Record<string, string> = esDict

const t = (key: string) => es[key] ?? `missing:${key}`

describe("toolDisplay", () => {
  test("names the Sandbox tools instead of showing their identifiers", () => {
    expect(toolDisplay("preview_inspect", {}, t)).toEqual({ title: "Inspeccionar página", subtitle: undefined, known: true })
    expect(toolDisplay("preview_restart", undefined, t).title).toBe("Reiniciar vista previa")
    expect(toolDisplay("preview_interact", { action: "navigate", url: "/iPhone18?v=2" }, t)).toEqual({
      title: "Abrir en la vista previa",
      subtitle: "/iPhone18?v=2",
      known: true,
    })
    expect(toolDisplay("preview_inspect", { surface: "browser" }, t).subtitle).toBe("Navegador")
  })

  test("never shows text the agent types, which may be a password", () => {
    const fill = toolDisplay("preview_interact", { action: "fill", target: "e12", value: "hunter2" }, t)
    const typed = toolDisplay("computer", { action: "type", text: "hunter2" }, t)
    expect(JSON.stringify([fill, typed])).not.toContain("hunter2")
    expect(fill.subtitle).toBe("e12")
  })

  test("MCP and plugin tools get a readable fallback and keep their arguments", () => {
    expect(toolDisplay("github_create_issue", { title: "Bug" }, t)).toEqual({ title: "Github create issue", known: false })
  })

  test("every key the helper can use exists in English and Spanish", () => {
    const used = new Set<string>()
    const record = (key: string) => (used.add(key), key)
    for (const tool of ["preview_start", "preview_restart", "preview_stop", "preview_status", "preview_logs", "preview_inspect", "screenshot", "plan_exit", "execute", "codegraph", "skill_create", "session_search", "delete", "lsp", "read", "edit", "bash"])
      toolDisplay(tool, { surface: "browser" }, record)
    for (const action of ["click", "fill", "select", "press", "scroll", "navigate", "other"]) toolDisplay("preview_interact", { action }, record)
    for (const action of ["move", "click", "type", "key", "scroll", "cursor_position", "foreground_window", "other"]) toolDisplay("computer", { action }, record)
    for (const action of ["read", "write"]) toolDisplay("clipboard", { action }, record)
    for (const action of ["save", "recall"]) toolDisplay("memory", { action }, record)
    expect([...used].filter((key) => !en[key] || !es[key])).toEqual([])
  })
})
