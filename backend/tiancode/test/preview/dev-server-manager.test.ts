import { afterEach, describe, expect, test } from "bun:test"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import net from "node:net"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { getPreviewState, startPreviewServer, stopPreviewServer } from "../../src/preview/dev-server-manager"

// A real server per test, started through tiancode.preview.json like the agent does.
const SERVER = `Bun.serve({ port: Number(process.argv[2]), hostname: process.argv[3], fetch: () => new Response(process.argv[4]) })`

const dirs: string[] = []
const strangers: Array<{ stop: () => void }> = []

afterEach(() => {
  dirs.splice(0).forEach((dir) => {
    stopPreviewServer(dir)
    rmSync(dir, { recursive: true, force: true })
  })
  strangers.splice(0).forEach((server) => server.stop())
})

function freePort() {
  return new Promise<number>((resolve) => {
    const server = net.createServer().listen(0, "127.0.0.1", () => {
      const port = (server.address() as net.AddressInfo).port
      server.close(() => resolve(port))
    })
  })
}

function project(port: number, host: string, body: string) {
  const dir = dirs[0] ?? mkdtempSync(join(tmpdir(), "tiancode-preview-"))
  if (!dirs.includes(dir)) dirs.push(dir)
  writeFileSync(join(dir, "server.js"), SERVER)
  writeFileSync(
    join(dir, "tiancode.preview.json"),
    JSON.stringify({ command: [process.execPath, "server.js", String(port), host, body], url: `http://127.0.0.1:${port}` }),
  )
  return dir
}

async function settled(dir: string) {
  const deadline = Date.now() + 20_000
  while (getPreviewState(dir).status === "starting" && Date.now() < deadline) await Bun.sleep(100)
  return getPreviewState(dir)
}

describe("preview server lifecycle", () => {
  test("an edited tiancode.preview.json restarts the server and the port serves the new one", async () => {
    const port = await freePort()
    const dir = project(port, "127.0.0.1", "v1")
    await startPreviewServer(dir)
    const first = await settled(dir)
    expect(first.status).toBe("ready")
    expect(await (await fetch(first.url!)).text()).toBe("v1")

    project(port, "127.0.0.1", "v2")
    await startPreviewServer(dir)
    const second = await settled(dir)
    expect(second.status).toBe("ready")
    expect(second.startedAt).not.toBe(first.startedAt)
    // Only the new server answers: the old one was stopped before the new one started.
    expect(await (await fetch(`http://127.0.0.1:${port}`)).text()).toBe("v2")
  }, 60_000)

  test("a port held by a process Tiancode did not start is reported, not killed", async () => {
    const port = await freePort()
    strangers.push(Bun.serve({ port, hostname: "127.0.0.1", fetch: () => new Response("someone else") }))
    const dir = project(port, "127.0.0.1", "mine")
    await startPreviewServer(dir)
    const state = await settled(dir)
    expect(state.status).toBe("error")
    expect(state.errorMessage).toContain(`El puerto ${port} ya lo usa otro proceso`)
    expect(await (await fetch(`http://127.0.0.1:${port}`)).text()).toBe("someone else")
  }, 60_000)

  test("a server that listens only on IPv6 is published under localhost", async () => {
    const port = await freePort()
    const dir = project(port, "::1", "v6")
    await startPreviewServer(dir)
    const state = await settled(dir)
    expect(state.status).toBe("ready")
    expect(state.url).toBe(`http://localhost:${port}/`)
  }, 60_000)
})
