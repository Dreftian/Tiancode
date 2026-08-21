const RETRYABLE_LOCALHOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"])

export const PREVIEW_RETRY_MAX_ATTEMPTS = 12

export function isRetryablePreviewLoadFailure(input: { code: number; url: string; isMainFrame: boolean }) {
  if (!input.isMainFrame || input.code >= 0 || input.code === -3) return false
  try {
    return RETRYABLE_LOCALHOSTS.has(new URL(input.url).hostname)
  } catch {
    return false
  }
}

export function previewRetryDelay(attempt: number) {
  return Math.min(500 * 2 ** Math.max(attempt, 0), 4000)
}

export function samePreviewUrl(left: string | undefined, right: string | undefined) {
  if (!left || !right) return false
  try {
    const a = new URL(left)
    const b = new URL(right)
    const sameHost = a.host === b.host || (RETRYABLE_LOCALHOSTS.has(a.hostname) && RETRYABLE_LOCALHOSTS.has(b.hostname) && a.port === b.port)
    return a.protocol === b.protocol && sameHost && a.pathname.replace(/\/$/, "") === b.pathname.replace(/\/$/, "") && a.search === b.search
  } catch {
    return left === right
  }
}
