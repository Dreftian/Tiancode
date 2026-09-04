// DevServerManager: gestiona el servidor de desarrollo del proyecto actual
// (un solo servidor por directorio, sin duplicados). Spawn con entorno
// saneado, readiness por stdout o escaneo de puertos, kill del árbol sin
// huérfanos (taskkill /T en Windows, kill de grupo en Unix) y limpieza al
// salir del sidecar.

import { execFileSync, spawn, spawnSync, type ChildProcess } from "node:child_process"
import { existsSync, readdirSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import net from "node:net"
import { startBareJsxPreview, startStaticPreview, type BareJsxPreview, type StaticPreview } from "./bare-jsx-preview"
import { parseBuildError } from "./error-parser"
import { detectProject, findCompiledExecutable, type DetectedProject } from "./project-detector"
import type { PreviewError, PreviewState } from "./types"

const LOG_MAX = 500
const ERROR_MAX = 20
const READY_TIMEOUT_MS = 45_000
const PORT_SCAN_RANGE = 20
const HTTP_TIMEOUT_MS = 1_000
const READINESS_POLL_MS = 250

// "Local: http://localhost:5173/", "localhost:5173", "listening on 5173"
const URL_RE = /(https?:\/\/(?:localhost|127\.0\.0\.1|\[::1\]|0\.0\.0\.0):(\d{2,5}))/i
// Salida de python -m http.server ("Serving HTTP on 127.0.0.1 port 8000").
const PYTHON_SERVING_RE = /Serving HTTP on .* port (\d{2,5})/i

// En Windows, `python` del PATH suele ser el stub de Microsoft Store que no
// ejecuta nada; se resuelve un intérprete real (launcher py -3 o las rutas
// estándar de python.org), igual que hace el seeding de MCPs empaquetados.
let pythonCommand: string[] | undefined
function resolvePythonCommand(): string[] {
  if (pythonCommand) return pythonCommand
  const candidates: string[][] = [["py", "-3"]]
  if (process.platform === "win32") {
    const roots = [
      join(process.env.LOCALAPPDATA ?? "", "Programs", "Python"),
      join(process.env.ProgramFiles ?? "", "Python"),
    ]
    for (const root of roots) {
      if (!existsSync(root)) continue
      const dirs = readdirSync(root).filter((name) => /^Python3\d+$/.test(name)).sort().reverse()
      for (const dir of dirs) {
        const exe = join(root, dir, "python.exe")
        if (existsSync(exe)) candidates.push([exe])
      }
    }
  }
  const usable = candidates.find(([cmd, ...args]) => {
    try {
      execFileSync(cmd, [...args, "--version"], { stdio: "ignore", timeout: 5000 })
      return true
    } catch {
      return false
    }
  })
  pythonCommand = usable ?? ["python"]
  return pythonCommand
}

type Managed = {
  directory: string
  detected: DetectedProject
  process: ChildProcess | null
  bareJsx: BareJsxPreview | null
  staticPreview: StaticPreview | null
  state: PreviewState
  logs: string[]
  readyTimer: ReturnType<typeof setTimeout> | null
  readinessUrls: Set<string>
}

const servers = new Map<string, Managed>()

// Variables que no deben filtrarse al dev server (evita que Vite herede el
// puerto de Electron o el modo "run as node" y otros bugs raros). Los
// secretos del proceso (password del HttpApi y clave de cifrado de
// credenciales) también se excluyen: un package.json/vite.config del
// proyecto no es confiable y no debe poder descifrar auth.json ni controlar
// el servidor.
const SCRUB_ENV = new Set([
  "PORT",
  "ELECTRON_RUN_AS_NODE",
  "ELECTRON_RENDERER_URL",
  "ELECTRON_RENDERER_PORT",
  "VITE_DEV_SERVER_URL",
  "TIANCODE_SERVER_PASSWORD",
  "TIANCODE_SERVER_USERNAME",
  "TIANCODE_CREDENTIAL_KEY",
])

function scrubEnv() {
  const env: Record<string, string | undefined> = { ...process.env }
  for (const key of SCRUB_ENV) delete env[key]
  // Logs sin códigos ANSI: el parsing de URLs/errores es más fiable.
  env.FORCE_COLOR = "0"
  env.NO_COLOR = "1"
  // La vista previa vive dentro de Tiancode (Vista en vivo): un dev server
  // nunca debe abrir el navegador del escritorio por su cuenta (vite --open,
  // react-scripts start, next start) ni abrir ventanas nativas de Electron/Tauri
  // sobre el escritorio del usuario.
  env.BROWSER = "none"
  env.ELECTRON_RUN_AS_NODE = "1"
  env.CI = "true"
  env.TAURI_SKIP_DEVSERVER = "true"
  return env
}

function idleState(detected: DetectedProject | null): PreviewState {
  return {
    status: "idle",
    url: null,
    port: null,
    framework: detected?.framework ?? null,
    packageManager: detected?.packageManager ?? null,
    command: detected
      ? detected.packageManager === "static"
        ? `Tiancode static preview${detected.workingDirectory && detected.workingDirectory !== "." ? ` (${detected.workingDirectory})` : ""}`
        : detected.packageManager === "bare-jsx"
          ? `Tiancode JSX preview${detected.workingDirectory && detected.workingDirectory !== "." ? ` (${detected.workingDirectory})` : ""}`
          : detected.packageManager === "custom"
            ? "tiancode.preview.json"
        : `${detected.packageManager} run ${detected.script}${detected.workingDirectory && detected.workingDirectory !== "." ? ` (${detected.workingDirectory})` : ""}`
      : null,
    errors: [],
    startedAt: null,
    errorMessage: null,
    isDesktop: detected?.isDesktop ?? false,
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

// Para los servidores cuyo puerto controlamos nosotros (python estático):
// el primer puerto del rango que NO esté ocupado.
async function findFreePort(start: number) {
  for (let port = start; port < start + PORT_SCAN_RANGE; port++) {
    if (!(await portOpen(port))) return port
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

function isStarting(managed: Managed) {
  return servers.get(managed.directory) === managed && managed.state.status === "starting"
}

function wait(milliseconds: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, milliseconds))
}

async function respondsToHttp(url: string) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), HTTP_TIMEOUT_MS)
  try {
    const response = await fetch(url, { redirect: "manual", signal: controller.signal })
    return response.status >= 200 && response.status < 400
  } catch {
    return false
  } finally {
    clearTimeout(timer)
  }
}

