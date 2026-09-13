import { describe, expect, test } from "bun:test"
import {
  OPTIMIZER_TIMEOUT_POLICY,
  OPTIMIZE_HEARTBEAT_MARK,
  consumeOptimizerStream,
  optimizerDeadline,
  optimizerDelay,
  optimizerProgressed,
  optimizerStarted,
  stripOptimizerHeartbeat,
  type OptimizerTimeoutPolicy,
} from "./prompt-optimizer-timeout"

/** NUL — the failure sentinel the backend appends. Must survive heartbeat stripping. */
const OPTIMIZE_ERROR_MARK = String.fromCharCode(0)

const HB = OPTIMIZE_HEARTBEAT_MARK
const T0 = 1_700_000_000_000
const encoder = new TextEncoder()

/** One scripted network event: `text` arriving `at` ms after `fetch`. No `text` ends the body. */
type Beat = { readonly at: number; readonly text?: string }

class AbortedError extends Error {}

/**
 * Drives `consumeOptimizerStream` in virtual time. Nothing here sleeps: each `read()` compares the
 * next scripted arrival against whatever deadline the loop last armed and lets the earlier one win,
 * which is what a real event loop would do minus the wall clock. A won race is an abort, i.e. the
 * pending `read()` rejecting — exactly how `AbortController.abort()` surfaces to the loop.
 */
function driver(script: readonly Beat[], options?: { readonly startedAt?: number }) {
  const startedAt = options?.startedAt ?? T0
  let now = startedAt
  let firesAt = Number.POSITIVE_INFINITY
  let next = 0
  let abortedAt: number | undefined
  const chunks: string[] = []

  return {
    startedAt,
    chunks,
    abortedAt: () => abortedAt,
    now: () => now,
    arm: (delayMs: number) => {
      firesAt = now + delayMs
    },
    onChunk: (visible: string) => {
      chunks.push(visible)
    },
    reader: {
      read: async (): Promise<{ done: boolean; value?: Uint8Array }> => {
        const beat = script[next]
        if (!beat) return { done: true }
        const at = startedAt + beat.at
        // Ties go to the timer: a byte landing exactly as the deadline expires is a race the client
        // has to survive being on the losing side of.
        if (firesAt <= at) {
          now = firesAt
          abortedAt = firesAt
          throw new AbortedError("aborted")
        }
        next += 1
        now = at
        if (beat.text === undefined) return { done: true }
        return { done: false, value: encoder.encode(beat.text) }
      },
    },
  }
}

/** Heartbeat every 5 s from `from` up to and including `to`, as the backend emits them. */
function heartbeats(from: number, to: number): Beat[] {
  const beats: Beat[] = []
  for (let at = from; at <= to; at += 5_000) beats.push({ at, text: HB })
  return beats
}

/** What the component does: arm once before `fetch`, then hand the loop the same `arm`. */
function run(d: ReturnType<typeof driver>, policy?: OptimizerTimeoutPolicy) {
  const progress = optimizerStarted(d.startedAt)
  d.arm(optimizerDelay(progress, d.now(), policy))
  return consumeOptimizerStream({
    reader: d.reader,
    progress,
    now: d.now,
    arm: d.arm,
    onChunk: d.onChunk,
    ...(policy ? { policy } : {}),
  })
}

