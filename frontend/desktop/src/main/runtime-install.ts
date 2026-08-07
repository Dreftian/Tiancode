import { app, BrowserWindow } from "electron"
import { existsSync } from "node:fs"
import { mkdir, open, rename, rm } from "node:fs/promises"
import { join } from "node:path"
import { spawn } from "node:child_process"
import { write as writeLog } from "./logging"

// Instalación local de runtimes de modelos (Ollama / LM Studio). El instalador
// oficial se descarga dentro de las carpetas de datos de Tiancode y se
// ejecuta en modo silencioso; los modelos se redirigen a las carpetas de
// Tiancode (OLLAMA_MODELS) para que ocupen espacio dentro de la app.

export type RuntimeKind = "ollama" | "lmstudio"

type RuntimeDef = {
  kind: RuntimeKind
  name: string
  url: string
  fileName: string
  silentArgs: string[]
  probeUrl: string
  launchPath: string[]
  modelsDir: string
}

const RUNTIMES: Record<RuntimeKind, RuntimeDef> = {
  ollama: {
    kind: "ollama",
    name: "Ollama",
    url: "https://ollama.com/download/OllamaSetup.exe",
    fileName: "OllamaSetup.exe",
    silentArgs: ["/S"],
    probeUrl: "http://localhost:11434/api/version",
    launchPath: [
      join(process.env.LOCALAPPDATA ?? "", "Programs", "Ollama", "ollama app.exe"),
      join(process.env.LOCALAPPDATA ?? "", "Programs", "Ollama", "ollama.exe"),
    ],
    modelsDir: "ollama-models",
  },
  lmstudio: {
    kind: "lmstudio",
    name: "LM Studio",
    url: "https://lmstudio.ai/download/bionic/latest/win32/x64",
    fileName: "LM-Studio-latest-x64.exe",
    silentArgs: ["/S"],
    probeUrl: "http://localhost:1234/v1/models",
    launchPath: [
      join(process.env.LOCALAPPDATA ?? "", "Programs", "LM Studio", "LM Studio.exe"),
      join(process.env.LOCALAPPDATA ?? "", "Programs", "LM-Studio", "LM Studio.exe"),
    ],
    modelsDir: "lmstudio-models",
  },
}

type InstallState =
  | { status: "idle" }
  | { status: "downloading"; progress: number }
  | { status: "installing" }
  | { status: "error"; error: string }

let state: InstallState = { status: "idle" }

export function getRuntimeInstallState() {
  return state
}

function report() {
  for (const win of BrowserWindow.getAllWindows()) {
    if (win.isDestroyed() || win.webContents.isDestroyed()) continue
    win.webContents.send("runtime-install-state", state)
  }
}

function runtimeDir() {
  return join(app.getPath("userData"), "runtime")
}

export async function installRuntime(kind: RuntimeKind): Promise<{ ok: boolean; error?: string }> {
  const def = RUNTIMES[kind]
  if (!def) return { ok: false, error: `Unknown runtime "${kind}"` }
  try {
    const dir = runtimeDir()
    await mkdir(dir, { recursive: true })
    const installer = join(dir, def.fileName)

    if (!existsSync(installer)) {
      state = { status: "downloading", progress: 0 }
      report()
      await downloadFile(def.url, installer, (progress) => {
        state = { status: "downloading", progress }
        report()
      })
    }

    state = { status: "installing" }
    report()
    writeLog("runtime", "installing", { kind: def.name, installer })

    const exitCode = await runSilent(installer, def.silentArgs)
    if (exitCode !== 0 && exitCode !== null) {
      const error = `Installer exited with code ${exitCode}`
      state = { status: "error", error }
      report()
      return { ok: false, error }
    }

    // Redirige los modelos de Ollama a las carpetas de Tiancode (best effort).
    if (kind === "ollama") {
      await setUserEnv("OLLAMA_MODELS", join(app.getPath("userData"), def.modelsDir)).catch((error) =>
        writeLog("runtime", "failed to set OLLAMA_MODELS", { error: String(error) }),
      )
    }

    // Si el runtime no responde tras la instalación silenciosa, lanza el
    // instalador en modo interactivo como respaldo (p. ej. LM Studio, cuyo
    // flag silencioso varía entre versiones).
    const reachable = await probeRuntime(def.probeUrl)
    if (!reachable) {
      writeLog("runtime", "silent install did not start the runtime; launching interactive", { kind: def.name })
      spawn(installer, [], { stdio: "ignore", detached: true, windowsHide: false }).unref()
    } else {
      launchRuntime(def).catch(() => {})
    }

    state = { status: "idle" }
    report()
    writeLog("runtime", "installed", { kind: def.name })
    return { ok: true }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    state = { status: "error", error: message }
    report()
    writeLog("runtime", "install failed", { kind: def.name, error: message }, "error")
    return { ok: false, error: message }
  }
}

async function downloadFile(url: string, dest: string, onProgress: (progress: number) => void) {
  const res = await fetch(url, { redirect: "follow" })
  if (!res.ok || !res.body) throw new Error(`GET ${url} failed: HTTP ${res.status}`)
  const part = `${dest}.part`
  await rm(part, { force: true })
  const handle = await open(part, "w")
  const total = Number(res.headers.get("content-length") ?? 0)
  let loaded = 0
  try {
    for await (const chunk of res.body as AsyncIterable<Uint8Array>) {
      await handle.write(chunk)
      loaded += chunk.length
      if (total > 0) onProgress(Math.round((loaded / total) * 100))
    }
    await handle.sync()
  } finally {
    await handle.close()
  }
  await rename(part, dest)
}

function runSilent(installer: string, args: string[]): Promise<number | null> {
  return new Promise((resolve, reject) => {
    const child = spawn(installer, args, { stdio: "ignore", detached: true, windowsHide: true })
    child.once("error", reject)
    child.once("exit", (code) => resolve(code))
    // El instalador puede lanzar la app y salir de inmediato; en ese caso el
    // proceso padre termina pero la instalación continúa en segundo plano.
    child.unref()
    setTimeout(() => resolve(null), 45_000).unref()
  })
}

// setx persiste la variable de entorno del usuario; la app de Ollama la lee
// en su próximo arranque.
function setUserEnv(name: string, value: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn("setx", [name, value], { stdio: "ignore", windowsHide: true })
    child.once("error", reject)
    child.once("exit", (code) => (code === 0 ? resolve() : reject(new Error(`setx exited with code ${code}`))))
  })
}

async function probeRuntime(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(2500) })
    return res.ok
  } catch {
    return false
  }
}

function launchRuntime(def: RuntimeDef): Promise<void> {
  for (const candidate of def.launchPath) {
    if (!existsSync(candidate)) continue
    return new Promise((resolve, reject) => {
      const child = spawn(candidate, [], { stdio: "ignore", detached: true, windowsHide: true })
      child.once("error", reject)
      child.once("spawn", () => resolve())
      child.unref()
    })
  }
  return Promise.resolve()
}
