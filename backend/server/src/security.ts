/**
 * Request hardening for the HTTP server.
 *
 * - DNS-rebinding protection: while the server listens on a loopback address, a request whose
 *   `Host` header names anything but localhost (or the mDNS name) is refused. A malicious web page
 *   cannot reach the local API by pointing its own domain at 127.0.0.1.
 * - Security headers on every response (no MIME sniffing, no framing from other origins, no
 *   referrer leakage).
 * - Brute-force throttling for HTTP basic auth: after too many failures an address is locked for a
 *   while (see `AuthThrottle`).
 */
import { Effect } from "effect"
import { HttpEffect, HttpServerRequest, HttpServerResponse, type HttpMiddleware } from "effect/unstable/http"

const LOOPBACK = new Set(["127.0.0.1", "localhost", "::1", "[::1]"])

export function isLoopbackHostname(hostname: string) {
  return LOOPBACK.has(hostname.trim().toLowerCase())
}

/** Host part of a `Host` header (strips the port, keeps IPv6 brackets). */
export function hostName(header: string) {
  const value = header.trim().toLowerCase()
  if (value.startsWith("[")) return value.slice(0, value.indexOf("]") + 1)
  return value.split(":")[0]
}

export interface HostPolicy {
  readonly hostname: string
  readonly mdnsDomain?: string
  readonly extra?: ReadonlyArray<string>
}

export function hostAllowed(header: string | undefined, policy: HostPolicy) {
  // HTTP/1.0 clients may omit Host; browsers never do, and they are the rebinding vector.
  if (!header) return true
  const name = hostName(header)
  if (LOOPBACK.has(name)) return true
  if (name.endsWith(".localhost")) return true
  if (name === policy.hostname.trim().toLowerCase()) return true
  if (policy.mdnsDomain && name === policy.mdnsDomain.trim().toLowerCase()) return true
  return policy.extra?.some((entry) => entry.trim().toLowerCase() === name) ?? false
}

export const SECURITY_HEADERS: Readonly<Record<string, string>> = {
  "x-content-type-options": "nosniff",
  "x-frame-options": "SAMEORIGIN",
  "referrer-policy": "no-referrer",
  "x-permitted-cross-domain-policies": "none",
}

export function securityMiddleware(policy: HostPolicy & { readonly loopback: boolean }): HttpMiddleware.HttpMiddleware {
  return (effect) =>
    Effect.gen(function* () {
      const request = yield* HttpServerRequest.HttpServerRequest
      if (policy.loopback && !hostAllowed(request.headers.host, policy)) {
        return HttpServerResponse.text("Forbidden: unexpected Host header", {
          status: 403,
          headers: SECURITY_HEADERS,
        })
      }
      yield* HttpEffect.appendPreResponseHandler((_request, response) =>
        Effect.succeed(
          Object.entries(SECURITY_HEADERS).reduce(
            (acc, [key, value]) => (acc.headers[key] ? acc : HttpServerResponse.setHeader(acc, key, value)),
            response,
          ),
        ),
      )
      return yield* effect
    })
}

/** Failed-login accounting per client address (pure, injectable clock for tests). */
export class AuthThrottle {
  private readonly failures = new Map<string, { count: number; first: number; lockedUntil?: number }>()

  constructor(
    private readonly options: { readonly maxFailures: number; readonly windowMs: number; readonly lockMs: number } = {
      maxFailures: 10,
      windowMs: 10 * 60_000,
      lockMs: 15 * 60_000,
    },
  ) {}

  /** Seconds left on the lock, or 0 when the address may try. */
  lockedFor(key: string, now = Date.now()): number {
    const entry = this.failures.get(key)
    if (!entry?.lockedUntil) return 0
    if (entry.lockedUntil <= now) {
      this.failures.delete(key)
      return 0
    }
    return Math.ceil((entry.lockedUntil - now) / 1000)
  }

  fail(key: string, now = Date.now()) {
    const entry = this.failures.get(key)
    if (!entry || now - entry.first > this.options.windowMs) {
      this.failures.set(key, { count: 1, first: now })
      return
    }
    entry.count += 1
    if (entry.count >= this.options.maxFailures) entry.lockedUntil = now + this.options.lockMs
  }

  succeed(key: string) {
    this.failures.delete(key)
  }
}
