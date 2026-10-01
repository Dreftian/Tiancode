import { describe, expect, test } from "bun:test"
import { sessionPanelLayout } from "./session-panel-layout"

describe("sessionPanelLayout", () => {
  test("keeps one V2 owner while changing panel geometry", () => {
    expect(sessionPanelLayout({ review: false, files: false })).toEqual({
      visible: false,
      stacked: false,
    })
    expect(sessionPanelLayout({ review: true, files: false })).toEqual({
      visible: true,
      stacked: false,
    })
    expect(sessionPanelLayout({ review: false, files: true })).toEqual({
      visible: true,
      stacked: false,
    })
    expect(sessionPanelLayout({ review: true, files: true })).toEqual({
      visible: true,
      stacked: false,
    })
  })

  test("side terminal opens the column and stacks under review or files", () => {
    expect(sessionPanelLayout({ review: false, files: false, terminal: true })).toEqual({
      visible: true,
      stacked: false,
    })
    expect(sessionPanelLayout({ review: true, files: false, terminal: true })).toEqual({
      visible: true,
      stacked: true,
    })
    expect(sessionPanelLayout({ review: false, files: true, terminal: true })).toEqual({
      visible: true,
      stacked: true,
    })
  })
})
