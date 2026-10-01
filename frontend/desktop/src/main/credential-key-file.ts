import { randomBytes } from "node:crypto"
import { existsSync } from "node:fs"
import { readFile, rename, writeFile } from "node:fs/promises"

/**
 * The profile's credential key (base64, 32 bytes) from its encrypted key file.
 *
 * The file is sealed with the OS store (DPAPI through the profile's Local State on Windows). A key
 * file is never overwritten while it might still be the only way to open auth.json and
 * mcp-auth.json: one that cannot be read at all (busy, permissions) is left alone, and one that
 * cannot be decrypted is renamed aside before a replacement is written. If it cannot be set aside,
 * no key is returned and credentials stay as they are on disk.
 */
export async function resolveCredentialKey(input: {
  current: string
  legacy: string[]
  available: boolean
  decrypt: (data: Buffer) => string
  encrypt: (text: string) => Buffer
}): Promise<string | undefined> {
  const present = existsSync(input.current)
  const stored = present ? await readFile(input.current).catch(() => undefined) : undefined
  const own = stored && open(stored, input.decrypt)
  if (own) return own
  // Present but unreadable right now: replacing it could destroy the only copy of the key.
  if (present && !stored) return undefined

  for (const file of input.legacy.filter((file) => file !== input.current)) {
    const data = existsSync(file) ? await readFile(file).catch(() => undefined) : undefined
    const key = data && open(data, input.decrypt)
    if (!key) continue
    if (!present || (await setAside(input.current))) await writeFile(input.current, data, { mode: 0o600 }).catch(() => {})
    return key
  }

  if (!input.available) return undefined
  if (present && !(await setAside(input.current))) return undefined
  const key = randomBytes(32).toString("base64")
  await writeFile(input.current, input.encrypt(key), { mode: 0o600 })
  return key
}

function open(data: Buffer, decrypt: (data: Buffer) => string) {
  try {
    return decrypt(data) || undefined
  } catch {
    return undefined
  }
}

async function setAside(file: string) {
  return rename(file, `${file}.unreadable-${Date.now()}`).then(
    () => true,
    () => false,
  )
}
