import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto"

// Credentials are encrypted at rest with AES-256-GCM under a 32-byte key. The
// desktop app provisions the key through Electron safeStorage and passes it to
// the server process via TIANCODE_CREDENTIAL_KEY (base64); standalone CLI runs
// without the variable keep storing plaintext (legacy behavior).
export const KEY_ENV = "TIANCODE_CREDENTIAL_KEY"

const PREFIX = "enc:v1:"
const SEPARATOR = "."

export function readCredentialKey(): Buffer | undefined {
  const encoded = process.env[KEY_ENV]
  if (encoded === undefined) return undefined
  const key = Buffer.from(encoded, "base64")
  return key.length === 32 ? key : undefined
}

// A sealed value is a JSON string envelope; Credential.Value is always an
// object, so the two never collide on read.
export function isSealed(value: unknown): value is string {
  return typeof value === "string" && value.startsWith(PREFIX)
}

export function seal(value: string, key: Buffer): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv("aes-256-gcm", key, iv)
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()])
  const tag = cipher.getAuthTag()
  return `${PREFIX}${iv.toString("base64url")}${SEPARATOR}${tag.toString("base64url")}${SEPARATOR}${encrypted.toString("base64url")}`
}

export function open(envelope: string, key: Buffer): string | undefined {
  const parts = envelope.slice(PREFIX.length).split(SEPARATOR)
  if (parts.length !== 3) return undefined
  const [iv, tag, data] = parts
  try {
    const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64url"))
    decipher.setAuthTag(Buffer.from(tag, "base64url"))
    return Buffer.concat([decipher.update(Buffer.from(data, "base64url")), decipher.final()]).toString("utf8")
  } catch {
    // Wrong key or corrupted payload: the caller treats the credential as missing.
    return undefined
  }
}
