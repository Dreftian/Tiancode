import { expect, test } from "bun:test"
import { chromeLink } from "./chrome"

test("only web URLs can be passed to Chrome as a URL argument", () => {
  expect(chromeLink("https://example.com/a?q=hello world")).toBe("https://example.com/a?q=hello%20world")
  expect(chromeLink("http://localhost:5173/")).toBe("http://localhost:5173/")
  for (const value of [
    "--remote-debugging-port=9222",
    "file:///C:/secrets",
    "javascript:alert(1)",
    "mailto:test@example.com",
  ]) {
    expect(chromeLink(value)).toBeUndefined()
  }
})
