import { describe, expect, test } from "bun:test"
import {
  MIRROR_BLURRED_MS,
  MIRROR_FOCUSED_MS,
  MIRROR_STOPPED_MS,
  PREVIEW_POLL_ACTIVE_MS,
  PREVIEW_POLL_QUIET_MS,
  PREVIEW_POLL_READY_MS,
  mirrorFrameInterval,
  previewPollInterval,
  shouldArmMirror,
  shouldFetchPreviewLogs,
} from "./preview-poll"

describe("previewPollInterval", () => {
  test("polls fast while the server starts or a build runs", () => {
    expect(previewPollInterval({ status: "starting", building: false, desktop: false })).toBe(PREVIEW_POLL_ACTIVE_MS)
    expect(previewPollInterval({ status: "ready", building: true, desktop: false })).toBe(PREVIEW_POLL_ACTIVE_MS)
  })

  test("settles down once the app is just running", () => {
    expect(previewPollInterval({ status: "ready", building: false, desktop: false })).toBe(PREVIEW_POLL_READY_MS)
  })

  test("goes quiet when there is nothing running", () => {
    for (const status of ["idle", "stopped", "error", undefined] as const) {
      expect(previewPollInterval({ status, building: false, desktop: false })).toBe(PREVIEW_POLL_QUIET_MS)
    }
  })
})

describe("shouldFetchPreviewLogs", () => {
  test("fetches while the Sandbox console is on screen", () => {
    expect(shouldFetchPreviewLogs({ status: "ready", building: false, desktop: true })).toBe(true)
  })

  test("fetches while starting or building, which is when the error appears", () => {
    expect(shouldFetchPreviewLogs({ status: "starting", building: false, desktop: false })).toBe(true)
    expect(shouldFetchPreviewLogs({ status: "ready", building: true, desktop: false })).toBe(true)
  })

  test("does not pull 500 log lines every couple of seconds for nothing", () => {
    expect(shouldFetchPreviewLogs({ status: "ready", building: false, desktop: false })).toBe(false)
    expect(shouldFetchPreviewLogs({ status: "idle", building: false, desktop: false })).toBe(false)
  })
})

describe("mirrorFrameInterval", () => {
  test("captures fastest only while the user is looking at it", () => {
    expect(mirrorFrameInterval({ visible: true, focused: true })).toBe(MIRROR_FOCUSED_MS)
    expect(mirrorFrameInterval({ visible: true, focused: false })).toBe(MIRROR_BLURRED_MS)
  })

  test("a hidden panel stops the timer entirely", () => {
    // Each tick photographs every window on the desktop; running that for a panel nobody can see
    // is pure cost.
    expect(mirrorFrameInterval({ visible: false, focused: true })).toBe(MIRROR_STOPPED_MS)
  })
})

describe("shouldArmMirror", () => {
  const armed = { isDesktop: true, status: "ready" as const, pid: 1234, local: true, available: true }

  test("arms for a running local desktop app with a pid", () => {
    expect(shouldArmMirror(armed)).toBe(true)
  })

  test("never arms without a window to find", () => {
    expect(shouldArmMirror({ ...armed, isDesktop: false })).toBe(false)
    expect(shouldArmMirror({ ...armed, status: "starting" })).toBe(false)
    expect(shouldArmMirror({ ...armed, pid: null })).toBe(false)
    expect(shouldArmMirror({ ...armed, pid: 0 })).toBe(false)
  })

  test("never arms against a pid from another machine", () => {
    // A WSL or remote sidecar reports a pid in its own namespace; matching it against this
    // desktop's windows would confidently mirror something unrelated.
    expect(shouldArmMirror({ ...armed, local: false })).toBe(false)
  })

  test("never arms where the platform has no mirror", () => {
    expect(shouldArmMirror({ ...armed, available: false })).toBe(false)
  })
})
