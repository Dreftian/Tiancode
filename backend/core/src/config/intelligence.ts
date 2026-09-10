export * as ConfigIntelligence from "./intelligence"

import { Effect } from "effect"
import { Config } from "../config"

/**
 * Resolved Intelligence switches, with the defaults already applied.
 *
 * Config documents are layered (global, then project, then `.tiancode`), so a switch set in a
 * more specific file wins. A switch absent everywhere is ON: that keeps the behaviour every
 * existing install already has, and means opening the settings tab is never a prerequisite.
 */
export interface Resolved {
  readonly userMemory: boolean
  readonly projectMemory: boolean
  readonly guardrails: boolean
}

export const DEFAULTS: Resolved = {
  userMemory: true,
  projectMemory: true,
  guardrails: true,
}

/**
 * Folds the layered config documents into the effective switches.
 *
 * Later documents override earlier ones, matching how Config.entries() is ordered
 * (general first, most specific last). Kept as a plain function so callers that already hold
 * the entries — tool handlers, whose Effects must carry no service requirements — can use it
 * without dragging Config.Service into their signature.
 */
export function fromEntries(entries: readonly Config.Entry[]): Resolved {
  let resolved = { ...DEFAULTS }
  for (const entry of entries) {
    if (entry.type !== "document") continue
    const intelligence = entry.info.experimental?.intelligence
    if (!intelligence) continue
    resolved = {
      userMemory: intelligence.userMemory ?? resolved.userMemory,
      projectMemory: intelligence.projectMemory ?? resolved.projectMemory,
      guardrails: intelligence.guardrails ?? resolved.guardrails,
    }
  }
  return resolved
}

/** Convenience wrapper for callers that can require Config.Service. */
export const resolve = Effect.fn("ConfigIntelligence.resolve")(function* () {
  const config = yield* Config.Service
  return fromEntries(yield* config.entries())
})
