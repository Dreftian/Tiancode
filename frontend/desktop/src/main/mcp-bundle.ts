import { existsSync, readdirSync } from "node:fs"
import { execFileSync } from "node:child_process"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { app } from "electron"

// Servidores MCP que viajan empaquetados con la app (resources/mcp). En cada
// arranque se registran en la config global apuntando a la ruta real del
// binario (instalado o portable), reemplazando entradas cuyo script ya no
// existe (p. ej. rutas viejas del escritorio).
const moduleRoot = dirname(fileURLToPath(import.meta.url))
const BUNDLED_ROOT = app.isPackaged
  ? join(process.resourcesPath, "mcp")
  : join(moduleRoot, "../../resources/mcp")

type BundledMcp = {
  name: string
  dir: string
  script: string
  configFile: string
  env: string
}

const BUNDLED_MCPS: BundledMcp[] = [
  { name: "live_frontend", dir: "AI-LIVE-FRONTEND-MCP", script: "live_server.py", configFile: "config.json", env: "LIVE_FRONTEND_CONFIG" },
  { name: "photoshop", dir: "AI-MCP-SUITE/Photoshop", script: "server.py", configFile: "config.json", env: "MCP_CONFIG" },
  { name: "indesign", dir: "AI-MCP-SUITE/InDesign", script: "server.py", configFile: "config.json", env: "MCP_CONFIG" },
  { name: "illustrator", dir: "AI-MCP-SUITE/Illustrator", script: "server.py", configFile: "config.json", env: "MCP_CONFIG" },
  { name: "coreldraw", dir: "AI-MCP-SUITE/CorelDRAW", script: "server.py", configFile: "config.json", env: "MCP_CONFIG" },
  { name: "opera_gx", dir: "AI-MCP-SUITE/OperaGX", script: "server.py", configFile: "config.json", env: "MCP_CONFIG" },
  { name: "unreal_cli", dir: "AI-MCP-SUITE/GameDev/UnrealEngine", script: "server.py", configFile: "config.json", env: "MCP_CONFIG" },
  { name: "unity", dir: "AI-MCP-SUITE/GameDev/Unity", script: "server.py", configFile: "config.json", env: "MCP_CONFIG" },
  { name: "godot", dir: "AI-MCP-SUITE/GameDev/Godot", script: "server.py", configFile: "config.json", env: "MCP_CONFIG" },
  { name: "android_studio", dir: "AI-MCP-SUITE/AndroidStudio", script: "server.py", configFile: "config.json", env: "MCP_CONFIG" },
]

type SidecarAuth = { url: string; username: string; password: string }

// En Windows, `python` del PATH suele ser el stub de Microsoft Store
// (WindowsApps\python.exe), que no ejecuta nada y deja los servidores MCP
// sin responder. Se resuelve un intérprete REAL: primero el launcher `py -3`
// (devuelve el Python instalado) y luego las rutas estándar de python.org.
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

async function registerServer(auth: SidecarAuth, entry: BundledMcp) {
  const dir = join(BUNDLED_ROOT, entry.dir)
  const script = join(dir, entry.script)
  const configFile = join(dir, entry.configFile)
  // Upsert SIEMPRE (el POST /mcp reemplaza la entrada con el mismo nombre):
  // una config vieja puede apuntar a un script del repo que todavía existe o
  // a "python" del PATH (stub de la Store), y en ambos casos quedaría rota
  // si solo se corrigiese cuando el script falta.
  const basic = Buffer.from(`${auth.username}:${auth.password}`).toString("base64")
  const body = JSON.stringify({
    name: entry.name,
    config: {
      type: "local",
      command: [...resolvePythonCommand(), script],
      environment: { [entry.env]: configFile },
      enabled: true,
      timeout: 60000,
    },
  })
  // El sidecar tarda un par de segundos en aceptar HTTP tras el spawn; se
  // reintenta con backoff en vez de asumir que el primer POST llega.
  let lastStatus = 0
  for (let attempt = 0; attempt < 10; attempt++) {
    if (attempt > 0) await new Promise((resolve) => setTimeout(resolve, 500 * attempt))
    try {
      const res = await fetch(`${auth.url}/mcp`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Basic ${basic}` },
        body,
      })
      if (res.ok) {
        console.log(`[mcp-bundle] registered ${entry.name}`)
        return true
      }
      lastStatus = res.status
    } catch {
      lastStatus = 0
    }
  }
  console.warn(`[mcp-bundle] failed to register ${entry.name} (last status ${lastStatus})`)
  return false
}

// Registra los MCP empaquetados. Se llama justo después de que el sidecar esté
// listo; los fallos no bloquean el arranque.
export async function seedBundledMcpServers(auth: SidecarAuth) {
  if (!existsSync(BUNDLED_ROOT)) return
  await Promise.all(
    BUNDLED_MCPS.map((entry) =>
      registerServer(auth, entry).catch(() => false),
    ),
  )
}
