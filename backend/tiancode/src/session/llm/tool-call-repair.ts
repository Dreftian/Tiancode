/**
 * Tool-call repair and input normalization.
 *
 * Repairs broken, truncated, markdown-wrapped or malformed JSON emitted by LLMs
 * (especially local GGUF models or smaller models) before execution.
 *
 * The smart-quote and HTML-entity passes are derived from OpenClaw (MIT); see
 * LICENSE-OPENCLAW.md next to this file.
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

// --- HTML entity escaped arguments -----------------------------------------
//
// Some providers (xAI/Grok most notably) HTML-escape the whole argument blob,
// so the JSON delimiters themselves arrive as `&quot;`. Only the five entities
// that can appear in escaped JSON are decoded, and only once.
//
// The tradeoff, stated plainly: the gate is per-blob, not per-entity. Once a
// payload is accepted as entity-escaped, EVERY entity in it is decoded,
// including entities sitting in value text — `{&quot;n&quot;:&quot;Tom &amp;
// Jerry&quot;}` yields `Tom & Jerry`, not `Tom &amp; Jerry`. That is correct
// for the consistently escaped output this pass exists for (a blob that escapes
// its delimiters escapes a literal `&` as `&amp;`, and a literal `&amp;` as
// `&amp;amp;`), and wrong for a producer that escapes only the delimiters.
// The two are indistinguishable from the blob alone, so the consistent reading
// wins; a payload that parses without decoding is never touched at all.

const NAMED_HTML_ENTITIES: Record<string, string> = {
  amp: "&",
  apos: "'",
  gt: ">",
  lt: "<",
  quot: '"',
}

const NUMERIC_HTML_ENTITIES: Record<string, string> = {
  "34": '"',
  "38": "&",
  "39": "'",
  "60": "<",
  "62": ">",
}

const HTML_ENTITY_PATTERN = /&(?:([a-z]+)|#(\d+)|#x([0-9a-f]+));/gi

function decodeJsonHtmlEntities(text: string): string {
  return text.replace(HTML_ENTITY_PATTERN, (match: string, name: string, decimal: string, hex: string) => {
    if (typeof name === "string") {
      const lowered = name.toLowerCase()
      return Object.hasOwn(NAMED_HTML_ENTITIES, lowered) ? NAMED_HTML_ENTITIES[lowered] : match
    }
    const code = typeof hex === "string" ? Number.parseInt(hex, 16) : Number.parseInt(decimal, 10)
    const key = String(code)
    return Object.hasOwn(NUMERIC_HTML_ENTITIES, key) ? NUMERIC_HTML_ENTITIES[key] : match
  })
}

function isParsableJson(text: string): boolean {
  try {
    JSON.parse(text)
    return true
  } catch {
    return false
  }
}

/**
 * True when the remaining repair passes can turn `text` into parsable JSON.
 * Used as the accept/reject gate for entity decoding: the decode is only kept
 * when it is what makes the payload parse.
 */
function isRecoverableJson(text: string): boolean {
  return isParsableJson(balanceJson(normalizeSmartQuotedJson(text)))
}

/**
 * Decodes HTML-entity escaped JSON, but only when the escaping is what breaks
 * the payload: text that already parses, or that stays broken after decoding,
 * is returned untouched. When the decode IS accepted it applies to the whole
 * blob, entities inside value text included — see the tradeoff above.
 */
export function decodeEntityEscapedJson(text: string): string {
  if (!text.includes("&")) return text
  if (isRecoverableJson(text)) return text

  const decoded = decodeJsonHtmlEntities(text)
  if (decoded === text) return text

  return isRecoverableJson(decoded) ? decoded : text
}

// --- Smart quote delimiters -------------------------------------------------
//
// Models that "prettify" their output emit curly quotes where JSON needs
// straight ones. A quote is only treated as a delimiter when it sits in a
// structurally valid position (a key followed by `:`, a value followed by `}`,
// `]`, end of input, or a `,` that is followed by another member/element), so
// smart quotes *inside* a value survive as content.

