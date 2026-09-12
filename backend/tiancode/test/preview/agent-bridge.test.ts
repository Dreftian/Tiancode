import { afterEach, describe, expect, test } from "bun:test"
import {
  isPreviewBridgeAttached,
  requestPreviewAction,
  resetPreviewBridge,
  settlePreviewCommand,
  takePreviewCommands,
} from "@/preview/agent-bridge"

const DIR = "C:\\proyecto"

afterEach(() => resetPreviewBridge())

describe("preview agent bridge", () => {
  test("delivers an action to a waiting client and returns its result", async () => {
    const poll = takePreviewCommands(DIR, 2000)
    const pending = requestPreviewAction(DIR, { type: "click", target: "e3" })

    const commands = await poll
    expect(commands).toHaveLength(1)
    expect(commands[0]!.action).toEqual({ type: "click", target: "e3" })

    settlePreviewCommand(DIR, { id: commands[0]!.id, ok: true, output: "Pulsado" })
    await expect(pending).resolves.toMatchObject({ ok: true, output: "Pulsado" })
  })

  test("an action queued before the client polls is not lost", async () => {
    const pending = requestPreviewAction(DIR, { type: "inspect" })
    const commands = await takePreviewCommands(DIR, 2000)
    expect(commands).toHaveLength(1)
    settlePreviewCommand(DIR, { id: commands[0]!.id, ok: true, output: "ok" })
    await expect(pending).resolves.toMatchObject({ ok: true })
  })

  test("the directory key ignores trailing separators and case", async () => {
    const poll = takePreviewCommands("C:\\proyecto\\", 2000)
    const pending = requestPreviewAction("c:\\Proyecto", { type: "inspect" })
    const commands = await poll
    expect(commands).toHaveLength(1)
    settlePreviewCommand("C:\\proyecto", { id: commands[0]!.id, ok: true, output: "ok" })
    await expect(pending).resolves.toMatchObject({ ok: true })
  })

  test("without a client the action fails with an explanation instead of hanging", async () => {
    const result = await requestPreviewAction(DIR, { type: "click", target: "e1" }, 40)
    expect(result.ok).toBe(false)
    expect(result.output).toContain("Vista en vivo")
    expect(isPreviewBridgeAttached(DIR)).toBe(false)
  })

  test("a poll with nothing queued resolves empty instead of blocking forever", async () => {
    const commands = await takePreviewCommands(DIR, 30)
    expect(commands).toEqual([])
    expect(isPreviewBridgeAttached(DIR)).toBe(true)
  })

  test("a result for an unknown action is ignored", () => {
    expect(() => settlePreviewCommand(DIR, { id: "nope", ok: true, output: "x" })).not.toThrow()
  })

  test("two windows on the same folder do not both run the action", async () => {
    const first = takePreviewCommands(DIR, 2000)
    const second = takePreviewCommands(DIR, 60)
    requestPreviewAction(DIR, { type: "click", target: "e1" }, 2000)

    const [a, b] = await Promise.all([first, second])
    // One of them gets the click; the other times out empty. Handing it to both would press
    // the button twice.
    expect(a.length + b.length).toBe(1)
  })
})
