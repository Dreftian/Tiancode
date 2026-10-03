// Isolated Windows fixture. It exercises the production operator, not a copy of SendInput.
import { app, BrowserWindow, dialog, globalShortcut, ipcMain, screen } from "electron"
import { spawn } from "node:child_process"
import { createInterface } from "node:readline"
import { mkdir, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { connect, createServer } from "node:net"
import { Computer } from "@tiancode-ai/schema/computer"
import { Schema } from "effect"
import {
  computerGlowHtml,
  computerStatus,
  performComputerAction,
  registerComputerUseIpc,
  stopComputerControl,
} from "../src/main/computer-use"
import { captureComputerScreen } from "../src/main/computer-capture"

async function run() {
  const output = process.env.TIANCODE_COMPUTER_QA_ROOT!
  if (!output) throw new Error("Set an isolated TIANCODE_COMPUTER_QA_ROOT")
  app.setPath("userData", join(output, process.argv.includes("--fixture") ? "fixture-profile" : "operator-profile"))
  app.commandLine.appendSwitch("force-renderer-accessibility")
  await app.whenReady()
  app.on("window-all-closed", () => {})
  await mkdir(output, { recursive: true })

  if (process.argv.includes("--fixture")) {
    const window = new BrowserWindow({
      ...screen.getPrimaryDisplay().bounds,
      frame: false,
      show: true,
      webPreferences: { sandbox: true },
    })
    window.setTitle("Tiancode Windows QA fixture")
    await window.loadURL(
      `data:text/html;charset=utf-8,${encodeURIComponent(`<!doctype html><html><head><meta charset="utf-8"><title>Tiancode Windows QA fixture</title><style>
body{margin:0;background:#080e18;color:#e5efff;font:16px 'Segoe UI',sans-serif;padding:90px 70px;box-sizing:border-box}h1{margin:0 0 8px;font-size:30px}p{color:#8fa9c5}textarea{display:block;width:600px;height:90px;margin:24px 0;background:#122035;color:white;font:22px 'Segoe UI';padding:12px;border:1px solid #4676a5;border-radius:8px}button{padding:14px 24px;font:inherit}#drag{width:120px;height:80px;background:#147ac7;margin:35px 0;border-radius:10px;touch-action:none;display:grid;place-items:center}#scroll{height:130px;width:600px;overflow:auto;background:#122035;padding:16px}#long{height:900px}#result{padding:15px 0;color:#91cbff}
</style></head><body><h1>TianCode 1.0.8 · Windows QA</h1><p>Aplicación de prueba aislada · control nativo del escritorio</p><label for="text">QA text</label><textarea id="text" aria-label="QA text"></textarea><button id="button">QA button</button><div id="drag" role="button" aria-label="QA drag">Arrastrar</div><div id="scroll" aria-label="QA scroll"><div id="long">Desplazamiento de prueba</div></div><div id="result">Listo para las pruebas</div><script>
window.qa={clicks:0,doubles:0,right:0,dragMoves:0,ups:0,held:false,shortcut:false};button.onclick=()=>qa.clicks++;button.ondblclick=()=>qa.doubles++;button.oncontextmenu=e=>{e.preventDefault();qa.right++};document.onkeydown=e=>{if(e.ctrlKey&&e.key==='k'){e.preventDefault();qa.shortcut=true}};drag.onpointerdown=e=>{qa.held=true;drag.setPointerCapture(e.pointerId);console.log('QA_POINTER_DOWN')};drag.onpointermove=e=>{if(qa.held){qa.dragMoves++;result.textContent='Arrastre en ('+Math.round(e.clientX)+', '+Math.round(e.clientY)+')'}};drag.onpointerup=()=>{qa.held=false;qa.ups++;console.log('QA_POINTER_UP')};
</script></body></html>`)}`,
    )
    window.webContents.on("console-message", ({ message }) => {
      if (message.startsWith("QA_POINTER")) process.stdout.write(JSON.stringify({ event: message }) + "\n")
    })
    window.show()
    window.focus()
    const fixtureServer = createServer((channel) =>
      createInterface({ input: channel })
        .on("line", (line) => {
          const input = JSON.parse(line) as { id: string; action: string }
          if (input.action === "quit") {
            app.exit(0)
            return
          }
          void window.webContents
            .executeJavaScript(
              "({text:document.getElementById('text').value,scroll:document.getElementById('scroll').scrollTop,...window.qa, width:innerWidth,height:innerHeight, rects:Object.fromEntries(['text','button','drag','scroll'].map(id=>{const r=document.getElementById(id).getBoundingClientRect();return [id,{x:r.x,y:r.y,width:r.width,height:r.height}]}))})",
            )
            .then((data: unknown) => process.stdout.write(JSON.stringify({ id: input.id, data }) + "\n"))
        })
        .on("close", () => app.exit(0)),
    )
    fixtureServer.listen(0, "127.0.0.1", () => {
      const address = fixtureServer.address()
      if (!address || typeof address === "string") throw new Error("Fixture socket unavailable")
      process.stdout.write(
        JSON.stringify({
          ready: true,
          pid: process.pid,
          port: address.port,
          visible: window.isVisible(),
          title: window.getTitle(),
        }) + "\n",
      )
    })
  } else {
    const checks: { name: string; ok: boolean; detail?: unknown }[] = []
    const child = spawn(process.execPath, [process.argv[1]!, "--fixture"], {
      windowsHide: false,
      stdio: ["pipe", "pipe", "pipe"],
      env: Object.fromEntries(Object.entries(process.env).filter(([key]) => key !== "ELECTRON_RUN_AS_NODE")),
    })
    const messages = createInterface({ input: child.stdout })[Symbol.asyncIterator]()
    child.stderr.on("data", () => {})
    const fixtureReady = async (): Promise<{ ready: boolean; pid: number; port: number }> => {
      const line = await messages.next()
      if (line.done) throw new Error("Fixture exited before readiness")
      if (!line.value.trim().startsWith("{")) return fixtureReady()
      const value = JSON.parse(line.value) as { ready: boolean; pid: number; port: number }
      if (!value.ready) return fixtureReady()
      return value
    }
    const ready = await fixtureReady()
    const channel = connect(ready.port, "127.0.0.1")
    const stored = new Map<string, unknown>()
    // Test-only consent is restricted to this fixture PID. Human consent is not simulated as evidence.
    registerComputerUseIpc({
      app,
      browserWindow: BrowserWindow,
      screen,
      ipcMain,
      globalShortcut,
      dialog: {
        ...dialog,
        showMessageBox: (async (...args: unknown[]) => {
          const options = args.at(-1) as Electron.MessageBoxOptions
          if (!options.message?.includes("Tiancode Windows QA fixture")) return { response: 1, checkboxChecked: false }
          return { response: 0, checkboxChecked: false }
        }) as typeof dialog.showMessageBox,
      },
      store: {
        get: (key) => stored.get(key),
        set: (key, value) => {
          stored.set(key, value)
        },
      },
      log: (message, data) => {
        if (message.includes("failed")) process.stdout.write(JSON.stringify({ log: message, data }) + "\n")
      },
      translate: () => undefined,
      capture: captureComputerScreen,
    })
    const check = (name: string, ok: boolean, detail?: unknown) => {
      checks.push({ name, ok, detail })
      process.stdout.write(JSON.stringify({ check: name, ok }) + "\n")
      if (!ok) throw new Error(`QA failed: ${name}: ${JSON.stringify(detail)}`)
    }
    let counter = 0
    const state = async () => {
      const id = String(++counter)
      channel.write(JSON.stringify({ id, action: "state" }) + "\n")
      while (true) {
        const line = await messages.next()
        if (line.done) throw new Error("Fixture exited")
        const message = JSON.parse(line.value) as {
          id?: string
          data: {
            text: string
            scroll: number
            clicks: number
            doubles: number
            right: number
            dragMoves: number
            ups: number
            held: boolean
            shortcut: boolean
            width: number
            height: number
            rects: Record<string, Computer.Window["bounds"]>
          }
        }
        if (message.id === id) return message.data
      }
    }
    const observe = async () => {
      const result = await performComputerAction({ action: "observe" })
      check("native observation", result.ok, result.ok ? undefined : result.output)
      return Schema.decodeUnknownSync(Computer.Observation)(JSON.parse(result.output))
    }
    const waitState = async (predicate: (value: Awaited<ReturnType<typeof state>>) => boolean) => {
      const deadline = Date.now() + 1500
      while (Date.now() < deadline) {
        const value = await state()
        if (predicate(value)) return value
        await new Promise((resolve) => setTimeout(resolve, 20))
      }
      return state()
    }
    const point = (frame: Computer.Observation, ui: Awaited<ReturnType<typeof state>>, id: string) => ({
      x: frame.display.bounds.x + ((ui.rects[id]!.x + ui.rects[id]!.width / 2) / ui.width) * frame.display.bounds.width,
      y:
        frame.display.bounds.y +
        ((ui.rects[id]!.y + ui.rects[id]!.height / 2) / ui.height) * frame.display.bounds.height,
    })
    try {
      const listed = await performComputerAction({ action: "windows" })
      const windows = (JSON.parse(listed.output) as { windows: Computer.Window[] }).windows
      const target = windows.find((window) => window.pid === ready.pid)
      check("real window enumeration", !!target)
      const focused = await performComputerAction({ action: "focus", windowId: target!.id })
      check("real window focus", focused.ok, focused.output)
      check(
        "blue edge overlay active",
        BrowserWindow.getAllWindows().some((window) => !window.isFocusable() && window.isVisible()) &&
          computerStatus().active,
      )
      let frame = await observe()
      check(
        "accessible Windows controls",
        frame.controls.some((control) => control.name === "QA text"),
        frame.controls.length,
      )
      let ui = await state()
      const clicked = await performComputerAction({
        action: "click",
        ...point(frame, ui, "text"),
        snapshotId: frame.snapshotId,
      })
      check("real click", clicked.ok, clicked.output)
      const stale = await performComputerAction({
        action: "click",
        ...point(frame, ui, "text"),
        snapshotId: frame.snapshotId,
      })
      check("consumed observation refused", !stale.ok && stale.output.includes("observación"))
      frame = await observe()
      const typed = await performComputerAction({
        action: "type",
        text: "Hola, TianCode — áéíóú 😀",
        snapshotId: frame.snapshotId,
      })
      check(
        "real Unicode typing",
        typed.ok &&
          (await waitState((value) => value.text === "Hola, TianCode — áéíóú 😀")).text === "Hola, TianCode — áéíóú 😀",
        typed.output,
      )
      frame = await observe()
      await performComputerAction({ action: "key", keys: "ctrl+k", snapshotId: frame.snapshotId })
      check("real keyboard shortcut", (await waitState((value) => value.shortcut)).shortcut)
      frame = await observe()
      ui = await state()
      const buttonPoint = point(frame, ui, "button")
      const x = ((buttonPoint.x - frame.display.bounds.x) / frame.display.bounds.width) * 1000
      const y = ((buttonPoint.y - frame.display.bounds.y) / frame.display.bounds.height) * 1000
      const tars = await performComputerAction({
        action: "tars",
        prediction: `left_double(start_box='[${x}, ${y}]')`,
        snapshotId: frame.snapshotId,
      })
      ui = await waitState((value) => value.doubles === 1)
      check("UI-TARS double click on Windows", tars.ok && ui.clicks === 2 && ui.doubles === 1, {
        result: tars.output,
        clicks: ui.clicks,
        doubles: ui.doubles,
      })
      frame = await observe()
      await performComputerAction({
        action: "click",
        button: "right",
        ...point(frame, ui, "button"),
        snapshotId: frame.snapshotId,
      })
      check("real right click", (await waitState((value) => value.right === 1)).right === 1)
      frame = await observe()
      ui = await state()
      const start = point(frame, ui, "drag")
      const drag = await performComputerAction({
        action: "drag",
        ...start,
        endX: start.x + 200,
        endY: start.y + 60,
        durationMs: 350,
        snapshotId: frame.snapshotId,
      })
      ui = await waitState((value) => value.ups === 1 && !value.held)
      check("real drag and mouse release", drag.ok && ui.dragMoves > 3 && ui.ups === 1 && !ui.held, {
        result: drag.output,
        moves: ui.dragMoves,
        ups: ui.ups,
      })
      frame = await observe()
      ui = await state()
      const scroll = await performComputerAction({
        action: "scroll",
        direction: "down",
        amount: 3,
        ...point(frame, ui, "scroll"),
        snapshotId: frame.snapshotId,
      })
      check(
        "real scroll at observed point",
        scroll.ok && (await waitState((value) => value.scroll > 0)).scroll > 0,
        scroll.output,
      )
      frame = await observe()
      await writeFile(join(output, "blue-control.png"), Buffer.from(frame.screenshot.split(",")[1]!, "base64"))
      const beforeStop = Date.now()
      const dragging = performComputerAction({
        action: "drag",
        ...start,
        endX: start.x + 350,
        endY: start.y + 30,
        durationMs: 1800,
        snapshotId: frame.snapshotId,
      })
      await Promise.race([
        (async () => {
          while (true) {
            const line = await messages.next()
            if (line.done) throw new Error("Fixture exited during drag")
            const message = JSON.parse(line.value) as { event?: string }
            if (message.event === "QA_POINTER_DOWN") return
          }
        })(),
        dragging.then((result) => {
          throw new Error(`Drag completed before pointer-down notification: ${result.output}`)
        }),
        new Promise<never>((_resolve, reject) =>
          setTimeout(() => reject(new Error("Pointer-down notification timed out")), 5000),
        ),
      ])
      await stopComputerControl("user")
      const stopped = await dragging
      ui = await waitState((value) => !value.held)
      check(
        "stop interrupts an in-flight drag and releases the mouse",
        !stopped.ok && !ui.held && Date.now() - beforeStop < 1400,
        { elapsedMs: Date.now() - beforeStop, result: stopped.output, held: ui.held },
      )
      check("blue edges disappear on stop", !computerStatus().active && BrowserWindow.getAllWindows().length === 0)
      check("reduced-motion edge indicator", computerGlowHtml().includes("prefers-reduced-motion"))
      stored.set("computerUseEnabled", "false")
      const disabled = await performComputerAction({ action: "type", text: "blocked" })
      check("master switch blocks input", !disabled.ok && (await state()).text === "Hola, TianCode — áéíóú 😀")
      await writeFile(
        join(output, "report.json"),
        JSON.stringify({ platform: process.platform, fixturePid: ready.pid, simulatedConsent: true, checks }, null, 2),
      )
      process.stdout.write(JSON.stringify({ ok: true, checks: checks.length, output }) + "\n")
    } catch (error) {
      await writeFile(join(output, "report.json"), JSON.stringify({ ok: false, error: String(error), checks }, null, 2))
      process.stderr.write(String(error) + "\n")
      process.exitCode = 1
    } finally {
      await stopComputerControl("quit")
      channel.write(JSON.stringify({ action: "quit" }) + "\n")
      channel.end()
      app.exit(process.exitCode === 1 || checks.some((check) => !check.ok) ? 1 : 0)
    }
  }
}
void run().catch((error: unknown) => {
  process.stderr.write(String(error) + "\n")
  app.exit(1)
})
