import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { resolveCredentialKey } from "./credential-key-file"

// Stand-in for safeStorage: "enc:" + text is what this profile can open; anything else throws.
const decrypt = (data: Buffer) => {
  const text = data.toString()
  if (!text.startsWith("enc:")) throw new Error("cannot decrypt")
  return text.slice(4)
}
const encrypt = (text: string) => Buffer.from(`enc:${text}`)

let dir: string
const current = () => join(dir, "profile", "credentials.key")
const legacy = () => join(dir, "legacy", "credentials.key")
const resolve = (available = true) => resolveCredentialKey({ current: current(), legacy: [legacy()], available, decrypt, encrypt })
const asides = () => readdirSync(join(dir, "profile")).filter((name) => name.startsWith("credentials.key.unreadable-"))

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "tiancode-credential-"))
  mkdirSync(join(dir, "profile"))
  mkdirSync(join(dir, "legacy"))
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe("resolveCredentialKey", () => {
  test("opens the profile's own key without touching the file", async () => {
    writeFileSync(current(), "enc:own-key")
    expect(await resolve()).toBe("own-key")
    expect(readFileSync(current(), "utf8")).toBe("enc:own-key")
    expect(asides()).toEqual([])
  })

  test("sets an undecryptable key aside before issuing a new one", async () => {
    writeFileSync(current(), "sealed-by-another-local-state")
    const key = await resolve()
    expect(key).toBeTruthy()
    expect(readFileSync(current(), "utf8")).toBe(`enc:${key}`)
    expect(asides()).toHaveLength(1)
    expect(readFileSync(join(dir, "profile", asides()[0]!), "utf8")).toBe("sealed-by-another-local-state")
  })

  test("leaves a key file it cannot read at all alone and returns no key", async () => {
    mkdirSync(current())
    expect(await resolve()).toBeUndefined()
    expect(existsSync(current())).toBe(true)
    expect(asides()).toEqual([])
  })

  test("copies a legacy key when the profile has none", async () => {
    writeFileSync(legacy(), "enc:legacy-key")
    expect(await resolve()).toBe("legacy-key")
    expect(readFileSync(current(), "utf8")).toBe("enc:legacy-key")
  })

  test("keeps an undecryptable key aside before copying a legacy one over it", async () => {
    writeFileSync(current(), "sealed-by-another-local-state")
    writeFileSync(legacy(), "enc:legacy-key")
    expect(await resolve()).toBe("legacy-key")
    expect(readFileSync(current(), "utf8")).toBe("enc:legacy-key")
    expect(asides()).toHaveLength(1)
  })

  test("returns no key without OS encryption and writes nothing", async () => {
    expect(await resolve(false)).toBeUndefined()
    expect(existsSync(current())).toBe(false)
  })
})
