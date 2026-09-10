import { describe, expect, test, mock, afterEach } from "bun:test"
import { syncIntelligenceConfig } from "./intelligence-config"

const SWITCHES = { userMemory: true, projectMemory: false, guardrails: true }
const originalFetch = globalThis.fetch

afterEach(() => {
  globalThis.fetch = originalFetch
})

describe("syncIntelligenceConfig", () => {
  test("does nothing without a server url", async () => {
    const fetchMock = mock(async () => new Response("{}"))
    globalThis.fetch = fetchMock as never
    expect(await syncIntelligenceConfig(undefined, SWITCHES)).toBe(false)
    expect(await syncIntelligenceConfig({}, SWITCHES)).toBe(false)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  test("preserves the rest of the config instead of replacing it", async () => {
    // PATCH replaces the document, so an update that sent only our block would silently
    // drop every other setting the user has.
    let patched: Record<string, unknown> | undefined
    globalThis.fetch = mock(async (url: string, init?: RequestInit) => {
      if (init?.method === "PATCH") {
        patched = JSON.parse(String(init.body))
        return new Response("{}", { status: 200 })
      }
      return new Response(
        JSON.stringify({
          theme: "dark",
          experimental: { policies: [{ action: "read" }] },
        }),
      )
    }) as never

    expect(await syncIntelligenceConfig({ url: "http://localhost:4096" }, SWITCHES)).toBe(true)
    expect(patched?.theme).toBe("dark")
    expect((patched?.experimental as Record<string, unknown>).policies).toEqual([{ action: "read" }])
    expect((patched?.experimental as Record<string, unknown>).intelligence).toEqual(SWITCHES)
  })

  test("strips a trailing slash from the server url", async () => {
    const seen: string[] = []
    globalThis.fetch = mock(async (url: string, init?: RequestInit) => {
      seen.push(url)
      return init?.method === "PATCH" ? new Response("{}") : new Response("{}")
    }) as never

    await syncIntelligenceConfig({ url: "http://localhost:4096/" }, SWITCHES)
    expect(seen.every((u) => u === "http://localhost:4096/global/config")).toBe(true)
  })

  test("sends basic auth only when a password is configured", async () => {
    const headers: (HeadersInit | undefined)[] = []
    globalThis.fetch = mock(async (_url: string, init?: RequestInit) => {
      headers.push(init?.headers)
      return new Response("{}")
    }) as never

    await syncIntelligenceConfig({ url: "http://x" }, SWITCHES)
    expect((headers[0] as Record<string, string>).Authorization).toBeUndefined()

    headers.length = 0
    await syncIntelligenceConfig({ url: "http://x", username: "u", password: "p" }, SWITCHES)
    expect((headers[0] as Record<string, string>).Authorization).toStartWith("Basic ")
  })

  test("reports failure without throwing when the server is unreachable", async () => {
    globalThis.fetch = mock(async () => {
      throw new Error("ECONNREFUSED")
    }) as never
    // A toggle must never break because the server happens to be down.
    expect(await syncIntelligenceConfig({ url: "http://x" }, SWITCHES)).toBe(false)
  })

  test("reports failure when the read succeeds but the write is rejected", async () => {
    globalThis.fetch = mock(async (_url: string, init?: RequestInit) =>
      init?.method === "PATCH" ? new Response("nope", { status: 400 }) : new Response("{}"),
    ) as never
    expect(await syncIntelligenceConfig({ url: "http://x" }, SWITCHES)).toBe(false)
  })
})
