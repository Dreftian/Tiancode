export type PreviewViewBounds = {
  x: number
  y: number
  width: number
  height: number
}

export const EMPTY_PREVIEW_VIEW_BOUNDS: PreviewViewBounds = { x: 0, y: 0, width: 0, height: 0 }

export function isUsablePreviewViewBounds(bounds: PreviewViewBounds | undefined) {
  return (
    bounds !== undefined &&
    Number.isFinite(bounds.x) &&
    Number.isFinite(bounds.y) &&
    Number.isFinite(bounds.width) &&
    Number.isFinite(bounds.height) &&
    bounds.width > 0 &&
    bounds.height > 0
  )
}
