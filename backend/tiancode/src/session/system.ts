import { LayerNode } from "@tiancode-ai/core/effect/layer-node"
import { Context, Effect, Layer } from "effect"

import { InstanceState } from "@/effect/instance-state"

import PROMPT_ANTHROPIC from "./prompt/anthropic.txt"
import PROMPT_DEFAULT from "./prompt/default.txt"
import PROMPT_BEAST from "./prompt/beast.txt"
import PROMPT_GEMINI from "./prompt/gemini.txt"
import PROMPT_GPT from "./prompt/gpt.txt"
import PROMPT_KIMI from "./prompt/kimi.txt"
import PROMPT_META from "./prompt/meta.txt"

import PROMPT_CODEX from "./prompt/codex.txt"
import PROMPT_TRINITY from "./prompt/trinity.txt"
import type { Provider } from "@/provider/provider"
import type { Agent } from "@/agent/agent"
import { Permission } from "@/permission"
import { Skill } from "@/skill"
import { AutoSelect } from "@/skill/auto-select"
import { AbsolutePath } from "@tiancode-ai/core/schema"
import { Location } from "@tiancode-ai/core/location"
import { LocationServiceMap, locationServiceMapLayer } from "@tiancode-ai/core/location-services"
import { Reference } from "@tiancode-ai/core/reference"
import { MCP } from "@/mcp"
import { Memory } from "@tiancode-ai/core/memory"
import { PermissionV1 } from "@tiancode-ai/core/v1/permission"

export function provider(model: Provider.Model) {
  if (model.api.id.includes("muse-spark")) return [PROMPT_META]
  if (model.api.id.includes("gpt-4") || model.api.id.includes("o1") || model.api.id.includes("o3"))
    return [PROMPT_BEAST]
  if (model.api.id.includes("gpt")) {
    if (model.api.id.includes("codex")) {
      return [PROMPT_CODEX]
    }
    return [PROMPT_GPT]
  }
  if (model.api.id.includes("gemini-")) return [PROMPT_GEMINI]
  if (model.api.id.includes("claude")) return [PROMPT_ANTHROPIC]
  if (model.api.id.toLowerCase().includes("trinity")) return [PROMPT_TRINITY]
  if (model.api.id.toLowerCase().includes("kimi") || model.providerID === "moonshotai" || model.providerID === "kimi")
    return [PROMPT_KIMI]
  return [PROMPT_DEFAULT]
}

export interface Interface {
  readonly environment: (model: Provider.Model) => Effect.Effect<string[]>
  readonly subagents: (agent: Agent.Info, available?: Agent.Info[]) => Effect.Effect<string | undefined>
  readonly skills: (agent: Agent.Info) => Effect.Effect<string | undefined>
  readonly autoSkills: (agent: Agent.Info) => Effect.Effect<string | undefined>
  readonly mcp: (agent: Agent.Info, permission?: PermissionV1.Ruleset) => Effect.Effect<string | undefined>
  readonly memory: () => Effect.Effect<string | undefined>
}

export class Service extends Context.Service<Service, Interface>()("@tiancode/SystemPrompt") {}

