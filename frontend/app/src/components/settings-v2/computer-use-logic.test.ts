import { describe, expect, test } from "bun:test"
import { browserExceptions, browserRules, effectiveBrowserAction, toExecutable, toOrigin } from "./computer-use-logic"

describe("computer use logic", () => {
  test("a bare local host is http, anything else https", () => {
    expect(toOrigin("localhost:3000/app")).toBe("http://localhost:3000")
    expect(toOrigin("127.0.0.1:8080")).toBe("http://127.0.0.1:8080")
    expect(toOrigin("github.com/foo")).toBe("https://github.com")
    expect(toOrigin("http://example.com")).toBe("http://example.com")
    expect(toOrigin("   ")).toBeUndefined()
  })

  test("executables need an extension and compare in lower case", () => {
    expect(toExecutable("C:/Program Files/App/Steam.EXE")).toBe("steam.exe")
    expect(toExecutable("steam")).toBeUndefined()
  })

  test("only sites whose rule differs from the default are exceptions; the last rule wins", () => {
    const rules = browserRules({ "*": "ask", "https://a.com": "allow", "https://b.com": "ask", "https://c.com": "deny" })
    expect(effectiveBrowserAction(rules, "*")).toBe("ask")
    expect(browserExceptions(rules)).toEqual([
      { site: "https://a.com", action: "allow" },
      { site: "https://c.com", action: "deny" },
    ])
    expect(browserRules("deny")).toEqual([["*", "deny"]])
    expect(effectiveBrowserAction(browserRules(undefined), "https://x.com")).toBe("allow")
  })
})
