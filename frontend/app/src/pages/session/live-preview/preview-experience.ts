import type { PreviewDimensions } from "./preview-viewport"

export type PreviewTimelineKind = "loaded" | "reloaded" | "failed" | "runtime"

export type PreviewTimelineEntry = {
  id: number
  at: number
  kind: PreviewTimelineKind
  detail: string
}

export function orientedPreviewDimensions(dimensions: PreviewDimensions | undefined, rotated: boolean) {
  if (!dimensions || !rotated) return dimensions
  return { width: dimensions.height, height: dimensions.width }
}

// The timeline reports events confirmed by the runtime. It intentionally does
// not represent a pixel diff, because the iframe transport cannot always make
// a screenshot available to the renderer.
export function appendPreviewTimeline(
  entries: readonly PreviewTimelineEntry[],
  next: PreviewTimelineEntry,
  limit = 12,
): PreviewTimelineEntry[] {
  const previous = entries.at(-1)
  if (previous?.kind === next.kind && previous.detail === next.detail) return [...entries]
  return [...entries.slice(-(Math.max(1, limit) - 1)), next]
}
