export type PreviewDimensions = { width: number; height: number }

/**
 * How the preview is scaled inside the panel.
 *
 * - `auto`   — the device silhouette fills the panel in both directions (up or down). This is
 *              what the toolbar calls "Ajustar" and what the preview starts in.
 * - `manual` — an exact scale chosen with the +/− buttons or the 100 % reset. It may be larger
 *              than what fits, in which case the frame overflows and the panel scrolls.
 *
 * Before 1.0.42 a manual zoom was only a *ceiling* on the auto-fit scale, so "+" could never
 * take a 1920 px preset past the ~54 % that fits a 1000 px panel and a true 100 % was
 * unreachable. Numbers are still accepted for the persisted preference: 1 keeps meaning auto.
 */
export type PreviewZoom = { mode: "auto" } | { mode: "manual"; scale: number }

// zoom = 1 is the persisted default and means AUTO-FIT.
export const AUTO_ZOOM = 1

export const ZOOM_MIN = 0.25
export const ZOOM_MAX = 4

/** Steps the +/− buttons walk through; the current scale snaps to its neighbours. */
export const ZOOM_LADDER = [0.25, 0.33, 0.5, 0.67, 0.75, 0.9, 1, 1.1, 1.25, 1.5, 2, 3, 4] as const

export function normalizePreviewZoom(zoom: number | PreviewZoom | undefined): PreviewZoom {
  if (zoom === undefined) return { mode: "auto" }
  if (typeof zoom === "number") {
    if (zoom === AUTO_ZOOM || !Number.isFinite(zoom) || zoom <= 0) return { mode: "auto" }
    return { mode: "manual", scale: clampZoom(zoom) }
  }
  if (zoom.mode === "manual") return { mode: "manual", scale: clampZoom(zoom.scale) }
  return zoom
}

export function clampZoom(scale: number) {
  if (!Number.isFinite(scale)) return 1
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, scale))
}

/**
 * The ladder value strictly above (direction 1) or below (direction −1) `current`, so that
 * pressing "+" from an auto-fit of 54 % goes to 67 %, not to 74 %. Clamped to the ladder ends.
 */
export function nextZoomStep(current: number, direction: 1 | -1): number {
  const epsilon = 0.001
  if (direction > 0) {
    const next = ZOOM_LADDER.find((step) => step > current + epsilon)
    return next ?? ZOOM_LADDER[ZOOM_LADDER.length - 1]
  }
  for (let i = ZOOM_LADDER.length - 1; i >= 0; i -= 1) {
    if (ZOOM_LADDER[i] < current - epsilon) return ZOOM_LADDER[i]
  }
  return ZOOM_LADDER[0]
}

export type FittedPreviewViewport = {
  /** Size of the device frame (chrome included) as laid out in the panel. */
  width: number
  height: number
  scale: number
  frame: number
  mode: PreviewZoom["mode"]
  /** True when a manual scale makes the frame larger than the panel, so the panel must scroll. */
  overflow: boolean
}

export function fittedPreviewViewport(
  available: PreviewDimensions,
  device: PreviewDimensions | undefined,
  zoom: number | PreviewZoom,
  frame: number,
): FittedPreviewViewport {
  const boundedWidth = Math.max(0, available.width)
  const boundedHeight = Math.max(0, available.height)
  const requested = normalizePreviewZoom(zoom)

  // Fluid: the document fills the panel; a manual zoom scales it as a whole (page zoom) and
  // never overflows because the document keeps laying out at the panel's size.
  if (!device) {
    return {
      width: boundedWidth,
      height: boundedHeight,
      scale: requested.mode === "manual" ? requested.scale : 1,
      frame: 0,
      mode: requested.mode,
      overflow: false,
    }
  }

  // Keep the frame inside the available bounds even while the host panel is
  // being resized down to a very small value.  The previous calculation kept
  // the requested frame after the content scale reached zero, which could
  // make the device shell wider than its Sandbox container and introduce a
  // horizontal scrollbar.
  const boundedFrame = Math.min(Math.max(0, frame), Math.floor(Math.min(boundedWidth, boundedHeight) / 2))
  const gutter = Math.min(16, Math.max(0, Math.min(boundedWidth - boundedFrame * 2, boundedHeight - boundedFrame * 2)))
  const width = Math.max(0, boundedWidth - boundedFrame * 2 - gutter)
  const height = Math.max(0, boundedHeight - boundedFrame * 2 - gutter)
  // Fit-to-panel in both directions: in auto the device scales up or down to use the whole
  // preview instead of capping at 100% and stranding dead margins.
  const autoScale = Math.min(width / device.width, height / device.height)

  if (requested.mode === "auto") {
    return {
      width: Math.min(boundedWidth, Math.round(device.width * autoScale + boundedFrame * 2)),
      height: Math.min(boundedHeight, Math.round(device.height * autoScale + boundedFrame * 2)),
      scale: autoScale,
      frame: boundedFrame,
      mode: "auto",
      overflow: false,
    }
  }

  // Manual: the scale is exact. The frame keeps the full device silhouette even when that
  // is bigger than the panel; the caller makes the panel scrollable in that case.
  const scale = requested.scale
  const manualFrame = Math.max(0, frame)
  const frameWidth = Math.round(device.width * scale + manualFrame * 2)
  const frameHeight = Math.round(device.height * scale + manualFrame * 2)
  return {
    width: frameWidth,
    height: frameHeight,
    scale,
    frame: manualFrame,
    mode: "manual",
    overflow: frameWidth > boundedWidth || frameHeight > boundedHeight,
  }
}
