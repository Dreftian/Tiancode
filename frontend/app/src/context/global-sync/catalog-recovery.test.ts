import { describe, expect, test } from "bun:test"
import { CATALOG_RECOVERY_DELAYS_MS, createCatalogRecovery } from "./catalog-recovery"

function harness(initial: { size: number; booting: boolean }) {
  const state = { ...initial, refreshes: 0 }
  const timers: { run: () => void; delay: number; cancelled: boolean }[] = []
  const recovery = createCatalogRecovery({
    size: () => state.size,
    booting: () => state.booting,
    refresh: () => {
      state.refreshes += 1
    },
    schedule: (run, delay) => {
      const entry = { run, delay, cancelled: false }
      timers.push(entry)
      return {
        cancel: () => {
          entry.cancelled = true
        },
      }
    },
  })
  const fire = () => {
    const next = timers.find((timer) => !timer.cancelled && !("done" in timer))
    if (!next) return
    Object.assign(next, { done: true })
    next.run()
  }
  return { state, timers, recovery, fire }
}

describe("createCatalogRecovery", () => {
  test("asks again while the catalogue is empty, with growing waits", () => {
    const h = harness({ size: 0, booting: false })

    h.recovery.sync()
    expect(h.timers).toHaveLength(1)
    expect(h.timers[0]!.delay).toBe(CATALOG_RECOVERY_DELAYS_MS[0])

    h.fire()
    expect(h.state.refreshes).toBe(1)

    h.recovery.sync()
    h.fire()
    expect(h.state.refreshes).toBe(2)
    expect(h.timers[1]!.delay).toBe(CATALOG_RECOVERY_DELAYS_MS[1])
  })

  test("stops for good once providers arrive", () => {
    const h = harness({ size: 0, booting: false })
    h.recovery.sync()
    h.state.size = 3
    h.recovery.sync()
    expect(h.timers[0]!.cancelled).toBe(true)

    h.state.size = 0
    h.recovery.sync()
    // A catalogue that empties later is a real disconnect, not a slow boot: leave it alone.
    expect(h.timers.filter((timer) => !timer.cancelled)).toHaveLength(0)
  })

  test("gives up after the last delay so a genuinely empty install is left alone", () => {
    const h = harness({ size: 0, booting: false })
    for (let i = 0; i < CATALOG_RECOVERY_DELAYS_MS.length + 3; i++) {
      h.recovery.sync()
      h.fire()
    }
    expect(h.state.refreshes).toBe(CATALOG_RECOVERY_DELAYS_MS.length)
  })

  test("waits for the initial bootstrap instead of racing it", () => {
    const h = harness({ size: 0, booting: true })
    h.recovery.sync()
    expect(h.timers).toHaveLength(0)

    h.state.booting = false
    h.recovery.sync()
    expect(h.timers).toHaveLength(1)
  })

  test("stop cancels the pending retry", () => {
    const h = harness({ size: 0, booting: false })
    h.recovery.sync()
    h.recovery.stop()
    expect(h.timers[0]!.cancelled).toBe(true)
    h.recovery.sync()
    expect(h.timers).toHaveLength(1)
  })
})
