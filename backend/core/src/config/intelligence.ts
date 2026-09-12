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
  readonly codeGraph: boolean
  readonly outputDistiller: boolean
  readonly toolCallRepair: boolean
  readonly loopBreaker: boolean
  readonly cleanWeb: boolean
  readonly autoSkillLearn: boolean
}

export const DEFAULTS: Resolved = {
  userMemory: true,
  projectMemory: true,
  guardrails: true,
  codeGraph: true,
  outputDistiller: true,
  toolCallRepair: true,
  loopBreaker: true,
  cleanWeb: true,
  autoSkillLearn: true,
}

/** One authored `experimental.intelligence` block: every switch optional. */
export type Switches = { readonly [K in keyof Resolved]?: boolean | undefined }

function apply(resolved: Resolved, switches: Switches): Resolved {
  return {
    userMemory: switches.userMemory ?? resolved.userMemory,
    projectMemory: switches.projectMemory ?? resolved.projectMemory,
    guardrails: switches.guardrails ?? resolved.guardrails,
    codeGraph: switches.codeGraph ?? resolved.codeGraph,
    outputDistiller: switches.outputDistiller ?? resolved.outputDistiller,
    toolCallRepair: switches.toolCallRepair ?? resolved.toolCallRepair,
    loopBreaker: switches.loopBreaker ?? resolved.loopBreaker,
    cleanWeb: switches.cleanWeb ?? resolved.cleanWeb,
    autoSkillLearn: switches.autoSkillLearn ?? resolved.autoSkillLearn,
  }
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
    resolved = apply(resolved, intelligence)
  }
  return resolved
}

/**
 * Same fold for callers that hold one already-merged config document instead of the layered
 * entries — the session processor and the LLM runtime read it from their `Config.get()`,
 * which has merged the layers for them.
 */
export function fromConfig(switches: Switches | undefined): Resolved {
  return switches ? apply(DEFAULTS, switches) : DEFAULTS
}

/** Convenience wrapper for callers that can require Config.Service. */
export const resolve = Effect.fn("ConfigIntelligence.resolve")(function* () {
  const config = yield* Config.Service
  return fromEntries(yield* config.entries())
})
