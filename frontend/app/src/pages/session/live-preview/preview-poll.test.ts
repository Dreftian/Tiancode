import { describe, expect, test } from "bun:test"
import {
  PREVIEW_POLL_ACTIVE_MS,
  PREVIEW_POLL_QUIET_MS,
  PREVIEW_POLL_READY_MS,
  previewPollInterval,
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
