export type PreviewDimensions = { width: number; height: number }

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
  const scale = Math.min(1, Math.max(0, zoom), width / device.width, height / device.height)

  return {
    width: Math.min(boundedWidth, Math.round(device.width * scale + boundedFrame * 2)),
    height: Math.min(boundedHeight, Math.round(device.height * scale + boundedFrame * 2)),
    scale,
    frame: boundedFrame,
  }
}
