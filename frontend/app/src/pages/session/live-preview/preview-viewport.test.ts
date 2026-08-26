import { describe, expect, test } from "bun:test"
import { fittedPreviewViewport } from "./preview-viewport"

describe("fittedPreviewViewport", () => {
  test("uses every available pixel in Ajustar mode", () => {
    expect(fittedPreviewViewport({ width: 640, height: 480 }, undefined, 1, 0)).toEqual({
      width: 640,
      height: 480,
      scale: 1,
      frame: 0,
    })
  })

  test("fits a desktop silhouette inside a narrow preview without clipping", () => {
    const viewport = fittedPreviewViewport({ width: 600, height: 400 }, { width: 1440, height: 900 }, 1, 8)

    expect(viewport.width).toBeLessThanOrEqual(600)
    expect(viewport.height).toBeLessThanOrEqual(400)
    expect(viewport.scale).toBeGreaterThan(0)
    expect(viewport.scale).toBeLessThan(1)
  })

  test("keeps the phone proportion while respecting its frame and the viewport", () => {
    const viewport = fittedPreviewViewport({ width: 500, height: 700 }, { width: 390, height: 844 }, 1, 12)

    expect(viewport.width).toBeLessThanOrEqual(500)
    expect(viewport.height).toBeLessThanOrEqual(700)
    expect(viewport.frame).toBe(12)
  })

  test("never expands a selected device beyond the requested zoom or the available space", () => {
    const viewport = fittedPreviewViewport({ width: 1200, height: 1000 }, { width: 390, height: 844 }, 0.5, 12)

    expect(viewport.scale).toBe(0.5)
    expect(viewport.width).toBe(219)
    expect(viewport.height).toBe(446)
  })

  test("scales a device up to fill a panel larger than the emulated viewport", () => {
    const viewport = fittedPreviewViewport({ width: 1600, height: 1000 }, { width: 1280, height: 800 }, 1, 8)

    expect(viewport.scale).toBeGreaterThan(1)
    expect(viewport.width).toBeLessThanOrEqual(1600)
    expect(viewport.height).toBeLessThanOrEqual(1000)
  })

  test("keeps a manual zoom ceiling even when the panel is larger", () => {
    const viewport = fittedPreviewViewport({ width: 2400, height: 1400 }, { width: 1280, height: 800 }, 1.5, 8)

    expect(viewport.scale).toBe(1.5)
  })

  test("keeps even a framed device inside a panel that is being collapsed", () => {
    const viewport = fittedPreviewViewport({ width: 18, height: 10 }, { width: 390, height: 844 }, 1, 12)

    expect(viewport.width).toBeLessThanOrEqual(18)
    expect(viewport.height).toBeLessThanOrEqual(10)
    expect(viewport.frame).toBeLessThanOrEqual(5)
  })
})
