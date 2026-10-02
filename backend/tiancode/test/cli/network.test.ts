import { describe, expect, test } from "bun:test"
import { Effect, Exit } from "effect"
import { ensureSecuredListen, listenFailure } from "../../src/cli/network"

describe("cli.network", () => {
  test("names the port when another process holds it", () => {
    const socket = Object.assign(new Error("listen EADDRINUSE: address already in use 127.0.0.1:4096"), {
      code: "EADDRINUSE",
    })

    const error = listenFailure(new Error("ServeError", { cause: socket }), { hostname: "127.0.0.1", port: 4096 })

    expect(error.message).toContain("Port 4096 is already in use")
  })

  test("rejects a port yargs could not parse instead of picking a random one", async () => {
    const exit = await Effect.runPromiseExit(ensureSecuredListen({ hostname: "127.0.0.1", port: Number.NaN }))

    expect(Exit.isFailure(exit)).toBe(true)
  })

  test("lets a loopback server with a valid port through", async () => {
    const exit = await Effect.runPromiseExit(ensureSecuredListen({ hostname: "127.0.0.1", port: 4096 }))

    expect(Exit.isSuccess(exit)).toBe(true)
  })
})
