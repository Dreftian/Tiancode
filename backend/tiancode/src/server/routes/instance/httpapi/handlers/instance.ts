import { Agent } from "@/agent/agent"
import { Command } from "@/command"
import * as InstanceState from "@/effect/instance-state"
import { Format } from "@/format"
import { Config } from "@/config/config"
import { ConfigPaths } from "@/config/paths"
import { FSUtil } from "@tiancode-ai/core/fs-util"
import { Global } from "@tiancode-ai/core/global"
import { LSP } from "@/lsp/lsp"
import { Vcs } from "@/project/vcs"
import { Skill } from "@/skill"
import { Cause, Effect } from "effect"
import { ModelV2 } from "@tiancode-ai/core/model"
import { ProviderV2 } from "@tiancode-ai/core/provider"
import { HttpApiBuilder, HttpApiError } from "effect/unstable/httpapi"
import { InstanceHttpApi } from "../api"
import { AgentCreateInput, ApiAgentGenerateError, ApiVcsApplyError, SkillImportInput } from "../groups/instance"
import { markInstanceForDisposal } from "../lifecycle"
import path from "node:path"

export const instanceHandlers = HttpApiBuilder.group(InstanceHttpApi, "instance", (handlers) =>
  Effect.gen(function* () {
    const agent = yield* Agent.Service
    const command = yield* Command.Service
    const config = yield* Config.Service
    const format = yield* Format.Service
    const fs = yield* FSUtil.Service
    const global = yield* Global.Service
    const lsp = yield* LSP.Service
    const skill = yield* Skill.Service
    const vcs = yield* Vcs.Service

    const dispose = Effect.fn("InstanceHttpApi.dispose")(function* () {
      yield* markInstanceForDisposal(yield* InstanceState.context)
      return true
    })

    const getPath = Effect.fn("InstanceHttpApi.path")(function* () {
      const ctx = yield* InstanceState.context
      return {
        home: Global.Path.home,
        state: Global.Path.state,
        config: Global.Path.config,
        worktree: ctx.worktree,
        directory: ctx.directory,
      }
    })

    const getVcs = Effect.fn("InstanceHttpApi.vcs")(function* () {
      const [branch, default_branch] = yield* Effect.all([vcs.branch(), vcs.defaultBranch()], {
        concurrency: "unbounded",
      })
      return { branch, default_branch }
    })

    const getVcsStatus = Effect.fn("InstanceHttpApi.vcsStatus")(function* () {
      return yield* vcs.status()
    })

    const getVcsDiff = Effect.fn("InstanceHttpApi.vcsDiff")(function* (ctx: {
      query: { mode: Vcs.Mode; context?: number }
    }) {
      return yield* vcs.diff(ctx.query.mode, { context: ctx.query.context })
    })

    const getVcsDiffRaw = Effect.fn("InstanceHttpApi.vcsDiffRaw")(function* () {
      return yield* vcs.diffRaw()
    })

    const applyVcs = Effect.fn("InstanceHttpApi.vcsApply")(function* (ctx: { payload: Vcs.ApplyInput }) {
      return yield* vcs.apply(ctx.payload).pipe(
        Effect.mapError(
          (error) =>
            new ApiVcsApplyError({
              name: "VcsApplyError",
              data: {
                message: error.message,
                reason: error.reason,
              },
            }),
        ),
      )
    })

    const getCommand = Effect.fn("InstanceHttpApi.command")(function* () {
      return yield* command.list()
    })

    const getAgent = Effect.fn("InstanceHttpApi.agent")(function* () {
      return yield* agent.list()
    })

    const getSkill = Effect.fn("InstanceHttpApi.skill")(function* () {
      return yield* skill.all()
    })

    const importSkill = Effect.fn("InstanceHttpApi.skillImport")(function* (ctx: {
      payload: typeof SkillImportInput.Type
    }) {
      const cfg = yield* config.get()
      const existing = cfg.skills
      const paths = existing && !Array.isArray(existing) ? (existing.paths ?? []) : []
      const urls = existing && !Array.isArray(existing) ? (existing.urls ?? []) : []
      if (ctx.payload.url) {
        if (!urls.includes(ctx.payload.url)) {
          const next =
            existing && !Array.isArray(existing) ? { ...existing, urls: [...urls, ctx.payload.url] } : { urls: [ctx.payload.url] }
          yield* config.update({ ...cfg, skills: next })
        }
      } else {
        if (!ctx.payload.name || !ctx.payload.files?.length) return yield* new HttpApiError.BadRequest({})
        const root = skillImportRoot(global.config, ctx.payload.name)
        if (!root) return yield* new HttpApiError.BadRequest({})
        const files = ctx.payload.files.map((file) => ({ ...file, target: skillImportDestination(root, file.path) }))
        if (files.some((file) => !file.target)) return yield* new HttpApiError.BadRequest({})
        for (const file of files) {
          yield* fs.writeWithDirs(file.target!, file.content).pipe(Effect.orDie)
        }
        if (!paths.includes(root)) {
          const next =
            existing && !Array.isArray(existing) ? { ...existing, paths: [...paths, root] } : { paths: [root] }
          yield* config.update({ ...cfg, skills: next })
        }
      }
      yield* skill.reload()
      return yield* skill.all()
    })

    const toggleSkill = Effect.fn("InstanceHttpApi.skillToggle")(function* (ctx) {
      yield* skill.setEnabled(ctx.payload.name, ctx.payload.enabled)
      yield* markInstanceForDisposal(yield* InstanceState.context)
      return yield* skill.all()
    })

    const createAgent = Effect.fn("InstanceHttpApi.agentCreate")(function* (ctx) {
      const file = agentDefinitionPath(global.config, ctx.payload.name)
      if (!file) return yield* new HttpApiError.BadRequest({})
      yield* fs.writeWithDirs(file, buildAgentMarkdown(ctx.payload)).pipe(Effect.orDie)
      // The agent state reads the markdown files through the instance config
      // cache, so drop it before reloading or the new agent would not appear.
      yield* config.invalidateInstance()
      yield* agent.reload()
      return yield* agent.get(ctx.payload.name)
    })

    // Drafting an agent with a model was CLI-only until now, so the settings UI had no way to
    // offer "describe it and let the model write it". Nothing is written to disk here: the draft
    // goes back to the caller, who reviews it and then POSTs /agent/create.
    const generateAgent = Effect.fn("InstanceHttpApi.agentGenerate")(function* (ctx) {
      const description = ctx.payload.description.trim()
      if (!description) return yield* new HttpApiError.BadRequest({})
      // Half a model reference is worse than none: resolving one half against the default's other
      // half would silently draft with a model the caller never chose.
      const model =
        ctx.payload.providerID && ctx.payload.modelID
          ? {
              providerID: ProviderV2.ID.make(ctx.payload.providerID),
              modelID: ModelV2.ID.make(ctx.payload.modelID),
            }
          : undefined
      return yield* agent.generate({ description, model }).pipe(
        // catchCause, not mapError: the provider call itself runs inside Effect.promise, so a
        // rejected key or a rate limit arrives as a defect and would otherwise surface as a bare 500.
        Effect.catchCause((cause) => {
          const error = Cause.squash(cause) as { _tag?: string; message?: string } | undefined
          const reason =
            error?._tag === "ProviderNoProvidersError" ||
            error?._tag === "ProviderNoModelsError" ||
            error?._tag === "ProviderModelNotFoundError"
              ? ("no-model" as const)
              : ("model-failed" as const)
          return Effect.fail(
            new ApiAgentGenerateError({
              name: "AgentGenerateError",
              data: { message: error?.message ?? "Agent generation failed", reason },
            }),
          )
        }),
      )
    })

    const updateAgent = Effect.fn("InstanceHttpApi.agentUpdate")(function* (ctx) {
      const file = agentDefinitionPath(global.config, ctx.params.name)
      if (!file) return yield* new HttpApiError.BadRequest({})
      yield* fs.writeWithDirs(file, buildAgentMarkdown({ ...ctx.payload, name: ctx.params.name })).pipe(Effect.orDie)
      yield* config.invalidateInstance()
      yield* agent.reload()
      return yield* agent.get(ctx.params.name)
    })

    const deleteAgent = Effect.fn("InstanceHttpApi.agentDelete")(function* (ctx) {
      // An agent is a markdown file in *some* config directory, not necessarily the global one:
      // `ConfigAgent.load` reads `{agent,agents}/**/*.md` from every directory ConfigPaths lists,
      // so this repository's own `.tiancode/agent/triage.md` is a real, listed, deletable agent.
      // Resolving only the global path answered 400 for it after the user had already confirmed.
      const instance = yield* InstanceState.context
      const dirs = yield* ConfigPaths.directories(instance.directory, instance.worktree).pipe(Effect.orDie)
      const candidates = agentDefinitionCandidates([global.config, ...dirs], ctx.params.name)
      let file: string | undefined
      for (const candidate of candidates) {
        if (yield* fs.existsSafe(candidate)) {
          file = candidate
          break
        }
      }
      // Built-in agents are defined in code, not as markdown, so there is nothing to remove.
      // Without this guard the remove dies and the caller gets a 500 instead of "not deletable".
      if (!file) return yield* new HttpApiError.BadRequest({})
      yield* fs.remove(file).pipe(Effect.orDie)
      yield* config.invalidateInstance()
      yield* agent.reload()
      return { success: true } as const
    })

    const getLsp = Effect.fn("InstanceHttpApi.lsp")(function* () {
      return yield* lsp.status()
    })

    const getFormatter = Effect.fn("InstanceHttpApi.formatter")(function* () {
      return yield* format.status()
    })

    return handlers
      .handle("dispose", dispose)
      .handle("path", getPath)
      .handle("vcs", getVcs)
      .handle("vcsStatus", getVcsStatus)
      .handle("vcsDiff", getVcsDiff)
      .handle("vcsDiffRaw", getVcsDiffRaw)
      .handle("vcsApply", applyVcs)
      .handle("command", getCommand)
      .handle("agent", getAgent)
      .handle("skill", getSkill)
      .handle("skillImport", importSkill)
      .handle("skillToggle", toggleSkill)
      .handle("agentCreate", createAgent)
      .handle("agentGenerate", generateAgent)
      .handle("agentUpdate", updateAgent)
      .handle("agentDelete", deleteAgent)
      .handle("lsp", getLsp)
      .handle("formatter", getFormatter)
  }),
)

