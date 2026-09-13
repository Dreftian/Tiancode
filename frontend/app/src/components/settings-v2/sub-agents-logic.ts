/**
 * Pure helpers behind the Sub-Agents settings panel.
 *
 * They live outside the component for two reasons: the panel used to render a hardcoded
 * catalogue and never showed the agents the user actually has on disk, and the "RLM tree"
 * under it invented its own nodes. Both are now derived from the server's agent list, and
 * the derivation is testable without a DOM.
 */

/** The subset of `Agent` (SDK) this panel needs. Kept structural so tests need no SDK types. */
export interface AgentSource {
  name: string
  description?: string
  mode?: string
  native?: boolean
  hidden?: boolean
  color?: string
  icon?: string
  model?: { providerID?: string; modelID?: string }
  permission?: unknown
}

export interface AgentPresentation {
  title: string
  role: string
  icon: string
  color: string
  category: string
  description?: string
}

export type AgentMode = "primary" | "subagent" | "all"

export interface PanelAgent {
  name: string
  title: string
  role: string
  category: string
  description: string
  icon: string
  color: string
  mode: AgentMode
  /** Ships with Tiancode: presentation metadata, not editable or deletable from here. */
  builtin: boolean
  enabled: boolean
  /**
   * Blanket `task` verdict: whether the agent may delegate to *anything*. Derived from the same
   * rules as {@link PanelAgent.delegation}, so the two can never disagree.
   */
  canDelegate: boolean
  /**
   * The agent's `task` rules, so the tree can ask per target instead of assuming one answer for
   * all of them. `plan` denies exactly one delegate (`task: { general: "deny" }`) and inherits
   * the rest; a single boolean turned that into a tree edge that does not exist.
   */
  delegation: readonly DelegationRule[]
  model?: string
  tools: ToolSummary
}

/** One `task` permission rule: the target it names and the verdict for it. */
export interface DelegationRule {
  pattern: string
  action: string
}

export interface ToolSummary {
  /** The agent does not effectively inherit every tool permission the panel lists. */
  restricted: boolean
  /** How many of the listed tool permissions are effectively allowed. */
  allowed: number
}

/**
 * Agents the backend runs for its own bookkeeping. The server already marks them
 * `hidden`, but a disabled one only survives in config, where the flag is lost.
 */
export const INTERNAL_AGENTS = ["compaction", "title", "summary"] as const

/** Agent identifiers the backend accepts as a file name: lowercase, digits, single hyphens. */
export const AGENT_IDENTIFIER_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

export type AgentNameProblem = "empty" | "invalid" | "taken"

/**
 * Refuses anything the backend would turn into a surprising file name, and any identifier
 * already in use — creating one twice silently overwrites the existing definition.
 */
export function validateAgentName(raw: string, existing: readonly string[] = []): AgentNameProblem | undefined {
  const name = raw.trim()
  if (!name) return "empty"
  if (!AGENT_IDENTIFIER_PATTERN.test(name)) return "invalid"
  const lowered = name.toLowerCase()
  if (existing.some((item) => item.trim().toLowerCase() === lowered)) return "taken"
  return undefined
}

/**
 * Best-effort repair of an identifier. The model that drafts an agent is asked for a slug but
 * sometimes answers "Code Reviewer" or "code_reviewer"; the form would then reject its own draft.
 */
export function toAgentIdentifier(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[\s_.]+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "")
}

type PermissionRuleLike = { pattern?: string; permission?: string; action?: string }

function rulesOf(agent: Pick<AgentSource, "permission">): PermissionRuleLike[] {
  const permission = agent.permission
  if (Array.isArray(permission)) return permission as PermissionRuleLike[]
  return []
}

/**
 * The glob the backend matches permission rules with, ported from
 * `backend/core/src/util/wildcard.ts` so the panel reads a ruleset the same way the server does.
 *
 * Case-insensitive, like the server on Windows: agent identifiers are lowercase by contract
 * (AGENT_IDENTIFIER_PATTERN), so the only thing this widens is a hand-written rule that spells a
 * markdown agent's name with different case than its file.
 */
