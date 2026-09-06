import { SessionV1 } from "@tiancode-ai/core/v1/session"
import { createHash } from "crypto"

export interface LoopDetectionResult {
  readonly stuck: boolean
  readonly reason?: "generic_repeat" | "argument_churn" | "ping_pong" | "circuit_breaker"
  readonly message?: string
}

const GENERIC_REPEAT_THRESHOLD = 3
const CHURN_LOOKBACK = 6
const CHURN_THRESHOLD = 4
const CIRCUIT_BREAKER_THRESHOLD = 25

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value) ?? ""
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`
  }
  const keys = Object.keys(value as Record<string, unknown>).sort()
  const pairs = keys.map((key) => `${JSON.stringify(key)}:${stableStringify((value as Record<string, unknown>)[key])}`)
  return `{${pairs.join(",")}}`
}

export function hashToolCall(tool: string, input: unknown): string {
  const serialized = stableStringify(input)
  return createHash("sha256").update(`${tool}:${serialized}`).digest("hex")
}

export function detectLoop(
  parts: readonly SessionV1.Part[],
  nextTool: string,
  nextInput: Record<string, unknown>,
): LoopDetectionResult {
  const toolParts = parts.filter((part): part is SessionV1.ToolPart => part.type === "tool")

  // Check 1: Circuit breaker on turn tool volume
  if (toolParts.length >= CIRCUIT_BREAKER_THRESHOLD) {
    return {
      stuck: true,
      reason: "circuit_breaker",
      message: `Global circuit breaker tripped: ${toolParts.length} tool executions in a single turn without completing the response.`,
    }
  }

  const nextHash = hashToolCall(nextTool, nextInput)

  // Check 2: Generic consecutive repetition (identical tool & input)
  const recentCalls = toolParts.slice(-(GENERIC_REPEAT_THRESHOLD - 1))
  if (
    recentCalls.length === GENERIC_REPEAT_THRESHOLD - 1 &&
    recentCalls.every((part) => part.tool === nextTool && hashToolCall(part.tool, part.state.input) === nextHash)
  ) {
    return {
      stuck: true,
      reason: "generic_repeat",
      message: `Identical tool call repeated ${GENERIC_REPEAT_THRESHOLD} times for '${nextTool}' with unchanged parameters.`,
    }
  }

  // Check 3: Argument churn (same tool called repeatedly with failing or empty outcomes)
  const windowParts = toolParts.slice(-CHURN_LOOKBACK)
  const churnCalls = windowParts.filter((part) => part.tool === nextTool)
  if (churnCalls.length >= CHURN_THRESHOLD - 1) {
    const failedOrNoProgress = churnCalls.filter(
      (part) => part.state.status === "error" || (part.state.status === "completed" && !part.state.output?.trim()),
    )
    if (failedOrNoProgress.length >= CHURN_THRESHOLD - 2) {
      return {
        stuck: true,
        reason: "argument_churn",
        message: `Argument churn detected: tool '${nextTool}' called repeatedly with failing or zero-progress outcomes.`,
      }
    }
  }

  // Check 4: Ping-pong oscillation between two tools (e.g. A -> B -> A -> B)
  if (toolParts.length >= 3) {
    const sequence = [...toolParts.slice(-3).map((p) => p.tool), nextTool]
    if (
      sequence[0] === sequence[2] &&
      sequence[1] === sequence[3] &&
      sequence[0] !== sequence[1]
    ) {
      return {
        stuck: true,
        reason: "ping_pong",
        message: `Ping-pong oscillation detected between tools '${sequence[0]}' and '${sequence[1]}'.`,
      }
    }
  }

  return { stuck: false }
}

export * as LoopDetector from "./loop-detector"
