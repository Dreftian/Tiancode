import { randomBytes } from "node:crypto"
import { createServer } from "node:net"
import { networkInterfaces } from "node:os"
import { safeStorage } from "electron"
import { getStore } from "./store"
import { PAIRING_ENABLED_KEY, PAIRING_PASSWORD_KEY, PAIRING_PORT_KEY } from "./store-keys"

// Settings › Pairing: another device on the same network opens this machine's server in a
// browser. Off by default; turning it on takes effect on the next start because the sidecar
// binds its address once.

export type PairingInfo = {
  enabled: boolean
  urls: string[]
  username: string
  password: string | null
  restartRequired: boolean
}

const USERNAME = "tiancode"
const DEFAULT_PORT = 4096

// How the running sidecar was started, so the settings page can tell when a restart is pending.
let running: { lan: boolean; port: number; password: string } | undefined

/**
 * Listen options for the sidecar. With pairing on, the port and password are stable across
 * restarts (a paired phone keeps working); otherwise the server stays on loopback with a fresh
 * random port and password, exactly as before.
 */
export async function pairingListen(fallback: { port: number; password: string }) {
  if (getStore().get(PAIRING_ENABLED_KEY) !== true) return { lan: false, ...fallback }
  const saved = getStore().get(PAIRING_PORT_KEY)
  const wanted = typeof saved === "number" && Number.isInteger(saved) && saved > 0 ? saved : DEFAULT_PORT
  // Another program may have taken the port since; a new one beats not starting at all.
  const port = (await portFree(wanted)) ? wanted : fallback.port
  getStore().set(PAIRING_PORT_KEY, port)
  return { lan: true, port, password: readPassword() ?? writePassword() }
}

export function markPairingRunning(input: { lan: boolean; port: number; password: string }) {
  running = input
}

export function pairingInfo(): PairingInfo {
  const enabled = getStore().get(PAIRING_ENABLED_KEY) === true
  const lan = running?.lan === true
  return {
    enabled,
    urls: lan && running ? lanAddresses().map((address) => `http://${address}:${running?.port}`) : [],
    username: USERNAME,
    password: lan && running ? running.password : null,
    restartRequired: running !== undefined && enabled !== lan,
  }
}

export function setPairingEnabled(enabled: boolean): PairingInfo {
  getStore().set(PAIRING_ENABLED_KEY, enabled)
  // A new password on every opt-in: devices paired before the user turned it off stay out.
  if (enabled && !(running?.lan && readPassword())) writePassword()
  return pairingInfo()
}

function lanAddresses() {
  return Object.values(networkInterfaces())
    .flatMap((entries) => entries ?? [])
    .filter((entry) => entry.family === "IPv4" && !entry.internal && !entry.address.startsWith("169.254."))
    .map((entry) => entry.address)
}

function readPassword() {
  const stored = getStore().get(PAIRING_PASSWORD_KEY)
  if (typeof stored !== "string" || !stored || !safeStorage.isEncryptionAvailable()) return undefined
  try {
    return safeStorage.decryptString(Buffer.from(stored, "base64"))
  } catch {
    // Encrypted by another Windows account or a reset keychain: a new one is issued.
    return undefined
  }
}

// Without OS encryption the password is not stored: it lives for this run only.
function writePassword() {
  const password = randomBytes(18).toString("base64url")
  if (!safeStorage.isEncryptionAvailable()) return password
  getStore().set(PAIRING_PASSWORD_KEY, safeStorage.encryptString(password).toString("base64"))
  return password
}

function portFree(port: number) {
  return new Promise<boolean>((resolve) => {
    const probe = createServer()
    probe.once("error", () => resolve(false))
    probe.listen(port, "0.0.0.0", () => probe.close(() => resolve(true)))
  })
}