const MAX_SMART_QUOTE_REPAIR_CHARS = 128_000
const SMART_QUOTES = "‘’‚‛“”„‟"
const SMART_QUOTE_PATTERN = /[‘’‚‛“”„‟]/
// A backslash immediately before a curly quote means the model prettified an
// escaped `\"` as well, so the very same character has to be read as content in
// one place and as a delimiter in another. Nothing downstream can tell those
// apart (the escape decoder leaves `\”` alone, silently changing a `"` inside a
// file body into a curly quote), so the whole scan gives up.
const ESCAPED_SMART_QUOTE_PATTERN = /\\[‘’‚‛“”„‟]/

// A member key is only a key when it *looks* like one. The scan that reads a
// candidate key is lenient by design (it stops at the first smart quote followed
// by `:`), so on a value that contains quoted phrases it happily runs past the
// real delimiter and returns rubbish like `b” below”,“path` — which splits the
// object in the wrong place and silently truncates the value. Upstream guards
// this with a length cap plus an allowlist of known argument names; the cap is
// ported as-is and the allowlist is replaced by a structural rule: a candidate
// that contains a character a key cannot hold — a double quote (straight or
// typographic), a comma, a colon, a brace, a bracket, a backslash or a line
// break — is the scan having overrun, so the boundary is rejected and the caller
// gives up instead of guessing. Single quotes are deliberately NOT in the set:
// `’` is an apostrophe far more often than a delimiter, and rejecting it would
// break plain keys like `it’s`.
const MAX_MEMBER_KEY_CHARS = 96
const UNSAFE_MEMBER_KEY_PATTERN = /["“”„‟,:{}[\]\\\n\r\t]/

const JSON_STRING_ESCAPES: Record<string, string> = {
  '"': '"',
  "/": "/",
  "\\": "\\",
  b: "\b",
  f: "\f",
  n: "\n",
  r: "\r",
  t: "\t",
}

type ParsedValue = { value: unknown; end: number }
type StringMode = "key" | "value" | "element"

/** Out-of-range reads return "" so end-of-input is just another character. */
function charOf(text: string, index: number): string {
  return index >= 0 && index < text.length ? text.charAt(index) : ""
}

function isSmartQuote(char: string): boolean {
  return char.length === 1 && SMART_QUOTES.includes(char)
}

function skipSpace(text: string, index: number): number {
  let cursor = index
  while (cursor < text.length && /\s/.test(text.charAt(cursor))) cursor++
  return cursor
}

function decodeJsonStringEscapes(value: string): string {
  return value.replace(/\\(?:(["\\/bfnrt])|u([0-9a-fA-F]{4}))/g, (match: string, escaped: string, hex: string) => {
    if (typeof hex === "string") return String.fromCharCode(Number.parseInt(hex, 16))
    return typeof escaped === "string" && Object.hasOwn(JSON_STRING_ESCAPES, escaped)
      ? JSON_STRING_ESCAPES[escaped]
      : match
  })
}

function parseQuotedString(text: string, start: number): ParsedValue | undefined {
  let escaped = false
  for (let i = start + 1; i < text.length; i++) {
    const char = text.charAt(i)
    if (escaped) {
      escaped = false
      continue
    }
    if (char === "\\") {
      escaped = true
      continue
    }
    if (char !== '"') continue
    try {
      const value = JSON.parse(text.slice(start, i + 1)) as unknown
      return typeof value === "string" ? { value, end: i + 1 } : undefined
    } catch {
      return undefined
    }
  }
  return undefined
}

function isPlausibleMemberKey(key: unknown): key is string {
  return (
    typeof key === "string" &&
    key.length > 0 &&
    key.length <= MAX_MEMBER_KEY_CHARS &&
    !UNSAFE_MEMBER_KEY_PATTERN.test(key)
  )
}

/** Reads a `"key"` / `“key”` token, rejecting anything that cannot be a key. */
function parseMemberKey(text: string, start: number): ParsedValue | undefined {
  const char = charOf(text, start)
  if (char === '"') return parseQuotedString(text, start)
  if (!isSmartQuote(char)) return undefined
  const key = parseSmartQuotedString(text, start, "key")
  return key && isPlausibleMemberKey(key.value) ? key : undefined
}

/** A `"key":` or `“key”:` pair starts here — used to confirm a `,` really ended a value. */
function startsObjectMember(text: string, from: number): boolean {
  const start = skipSpace(text, from)
  const key = parseMemberKey(text, start)
  // Straight-quoted keys are exact, but this is only a lookahead heuristic:
  // an implausible key means the `,` was content, not a delimiter.
  if (!key || !isPlausibleMemberKey(key.value)) return false
  return charOf(text, skipSpace(text, key.end)) === ":"
}

/** A JSON value starts here — used to confirm a `,` really ended an array element. */
function startsArrayElement(text: string, from: number): boolean {
  const char = charOf(text, skipSpace(text, from))
  if (char === "") return false
  return char === '"' || char === "{" || char === "[" || isSmartQuote(char) || /[-\dtfn]/.test(char)
}

function closesSmartQuotedString(text: string, index: number, mode: StringMode): boolean {
  const next = skipSpace(text, index + 1)
  const char = charOf(text, next)
  if (mode === "key") return char === ":"
  // Truncated output: whatever is left is the value.
  if (char === "") return true
  if (mode === "value") {
    if (char === "}") return true
    return char === "," && startsObjectMember(text, next + 1)
  }
  if (char === "]") return true
  return char === "," && startsArrayElement(text, next + 1)
}

function parseSmartQuotedString(text: string, start: number, mode: StringMode): ParsedValue | undefined {
  let raw = ""
  for (let i = start + 1; i < text.length; i++) {
    const char = text.charAt(i)
    if (isSmartQuote(char) && closesSmartQuotedString(text, i, mode)) {
      return { value: decodeJsonStringEscapes(raw), end: i + 1 }
    }
    raw += char
    // A key scan that runs this far has overrun its delimiter; keep it cheap
    // (this runs per quote) and let the caller give up.
    if (mode === "key" && raw.length > MAX_MEMBER_KEY_CHARS) return undefined
  }
  // A truncated key is useless; a truncated value is still worth keeping.
  return mode === "key" ? undefined : { value: decodeJsonStringEscapes(raw), end: text.length }
}

function parseLiteral(text: string, start: number): ParsedValue | undefined {
  let end = start
  while (end < text.length && !",}]".includes(text.charAt(end))) end++
  const raw = text.slice(start, end).trim()
  if (!raw) return undefined
  try {
    return { value: JSON.parse(raw) as unknown, end }
  } catch {
    return undefined
  }
}

function parseObject(text: string, start: number): ParsedValue | undefined {
  const entries: [string, unknown][] = []
  const seen = new Set<string>()
  let index = skipSpace(text, start + 1)
  if (charOf(text, index) === "}") return { value: Object.fromEntries(entries), end: index + 1 }

  while (index < text.length) {
    const key = parseMemberKey(text, index)
    // A repeated key means a delimiter was misread, so the whole parse is unsafe.
    if (!key || typeof key.value !== "string" || seen.has(key.value)) return undefined
    seen.add(key.value)

    index = skipSpace(text, key.end)
    if (charOf(text, index) !== ":") return undefined

    const parsed = parseValue(text, skipSpace(text, index + 1))
    if (!parsed) return undefined
    entries.push([key.value, parsed.value])

    index = skipSpace(text, parsed.end)
    const separator = charOf(text, index)
    if (separator === ",") {
      index = skipSpace(text, index + 1)
      continue
    }
    if (separator === "}") return { value: Object.fromEntries(entries), end: index + 1 }
    if (separator === "") return { value: Object.fromEntries(entries), end: text.length }
    return undefined
  }

  return { value: Object.fromEntries(entries), end: text.length }
}

function parseArray(text: string, start: number): ParsedValue | undefined {
  const values: unknown[] = []
  let index = skipSpace(text, start + 1)
  if (charOf(text, index) === "]") return { value: values, end: index + 1 }

  while (index < text.length) {
    const parsed = parseValue(text, index, "element")
    if (!parsed) return undefined
    values.push(parsed.value)

    index = skipSpace(text, parsed.end)
    const separator = charOf(text, index)
    if (separator === ",") {
      index = skipSpace(text, index + 1)
      continue
    }
    if (separator === "]") return { value: values, end: index + 1 }
    if (separator === "") return { value: values, end: text.length }
    return undefined
  }

  return { value: values, end: text.length }
}

function parseValue(text: string, start: number, mode: StringMode = "value"): ParsedValue | undefined {
  const char = charOf(text, start)
  if (char === "{") return parseObject(text, start)
  if (char === "[") return parseArray(text, start)
  if (char === '"') return parseQuotedString(text, start)
  if (isSmartQuote(char)) return parseSmartQuotedString(text, start, mode)
  return parseLiteral(text, start)
}

/**
 * Rewrites JSON that uses curly quotes as delimiters into straight-quoted JSON.
 * Returns the input unchanged when the payload has no smart quotes, or when the
 * lenient scan cannot account for every character — giving up beats guessing.
 */
export function normalizeSmartQuotedJson(text: string): string {
  if (text.length > MAX_SMART_QUOTE_REPAIR_CHARS) return text
  if (!SMART_QUOTE_PATTERN.test(text)) return text
  if (ESCAPED_SMART_QUOTE_PATTERN.test(text)) return text

  const parsed = parseValue(text, skipSpace(text, 0))
  if (!parsed || text.slice(parsed.end).trim() !== "") return text

  try {
    const json = JSON.stringify(parsed.value)
    return typeof json === "string" ? json : text
  } catch {
    return text
  }
}

/**
 * Closes unbalanced strings, brackets and braces left by truncated output.
 */
function balanceJson(text: string): string {
  let cleaned = text
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

/** If text has prefix/suffix text around a JSON object, extract the outermost { ... }. */
function sliceOutermostObject(text: string): string {
  const firstBrace = text.indexOf("{")
  const lastBrace = text.lastIndexOf("}")
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    return text.slice(firstBrace, lastBrace + 1)
  }
  return text
}

/**
 * Attempts to repair common JSON syntax issues:
 * - Unbalanced closing braces/brackets
 * - Missing quotes
 * - Trailing commas
 * - Embedded JSON within conversational text
 * - HTML-entity escaped arguments (&quot; &amp; &lt; &gt; &#39;)
 * - Curly/smart quotes used as string delimiters
 */
export function repairJsonString(text: string): string {
  const fenced = stripMarkdownFences(text)

  // The delimiter passes run FIRST, on text that has not been through the
  // comment and trailing-comma passes. Those two are plain regex replaces with
  // no string awareness: they were only ever meant to see broken text, and a
  // payload whose delimiters are entity-escaped or curly looks like text to
  // them — `removeTrailingCommas` would happily delete the `,` out of a
  // `{"x": 1,}` file body inside a `content` value. When either pass produces
  // something that parses, that IS the answer: returning it here keeps the
  // balancer and the comma stripper away from a payload they can only damage.
  const delimited = normalizeSmartQuotedJson(decodeEntityEscapedJson(sliceOutermostObject(fenced).trim()))
  if (isParsableJson(delimited)) return delimited

  // Legacy path, unchanged: truncated or otherwise broken output that still
  // needs comment stripping, brace balancing and trailing-comma removal.
  let cleaned = stripJsonComments(fenced)
  cleaned = removeTrailingCommas(cleaned).trim()
  cleaned = sliceOutermostObject(cleaned)

  // Both run before brace balancing: they rewrite delimiters, and the balancer
  // only counts straight-quoted strings.
  cleaned = decodeEntityEscapedJson(cleaned)
  cleaned = normalizeSmartQuotedJson(cleaned)

  // Same rule as above: on anything that already parses, `balanceJson` can only
  // strip commas out of string contents.
  return isParsableJson(cleaned) ? cleaned : balanceJson(cleaned)
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
