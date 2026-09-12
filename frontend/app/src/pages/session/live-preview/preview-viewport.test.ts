import { describe, expect, test } from "bun:test"
import { fittedPreviewViewport, nextZoomStep, normalizePreviewZoom, ZOOM_LADDER } from "./preview-viewport"

describe("fittedPreviewViewport", () => {
  test("uses every available pixel in Ajustar mode", () => {
    expect(fittedPreviewViewport({ width: 640, height: 480 }, undefined, 1, 0)).toEqual({
      width: 640,
      height: 480,
      scale: 1,
      frame: 0,
      mode: "auto",
      overflow: false,
    })
  })

  test("fits a desktop silhouette inside a narrow preview without clipping", () => {
    const viewport = fittedPreviewViewport({ width: 600, height: 400 }, { width: 1440, height: 900 }, 1, 8)

    expect(viewport.width).toBeLessThanOrEqual(600)
    expect(viewport.height).toBeLessThanOrEqual(400)
    expect(viewport.scale).toBeGreaterThan(0)
    expect(viewport.scale).toBeLessThan(1)
    expect(viewport.mode).toBe("auto")
    expect(viewport.overflow).toBe(false)
  })

  test("keeps the phone proportion while respecting its frame and the viewport", () => {
    const viewport = fittedPreviewViewport({ width: 500, height: 700 }, { width: 390, height: 844 }, 1, 12)

    expect(viewport.width).toBeLessThanOrEqual(500)
    expect(viewport.height).toBeLessThanOrEqual(700)
    expect(viewport.frame).toBe(12)
  })

  test("a manual zoom is exact even when the panel could show more", () => {
    const viewport = fittedPreviewViewport({ width: 1200, height: 1000 }, { width: 390, height: 844 }, 0.5, 12)

    expect(viewport.scale).toBe(0.5)
    expect(viewport.width).toBe(219)
    expect(viewport.height).toBe(446)
    expect(viewport.mode).toBe("manual")
    expect(viewport.overflow).toBe(false)
  })

  test("scales a device up to fill a panel larger than the emulated viewport", () => {
    const viewport = fittedPreviewViewport({ width: 1600, height: 1000 }, { width: 1280, height: 800 }, 1, 8)

    expect(viewport.scale).toBeGreaterThan(1)
    expect(viewport.width).toBeLessThanOrEqual(1600)
    expect(viewport.height).toBeLessThanOrEqual(1000)
  })

  test("keeps a manual zoom even when the panel is larger", () => {
    const viewport = fittedPreviewViewport({ width: 2400, height: 1400 }, { width: 1280, height: 800 }, 1.5, 8)

    expect(viewport.scale).toBe(1.5)
  })

  test("keeps even a framed device inside a panel that is being collapsed", () => {
    const viewport = fittedPreviewViewport({ width: 18, height: 10 }, { width: 390, height: 844 }, 1, 12)

    expect(viewport.width).toBeLessThanOrEqual(18)
    expect(viewport.height).toBeLessThanOrEqual(10)
    expect(viewport.frame).toBeLessThanOrEqual(5)
  })

  // The user's report: an FHD preset in a ~1060 px panel auto-fits to ~54 % and "+" used to be a
  // no-op because a manual zoom was only a ceiling on that fit. A true 100 % must be reachable.
  test("a 1920 px preset can be shown at a real 100 % inside a 1060 px panel, overflowing", () => {
    const auto = fittedPreviewViewport({ width: 1060, height: 700 }, { width: 1920, height: 1080 }, { mode: "auto" }, 8)
    expect(auto.scale).toBeCloseTo(0.535, 2)

    const full = fittedPreviewViewport({ width: 1060, height: 700 }, { width: 1920, height: 1080 }, { mode: "manual", scale: 1 }, 8)
    expect(full.scale).toBe(1)
    expect(full.width).toBe(1920 + 16)
    expect(full.height).toBe(1080 + 16)
    expect(full.mode).toBe("manual")
    expect(full.overflow).toBe(true)
  })

  test("fluid mode treats a manual zoom as page zoom without overflowing", () => {
    const viewport = fittedPreviewViewport({ width: 900, height: 600 }, undefined, { mode: "manual", scale: 1.25 }, 0)
    expect(viewport).toEqual({ width: 900, height: 600, scale: 1.25, frame: 0, mode: "manual", overflow: false })
  })

  test("the legacy numeric preference still means auto for 1 and manual otherwise", () => {
    expect(normalizePreviewZoom(1)).toEqual({ mode: "auto" })
    expect(normalizePreviewZoom(undefined)).toEqual({ mode: "auto" })
    expect(normalizePreviewZoom(0.5)).toEqual({ mode: "manual", scale: 0.5 })
    expect(normalizePreviewZoom(99)).toEqual({ mode: "manual", scale: 4 })
    expect(normalizePreviewZoom({ mode: "manual", scale: 0.01 })).toEqual({ mode: "manual", scale: 0.25 })
  })
})

describe("nextZoomStep", () => {
  test("steps to the neighbouring ladder value, not by a fixed delta", () => {
    expect(nextZoomStep(0.535, 1)).toBe(0.67)
    expect(nextZoomStep(0.535, -1)).toBe(0.5)
    expect(nextZoomStep(1, 1)).toBe(1.1)
    expect(nextZoomStep(1, -1)).toBe(0.9)
  })

  test("a value sitting on a ladder step moves to the next step", () => {
    expect(nextZoomStep(0.5, 1)).toBe(0.67)
    expect(nextZoomStep(0.5, -1)).toBe(0.33)
  })

  test("clamps at both ends of the ladder", () => {
    expect(nextZoomStep(ZOOM_LADDER[ZOOM_LADDER.length - 1], 1)).toBe(ZOOM_LADDER[ZOOM_LADDER.length - 1])
    expect(nextZoomStep(ZOOM_LADDER[0], -1)).toBe(ZOOM_LADDER[0])
    expect(nextZoomStep(10, 1)).toBe(4)
    expect(nextZoomStep(0.01, -1)).toBe(0.25)
  })
})
