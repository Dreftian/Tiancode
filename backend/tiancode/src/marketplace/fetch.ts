export * as MarketplaceFetch from "./fetch"

import { isIP } from "node:net"

const USER_AGENT = "Tiancode-Marketplace"

/** Only https to a public host name: never an IP literal, localhost or a private-looking name. */
export function publicHttps(value: string) {
  if (!URL.canParse(value)) return false
  const url = new URL(value)
  if (url.protocol !== "https:" || url.username || url.password) return false
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "")
  if (isIP(host) || !host.includes(".")) return false
  return !/(^|\.)(localhost|local|internal|lan|home|corp)$/.test(host)
}

/**
 * GET with a timeout and a size cap. Redirects are followed by hand so every hop is checked: a
 * catalog entry must not be able to bounce the backend to its own loopback server.
 */
export async function get(url: string, options: { timeoutMs?: number; maxBytes?: number; accept?: string } = {}) {
  let current = url
  for (let hop = 0; hop < 4; hop++) {
    if (!publicHttps(current)) throw new Error(`refused URL: ${current}`)
    const response = await fetch(current, {
      redirect: "manual",
      signal: AbortSignal.timeout(options.timeoutMs ?? 15_000),
      headers: { "user-agent": USER_AGENT, accept: options.accept ?? "application/json, */*" },
    })
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location")
      if (!location) throw new Error(`redirect without location: ${current}`)
      current = new URL(location, current).href
      continue
    }
    if (!response.ok) throw new Error(`HTTP ${response.status} for ${current}`)
    const limit = options.maxBytes ?? 8 * 1024 * 1024
    const declared = Number(response.headers.get("content-length") ?? 0)
    if (declared > limit) throw new Error(`too large: ${current}`)
    const bytes = new Uint8Array(await response.arrayBuffer())
    if (bytes.byteLength > limit) throw new Error(`too large: ${current}`)
    return { url: current, bytes, type: response.headers.get("content-type") ?? "" }
  }
  throw new Error(`too many redirects: ${url}`)
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
