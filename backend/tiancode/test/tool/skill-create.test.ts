import { describe, expect, afterEach } from "bun:test"
import { CrossSpawnSpawner } from "@tiancode-ai/core/cross-spawn-spawner"
import { LayerNode } from "@tiancode-ai/core/effect/layer-node"
import { Ripgrep } from "@tiancode-ai/core/ripgrep"
import { Effect } from "effect"
import path from "path"
import type { Tool } from "@/tool/tool"
import { SkillCreateTool } from "../../src/tool/skill-create"
import { SkillTool } from "../../src/tool/skill"
import { ToolRegistry } from "@/tool/registry"
import { disposeAllInstances, TestInstance } from "../fixture/fixture"
import { SessionID, MessageID } from "../../src/session/schema"
import { testEffect } from "../lib/effect"

const baseCtx: Omit<Tool.Context, "ask"> = {
  sessionID: SessionID.make("ses_test"),
  messageID: MessageID.make("msg_test"),
  callID: "",
  agent: "build",
  abort: AbortSignal.any([]),
  messages: [],
  metadata: () => Effect.void,
}

afterEach(async () => {
  await disposeAllInstances()
})

const it = testEffect(LayerNode.compile(LayerNode.group([ToolRegistry.node, CrossSpawnSpawner.node, Ripgrep.node])))

describe("tool.skill_create", () => {
  it.instance("creates a reusable skill and makes it immediately available", () =>
    Effect.gen(function* () {
      const dir = (yield* TestInstance).directory
      const home = process.env.TIANCODE_TEST_HOME
      process.env.TIANCODE_TEST_HOME = dir
      yield* Effect.addFinalizer(() =>
        Effect.sync(() => {
          process.env.TIANCODE_TEST_HOME = home
        }),
      )

      const registry = yield* ToolRegistry.Service
      const agent = { name: "build", mode: "primary" as const, permission: [], options: {} }
      const tools = yield* registry.tools({
        providerID: "tiancode" as any,
        modelID: "gpt-5" as any,
        agent,
      })

      const skillCreate = tools.find((t) => t.id === SkillCreateTool.id)
      const skillTool = tools.find((t) => t.id === SkillTool.id)
      if (!skillCreate) throw new Error("SkillCreate tool not found")
      if (!skillTool) throw new Error("Skill tool not found")

      const ctx: Tool.Context = {
        ...baseCtx,
        ask: () => Effect.void,
      }

      // Create new skill
      const createRes = yield* skillCreate.execute(
        {
          name: "automated-deploy",
          description: "Use when deploying to production with turbo and docker",
          content: "# Automated Deploy Workflow\n\nRun `bun run deploy:prod` to deploy.",
          scope: "project",
        },
        ctx,
      )

      expect(createRes.title).toContain("Created skill: automated-deploy")
      expect(createRes.output).toContain("Successfully created skill 'automated-deploy'")

      // Verify the newly created skill can be loaded by SkillTool immediately
      const loadSkillRes = yield* skillTool.execute({ name: "automated-deploy" }, ctx)
      expect(loadSkillRes.title).toBe("Loaded skill: automated-deploy")
      expect(loadSkillRes.output).toContain("Automated Deploy Workflow")
      expect(loadSkillRes.output).toContain("bun run deploy:prod")
    }),
  )
})
