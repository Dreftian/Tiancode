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

// Servidores MCP empaquetados con la app. live_frontend se registra como Core
// para la vista previa en vivo, y los servidores especializados de la suite
// (Photoshop, InDesign, Illustrator, CorelDRAW, OperaGX, Unreal, Unity, Godot, Android Studio)
// se registran para que el usuario pueda activarlos y usarlos con 1 clic.
const BUNDLED_MCPS: BundledMcp[] = [
  { name: "live_frontend", dir: "AI-LIVE-FRONTEND-MCP", script: "live_server.py", configFile: "config.json", env: "LIVE_FRONTEND_CONFIG" },
  { name: "photoshop", dir: "AI-MCP-SUITE/Photoshop", script: "server.py", configFile: "config.json", env: "PHOTOSHOP_CONFIG" },
  { name: "indesign", dir: "AI-MCP-SUITE/InDesign", script: "server.py", configFile: "config.json", env: "INDESIGN_CONFIG" },
  { name: "illustrator", dir: "AI-MCP-SUITE/Illustrator", script: "server.py", configFile: "config.json", env: "ILLUSTRATOR_CONFIG" },
  { name: "coreldraw", dir: "AI-MCP-SUITE/CorelDRAW", script: "server.py", configFile: "config.json", env: "CORELDRAW_CONFIG" },
  { name: "opera_gx", dir: "AI-MCP-SUITE/OperaGX", script: "server.py", configFile: "config.json", env: "OPERAGX_CONFIG" },
  { name: "unreal_cli", dir: "AI-MCP-SUITE/GameDev/UnrealEngine", script: "server.py", configFile: "config.json", env: "UNREAL_CONFIG" },
  { name: "unity", dir: "AI-MCP-SUITE/GameDev/Unity", script: "server.py", configFile: "config.json", env: "UNITY_CONFIG" },
  { name: "godot", dir: "AI-MCP-SUITE/GameDev/Godot", script: "server.py", configFile: "config.json", env: "GODOT_CONFIG" },
  { name: "android_studio", dir: "AI-MCP-SUITE/AndroidStudio", script: "server.py", configFile: "config.json", env: "ANDROIDSTUDIO_CONFIG" },
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

// Los bundles son integraciones opcionales: una entrada existente conserva la
// decisión del usuario, mientras que una instalación nueva los registra
// desactivados. Así no se levantan diez procesos Python sólo por abrir la app.
async function bundledEnabled(auth: SidecarAuth, name: string): Promise<boolean | undefined> {
  const basic = Buffer.from(`${auth.username}:${auth.password}`).toString("base64")
  try {
    const res = await fetch(`${auth.url}/config`, {
      headers: { authorization: `Basic ${basic}` },
    })
    if (!res.ok) return undefined
    const info = (await res.json()) as { mcp?: Record<string, { enabled?: boolean }> }
    const existing = info.mcp?.[name]
    return existing ? existing.enabled !== false : undefined
  } catch {
    return undefined
  }
}

async function registerServer(auth: SidecarAuth, entry: BundledMcp) {
  const enabled = await bundledEnabled(auth, entry.name)
  if (enabled === false) {
    console.log(`[mcp-bundle] ${entry.name} already disabled, skipping`)
    return true
  }
  const dir = join(BUNDLED_ROOT, entry.dir)
  const script = join(dir, entry.script)
  const configFile = join(dir, entry.configFile)
  // Upsert SIEMPRE (el POST /mcp reemplaza la entrada con el mismo nombre):
  // una config vieja puede apuntar a un script del repo que todavía existe o
  // a "python" del PATH (stub de la Store), y en ambos casos quedaría rota
  // si solo se corrigiese cuando el script falta.
  const basic = Buffer.from(`${auth.username}:${auth.password}`).toString("base64")
  // Orígenes con permiso de CORS en el dashboard del live_frontend (lectura de
  // /preview): el renderer empaquetado (oc://renderer, default del servidor) y,
  // en desarrollo, el servidor de Vite.
  const liveOrigins = [
    "oc://renderer",
    ...(() => {
      const devUrl = process.env.ELECTRON_RENDERER_URL
      return devUrl && URL.canParse(devUrl) ? [new URL(devUrl).origin] : []
    })(),
  ].join(",")
  const body = JSON.stringify({
    name: entry.name,
    config: {
      type: "local",
      command: [...resolvePythonCommand(), script],
      environment: {
        [entry.env]: configFile,
        ...(entry.name === "live_frontend" ? { LIVE_FRONTEND_ALLOWED_ORIGIN: liveOrigins } : {}),
      },
      enabled: enabled ?? false,
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
        console.log(`[mcp-bundle] registered ${entry.name}${enabled ? "" : " (disabled by default)"}`)
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

// Purga servidores MCP residuales que apunten a scripts temporales que ya no existen
async function pruneStaleTempServers(auth: SidecarAuth) {
  const basic = Buffer.from(`${auth.username}:${auth.password}`).toString("base64")
  try {
    const res = await fetch(`${auth.url}/config`, {
      headers: { authorization: `Basic ${basic}` },
    })
    if (!res.ok) return
    const info = (await res.json()) as { mcp?: Record<string, { type?: string; command?: string | string[] }> }
    if (!info.mcp) return

    for (const [name, cfg] of Object.entries(info.mcp)) {
      if (cfg?.type === "local" && cfg.command) {
        const cmdParts = Array.isArray(cfg.command) ? cfg.command : [cfg.command]
        const scriptArg = cmdParts.find((part) => /\\AppData\\Local\\Temp\\|\\Temp\\/i.test(part) && /\.py$/i.test(part))
        if (scriptArg && !existsSync(scriptArg)) {
          console.log(`[mcp-bundle] Pruning stale temp MCP server: ${name} (${scriptArg})`)
          try {
            await fetch(`${auth.url}/mcp/${encodeURIComponent(name)}`, {
              method: "DELETE",
              headers: { authorization: `Basic ${basic}` },
            })
          } catch {
            // best-effort
          }
        }
      }
    }
  } catch {
    // best-effort
  }
}

// Registra los MCP empaquetados. Se llama justo después de que el sidecar esté
// listo; los fallos no bloquean el arranque. SECUENCIAL: cada POST /mcp hace
// un read-modify-write de la config global del sidecar, y lanzarlos en
// paralelo puede corromper el archivo.
export async function seedBundledMcpServers(auth: SidecarAuth) {
  await pruneStaleTempServers(auth).catch(() => {})
  if (!existsSync(BUNDLED_ROOT)) return
  for (const entry of BUNDLED_MCPS) {
    await registerServer(auth, entry).catch(() => false)
  }
}
