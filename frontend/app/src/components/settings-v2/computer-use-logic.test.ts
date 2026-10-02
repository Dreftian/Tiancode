import { describe, expect, test } from "bun:test"
import { browserExceptions, permissionRules, resolveRule, toExecutable, toOrigin } from "./computer-use-logic"

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
    const rules = permissionRules({
      browser: { "*": "ask", "https://a.com": "allow", "https://b.com": "ask", "https://c.com": "deny" },
    })
    expect(resolveRule(rules, "browser")).toBe("ask")
    expect(browserExceptions(rules)).toEqual([
      { site: "https://a.com", action: "allow" },
      { site: "https://c.com", action: "deny" },
    ])
    expect(resolveRule(permissionRules({ browser: "deny" }), "browser", "https://x.com")).toBe("deny")
    expect(resolveRule(permissionRules(undefined), "browser")).toBeUndefined()
  })

  test("a single action or a later `*` applies to every key, as on the backend", () => {
    expect(resolveRule(permissionRules("allow"), "screenshot")).toBe("allow")
    expect(resolveRule(permissionRules({ screenshot: "ask", "*": "allow" }), "screenshot")).toBe("allow")
    expect(resolveRule(permissionRules({ "*": "allow", screenshot: "ask" }), "screenshot")).toBe("ask")
    // A top-level `*` after the browser map overrides its site rules too.
    const rules = permissionRules({ browser: { "https://evil.com": "deny" }, "*": "allow" })
    expect(resolveRule(rules, "browser", "https://evil.com")).toBe("allow")
    expect(browserExceptions(rules)).toEqual([])
  })
})
