import { describe, expect, test } from "bun:test"
import { AuthThrottle, hostAllowed, hostName, isLoopbackHostname } from "../../src/server/security"

describe("hostAllowed", () => {
  const policy = { hostname: "127.0.0.1", mdnsDomain: "tiancode.local" }

  test("accepts loopback names with or without a port", () => {
    expect(hostAllowed("localhost:4096", policy)).toBe(true)
    expect(hostAllowed("127.0.0.1", policy)).toBe(true)
    expect(hostAllowed("[::1]:4096", policy)).toBe(true)
    expect(hostAllowed("app.localhost:3000", policy)).toBe(true)
  })

  test("accepts the mDNS name and the bound hostname", () => {
    expect(hostAllowed("tiancode.local:4096", policy)).toBe(true)
    expect(hostAllowed("192.168.1.20:4096", { hostname: "192.168.1.20" })).toBe(true)
  })

  test("refuses a foreign domain pointed at the loopback address (DNS rebinding)", () => {
    expect(hostAllowed("evil.example.com", policy)).toBe(false)
    expect(hostAllowed("evil.example.com:4096", policy)).toBe(false)
  })

  test("tolerates a missing Host header", () => {
    expect(hostAllowed(undefined, policy)).toBe(true)
  })

  test("helpers", () => {
    expect(hostName("[::1]:80")).toBe("[::1]")
    expect(hostName("Localhost:4096")).toBe("localhost")
    expect(isLoopbackHostname("::1")).toBe(true)
    expect(isLoopbackHostname("0.0.0.0")).toBe(false)
  })
})

describe("AuthThrottle", () => {
  test("locks an address after repeated failures and releases it later", () => {
    const throttle = new AuthThrottle({ maxFailures: 3, windowMs: 60_000, lockMs: 30_000 })
    const start = 1_000_000
    throttle.fail("10.0.0.1", start)
    throttle.fail("10.0.0.1", start + 1000)
    expect(throttle.lockedFor("10.0.0.1", start + 2000)).toBe(0)
    throttle.fail("10.0.0.1", start + 2000)
    expect(throttle.lockedFor("10.0.0.1", start + 3000)).toBeGreaterThan(0)
    expect(throttle.lockedFor("10.0.0.2", start + 3000)).toBe(0)
    expect(throttle.lockedFor("10.0.0.1", start + 40_000)).toBe(0)
  })

  test("a success clears the counter and failures outside the window restart it", () => {
    const throttle = new AuthThrottle({ maxFailures: 2, windowMs: 1000, lockMs: 1000 })
    throttle.fail("a", 0)
    throttle.succeed("a")
    throttle.fail("a", 10)
    expect(throttle.lockedFor("a", 20)).toBe(0)
    throttle.fail("a", 5000)
    expect(throttle.lockedFor("a", 5001)).toBe(0)
  })
})
