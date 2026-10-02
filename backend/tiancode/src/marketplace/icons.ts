export * as MarketplaceIcons from "./icons"

import { MarketplaceFetch } from "./fetch"

const MAX_ICON = 256 * 1024

/**
 * The logo a site publishes for itself: its apple-touch-icon (the largest, made for app grids),
 * else the biggest declared icon, else /favicon.ico. Returned as a data URL so the app can show
 * it without the renderer reaching the site.
 */
export async function resolve(domain: string): Promise<string | undefined> {
  const page = await MarketplaceFetch.textOf(`https://${domain}/`, {
    timeoutMs: 8000,
    maxBytes: 768 * 1024,
    accept: "text/html",
  }).catch(() => undefined)
  const candidates = [
    ...(page ? iconLinks(page.text, page.url) : []),
    `https://${domain}/apple-touch-icon.png`,
    `https://${domain}/favicon.ico`,
  ]
  for (const candidate of candidates) {
    const image = await MarketplaceFetch.get(candidate, { timeoutMs: 8000, maxBytes: MAX_ICON, accept: "image/*" }).catch(
      () => undefined,
    )
    if (!image || image.bytes.byteLength < 64) continue
    const type = imageType(image.type, image.bytes)
    if (!type) continue
    return `data:${type};base64,${Buffer.from(image.bytes).toString("base64")}`
  }
}

/** `<link rel="…icon…" href sizes>` from a page, best first. */
export function iconLinks(html: string, base: string) {
  const head = html.slice(0, 200_000)
  const links = [...head.matchAll(/<link\b[^>]*>/gi)].flatMap((match) => {
    const tag = match[0]
    const rel = attribute(tag, "rel")?.toLowerCase() ?? ""
    if (!/\bicon\b|apple-touch-icon/.test(rel) || /mask-icon/.test(rel)) return []
    const href = attribute(tag, "href")
    if (!href || href.startsWith("data:") || !URL.canParse(href, base)) return []
    const sizes = attribute(tag, "sizes") ?? ""
    const size = Math.max(0, ...[...sizes.matchAll(/(\d+)x\d+/g)].map((hit) => Number(hit[1])))
    const score = (rel.includes("apple-touch-icon") ? 10_000 : 0) + (size || (href.endsWith(".svg") ? 512 : 16))
    return [{ url: new URL(href, base).href, score }]
  })
  return links.sort((a, b) => b.score - a.score).map((link) => link.url)
}

function attribute(tag: string, name: string) {
  const match = new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i").exec(tag)
  return match ? (match[1] ?? match[2] ?? match[3]) : undefined
}

/** The image type, trusting the bytes over the header (many servers send text/plain). */
function imageType(header: string, bytes: Uint8Array) {
  const start = [...bytes.slice(0, 12)]
  if (start[0] === 0x89 && start[1] === 0x50) return "image/png"
  if (start[0] === 0xff && start[1] === 0xd8) return "image/jpeg"
  if (start[0] === 0x47 && start[1] === 0x49) return "image/gif"
  if (start[0] === 0x00 && start[1] === 0x00 && start[2] === 0x01) return "image/x-icon"
  if (String.fromCharCode(...start.slice(8, 12)) === "WEBP") return "image/webp"
  const head = new TextDecoder().decode(bytes.slice(0, 256)).trimStart().toLowerCase()
  if (head.startsWith("<svg") || (head.startsWith("<?xml") && head.includes("<svg"))) return "image/svg+xml"
  if (/^image\/(png|jpeg|gif|webp|svg\+xml|x-icon|vnd\.microsoft\.icon)/.test(header)) return header.split(";")[0]
}
