import { existsSync } from "node:fs"
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

async function registerServer(auth: SidecarAuth, entry: BundledMcp) {
  const dir = join(BUNDLED_ROOT, entry.dir)
  const script = join(dir, entry.script)
  const configFile = join(dir, entry.configFile)
  if (!existsSync(script)) return false
  const basic = Buffer.from(`${auth.username}:${auth.password}`).toString("base64")
  const res = await fetch(`${auth.url}/mcp`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Basic ${basic}` },
    body: JSON.stringify({
      name: entry.name,
      config: {
        type: "local",
        command: ["python", script],
        environment: { [entry.env]: configFile },
        enabled: true,
        timeout: 60000,
      },
    }),
  })
  return res.ok
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
