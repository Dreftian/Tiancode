import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import path from "node:path"
import {
  agentCanDelegate,
  agentDisablePatch,
  buildDelegationTree,
  canDelegateTo,
  draftFromGenerated,
  mergePanelAgents,
  scopeTarget,
  summarizeAgentTools,
  toAgentIdentifier,
  validateAgentDraft,
  validateAgentName,
  type AgentDraft,
  type AgentPresentation,
  type AgentSource,
  type PanelAgent,
} from "./sub-agents-logic"

const meta: Record<string, AgentPresentation> = {
  build: {
    title: "Constructor Principal",
    role: "Core Execution",
    icon: "🔨",
    color: "#3B82F6",
    category: "Core",
    description: "Modo predeterminado.",
  },
  explore: {
    title: "Explorador Rápido",
    role: "Fast Discovery",
    icon: "🧭",
    color: "#F59E0B",
    category: "Exploración",
  },
}

const fallback = { role: "Autonomous specialist", category: "Agent" }

const allow = (permission: string) => ({ pattern: "*", permission, action: "allow" })
const deny = (permission: string) => ({ pattern: "*", permission, action: "deny" })
const rule = (permission: string, pattern: string, action: string) => ({ permission, pattern, action })

/**
 * The ruleset the server merges into *every* agent before its own rules
 * (backend/tiancode/src/agent/agent.ts `defaults`). The panel reads rulesets that always start
 * with this `*`/`*` catch-all, which is exactly what the tools column used to ignore.
 */
const DEFAULTS = [
  rule("*", "*", "allow"),
  rule("doom_loop", "*", "ask"),
  rule("external_directory", "*", "ask"),
  rule("question", "*", "deny"),
  rule("read", "*", "allow"),
  rule("read", "*.env", "ask"),
]

/** The nine permissions the panel's tools column counts, lowercased as the server names them. */
const CATALOG = ["read", "grep", "glob", "bash", "edit", "write", "webfetch", "websearch", "todowrite"]

const panelAgent = (overrides: Partial<PanelAgent> & { name: string }): PanelAgent => ({
  title: overrides.name,
  role: "",
  category: "",
  description: "",
  icon: "🤖",
  color: "#3B82F6",
  mode: "subagent",
  builtin: false,
  enabled: true,
  canDelegate: true,
  delegation: [],
  tools: { restricted: false, allowed: 0 },
  ...overrides,
})

describe("mergePanelAgents", () => {
  // The bug this whole panel had: agentList() was built only from the hardcoded metadata map,
  // so the user's own agent/*.md files — nine of them — never appeared anywhere in the UI.
  test("lists the agents the server reports even when there is no metadata for them", () => {
    const server: AgentSource[] = [
      { name: "build", mode: "primary", native: true },
      { name: "Dreitz", mode: "all", native: false, description: "Agente personal" },
      { name: "Seguridad", mode: "subagent", native: false, description: "Auditoría" },
    ]

    const merged = mergePanelAgents({ server, meta, isEnabled: () => true, fallback })

    expect(merged.map((agent) => agent.name)).toEqual(expect.arrayContaining(["Dreitz", "Seguridad"]))
    const dreitz = merged.find((agent) => agent.name === "Dreitz")!
    expect(dreitz.builtin).toBe(false)
    expect(dreitz.description).toBe("Agente personal")
    expect(dreitz.mode).toBe("all")
  })

  test("keeps the built-in presentation metadata for the agents that ship with Tiancode", () => {
    const merged = mergePanelAgents({
      server: [{ name: "build", mode: "primary", native: true, description: "raw frontmatter text" }],
      meta,
      isEnabled: () => true,
      fallback,
    })

    expect(merged.find((agent) => agent.name === "build")).toMatchObject({
      title: "Constructor Principal",
      icon: "🔨",
      color: "#3B82F6",
      builtin: true,
      description: "Modo predeterminado.",
    })
  })

  test("keeps a disabled agent visible so its switch can bring it back", () => {
    // The backend deletes a disabled agent from agent.list(), so config is the only place it
    // still exists. Dropping it would leave the user with no way to re-enable it.
    const merged = mergePanelAgents({
      server: [{ name: "build", mode: "primary", native: true }],
      meta,
      config: { Hao: { disable: true, description: "Agente propio" }, explore: { disable: true } },
      isEnabled: (name) => name === "build",
      fallback,
    })

    expect(merged.find((agent) => agent.name === "Hao")).toMatchObject({ enabled: false, builtin: false })
    expect(merged.find((agent) => agent.name === "explore")).toMatchObject({ enabled: false, builtin: true })
  })

  test("hides the agents the backend runs for itself", () => {
    const merged = mergePanelAgents({
      server: [
        { name: "build", mode: "primary", native: true },
        { name: "summary", mode: "primary", native: true, hidden: true },
      ],
      meta,
      config: { title: {}, compaction: {} },
      isEnabled: () => true,
      fallback,
    })

    expect(merged.map((agent) => agent.name)).not.toContain("summary")
    expect(merged.map((agent) => agent.name)).not.toContain("title")
    expect(merged.map((agent) => agent.name)).not.toContain("compaction")
  })

  test("does not report the same agent twice when config and the server both list it", () => {
    const merged = mergePanelAgents({
      server: [{ name: "Tian", mode: "subagent", native: false }],
      meta: {},
      config: { Tian: { description: "stale" } },
      isEnabled: () => true,
      fallback,
    })

    expect(merged.filter((agent) => agent.name === "Tian")).toHaveLength(1)
  })
})

