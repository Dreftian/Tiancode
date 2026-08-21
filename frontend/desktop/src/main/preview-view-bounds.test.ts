import { expect, test } from "bun:test"
import { EMPTY_PREVIEW_VIEW_BOUNDS, isUsablePreviewViewBounds } from "./preview-view-bounds"

test("only permits finite preview bounds with a visible area", () => {
  expect(isUsablePreviewViewBounds({ x: 20, y: 40, width: 800, height: 600 })).toBe(true)
  expect(isUsablePreviewViewBounds(EMPTY_PREVIEW_VIEW_BOUNDS)).toBe(false)
  expect(isUsablePreviewViewBounds({ x: 0, y: 0, width: -1, height: 10 })).toBe(false)
  expect(isUsablePreviewViewBounds({ x: Number.NaN, y: 0, width: 10, height: 10 })).toBe(false)
})
