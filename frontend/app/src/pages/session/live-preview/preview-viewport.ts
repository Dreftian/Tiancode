export type PreviewDimensions = { width: number; height: number }

// zoom = 1 is the persisted default and means AUTO-FIT: the device fills the
// panel in both directions (up or down). Any other value is a manual ceiling.
export const AUTO_ZOOM = 1

export function fittedPreviewViewport(
  available: PreviewDimensions,
  device: PreviewDimensions | undefined,
  zoom: number,
  frame: number,
) {
  if (!device) {
    return {
      width: Math.max(0, available.width),
      height: Math.max(0, available.height),
      scale: 1,
      frame: 0,
    }
  }

  // Keep the frame inside the available bounds even while the host panel is
  // being resized down to a very small value.  The previous calculation kept
  // the requested frame after the content scale reached zero, which could
  // make the device shell wider than its Sandbox container and introduce a
  // horizontal scrollbar.
  const boundedWidth = Math.max(0, available.width)
  const boundedHeight = Math.max(0, available.height)
  const boundedFrame = Math.min(Math.max(0, frame), Math.floor(Math.min(boundedWidth, boundedHeight) / 2))
  const gutter = Math.min(16, Math.max(0, Math.min(boundedWidth - boundedFrame * 2, boundedHeight - boundedFrame * 2)))
  const width = Math.max(0, boundedWidth - boundedFrame * 2 - gutter)
  const height = Math.max(0, boundedHeight - boundedFrame * 2 - gutter)
  // Fit-to-panel in both directions: in auto (zoom = 1) the device scales up
  // or down to use the whole preview instead of capping at 100% and stranding
  // dead margins; a manual zoom acts as the ceiling.
  const scale =
    zoom === AUTO_ZOOM
      ? Math.min(width / device.width, height / device.height)
      : Math.min(Math.max(0, zoom), width / device.width, height / device.height)

  return {
    width: Math.min(boundedWidth, Math.round(device.width * scale + boundedFrame * 2)),
    height: Math.min(boundedHeight, Math.round(device.height * scale + boundedFrame * 2)),
    scale,
    frame: boundedFrame,
  }
}