// A ruleset carries a few dozen rules and the panel evaluates nine permissions against every one
// of ~30 agents on each recompute, so the compiled pattern is kept rather than rebuilt each time.
const patternCache = new Map<string, RegExp>()

export function wildcardMatch(input: string, pattern: string): boolean {
  let regex = patternCache.get(pattern)
  if (!regex) {
    let escaped = pattern
      .replaceAll("\\", "/")
      .replace(/[.+^${}()|[\]\\]/g, "\\$&")
      .replace(/\*/g, ".*")
      .replace(/\?/g, ".")
    if (escaped.endsWith(" .*")) escaped = escaped.slice(0, -3) + "( .*)?"
    regex = new RegExp(`^${escaped}$`, "si")
    patternCache.set(pattern, regex)
  }
  return regex.test(input.replaceAll("\\", "/"))
}

/**
 * The effective action for `permission` at `pattern`, exactly as `Permission.evaluate` computes
 * it: the *last* rule whose permission and pattern both match wins. `undefined` means no rule
 * matched, which on the server falls through to "ask" — never to "deny".
 */
export function effectivePermission(
  rules: readonly PermissionRuleLike[],
  permission: string,
  pattern: string,
): string | undefined {
  return rules.findLast(
    (rule) =>
      !!rule && wildcardMatch(permission, rule.permission ?? "") && wildcardMatch(pattern, rule.pattern ?? ""),
  )?.action
}

/** Every `task` rule in the ruleset, in merge order, reduced to target pattern plus verdict. */
export function delegationRules(agent: Pick<AgentSource, "permission">): DelegationRule[] {
  return rulesOf(agent)
    .filter((rule) => !!rule && wildcardMatch("task", rule.permission ?? ""))
    .map((rule) => ({ pattern: rule.pattern ?? "*", action: rule.action ?? "" }))
}

/**
 * Whether this agent may hand work to the agent called `target`.
 *
 * The rules are per target: `plan` carries `task: { general: "deny" }`, which denies exactly one
 * delegate and leaves every other one inherited. Anything but an explicit deny keeps delegation
 * available, and an agent with no rules at all inherits everything.
 */
export function canDelegateTo(rules: readonly DelegationRule[], target: string): boolean {
  if (rules.length === 0) return true
  return rules.findLast((rule) => wildcardMatch(target, rule.pattern))?.action !== "deny"
}

/**
 * The backend merges an agent's rules on top of a default ruleset, so the effective action for a
 * permission is the *last* rule that matches it. This is the blanket verdict — may it delegate to
 * anything at all — which only rules with a catch-all pattern can answer.
 */
export function agentCanDelegate(agent: Pick<AgentSource, "permission">): boolean {
  const rules = rulesOf(agent)
  if (rules.length === 0) return true
  return effectivePermission(rules, "task", "*") !== "deny"
}

/**
 * The tool permissions an agent *effectively* has, not the ones its own file happens to name.
 *
 * The server's default ruleset is a single `{ permission: "*", pattern: "*", action: "allow" }`
 * catch-all that every agent inherits, so counting explicit per-tool allow rules reported `plan`
 * — which inherits everything except `edit` — as having one tool. Each permission is evaluated at
 * the blanket pattern `*`, the way `Permission.disabled` decides whether a tool is off entirely;
 * a rule scoped to one path (`read: { "*.env": "ask" }`) does not change the blanket verdict.
 */
export function summarizeAgentTools(
  agent: Pick<AgentSource, "permission">,
  toolPermissions: readonly string[],
): ToolSummary {
  const rules = rulesOf(agent)
  // No ruleset at all is an agent we only know from config or from the built-in catalogue: it
  // inherits the defaults, so claiming "0 tools" would be an invention.
  if (rules.length === 0) return { restricted: false, allowed: toolPermissions.length }
  const allowed = toolPermissions.filter((permission) => effectivePermission(rules, permission, "*") === "allow")
  return { restricted: allowed.length < toolPermissions.length, allowed: allowed.length }
}

