import { describe, expect, test } from "bun:test"
import { probeRuntime } from "./runtime-install-utils"

describe("runtime probeRuntime", () => {
  test("devuelve true cuando el runtime responde ok", async () => {
    const fetchFn = async () => new Response("ok", { status: 200 })
    expect(await probeRuntime("http://localhost:11434/api/version", fetchFn)).toBe(true)
  })

  test("devuelve false con respuesta no-ok", async () => {
    const fetchFn = async () => new Response("error", { status: 500 })
    expect(await probeRuntime("http://localhost:1234/v1/models", fetchFn)).toBe(false)
  })

  test("devuelve false cuando el runtime no responde (throw)", async () => {
    const fetchFn = async () => {
      throw new Error("connection refused")
    }
    expect(await probeRuntime("http://localhost:11434/api/version", fetchFn)).toBe(false)
  })

  test("devuelve false cuando el fetch no es una función", async () => {
    const fetchFn = undefined as unknown as typeof fetch
    expect(await probeRuntime("http://localhost:11434/api/version", fetchFn)).toBe(false)
  })
})
