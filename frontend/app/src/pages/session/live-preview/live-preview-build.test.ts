import { describe, expect, test } from "bun:test"
import { reactToBuild, shortenBuildTrigger, type PreviewBuildInfo } from "./live-preview-build"

const build = (over: Partial<PreviewBuildInfo> = {}): PreviewBuildInfo => ({
  running: false,
  startedAt: null,
  durationMs: null,
  ok: null,
  trigger: null,
  sequence: 0,
  ...over,
})

describe("reactToBuild", () => {
  test("does nothing when the server reports no build info", () => {
    expect(reactToBuild({ build: undefined, lastSequence: 3 })).toEqual({ sequence: 3, reload: false })
  })

  test("does nothing while the sequence is unchanged", () => {
    const info = build({ sequence: 3, ok: true })
    expect(reactToBuild({ build: info, lastSequence: 3 })).toEqual({ sequence: 3, reload: false })
  })

  test("waits while a newly started build is still running", () => {
    const info = build({ sequence: 4, running: true })
    // The sequence is deliberately NOT advanced: otherwise the completion poll would look
    // unchanged and the reload would be skipped entirely.
    expect(reactToBuild({ build: info, lastSequence: 3 })).toEqual({ sequence: 3, reload: false })
  })

  test("reloads once a new build finishes successfully", () => {
    const info = build({ sequence: 4, ok: true, durationMs: 820 })
    expect(reactToBuild({ build: info, lastSequence: 3 })).toEqual({ sequence: 4, reload: true })
  })

  test("advances without reloading when the build failed", () => {
    const info = build({ sequence: 4, ok: false })
    expect(reactToBuild({ build: info, lastSequence: 3 })).toEqual({ sequence: 4, reload: false })
  })

  test("catches a build that started and finished between two polls", () => {
    // Never observed as running, yet the sequence jumped: still reloads.
    const info = build({ sequence: 7, ok: true })
    expect(reactToBuild({ build: info, lastSequence: 3 })).toEqual({ sequence: 7, reload: true })
  })

  test("does not reload twice for the same build", () => {
    const info = build({ sequence: 4, ok: true })
    const first = reactToBuild({ build: info, lastSequence: 3 })
    expect(first.reload).toBe(true)
    expect(reactToBuild({ build: info, lastSequence: first.sequence }).reload).toBe(false)
  })
})

describe("shortenBuildTrigger", () => {
  test("returns undefined for absent triggers", () => {
    expect(shortenBuildTrigger(null)).toBeUndefined()
    expect(shortenBuildTrigger(undefined)).toBeUndefined()
    expect(shortenBuildTrigger("")).toBeUndefined()
  })

  test("shows the file name, which is what fits in the header row", () => {
    expect(shortenBuildTrigger("App.tsx")).toBe("App.tsx")
    expect(shortenBuildTrigger("src/App.tsx")).toBe("App.tsx")
    expect(shortenBuildTrigger("packages/web/src/components/App.tsx")).toBe("App.tsx")
    expect(shortenBuildTrigger("src\\components\\Card.tsx")).toBe("Card.tsx")
  })

  test("a very long file name is elided rather than cut by the layout", () => {
    expect(shortenBuildTrigger("src/a-really-long-generated-chunk-name-here.js")).toBe(
      "a-really-long-generated-chu…",
    )
  })
})
