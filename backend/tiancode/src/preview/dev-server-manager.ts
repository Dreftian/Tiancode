// DevServerManager: gestiona el servidor de desarrollo del proyecto actual
// (un solo servidor por directorio, sin duplicados). Spawn con entorno
// saneado, readiness por stdout o escaneo de puertos, kill del árbol sin
// huérfanos (taskkill /T en Windows, kill de grupo en Unix) y limpieza al
// salir del sidecar.

import { spawn, spawnSync, type ChildProcess } from "node:child_process"
import { join } from "node:path"
import net from "node:net"
import { parseBuildError } from "./error-parser"
import { detectProject, type DetectedProject } from "./project-detector"
import type { PreviewError, PreviewState } from "./types"

const LOG_MAX = 500
const ERROR_MAX = 20
const READY_TIMEOUT_MS = 45_000
const PORT_SCAN_RANGE = 20

// "Local: http://localhost:5173/", "localhost:5173", "listening on 5173"
const URL_RE = /https?:\/\/(?:localhost|127\.0\.0\.1):(\d{2,5})/i
const PORT_RE = /(?:localhost|127\.0\.0\.1):(\d{2,5})/i

type Managed = {
  directory: string
  detected: DetectedProject
  process: ChildProcess | null
  state: PreviewState
  logs: string[]
  readyTimer: ReturnType<typeof setTimeout> | null
}

const servers = new Map<string, Managed>()

// Variables que no deben filtrarse al dev server (evita que Vite herede el
// puerto de Electron o el modo "run as node" y otros bugs raros).
const SCRUB_ENV = new Set([
  "PORT",
  "ELECTRON_RUN_AS_NODE",
  "ELECTRON_RENDERER_URL",
  "ELECTRON_RENDERER_PORT",
  "VITE_DEV_SERVER_URL",
])

function scrubEnv() {
  const env: Record<string, string | undefined> = { ...process.env }
  for (const key of SCRUB_ENV) delete env[key]
  // Logs sin códigos ANSI: el parsing de URLs/errores es más fiable.
  env.FORCE_COLOR = "0"
  env.NO_COLOR = "1"
  return env
}

function idleState(detected: DetectedProject | null): PreviewState {
  return {
    status: "idle",
    url: null,
    port: null,
    framework: detected?.framework ?? null,
    packageManager: detected?.packageManager ?? null,
    command: detected ? `${detected.packageManager} run ${detected.script}` : null,
    errors: [],
    startedAt: null,
    errorMessage: null,
  }
}

function portOpen(port: number) {
  return new Promise<boolean>((resolve) => {
    const socket = net.connect({ port, host: "127.0.0.1" })
    socket.setTimeout(400)
    socket.once("connect", () => {
      socket.destroy()
      resolve(true)
    })
    socket.once("timeout", () => {
      socket.destroy()
      resolve(false)
    })
    socket.once("error", () => {
      socket.destroy()
      resolve(false)
    })
  })
}

async function findOpenPort(start: number) {
  for (let port = start; port < start + PORT_SCAN_RANGE; port++) {
    if (await portOpen(port)) return port
  }
  return null
}

function killTree(proc: ChildProcess) {
  const pid = proc.pid
  if (!pid) return
  if (process.platform === "win32") {
    // taskkill /T mata el árbol (cmd → node → vite → esbuild).
    spawnSync("taskkill", ["/pid", String(pid), "/T", "/F"], { windowsHide: true })
    return
  }
  try {
    process.kill(-pid, "SIGTERM")
    setTimeout(() => {
      try {
        process.kill(-pid, "SIGKILL")
      } catch {
        // Ya terminó.
      }
    }, 2000).unref()
  } catch {
    // Ya terminó.
  }
}

function setStatus(managed: Managed, state: Partial<PreviewState>) {
  managed.state = { ...managed.state, ...state }
}

function pushLog(managed: Managed, chunk: string) {
  const lines = chunk.split(/\r?\n/)
  for (const line of lines) {
    if (!line.trim()) continue
    managed.logs.push(line)
    if (managed.logs.length > LOG_MAX) managed.logs.splice(0, managed.logs.length - LOG_MAX)
  }
}

