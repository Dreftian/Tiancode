export * as MarketplaceFetch from "./fetch"

import { lookup } from "node:dns/promises"
import { isIP } from "node:net"

const USER_AGENT = "Tiancode-Marketplace"

/** Only https on port 443 to a public host name: never an IP literal, localhost or a private-looking name. */
export function publicHttps(value: string) {
  if (!URL.canParse(value)) return false
  const url = new URL(value)
  if (url.protocol !== "https:" || url.username || url.password) return false
  if (url.port && url.port !== "443") return false
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.+$/, "")
  if (isIP(host) || !host.includes(".")) return false
  return !/(^|\.)(localhost|local|internal|lan|home|corp|localdomain|intranet)$/.test(host)
}

/** Loopback, private, link-local, CGNAT, multicast and unique-local addresses. */
export function privateAddress(address: string) {
  const ip = address.toLowerCase().replace(/^::ffff:/, "")
  if (isIP(ip) === 4) {
    const [a = 0, b = 0] = ip.split(".").map(Number)
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168)
    )
  }
  return ip === "::" || ip === "::1" || /^f[cd]/.test(ip) || /^fe[89ab]/.test(ip) || /^ff/.test(ip)
}

/**
 * GET with a timeout and a size cap. Redirects are followed by hand so every hop is checked, and
 * every host must resolve to public addresses only: a catalog entry must not be able to point the
 * backend at the user's own network.
 */
export async function get(url: string, options: { timeoutMs?: number; maxBytes?: number; accept?: string } = {}) {
  const limit = options.maxBytes ?? 8 * 1024 * 1024
  const signal = AbortSignal.timeout(options.timeoutMs ?? 15_000)
  let current = url
  for (let hop = 0; hop < 4; hop++) {
    if (!publicHttps(current)) throw new Error(`refused URL: ${current}`)
    const addresses = await lookup(new URL(current).hostname.replace(/\.+$/, ""), { all: true })
    if (addresses.length === 0 || addresses.some((entry) => privateAddress(entry.address)))
      throw new Error(`refused host: ${current}`)
    const response = await fetch(current, {
      redirect: "manual",
      signal,
      headers: { "user-agent": USER_AGENT, accept: options.accept ?? "application/json, */*" },
    })
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location")
      await response.body?.cancel()
      if (!location) throw new Error(`redirect without location: ${current}`)
      current = new URL(location, current).href
      continue
    }
    if (!response.ok) {
      await response.body?.cancel()
      throw new Error(`HTTP ${response.status} for ${current}`)
    }
    return { url: current, bytes: await capped(response, limit, current), type: response.headers.get("content-type") ?? "" }
  }
  throw new Error(`too many redirects: ${url}`)
}

// Counted as it arrives (after decompression), so neither a lying length nor a compressed bomb can
// make the server buffer more than the cap.
async function capped(response: Response, limit: number, url: string) {
  if (Number(response.headers.get("content-length") ?? 0) > limit) {
    await response.body?.cancel()
    throw new Error(`too large: ${url}`)
  }
  const reader = response.body?.getReader()
  if (!reader) return new Uint8Array()
  const chunks: Uint8Array[] = []
  let size = 0
  while (true) {
    const next = await reader.read()
    if (next.done) break
    size += next.value.byteLength
    if (size > limit) {
      await reader.cancel()
      throw new Error(`too large: ${url}`)
    }
    chunks.push(next.value)
  }
  const bytes = new Uint8Array(size)
  chunks.reduce((offset, chunk) => {
    bytes.set(chunk, offset)
    return offset + chunk.byteLength
  }, 0)
  return bytes
}

export async function json(url: string, options: { timeoutMs?: number; maxBytes?: number } = {}): Promise<unknown> {
  const response = await get(url, options)
  return JSON.parse(new TextDecoder().decode(response.bytes))
}

export async function textOf(url: string, options: { timeoutMs?: number; maxBytes?: number; accept?: string } = {}) {
  const response = await get(url, options)
  return { url: response.url, text: new TextDecoder().decode(response.bytes), type: response.type }
}

/** Runs `work` over `items`, `size` at a time, keeping each result or undefined on failure. */
export async function pool<T, R>(items: T[], size: number, work: (item: T) => Promise<R>) {
  const results: (R | undefined)[] = new Array(items.length)
  let next = 0
  await Promise.all(
    Array.from({ length: Math.min(size, items.length) }, async () => {
      while (next < items.length) {
        const index = next++
        results[index] = await work(items[index]!).catch(() => undefined)
      }
    }),
  )
  return results
}
