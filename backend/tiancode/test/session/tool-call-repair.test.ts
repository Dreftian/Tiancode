import { describe, expect, test } from "bun:test"
import { ToolCallRepair } from "../../src/session/llm/tool-call-repair"

// Smart quotes are written as escapes so this file stays pure ASCII.
const LEFT_DOUBLE = "“"
const RIGHT_DOUBLE = "”"
const LEFT_SINGLE = "‘"
const RIGHT_SINGLE = "’"

/** Builds `{"a":"b"}` style JSON with curly quotes as the delimiters. */
function smart(text: string): string {
  let open = true
  return text.replace(/"/g, () => {
    open = !open
    return open ? RIGHT_DOUBLE : LEFT_DOUBLE
  })
}

describe("tool call repair", () => {
  describe("existing behaviour", () => {
    test("passes records through untouched", () => {
      const input = { path: "a.txt" }
      expect(ToolCallRepair.repairToolInput(input)).toBe(input)
    })

    test("parses plain JSON, fenced JSON and trailing commas", () => {
      expect(ToolCallRepair.repairToolInput('{"path":"a.txt"}')).toEqual({ path: "a.txt" })
      expect(ToolCallRepair.repairToolInput('```json\n{"path":"a.txt"}\n```')).toEqual({ path: "a.txt" })
      expect(ToolCallRepair.repairToolInput('{"path":"a.txt",}')).toEqual({ path: "a.txt" })
    })

    test("closes truncated output", () => {
      expect(ToolCallRepair.repairToolInput('{"path":"a.txt","content":"hello')).toEqual({
        path: "a.txt",
        content: "hello",
      })
    })

    test("falls back to the raw string when nothing can be recovered", () => {
      expect(ToolCallRepair.repairToolInput("not json at all")).toEqual({ value: "not json at all" })
    })
  })

  describe("smart quote delimiters", () => {
    test("normalises curly double quotes used as delimiters", () => {
      expect(ToolCallRepair.repairToolInput(smart('{"path":"notes/report.md","content":"hello"}'))).toEqual({
        path: "notes/report.md",
        content: "hello",
      })
    })

    test("normalises curly single quotes used as delimiters", () => {
      const input = `{${LEFT_SINGLE}path${RIGHT_SINGLE}:${LEFT_SINGLE}a.txt${RIGHT_SINGLE}}`
      expect(ToolCallRepair.repairToolInput(input)).toEqual({ path: "a.txt" })
    })

    test("keeps non-string values, nested objects and arrays", () => {
      const input = smart('{"path":"a.txt","offset":5,"deep":true,"edits":[{"old":"a","new":"b"}]}')
      expect(ToolCallRepair.repairToolInput(input)).toEqual({
        path: "a.txt",
        offset: 5,
        deep: true,
        edits: [{ old: "a", new: "b" }],
      })
    })

    test("closes a truncated smart quoted value", () => {
      const input = `{${LEFT_DOUBLE}path${RIGHT_DOUBLE}:${LEFT_DOUBLE}a.txt`
      expect(ToolCallRepair.repairToolInput(input)).toEqual({ path: "a.txt" })
    })

    test("repairs smart quotes behind a tool-name preamble", () => {
      const input = `functions.write ${smart('{"path":"a.txt"}')}`
      expect(ToolCallRepair.repairToolInput(input)).toEqual({ path: "a.txt" })
    })

    // The dangerous half: quotes that are content, not delimiters.
    test("keeps smart quotes that sit inside a smart quoted value", () => {
      const content = `He said ${LEFT_DOUBLE}hi${RIGHT_DOUBLE} loudly`
      const input = `{${LEFT_DOUBLE}content${RIGHT_DOUBLE}:${LEFT_DOUBLE}${content}${RIGHT_DOUBLE}}`
      expect(ToolCallRepair.repairToolInput(input)).toEqual({ content })
    })

    test("keeps a quoted phrase followed by a comma inside a value", () => {
      const content = `see ${LEFT_DOUBLE}a${RIGHT_DOUBLE}, ${LEFT_DOUBLE}b${RIGHT_DOUBLE} below`
      const input = `{${LEFT_DOUBLE}content${RIGHT_DOUBLE}:${LEFT_DOUBLE}${content}${RIGHT_DOUBLE}}`
      expect(ToolCallRepair.repairToolInput(input)).toEqual({ content })
    })

    test("keeps apostrophes and straight quotes inside a smart quoted value", () => {
      const content = `it${RIGHT_SINGLE}s a "quoted" word`
      const input = `{${LEFT_DOUBLE}content${RIGHT_DOUBLE}:${LEFT_DOUBLE}${content}${RIGHT_DOUBLE}}`
      expect(ToolCallRepair.repairToolInput(input)).toEqual({ content })
    })

    test("leaves smart quotes inside a straight quoted value alone", () => {
      const input = `{"text":"He said ${LEFT_DOUBLE}hello${RIGHT_DOUBLE} to me",}`
      expect(ToolCallRepair.repairToolInput(input)).toEqual({ text: `He said ${LEFT_DOUBLE}hello${RIGHT_DOUBLE} to me` })
    })

    test("gives up instead of guessing when the delimiters are ambiguous", () => {
      const input = `{${LEFT_DOUBLE}content${RIGHT_DOUBLE}:${LEFT_DOUBLE}see ${LEFT_DOUBLE}a${RIGHT_DOUBLE}, ${LEFT_DOUBLE}b${RIGHT_DOUBLE}: yes${RIGHT_DOUBLE}}`
      expect(ToolCallRepair.normalizeSmartQuotedJson(input)).toBe(input)
      expect(ToolCallRepair.repairToolInput(input)).toEqual({ value: input })
    })

    test("gives up on a repeated key, which means a delimiter was misread", () => {
      const input = smart('{"a":"x","a":"y"}')
      expect(ToolCallRepair.normalizeSmartQuotedJson(input)).toBe(input)
    })

    // The scanner used to accept the garbage key `b" below","path` here and
    // split the object there, truncating content and inventing a member.
    test("keeps a quote bearing value whole when it is not the last member", () => {
      const content = `see ${LEFT_DOUBLE}a${RIGHT_DOUBLE}, ${LEFT_DOUBLE}b${RIGHT_DOUBLE} below`
      const input =
        `{${LEFT_DOUBLE}content${RIGHT_DOUBLE}:${LEFT_DOUBLE}${content}${RIGHT_DOUBLE}` +
        `,${LEFT_DOUBLE}path${RIGHT_DOUBLE}:${LEFT_DOUBLE}a.txt${RIGHT_DOUBLE}}`

      expect(ToolCallRepair.repairToolInput(input)).toEqual({ content, path: "a.txt" })
    })

    test("does not read a long quoted run after a comma as a key", () => {
      const content = `see ${LEFT_DOUBLE}a${RIGHT_DOUBLE}, ${LEFT_DOUBLE}${"long ".repeat(30)}${RIGHT_DOUBLE}: yes`
      const input = `{${LEFT_DOUBLE}content${RIGHT_DOUBLE}:${LEFT_DOUBLE}${content}${RIGHT_DOUBLE}}`

      expect(ToolCallRepair.repairToolInput(input)).toEqual({ content })
    })

    test("keeps a typographic apostrophe in a key and next to one", () => {
      const input =
        `{${LEFT_DOUBLE}content${RIGHT_DOUBLE}:${LEFT_DOUBLE}James${RIGHT_SINGLE} book${RIGHT_DOUBLE}` +
        `,${LEFT_DOUBLE}it${RIGHT_SINGLE}s${RIGHT_DOUBLE}:${LEFT_DOUBLE}ok${RIGHT_DOUBLE}}`

      expect(ToolCallRepair.repairToolInput(input)).toEqual({
        content: `James${RIGHT_SINGLE} book`,
        [`it${RIGHT_SINGLE}s`]: "ok",
      })
    })

    // A `\` in front of a curly quote means the model prettified an escaped
    // `\"` too, so the same character is content in one place and a delimiter
    // in another. Unresolvable: fail loudly rather than guess.
    test("gives up when an escaped quote was prettified as well", () => {
      const input = `{${LEFT_DOUBLE}path${RIGHT_DOUBLE}:${LEFT_DOUBLE}\\${RIGHT_DOUBLE},${RIGHT_DOUBLE}}`

      expect(ToolCallRepair.normalizeSmartQuotedJson(input)).toBe(input)
      expect(ToolCallRepair.repairToolInput(input)).toEqual({ value: input })
    })
  })

  // `removeTrailingCommas` and `balanceJson` are raw regex passes with no string
  // awareness. They must never see a payload the delimiter passes already
  // repaired, or they edit the value bodies: a file body with a dangling comma
  // is exactly what a write/edit tool call carries.
  describe("trailing commas inside repaired values", () => {
    test("keeps a dangling comma in a smart quoted file body", () => {
      const content = '{\n  "x": 1,\n}'
      const input =
        `{${LEFT_DOUBLE}path${RIGHT_DOUBLE}:${LEFT_DOUBLE}a.json${RIGHT_DOUBLE}` +
        `,${LEFT_DOUBLE}content${RIGHT_DOUBLE}:${LEFT_DOUBLE}${content}${RIGHT_DOUBLE}}`

      expect(ToolCallRepair.repairToolInput(input)).toEqual({ path: "a.json", content })
    })

    test("keeps `, }` and `, ]` inside a smart quoted value", () => {
      expect(ToolCallRepair.repairToolInput(`{${LEFT_DOUBLE}content${RIGHT_DOUBLE}:${LEFT_DOUBLE}a, }${RIGHT_DOUBLE}}`)).toEqual({
        content: "a, }",
      })
      expect(ToolCallRepair.repairToolInput(`{${LEFT_DOUBLE}content${RIGHT_DOUBLE}:${LEFT_DOUBLE}[1, ]${RIGHT_DOUBLE}}`)).toEqual({
        content: "[1, ]",
      })
    })

    test("keeps `, }` and `, ]` inside an entity escaped value", () => {
      expect(ToolCallRepair.repairToolInput("{&quot;content&quot;:&quot;a, }&quot;}")).toEqual({ content: "a, }" })
      expect(ToolCallRepair.repairToolInput("{&quot;content&quot;:&quot;[1, ]&quot;}")).toEqual({ content: "[1, ]" })
    })

    test("keeps a dangling comma in an entity escaped file body", () => {
      const input = "{&quot;content&quot;:&quot;{\\n  \\&quot;x\\&quot;: 1,\\n}&quot;}"

      expect(ToolCallRepair.repairToolInput(input)).toEqual({ content: '{\n  "x": 1,\n}' })
    })

    test("still strips a trailing comma that really is one", () => {
      expect(ToolCallRepair.repairToolInput('{"path":"a.txt","edits":[1,2,],}')).toEqual({
        path: "a.txt",
        edits: [1, 2],
      })
    })
  })

  describe("HTML entity escaped arguments", () => {
    test("decodes entity escaped delimiters (xAI/Grok)", () => {
      const input = "{&quot;path&quot;:&quot;a.txt&quot;,&quot;content&quot;:&quot;x &lt; y &amp;&amp; y &gt; z&quot;}"
      expect(ToolCallRepair.repairToolInput(input)).toEqual({ path: "a.txt", content: "x < y && y > z" })
    })

    test("decodes numeric entities", () => {
      const input = "{&#34;cmd&#34;:&#34;echo &#39;hi&#39;&#34;}"
      expect(ToolCallRepair.repairToolInput(input)).toEqual({ cmd: "echo 'hi'" })
    })

    test("decodes exactly once, so an escaped ampersand survives", () => {
      const input = "{&quot;note&quot;:&quot;Tom &amp;amp; Jerry&quot;}"
      expect(ToolCallRepair.repairToolInput(input)).toEqual({ note: "Tom &amp; Jerry" })
    })

    test("leaves entities alone in valid JSON", () => {
      expect(ToolCallRepair.repairToolInput('{"note":"Tom &amp; Jerry"}')).toEqual({ note: "Tom &amp; Jerry" })
    })

    test("leaves entities alone when decoding would not fix the payload", () => {
      const input = '{"note":"Tom &amp; Jerry","x":}'
      expect(ToolCallRepair.decodeEntityEscapedJson(input)).toBe(input)
      expect(ToolCallRepair.repairToolInput(input)).toEqual({ value: input })
    })

    test("leaves entities alone in truncated but recoverable JSON", () => {
      expect(ToolCallRepair.repairToolInput('{"note":"Tom &amp; Jerry"')).toEqual({ note: "Tom &amp; Jerry" })
    })

    test("leaves unrelated entities in a decoded payload intact", () => {
      const input = "{&quot;html&quot;:&quot;a&nbsp;b&quot;}"
      expect(ToolCallRepair.repairToolInput(input)).toEqual({ html: "a&nbsp;b" })
    })

    // Documented tradeoff: the accept gate is per blob, not per entity. Once a
    // payload is accepted as entity escaped, entities inside value text are
    // decoded too. That is right for the consistently escaped output this pass
    // exists for (xAI/Grok) and wrong for a producer that escaped only the
    // delimiters; the two are indistinguishable from the blob alone.
    test("decodes value text as well, not just the delimiters", () => {
      expect(ToolCallRepair.repairToolInput("{&quot;note&quot;:&quot;Tom &amp; Jerry&quot;}")).toEqual({
        note: "Tom & Jerry",
      })
    })
  })
})
