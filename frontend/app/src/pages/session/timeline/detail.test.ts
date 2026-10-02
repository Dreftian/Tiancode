import { describe, expect, test } from "bun:test"
import type { Part } from "@tiancode-ai/sdk/v2"
import {
  clonePreset,
  legacyView,
  parseTimelineDetail,
  partCategory,
  partOpen,
  partVisible,
  timelinePreset,
  timelinePresets,
  transcriptViewDetail,
} from "./detail"

const tool = (name: string, state: Record<string, unknown> = { status: "completed", metadata: {} }) =>
  ({ id: name, type: "tool", tool: name, state }) as unknown as Part
const reasoning = { id: "r", type: "reasoning", text: "thinking" } as unknown as Part
const text = { id: "t", type: "text", text: "hello" } as unknown as Part

describe("timeline detail", () => {
  test("every preset is recognised as itself", () => {
    for (const preset of timelinePresets) expect(timelinePreset(clonePreset(preset.id))).toBe(preset.id)
  })

  test("a changed category is custom", () => {
    const detail = clonePreset("compact")
    detail.tools = { placement: "separate" }
    expect(timelinePreset(detail)).toBeUndefined()
  })

  test("expansion of hidden categories does not break preset matching", () => {
    const detail = clonePreset("quiet")
    detail.shell.details = "expanded"
    expect(timelinePreset(detail)).toBe("quiet")
  })

  test("the older views map to presets without losing what users saw", () => {
    expect(timelinePreset(transcriptViewDetail("normal"))).toBe("compact")
    expect(timelinePreset(transcriptViewDetail("detailed"))).toBe("detailed")
    expect(transcriptViewDetail("thinking").thinking.placement).toBe("grouped")
    expect(legacyView(transcriptViewDetail("thinking"))).toBe("thinking")
    expect(legacyView(clonePreset("compact"))).toBe("normal")
    expect(legacyView(clonePreset("everything"))).toBe("detailed")
  })

  test("parse accepts a stored detail and rejects garbage", () => {
    expect(parseTimelineDetail(clonePreset("everything"))).toEqual(clonePreset("everything"))
    expect(parseTimelineDetail(undefined)).toBeUndefined()
    expect(parseTimelineDetail({ shell: { placement: "wild" } })).toBeUndefined()
    const missingDetails = { ...clonePreset("compact"), shell: { placement: "separate" } }
    expect(parseTimelineDetail(missingDetails)?.shell).toEqual({ placement: "separate", details: "collapsed" })
  })

  test("categories follow tool names", () => {
    expect(partCategory(tool("bash"))).toBe("shell")
    expect(partCategory(tool("apply_patch"))).toBe("edit")
    expect(partCategory(tool("task"))).toBe("subagents")
    expect(partCategory(tool("read"))).toBe("tools")
    expect(partCategory(reasoning)).toBe("thinking")
    expect(partCategory(text)).toBeUndefined()
  })

  test("hidden categories drop their parts but keep failures", () => {
    const quiet = clonePreset("text-only")
    expect(partVisible(text, quiet)).toBe(true)
    expect(partVisible(tool("read"), quiet)).toBe(false)
    expect(partVisible(reasoning, quiet)).toBe(false)
    expect(partVisible(tool("bash", { status: "completed", metadata: { exit: 1 } }), quiet)).toBe(true)
    expect(partVisible(tool("bash", { status: "completed", metadata: { exit: 0 } }), quiet)).toBe(false)
    expect(partVisible(tool("edit", { status: "error", error: "x" }), quiet)).toBe(true)
  })

  test("only separate + expanded categories start open", () => {
    expect(partOpen(tool("bash"), clonePreset("everything"))).toBe(true)
    expect(partOpen(tool("bash"), clonePreset("compact"))).toBe(false)
    expect(partOpen(tool("read"), clonePreset("everything"))).toBeUndefined()
  })
})
