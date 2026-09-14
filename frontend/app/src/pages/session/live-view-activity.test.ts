import { describe, expect, test } from "bun:test"
import type { Message, ToolPart } from "@tiancode-ai/sdk/v2/client"
import { liveViewProjectFolder, liveViewSessionTools, liveViewToolDetail, liveViewToolFiles } from "./live-view-activity"

const message = (id: string, sessionID = "one") => ({ id, sessionID, role: "assistant" }) as Message
const tool = (id: string, sessionID = "one", messageID = "m1"): ToolPart => ({
  id, sessionID, messageID, callID: id, type: "tool", tool: "write",
  state: { status: "running", input: { filePath: "src/App.tsx" }, time: { start: 1 } },
})

describe("live preview activity", () => {
  test("reads nested tool input from the actual SDK shape", () => {
    expect(liveViewToolFiles(tool("t1"))).toEqual(["src/App.tsx"])
    expect(liveViewToolDetail(tool("t1"))).toBe("src/App.tsx")
  })

  test("never consumes another cached session's tools", () => {
    const parts = { m1: [tool("t1"), tool("foreign", "two")], m2: [tool("t2", "two", "m2")] }
    expect(liveViewSessionTools("one", [message("m1"), message("m2", "two")], parts).map((part) => part.id)).toEqual(["t1"])
    expect(liveViewSessionTools(undefined, [message("m1")], parts)).toEqual([])
  })

  test("keeps a bounded chronological tail while large histories are cached", () => {
    const parts = { m1: Array.from({ length: 200 }, (_, index) => tool(String(index))) }
    expect(liveViewSessionTools("one", [message("m1")], parts, 3).map((part) => part.id)).toEqual(["197", "198", "199"])
  })

  test("tracks all files and moves reported by a completed patch", () => {
    const part: ToolPart = {
      ...tool("patch"), tool: "apply_patch", state: {
        status: "completed", input: {}, output: "done", title: "Patch",
        metadata: { files: [{ filePath: "old.ts", movePath: "new.ts" }, { relativePath: "src/App.tsx" }] },
        time: { start: 1, end: 2 },
      },
    }
    expect(liveViewToolFiles(part)).toEqual(["new.ts", "old.ts", "src/App.tsx"])
  })

  test("never exposes typed or clipboard text in the compact activity label", () => {
    expect(liveViewToolDetail({ ...tool("pc"), tool: "computer", state: {
      status: "running", input: { action: "type", text: "private text" }, time: { start: 1 },
    } })).toBe("type")
  })
})

describe("preview workspace root", () => {
  test("does not launch runtimes from a filename or the src folder", () => {
    expect(liveViewProjectFolder("C:\\project\\package.json", "C:\\project")).toBe("C:/project")
    expect(liveViewProjectFolder("file:///C:/project/src/App.tsx", "C:\\project")).toBe("C:/project")
    expect(liveViewProjectFolder("src/App.tsx", "C:\\project")).toBe("C:/project")
  })
  test("external tabs and similarly named folders do not change the session root", () => {
    expect(liveViewProjectFolder("C:/project-other/index.html", "C:/project")).toBe("C:/project")
    expect(liveViewProjectFolder("/another/file.ts", "/home/me/app")).toBe("/home/me/app")
  })
})