export function skillImportDestination(root: string, filePath: string) {
  if (filePath.split(/[\\/]+/).includes("..") || path.isAbsolute(filePath) || path.win32.isAbsolute(filePath)) return
  const target = path.resolve(root, filePath)
  const relative = path.relative(root, target)
  if (!relative || relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) return
  return target
}

export function skillImportRoot(config: string, name: string) {
  const skills = path.join(config, "skills")
  return skillImportDestination(skills, name)
}

export function agentDefinitionPath(config: string, name: string) {
  if (
    !name.trim() ||
    name.split(/[\\/]+/).includes("..") ||
    path.isAbsolute(name) ||
    path.win32.isAbsolute(name)
  )
    return
  return skillImportDestination(path.join(config, "agent"), `${name}.md`)
}

/**
 * Every file an agent named `name` could be defined in, in lookup order, across the config
 * directories `ConfigPaths.directories` reports. `ConfigAgent.load` scans both `agent/` and
 * `agents/`, so both are candidates; the global config directory stays first, so an agent that
 * exists in both scopes resolves exactly where it always did.
 */
export function agentDefinitionCandidates(dirs: readonly string[], name: string) {
  if (!name.trim() || name.split(/[\\/]+/).includes("..") || path.isAbsolute(name) || path.win32.isAbsolute(name))
    return []
  const seen = new Set<string>()
  const result: string[] = []
  for (const dir of dirs) {
    for (const folder of ["agent", "agents"]) {
      const file = skillImportDestination(path.join(dir, folder), `${name}.md`)
      if (!file || seen.has(file)) continue
      seen.add(file)
      result.push(file)
    }
  }
  return result
}

