import { describe, expect, test } from "bun:test"
import {
  clampLiveViewWidth,
  LIVE_VIEW_CHAT_WIDTH_MIN,
  LIVE_VIEW_WIDTH_MAX,
  LIVE_VIEW_WIDTH_MIN,
  LIVE_VIEW_WIDTH_PREFERRED_MIN,
  liveViewWidthBounds,
} from "./live-view-width"

describe("liveViewWidthBounds", () => {
  test("reserves room for the conversation when the window narrows", () => {
    const bounds = liveViewWidthBounds({ available: 1000 })

    expect(bounds.max).toBe(1000 - LIVE_VIEW_CHAT_WIDTH_MIN)
    expect(bounds.min).toBe(LIVE_VIEW_WIDTH_PREFERRED_MIN)
  })

  test("lowers the drag minimum instead of overflowing a constrained row", () => {
    const bounds = liveViewWidthBounds({ available: 700 })

    expect(bounds.max).toBe(LIVE_VIEW_WIDTH_MIN)
    expect(bounds.min).toBe(LIVE_VIEW_WIDTH_MIN)
  })

  test("keeps large displays useful without a stale 920px ceiling", () => {
    expect(liveViewWidthBounds({ available: 2400 }).max).toBe(LIVE_VIEW_WIDTH_MAX)
  })
})

describe("clampLiveViewWidth", () => {
  test("squeezes a persisted wide Sandbox when the application window shrinks", () => {
    expect(clampLiveViewWidth({ width: 1200, available: 1000 })).toBe(1000 - LIVE_VIEW_CHAT_WIDTH_MIN)
  })

  test("keeps the stored width until the row is first measured", () => {
    expect(clampLiveViewWidth({ width: 900, available: undefined })).toBe(900)
  })
})