describe("agentCanDelegate", () => {
  test("is true unless the task permission is explicitly denied", () => {
    expect(agentCanDelegate({ permission: [allow("task")] })).toBe(true)
    expect(agentCanDelegate({ permission: [] })).toBe(true)
    expect(agentCanDelegate({ permission: undefined })).toBe(true)
    expect(agentCanDelegate({ permission: [deny("task")] })).toBe(false)
  })

  test("takes the last matching wildcard rule, the way the backend merges rulesets", () => {
    expect(agentCanDelegate({ permission: [deny("*"), allow("task")] })).toBe(true)
    expect(agentCanDelegate({ permission: [allow("task"), deny("*")] })).toBe(false)
  })

  // plan's real denial is `task: { general: "deny" }`, which Permission.fromConfig turns into a
  // rule whose pattern is the *target agent*. A blanket verdict says "plan can delegate", which
  // is true, and says nothing about the one edge that does not exist.
  test("stays true when only one delegation target is denied", () => {
    expect(agentCanDelegate({ permission: [...DEFAULTS, rule("task", "general", "deny")] })).toBe(true)
  })
})

describe("canDelegateTo", () => {
  const planRules = [
    { pattern: "*", action: "allow" },
    { pattern: "general", action: "deny" },
  ]

  test("answers per target, not once for all of them", () => {
    expect(canDelegateTo(planRules, "general")).toBe(false)
    expect(canDelegateTo(planRules, "explore")).toBe(true)
  })

  test("an agent with no task rules inherits delegation", () => {
    expect(canDelegateTo([], "explore")).toBe(true)
  })

  test("a later rule overrides an earlier one, and globs match", () => {
    expect(canDelegateTo([{ pattern: "general", action: "deny" }, { pattern: "*", action: "allow" }], "general")).toBe(
      true,
    )
    expect(canDelegateTo([{ pattern: "*", action: "allow" }, { pattern: "hermes-*", action: "deny" }], "hermes-researcher")).toBe(false)
  })
})

