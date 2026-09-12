import { afterEach, describe, expect, test } from "bun:test"
import {
  isPreviewBridgeAttached,
  pendingPreviewDemand,
  previewBridgePresence,
  reportPreviewBridgeClient,
  requestDesktopAction,
  requestPreviewAction,
  resetPreviewBridge,
  settlePreviewCommand,
  takePreviewCommands,
} from "@/preview/agent-bridge"

const DIR = "C:\\proyecto"
/** A client with a loaded page: the only kind that may be handed work. */
const SURFACE = { surface: true, capable: true }
/** The desktop app with the Live view closed, or its page still loading. */
const BLIND = { surface: false, capable: true }

afterEach(() => resetPreviewBridge())

describe("preview agent bridge", () => {
  test("delivers an action to a waiting client and returns its result", async () => {
    const poll = takePreviewCommands(DIR, 2000, SURFACE)
    const pending = requestPreviewAction(DIR, { type: "click", target: "e3" })

    const commands = await poll
    expect(commands).toHaveLength(1)
    expect(commands[0]!.action).toEqual({ type: "click", target: "e3" })

    settlePreviewCommand(DIR, { id: commands[0]!.id, ok: true, output: "Pulsado" })
    await expect(pending).resolves.toMatchObject({ ok: true, output: "Pulsado" })
  })

  test("an action queued before the client polls is not lost", async () => {
    const pending = requestPreviewAction(DIR, { type: "inspect" })
    const commands = await takePreviewCommands(DIR, 2000, SURFACE)
    expect(commands).toHaveLength(1)
    settlePreviewCommand(DIR, { id: commands[0]!.id, ok: true, output: "ok" })
    await expect(pending).resolves.toMatchObject({ ok: true })
  })

  test("the directory key ignores trailing separators and case", async () => {
    const poll = takePreviewCommands("C:\\proyecto\\", 2000, SURFACE)
    const pending = requestPreviewAction("c:\\Proyecto", { type: "inspect" })
    const commands = await poll
    expect(commands).toHaveLength(1)
    settlePreviewCommand("C:\\proyecto", { id: commands[0]!.id, ok: true, output: "ok" })
    await expect(pending).resolves.toMatchObject({ ok: true })
  })

  test("without a client the action fails with an explanation instead of hanging", async () => {
    const result = await requestPreviewAction(DIR, { type: "click", target: "e1" }, 40)
    expect(result.ok).toBe(false)
    expect(result.output).toContain("ventana de Tiancode")
    expect(isPreviewBridgeAttached(DIR)).toBe(false)
  })

  test("a poll with nothing queued resolves empty instead of blocking forever", async () => {
    const commands = await takePreviewCommands(DIR, 30, SURFACE)
    expect(commands).toEqual([])
    expect(isPreviewBridgeAttached(DIR)).toBe(true)
  })

  test("a result for an unknown action is ignored", () => {
    expect(() => settlePreviewCommand(DIR, { id: "nope", ok: true, output: "x" })).not.toThrow()
  })

  test("two windows on the same folder do not both run the action", async () => {
    const first = takePreviewCommands(DIR, 2000, SURFACE)
    const second = takePreviewCommands(DIR, 60, SURFACE)
    requestPreviewAction(DIR, { type: "click", target: "e1" }, 2000)

    const [a, b] = await Promise.all([first, second])
    // One of them gets the click; the other times out empty. Handing it to both would press
    // the button twice.
    expect(a.length + b.length).toBe(1)
  })

  test("a client with no page never consumes a queued action", async () => {
    const pending = requestPreviewAction(DIR, { type: "click", target: "e1" }, 5000)
    // Delivery empties the queue, so handing the batch to a client that cannot execute it would
    // destroy the action. It must wait for a real surface instead.
    expect(await takePreviewCommands(DIR, 30, BLIND)).toEqual([])

    const commands = await takePreviewCommands(DIR, 30, SURFACE)
    expect(commands).toHaveLength(1)
    settlePreviewCommand(DIR, { id: commands[0]!.id, ok: true, output: "ok" })
    await expect(pending).resolves.toMatchObject({ ok: true })
  })

  test("presence separates a blind client from one that can act", async () => {
    expect(previewBridgePresence(DIR)).toBe("none")

    await takePreviewCommands(DIR, 5, BLIND)
    expect(previewBridgePresence(DIR)).toBe("opening")
    expect(isPreviewBridgeAttached(DIR)).toBe(false)

    await takePreviewCommands(DIR, 5, SURFACE)
    expect(previewBridgePresence(DIR)).toBe("surface")
    expect(isPreviewBridgeAttached(DIR)).toBe(true)
  })

  test("a web client is told immediately rather than left waiting", async () => {
    reportPreviewBridgeClient(DIR, { capable: false })
    expect(previewBridgePresence(DIR)).toBe("incapable")

    const started = Date.now()
    const result = await requestPreviewAction(DIR, { type: "inspect" })
    expect(Date.now() - started).toBeLessThan(1000)
    expect(result.ok).toBe(false)
    expect(result.output).toContain("navegador")
    // And it was not queued: nothing is left behind for a later surface to run.
    expect(await takePreviewCommands(DIR, 10, SURFACE)).toEqual([])
  })

  test("pendingPreviewDemand reports without consuming", async () => {
    requestPreviewAction(DIR, { type: "inspect" }, 5000)
    requestPreviewAction(DIR, { type: "click", target: "e1" }, 5000)

    const first = pendingPreviewDemand(DIR)
    expect(first.pending).toBe(2)
    expect(first.id).toBeTruthy()
    // Reading it twice must not eat the very action the watchdog is opening the panel for.
    expect(pendingPreviewDemand(DIR)).toMatchObject({ pending: 2, id: first.id })
    expect(await takePreviewCommands(DIR, 30, SURFACE)).toHaveLength(2)
  })

  test("a desktop action reaches a client with no page", async () => {
    // Una captura no necesita frame: exigir `surface` la dejaría esperando a que cargue una
    // página que no tiene nada que ver con lo que se va a fotografiar.
    const pending = requestDesktopAction(DIR, { type: "capture", target: "screen" }, 5000)
    const commands = await takePreviewCommands(DIR, 30, BLIND)
    expect(commands).toHaveLength(1)
    expect(commands[0]!.action).toEqual({ type: "capture", target: "screen" })

    settlePreviewCommand(DIR, { id: commands[0]!.id, ok: true, output: "data:image/png;base64,AAA" })
    await expect(pending).resolves.toMatchObject({ ok: true, output: "data:image/png;base64,AAA" })
  })

  test("a client with no page takes the desktop action and leaves the page action queued", async () => {
    const click = requestPreviewAction(DIR, { type: "click", target: "e1" }, 5000)
    const clipboard = requestDesktopAction(DIR, { type: "clipboard_read" }, 5000)

    const blind = await takePreviewCommands(DIR, 30, BLIND)
    expect(blind.map((c) => c.action.type)).toEqual(["clipboard_read"])
    settlePreviewCommand(DIR, { id: blind[0]!.id, ok: true, output: "texto" })
    await expect(clipboard).resolves.toMatchObject({ ok: true, output: "texto" })

    const surface = await takePreviewCommands(DIR, 30, SURFACE)
    expect(surface.map((c) => c.action.type)).toEqual(["click"])
    settlePreviewCommand(DIR, { id: surface[0]!.id, ok: true, output: "Pulsado" })
    await expect(click).resolves.toMatchObject({ ok: true })
  })

  test("a web client is told the desktop is out of reach, not that the page is", async () => {
    reportPreviewBridgeClient(DIR, { capable: false })
    const result = await requestDesktopAction(DIR, { type: "capture", target: "screen" })
    expect(result.ok).toBe(false)
    expect(result.output).toContain("escritorio")
  })

  // Las tres pruebas siguientes cubren el ENRUTADO del puente para la superficie `browser`. No son
  // una prueba de extremo a extremo: el esquema HTTP del long-poll todavía descarta `surface` y
  // rechaza `type: "origin"`, así que hoy ninguna tool las emite (ver PreviewActionSurface).
  test("an action for the integrated browser does not wait for the preview page", async () => {
    // El navegador integrado tiene su propia página: hacerle esperar al frame del dev server lo
    // dejaría inalcanzable justo cuando el usuario pide algo sobre lo que tiene abierto ahí.
    const pending = requestPreviewAction(DIR, { type: "origin", surface: "browser" }, 5000)
    const commands = await takePreviewCommands(DIR, 30, BLIND)
    expect(commands).toHaveLength(1)
    expect(commands[0]!.action).toEqual({ type: "origin", surface: "browser" })

    settlePreviewCommand(DIR, { id: commands[0]!.id, ok: true, output: "https://correo.example/inbox" })
    await expect(pending).resolves.toMatchObject({ ok: true, output: "https://correo.example/inbox" })
  })

  test("a blind client takes the browser action and leaves the preview action queued", async () => {
    const preview = requestPreviewAction(DIR, { type: "click", target: "e1" }, 5000)
    const browser = requestPreviewAction(DIR, { type: "inspect", surface: "browser" }, 5000)

    const blind = await takePreviewCommands(DIR, 30, BLIND)
    expect(blind.map((c) => c.action.surface)).toEqual(["browser"])
    settlePreviewCommand(DIR, { id: blind[0]!.id, ok: true, output: "página del navegador" })
    await expect(browser).resolves.toMatchObject({ ok: true })

    const surface = await takePreviewCommands(DIR, 30, SURFACE)
    expect(surface.map((c) => c.action.type)).toEqual(["click"])
    settlePreviewCommand(DIR, { id: surface[0]!.id, ok: true, output: "Pulsado" })
    await expect(preview).resolves.toMatchObject({ ok: true })
  })

  test("an action without a surface still means the project preview", async () => {
    // El puente no puede tratar «sin especificar» como «el navegador»: sería regalar la sesión
    // del usuario a cualquier llamada antigua.
    const pending = requestPreviewAction(DIR, { type: "inspect" }, 5000)
    expect(await takePreviewCommands(DIR, 30, BLIND)).toEqual([])

    const commands = await takePreviewCommands(DIR, 30, SURFACE)
    expect(commands).toHaveLength(1)
    settlePreviewCommand(DIR, { id: commands[0]!.id, ok: true, output: "ok" })
    await expect(pending).resolves.toMatchObject({ ok: true })
  })

  test("a computer action travels like the other desktop ones", async () => {
    const pending = requestDesktopAction(DIR, { type: "computer", value: "click" }, 5000)
    const commands = await takePreviewCommands(DIR, 30, BLIND)
    expect(commands.map((c) => c.action.type)).toEqual(["computer"])

    settlePreviewCommand(DIR, { id: commands[0]!.id, ok: true, output: "hecho" })
    await expect(pending).resolves.toMatchObject({ ok: true, output: "hecho" })
  })

  test("a requeued command is delivered again and settles once", async () => {
    const pending = requestPreviewAction(DIR, { type: "inspect" }, 5000)
    const first = await takePreviewCommands(DIR, 30, SURFACE)
    expect(first).toHaveLength(1)

    settlePreviewCommand(DIR, { id: first[0]!.id, ok: false, output: "cerrado" }, { requeue: true })
    const second = await takePreviewCommands(DIR, 30, SURFACE)
    expect(second.map((c) => c.id)).toEqual([first[0]!.id])

    settlePreviewCommand(DIR, { id: second[0]!.id, ok: true, output: "hecho" })
    await expect(pending).resolves.toMatchObject({ ok: true, output: "hecho" })
  })
})
