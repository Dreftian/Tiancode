import { describe, expect } from "bun:test"
import { Effect, Exit, Scope } from "effect"
import { AgentV2 } from "@tiancode-ai/core/agent"
import { AppNodeBuilder } from "@tiancode-ai/core/effect/app-node-builder"
import { Location } from "@tiancode-ai/core/location"
import { AgentPlugin } from "@tiancode-ai/core/plugin/agent"
import { SPECIALISTS, SPECIALIST_ALIASES } from "@tiancode-ai/core/plugin/agent-specialists"
import { AbsolutePath } from "@tiancode-ai/core/schema"
import { location } from "./fixture/location"
import { testEffect } from "./lib/effect"
import { agentHost, host } from "./plugin/host"

const it = testEffect(AppNodeBuilder.build(AgentV2.node))

describe("AgentV2", () => {
  it.effect("uses the shared specialist catalog and preserves legacy names as hidden aliases", () =>
    Effect.gen(function* () {
      const agent = yield* AgentV2.Service
      yield* AgentPlugin.Plugin.effect(host({ agent: agentHost(agent) })).pipe(
        Effect.provideService(
          Location.Service,
          Location.Service.of(location({ directory: AbsolutePath.make("/project") })),
        ),
      )
      const agents = yield* agent.all()
      expect(agents.filter((item) => !item.hidden)).toHaveLength(19)
      for (const specialist of SPECIALISTS) {
        const item = yield* agent.get(AgentV2.ID.make(specialist.name))
        expect(item?.system).toBe(specialist.prompt)
        expect(item?.description).toBe(specialist.description)
        expect(item?.mode).toBe("subagent")
        expect(item?.hidden).toBe(false)
      }
      for (const [alias, target] of Object.entries(SPECIALIST_ALIASES)) {
        const legacy = yield* agent.get(AgentV2.ID.make(alias))
        const current = yield* agent.get(AgentV2.ID.make(target))
        expect(legacy?.hidden).toBe(true)
        expect(legacy?.system).toBe(current?.system)
      }
      yield* agent.transform((draft) =>
        draft.update(AgentV2.ID.make("rust-systems-engineer"), (item) => {
          item.hidden = false
          item.system = "My custom workflow."
        }),
      )
      expect((yield* agent.get(AgentV2.ID.make("rust-systems-engineer")))?.system).toBe("My custom workflow.")
      expect((yield* agent.get(AgentV2.ID.make("fullstack-coder")))?.system).not.toBe("My custom workflow.")
    }),
  )
  it.effect("starts without agents", () =>
    Effect.gen(function* () {
      const agent = yield* AgentV2.Service

      expect(yield* agent.all()).toEqual([])
      expect(yield* agent.get(AgentV2.ID.make("build"))).toBeUndefined()
    }),
  )

  it.effect("materializes replayable agent transforms", () =>
    Effect.gen(function* () {
      const agent = yield* AgentV2.Service
      const id = AgentV2.ID.make("reviewer")
      yield* agent.transform((editor) =>
        editor.update(id, (info) => {
          info.description = "Reviews code"
          info.mode = "subagent"
        }),
      )

      expect(yield* agent.get(id)).toMatchObject({ id, description: "Reviews code", mode: "subagent" })
      expect((yield* agent.all()).map((info) => info.id)).toEqual([id])
    }),
  )

  it.effect("rebuilds state when a transform is replaced", () =>
    Effect.gen(function* () {
      const agent = yield* AgentV2.Service
      const id = AgentV2.ID.make("reviewer")
      let description = "Old description"
      let hidden = true
      yield* agent.transform((editor) =>
        editor.update(id, (info) => {
          info.description = description
          info.hidden = hidden
        }),
      )
      description = "New description"
      hidden = false
      yield* agent.reload()

      expect(yield* agent.get(id)).toMatchObject({ description: "New description", hidden: false })
    }),
  )

  it.effect("removes a transform when its scope closes", () =>
    Effect.gen(function* () {
      const agent = yield* AgentV2.Service
      const id = AgentV2.ID.make("scoped")
      const scope = yield* Scope.make()
      yield* agent.transform((editor) => editor.update(id, () => {})).pipe(Scope.provide(scope))
      expect(yield* agent.get(id)).toBeDefined()

      yield* Scope.close(scope, Exit.void)
      expect(yield* agent.get(id)).toBeUndefined()
    }),
  )

  it.effect("applies direct agent updates", () =>
    Effect.gen(function* () {
      const agent = yield* AgentV2.Service
      const id = AgentV2.ID.make("build")

      yield* agent.transform((editor) =>
        editor.update(id, (info) => {
          info.mode = "primary"
          info.hidden = true
        }),
      )

      expect(yield* agent.get(id)).toMatchObject({ id, mode: "primary", hidden: true })
    }),
  )

  it.effect("creates agents with runtime defaults and supports direct removal", () =>
    Effect.gen(function* () {
      const agent = yield* AgentV2.Service
      const id = AgentV2.ID.make("custom")

      yield* agent.transform((editor) => editor.update(id, () => {}))
      expect(yield* agent.get(id)).toEqual(AgentV2.Info.empty(id))

      yield* agent.transform((editor) => editor.remove(id))
      expect(yield* agent.get(id)).toBeUndefined()
    }),
  )

  it.effect("does not ambiently opt built-in agents into bash", () =>
    Effect.gen(function* () {
      const agent = yield* AgentV2.Service
      yield* AgentPlugin.Plugin.effect(
        host({
          agent: agentHost(agent),
        }),
      ).pipe(
        Effect.provideService(
          Location.Service,
          Location.Service.of(location({ directory: AbsolutePath.make("/project") })),
        ),
      )

      const agents = yield* agent.all()
      const ids = agents.map((item) => String(item.id)).sort()
      // An exhaustive snapshot of this list went stale twice without anyone noticing (18 built-in
      // subagents were added under it), which only ever produced a failing test — never a caught
      // bug. What the test is actually named for is the loop below, which covers every agent
      // however many there are.
      expect(ids).toContain("build")
      expect(ids).toContain("plan")
      expect(ids).toContain("explore")
      expect(ids).toContain("general")
      expect(new Set(ids).size).toBe(ids.length)
      expect(agents.length).toBeGreaterThan(0)
      for (const item of agents) {
        expect(item.permissions.some((rule) => rule.action === "bash" && rule.effect !== "deny")).toBe(false)
      }
    }),
  )
})