describe("summarizeAgentTools", () => {
  // The column reports the *effective* set. The old implementation counted explicit
  // `{pattern:"*", permission:<tool>, action:"allow"}` rules, and since the defaults carry a
  // single `*`/`*` catch-all plus one explicit `read` rule, every agent that inherits everything
  // measured as exactly one tool — `plan` rendered "1 tools".
  test("the wildcard catch-all counts: an agent that inherits everything has every tool", () => {
    const build = [...DEFAULTS, rule("question", "*", "allow"), rule("plan_enter", "*", "allow")]

    expect(summarizeAgentTools({ permission: build }, CATALOG)).toEqual({ restricted: false, allowed: 9 })
  })

  test("plan denies edit and keeps the other eight", () => {
    const plan = [
      ...DEFAULTS,
      rule("task", "general", "deny"),
      rule("edit", "*", "deny"),
      rule("edit", ".tiancode/plans/*.md", "allow"),
    ]

    expect(summarizeAgentTools({ permission: plan }, CATALOG)).toEqual({ restricted: true, allowed: 8 })
  })

  test("explore's deny-all plus allow-list counts only what it allows", () => {
    const explore = [
      ...DEFAULTS,
      rule("*", "*", "deny"),
      ...["grep", "glob", "list", "bash", "webfetch", "websearch", "read"].map((tool) => rule(tool, "*", "allow")),
    ]

    expect(summarizeAgentTools({ permission: explore }, CATALOG)).toEqual({ restricted: true, allowed: 6 })
  })

  test("a rule scoped to one path does not take the whole permission away", () => {
    // `read: { "*.env": "ask" }` gates two files; it does not make the agent unable to read.
    expect(summarizeAgentTools({ permission: DEFAULTS }, ["read"])).toEqual({ restricted: false, allowed: 1 })
  })

  test("an agent we only know from config inherits everything rather than reporting zero tools", () => {
    expect(summarizeAgentTools({ permission: undefined }, CATALOG)).toEqual({ restricted: false, allowed: 9 })
    expect(summarizeAgentTools({ permission: [] }, CATALOG)).toEqual({ restricted: false, allowed: 9 })
  })
})

describe("buildDelegationTree", () => {
  const agents: PanelAgent[] = [
    panelAgent({ name: "build", mode: "primary", builtin: true }),
    panelAgent({ name: "plan", mode: "primary", builtin: true, canDelegate: false }),
    panelAgent({ name: "offline", mode: "primary", builtin: true, enabled: false }),
    panelAgent({ name: "explore", mode: "subagent", builtin: true }),
    panelAgent({ name: "Dreitz", mode: "all" }),
    panelAgent({ name: "Vision", mode: "subagent", enabled: false }),
  ]

  test("roots the tree in the real primary agents", () => {
    expect(buildDelegationTree(agents).map((root) => root.agent.name)).toEqual([
      "build",
      "plan",
      "offline",
      "Dreitz",
    ])
  })

  test("hangs only the enabled sub-agents under a root, and never the root itself", () => {
    const build = buildDelegationTree(agents).find((root) => root.agent.name === "build")!

    expect(build.children.map((child) => child.name)).toEqual(["explore", "Dreitz"])
    expect(build.children.map((child) => child.name)).not.toContain("Vision")
    expect(build.reason).toBe("delegates")
  })

  test("gives no children to a root that cannot delegate or is switched off", () => {
    const tree = buildDelegationTree(agents)

    expect(tree.find((root) => root.agent.name === "plan")!.children).toEqual([])
    expect(tree.find((root) => root.agent.name === "offline")!.children).toEqual([])
  })

  // The tree printed "Cannot delegate" for all three of these. They are different statements
  // about the configuration and the user acts on them differently.
  test("separates 'not allowed' from 'switched off' from 'nothing enabled to delegate to'", () => {
    const tree = buildDelegationTree(agents)

    expect(tree.find((root) => root.agent.name === "plan")!.reason).toBe("denied")
    expect(tree.find((root) => root.agent.name === "offline")!.reason).toBe("disabled")
    expect(buildDelegationTree([panelAgent({ name: "alone", mode: "primary" })])[0]).toMatchObject({
      children: [],
      reason: "empty",
    })
  })

  // plan's ruleset denies exactly one target. Hanging `general` under it asserted an edge the
  // permission model forbids — the same invention the old mockup tree was rewritten to stop.
  test("honours per-target task rules instead of one verdict for every child", () => {
    const withPlan: PanelAgent[] = [
      panelAgent({
        name: "plan",
        mode: "primary",
        builtin: true,
        delegation: [
          { pattern: "*", action: "allow" },
          { pattern: "general", action: "deny" },
        ],
      }),
      panelAgent({ name: "general", mode: "subagent", builtin: true }),
      panelAgent({ name: "explore", mode: "subagent", builtin: true }),
    ]

    const plan = buildDelegationTree(withPlan).find((root) => root.agent.name === "plan")!

    expect(plan.children.map((child) => child.name)).toEqual(["explore"])
    expect(plan.reason).toBe("delegates")
  })

  test("invents nothing: every node comes from the list it was given", () => {
    const names = new Set(agents.map((agent) => agent.name))
    for (const root of buildDelegationTree(agents)) {
      expect(names.has(root.agent.name)).toBe(true)
      for (const child of root.children) expect(names.has(child.name)).toBe(true)
    }
  })
})

