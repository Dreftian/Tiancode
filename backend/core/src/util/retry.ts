export interface RetryOptions {
  attempts?: number
  delay?: number
  factor?: number
  maxDelay?: number
  retryIf?: (error: unknown) => boolean
}

const TRANSIENT_MESSAGES = [
  "load failed",
  "network connection was lost",
  "network request failed",
  "failed to fetch",
  "econnreset",
  "econnrefused",
  "etimedout",
  "socket hang up",
]

// Effect errors can point `cause` back at themselves, so the chain is walked with a cap
// instead of to its end.
const CAUSE_DEPTH_LIMIT = 3

// The generated client collapses every failure into `new ClientError(reason)`, whose message
// is the bare reason enum and whose real error (a `TypeError: Failed to fetch`, a status) only
// lives in `cause`. The message match below can never see it, so the reason is read first.
// Returns undefined when this is not a ClientError, so the caller keeps looking.
function isTransientClientError(error: unknown): boolean | undefined {
  if (!(error instanceof Error) || error.name !== "ClientError") return
  const reason = (error as { reason?: string }).reason
  if (reason === "Transport" || reason === "UnsupportedContentType" || reason === "MalformedResponse") return true
  if (reason !== "UnexpectedStatus") return
  const status = (error.cause as { status?: number } | undefined)?.status
  if (typeof status !== "number") return false
  return status === 408 || status === 429 || status >= 500
}

function isTransientError(error: unknown, depth = 0): boolean {
  if (!error) return false
  const client = isTransientClientError(error)
  if (client !== undefined) return client
  // oxlint-disable-next-line no-base-to-string -- error is unknown, intentional coercion for message matching
  const message = String(error instanceof Error ? error.message : error).toLowerCase()
  if (TRANSIENT_MESSAGES.some((m) => message.includes(m))) return true
  if (depth >= CAUSE_DEPTH_LIMIT) return false
  return isTransientError((error as { cause?: unknown }).cause, depth + 1)
}

export async function retry<T>(fn: () => Promise<T>, options: RetryOptions = {}): Promise<T> {
  const { attempts = 3, delay = 500, factor = 2, maxDelay = 10000, retryIf = isTransientError } = options

  let lastError: unknown
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      return await fn()
    } catch (error) {
      lastError = error
      if (attempt === attempts - 1 || !retryIf(error)) throw error
      const wait = Math.min(delay * Math.pow(factor, attempt), maxDelay)
      await new Promise((resolve) => setTimeout(resolve, wait))
    }
  }
  throw lastError
}