/**
 * The permissions the create form governs — one per checkbox in
 * frontend/app/src/components/settings-v2/sub-agents.tsx (`AgentTools`).
 *
 * Deliberately NOT the backend's whole permission catalogue. `buildPermission` writes an explicit
 * allow/deny for every name in here, so a permission the form cannot show has to stay out: with
 * `task`, `list`, `question`, `skill`, `lsp` and `external_directory` in the list, every agent
 * created from a nine-checkbox form was silently shipped with all six denied and could neither
 * list a directory, ask a question, nor delegate. Unticked means denied; unlisted means inherited
 * from the agent defaults, which is what "the form does not govern this" has to mean.
 */
const AGENT_FORM_TOOL_CATALOG = [
  "read",
  "grep",
  "glob",
  "bash",
  "edit",
  "write",
  "webfetch",
  "websearch",
  "todowrite",
]

function buildAgentMarkdown(input: {
  name: string
  description: string
  mode: "subagent" | "primary"
  model?: string
  color?: string
  prompt?: string
  injectAgentsMd?: boolean
  disable?: boolean
  tools?: string[]
}) {
  const permission = buildPermission(input.tools)
  return [
    "---",
    `name: ${JSON.stringify(input.name)}`,
    `mode: ${input.mode}`,
    `description: ${JSON.stringify(input.description)}`,
    ...(input.model ? [`model: ${input.model}`] : []),
    ...(input.color ? [`color: ${JSON.stringify(input.color)}`] : []),
    ...(input.injectAgentsMd !== undefined ? [`injectAgentsMd: ${input.injectAgentsMd}`] : []),
    ...(input.disable !== undefined ? [`disable: ${input.disable}`] : []),
    ...(permission
      ? ["permission:", ...Object.entries(permission).map(([tool, action]) => `  ${tool}: ${action}`)]
      : []),
    "---",
    "",
    input.prompt ?? input.description,
    "",
  ].join("\n")
}

export function buildPermission(tools: string[] | undefined) {
  if (!tools) return undefined
  const allowed = new Set(tools.map((tool) => tool.trim().toLowerCase()).filter(Boolean))
  const permission: Record<string, "allow" | "deny"> = {}
  for (const tool of AGENT_FORM_TOOL_CATALOG) {
    permission[tool] = allowed.has(tool) ? "allow" : "deny"
  }
  // A caller naming a permission the form does not govern is asking for it explicitly.
  for (const tool of allowed) {
    if (!(tool in permission)) permission[tool] = "allow"
  }
  return permission
}
