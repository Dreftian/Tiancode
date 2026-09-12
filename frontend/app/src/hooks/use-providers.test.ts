import { describe, expect, test } from "bun:test"
import { applyPendingConnections, popularProviders } from "./use-providers"

describe("applyPendingConnections", () => {
  test("a provider the user just disconnected is gone before the catalogue refreshes", () => {
    const result = applyPendingConnections(["openai", "anthropic"], { anthropic: "disconnected" })
    expect([...result]).toEqual(["openai"])
  })

  test("a provider the user just connected is there before the catalogue refreshes", () => {
    const result = applyPendingConnections(["openai"], { anthropic: "connected" })
    expect(result.has("anthropic")).toBe(true)
    expect(result.has("openai")).toBe(true)
  })

  test("with nothing pending the server's answer passes through untouched", () => {
    const result = applyPendingConnections(["openai", "google"], {})
    expect([...result]).toEqual(["openai", "google"])
  })

  test("connecting something already connected is not a duplicate", () => {
    const result = applyPendingConnections(["openai"], { openai: "connected" })
    expect([...result]).toEqual(["openai"])
  })
})

describe("popularProviders", () => {
  test("no longer offers the local HTTP runtimes as connectable providers", () => {
    expect(popularProviders).not.toContain("ollama")
    expect(popularProviders).not.toContain("lmstudio")
  })

  test("still offers the built-in local engine and the hosted providers", () => {
    expect(popularProviders).toContain("local")
    expect(popularProviders).toContain("anthropic")
    expect(popularProviders).toContain("openai")
  })
})
