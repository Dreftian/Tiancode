import type { Part, ToolPart } from "@tiancode-ai/sdk/v2"
import { liveViewToolFiles } from "@/pages/session/live-view-activity"
import type { SummaryDiff } from "./timeline-row"

/** Why a finished turn offers to open the app: it changed it, started it, or looked at it closely. */
export type PreviewOfferReason = "modified" | "started" | "reviewed"
export type PreviewOffer = { reason: PreviewOfferReason; entry?: string }

// Files a browser renders, or that only exist in front-end projects. Plain .js/.ts are left out on
// purpose: a Node script or a backend edit is not a reason to open a preview.
const WEB_FILE = /\.(?:html?|css|scss|sass|less|styl|jsx|tsx|vue|svelte|astro)$/i
const WEB_CONFIG =
  /(?:^|\/)(?:package\.json|(?:vite|next|nuxt|astro|svelte|tailwind|remix|webpack|rollup|postcss|electron\.vite|quasar|gatsby)\.config\.[cm]?[jt]s|tauri\.conf\.json|angular\.json|electron-builder\.(?:json|ya?ml))$/i
const NOT_THE_APP = /(?:\.(?:test|spec|stories)\.[cm]?[jt]sx?$)|(?:^|\/)(?:__tests__|__mocks__|e2e|node_modules|dist|build|coverage)\//i
const EDIT_TOOLS = new Set(["write", "edit", "apply_patch", "multiedit", "patch"])
const START_TOOLS = new Set(["preview_start", "preview_restart"])
const LOOK_TOOLS = new Set(["preview_inspect", "preview_interact", "preview_status", "preview_logs"])
// Reading a handful of web files is a review; one or two glances are not.
const REVIEW_READS = 3

/**
 * Decides whether a finished turn built or reviewed an app or website, from its own tool calls.
 *
 * `diffs` is the turn's summary diff: it also carries edits a subagent made through the task tool,
 * which never show up as parts of the parent turn.
 */
export function previewOffer(parts: readonly Part[], diffs: readonly SummaryDiff[] = []): PreviewOffer | undefined {
  const tools = parts.filter((part): part is ToolPart => part.type === "tool" && part.state.status === "completed")
  const edited = tools.filter((part) => EDIT_TOOLS.has(part.tool)).flatMap(editedFiles).filter(isAppFile)
  const fromDiffs = diffs.map((diff) => normalize(diff.file)).filter(isAppFile)
  const changed = [...new Set([...edited, ...fromDiffs])]
  if (tools.some((part) => START_TOOLS.has(part.tool))) return { reason: "started", entry: pickEntry(changed) }
  if (changed.length > 0) return { reason: "modified", entry: pickEntry(changed) }
  const read = [
    ...new Set(
      tools
        .filter((part) => part.tool === "read")
        .map((part) => part.state.input.filePath ?? part.state.input.path)
        .filter((path): path is string => typeof path === "string")
        .map(normalize)
        .filter(isAppFile),
    ),
  ]
  if (tools.some((part) => LOOK_TOOLS.has(part.tool)) || read.length >= REVIEW_READS)
    return { reason: "reviewed", entry: pickEntry(read) }
}

/** index.html first, then the folder of a package.json, then the first web file. */
export function pickEntry(files: readonly string[]) {
  const html = files.find((file) => /(?:^|\/)index\.html?$/i.test(file))
  if (html) return html
  const pkg = files.find((file) => /(?:^|\/)package\.json$/i.test(file))
  if (pkg) return pkg.replace(/\/?package\.json$/i, "") || "."
  return files[0]
}

export function isAppFile(path: string) {
  const file = normalize(path)
  if (!file || NOT_THE_APP.test(file)) return false
  return WEB_FILE.test(file) || WEB_CONFIG.test(file)
}

function editedFiles(part: ToolPart) {
  return liveViewToolFiles(part).map(normalize)
}

function normalize(path: string) {
  return path.replace(/\\/g, "/").replace(/^file:\/\/\/?/, "")
}
