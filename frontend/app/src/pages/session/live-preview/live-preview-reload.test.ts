import { describe, expect, test } from "bun:test"
import { createReloadScheduler } from "./live-preview-reload"

// Deterministic timers: each scheduled callback is stored with its due time and run by
// advancing a virtual clock.
function fakeTimers() {
  let now = 0
  let nextId = 1
  const timers = new Map<number, { at: number; fn: () => void }>()
  return {
    setTimeout: (fn: () => void, ms: number) => {
      const id = nextId++
      timers.set(id, { at: now + ms, fn })
      return id
    },
    clearTimeout: (id: number) => {
      timers.delete(id)
    },
    advance(ms: number) {
      const target = now + ms
      for (;;) {
        const due = [...timers.entries()].filter(([, t]) => t.at <= target).sort((a, b) => a[1].at - b[1].at)[0]
        if (!due) break
        timers.delete(due[0])
        now = due[1].at
        due[1].fn()
      }
      now = target
    },
    pending: () => timers.size,
  }
}

function harness(delayMs = 250, maxInFlightMs = 8_000) {
  const clock = fakeTimers()
  const runs: (string | undefined)[] = []
  const scheduler = createReloadScheduler({
    delayMs,
    maxInFlightMs,
    run: (reason) => runs.push(reason),
    setTimeout: clock.setTimeout,
    clearTimeout: clock.clearTimeout,
  })
  return { clock, runs, scheduler }
}

describe("createReloadScheduler", () => {
  test("a burst of requests becomes a single reload after the debounce", () => {
    const { clock, runs, scheduler } = harness()
    scheduler.request("index.html")
    clock.advance(100)
    scheduler.request("assets/app.css")
    clock.advance(100)
    scheduler.request("assets/app.js")
    expect(runs).toEqual([])
    clock.advance(250)
    expect(runs).toEqual(["assets/app.js"])
  })

  test("requests during an in-flight reload wait for it and then reload once more", () => {
    const { clock, runs, scheduler } = harness()
    scheduler.request("a")
    clock.advance(250)
    expect(runs).toEqual(["a"])
    expect(scheduler.busy()).toBe(true)

    scheduler.request("b")
    scheduler.request("c")
    clock.advance(1_000)
    // Still loading "a": nothing restarted underneath it.
    expect(runs).toEqual(["a"])

    scheduler.settled()
    clock.advance(250)
    expect(runs).toEqual(["a", "c"])
    scheduler.settled()
    expect(scheduler.busy()).toBe(false)
  })

  test("a reload that never settles is released by the watchdog", () => {
    const { clock, runs, scheduler } = harness(250, 2_000)
    scheduler.request("a")
    clock.advance(250)
    scheduler.request("b")
    clock.advance(1_500)
    expect(runs).toEqual(["a"])
    // The watchdog fires 2 s after "a" started (t = 2250); the dirty request then goes through
    // the 250 ms debounce, so the second reload lands at t = 2500.
    clock.advance(600)
    expect(runs).toEqual(["a"])
    clock.advance(300)
    expect(runs).toEqual(["a", "b"])
  })

  test("settling without a change pending leaves the scheduler idle", () => {
    const { clock, runs, scheduler } = harness()
    scheduler.request()
    clock.advance(250)
    scheduler.settled()
    clock.advance(5_000)
    expect(runs).toEqual([undefined])
    expect(scheduler.busy()).toBe(false)
  })

  test("dispose cancels everything", () => {
    const { clock, runs, scheduler } = harness()
    scheduler.request("a")
    scheduler.dispose()
    clock.advance(1_000)
    expect(runs).toEqual([])
    expect(clock.pending()).toBe(0)
    scheduler.request("b")
    clock.advance(1_000)
    expect(runs).toEqual([])
  })
})
