import { afterEach, describe, expect, test } from "bun:test"
import {
  DESIGN_EXIT_MESSAGE,
  DESIGN_PICKER_EXIT_SCRIPT,
  DESIGN_PICKER_SCRIPT,
  elementPrompt,
  parsePickedElement,
  type PickedElement,
} from "./element-context"

const labels = {
  intro: "Element selected in the preview:",
  page: "Page",
  selector: "Selector",
  text: "Text",
  size: "Size",
  styles: "Styles",
}

const picked: PickedElement = {
  tag: "img",
  id: "",
  classes: "",
  selector: "main > img",
  text: "",
  html: `<img src="a.png">`,
  styles: "",
  margin: "0px 0px 0px 0px",
  padding: "0px 0px 0px 0px",
  url: "http://localhost:5173/",
  rect: { x: 0, y: 0, width: 120.4, height: 80.6 },
  viewport: { width: 800, height: 600 },
}

const run = (script: string): unknown => (0, eval)(script)

afterEach(() => {
  run(DESIGN_PICKER_EXIT_SCRIPT)
})

describe("design picker script", () => {
  test("installs once and leaves the page clean on exit", () => {
    expect(run(DESIGN_PICKER_SCRIPT)).toBe("ok")
    expect(run(DESIGN_PICKER_SCRIPT)).toBe("active")
    expect(document.querySelectorAll("[data-tiancode-design]").length).toBe(2)
    run(DESIGN_PICKER_EXIT_SCRIPT)
    expect(document.querySelectorAll("[data-tiancode-design]").length).toBe(0)
    expect(run(DESIGN_PICKER_SCRIPT)).toBe("ok")
  })

  test("Escape ends design mode and tells the host", async () => {
    const messages: unknown[] = []
    const listen = (event: MessageEvent) => messages.push(event.data)
    window.addEventListener("message", listen)
    run(DESIGN_PICKER_SCRIPT)
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }))
    await new Promise((resolve) => setTimeout(resolve, 20))
    window.removeEventListener("message", listen)
    expect(messages).toContainEqual({ type: DESIGN_EXIT_MESSAGE })
    expect(document.querySelectorAll("[data-tiancode-design]").length).toBe(0)
  })

  test("leaves page elements with the maximum z-index alone", () => {
    document.body.innerHTML = `<div id="toast" style="position:fixed;z-index:2147483647">hi</div>`
    run(DESIGN_PICKER_SCRIPT)
    run(DESIGN_PICKER_EXIT_SCRIPT)
    expect(document.getElementById("toast")).not.toBeNull()
  })
})

describe("parsePickedElement", () => {
  test("accepts the picker's shape", () => {
    expect(parsePickedElement(picked)).toEqual(picked)
  })

  test("rejects missing or mistyped fields", () => {
    expect(parsePickedElement({ ...picked, selector: 4 })).toBeUndefined()
    expect(parsePickedElement({ ...picked, rect: { x: 0, y: 0, width: "1", height: 1 } })).toBeUndefined()
    expect(parsePickedElement(null)).toBeUndefined()
  })

  test("caps what a page can push into the chat", () => {
    const result = parsePickedElement({ ...picked, html: "x".repeat(10_000), url: "u".repeat(5000) })
    expect(result?.html.length).toBe(1201)
    expect(result?.url.length).toBe(2000)
  })
})

describe("elementPrompt", () => {
  test("lists only the fields the element has", () => {
    expect(elementPrompt(picked, labels)).toBe(
      [
        "Element selected in the preview:",
        "",
        "- Page: http://localhost:5173/",
        "- Selector: `main > img`",
        "- Size: 120 × 81 px",
        "",
        "```html",
        `<img src="a.png">`,
        "```",
        "",
      ].join("\n"),
    )
  })

  test("includes text and styles when present", () => {
    const text = elementPrompt({ ...picked, text: "Buy now", styles: "color: red" }, labels)
    expect(text).toContain(`- Text: "Buy now"`)
    expect(text).toContain("- Styles: color: red")
  })
})
