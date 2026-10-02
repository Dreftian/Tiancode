import { describe, expect, mock, test } from "bun:test"
import type { AssistantMessage, Part, UserMessage } from "@tiancode-ai/sdk/v2"

mock.module("@tiancode-ai/session-ui/message-part", () => ({
  renderable: () => true,
  groupParts: (refs: Array<{ messageID: string; part: { id: string } }>) =>
    refs.map((ref) => ({
      type: "part" as const,
      key: ref.part.id,
      ref: { messageID: ref.messageID, partID: ref.part.id },
    })),
}))

const { Timeline, TimelineRow } = await import("./rows")

const user = { id: "msg_1", role: "user", sessionID: "ses", time: { created: 1 } } as unknown as UserMessage
const assistant = (error?: { name: string }) =>
  ({
    id: "msg_2",
    role: "assistant",
    parentID: "msg_1",
    sessionID: "ses",
    time: { created: 2, completed: 3 },
    ...(error ? { error } : {}),
  }) as unknown as AssistantMessage
const edit = {
  id: "prt_1",
  sessionID: "ses",
  messageID: "msg_2",
  type: "tool",
  callID: "call_1",
  tool: "write",
  state: { status: "completed", input: { filePath: "/p/index.html" }, output: "", title: "", metadata: {}, time: { start: 1, end: 2 } },
} as unknown as Part

function rows(input: { status: "idle" | "busy"; active?: boolean; offers?: boolean; error?: { name: string } }) {
  return Timeline.constructMessageRows(
    user,
    (id) => (id === "msg_2" ? [edit] : []),
    [assistant(input.error)],
    0,
    false,
    input.status,
    input.active ?? true,
    true,
    input.offers ?? true,
  ).map(TimelineRow.key)
}

describe("PreviewOffer row", () => {
  test("appears after the latest finished turn that built an app", () => {
    expect(rows({ status: "idle" })).toContain("preview-offer:msg_1")
  })

  test("is absent while the agent works, on older turns, when disabled, and after an error", () => {
    expect(rows({ status: "busy" })).not.toContain("preview-offer:msg_1")
    expect(rows({ status: "idle", active: false })).not.toContain("preview-offer:msg_1")
    expect(rows({ status: "idle", offers: false })).not.toContain("preview-offer:msg_1")
    expect(rows({ status: "idle", error: { name: "UnknownError" } })).not.toContain("preview-offer:msg_1")
    expect(rows({ status: "idle", error: { name: "MessageAbortedError" } })).not.toContain("preview-offer:msg_1")
  })
})
