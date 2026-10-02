import { describe, expect, test } from "bun:test"
import type { Part } from "@tiancode-ai/sdk/v2"
import { isAppFile, pickEntry, previewOffer } from "./preview-offer"

let seq = 0
function tool(name: string, input: Record<string, unknown>, status: "completed" | "error" | "running" = "completed") {
  seq += 1
  const state =
    status === "completed"
      ? { status, input, output: "", title: "", metadata: {}, time: { start: 1, end: 2 } }
      : status === "error"
        ? { status, input, error: "boom", time: { start: 1, end: 2 } }
        : { status, input, time: { start: 1 } }
  return { id: `prt_${seq}`, sessionID: "ses", messageID: "msg", type: "tool", callID: `call_${seq}`, tool: name, state } as unknown as Part
}

const text = { id: "prt_text", sessionID: "ses", messageID: "msg", type: "text", text: "done" } as unknown as Part

describe("previewOffer", () => {
  test("an edit to a web file means the app was modified", () => {
    expect(previewOffer([tool("edit", { filePath: "C:\\proj\\src\\App.tsx" })])).toEqual({
      reason: "modified",
      entry: "C:/proj/src/App.tsx",
    })
  })

  test("prefers index.html as the entry, then the package.json folder", () => {
    const parts = [tool("write", { filePath: "/p/src/style.css" }), tool("write", { filePath: "/p/index.html" })]
    expect(previewOffer(parts)?.entry).toBe("/p/index.html")
    expect(pickEntry(["/p/web/package.json", "/p/web/src/a.vue"])).toBe("/p/web")
  })

  test("starting the dev server wins over the edit reason", () => {
    const parts = [tool("edit", { filePath: "/p/src/a.tsx" }), tool("preview_start", {})]
    expect(previewOffer(parts)?.reason).toBe("started")
  })

  test("looking at the page through the preview tools is a review", () => {
    expect(previewOffer([tool("preview_inspect", { selector: "h1" })])?.reason).toBe("reviewed")
  })

  test("three distinct web files read is a review, two are not", () => {
    const reads = ["/p/a.tsx", "/p/b.css", "/p/c.html"].map((filePath) => tool("read", { filePath }))
    expect(previewOffer(reads.slice(0, 2))).toBeUndefined()
    expect(previewOffer(reads)?.reason).toBe("reviewed")
  })

  test("backend, markdown, tests and failed edits do not count", () => {
    const parts = [
      tool("edit", { filePath: "/p/server/index.ts" }),
      tool("write", { filePath: "/p/README.md" }),
      tool("edit", { filePath: "/p/src/App.test.tsx" }),
      tool("edit", { filePath: "/p/src/App.tsx" }, "error"),
      tool("edit", { filePath: "/p/src/Other.tsx" }, "running"),
      tool("bash", { command: "npm run dev" }),
      text,
    ]
    expect(previewOffer(parts)).toBeUndefined()
  })

  test("edits made by a subagent come through the turn's summary diffs", () => {
    const diffs = [{ file: "src/pages/home.vue", additions: 3, deletions: 1 }] as never
    expect(previewOffer([], diffs)).toEqual({ reason: "modified", entry: "src/pages/home.vue" })
  })

  test("isAppFile recognises front-end configs and ignores build output", () => {
    expect(isAppFile("vite.config.ts")).toBe(true)
    expect(isAppFile("apps/web/next.config.mjs")).toBe(true)
    expect(isAppFile("src-tauri/tauri.conf.json")).toBe(true)
    expect(isAppFile("dist/index.html")).toBe(false)
    expect(isAppFile("node_modules/x/style.css")).toBe(false)
    expect(isAppFile("scripts/build.ts")).toBe(false)
  })
})