const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const skill = yield* Skill.Service
    const mcp = yield* MCP.Service
    const locations = yield* LocationServiceMap.Service

    return Service.of({
      environment: Effect.fn("SystemPrompt.environment")(function* (model: Provider.Model) {
        const ctx = yield* InstanceState.context
        const references = yield* Effect.gen(function* () {
          return (yield* (yield* Reference.Service).list()).filter((reference) => reference.description !== undefined)
        }).pipe(Effect.provide(locations.get(Location.Ref.make({ directory: AbsolutePath.make(ctx.directory) }))))
        return [
          [
            `You are powered by the model named ${model.api.id}. The exact model ID is ${model.providerID}/${model.api.id}`,
            `Here is some useful information about the environment you are running in:`,
            `<env>`,
            `  Working directory: ${ctx.directory}`,
            `  Workspace root folder: ${ctx.worktree}`,
            `  Is directory a git repo: ${ctx.project.vcs === "git" ? "yes" : "no"}`,
            `  Platform: ${process.platform}`,
            `  Today's date: ${new Date().toDateString()}`,
            `</env>`,
            `CRITICAL WORKSPACE DIRECTIVES:`,
            `- Active project directory: "${ctx.directory}". When the user asks you to build, create, develop, fix, refactor, or implement any code, features, or applications, you MUST ensure that all necessary files are actually created, written, and implemented on disk. For non-trivial or multi-component tasks, act as a Lead Orchestrator: present your structured breakdown in the chat, proactively deploy your specialized subagents via the task tool (or execute file tools directly for small changes), and never stop at just showing markdown code without writing it to disk.`,
            `- If the user is only asking a theoretical question, brainstorming, or has no active project folder, converse normally in the chat without modifying files.`,
          ].join("\n"),
          references.length === 0
            ? undefined
            : [
                "Project references provide additional directories that can be accessed when relevant.",
                "<available_references>",
                ...references
                  .toSorted((a, b) => a.name.localeCompare(b.name))
                  .flatMap((reference) => [
                    "  <reference>",
                    `    <name>${reference.name}</name>`,
                    `    <path>${reference.path}</path>`,
                    ...(reference.description === undefined
                      ? []
                      : [`    <description>${reference.description}</description>`]),
                    "  </reference>",
                  ]),
                "</available_references>",
              ].join("\n"),
        ].filter((part): part is string => part !== undefined)
      }),

      subagents: Effect.fn("SystemPrompt.subagents")(function* (agent: Agent.Info, available?: Agent.Info[]) {
        if (agent.mode === "subagent") return
        if (Permission.disabled(["task"], agent.permission).has("task")) return

        const items = available
          ? available.filter((item) => item.mode !== "primary" && item.hidden !== true)
          : undefined

        const allowed = items
          ? items.filter((item) => Permission.evaluate("task", item.name, agent.permission).action !== "deny")
          : undefined

        const formatted =
          allowed && allowed.length > 0
            ? allowed
                .toSorted((a, b) => a.name.localeCompare(b.name))
                .map((item) => `- ${item.name}: ${item.description ?? "Specialized autonomous subagent."}`)
            : [
                "- explore: Fast agent specialized for exploring codebases, discovering files, grep searching, and answering architecture questions.",
                "- software-architect: Designing modular systems, domain modeling, clean abstractions, and SOLID architectural patterns.",
                "- ui-ux-master: Crafting modern visual design, responsive layouts, Tailwind CSS styling, components, and polished UI/UX.",
                "- fullstack-coder: Implementing fullstack logic, APIs, server routes, database queries, and robust production code.",
                "- devsecops-auditor: Auditing dependencies, CVEs, secret leak prevention, and OWASP security posture.",
                "- performance-optimizer: Profiling bottlenecks, query latency, memory leaks, and rendering performance.",
                "- database-architect: Designing schemas, migrations, indexes, and high-performance SQL/ORM models.",
                "- qa-e2e-tester: Creating automated test suites, unit tests, integration tests, and edge-case verification.",
                "- docs-generator: Writing comprehensive Markdown technical documentation, user guides, and API specs.",
                "- general: Autonomous multi-step research and task execution in parallel.",
              ]

        return [
          "<available_subagents>",
          "You are the Lead Swarm Orchestrator equipped with autonomous specialized subagents. You MUST PROACTIVELY USE THEM via the `task` tool:",
          ...formatted,
          "",
          "SWARM LEAD ORCHESTRATOR PROTOCOL (CODEX-STYLE COLLABORATION):",
          "When the user requests creating, developing, refactoring, building, or analyzing any project or feature:",
          "1. VISIBLE THINKING & BREAKDOWN: Always start your response by presenting your multi-agent plan and blueprint directly in the chat (layout, components, data flow), announcing the specialist subagents (e.g. 🎨 ui-ux-master, ⚡ fullstack-coder, 🏛️ software-architect) and active engineering skills assigned to each component.",
          "2. PROACTIVE TASK DELEGATION: Proactively invoke the specialized subagents using the `task` tool (`subagent_type: '<agent_name>'` with detailed, self-contained prompts). Delegate UI tasks to `ui-ux-master`, core logic to `fullstack-coder`, architecture to `software-architect`, exploration to `explore`, etc.",
          "3. PARALLEL EXECUTION: Launch independent subagents concurrently in a single response whenever possible to maximize throughput and responsiveness.",
          "4. SYNTHESIS: Once subagents complete their tasks, synthesize the results for the user and confirm all files were written and verified.",
          "5. DIRECT FALLBACK: For minor 1-line typo fixes or small single-file tweaks, you may use file tools directly without subagent overhead.",
          "</available_subagents>",
        ].join("\n")
      }),

      skills: Effect.fn("SystemPrompt.skills")(function* (agent: Agent.Info) {
        if (Permission.disabled(["skill"], agent.permission).has("skill")) return

        const list = yield* skill.available(agent)

        return [
          "Skills provide specialized instructions and workflows for specific tasks.",
          "Use the skill tool to load a skill when a task matches its description.",
          // the agents seem to ingest the information about skills a bit better if we present a more verbose
          // version of them here and a less verbose version in tool description, rather than vice versa.
          Skill.fmt(list, { verbose: true }),
        ].join("\n")
      }),

      autoSkills: Effect.fn("SystemPrompt.autoSkills")(function* (agent: Agent.Info) {
        if (Permission.disabled(["skill"], agent.permission).has("skill")) return
        if (!(yield* skill.autoSelect())) return
        const ctx = yield* InstanceState.context
        const catalog = yield* skill.available(agent)
        const selected = yield* Effect.promise(() => AutoSelect.autoSelectFor(ctx.worktree, catalog))
        if (selected.length === 0) return
        return AutoSelect.fmtAuto(selected)
      }),

      mcp: Effect.fn("SystemPrompt.mcp")(function* (agent: Agent.Info, permission?: PermissionV1.Ruleset) {
        const ruleset = Permission.merge(agent.permission, permission ?? [])
        const instructions = (yield* mcp.instructions()).filter(
          (item) => item.tools.length === 0 || Permission.disabled(item.tools, ruleset).size < item.tools.length,
        )
        if (instructions.length === 0) return

        return [
          "<mcp_instructions>",
          ...instructions.flatMap((item) => [
            `  <server name="${item.name}">`,
            ...item.instructions.split("\n").map((line) => `    ${line}`),
            "  </server>",
          ]),
          "</mcp_instructions>",
        ].join("\n")
      }),

      memory: Effect.fn("SystemPrompt.memory")(function* () {
        const ctx = yield* InstanceState.context
        return yield* Effect.gen(function* () {
          const mem = yield* Memory.Service
          return yield* mem.format()
        }).pipe(Effect.provide(locations.get(Location.Ref.make({ directory: AbsolutePath.make(ctx.directory) }))))
      }),
    })
  }),
)

const locationServiceMapNode = LayerNode.make({
  service: LocationServiceMap.Service,
  layer: locationServiceMapLayer,
  deps: [],
})

export const node = LayerNode.make({
  service: Service,
  layer: layer,
  deps: [Skill.node, MCP.node, locationServiceMapNode],
})

export * as SystemPrompt from "./system"