describe("consumeOptimizerStream", () => {
  // The reported bug, as measured: the backend filters reasoning deltas out of the body, so the
  // client sees nothing while the model thinks. With heartbeats it sees a byte every 5 s — and the
  // deadline has to be re-armed by each one, or the request still dies at the initial budget.
  test("a heartbeating stream outlives the idle budget many times over", async () => {
    const answer = "### Objective\nOutlast the thinking phase."
    const d = driver([
      ...heartbeats(0, 40_000),
      { at: 45_000, text: answer.slice(0, 12) },
      // Past `idleMs` from the start: only a timer re-armed inside the loop survives this.
      { at: 100_000, text: answer.slice(12) },
      { at: 101_000 },
    ])

    expect(await run(d)).toBe(answer)
    expect(d.abortedAt()).toBeUndefined()
    // Heartbeats are transport: the composer only ever saw growing prefixes of the real answer.
    expect(d.chunks).toEqual([answer.slice(0, 12), answer])
  })

  test("a stream that goes silent past the idle budget is aborted", async () => {
    const d = driver([
      { at: 0, text: HB },
      { at: 12_000, text: HB },
      // Then the server wedges. Nothing more arrives until long after the budget.
      { at: 300_000 },
    ])

    await expect(run(d)).rejects.toThrow(AbortedError)
    // Measured from the last byte, not from the start: that is what "idle" means.
    expect(d.abortedAt()).toBe(T0 + 12_000 + OPTIMIZER_TIMEOUT_POLICY.idleMs)
  })

  test("a stream silent from the very first byte is aborted on the same budget", async () => {
    const d = driver([{ at: 300_000, text: "too late" }])

    await expect(run(d)).rejects.toThrow(AbortedError)
    // No separate connect phase: silence before the first byte is the same failure as silence after
    // it, because `fetch` only resolves once the first body byte is written anyway.
    expect(d.abortedAt()).toBe(T0 + OPTIMIZER_TIMEOUT_POLICY.idleMs)
    expect(d.chunks).toEqual([])
  })

  test("a stream that keeps heartbeating forever still hits the absolute cap", async () => {
    const d = driver(heartbeats(0, 600_000))

    await expect(run(d)).rejects.toThrow(AbortedError)
    expect(d.abortedAt()).toBe(T0 + OPTIMIZER_TIMEOUT_POLICY.totalMs)
    expect(d.chunks).toEqual([])
  })

  test("no heartbeat ever reaches the composer, including one landing between two text chunks", async () => {
    // The backend evaluates its "has text started?" filter when a tick resolves, not when the merged
    // stream hands the byte on, so a heartbeat can arrive after text has begun.
    const d = driver([
      { at: 0, text: HB },
      { at: 5_000, text: "### Objective\n" },
      { at: 5_100, text: HB },
      { at: 6_000, text: "Add a login form." },
      { at: 6_100 },
    ])

    expect(await run(d)).toBe("### Objective\nAdd a login form.")
    for (const chunk of d.chunks) expect(chunk).not.toContain(HB)
    expect(d.chunks).toEqual(["### Objective\n", "### Objective\nAdd a login form."])
  })

  test("a chunk carrying only heartbeats does not blank out what the user wrote", async () => {
    const d = driver([...heartbeats(0, 20_000), { at: 21_000, text: "### Objective" }, { at: 21_500 }])

    expect(await run(d)).toBe("### Objective")
    // One call, for the one chunk that had something to show.
    expect(d.chunks).toEqual(["### Objective"])
  })

  test("the NUL failure sentinel still parses once heartbeats are stripped", async () => {
    const d = driver([
      ...heartbeats(0, 10_000),
      { at: 11_000, text: `${OPTIMIZE_ERROR_MARK}rateLimit` },
      { at: 11_100 },
    ])

    const [text, code] = (await run(d)).split(OPTIMIZE_ERROR_MARK)
    expect(text).toBe("")
    expect(code).toBe("rateLimit")
  })

  test("a multi-byte character split across two reads is not mangled", async () => {
    // The scripted reader deals in whole strings; a real socket does not, so feed halves directly.
    const bytes = encoder.encode("… ✅")
    const halves = [bytes.slice(0, 2), bytes.slice(2)]
    let next = 0
    const chunks: string[] = []

    const body = await consumeOptimizerStream({
      reader: {
        read: async () => {
          const value = halves[next++]
          return value ? { done: false, value } : { done: true }
        },
      },
      progress: optimizerStarted(T0),
      now: () => T0,
      arm: () => {},
      onChunk: (visible) => chunks.push(visible),
    })

    expect(body).toBe("… ✅")
    expect(chunks[chunks.length - 1]).toBe("… ✅")
  })
})

describe("optimizer deadlines", () => {
  const policy: OptimizerTimeoutPolicy = { idleMs: 10_000, totalMs: 25_000 }

  test("the idle budget runs from the last byte", () => {
    const state = optimizerProgressed(optimizerStarted(T0), T0 + 4_000)

    expect(optimizerDeadline(state, policy)).toBe(T0 + 14_000)
    expect(optimizerDelay(state, T0 + 6_000, policy)).toBe(8_000)
  })

  test("the cap outranks the idle budget once the request is old enough", () => {
    const state = optimizerProgressed(optimizerStarted(T0), T0 + 20_000)

    expect(optimizerDeadline(state, policy)).toBe(T0 + 25_000)
  })

  test("an already-expired deadline fires at once rather than scheduling into the past", () => {
    expect(optimizerDelay(optimizerStarted(T0), T0 + 40_000, policy)).toBe(0)
  })
})

describe("stripOptimizerHeartbeat", () => {
  test("removes every heartbeat byte, wherever it lands in the stream", () => {
    const text = `${HB}### Objective${HB}${HB}\nAdd a login form.`

    expect(stripOptimizerHeartbeat(text)).toBe("### Objective\nAdd a login form.")
  })

  test("leaves the NUL failure sentinel alone so the reason code is still readable", () => {
    const body = `${HB}${OPTIMIZE_ERROR_MARK}rateLimit`

    const [text, code] = stripOptimizerHeartbeat(body).split(OPTIMIZE_ERROR_MARK)
    expect(text).toBe("")
    expect(code).toBe("rateLimit")
  })

  test("text with no heartbeat is returned untouched", () => {
    const text = "### Objective\nShip it."

    expect(stripOptimizerHeartbeat(text)).toBe(text)
  })
})
