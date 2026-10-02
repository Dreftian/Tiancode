import { describe, expect, test } from "bun:test"
import { DecisionPresets } from "../../src/decision/presets"
import { DecisionSequence } from "../../src/decision/sequence"
import type { DecisionTokenizer } from "../../src/decision/tokenizer"

// One id per character keeps the arithmetic visible; the special ids sit below any letter.
const tok: DecisionTokenizer.Tokenizer = {
  clsId: 1,
  sepId: 2,
  maskId: 3,
  padId: 0,
  maskToken: "[MASK]",
  encode: (text) => Array.from(text, (char) => char.codePointAt(0) ?? 0),
}

const decode = (ids: number[]) => String.fromCodePoint(...ids.filter((id) => id > 3))

describe("decision.sequence", () => {
  test("keeps the end of a long message for the outcome question", () => {
    const message = "a".repeat(2000) + "¿Aplico la migración?"
    const seq = DecisionSequence.build(tok, message, DecisionPresets.outcome, 512, 256)

    expect(seq.ids).toHaveLength(512)
    expect(seq.ids.at(-1)).toBe(tok.sepId)
    expect(decode(seq.ids)).toEndWith("¿Aplico la migración?")
  })

  test("keeps the start of a long request for the work-area question", () => {
    const request = "Fix the login form" + "b".repeat(2000)
    const seq = DecisionSequence.build(tok, request, DecisionPresets.area, 512, 256)

    expect(decode(seq.ids)).toContain("Fix the login form")
  })
})

describe("decision.sequence closing", () => {
  test("keeps the last whole sentences within the limit", () => {
    const text = "Revisé el módulo. Añadí pruebas. ¿Aplico la migración ahora o prefieres revisarla primero?"
    expect(DecisionSequence.closing(text, 80)).toBe("Añadí pruebas. ¿Aplico la migración ahora o prefieres revisarla primero?")
    expect(DecisionSequence.closing(text, 20)).toBe("¿Aplico la migración ahora o prefieres revisarla primero?")
  })

  test("treats lines as pieces so a list ending is read as such", () => {
    expect(DecisionSequence.closing("Opciones:\n- A\n- B", 10)).toBe("- A - B")
  })
})
