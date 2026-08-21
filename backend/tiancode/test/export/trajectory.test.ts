import { describe, expect, test } from "bun:test"
import { TrajectoryExport } from "../../src/export/trajectory"
import { SessionV1 } from "@tiancode-ai/core/v1/session"
import { SessionID, MessageID, PartID } from "../../src/session/schema"

describe("TrajectoryExport", () => {
  const sessionID = "ses_test_123"
  const messages = [
    {
      info: {
        id: MessageID.make("msg_1"),
        sessionID: SessionID.make(sessionID),
        role: "user",
        time: { created: Date.now() },
        parentID: MessageID.make("msg_0"),
      },
      parts: [
        {
          id: PartID.make("prt_1"),
          sessionID: SessionID.make(sessionID),
          messageID: MessageID.make("msg_1"),
          type: "text",
          text: "Help me find all TypeScript files in src",
        },
      ],
    },
    {
      info: {
        id: MessageID.make("msg_2"),
        sessionID: SessionID.make(sessionID),
        role: "assistant",
        time: { created: Date.now() },
        parentID: MessageID.make("msg_1"),
      },
      parts: [
        {
          id: PartID.make("prt_2"),
          sessionID: SessionID.make(sessionID),
          messageID: MessageID.make("msg_2"),
          type: "tool",
          tool: "glob",
          callID: "call_glob_1",
          state: {
            status: "completed",
            input: { pattern: "src/**/*.ts" },
            output: "src/index.ts\nsrc/util.ts",
          },
        },
        {
          id: PartID.make("prt_3"),
          sessionID: SessionID.make(sessionID),
          messageID: MessageID.make("msg_2"),
          type: "text",
          text: "I found 2 TypeScript files: src/index.ts and src/util.ts.",
        },
      ],
    },
  ]

  test("exports to ShareGPT format", () => {
    const exported = TrajectoryExport.toShareGPT(sessionID, messages as any, "You are a coding assistant.")
    expect(exported.id).toBe(sessionID)
    expect(exported.conversations.length).toBe(5)
    expect(exported.conversations[0]).toEqual({ from: "system", value: "You are a coding assistant." })
    expect(exported.conversations[1]).toEqual({ from: "human", value: "Help me find all TypeScript files in src" })
    expect(exported.conversations[2].from).toBe("gpt")
    expect(exported.conversations[2].value).toContain("<tool_call>")
    expect(exported.conversations[3].from).toBe("tool")
    expect(exported.conversations[3].value).toContain("<tool_response>")
    expect(exported.conversations[4]).toEqual({
      from: "gpt",
      value: "I found 2 TypeScript files: src/index.ts and src/util.ts.",
    })
  })

  test("exports to OpenAI Messages format", () => {
    const exported = TrajectoryExport.toOpenAI(sessionID, messages as any, "You are a coding assistant.")
    expect(exported.id).toBe(sessionID)
    expect(exported.messages.length).toBe(4)
    expect(exported.messages[0]).toEqual({ role: "system", content: "You are a coding assistant." })
    expect(exported.messages[1]).toEqual({ role: "user", content: "Help me find all TypeScript files in src" })
    expect(exported.messages[2].role).toBe("assistant")
    expect(exported.messages[2].tool_calls?.length).toBe(1)
    expect(exported.messages[3].role).toBe("tool")
    expect(exported.messages[3].name).toBe("glob")
  })
})