function onOutput(managed: Managed, chunk: string) {
  pushLog(managed, chunk)

  // URL del dev server en stdout ("Local: http://localhost:5173").
  const urlMatch = URL_RE.exec(chunk)
  if (urlMatch) {
    const port = Number(urlMatch[1])
    setStatus(managed, { url: `http://localhost:${port}`, port, status: "ready", errorMessage: null })
    return
  }

  // Errores de compilación estructurados para el agente.
  for (const line of chunk.split(/\r?\n/)) {
    const error = parseBuildError(line)
    if (!error) continue
    managed.state.errors.push(error)
    if (managed.state.errors.length > ERROR_MAX) managed.state.errors.shift()
  }
}

function schedulePortScan(managed: Managed) {
  const scan = async () => {
    const port = await findOpenPort(managed.detected.port)
    if (!port) {
      setStatus(managed, {
        status: "error",
        errorMessage: "El servidor de desarrollo no respondió en ningún puerto.",
      })
      return
    }
    if (managed.state.status !== "ready") {
      setStatus(managed, { url: `http://localhost:${port}`, port, status: "ready", errorMessage: null })
    }
  }
  const timer = setTimeout(() => void scan(), 8000)
  managed.readyTimer = timer
  timer.unref()
}

function clearReadyTimer(managed: Managed) {
  if (managed.readyTimer) clearTimeout(managed.readyTimer)
  managed.readyTimer = null
}

function spawnServer(managed: Managed) {
  const { packageManager, script } = managed.detected
  const args = ["run", script]
  // En Windows los gestores son .cmd: shell:true los resuelve (cmd.exe padre
  // → taskkill /T mata todo el árbol). En Unix, detached + setsid permite
  // matar el grupo de procesos.
  const isWin = process.platform === "win32"
  const child = spawn(packageManager, args, {
    cwd: managed.directory,
    env: scrubEnv(),
    shell: isWin,
    detached: !isWin,
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
  })

  managed.process = child
  setStatus(managed, { status: "starting", errorMessage: null })

  child.stdout?.on("data", (data: Buffer) => onOutput(managed, data.toString()))
  child.stderr?.on("data", (data: Buffer) => onOutput(managed, data.toString()))
  child.on("error", (error) => {
    setStatus(managed, { status: "error", errorMessage: error.message })
    clearReadyTimer(managed)
  })
  child.on("exit", () => {
    clearReadyTimer(managed)
    managed.process = null
    if (managed.state.status === "starting" || managed.state.status === "ready") {
      setStatus(managed, { status: "stopped" })
    }
  })

  schedulePortScan(managed)
}

export function getPreviewState(directory: string) {
  return servers.get(directory)?.state ?? idleState(null)
}

export function getPreviewLogs(directory: string) {
  return [...(servers.get(directory)?.logs ?? [])]
}

export async function startPreviewServer(directory: string) {
  const existing = servers.get(directory)
  if (existing && (existing.state.status === "starting" || existing.state.status === "ready")) {
    return existing.state
  }
  if (existing) stopPreviewServer(directory)

  const detected = await detectProject(directory)
  if (!detected) {
    const state = idleState(null)
    state.status = "error"
    state.errorMessage = "No se encontró package.json con un script de desarrollo en este proyecto."
    return state
  }

  const managed: Managed = {
    directory,
    detected,
    process: null,
    state: idleState(detected),
    logs: [],
    readyTimer: null,
  }
  servers.set(directory, managed)
  spawnServer(managed)
  return managed.state
}

export function stopPreviewServer(directory: string) {
  const managed = servers.get(directory)
  if (!managed) return idleState(null)
  if (managed.process) killTree(managed.process)
  clearReadyTimer(managed)
  managed.process = null
  setStatus(managed, { status: "stopped", url: null, port: null })
  return managed.state
}

export async function restartPreviewServer(directory: string) {
  stopPreviewServer(directory)
  return startPreviewServer(directory)
}

// Limpieza al cerrar el sidecar: mata los dev servers sin dejar huérfanos.
export function stopAllPreviewServers() {
  for (const directory of [...servers.keys()]) stopPreviewServer(directory)
}

if (typeof process !== "undefined") {
  process.on("exit", stopAllPreviewServers)
}
