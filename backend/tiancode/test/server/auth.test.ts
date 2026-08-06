import { afterEach, describe, expect, test } from "bun:test"
import { Option, Redacted } from "effect"
import { Flag } from "@tiancode-ai/core/flag/flag"
import { ServerAuth } from "../../src/server/auth"

const original = {
  TIANCODE_SERVER_PASSWORD: Flag.TIANCODE_SERVER_PASSWORD,
  TIANCODE_SERVER_USERNAME: Flag.TIANCODE_SERVER_USERNAME,
}

afterEach(() => {
  Flag.TIANCODE_SERVER_PASSWORD = original.TIANCODE_SERVER_PASSWORD
  Flag.TIANCODE_SERVER_USERNAME = original.TIANCODE_SERVER_USERNAME
})

describe("ServerAuth", () => {
  test("does not emit auth headers without a password", () => {
    Flag.TIANCODE_SERVER_PASSWORD = undefined
    Flag.TIANCODE_SERVER_USERNAME = "alice"

    expect(ServerAuth.header()).toBeUndefined()
    expect(ServerAuth.headers()).toBeUndefined()
  })

  test("defaults to the tiancode username", () => {
    Flag.TIANCODE_SERVER_PASSWORD = "secret"
    Flag.TIANCODE_SERVER_USERNAME = undefined

    expect(ServerAuth.headers()).toEqual({
      Authorization: `Basic ${Buffer.from("tiancode:secret").toString("base64")}`,
    })
  })

  test("uses the configured username", () => {
    Flag.TIANCODE_SERVER_PASSWORD = "secret"
    Flag.TIANCODE_SERVER_USERNAME = "alice"

    expect(ServerAuth.headers()).toEqual({
      Authorization: `Basic ${Buffer.from("alice:secret").toString("base64")}`,
    })
  })

  test("prefers explicit credentials", () => {
    Flag.TIANCODE_SERVER_PASSWORD = "secret"
    Flag.TIANCODE_SERVER_USERNAME = "alice"

    expect(ServerAuth.headers({ password: "cli-secret", username: "bob" })).toEqual({
      Authorization: `Basic ${Buffer.from("bob:cli-secret").toString("base64")}`,
    })
  })

  test("validates decoded credentials against effect config", () => {
    const config = { password: Option.some("secret"), username: "alice" }

    expect(ServerAuth.required(config)).toBe(true)
    expect(ServerAuth.authorized({ username: "alice", password: Redacted.make("secret") }, config)).toBe(true)
    expect(ServerAuth.authorized({ username: "tiancode", password: Redacted.make("secret") }, config)).toBe(false)
  })
})
