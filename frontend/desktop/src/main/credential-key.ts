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
  const currentPath = join(app.getPath("userData"), "credentials.key")
  const candidatePaths = [
    currentPath,
    join(app.getPath("appData"), "ai.tiancode.desktop", "credentials.key"),
    join(app.getPath("appData"), "ai.tiancode.desktop.codex", "credentials.key"),
    join(app.getPath("appData"), "ai.tiancode.desktop.dev", "credentials.key"),
  ]

  for (const file of candidatePaths) {
    try {
      if (existsSync(file)) {
        const decrypted = safeStorage.decryptString(await readFile(file))
        if (decrypted) {
          if (file !== currentPath) {
            await writeFile(currentPath, await readFile(file), { mode: 0o600 }).catch(() => {})
          }
          return decrypted
        }
      }
    } catch (error) {
      console.warn("failed to decrypt credential key from", file, error)
    }
  }

  if (!safeStorage.isEncryptionAvailable()) return undefined
  const key = randomBytes(32).toString("base64")
  await writeFile(currentPath, safeStorage.encryptString(key), { mode: 0o600 })
  return key
}