describe("scopeTarget", () => {
  test("Global routes to the global config, not to the repository's own file", () => {
    expect(scopeTarget("global", "C:/repo")).toEqual({ kind: "global" })
    expect(scopeTarget("project", "C:/repo")).toEqual({ kind: "project", directory: "C:/repo" })
  })

  test("falls back to global when there is no project to write to", () => {
    expect(scopeTarget("project", undefined)).toEqual({ kind: "global" })
  })
})

describe("agentDisablePatch", () => {
  // Toggling one switch used to PATCH the whole merged agent map back: every markdown agent's
  // parsed Info, system prompt included, serialized into the repository's tiancode.json.
  test("names one agent and nothing else", () => {
    const patch = agentDisablePatch("Seguridad", false)

    expect(Object.keys(patch.agent)).toEqual(["Seguridad"])
    expect(Object.keys(patch.agents)).toEqual(["Seguridad"])
    expect(patch.agent["Seguridad"]).toEqual({ disable: true, disabled: true })
  })

  test("enabling clears both spellings of the flag", () => {
    expect(agentDisablePatch("Hao", true).agent["Hao"]).toEqual({ disable: false, disabled: false })
  })

  test("carries no prompt, description or other definition field", () => {
    const serialized = JSON.stringify(agentDisablePatch("Tian", false))

    expect(serialized).not.toContain("prompt")
    expect(serialized).not.toContain("description")
  })
})

describe("validateAgentName", () => {
  test("accepts the identifiers the backend can turn into a file name", () => {
    expect(validateAgentName("code-reviewer")).toBeUndefined()
    expect(validateAgentName("agent42")).toBeUndefined()
  })

  test("rejects empty, malformed and colliding identifiers", () => {
    expect(validateAgentName("   ")).toBe("empty")
    expect(validateAgentName("Code Reviewer")).toBe("invalid")
    expect(validateAgentName("code_reviewer")).toBe("invalid")
    expect(validateAgentName("-leading")).toBe("invalid")
    expect(validateAgentName("../escape")).toBe("invalid")
    expect(validateAgentName("explore", ["build", "explore"])).toBe("taken")
    // The user's own files are named Dreitz.md, Seguridad.md...: the collision check has to
    // ignore case or "dreitz" would silently overwrite "Dreitz".
    expect(validateAgentName("dreitz", ["Dreitz"])).toBe("taken")
  })
})

describe("toAgentIdentifier", () => {
  test("repairs what a model usually answers when asked for a slug", () => {
    expect(toAgentIdentifier("Code Reviewer")).toBe("code-reviewer")
    expect(toAgentIdentifier("db_migration.checker")).toBe("db-migration-checker")
    expect(toAgentIdentifier("  --Security Auditor--  ")).toBe("security-auditor")
  })
})

describe("validateAgentDraft", () => {
  const draft: AgentDraft = {
    name: "sql-reviewer",
    description: "Reviews migrations",
    mode: "subagent",
    prompt: "",
    color: "#3B82F6",
    model: "",
    tools: ["Read"],
    injectAgentsMd: false,
  }

  test("passes a complete draft", () => {
    expect(validateAgentDraft(draft, ["build"])).toBeUndefined()
  })

  test("reports the offending field", () => {
    expect(validateAgentDraft({ ...draft, name: "SQL Reviewer" }, [])).toEqual({ field: "name", problem: "invalid" })
    expect(validateAgentDraft(draft, ["sql-reviewer"])).toEqual({ field: "name", problem: "taken" })
    expect(validateAgentDraft({ ...draft, description: "  " }, [])).toEqual({ field: "description" })
  })
})

