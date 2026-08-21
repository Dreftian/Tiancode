import { describe, expect, afterEach } from "bun:test"
import { CrossSpawnSpawner } from "@tiancode-ai/core/cross-spawn-spawner"
import { LayerNode } from "@tiancode-ai/core/effect/layer-node"
import { Ripgrep } from "@tiancode-ai/core/ripgrep"
import { Effect } from "effect"
import type { Tool } from "@/tool/tool"
import { MemoryTool } from "../../src/tool/memory"
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

describe("tool.memory", () => {
  it.instance("saves and recalls project and user memories", () =>
    Effect.gen(function* () {
      const registry = yield* ToolRegistry.Service
      const agent = { name: "build", mode: "primary" as const, permission: [], options: {} }
      const tool = (yield* registry.tools({
        providerID: "tiancode" as any,
        modelID: "gpt-5" as any,
        agent,
      })).find((tool) => tool.id === MemoryTool.id)
      if (!tool) throw new Error("Memory tool not found")

      const ctx: Tool.Context = {
        ...baseCtx,
        ask: () => Effect.void,
      }

      // Save project memory
      const saveProjRes = yield* tool.execute(
        {
          action: "save",
          target: "project",
          category: "architecture",
          entry: "Tiancode uses Effect-TS layered architecture and SQLite",
        },
        ctx,
      )
      expect(saveProjRes.title).toContain("Saved project memory")
      expect(saveProjRes.output).toContain("Tiancode uses Effect-TS layered architecture")

      // Save user memory
      const saveUserRes = yield* tool.execute(
        {
          action: "save",
          target: "user",
          category: "preference",
          entry: "User speaks Spanish and prefers concise responses",
        },
        ctx,
      )
      expect(saveUserRes.title).toContain("Saved user preference")
      expect(saveUserRes.output).toContain("User speaks Spanish")

      // Recall memory
      const recallRes = yield* tool.execute(
        {
          action: "recall",
          query: "Effect-TS",
        },
        ctx,
      )
      expect(recallRes.output).toContain("Effect-TS")
      expect(recallRes.output).toContain("User Memory")
      expect(recallRes.output).toContain("Project Memory")
    }),
  )
})
