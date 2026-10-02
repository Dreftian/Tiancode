import { join } from "node:path"
import { app, safeStorage } from "electron"
import { resolveCredentialKey } from "./credential-key-file"

// La clave de cifrado de credenciales (base64 de 32 bytes) se guarda cifrada
// con safeStorage (DPAPI en Windows, Keychain en macOS) junto al userData. El
// servidor sidecar la recibe por TIANCODE_CREDENTIAL_KEY al arrancar; sin ella
// (CLI standalone o safeStorage no disponible) las credenciales vuelven a
// texto plano, el comportamiento legacy.
export function getCredentialKey(): Promise<string | undefined> {
  return resolveCredentialKey({
    current: join(app.getPath("userData"), "credentials.key"),
    legacy: [
      join(app.getPath("appData"), "ai.tiancode.desktop", "credentials.key"),
      join(app.getPath("appData"), "ai.tiancode.desktop.codex", "credentials.key"),
      join(app.getPath("appData"), "ai.tiancode.desktop.dev", "credentials.key"),
    ],
    available: safeStorage.isEncryptionAvailable(),
    decrypt: (data) => safeStorage.decryptString(data),
    encrypt: (text) => safeStorage.encryptString(text),
  })
}