describe("draftFromGenerated", () => {
  const base: AgentDraft = {
    name: "",
    description: "",
    mode: "subagent",
    prompt: "",
    color: "#3B82F6",
    model: "",
    tools: ["Read", "Grep"],
    injectAgentsMd: false,
  }

  test("fills the form instead of saving, and keeps the user's tool and colour choices", () => {
    const result = draftFromGenerated(
      { identifier: "Migration Auditor", whenToUse: "  Use for SQL migrations  ", systemPrompt: "You audit SQL." },
      base,
    )

    expect(result).toEqual({
      ...base,
      name: "migration-auditor",
      description: "Use for SQL migrations",
      prompt: "You audit SQL.",
    })
  })

  test("leaves the existing values alone when the model answers with nothing usable", () => {
    const filled = { ...base, name: "keep-me", description: "keep", prompt: "keep" }

    expect(draftFromGenerated({ identifier: "  ", whenToUse: "", systemPrompt: "" }, filled)).toEqual(filled)
  })
})

/**
 * Everything above tests the helpers, which is why every one of them stayed green when the panel
 * itself was reverted to its original bug (`agentList = createMemo(() => builtinAgents())`): the
 * defect lived in the component, not in the helpers it calls.
 *
 * The panel needs three contexts (language, server SDK, models) to mount, so these pin the
 * wiring at the only level available without a harness — the source itself. Each assertion names
 * the regression it fails on; none of them can pass and fail for the same implementation.
 */
describe("panel wiring", () => {
  const panel = readFileSync(path.join(import.meta.dir, "sub-agents.tsx"), "utf8")

  test("the list is built from the server's agents, not from the hardcoded metadata map", () => {
    // Fails on `const agentList = createMemo(() => builtinAgents())`, the bug that hid the
    // user's nine agent/*.md files.
    expect(panel).toMatch(/mergePanelAgents\(\{\s*\n\s*server: agents\(\)/)
  })

  test("both resources take a source, so the scope selector actually refetches", () => {
    // createResource(fetcher) with no source runs once inside untrack: scope() is never tracked.
    expect(panel.match(/createResource[^(]*\(\s*\n?\s*target,/g)?.length).toBe(2)
  })

  test("returning to the tab refetches instead of showing whatever loaded first", () => {
    expect(panel).toMatch(/on\(\s*\n?\s*\(\) => props\.active/)
  })

  test("a toggle sends one agent's flag and Global writes the global config", () => {
    expect(panel).toContain("agentDisablePatch(agentName, enable)")
    expect(panel).toContain("client.global.config.update({ config })")
    // The whole merged agent map must never be copied into a config PATCH again.
    expect(panel).not.toContain("{ ...(configData() ?? {}) }")
  })

  test("the tools column pluralizes instead of rendering \"1 tools\"", () => {
    expect(panel).toContain("language.plural(")
    expect(panel).not.toContain('language.t("settings.subAgents.list.tools.summary"')
  })
})

/** Same reasoning as "panel wiring": the tree needs the language context to mount. */
describe("delegation tree wiring", () => {
  const tree = readFileSync(path.join(import.meta.dir, "..", "visualization", "rlm-hierarchy-tree.tsx"), "utf8")

  test("the chevron reads its open state through an accessor", () => {
    // <For> runs its mapper inside createRoot with Listener = null, so `open: isOpen(name)` in the
    // options object was read once: children hid, but the arrow never rotated and aria-expanded,
    // aria-label and data-open stayed frozen on the first render's value.
    expect(tree).toMatch(/open: \(\) => isOpen\(/)
    expect(tree).toMatch(/aria-expanded=\{options\.open\?\.\(\)/)
    expect(tree).not.toMatch(/open: isOpen\(/)
  })

  test("branches start closed", () => {
    // `collapsed` started empty, so every branch was open: ~30 roots x ~27 delegates drawn at once.
    expect(tree).toMatch(/expanded\(\)\[name\] === true/)
    expect(tree).toContain("ROOT_PAGE_SIZE")
  })

  test("a root with nothing enabled underneath is not told it cannot delegate", () => {
    expect(tree).toContain("settings.subAgents.hierarchy.noDelegates")
    expect(tree).toContain("settings.subAgents.hierarchy.rootDisabled")
    // The note has to come from the reason, not from `children.length > 0`.
    expect(tree).toMatch(/root\.reason === "denied"/)
  })
})