function beginReadinessCheck(managed: Managed, url: string, port: number, timeoutMessage?: string) {
  if (!isStarting(managed) || managed.readinessUrls.has(url)) return
  managed.readinessUrls.add(url)
  void (async () => {
    const deadline = Date.now() + READY_TIMEOUT_MS
    while (isStarting(managed)) {
      if (await respondsToHttp(url)) {
        if (isStarting(managed)) {
          setStatus(managed, { url, port, status: "ready", errorMessage: null })
          clearReadyTimer(managed)
        }
        return
      }
      if (Date.now() >= deadline) {
        managed.readinessUrls.delete(url)
        if (timeoutMessage && isStarting(managed)) {
          setStatus(managed, { status: "error", errorMessage: timeoutMessage })
          clearReadyTimer(managed)
        }
        return
      }
      await wait(READINESS_POLL_MS)
    }
  })()
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

  // La URL de stdout solo propone una candidata. La vista no queda lista
  // hasta que esa URL responda por HTTP, no solo porque haya abierto un TCP.
  const urlMatch = URL_RE.exec(chunk)
  if (urlMatch) {
    const port = Number(urlMatch[2])
    const url = urlMatch[1].replace("0.0.0.0", "127.0.0.1")
    beginReadinessCheck(managed, url, port, "La URL local publicada por el servidor no respondió por HTTP.")
    return
  }

  // Detección para servidores Python (Uvicorn, Flask, Django, Streamlit), Go, Rust, PHP, .NET
  const multiLangMatch = /(?:Uvicorn running on|Running on|Starting development server at|Development Server|Local URL:|Network URL:|Now listening on:|listening at)\s+(https?:\/\/[^\s"'<>]+)/i.exec(chunk)
  if (multiLangMatch?.[1]) {
    try {
      const parsed = new URL(multiLangMatch[1].replace("0.0.0.0", "127.0.0.1"))
      const port = Number(parsed.port || (parsed.protocol === "https:" ? 443 : 80))
      beginReadinessCheck(managed, parsed.origin, port, "El servidor local no respondió por HTTP.")
      return
    } catch {
      // ignore URL parsing error
    }
  }

  // Salida de python -m http.server ("Serving HTTP on 127.0.0.1 port 8000").
  const pythonMatch = PYTHON_SERVING_RE.exec(chunk)
  if (pythonMatch) {
    const port = Number(pythonMatch[1])
    beginReadinessCheck(managed, `http://127.0.0.1:${port}`, port, "El servidor estático no respondió por HTTP.")
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

function scheduleReadinessTimeout(managed: Managed) {
  if (!isStarting(managed)) return
  const timer = setTimeout(() => {
    if (!isStarting(managed)) return
    setStatus(managed, {
      status: "error",
      errorMessage:
        "El servidor de desarrollo no publicó una URL HTTP local. Añade un script que anuncie su URL o configura tiancode.preview.json.",
    })
  }, READY_TIMEOUT_MS)
  managed.readyTimer = timer
  timer.unref()
}

function clearReadyTimer(managed: Managed) {
  if (managed.readyTimer) clearTimeout(managed.readyTimer)
  managed.readyTimer = null
}

async function spawnServer(managed: Managed) {
  const { packageManager } = managed.detected
  const isWin = process.platform === "win32"
  setStatus(managed, {
    status: "starting",
    url: null,
    port: null,
    errors: [],
    errorMessage: null,
    startedAt: Date.now(),
  })

  // Proyecto estático: python -m http.server en un puerto libre que
  // controlamos nosotros (el framework elige su propio puerto). Ojo: en
  // Windows, python no emite su mensaje de arranque por los pipes cuando lo
  // lanza node/bun, así que el readiness se resuelve escaneando el puerto.
  const targetDir = managed.detected.workingDirectory && managed.detected.workingDirectory !== "."
    ? join(managed.directory, managed.detected.workingDirectory)
    : managed.directory

  if (packageManager === "bare-jsx") {
    const entry = managed.detected.entry
    if (!entry) {
      setStatus(managed, { status: "error", errorMessage: "No se encontró una entrada JSX/TSX válida." })
      return
    }
    const port = await findFreePort(managed.detected.port)
    if (port === null) {
      setStatus(managed, { status: "error", errorMessage: "No hay puertos libres para la vista previa JSX." })
      return
    }
    try {
      const preview = await startBareJsxPreview(targetDir, entry, port)
      managed.bareJsx = preview
      preview.server.on("error", (error) => {
        setStatus(managed, { status: "error", errorMessage: error.message })
      })
      preview.server.on("close", () => {
        managed.bareJsx = null
        if (managed.state.status === "starting" || managed.state.status === "ready") setStatus(managed, { status: "stopped" })
      })
      if (await respondsToHttp(preview.url)) {
        setStatus(managed, { url: preview.url, port, status: "ready", errorMessage: null })
      } else {
        beginReadinessCheck(managed, preview.url, port, "La vista previa JSX no respondio por HTTP.")
      }
    } catch (error) {
      setStatus(managed, { status: "error", errorMessage: error instanceof Error ? error.message : String(error) })
    }
    return
  }

  if (packageManager === "static") {
    const localPort = await findFreePort(managed.detected.port)
    if (!localPort) {
      setStatus(managed, { status: "error", errorMessage: "No hay puertos libres para el servidor estatico." })
      return
    }
    try {
      const preview = await startStaticPreview(targetDir, localPort)
      managed.staticPreview = preview
      preview.server.on("error", (error) => {
        setStatus(managed, { status: "error", errorMessage: error.message })
      })
      preview.server.on("close", () => {
        managed.staticPreview = null
        if (managed.state.status === "starting" || managed.state.status === "ready") setStatus(managed, { status: "stopped" })
      })
      if (await respondsToHttp(preview.url)) {
        setStatus(managed, { url: preview.url, port: localPort, status: "ready", errorMessage: null })
      } else {
        beginReadinessCheck(managed, preview.url, localPort, "La vista previa estatica no respondio por HTTP.")
      }
      return
    } catch (error) {
      pushLog(managed, `El servidor estatico local fallo: ${error instanceof Error ? error.message : String(error)}`)
    }

    const port = (await findFreePort(managed.detected.port)) ?? -1
    if (port < 0) {
      setStatus(managed, { status: "error", errorMessage: "No hay puertos libres para el servidor estático." })
      return
    }
    const [command, ...prefix] = resolvePythonCommand()
    const child = spawn(command, [...prefix, "-m", "http.server", String(port), "--bind", "127.0.0.1", "--directory", targetDir], {
      env: scrubEnv(),
      detached: !isWin,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    })
    managed.process = child
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
    beginReadinessCheck(managed, `http://127.0.0.1:${port}`, port, "El servidor estático no respondió por HTTP.")
    return
  }

  if (packageManager === "custom") {
    const command = managed.detected.command
    const url = managed.detected.url
    const workingDirectory = managed.detected.workingDirectory
    if (!command || !url || !workingDirectory) {
      setStatus(managed, { status: "error", errorMessage: managed.detected.error ?? "El adaptador de preview no es valido." })
      return
    }
    const child = spawn(command[0], command.slice(1), {
      cwd: join(managed.directory, workingDirectory),
      env: scrubEnv(),
      detached: !isWin,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    })
    managed.process = child
    child.stdout?.on("data", (data: Buffer) => onOutput(managed, data.toString()))
    child.stderr?.on("data", (data: Buffer) => onOutput(managed, data.toString()))
    child.on("error", (error) => {
      setStatus(managed, { status: "error", errorMessage: error.message })
      clearReadyTimer(managed)
    })
    child.on("exit", () => {
      clearReadyTimer(managed)
      managed.process = null
      if (managed.state.status === "starting" || managed.state.status === "ready") setStatus(managed, { status: "stopped" })
    })
    beginReadinessCheck(managed, url, managed.detected.port, "El adaptador de preview no respondio por HTTP.")
    return
  }

  let execCmd: string
  let execArgs: string[]

  if (packageManager === "python") {
    const py = resolvePythonCommand()
    execCmd = py[0]
    const scriptParts = managed.detected.script.split(/\s+/).filter(Boolean)
    execArgs = [...py.slice(1), ...scriptParts]
  } else if (packageManager === "cargo") {
    execCmd = "cargo"
    execArgs = ["run"]
  } else if (packageManager === "trunk") {
    execCmd = "trunk"
    execArgs = ["serve"]
  } else if (packageManager === "go") {
    execCmd = "go"
    execArgs = ["run", "."]
  } else if (packageManager === "php") {
    execCmd = "php"
    execArgs = managed.detected.script.replace(/^php\s+/, "").split(/\s+/).filter(Boolean)
  } else if (packageManager === "bundle") {
    execCmd = "bundle"
    execArgs = managed.detected.script.replace(/^bundle\s+/, "").split(/\s+/).filter(Boolean)
  } else if (packageManager === "dotnet") {
    execCmd = "dotnet"
    execArgs = ["run"]
  } else if (packageManager === "deno") {
    execCmd = "deno"
    execArgs = managed.detected.script.replace(/^deno\s+/, "").split(/\s+/).filter(Boolean)
  } else if (packageManager === "maven" || packageManager === "gradle") {
    const parts = managed.detected.script.split(/\s+/).filter(Boolean)
    execCmd = parts[0]
    execArgs = parts.slice(1)
  } else {
    execCmd = packageManager
    execArgs = ["run", managed.detected.script]
  }

  const isDesktop = Boolean(managed.detected.isDesktop)

  let spawnCwd = targetDir
  let useShell = isWin

  if (managed.detected.executable) {
    const fullExe = resolve(targetDir, managed.detected.executable)
    if (existsSync(fullExe)) {
      execCmd = fullExe
      execArgs = []
      spawnCwd = dirname(fullExe)
      useShell = false
    }
  } else if (packageManager === "dotnet") {
    const foundExe = await findCompiledExecutable(targetDir)
    if (foundExe) {
      const fullExe = resolve(targetDir, foundExe)
      execCmd = fullExe
      execArgs = []
      spawnCwd = dirname(fullExe)
      useShell = false
    }
  } else if (packageManager === "cargo" && isDesktop) {
    const foundExe = await findCompiledExecutable(targetDir)
    if (foundExe) {
      const fullExe = resolve(targetDir, foundExe)
      execCmd = fullExe
      execArgs = []
      spawnCwd = dirname(fullExe)
      useShell = false
    }
  }

  // En Windows los gestores son .cmd o comandos de shell: shell:true los resuelve
  // (cmd.exe padre → taskkill /T mata todo el árbol). En Unix, detached + setsid
  // permite matar el grupo de procesos.
  const child = spawn(execCmd, execArgs, {
    cwd: spawnCwd,
    env: scrubEnv(),
    shell: useShell,
    detached: !isWin,
    windowsHide: !isDesktop,
    stdio: ["ignore", "pipe", "pipe"],
  })

  managed.process = child

  if (isDesktop) {
    setStatus(managed, {
      status: "ready",
      url: null,
      port: null,
      isDesktop: true,
      errorMessage: null,
    })
    child.stdout?.on("data", (data: Buffer) => onOutput(managed, data.toString()))
    child.stderr?.on("data", (data: Buffer) => onOutput(managed, data.toString()))
    child.on("error", (error) => {
      setStatus(managed, { status: "error", isDesktop: true, errorMessage: error.message })
    })
    child.on("exit", (code) => {
      managed.process = null
      if (managed.state.status === "starting" || managed.state.status === "ready") {
        setStatus(managed, {
          status: "stopped",
          isDesktop: true,
          errorMessage: code && code !== 0 ? `El proceso terminó con código ${code}` : null,
        })
      }
    })
    return
  }

  // Chequeo proactivo inmediato del puerto esperado mientras se escuchan logs
  if (managed.detected.port && managed.detected.port > 0) {
    beginReadinessCheck(
      managed,
      `http://127.0.0.1:${managed.detected.port}`,
      managed.detected.port,
      "El servidor de desarrollo no respondió por HTTP en el puerto esperado.",
    )
  }

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

  scheduleReadinessTimeout(managed)
}

const detectedStateCache = new Map<string, PreviewState>()

export async function detectPreviewState(directory: string): Promise<PreviewState> {
  const existing = servers.get(directory)
  if (existing) return existing.state
  const detected = await detectProject(directory)
  const state = idleState(detected)
  detectedStateCache.set(directory, state)
  return state
}

export function getPreviewState(directory: string): PreviewState {
  return servers.get(directory)?.state ?? detectedStateCache.get(directory) ?? idleState(null)
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
    state.errorMessage = "No se encontró un proyecto web (package.json con script, index.html o una entrada JSX/TSX convencional) en este directorio."
    return state
  }

  const managed: Managed = {
    directory,
    detected,
    process: null,
    bareJsx: null,
    staticPreview: null,
    state: idleState(detected),
    logs: [],
    readyTimer: null,
    readinessUrls: new Set(),
  }
  servers.set(directory, managed)
  await spawnServer(managed)
  return managed.state
}

export function stopPreviewServer(directory: string) {
  const managed = servers.get(directory)
  if (!managed) return idleState(null)
  if (managed.process) killTree(managed.process)
  managed.bareJsx?.close()
  managed.bareJsx = null
  managed.staticPreview?.close()
  managed.staticPreview = null
  clearReadyTimer(managed)
  managed.readinessUrls.clear()
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
