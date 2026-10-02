import type { Part } from "@tiancode-ai/sdk/v2"
import type { TranscriptView } from "@/context/settings"

/**
 * How much of a turn the timeline shows, per kind of activity (opencode v2's timeline detail).
 * `hidden` drops it (failed commands still show), `grouped` keeps it compact (read/search tools
 * fold into one context row), `separate` gives every call its own row; `details` decides whether
 * shell output, edits and thinking start open.
 */
export const timelineCategories = ["shell", "edit", "thinking", "subagents", "notices", "tools"] as const
export type TimelineCategory = (typeof timelineCategories)[number]
export type TimelinePlacement = "separate" | "grouped" | "hidden"
export type TimelineExpansion = "collapsed" | "expanded"
export type TimelineDetail = {
  shell: { placement: TimelinePlacement; details: TimelineExpansion }
  edit: { placement: TimelinePlacement; details: TimelineExpansion }
  thinking: { placement: TimelinePlacement; details: TimelineExpansion }
  subagents: { placement: TimelinePlacement }
  notices: { placement: TimelinePlacement }
  tools: { placement: TimelinePlacement }
}
export const expandableCategories = ["shell", "edit", "thinking"] as const satisfies readonly TimelineCategory[]

const hidden = { placement: "hidden" } as const
const grouped = { placement: "grouped" } as const
const separate = { placement: "separate" } as const

/** Slider order, left to right. */
export const timelinePresets = [
  {
    id: "text-only",
    value: {
      shell: { ...hidden, details: "collapsed" },
      edit: { ...hidden, details: "collapsed" },
      thinking: { ...hidden, details: "collapsed" },
      subagents: hidden,
      notices: hidden,
      tools: hidden,
    },
  },
  {
    id: "quiet",
    value: {
      shell: { ...hidden, details: "collapsed" },
      edit: { ...grouped, details: "collapsed" },
      thinking: { ...hidden, details: "collapsed" },
      subagents: grouped,
      notices: hidden,
      tools: hidden,
    },
  },
  {
    // Tiancode's long-standing default view: tools folded, thinking hidden.
    id: "compact",
    value: {
      shell: { ...grouped, details: "collapsed" },
      edit: { ...grouped, details: "collapsed" },
      thinking: { ...hidden, details: "collapsed" },
      subagents: grouped,
      notices: grouped,
      tools: grouped,
    },
  },
  {
    id: "detailed",
    value: {
      shell: { ...separate, details: "expanded" },
      edit: { ...separate, details: "expanded" },
      thinking: { ...grouped, details: "collapsed" },
      subagents: separate,
      notices: grouped,
      tools: grouped,
    },
  },
  {
    id: "everything",
    value: {
      shell: { ...separate, details: "expanded" },
      edit: { ...separate, details: "expanded" },
      thinking: { ...separate, details: "expanded" },
      subagents: separate,
      notices: separate,
      tools: separate,
    },
  },
] as const satisfies readonly { id: string; value: TimelineDetail }[]

export type TimelinePresetID = (typeof timelinePresets)[number]["id"]

export function clonePreset(id: TimelinePresetID): TimelineDetail {
  const preset = timelinePresets.find((item) => item.id === id) ?? timelinePresets[2]
  return structuredClone(preset.value) as TimelineDetail
}

/** The preset a detail matches (expansion only matters for categories that are shown). */
export function timelinePreset(value: TimelineDetail) {
  return timelinePresets.find((preset) =>
    timelineCategories.every((category) => {
      const current = value[category]
      const expected = preset.value[category]
      if (current.placement !== expected.placement) return false
      if (current.placement === "hidden" || !("details" in current) || !("details" in expected)) return true
      return current.details === expected.details
    }),
  )?.id
}

const placements = new Set<string>(["separate", "grouped", "hidden"])
const expansions = new Set<string>(["collapsed", "expanded"])

/** Validates a stored value; anything malformed reads as "not set" so the legacy view applies. */
export function parseTimelineDetail(raw: unknown): TimelineDetail | undefined {
  if (!raw || typeof raw !== "object") return
  const value = raw as Record<string, unknown>
  const entries = timelineCategories.map((category) => {
    const entry = value[category]
    if (!entry || typeof entry !== "object") return
    const placement = (entry as Record<string, unknown>).placement
    if (typeof placement !== "string" || !placements.has(placement)) return
    if (!expandableCategories.includes(category as (typeof expandableCategories)[number])) return [category, { placement }]
    const details = (entry as Record<string, unknown>).details
    return [category, { placement, details: typeof details === "string" && expansions.has(details) ? details : "collapsed" }]
  })
  if (entries.some((entry) => !entry)) return
  return Object.fromEntries(entries as [string, unknown][]) as TimelineDetail
}

/** The detail equivalent to Tiancode's older Normal / Thinking / Detailed view. */
export function transcriptViewDetail(view: TranscriptView): TimelineDetail {
  if (view === "detailed") return clonePreset("detailed")
  const detail = clonePreset("compact")
  if (view === "thinking") detail.thinking = { placement: "grouped", details: "collapsed" }
  return detail
}

/** The closest older view, for the per-session Normal / Thinking / Detailed menu. */
export function legacyView(detail: TimelineDetail): TranscriptView {
  if (detail.shell.details === "expanded" || detail.edit.details === "expanded") return "detailed"
  if (detail.thinking.placement !== "hidden") return "thinking"
  return "normal"
}

const SHELL_TOOLS = new Set(["bash", "shell", "execute"])
const EDIT_TOOLS = new Set(["edit", "write", "patch", "apply_patch", "multiedit"])
const SUBAGENT_TOOLS = new Set(["task", "subagent"])

export function partCategory(part: Part): TimelineCategory | undefined {
  if (part.type === "reasoning") return "thinking"
  if (part.type !== "tool") return
  if (SHELL_TOOLS.has(part.tool)) return "shell"
  if (EDIT_TOOLS.has(part.tool)) return "edit"
  if (SUBAGENT_TOOLS.has(part.tool)) return "subagents"
  return "tools"
}

/** Hidden categories are dropped, except failures the user must see. */
export function partVisible(part: Part, detail: TimelineDetail) {
  const category = partCategory(part)
  if (!category || detail[category].placement !== "hidden") return true
  if (part.type !== "tool") return false
  if (part.state.status === "error") return true
  if (category !== "shell" || part.state.status !== "completed") return false
  const exit = (part.state.metadata as Record<string, unknown> | undefined)?.exit
  return typeof exit === "number" && exit !== 0
}

/** Whether a part starts open: shell, edits and thinking follow `details`; the rest stay closed. */
export function partOpen(part: Part, detail: TimelineDetail) {
  const category = partCategory(part)
  if (category !== "shell" && category !== "edit" && category !== "thinking") return
  const entry = detail[category]
  return entry.placement === "separate" && entry.details === "expanded"
}