export function normalizeMode(mode: string | undefined): AgentMode {
  return mode === "primary" || mode === "subagent" || mode === "all" ? mode : "all"
}

export interface MergeOptions {
  /** What the server reports. The source of truth for which agents exist. */
  server: readonly AgentSource[]
  /** Presentation metadata for the agents that ship with Tiancode, keyed by identifier. */
  meta: Readonly<Record<string, AgentPresentation>>
  /**
   * Agent entries from config. The server *removes* a disabled agent from its list, so without
   * these a user who switches one off loses the switch that would bring it back.
   */
  config?: Readonly<Record<string, { description?: string; mode?: string; disable?: boolean; disabled?: boolean }>>
  isEnabled: (name: string) => boolean
  /** Copy for agents with no metadata of their own. */
  fallback: { role: string; category: string }
  /** Lowercased permission names the tools column counts, e.g. `["read", "bash", ...]`. */
  toolPermissions?: readonly string[]
}

/**
 * One list holding every agent the user has: the built-ins (decorated with their presentation
 * metadata) and every agent the server reports or config remembers, including the markdown files
 * in the user's own `agent/` directory, which the panel used to drop on the floor entirely.
 */
export function mergePanelAgents(options: MergeOptions): PanelAgent[] {
  const { server, meta, config = {}, isEnabled, fallback, toolPermissions = [] } = options
  const byName = new Map<string, AgentSource>()

  for (const agent of server) {
    if (!agent?.name || agent.hidden === true) continue
    byName.set(agent.name, agent)
  }
  // Built-ins and user agents that are switched off are absent from the server list; keep them
  // visible (as disabled) so the switch that re-enables them still exists.
  for (const name of Object.keys(meta)) {
    if (!byName.has(name)) byName.set(name, { name, native: true, description: meta[name]?.description })
  }
  for (const [name, entry] of Object.entries(config)) {
    if (byName.has(name)) continue
    byName.set(name, { name, native: false, description: entry?.description, mode: entry?.mode })
  }
  for (const name of INTERNAL_AGENTS) byName.delete(name)

  const result: PanelAgent[] = []
  for (const agent of byName.values()) {
    const presentation = meta[agent.name]
    const builtin = presentation !== undefined || agent.native === true
    const mode = normalizeMode(agent.mode ?? (presentation ? undefined : "all"))
    result.push({
      name: agent.name,
      title: presentation?.title ?? agent.name,
      role: presentation?.role ?? fallback.role,
      category: presentation?.category ?? fallback.category,
      description: presentation?.description ?? agent.description ?? "",
      icon: presentation?.icon ?? agent.icon ?? "🤖",
      color: presentation?.color ?? agent.color ?? "#3B82F6",
      mode,
      builtin,
      enabled: isEnabled(agent.name),
      canDelegate: agentCanDelegate(agent),
      delegation: delegationRules(agent),
      model: agent.model?.modelID,
      tools: summarizeAgentTools(agent, toolPermissions),
    })
  }

  // Built-ins first, then the user's own, each alphabetically: a stable order the pager can page.
  return result.sort((a, b) => {
    if (a.builtin !== b.builtin) return a.builtin ? -1 : 1
    return a.name.localeCompare(b.name)
  })
}

/**
 * Why a root has no children. "Cannot delegate" and "has nothing enabled to delegate to" are
 * different statements about the user's configuration and the panel used to print the first one
 * for both.
 */
export type DelegationReason =
  /** It delegates to the children listed. */
  | "delegates"
  /** The `task` permission denies every candidate. */
  | "denied"
  /** The root itself is switched off, so it runs nothing at all. */
  | "disabled"
  /** Nothing is enabled that it could delegate to. */
  | "empty"

