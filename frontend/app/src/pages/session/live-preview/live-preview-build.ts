/**
 * Decides how the preview should react to incremental-rebuild progress reported by the
 * dev server manager.
 *
 * The preview status is polled on an interval, so `running` alone is not a reliable trigger:
 * a build that starts and finishes between two polls would never be observed as running, and
 * the iframe would keep showing stale output. The manager therefore bumps a monotonic
 * `sequence` every time a build starts, and we compare that instead.
 */
export type PreviewBuildInfo = {
  running: boolean
  startedAt: number | null
  durationMs: number | null
  ok: boolean | null
  trigger: string | null
  sequence: number
}

export type BuildReaction = {
  /** The sequence the caller should remember for the next poll. */
  sequence: number
  /** Whether the preview iframe should be reloaded now. */
  reload: boolean
}

export function reactToBuild(input: {
  build: PreviewBuildInfo | undefined
  lastSequence: number
}): BuildReaction {
  const build = input.build
  if (!build) return { sequence: input.lastSequence, reload: false }

  // Nothing new since the last poll.
  if (build.sequence <= input.lastSequence) return { sequence: input.lastSequence, reload: false }

  // A new build is still running: remember nothing yet, so we still reload when it lands.
  if (build.running) return { sequence: input.lastSequence, reload: false }

  // A new build finished. Only a successful one is worth reloading for — reloading after a
  // failed build would replace a working page with a broken one (or a blank screen).
  return { sequence: build.sequence, reload: build.ok === true }
}

/** Shortens a workspace-relative path for display, keeping the last two segments. */
export function shortenBuildTrigger(trigger: string | null | undefined): string | undefined {
  if (!trigger) return undefined
  const parts = trigger.split("/").filter(Boolean)
  if (parts.length <= 2) return parts.join("/") || undefined
  return `…/${parts.slice(-2).join("/")}`
}
