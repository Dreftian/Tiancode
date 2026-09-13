import { X509Certificate } from "node:crypto"
import * as nodeTls from "node:tls"

// Derivado de hermes-agent (MIT, (c) 2025 Nous Research); ver
// LICENSE-HERMES-AGENT.md junto a este archivo.
//
// Detrás de un proxy corporativo que inspecciona TLS, la raíz que firma las
// conexiones solo vive en el almacén de certificados de Windows: el navegador
// del usuario funciona y este proceso no, porque Node usa su propio bundle.
// Aquí se mezcla el almacén del sistema con los valores por defecto de Node
// antes de cualquier descarga (voces de Piper/Kokoro, binario de llama-server).

/**
 * Subconjunto de node:tls que se necesita. Ambos métodos son opcionales porque
 * solo existen en Node recientes: en versiones anteriores se detecta y no se
 * hace nada en lugar de romper el arranque.
 */
export type NodeTlsCaApi = {
  getCACertificates?: (type?: "default" | "system") => string[]
  setDefaultCACertificates?: (certificates: string[]) => void
}

export type WindowsSystemCaOutcome =
  | "applied"
  | "not-windows"
  | "unsupported-runtime"
  | "no-system-certificates"
  | "failed"

export type WindowsSystemCaResult = {
  applied: boolean
  outcome: WindowsSystemCaOutcome
  systemCertificateCount: number
  totalCertificateCount: number
  droppedCertificateCount: number
  error?: string
}

export type WindowsSystemCaLogger = (
  message: string,
  extra: Record<string, unknown>,
  level: "info" | "warn",
) => void

export type WindowsSystemCaOptions = {
  tls?: NodeTlsCaApi
  platform?: NodeJS.Platform
  now?: number
  log?: WindowsSystemCaLogger
}

function result(outcome: WindowsSystemCaOutcome, extra: Partial<WindowsSystemCaResult> = {}): WindowsSystemCaResult {
  return {
    applied: outcome === "applied",
    outcome,
    systemCertificateCount: 0,
    totalCertificateCount: 0,
    droppedCertificateCount: 0,
    ...extra,
  }
}

/**
 * Envuelve el logger del llamante: `main` se lanza con `Effect.runFork` sin
 * manejador de errores, así que un throw síncrono desde un log mataría el
 * arranque sin ventana y sin diálogo. Un logger roto no puede cambiar la
 * confianza TLS.
 */
function safeLogger(sink: WindowsSystemCaLogger | undefined): WindowsSystemCaLogger {
  if (!sink) return () => {}
  return (message, extra, level) => {
    try {
      sink(message, extra, level)
    } catch {
      // Sin logging no pasa nada; sin arranque sí.
    }
  }
}

function expiresAt(certificate: X509Certificate) {
  const date = certificate.validToDate
  return date instanceof Date ? date.getTime() : Date.parse(certificate.validTo)
}

/**
 * Mezcla el almacén de certificados de Windows con los valores por defecto de
 * Node. Nunca lanza: si algo falla se deja la confianza tal cual estaba.
 */
export function installWindowsSystemCaTrust(options: WindowsSystemCaOptions = {}): WindowsSystemCaResult {
  const log = safeLogger(options.log)
  const platform = options.platform ?? process.platform
  const tls = options.tls ?? (nodeTls as NodeTlsCaApi)
  const now = options.now ?? Date.now()

  if (platform !== "win32") return result("not-windows")

  try {
    const read = tls.getCACertificates
    const apply = tls.setDefaultCACertificates
    if (typeof read !== "function" || typeof apply !== "function") {
      log("system certificates unsupported by this runtime", { node: process.versions.node }, "warn")
      return result("unsupported-runtime")
    }

    const defaultCertificates = read.call(tls, "default")
    const systemCertificates = read.call(tls, "system")
    if (!Array.isArray(defaultCertificates) || !Array.isArray(systemCertificates)) {
      log("system certificates unsupported by this runtime", { node: process.versions.node }, "warn")
      return result("unsupported-runtime")
    }

    if (systemCertificates.length === 0) {
      log("no windows system certificates found", { defaults: defaultCertificates.length }, "info")
      return result("no-system-certificates", { totalCertificateCount: defaultCertificates.length })
    }

    // Los valores por defecto van primero. Una raíz caducada del almacén de
    // Windows puede desviar a OpenSSL hacia una cadena caducada aunque exista
    // un camino de confianza válido, así que se descartan las caducadas y las
    // repetidas (por huella, no por texto PEM).
    const seen = new Set<string>()
    let dropped = 0

    const keep = (pem: string): boolean => {
      try {
        const certificate = new X509Certificate(pem)
        const expires = expiresAt(certificate)
        if (Number.isFinite(expires) && expires <= now) {
          dropped++
          return false
        }
        if (seen.has(certificate.fingerprint256)) {
          dropped++
          return false
        }
        seen.add(certificate.fingerprint256)
      } catch {
        // Si el parser X.509 de Node no puede inspeccionarlo, que decida Node.
      }
      return true
    }

    const keptDefaults = defaultCertificates.filter(keep)
    const keptSystem = systemCertificates.filter(keep)
    const certificates = [...keptDefaults, ...keptSystem]
    apply.call(tls, certificates)

    const applied = result("applied", {
      systemCertificateCount: keptSystem.length,
      totalCertificateCount: certificates.length,
      droppedCertificateCount: dropped,
    })
    log("windows system certificates installed", { ...applied }, "info")
    return applied
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    log("failed to install windows system certificates", { error: message }, "warn")
    return result("failed", { error: message })
  }
}

/**
 * Camino macOS/Linux: la mezcla simple de siempre (defaults de Node + almacén
 * del sistema), pero sin poder destruir la confianza. `setDefaultCACertificates`
 * con una lista vacía deja el proceso con CERO raíces y todo TLS falla, así que
 * si falta la API de lectura, si devuelve algo que no son arrays o si el almacén
 * del sistema viene vacío, se sale sin tocar nada — igual que el camino de
 * Windows con `no-system-certificates`. Nunca lanza.
 */
export function installSystemCaTrust(options: WindowsSystemCaOptions = {}): WindowsSystemCaResult {
  const log = safeLogger(options.log)
  const tls = options.tls ?? (nodeTls as NodeTlsCaApi)

  try {
    const read = tls.getCACertificates
    const apply = tls.setDefaultCACertificates
    const defaultCertificates = typeof read === "function" ? read.call(tls, "default") : undefined
    const systemCertificates = typeof read === "function" ? read.call(tls, "system") : undefined
    if (
      typeof apply !== "function" ||
      !Array.isArray(defaultCertificates) ||
      !Array.isArray(systemCertificates)
    ) {
      log("system certificates unsupported by this runtime", { node: process.versions.node }, "warn")
      return result("unsupported-runtime")
    }

    if (systemCertificates.length === 0) {
      log("no system certificates found", { defaults: defaultCertificates.length }, "info")
      return result("no-system-certificates", { totalCertificateCount: defaultCertificates.length })
    }

    const certificates = [...new Set([...defaultCertificates, ...systemCertificates])]
    apply.call(tls, certificates)

    const applied = result("applied", {
      systemCertificateCount: systemCertificates.length,
      totalCertificateCount: certificates.length,
    })
    log("system certificates installed", { ...applied }, "info")
    return applied
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    log("failed to install system certificates", { error: message }, "warn")
    return result("failed", { error: message })
  }
}
