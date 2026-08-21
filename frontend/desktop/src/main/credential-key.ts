import { randomBytes } from "node:crypto"
import { existsSync } from "node:fs"
import { readFile, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { app, safeStorage } from "electron"

// La clave de cifrado de credenciales (base64 de 32 bytes) se guarda cifrada
// con safeStorage (DPAPI en Windows, Keychain en macOS) junto al userData. El
// servidor sidecar la recibe por TIANCODE_CREDENTIAL_KEY al arrancar; sin ella
// (CLI standalone o safeStorage no disponible) las credenciales vuelven a
// texto plano, el comportamiento legacy.
export async function getCredentialKey(): Promise<string | undefined> {
  const file = join(app.getPath("userData"), "credentials.key")
  try {
    if (existsSync(file)) return safeStorage.decryptString(await readFile(file))
  } catch (error) {
    console.warn("failed to decrypt credential key", error)
    return undefined
  }
  if (!safeStorage.isEncryptionAvailable()) return undefined
  const key = randomBytes(32).toString("base64")
  await writeFile(file, safeStorage.encryptString(key), { mode: 0o600 })
  return key
}
