import fuzzysort from "fuzzysort"
import type { SettingsSearchEntry } from "./search-catalog"

export type SettingsSearchItem = SettingsSearchEntry & { title: string; secondary: string }
export type SettingsSearchResult = SettingsSearchItem & { score: number }

const MAX_RESULTS = 60

/** Lower case without accents, so "configuracion" finds "configuración". */
export function normalizeSearch(value: string) {
  return value.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().trim()
}

/**
 * Ranks settings for a query, like opencode's search: 6 exact title, 5 title prefix, 4 every word
 * in the title, 3 every word in title + keywords, 2 including the page/section line, 1 fuzzy title.
 * Pages sort before rows at the same score.
 */
export function rankSettings(query: string, items: readonly SettingsSearchItem[]) {
  const q = normalizeSearch(query)
  if (!q) return { results: [] as SettingsSearchResult[], truncated: false }
  const words = q.split(/\s+/).filter(Boolean)
  const scored = items
    .map((item) => ({ ...item, score: score(q, words, item) }))
    .filter((item) => item.score > 0)
    .toSorted(
      (a, b) =>
        b.score - a.score ||
        Number(!!a.target) - Number(!!b.target) ||
        a.title.localeCompare(b.title),
    )
  return { results: scored.slice(0, MAX_RESULTS), truncated: scored.length > MAX_RESULTS }
}

function score(q: string, words: string[], item: SettingsSearchItem) {
  const title = normalizeSearch(item.title)
  const titleWords = split(title)
  const keywordWords = item.keywords.flatMap((keyword) => split(normalizeSearch(keyword)))
  const contextWords = split(normalizeSearch(item.secondary))
  // Words must start the same way: "tema" should not find "sistema".
  const found = (pool: string[]) => words.every((word) => pool.some((candidate) => candidate.startsWith(word)))
  if (title === q) return 6
  if (title.startsWith(q)) return 5
  if (found(titleWords)) return 4
  if (found([...titleWords, ...keywordWords])) return 3
  if (found([...titleWords, ...keywordWords, ...contextWords])) return 2
  const fuzzy = fuzzysort.single(q, title)
  return fuzzy && fuzzy.score >= 0.6 ? 1 : 0
}

function split(text: string) {
  return text.split(/[^\p{L}\p{N}]+/u).filter(Boolean)
}
