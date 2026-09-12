import { describe, expect, test } from "bun:test"
import { retry, type RetryOptions } from "@tiancode-ai/core/util/retry"

// Mirrors what backend/client throws: the reason enum is the message, the real failure is the cause.
function clientError(reason: string, cause?: unknown) {
  const error = cause === undefined ? new Error(reason) : new Error(reason, { cause })
  error.name = "ClientError"
  return Object.assign(error, { reason })
}

async function attempts(error: unknown, options?: RetryOptions) {
  let calls = 0
  let thrown: unknown
  try {
    await retry(
      async () => {
        calls++
        throw error
      },
      { attempts: 3, delay: 0, ...options },
    )
  } catch (err) {
    thrown = err
  }
  expect(thrown).toBe(error)
  return calls
}

describe("retry", () => {
  test("returns the first successful result without retrying", async () => {
    let calls = 0
    const result = await retry(async () => {
      calls++
      return "ok"
    })
    expect(result).toBe("ok")
    expect(calls).toBe(1)
  })

  test("retries client errors whose message is only the reason enum", async () => {
    expect(await attempts(clientError("Transport", new TypeError("Failed to fetch")))).toBe(3)
    expect(await attempts(clientError("UnsupportedContentType"))).toBe(3)
    expect(await attempts(clientError("MalformedResponse"))).toBe(3)
  })

  test("retries an unexpected status only when the status can recover", async () => {
    expect(await attempts(clientError("UnexpectedStatus", { status: 408 }))).toBe(3)
    expect(await attempts(clientError("UnexpectedStatus", { status: 429 }))).toBe(3)
    expect(await attempts(clientError("UnexpectedStatus", { status: 500 }))).toBe(3)
    expect(await attempts(clientError("UnexpectedStatus", { status: 503 }))).toBe(3)
    expect(await attempts(clientError("UnexpectedStatus", { status: 400 }))).toBe(1)
    expect(await attempts(clientError("UnexpectedStatus", { status: 404 }))).toBe(1)
    expect(await attempts(clientError("UnexpectedStatus"))).toBe(1)
  })

  test("keeps matching transient messages", async () => {
    expect(await attempts(new Error("TypeError: Failed to fetch"))).toBe(3)
    expect(await attempts(new Error("connect ECONNREFUSED 127.0.0.1:4096"))).toBe(3)
    expect(await attempts("socket hang up")).toBe(3)
    expect(await attempts(new Error("Session not found"))).toBe(1)
  })

  test("finds a transient failure wrapped in a cause chain", async () => {
    const wrapped = new Error("bootstrap failed", {
      cause: new Error("request failed", { cause: new Error("connect ECONNREFUSED 127.0.0.1:4096") }),
    })
    expect(await attempts(wrapped)).toBe(3)
  })

  test("stops walking the cause chain at the depth cap", async () => {
    const chain = (depth: number) => {
      let error = new Error("connect ECONNREFUSED 127.0.0.1:4096")
      for (let i = 0; i < depth; i++) error = new Error("wrapped", { cause: error })
      return error
    }
    expect(await attempts(chain(3))).toBe(3)
    expect(await attempts(chain(4))).toBe(1)
  })

  test("terminates on a self-referential cause chain", async () => {
    const error: Error & { cause?: unknown } = new Error("boom")
    error.cause = error
    expect(await attempts(error)).toBe(1)
  })

  test("honours a custom retryIf over the default matcher", async () => {
    expect(await attempts(new Error("Session not found"), { retryIf: () => true })).toBe(3)
    expect(await attempts(clientError("Transport"), { retryIf: () => false })).toBe(1)
  })
})
