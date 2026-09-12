import { describe, expect, test } from "bun:test"
import { bestWindow, parseWindowSourceId, rankSources } from "./window-rank"

const sources = [
  { id: "window:100:0", name: "Winedit11" },
  { id: "window:200:0", name: "Slack" },
  { id: "window:300:1", name: "Tiancode" },
  { id: "window:400:0", name: "Program Manager" },
]

describe("parseWindowSourceId", () => {
  test("splits a window source id and flags our own windows", () => {
    expect(parseWindowSourceId("window:132456:0")).toEqual({ handle: 132456, ownProcess: false })
    expect(parseWindowSourceId("window:9:1")).toEqual({ handle: 9, ownProcess: true })
  })

  test("screens and junk are not windows", () => {
    expect(parseWindowSourceId("screen:0:0")).toBeNull()
    expect(parseWindowSourceId("window:abc:0")).toBeNull()
    expect(parseWindowSourceId("nonsense")).toBeNull()
  })
})

describe("rankSources", () => {
  test("a window owned by the spawned process tree wins outright", () => {
    const ranked = rankSources({ sources, handles: [200], titles: [], appearedAfter: [], hints: ["winedit11"] })
    expect(ranked[0]!.id).toBe("window:200:0")
    expect(ranked[0]!.reason).toBe("handle")
  })

  test("never offers our own windows or shell chrome", () => {
    const ranked = rankSources({ sources, handles: [300, 400], titles: [], appearedAfter: [], hints: [] })
    // window:300 is ownProcess, window:400 is Program Manager: both are excluded before scoring.
    expect(ranked.map((item) => item.id)).not.toContain("window:300:1")
    expect(ranked.map((item) => item.id)).not.toContain("window:400:0")
  })

  test("the project name is a usable hint", () => {
    const ranked = rankSources({ sources, handles: [], titles: [], appearedAfter: [], hints: ["Winedit11"] })
    expect(ranked[0]!.id).toBe("window:100:0")
  })
})

describe("bestWindow", () => {
  test("a handle match is taken even against a tie", () => {
    const ranked = [
      { id: "a", name: "A", score: 100, reason: "handle" },
      { id: "b", name: "B", score: 100, reason: "hint" },
    ]
    expect(bestWindow(ranked)?.id).toBe("a")
  })

  test("asks the user rather than guessing between equals", () => {
    const ranked = [
      { id: "a", name: "A", score: 14, reason: "appeared" },
      { id: "b", name: "B", score: 14, reason: "appeared" },
    ]
    expect(bestWindow(ranked)).toBeNull()
  })

  test("weak evidence is no evidence", () => {
    // Mirroring the wrong window looks like a broken app, so the picker is the better answer.
    expect(bestWindow([{ id: "a", name: "A", score: 4, reason: "hint" }])).toBeNull()
    expect(bestWindow([])).toBeNull()
  })
})
