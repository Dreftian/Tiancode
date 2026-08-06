import { Agent } from "@/agent/agent"
import { Command } from "@/command"
import * as InstanceState from "@/effect/instance-state"
import { Format } from "@/format"
import { Config } from "@/config/config"
import { FSUtil } from "@tiancode-ai/core/fs-util"
import { Global } from "@tiancode-ai/core/global"
import { LSP } from "@/lsp/lsp"
import { Vcs } from "@/project/vcs"
import { Skill } from "@/skill"
import { Effect } from "effect"
import { HttpApiBuilder } from "effect/unstable/httpapi"
import { InstanceHttpApi } from "../api"
import { AgentCreateInput, ApiVcsApplyError, SkillImportInput } from "../groups/instance"
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

    const importSkill = Effect.fn("InstanceHttpApi.skillImport")(function* (ctx) {      const cfg = yield* config.get()
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
        const root = path.join(global.config, "skills", ctx.payload.name!)
        for (const file of ctx.payload.files ?? []) {
          yield* fs.writeWithDirs(path.join(root, file.path), file.content).pipe(Effect.orDie)
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
      const file = path.join(global.config, "agent", `${ctx.payload.name}.md`)
      yield* fs.writeWithDirs(file, buildAgentMarkdown(ctx.payload)).pipe(Effect.orDie)
      yield* agent.reload()
      return yield* agent.get(ctx.payload.name)
    })

    const updateAgent = Effect.fn("InstanceHttpApi.agentUpdate")(function* (ctx) {
      const file = path.join(global.config, "agent", `${ctx.params.name}.md`)
      yield* fs.writeWithDirs(file, buildAgentMarkdown({ ...ctx.payload, name: ctx.params.name })).pipe(Effect.orDie)
      yield* agent.reload()
      return yield* agent.get(ctx.params.name)
    })

    const deleteAgent = Effect.fn("InstanceHttpApi.agentDelete")(function* (ctx) {
      const file = path.join(global.config, "agent", `${ctx.params.name}.md`)
      yield* fs.remove(file).pipe(Effect.orDie)
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
      .handle("agentUpdate", updateAgent)
      .handle("agentDelete", deleteAgent)
      .handle("lsp", getLsp)
      .handle("formatter", getFormatter)
  }),
)

const AGENT_TOOL_CATALOG = [
  "read",
  "edit",
  "glob",
  "grep",
  "list",
  "bash",
  "task",
  "external_directory",
  "todowrite",
  "question",
  "webfetch",
  "websearch",
  "lsp",
  "doom_loop",
  "skill",
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

function buildPermission(tools: string[] | undefined) {
  if (!tools) return undefined
  const allowed = tools.map((tool) => tool.toLowerCase())
  const permission: Record<string, "allow" | "deny"> = {}
  for (const tool of AGENT_TOOL_CATALOG) {
    permission[tool] = allowed.includes(tool) ? "allow" : "deny"
  }
  for (const tool of allowed) {
    if (!(tool in permission)) permission[tool] = "allow"
  }
  return permission
}
