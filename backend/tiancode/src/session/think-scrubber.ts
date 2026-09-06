export interface ThinkScrubChunk {
  readonly type: "text" | "reasoning" | "reasoning-start" | "reasoning-end"
  readonly content?: string
}

/**
 * Stateful stream scrubber that intercepts <think>...</think> tags emitted
 * in standard text deltas (e.g. from DeepSeek-R1 or Qwen reasoning models)
 * and partitions them cleanly into reasoning vs visible user text.
 */
export function createThinkScrubber() {
  let inThinking = false
  let buffer = ""
  let reasoningStarted = false

  return {
    process(delta: string): ThinkScrubChunk[] {
      const chunks: ThinkScrubChunk[] = []
      buffer += delta

      while (buffer.length > 0) {
        if (!inThinking) {
          const thinkOpenIndex = buffer.indexOf("<think>")
          if (thinkOpenIndex === -1) {
            // Check if buffer ends with a partial prefix of "<think>"
            const partial = ["<", "<t", "<th", "<thi", "<thin", "<think"]
            const matchingPartial = partial.find((p) => buffer.endsWith(p))
            if (matchingPartial) {
              const safeText = buffer.slice(0, -matchingPartial.length)
              buffer = matchingPartial
              if (safeText) {
                chunks.push({ type: "text", content: safeText })
              }
              break
            }

            // Entire buffer is regular text
            chunks.push({ type: "text", content: buffer })
            buffer = ""
            break
          }

          // We found <think>
          const preText = buffer.slice(0, thinkOpenIndex)
          if (preText) {
            chunks.push({ type: "text", content: preText })
          }

          inThinking = true
          reasoningStarted = true
          chunks.push({ type: "reasoning-start" })
          buffer = buffer.slice(thinkOpenIndex + "<think>".length)
          continue
        }

        // Currently in thinking mode: looking for </think>
        const thinkCloseIndex = buffer.indexOf("</think>")
        if (thinkCloseIndex === -1) {
          // Check for partial prefix of "</think>"
          const partial = ["<", "</", "</t", "</th", "</thi", "</thin", "</think"]
          const matchingPartial = partial.find((p) => buffer.endsWith(p))
          if (matchingPartial) {
            const safeReasoning = buffer.slice(0, -matchingPartial.length)
            buffer = matchingPartial
            if (safeReasoning) {
              chunks.push({ type: "reasoning", content: safeReasoning })
            }
            break
          }

          // Entire buffer is reasoning text
          chunks.push({ type: "reasoning", content: buffer })
          buffer = ""
          break
        }

        // We found </think>
        const reasoningContent = buffer.slice(0, thinkCloseIndex)
        if (reasoningContent) {
          chunks.push({ type: "reasoning", content: reasoningContent })
        }
        chunks.push({ type: "reasoning-end" })
        inThinking = false
        buffer = buffer.slice(thinkCloseIndex + "</think>".length)
      }

      return chunks
    },

    flush(): ThinkScrubChunk[] {
      const chunks: ThinkScrubChunk[] = []
      if (buffer) {
        if (inThinking) {
          chunks.push({ type: "reasoning", content: buffer })
          chunks.push({ type: "reasoning-end" })
        } else {
          chunks.push({ type: "text", content: buffer })
        }
        buffer = ""
      } else if (inThinking) {
        chunks.push({ type: "reasoning-end" })
      }
      inThinking = false
      return chunks
    },

    isThinking(): boolean {
      return inThinking
    },

    hasReasoning(): boolean {
      return reasoningStarted
    },
  }
}

export * as ThinkScrubber from "./think-scrubber"
