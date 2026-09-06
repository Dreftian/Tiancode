/**
 * Tool-call repair and input normalization.
 *
 * Repairs broken, truncated, markdown-wrapped or malformed JSON emitted by LLMs
 * (especially local GGUF models or smaller models) before execution.
 */

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

/**
 * Strips markdown code block wrappers (e.g. ```json ... ```).
 */
export function stripMarkdownFences(text: string): string {
  const trimmed = text.trim()
  const fenceMatch = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i)
  if (fenceMatch && fenceMatch[1]) {
    return fenceMatch[1].trim()
  }
  return trimmed
}

/**
 * Strips single-line and multi-line comments from JSON-like strings.
 */
function stripJsonComments(text: string): string {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^\\:])\/\/.*$/gm, "$1")
}

/**
 * Removes trailing commas before closing braces/brackets.
 */
function removeTrailingCommas(text: string): string {
  return text.replace(/,(\s*[}\]])/g, "$1")
}

/**
 * Attempts to repair common JSON syntax issues:
 * - Unbalanced closing braces/brackets
 * - Missing quotes
 * - Trailing commas
 * - Embedded JSON within conversational text
 */
export function repairJsonString(text: string): string {
  let cleaned = stripMarkdownFences(text)
  cleaned = stripJsonComments(cleaned)
  cleaned = removeTrailingCommas(cleaned).trim()

  // If text has prefix/suffix text around a JSON object, extract the outermost { ... }
  const firstBrace = cleaned.indexOf("{")
  const lastBrace = cleaned.lastIndexOf("}")

  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    cleaned = cleaned.slice(firstBrace, lastBrace + 1)
  }

  // Count open and close braces/brackets
  let openBraces = 0
  let openBrackets = 0
  let inString = false
  let isEscaped = false

  for (let i = 0; i < cleaned.length; i++) {
    const char = cleaned[i]

    if (isEscaped) {
      isEscaped = false
      continue
    }

    if (char === "\\") {
      isEscaped = true
      continue
    }

    if (char === '"') {
      inString = !inString
      continue
    }

    if (inString) continue

    if (char === "{") openBraces++
    if (char === "}") openBraces--
    if (char === "[") openBrackets++
    if (char === "]") openBrackets--
  }

  // Close unclosed strings if needed
  if (inString) {
    cleaned += '"'
  }

  // Close unclosed brackets and braces
  while (openBrackets > 0) {
    cleaned += "]"
    openBrackets--
  }
  while (openBraces > 0) {
    cleaned += "}"
    openBraces--
  }

  return removeTrailingCommas(cleaned)
}

/**
 * Parses and repairs any tool input into a valid Record<string, unknown>.
 */
export function repairToolInput(input: unknown): Record<string, unknown> {
  if (isRecord(input)) {
    return input
  }

  if (typeof input === "string") {
    const trimmed = input.trim()
    if (!trimmed) {
      return {}
    }

    // Direct JSON parse attempt
    try {
      const parsed = JSON.parse(trimmed) as unknown
      if (isRecord(parsed)) {
        return parsed
      }
      if (Array.isArray(parsed)) {
        return { items: parsed }
      }
      return { value: parsed }
    } catch {
      // Direct parse failed, try repair
    }

    const repaired = repairJsonString(trimmed)
    try {
      const parsed = JSON.parse(repaired) as unknown
      if (isRecord(parsed)) {
        return parsed
      }
      if (Array.isArray(parsed)) {
        return { items: parsed }
      }
      return { value: parsed }
    } catch {
      // Fallback: return as raw string input
      return { value: trimmed }
    }
  }

  if (input === undefined || input === null) {
    return {}
  }

  return { value: input }
}

export * as ToolCallRepair from "./tool-call-repair"
