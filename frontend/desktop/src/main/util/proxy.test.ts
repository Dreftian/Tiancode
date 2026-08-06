import { afterEach, describe, expect, test } from "bun:test"
import { ensureLoopbackNoProxy, useEnvProxy } from "./proxy"

// On Windows, NO_PROXY and no_proxy are the same case-insensitive variable.
const caseInsensitiveEnv = process.platform === "win32"

function saveEnv() {
  return { NO_PROXY: process.env.NO_PROXY, no_proxy: process.env.no_proxy }
}

function restoreEnv(saved: { NO_PROXY: string | undefined; no_proxy: string | undefined }) {
  if (saved.NO_PROXY === undefined) delete process.env.NO_PROXY
  else process.env.NO_PROXY = saved.NO_PROXY
  if (saved.no_proxy === undefined) delete process.env.no_proxy
  else process.env.no_proxy = saved.no_proxy
}

describe("ensureLoopbackNoProxy", () => {
  const env = saveEnv()
  afterEach(() => restoreEnv(env))

  test("adds missing loopback hosts to NO_PROXY", () => {
    process.env.NO_PROXY = "example.com"
    ensureLoopbackNoProxy()
    expect(process.env.NO_PROXY?.split(",").map((value) => value.trim())).toEqual(
      expect.arrayContaining(["example.com", "127.0.0.1", "localhost", "::1"]),
    )
  })

  test("adds missing loopback hosts to the lowercase variant when distinct", () => {
    if (caseInsensitiveEnv) return
    process.env.no_proxy = "example.com"
    ensureLoopbackNoProxy()
    expect(process.env.no_proxy?.split(",").map((value) => value.trim())).toEqual(
      expect.arrayContaining(["example.com", "127.0.0.1", "localhost", "::1"]),
    )
  })

  test("keeps existing loopback hosts without duplicating them", () => {
    process.env.NO_PROXY = "127.0.0.1,example.com"
    ensureLoopbackNoProxy()
    expect(process.env.NO_PROXY?.split(",").filter((value) => value === "127.0.0.1")).toHaveLength(1)
  })

  test("handles case-insensitive matches", () => {
    process.env.NO_PROXY = "LOCALHOST"
    ensureLoopbackNoProxy()
    expect(process.env.NO_PROXY?.split(",").filter((value) => value.toLowerCase() === "localhost")).toHaveLength(1)
  })
})

describe("useEnvProxy", () => {
  test("never throws and reports failures through the provided logger", () => {
    const warnings: unknown[] = []
    expect(() => useEnvProxy((_message, error) => warnings.push(error))).not.toThrow()
    // The env-proxy API is either available (silent success) or reported via the logger.
    if (warnings.length > 0) expect(warnings[0]).toBeInstanceOf(Error)
  })
})
