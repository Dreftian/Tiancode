import { createSignal, onCleanup } from "solid-js"

/**
 * A clock that ticks once a minute, for relative timestamps that must re-render on their own
 * ("2 minutes ago") rather than only when their data changes.
 *
 * The first tick is aligned to the next wall-clock minute instead of one minute from now, so
 * every consumer flips at the same moment regardless of when the layout mounted.
 *
 * Must be called from a reactive owner: it registers onCleanup for its own timers.
 */
export function createSortClock(): () => number {
  const [now, setNow] = createSignal(Date.now())

  let interval: ReturnType<typeof setInterval> | undefined
  const timeout = setTimeout(
    () => {
      setNow(Date.now())
      interval = setInterval(() => setNow(Date.now()), 60_000)
    },
    60_000 - (Date.now() % 60_000),
  )

  onCleanup(() => {
    clearTimeout(timeout)
    if (interval) clearInterval(interval)
  })

  return now
}