export interface DelegationRoot {
  agent: PanelAgent
  children: PanelAgent[]
  reason: DelegationReason
}

/**
 * The real delegation topology, replacing the four invented nodes the old tree drew.
 *
 * A primary agent is a root. Its children are the enabled sub-agents its own `task` rules let it
 * hand work to — per target, because `plan` denies exactly one of them. No statuses, no
 * durations, no result previews: the panel has no way to know any of that, and inventing it is
 * what made the old tree a mockup. An edge that is asserted but forbidden is the same invention.
 */
export function buildDelegationTree(agents: readonly PanelAgent[]): DelegationRoot[] {
  const roots = agents.filter((agent) => agent.mode === "primary" || agent.mode === "all")
  const delegates = agents.filter((agent) => (agent.mode === "subagent" || agent.mode === "all") && agent.enabled)
  return roots.map((agent) => {
    if (!agent.enabled) return { agent, children: [], reason: "disabled" as const }
    const candidates = delegates.filter((delegate) => delegate.name !== agent.name)
    if (candidates.length === 0) return { agent, children: [], reason: "empty" as const }
    const children = agent.canDelegate
      ? candidates.filter((delegate) => canDelegateTo(agent.delegation, delegate.name))
      : []
    if (children.length === 0) return { agent, children: [], reason: "denied" as const }
    return { agent, children, reason: "delegates" as const }
  })
}

export type SettingsScope = "project" | "global"

/**
 * Where a scope actually writes. "Global" used to send the project config file anyway while the
 * toast said "Default for every repository"; the two endpoints are different routes
 * (`PATCH /config` vs `PATCH /global/config`), so the scope has to pick one.
 */
export type ScopeTarget = { kind: "global" } | { kind: "project"; directory: string }

export function scopeTarget(scope: SettingsScope, directory: string | undefined): ScopeTarget {
  if (scope === "project" && directory) return { kind: "project", directory }
  return { kind: "global" }
}

/**
 * The patch a single switch sends.
 *
 * It used to copy the whole merged `cfg.agent` map — every markdown agent's parsed Info, system
 * prompt included — and PATCH it back, so flipping one switch serialized every agent's prompt
 * into the repository's `tiancode.json`. `Config.update` deep-merges, so naming the one agent is
 * enough. Both spellings are written because the loader reads `agents` and `agent`, and older
 * configs on disk use the plural.
 */
export function agentDisablePatch(name: string, enable: boolean) {
  const entry = { [name]: { disable: !enable, disabled: !enable } }
  return { agent: entry, agents: entry }
}

export interface AgentDraft {
  name: string
  description: string
  mode: "subagent" | "primary"
  prompt: string
  color: string
  model: string
  tools: string[]
  injectAgentsMd: boolean
}

export type DraftProblem = { field: "name"; problem: AgentNameProblem } | { field: "description" }

export function validateAgentDraft(draft: AgentDraft, existing: readonly string[]): DraftProblem | undefined {
  const problem = validateAgentName(draft.name, existing)
  if (problem) return { field: "name", problem }
  if (!draft.description.trim()) return { field: "description" }
  return undefined
}

/** What `POST /agent/generate` answers with. */
export interface GeneratedAgent {
  identifier: string
  whenToUse: string
  systemPrompt: string
}

/**
 * Turns a generated draft into form state. The result is always shown to the user before
 * anything is written: the model picks the identifier and it may collide with an agent that
 * already exists, or not be a legal identifier at all.
 */
export function draftFromGenerated(generated: GeneratedAgent, base: AgentDraft): AgentDraft {
  const identifier = toAgentIdentifier(generated.identifier ?? "")
  return {
    ...base,
    name: identifier || base.name,
    description: (generated.whenToUse ?? "").trim() || base.description,
    prompt: (generated.systemPrompt ?? "").trim() || base.prompt,
  }
}
