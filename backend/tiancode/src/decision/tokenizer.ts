// Adapted from laya-ts (https://github.com/NandhaKishorM/laya, laya-ts/src/tokenizer.ts),
// Copyright Convai Innovations, Apache License 2.0. Modified for Tiancode: only the Metaspace
// BPE with byte fallback that laya-multilingual (mmBERT) uses is kept.

export * as DecisionTokenizer from "./tokenizer"

export interface Tokenizer {
  readonly clsId: number
  readonly sepId: number
  readonly maskId: number
  readonly padId: number
  readonly maskToken: string
  readonly encode: (text: string) => number[]
}

type AddedToken = { content: string; id: number; lstrip: boolean; rstrip: boolean }

const METASPACE = "▁"
// Pieces at least this long take the heap merge: a Chinese or Japanese state has no spaces, so it
// reaches the merge as one piece and the plain rescan is quadratic in its length.
const HEAP_MIN_LEN = 32

/** Parse a Hugging Face tokenizer.json (Metaspace BPE) into an encoder. */
export function parse(raw: unknown): Tokenizer | undefined {
  if (!isRecord(raw) || !isRecord(raw.model) || !isRecord(raw.model.vocab)) return
  const vocab = new Map<string, number>()
  for (const [token, id] of Object.entries(raw.model.vocab)) if (typeof id === "number") vocab.set(token, id)
  const merges = new Map<string, number>()
  const list = Array.isArray(raw.model.merges) ? raw.model.merges : []
  list.forEach((merge, rank) => {
    const pair = typeof merge === "string" ? merge.split(" ") : Array.isArray(merge) ? merge.map(String) : []
    if (pair.length >= 2) merges.set(pair[0] + " " + pair[1], rank)
  })
  const added = (Array.isArray(raw.added_tokens) ? raw.added_tokens : []).flatMap((token): AddedToken[] =>
    isRecord(token) && typeof token.content === "string" && typeof token.id === "number" && token.content
      ? [{ content: token.content, id: token.id, lstrip: token.lstrip === true, rstrip: token.rstrip === true }]
      : [],
  )
  const special = (aliases: string[]) =>
    aliases
      .map((alias) => ({ alias, id: added.find((token) => token.content === alias)?.id ?? vocab.get(alias) }))
      .find((item) => item.id !== undefined)
  const cls = special(["[CLS]", "<bos>", "<s>"])
  const sep = special(["[SEP]", "<eos>", "</s>"])
  const mask = special(["[MASK]", "<mask>"])
  const pad = special(["[PAD]", "<pad>"])
  const unk = special(["[UNK]", "<unk>"])
  if (cls?.id === undefined || sep?.id === undefined || mask?.id === undefined || pad?.id === undefined) return
  const replaces = collectReplaces(raw.normalizer)
  const byteFallback = raw.model.byte_fallback === true
  const addedRegex = added.length
    ? new RegExp(
        added
          .map((token) => token.content)
          .toSorted((a, b) => b.length - a.length)
          .map((content) => content.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
          .join("|"),
        "gu",
      )
    : undefined
  const byContent = new Map(added.map((token) => [token.content, token]))
  const unkId = unk?.id ?? 0
  const encodeText = (text: string) =>
    metaspaceEncode(vocab, merges, text, unkId, replaces.length ? replaces : [[" ", METASPACE]], byteFallback)
  return {
    clsId: cls.id,
    sepId: sep.id,
    maskId: mask.id,
    padId: pad.id,
    maskToken: mask.alias,
    encode: (text) => {
      if (!addedRegex) return encodeText(text)
      const out: number[] = []
      let last = 0
      for (const match of text.matchAll(addedRegex)) {
        const token = byContent.get(match[0])
        if (!token) continue
        const before = text.slice(last, match.index)
        out.push(...encodeText(token.lstrip ? before.trimEnd() : before))
        out.push(token.id)
        last = match.index + match[0].length
        if (token.rstrip) while (last < text.length && /\s/u.test(text[last])) last++
      }
      out.push(...encodeText(text.slice(last)))
      return out
    },
  }
}

function metaspaceEncode(
  vocab: Map<string, number>,
  merges: Map<string, number>,
  text: string,
  unk: number,
  replaces: ReadonlyArray<readonly [string, string]>,
  byteFallback: boolean,
) {
  if (!text) return []
  const replaced = replaces.reduce((acc, [from, to]) => acc.split(from).join(to), text)
  const encoder = new TextEncoder()
  const out: number[] = []
  const push = (piece: string) => {
    for (const token of bpeWord(Array.from(piece), merges)) {
      const id = vocab.get(token)
      if (id !== undefined) {
        out.push(id)
        continue
      }
      const bytes = byteFallback
        ? Array.from(encoder.encode(token), (b) => vocab.get(`<0x${b.toString(16).toUpperCase().padStart(2, "0")}>`))
        : []
      if (bytes.length > 0 && bytes.every((b) => b !== undefined)) out.push(...(bytes as number[]))
      else out.push(unk)
    }
  }
  for (const segment of replaced.split(/(\n+)/)) {
    if (!segment) continue
    if (segment[0] === "\n") {
      push(segment)
      continue
    }
    const word = segment.startsWith(METASPACE) ? segment : METASPACE + segment
    for (const chunk of word.split(METASPACE).slice(1)) push(chunk ? METASPACE + chunk : METASPACE)
  }
  return out
}

/** Greedy BPE merge by rank: lowest rank first, leftmost on a tie. */
function bpeWord(chars: string[], rank: Map<string, number>): string[] {
  if (chars.length >= HEAP_MIN_LEN) return bpeWordHeap(chars, rank)
  let word = chars.slice()
  if (word.length <= 1) return word
  for (;;) {
    let best = Infinity
    let index = -1
    for (let i = 0; i < word.length - 1; i++) {
      const r = rank.get(word[i] + " " + word[i + 1])
      if (r !== undefined && r < best) {
        best = r
        index = i
      }
    }
    if (index < 0) return word
    word = [...word.slice(0, index), word[index] + word[index + 1], ...word.slice(index + 2)]
  }
}

/** The same rule in O(n log n): a linked list of slots and a min-heap of (rank, slot) with lazy deletion. */
function bpeWordHeap(chars: string[], rank: Map<string, number>): string[] {
  const n = chars.length
  const tok = chars.slice()
  const next = new Int32Array(n)
  const prev = new Int32Array(n)
  const version = new Int32Array(n)
  const dead = new Uint8Array(n)
  for (let i = 0; i < n; i++) {
    prev[i] = i - 1
    next[i] = i + 1 < n ? i + 1 : -1
  }
  let capacity = 3 * n
  let heapRank = new Int32Array(capacity)
  let heapSlot = new Int32Array(capacity)
  let heapVer = new Int32Array(capacity)
  let size = 0
  const offer = (slot: number) => {
    const right = next[slot]
    if (right < 0) return
    const r = rank.get(tok[slot] + " " + tok[right])
    if (r === undefined) return
    if (size === capacity) {
      capacity *= 2
      const grow = (from: Int32Array) => {
        const to = new Int32Array(capacity)
        to.set(from)
        return to
      }
      heapRank = grow(heapRank)
      heapSlot = grow(heapSlot)
      heapVer = grow(heapVer)
    }
    let c = size++
    while (c > 0) {
      const p = (c - 1) >> 1
      if (heapRank[p] < r || (heapRank[p] === r && heapSlot[p] < slot)) break
      heapRank[c] = heapRank[p]
      heapSlot[c] = heapSlot[p]
      heapVer[c] = heapVer[p]
      c = p
    }
    heapRank[c] = r
    heapSlot[c] = slot
    heapVer[c] = version[slot]
  }
  for (let i = 0; i < n - 1; i++) offer(i)
  while (size > 0) {
    const slot = heapSlot[0]
    const ver = heapVer[0]
    const lastRank = heapRank[--size]
    const lastSlot = heapSlot[size]
    const lastVer = heapVer[size]
    if (size > 0) {
      let c = 0
      for (;;) {
        const l = 2 * c + 1
        if (l >= size) break
        const r = l + 1
        const m = r < size && (heapRank[r] < heapRank[l] || (heapRank[r] === heapRank[l] && heapSlot[r] < heapSlot[l])) ? r : l
        if (heapRank[m] > lastRank || (heapRank[m] === lastRank && heapSlot[m] > lastSlot)) break
        heapRank[c] = heapRank[m]
        heapSlot[c] = heapSlot[m]
        heapVer[c] = heapVer[m]
        c = m
      }
      heapRank[c] = lastRank
      heapSlot[c] = lastSlot
      heapVer[c] = lastVer
    }
    if (dead[slot] || version[slot] !== ver) continue
    const right = next[slot]
    if (right < 0 || dead[right]) continue
    tok[slot] = tok[slot] + tok[right]
    dead[right] = 1
    const after = next[right]
    next[slot] = after
    if (after >= 0) prev[after] = slot
    version[slot]++
    offer(slot)
    const before = prev[slot]
    if (before >= 0) {
      version[before]++
      offer(before)
    }
  }
  const out: string[] = []
  for (let i = 0; i >= 0; i = next[i]) out.push(tok[i])
  return out
}

function collectReplaces(node: unknown): Array<[string, string]> {
  if (!isRecord(node)) return []
  const own: Array<[string, string]> =
    node.type === "Replace" && isRecord(node.pattern) && typeof node.pattern.String === "string" && typeof node.content === "string"
      ? [[node.pattern.String, node.content]]
      : []
  const children = Array.isArray(node.normalizers) ? node.normalizers : []
  return [...own, ...children.flatMap(collectReplaces)]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
