const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "0.0.0.0", "::1"])

/**
 * The renderer can safely render project dev servers in a normal iframe. This
 * keeps their pixels inside the DOM, unlike Electron's WebContentsView which
 * is always composited above the renderer and can leave an opaque stale pane.
 */
export function usesIframePreview(value: string | undefined) {
  if (!value) return false
  try {
    const url = new URL(value)
    if (url.protocol !== "http:" && url.protocol !== "https:") return false
    return LOOPBACK_HOSTS.has(url.hostname.replace(/^\[|\]$/g, "").toLowerCase())
  } catch {
    return false
  }
}

/**
 * Bind and literal-loopback addresses are not portable iframe destinations:
 * `0.0.0.0` is not routable, and Chromium cannot whitelist an IPv6 literal in
 * the renderer CSP. `localhost` keeps the URL loopback-only and lets the
 * platform resolver select IPv6 when that is where the server listens.
 */
export function iframePreviewUrl(value: string | undefined) {
  if (!value || !usesIframePreview(value)) return undefined
  const url = new URL(value)
  if (url.hostname === "0.0.0.0") url.hostname = "127.0.0.1"
  if (url.hostname === "[::1]") url.hostname = "localhost"
  return url.toString()
}
