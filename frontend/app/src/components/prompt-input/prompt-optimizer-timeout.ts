/**
 * Timeout policy for the prompt optimizer request, plus the loop that consumes its body.
 *
 * The optimizer used to run under a single 30 s deadline for the *whole* request. That is wrong for
 * a reasoning model: the backend deliberately filters reasoning deltas out of the response body
 * (`Stream.filter(LLMEvent.is.textDelta)` in handlers/experimental.ts), so while the model thinks
 * the client receives zero bytes on a perfectly healthy connection. A user on GLM-5.3 hit exactly
 * that — the server logged "llm runtime selected" and then the client aborted 30 s later, showing
 * the bare "Couldn't optimize the prompt" toast with no explanation.
 *
 * What the client can actually observe, measured rather than assumed:
 *
 *  - `await fetch()` does NOT resolve when the server picks a status code. `@effect/platform-node`
 *    calls `writeHead` and then pulls the body stream; nothing calls `flushHeaders`, so Node keeps
 *    the header block in its own buffer until the first body write. Against a handler that waits
 *    2 s before writing anything, `fetch` resolved at ~2 s, not at ~0 s. Headers and first byte are
 *    therefore one event, and there is no separate "connection is up but silent" phase to measure.
 *  - So on a server that sends no heartbeat — an older build, or this one when the caller did not
 *    opt in — the whole thinking phase happens *before* the first byte. An earlier version of this
 *    file had that backwards: it justified a long post-headers idle window by the thinking phase,
 *    while on a silent server the idle window has not started yet and a short pre-headers deadline
 *    is exactly what kills the healthy stream.
 *
 * Hence one liveness budget, not two. `idleMs` runs from the start of the request and is reset by
 * every byte that arrives — the U+0001 heartbeat included — so it covers both "nothing has arrived
 * yet" and "nothing has arrived lately" with the same number, because those are the same failure
 * seen from two points in time. `totalMs` is the separate backstop for a stream that stays alive
 * but never finishes.
 */
export type OptimizerTimeoutPolicy = {
  /**
   * Longest silence tolerated: from `fetch()` to the first byte, and from any byte to the next.
   *
   * Floor comes from the measured failure — that request needed well over 30 s to its first byte,
   * so the old 30 s is demonstrably too tight. 90 s is 3× that, which covers the observed reasoning
   * phase with room to spare. A client that opts into heartbeats never spends more than 5 s of it
   * while the model reasons; the full budget is only ever reached against a server that sends
   * nothing at all, or during a mid-answer pause (heartbeats stop for good once text starts).
   */
  readonly idleMs: number
  /**
   * Absolute cap from `fetch()`. A stream that keeps dribbling bytes forever — or keeps heartbeating
   * after the model wedged — still cannot hold the composer hostage past this.
   */
  readonly totalMs: number
}

export const OPTIMIZER_TIMEOUT_POLICY: OptimizerTimeoutPolicy = {
  idleMs: 90_000,
  totalMs: 240_000,
}

export type OptimizerProgress = {
  /** When `fetch` was called. */
  readonly startedAt: number
  /** Last moment the request proved it was alive: the start, or any byte at all. */
  readonly lastProgressAt: number
}

export function optimizerStarted(now: number): OptimizerProgress {
  return { startedAt: now, lastProgressAt: now }
}

/**
 * A byte arrived. Called for every chunk, even one that decodes to nothing and even one that is
 * only heartbeat bytes: the point is liveness, not content.
 */
export function optimizerProgressed(state: OptimizerProgress, now: number): OptimizerProgress {
  return { ...state, lastProgressAt: now }
}

/** The moment the request should be aborted: whichever of the two budgets runs out first. */
export function optimizerDeadline(
  state: OptimizerProgress,
  policy: OptimizerTimeoutPolicy = OPTIMIZER_TIMEOUT_POLICY,
): number {
  return Math.min(state.lastProgressAt + policy.idleMs, state.startedAt + policy.totalMs)
}

