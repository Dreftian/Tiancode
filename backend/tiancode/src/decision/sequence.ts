// Adapted from laya-ts (https://github.com/NandhaKishorM/laya, laya-ts/src/common.ts and
// agent.ts), Copyright Convai Innovations, Apache License 2.0. Modified for Tiancode.

export * as DecisionSequence from "./sequence"

import type { Tokenizer } from "./tokenizer"

export type QuestionType = "choice" | "score" | "noul"

/** One typed question. Choice criteria map each label to what it means. */
export interface Question {
  readonly type: QuestionType
  readonly instructions: string
  readonly criteria: Readonly<Record<string, string>> | readonly string[]
  /** Keep the end of a text too long for the model, for questions about how it ends. */
  readonly tail?: boolean
  /** Read only the closing sentences, up to this many characters (at least the last one). */
  readonly ending?: number
}

export const QUESTION_TYPE: Record<QuestionType, number> = { choice: 0, score: 1, noul: 2 }
// Each option is capped at this many tokens, and all options share the head budget.
const OPTION_TOKENS = 48

/** The option texts the model reads, in order: `label: description` for a choice. */
export function options(question: Question): string[] {
  if (question.type === "choice") {
    return Object.entries(question.criteria).map(([label, text]) => (text ? `${label}: ${text}` : label))
  }
  if (question.type === "score") {
    return Object.values(question.criteria).map((text, index) => `level ${index}: ${text}`)
  }
  const criteria = Array.isArray(question.criteria) ? {} : (question.criteria as Record<string, string>)
  return [
    `false: ${criteria.false || "no, the statement does not hold"}`,
    `true: ${criteria.true || "yes, the statement holds"}`,
  ]
}

/** The labels answers are reported with, matching `options()`. */
export function labels(question: Question): string[] {
  if (question.type === "choice") return Object.keys(question.criteria)
  if (question.type === "score") return Object.values(question.criteria).map((_, index) => String(index))
  return ["false", "true"]
}

/**
 * `[CLS] {type} question: {instructions} [SEP] [MASK] option … [SEP] state [SEP]`, clamped to
 * `maxLen`. The returned markers are the positions of each option's `[MASK]`.
 */
export function build(tok: Tokenizer, state: string, question: Question, maxLen: number, headMaxLen: number) {
  const strip = (text: string) => text.split(tok.maskToken).join(" ")
  const source = question.ending ? closing(state, question.ending) : state
  const optionIds = options(question).map((text) => [
    tok.maskId,
    ...tok.encode(" " + strip(text)).slice(0, OPTION_TOKENS),
  ])
  const used = optionIds.reduce((sum, ids) => sum + ids.length, 0)
  // When the options leave less than 16 tokens for the question, every option is cut evenly.
  const fitted =
    headMaxLen - used < 16
      ? optionIds.map((ids) => ids.slice(0, Math.max(4, Math.floor((headMaxLen - 16) / Math.max(1, optionIds.length)))))
      : optionIds
  const budget = headMaxLen - fitted.reduce((sum, ids) => sum + ids.length, 0)
  const head = tok.encode(`${question.type} question: ${strip(question.instructions)}`).slice(0, Math.max(8, budget))
  const prefix = [tok.clsId, ...head, tok.sepId]
  const markers = fitted.map((ids) => {
    const position = prefix.length
    prefix.push(...ids)
    return position
  })
  prefix.push(tok.sepId)
  const room = Math.max(0, maxLen - prefix.length - 1)
  const encoded = tok.encode(strip(source))
  const kept = question.tail ? encoded.slice(Math.max(0, encoded.length - room)) : encoded.slice(0, room)
  const ids = [...prefix, ...kept, tok.sepId].slice(0, maxLen)
  return { ids, markers: markers.filter((position) => position < maxLen) }
}

/** The last whole sentences (or lines) of `text`, at most `limit` characters but never empty. */
export function closing(text: string, limit: number) {
  const pieces = text
    .trim()
    .split(/(?<=[.!?…])\s+|\n+/)
    .filter((piece) => piece.trim())
  const kept: string[] = []
  for (const piece of pieces.toReversed()) {
    if (kept.length > 0 && [piece, ...kept].join(" ").length > limit) break
    kept.unshift(piece.trim())
  }
  return kept.join(" ")
}

export function softmax(values: number[]) {
  const max = Math.max(...values)
  const exp = values.map((value) => Math.exp(value - max))
  const sum = exp.reduce((a, b) => a + b, 0)
  return exp.map((value) => value / sum)
}
