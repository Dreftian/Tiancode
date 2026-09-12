// Which OS window belongs to the desktop app the Sandbox just launched.
//
// There is no direct answer available. `desktopCapturer.getSources` gives `{ id, name, thumbnail }`
// and nothing else — no pid, no owner — where `id` is `window:<handle>:<ownProcess>`. And the pid
// the preview manager reports is usually the cmd.exe wrapper it spawned, not the process that owns
// the window, so a single pid comparison would never match either.
//
// So this module stacks three signals, strongest first: the window handle of any descendant
// process, the window title of any descendant process, and "this window did not exist before we
// pressed Run". When they disagree or tie, it returns nothing and the panel asks the user — a
// wrong window silently mirrored is worse than a picker.

export type WindowSourceLike = { id: string; name: string }

export type ParsedWindowSource = {
  /** The HWND, as Chromium serialises it into the source id. */
  handle: number
  /** True for windows owned by Tiancode itself, which must never be mirrored. */
  ownProcess: boolean
}

/** `window:132456:0` → `{ handle: 132456, ownProcess: false }`. Screens and junk return null. */
export function parseWindowSourceId(id: string): ParsedWindowSource | null {
  const parts = id.split(":")
  if (parts.length < 3 || parts[0] !== "window") return null
  const handle = Number.parseInt(parts[1] ?? "", 10)
  if (!Number.isFinite(handle)) return null
  return { handle, ownProcess: parts[2] === "1" }
}

/** Shell chrome that is never the user's app, however well its title happens to score. */
const NEVER_MATCH = new Set([
  "program manager",
  "windows input experience",
  "settings",
  "microsoft text input application",
  "task switching",
  "",
])

function normalize(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()
}

/** Crude token overlap: enough to separate "Winedit11" from "Slack" without a similarity library. */
function titleScore(title: string, hints: string[]) {
  const haystack = normalize(title)
  if (!haystack) return 0
  let score = 0
  for (const hint of hints) {
    const needle = normalize(hint)
    if (needle.length < 3) continue
    if (haystack === needle) score += 6
    else if (haystack.includes(needle) || needle.includes(haystack)) score += 4
    else {
      const words = needle.split(" ").filter((word) => word.length >= 4)
      for (const word of words) if (haystack.includes(word)) score += 1
    }
  }
  return score
}

export type RankInput = {
  sources: WindowSourceLike[]
  /** Window handles owned by the spawned process tree, if we could read them. */
  handles: number[]
  /** Window titles owned by the spawned process tree, if we could read them. */
  titles: string[]
  /** Source ids that were NOT on screen before the app was launched. */
  appearedAfter: string[]
  /** Project name, product name, framework — anything that might show up in a title bar. */
  hints: string[]
}

export type RankedWindow = { id: string; name: string; score: number; reason: string }

/**
 * Ordered candidates, best first. Pure — no Electron, no child_process — so the ranking that
 * decides what the user sees mirrored is testable on its own.
 */
export function rankSources(input: RankInput): RankedWindow[] {
  const handles = new Set(input.handles)
  const titles = new Set(input.titles.map(normalize).filter(Boolean))
  const appeared = new Set(input.appearedAfter)
  const ranked: RankedWindow[] = []

  for (const source of input.sources) {
    const parsed = parseWindowSourceId(source.id)
    if (!parsed || parsed.ownProcess) continue
    if (NEVER_MATCH.has(source.name.trim().toLowerCase())) continue

    let score = 0
    let reason = ""
    if (handles.has(parsed.handle)) {
      score += 100
      reason = "handle"
    }
    if (titles.has(normalize(source.name))) {
      score += 40
      reason ||= "title"
    }
    if (appeared.has(source.id)) {
      score += 10
      reason ||= "appeared"
    }
    const hinted = titleScore(source.name, input.hints)
    score += hinted
    if (!reason && hinted > 0) reason = "hint"
    if (score <= 0) continue
    ranked.push({ id: source.id, name: source.name, score, reason })
  }

  return ranked.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
}

/**
 * The single best candidate, or null when the evidence is too thin to pick for the user.
 *
 * A tie at the top, or a top candidate resting only on "it appeared recently", means the panel
 * shows the picker instead. Mirroring the wrong window looks like a broken app.
 */
export function bestWindow(ranked: RankedWindow[]): RankedWindow | null {
  const [first, second] = ranked
  if (!first) return null
  if (first.reason === "handle") return first
  if (second && second.score === first.score) return null
  if (first.score < 10) return null
  return first
}