/** Milliseconds to wait from `now` before aborting. Never negative: a past deadline fires at once. */
export function optimizerDelay(
  state: OptimizerProgress,
  now: number,
  policy: OptimizerTimeoutPolicy = OPTIMIZER_TIMEOUT_POLICY,
): number {
  return Math.max(0, optimizerDeadline(state, policy) - now)
}

/**
 * Liveness byte emitted by the backend while the model is producing reasoning and no text yet, and
 * only when the request asked for it (`heartbeat: true` — see groups/experimental.ts; callers that
 * do not ask still get a byte-identical text/plain body).
 *
 * Deliberately not NUL: NUL is already the failure sentinel that carries a reason code, and the two
 * must stay tellable apart. U+0001 never occurs in model text either.
 *
 * The backend merges the heartbeat into the body stream, so a heartbeat can land *between* two text
 * chunks as well as before the first one — strip every occurrence anywhere, never just a prefix.
 */
export const OPTIMIZE_HEARTBEAT_MARK = "\u0001"

/** Heartbeats are transport, not content: strip every one before the body is read or displayed. */
export function stripOptimizerHeartbeat(text: string): string {
  return text.includes(OPTIMIZE_HEARTBEAT_MARK) ? text.split(OPTIMIZE_HEARTBEAT_MARK).join("") : text
}

/** Just enough of `ReadableStreamDefaultReader` for the loop below to be driven by a fake. */
export type OptimizerChunkReader = {
  readonly read: () => Promise<{ readonly done: boolean; readonly value?: Uint8Array | undefined }>
}

export type OptimizerStreamOptions = {
  readonly reader: OptimizerChunkReader
  /** State from before `fetch` was called: `totalMs` is measured from there, not from the body. */
  readonly progress: OptimizerProgress
  /** Clock, injected so the loop can be driven in virtual time. */
  readonly now: () => number
  /**
   * Re-arm the abort timer to fire `delayMs` from now, replacing any previous arming. Called once
   * per chunk received, before the chunk has even been decoded, and expected to abort the request
   * when it fires — which surfaces here as `read()` rejecting.
   */
  readonly arm: (delayMs: number) => void
  /**
   * The body so far with heartbeats removed. Never called with an empty string, and never twice
   * with the same one: a chunk that was pure heartbeat adds nothing to show, so it must not cause
   * a composer write at all.
   */
  readonly onChunk: (visible: string) => void
  readonly policy?: OptimizerTimeoutPolicy
}

/**
 * Read the optimizer body to the end and return it with every heartbeat removed.
 *
 * Lives here rather than inside the component because the three things that can go wrong are all
 * timing: re-arming the timer on each chunk, keeping heartbeats out of the composer, and leaving the
 * NUL failure sentinel intact for the caller to split on. None of that needs a DOM.
 *
 * Rejects if the reader does — an abort from the armed timer included. The caller owns the
 * `AbortController` and therefore knows a timeout from a user's stop.
 */
export async function consumeOptimizerStream(options: OptimizerStreamOptions): Promise<string> {
  const policy = options.policy ?? OPTIMIZER_TIMEOUT_POLICY
  const decoder = new TextDecoder()
  let progress = options.progress
  let accumulated = ""
  let shown = ""

  while (true) {
    const { done, value } = await options.reader.read()
    if (done) break
    // Any byte proves the stream is alive, even one that decodes to nothing and even one carrying
    // only heartbeats: the timer is re-armed before the content is looked at.
    progress = optimizerProgressed(progress, options.now())
    options.arm(optimizerDelay(progress, options.now(), policy))

    const chunk = decoder.decode(value, { stream: true })
    if (!chunk) continue
    accumulated += chunk
    // Heartbeats are transport, not text: they must never reach the composer. A body that so far
    // holds nothing but heartbeats must not blank out what the user wrote, and one that grew by
    // nothing but a heartbeat must not rewrite the composer with what is already there.
    const visible = stripOptimizerHeartbeat(accumulated)
    if (!visible || visible === shown) continue
    shown = visible
    options.onChunk(visible)
  }

  return stripOptimizerHeartbeat(accumulated)
}
