import { SessionV1 } from "@tiancode-ai/core/v1/session"

export namespace TrajectoryExport {
  export interface ShareGPTMessage {
    from: "system" | "human" | "gpt" | "tool"
    value: string
  }

  export interface ShareGPTTrajectory {
    id: string
    conversations: ShareGPTMessage[]
  }

  export interface OpenAIMessage {
    role: "system" | "user" | "assistant" | "tool"
    content: string
    name?: string
    tool_call_id?: string
    tool_calls?: Array<{
      id: string
      type: "function"
      function: {
        name: string
        arguments: string
      }
    }>
  }

  export interface OpenAITrajectory {
    id: string
    messages: OpenAIMessage[]
  }

  export function toShareGPT(sessionID: string, messages: SessionV1.WithParts[], systemPrompt?: string): ShareGPTTrajectory {
    const conversations: ShareGPTMessage[] = []

    if (systemPrompt) {
      conversations.push({ from: "system", value: systemPrompt })
    }

    for (const msg of messages) {
      if (msg.info.role === "user") {
        const text = msg.parts
          .filter((p): p is SessionV1.TextPart => p.type === "text")
          .map((p) => p.text)
          .join("\n")
        if (text) conversations.push({ from: "human", value: text })
      } else if (msg.info.role === "assistant") {
        for (const part of msg.parts) {
          if (part.type === "text") {
            if (part.text.trim()) conversations.push({ from: "gpt", value: part.text })
          } else if (part.type === "tool") {
            const toolCallText = `<tool_call>\n{"name": "${part.tool}", "arguments": ${JSON.stringify(part.state.input)}}\n</tool_call>`
            conversations.push({ from: "gpt", value: toolCallText })

            if (part.state.status === "completed") {
              const outputText = typeof part.state.output === "string" ? part.state.output : JSON.stringify(part.state.output)
              conversations.push({
                from: "tool",
                value: `<tool_response>\n{"name": "${part.tool}", "content": ${JSON.stringify(outputText)}}\n</tool_response>`,
              })
            } else if (part.state.status === "error") {
              conversations.push({
                from: "tool",
                value: `<tool_response>\n{"name": "${part.tool}", "error": ${JSON.stringify(part.state.error)}}\n</tool_response>`,
              })
            }
          }
        }
      }
    }

    return { id: sessionID, conversations }
  }

  export function toOpenAI(sessionID: string, messages: SessionV1.WithParts[], systemPrompt?: string): OpenAITrajectory {
    const msgs: OpenAIMessage[] = []

    if (systemPrompt) {
      msgs.push({ role: "system", content: systemPrompt })
    }

    for (const msg of messages) {
      if (msg.info.role === "user") {
        const text = msg.parts
          .filter((p): p is SessionV1.TextPart => p.type === "text")
          .map((p) => p.text)
          .join("\n")
        if (text) msgs.push({ role: "user", content: text })
      } else if (msg.info.role === "assistant") {
        const text = msg.parts
          .filter((p): p is SessionV1.TextPart => p.type === "text")
          .map((p) => p.text)
          .join("\n")
        const toolCalls = msg.parts
          .filter((p): p is SessionV1.ToolPart => p.type === "tool")
          .map((p) => ({
            id: p.callID,
            type: "function" as const,
            function: {
              name: p.tool,
              arguments: JSON.stringify(p.state.input),
            },
          }))

        if (text || toolCalls.length > 0) {
          msgs.push({
            role: "assistant",
            content: text,
            ...(toolCalls.length > 0 ? { tool_calls: toolCalls } : {}),
          })
        }

        for (const part of msg.parts) {
          if (part.type === "tool") {
            const content =
              part.state.status === "completed"
                ? typeof part.state.output === "string"
                  ? part.state.output
                  : JSON.stringify(part.state.output)
                : part.state.status === "error"
                  ? `Error: ${part.state.error}`
                  : ""
            msgs.push({
              role: "tool",
              tool_call_id: part.callID,
              name: part.tool,
              content,
            })
          }
        }
      }
    }

    return { id: sessionID, messages: msgs }
  }
}
