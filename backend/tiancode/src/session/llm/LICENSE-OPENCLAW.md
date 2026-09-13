# OpenClaw

The smart-quote and HTML-entity repair passes in `tool-call-repair.ts` are
derived from the OpenClaw project (https://github.com/openclaw/openclaw), used
under the MIT license:

- the smart-quote delimiter scanner (`normalizeSmartQuotedJson` and its helpers)
  is derived from `src/agents/embedded-agent-runner/run/attempt.tool-call-argument-repair.ts`;
- the HTML-entity decoding (`decodeEntityEscapedJson`) is derived from
  `src/agents/embedded-agent-runner/tool-call-argument-decoding.ts` and
  `src/shared/html-entities.ts`.

Tiancode's version operates on the raw argument string inside the existing JSON
repair pipeline instead of wrapping a provider stream.

What was **not** ported, and what replaces it:

- the tool-name and known-argument-key allowlists. A candidate member key (the
  lookahead that decides whether a `,` closed the previous value) is accepted on
  structure alone: upstream's 96-character cap is kept, and any candidate
  containing a double quote (straight or typographic), a comma, a colon, a
  brace, a bracket, a backslash or a line break is rejected as an overrun scan.
  This is weaker than an allowlist — value text of the shape `… ”, “word”: …`
  can still be read as a member boundary — so anything the scan cannot account
  for returns the raw argument string, which the tool schema then rejects
  loudly. A payload where a backslash precedes a curly quote (an escaped `\"`
  that was prettified as well) is refused outright for the same reason.

Beyond upstream, the repair pipeline returns the output of these two passes
as-is: the pre-existing brace balancer and trailing-comma stripper are plain
regex replaces with no string awareness, and must never run over a payload whose
delimiters were just repaired, or they delete commas out of value bodies.

Entity decoding is limited to the five entities that can appear in escaped JSON,
runs at most once, and is only kept when it is what makes the payload parse. The
accept gate is per blob, not per entity: once a blob is accepted, entities inside
value text are decoded too, so `{&quot;n&quot;:&quot;Tom &amp; Jerry&quot;}`
yields `Tom & Jerry`. That is correct for the consistently escaped output this
pass exists for (xAI/Grok) and wrong for a producer that escaped only the
delimiters — the two are indistinguishable from the blob alone, and the
consistent reading is the one that gets repaired.

MIT License

Copyright (c) 2026 OpenClaw Foundation

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
