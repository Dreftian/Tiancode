import { describe, expect, test } from "bun:test"
import { buildPreviewAgentScript } from "./preview-agent-script"

describe("buildPreviewAgentScript", () => {
  test("every action produces a single self-contained async expression", () => {
    const actions = ["inspect", "click", "fill", "press", "select", "scroll", "navigate"] as const
    for (const type of actions) {
      const code = buildPreviewAgentScript({ type, target: "e1", value: "x", url: "/a" })
      expect(code.startsWith("(async () => {")).toBe(true)
      expect(code.trimEnd().endsWith("})()")).toBe(true)
      // The runtime helpers have to travel with the action: the script is evaluated in the
      // preview page, which knows nothing about us.
      expect(code).toContain("const resolve = (target)")
      expect(code).toContain("const snapshot = (note, root)")
    }
  })

  test("values reach the page as literals, so quotes and newlines cannot break out", () => {
    const code = buildPreviewAgentScript({ type: "fill", target: 'input[name="q"]', value: 'a"); alert(1);//' })
    expect(code).toContain(JSON.stringify('input[name="q"]'))
    expect(code).toContain(JSON.stringify('a"); alert(1);//'))
  })

  test("missing optional fields fall back instead of emitting undefined", () => {
    const press = buildPreviewAgentScript({ type: "press" })
    expect(press).toContain('"Enter"')
    const scroll = buildPreviewAgentScript({ type: "scroll" })
    expect(scroll).toContain('"down"')
    expect(press).not.toContain("undefined")
  })

  test("navigation stays inside the previewed app", () => {
    const code = buildPreviewAgentScript({ type: "navigate", url: "https://example.com" })
    expect(code).toContain("resolved.origin !== location.origin")
  })

  test("refs are assigned once per element and never fall back to a text search", () => {
    const code = buildPreviewAgentScript({ type: "click", target: "e12" })
    // One id per element for the page's lifetime, so e12 is the same button in the next report.
    expect(code).toContain("store.ids.get(node)")
    expect(code).not.toContain("store.refs = new Map()")
    // A ref that is gone is reported as stale instead of matching the text "e12" somewhere.
    expect(code.indexOf("if (isRef(target))")).toBeLessThan(code.indexOf("document.querySelector(target)"))
    expect(code).toContain("missing(")
  })

  test("the report reaches shadow DOM and refuses to click covered elements", () => {
    const code = buildPreviewAgentScript({ type: "click", target: "e1" })
    expect(code).toContain("host.shadowRoot")
    expect(code).toContain('spot.where.indexOf("tapado") === 0')
    expect(code).toContain("pointerdown")
  })
})
