/**
 * Coalesces the flood of "something changed" signals the preview receives while an agent
 * works (one per write/edit tool part, one per session diff, one per watcher event, plus the
 * dev-server poll) into a calm sequence of reloads:
 *
 * - requests are debounced for `delayMs` so a burst of writes becomes one reload;
 * - while a reload is in flight, further requests only mark it dirty; the next reload starts
 *   as soon as the current document has loaded (or failed), so the preview never restarts a
 *   half-loaded page and never falls behind by more than one reload;
 * - a load that never reports back is released after `maxInFlightMs`, so a broken document
 *   cannot freeze future reloads.
 *
 * The scheduler is pure state + timers so it can be tested without a DOM.
 */
export type ReloadScheduler = {
  /** Ask for a reload; safe to call at any rate. */
  request: (reason?: string) => void
  /** The reload started by `run` has finished loading (successfully or not). */
  settled: () => void
  /** True while a reload is queued or in flight. */
  busy: () => boolean
  /** The reason attached to the most recent request, for status labels. */
  lastReason: () => string | undefined
  dispose: () => void
}

export type ReloadSchedulerOptions = {
  /** Debounce window for a burst of requests. */
  delayMs: number
  /** Release a stuck in-flight reload after this long. */
  maxInFlightMs?: number
  /** Performs the reload; the scheduler calls `settled()` itself only on timeout. */
  run: (reason?: string) => void
  setTimeout?: (fn: () => void, ms: number) => number
  clearTimeout?: (id: number) => void
}

export function createReloadScheduler(options: ReloadSchedulerOptions): ReloadScheduler {
  const schedule = options.setTimeout ?? ((fn, ms) => globalThis.setTimeout(fn, ms) as unknown as number)
  const cancel = options.clearTimeout ?? ((id) => globalThis.clearTimeout(id))
  const maxInFlight = options.maxInFlightMs ?? 8_000

  let debounce: number | undefined
  let watchdog: number | undefined
  let inFlight = false
  let dirty = false
  let disposed = false
  let reason: string | undefined

  const clearDebounce = () => {
    if (debounce !== undefined) {
      cancel(debounce)
      debounce = undefined
    }
  }
  const clearWatchdog = () => {
    if (watchdog !== undefined) {
      cancel(watchdog)
      watchdog = undefined
    }
  }

  const fire = () => {
    debounce = undefined
    if (disposed) return
    if (inFlight) {
      dirty = true
      return
    }
    inFlight = true
    dirty = false
    clearWatchdog()
    watchdog = schedule(() => {
      watchdog = undefined
      settled()
    }, maxInFlight)
    options.run(reason)
  }

  const settled = () => {
    if (disposed) return
    clearWatchdog()
    if (!inFlight) return
    inFlight = false
    if (dirty) {
      dirty = false
      // The document that just loaded predates the last change: go again right away, but
      // still through the debounce so a burst landing now is folded into this reload.
      clearDebounce()
      debounce = schedule(fire, options.delayMs)
    }
  }

  return {
    request: (next) => {
      if (disposed) return
      if (next !== undefined) reason = next
      clearDebounce()
      debounce = schedule(fire, options.delayMs)
    },
    settled,
    busy: () => inFlight || debounce !== undefined,
    lastReason: () => reason,
    dispose: () => {
      disposed = true
      clearDebounce()
      clearWatchdog()
    },
  }
}
