// The Sandbox lives next to the conversation on wide screens. Its persisted
// preference must never force the conversation out of the viewport after a
// window resize, but it should still be able to grow on large displays.
export const LIVE_VIEW_WIDTH_MIN = 320
export const LIVE_VIEW_WIDTH_PREFERRED_MIN = 420
export const LIVE_VIEW_WIDTH_MAX = 1600
export const LIVE_VIEW_CHAT_WIDTH_MIN = 450

export function liveViewWidthBounds(input: { available: number | undefined }) {
  if (input.available === undefined) {
    return { min: LIVE_VIEW_WIDTH_PREFERRED_MIN, max: LIVE_VIEW_WIDTH_MAX }
  }

  const max = Math.min(LIVE_VIEW_WIDTH_MAX, Math.max(LIVE_VIEW_WIDTH_MIN, input.available - LIVE_VIEW_CHAT_WIDTH_MIN))
  return { min: Math.min(LIVE_VIEW_WIDTH_PREFERRED_MIN, max), max }
}

// `available` is undefined until the session row has been measured. Keep the
// stored value for that first frame; the ResizeObserver immediately applies
// the measured constraint afterwards.
export function clampLiveViewWidth(input: { width: number; available: number | undefined }) {
  if (input.available === undefined) return Math.min(LIVE_VIEW_WIDTH_MAX, Math.max(LIVE_VIEW_WIDTH_MIN, input.width))
  const bounds = liveViewWidthBounds(input)
  return Math.min(bounds.max, Math.max(bounds.min, input.width))
}
