import { afterEach, describe, expect } from "bun:test"
import { Effect, Fiber } from "effect"
import { LayerNode } from "@tiancode-ai/core/effect/layer-node"
import { CrossSpawnSpawner } from "@tiancode-ai/core/cross-spawn-spawner"
import { Ripgrep } from "@tiancode-ai/core/ripgrep"
import { Computer } from "@tiancode-ai/schema/computer"
import { ComputerTool } from "../../src/tool/computer"
import { Tool } from "../../src/tool/tool"
import { ToolRegistry } from "../../src/tool/registry"
import { Truncate } from "../../src/tool/truncate"
import { Agent } from "../../src/agent/agent"
import { resetPreviewBridge, settlePreviewCommand, takePreviewCommands } from "../../src/preview/agent-bridge"
import { MessageID, SessionID } from "../../src/session/schema"
import { disposeAllInstances, TestInstance } from "../fixture/fixture"
import { testEffect } from "../lib/effect"

const it = testEffect(
  LayerNode.compile(
    LayerNode.group([ToolRegistry.node, Truncate.node, Agent.node, CrossSpawnSpawner.node, Ripgrep.node]),
  ),
)
const base: Omit<Tool.Context, "ask"> = {
  sessionID: SessionID.make("ses_computer_test"),
  messageID: MessageID.make("msg_computer_test"),
  agent: "build",
  abort: AbortSignal.any([]),
  messages: [],
  metadata: () => Effect.void,
}
const frame: Computer.Observation = {
  kind: "computer_observation",
  snapshotId: "observation-1",
  capturedAt: Date.now(),
  display: { id: "left", label: "Left", bounds: { x: -1920, y: 0, width: 1920, height: 1080 }, scaleFactor: 1.5 },
  imageWidth: 1280,
  imageHeight: 720,
  screenshot:
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a6y8AAAAASUVORK5CYII=",
  foreground: {
    id: "1234",
    pid: 123,
    exe: "C:\\Test\\fixture.exe",
    title: "Untrusted window title",
    bounds: { x: -1920, y: 0, width: 1920, height: 1080 },
    minimized: false,
    elevation: "no",
    selfElevated: false,
  },
  controls: [
    {
      name: "QA text",
      role: "ControlType.Edit",
      bounds: { x: -1500, y: 200, width: 400, height: 80 },
      enabled: true,
      focused: true,
      password: false,
    },
  ],
  accessibility: "available (bounded, no field values)",
}

afterEach(async () => {
  resetPreviewBridge()
  await disposeAllInstances()
})

describe("computer tool and desktop bridge", () => {
  it.instance(
    "attaches the actual observation image and preserves monitor context after both permissions",
    () =>
      Effect.gen(function* () {
        const directory = (yield* TestInstance).directory
        const definition = yield* ComputerTool
        const tool = yield* Tool.init(definition)
        const requests: Parameters<Tool.Context["ask"]>[0][] = []
        const running = yield* tool
          .execute(
            { action: "observe", displayId: "left" },
            {
              ...base,
              ask: (request) =>
                Effect.sync(() => {
                  requests.push(request)
                }),
            },
          )
          .pipe(Effect.forkChild)
        const commands = yield* Effect.promise(() =>
          takePreviewCommands(directory, 5000, { surface: false, capable: true }),
        )
        expect(commands).toHaveLength(1)
        expect(commands[0]!.action).toEqual({ type: "computer", computer: { action: "observe", displayId: "left" } })
        expect(requests.map((request) => request.permission)).toEqual(["computer", "screenshot"])
        settlePreviewCommand(directory, { id: commands[0]!.id, ok: true, output: JSON.stringify(frame) })
        const result = yield* Fiber.join(running)
        expect(result.attachments).toEqual([{ type: "file", mime: "image/png", url: frame.screenshot }])
        expect(JSON.parse(result.output)).toMatchObject({
          snapshotId: frame.snapshotId,
          display: frame.display,
          foreground: frame.foreground,
          controls: frame.controls,
        })
        expect(result.output).not.toContain("base64")
        expect(result.metadata.ok).toBe(true)
      }),
    30000,
  )

  it.instance(
    "keeps large accessibility contexts as valid bounded JSON alongside the image",
    () =>
      Effect.gen(function* () {
        const directory = (yield* TestInstance).directory
        const definition = yield* ComputerTool
        const tool = yield* Tool.init(definition)
        const observation = {
          ...frame,
          controls: Array.from({ length: 160 }, (_, index) => ({
            ...frame.controls[0]!,
            name: `${index} ${"界".repeat(300)}`,
          })),
        }
        const running = yield* tool
          .execute({ action: "observe" }, { ...base, ask: () => Effect.void })
          .pipe(Effect.forkChild)
        const commands = yield* Effect.promise(() =>
          takePreviewCommands(directory, 5000, { surface: false, capable: true }),
        )
        settlePreviewCommand(directory, { id: commands[0]!.id, ok: true, output: JSON.stringify(observation) })
        const result = yield* Fiber.join(running)
        const context = JSON.parse(result.output)
        expect(Buffer.byteLength(result.output)).toBeLessThanOrEqual(32 * 1024)
        expect(context.snapshotId).toBe(frame.snapshotId)
        expect(context.omittedControls).toBeGreaterThan(0)
        expect(context.controls.length + context.omittedControls).toBe(160)
        expect(result.attachments?.[0]?.url).toBe(frame.screenshot)
        expect(result.metadata.truncated).toBe(false)
      }),
    30000,
  )

  it.instance(
    "transports drag endpoints and observation identity without dropping public fields",
    () =>
      Effect.gen(function* () {
        const directory = (yield* TestInstance).directory
        const definition = yield* ComputerTool
        const tool = yield* Tool.init(definition)
        const input: Computer.Request = {
          action: "drag",
          x: 0.2,
          y: 0.3,
          endX: 0.7,
          endY: 0.8,
          coordinateSpace: "normalized",
          snapshotId: "observation-1",
          durationMs: 350,
        }
        const running = yield* tool.execute(input, { ...base, ask: () => Effect.void }).pipe(Effect.forkChild)
        const commands = yield* Effect.promise(() =>
          takePreviewCommands(directory, 5000, { surface: false, capable: true }),
        )
        expect(commands[0]!.action.computer).toEqual(input)
        settlePreviewCommand(directory, { id: commands[0]!.id, ok: true, output: "Arrastre terminado" })
        expect((yield* Fiber.join(running)).metadata.ok).toBe(true)
      }),
    30000,
  )

  it.instance(
    "rejects malformed desktop observations instead of claiming the model saw an image",
    () =>
      Effect.gen(function* () {
        const directory = (yield* TestInstance).directory
        const definition = yield* ComputerTool
        const tool = yield* Tool.init(definition)
        const running = yield* tool
          .execute({ action: "observe" }, { ...base, ask: () => Effect.void })
          .pipe(Effect.forkChild)
        const commands = yield* Effect.promise(() =>
          takePreviewCommands(directory, 5000, { surface: false, capable: true }),
        )
        settlePreviewCommand(directory, { id: commands[0]!.id, ok: true, output: "not an observation" })
        const result = yield* Fiber.join(running)
        expect(result.metadata.ok).toBe(false)
        expect(result.attachments).toBeUndefined()
      }),
    30000,
  )
})
