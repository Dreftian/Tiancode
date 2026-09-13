import { describe, expect, test } from "bun:test"
import type { Part as PartType } from "@tiancode-ai/sdk/v2"
import { partDefaultOpen } from "./part-default-open"

describe("partDefaultOpen", () => {
  test("keeps edited files expanded when enabled", () => {
    expect(partDefaultOpen(tool("edit", { filediff: { additions: 1, deletions: 1 } }), false, true)).toBe(true)
  })

  test("collapses deletion-only edits when enabled", () => {
    expect(partDefaultOpen(tool("edit", { filediff: { additions: 0, deletions: 1_200 } }), false, true)).toBe(false)
  })

  test("collapses patches containing only deleted files when enabled", () => {
    expect(
      partDefaultOpen(
        tool("apply_patch", {
          files: [
            { filePath: "one.ts", type: "delete" },
            { filePath: "two.ts", type: "delete" },
          ],
        }),
        false,
        true,
      ),
    ).toBe(false)
  })

  test("keeps mixed patches expanded when enabled", () => {
    expect(
      partDefaultOpen(
        tool("apply_patch", {
          files: [
            { filePath: "one.ts", type: "delete" },
            { filePath: "two.ts", type: "update" },
          ],
        }),
        false,
        true,
      ),
    ).toBe(true)
  })

  test("preserves shell defaults", () => {
    expect(partDefaultOpen(tool("shell", {}), true, false)).toBe(true)
  })

  test("leaves read-only tools untouched when only shell and edit are enabled", () => {
    for (const name of ["read", "list", "glob", "grep", "websearch", "webfetch", "task", "skill", "mcp__srv__thing"]) {
      expect(partDefaultOpen(tool(name, {}), true, true)).toBeUndefined()
    }
  })

  test("expands every tool family when all is enabled", () => {
    for (const name of ["read", "list", "glob", "grep", "websearch", "webfetch", "task", "skill", "mcp__srv__thing"]) {
      expect(partDefaultOpen(tool(name, {}), false, false, true)).toBe(true)
    }
  })

  test("expands shell when all is enabled without the shell flag", () => {
    expect(partDefaultOpen(tool("shell", {}), false, false, true)).toBe(true)
  })

  test("expands edits when all is enabled without the edit flag", () => {
    expect(partDefaultOpen(tool("edit", { filediff: { additions: 1, deletions: 1 } }), false, false, true)).toBe(true)
  })

  test("still collapses deletion-only edits when all is enabled", () => {
    expect(partDefaultOpen(tool("edit", { filediff: { additions: 0, deletions: 1_200 } }), false, false, true)).toBe(
      false,
    )
  })

  test("still collapses patches containing only deleted files when all is enabled", () => {
    expect(
      partDefaultOpen(
        tool("apply_patch", {
          files: [
            { filePath: "one.ts", type: "delete" },
            { filePath: "two.ts", type: "delete" },
          ],
        }),
        false,
        false,
        true,
      ),
    ).toBe(false)
  })

  test("ignores non-tool parts when all is enabled", () => {
    const text: PartType = {
      id: "part_text",
      sessionID: "session",
      messageID: "message",
      type: "text",
      text: "hello",
    }
    expect(partDefaultOpen(text, true, true, true)).toBeUndefined()
  })
})

function tool(name: string, metadata: Record<string, unknown>): PartType {
  return {
    id: `part_${name}`,
    sessionID: "session",
    messageID: "message",
    type: "tool",
    callID: `call_${name}`,
    tool: name,
    state: {
      status: "completed",
      input: {},
      output: "",
      title: name,
      metadata,
      time: { start: 0, end: 1 },
    },
  }
}
