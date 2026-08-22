import { ButtonV2 } from "@tiancode-ai/ui/v2/button-v2"
import { SelectV2 } from "@tiancode-ai/ui/v2/select-v2"
import { Switch } from "@tiancode-ai/ui/v2/switch-v2"
import { TextInputV2 } from "@tiancode-ai/ui/v2/text-input-v2"
import { TextareaV2 } from "@tiancode-ai/ui/v2/textarea-v2"
import type { McpLocalConfig, McpOAuthConfig, McpRemoteConfig, McpStatus } from "@tiancode-ai/sdk/v2/client"
import {
  type Component,
  createResource,
  For,
  Show,
  createSignal,
  createMemo,
  createEffect,
  onMount,
  onCleanup,
} from "solid-js"
import { useLanguage } from "@/context/language"
import { SettingsPagerV2 } from "./parts/pager"
import { useServerSDK } from "@/context/server-sdk"
import { showToast } from "@/utils/toast"
import { SettingsListV2 } from "./parts/list"
import { SettingsRowV2 } from "./parts/row"
import { formatMcpCommand, parseMcpCommand } from "./mcp-command"
import {
  connectableProfileServers,
  healthSnapshot,
  McpProfiles,
  MCP_OPERATION_CONCURRENCY,
  MCP_OPERATION_LIMIT,
  profileServers,
  runBoundedMcpOperations,
} from "./mcp-health"
import "./mcp-servers.css"

type McpConfigValue = McpLocalConfig | McpRemoteConfig | { enabled: boolean }

// Config entries may only carry `{ enabled }` (the server command lives in an
// outer layer), so narrow the union before touching type-specific fields.
const isConfiguredServer = (config: McpConfigValue): config is McpLocalConfig | McpRemoteConfig =>
  "type" in config && (config.type === "local" || config.type === "remote")

const TypeOptions: { id: "local" | "remote"; label: string }[] = [
  { id: "local", label: "settings.mcpServers.type.local" },
  { id: "remote", label: "settings.mcpServers.type.remote" },
]

const PresetDefinitions: { id: string; labelKey: string; command: string }[] = [
  {
    id: "filesystem",
    labelKey: "settings.mcpServers.presets.filesystem",
    command: "npx -y @modelcontextprotocol/server-filesystem .",
  },
  { id: "fetch", labelKey: "settings.mcpServers.presets.fetch", command: "npx -y @modelcontextprotocol/server-fetch" },
  { id: "context7", labelKey: "settings.mcpServers.presets.context7", command: "npx -y @upstash/context7-mcp" },
  { id: "firecrawl", labelKey: "settings.mcpServers.presets.firecrawl", command: "npx -y firecrawl-mcp" },
  { id: "sentry", labelKey: "settings.mcpServers.presets.sentry", command: "npx -y @sentry/mcp-server" },
  { id: "supabase", labelKey: "settings.mcpServers.presets.supabase", command: "npx -y @supabase/mcp-server-supabase" },
  { id: "postgres", labelKey: "settings.mcpServers.presets.postgres", command: "npx -y @modelcontextprotocol/server-postgres" },
  { id: "sqlite", labelKey: "settings.mcpServers.presets.sqlite", command: "npx -y @modelcontextprotocol/server-sqlite ." },
  { id: "duckdb", labelKey: "settings.mcpServers.presets.duckdb", command: "npx -y duckdb-mcp" },
  { id: "redis", labelKey: "settings.mcpServers.presets.redis", command: "npx -y @modelcontextprotocol/server-redis" },
  { id: "figma", labelKey: "settings.mcpServers.presets.figma", command: "npx -y figma-developer-mcp" },
  { id: "docker", labelKey: "settings.mcpServers.presets.docker", command: "npx -y docker-mcp" },
  { id: "mem0", labelKey: "settings.mcpServers.presets.mem0", command: "npx -y mem0-mcp" },
  { id: "brave-search", labelKey: "settings.mcpServers.presets.braveSearch", command: "npx -y @modelcontextprotocol/server-brave-search" },
  { id: "e2b", labelKey: "settings.mcpServers.presets.e2b", command: "npx -y @e2b/mcp-server" },
  { id: "postman", labelKey: "settings.mcpServers.presets.postman", command: "npx -y @postman/postman-mcp-server" },
  { id: "memory", labelKey: "settings.mcpServers.presets.memory", command: "npx -y @modelcontextprotocol/server-memory" },
  {
    id: "sequential-thinking",
    labelKey: "settings.mcpServers.presets.sequentialThinking",
    command: "npx -y @modelcontextprotocol/server-sequential-thinking",
  },
  { id: "time", labelKey: "settings.mcpServers.presets.time", command: "npx -y @modelcontextprotocol/server-time" },
  { id: "playwright", labelKey: "settings.mcpServers.presets.playwright", command: "npx -y @playwright/mcp@latest" },
  { id: "notebooklm", labelKey: "settings.mcpServers.presets.notebooklm", command: "npx -y notebooklm-mcp@latest" },
  { id: "git", labelKey: "settings.mcpServers.presets.git", command: "npx -y @modelcontextprotocol/server-git" },
]

// Catalog of popular verified MCP servers shown under "Discover".
type DiscoverPreset =
  | {
      id: string
      name?: string
      description?: string
      type: "local"
      command: string
      args?: string[]
      cwd?: string
      environment?: Record<string, string>
      requiresKey?: boolean
      requiresSetup?: boolean
    }
  | {
      id: string
      name?: string
      description?: string
      type: "remote"
      url: string
      requiresKey?: boolean
      requiresSetup?: boolean
    }

const DiscoverPresets: DiscoverPreset[] = [
  {
    id: "playwright",
    name: "Playwright",
    description: "Automatización de navegadores y pruebas de extremo a extremo.",
    type: "local",
    command: "npx -y @playwright/mcp@latest",
  },
  {
    id: "notebooklm",
    name: "Google NotebookLM",
    description: "Investigación grounded en tus cuadernos de NotebookLM con citas y generación de audio.",
    type: "local",
    command: "npx -y notebooklm-mcp@latest",
  },
  {
    id: "chrome-devtools",
    name: "Chrome DevTools",
    description: "Inspecciona, depura y automatiza páginas de Chrome.",
    type: "local",
    command: "npx -y chrome-devtools-mcp@latest",
  },
  {
    id: "node-repl",
    name: "Node REPL",
    description: "Ejecuta JavaScript en una sesión REPL de Node.js.",
    type: "local",
    command: "npx -y repl-mcp@latest",
  },
  {
    id: "context7",
    name: "Context7",
    description: "Documentación actualizada de librerías y frameworks populares.",
    type: "local",
    command: "npx -y @upstash/context7-mcp",
  },
  {
    id: "sequential-thinking",
    name: "Pensamiento Secuencial",
    description: "Razonamiento y resolución dinámica de problemas complejos paso a paso.",
    type: "local",
    command: "npx -y @modelcontextprotocol/server-sequential-thinking",
  },
  {
    id: "memory",
    name: "Memoria del Proyecto",
    description: "Grafo de conocimiento persistente para recordar entidades y relaciones.",
    type: "local",
    command: "npx -y @modelcontextprotocol/server-memory",
  },
  {
    id: "fetch",
    name: "Web Fetch MCP",
    description: "Descarga, procesa y convierte contenido web a markdown optimizado.",
    type: "local",
    command: "npx -y @modelcontextprotocol/server-fetch",
  },
  {
    id: "time",
    name: "Fecha y Hora MCP",
    description: "Conversión de zonas horarias y consulta de tiempo exacto.",
    type: "local",
    command: "npx -y @modelcontextprotocol/server-time",
  },
  {
    id: "live_frontend",
    name: "Live Frontend Sandbox",
    description: "Servidor MCP Core: vista previa de código en vivo y servidor interactivo.",
    type: "local",
    command: "python resources/mcp/AI-LIVE-FRONTEND-MCP/live_server.py",
  },
  {
    id: "opera_gx",
    name: "Opera GX Controller",
    description: "Automatización y navegación directa en navegador Opera GX.",
    type: "local",
    command: "python resources/mcp/AI-MCP-SUITE/OperaGX/server.py",
  },
  {
    id: "godot",
    name: "Godot Engine MCP",
    description: "Control de nodos, scripts GDScript y escenas de Godot Engine.",
    type: "local",
    command: "python resources/mcp/AI-MCP-SUITE/GameDev/Godot/server.py",
  },
  {
    id: "unity",
    name: "Unity Engine MCP",
    description: "Automatización de componentes, GameObjects y scripts C# en Unity.",
    type: "local",
    command: "python resources/mcp/AI-MCP-SUITE/GameDev/Unity/server.py",
  },
  {
    id: "unreal_cli",
    name: "Unreal Engine CLI",
    description: "Gestión de Blueprints, C++ y assets de Unreal Engine.",
    type: "local",
    command: "python resources/mcp/AI-MCP-SUITE/GameDev/UnrealEngine/server.py",
  },
  {
    id: "android_studio",
    name: "Android Studio MCP",
    description: "Compilación Gradle, emuladores AVD y testing en Android Studio.",
    type: "local",
    command: "python resources/mcp/AI-MCP-SUITE/AndroidStudio/server.py",
  },
  {
    id: "photoshop",
    name: "Photoshop Suite",
    description: "Control de capas, exportación de assets y filtros en Adobe Photoshop.",
    type: "local",
    command: "python resources/mcp/AI-MCP-SUITE/Photoshop/server.py",
  },
  {
    id: "illustrator",
    name: "Adobe Illustrator",
    description: "Generación y manipulación de vectores y mesas de trabajo.",
    type: "local",
    command: "python resources/mcp/AI-MCP-SUITE/Illustrator/server.py",
  },
  {
    id: "agent-vision",
    name: "Agent Vision",
    description: "Da visión a modelos sin ella: analiza imágenes, capturas y documentos (OCR).",
    type: "local",
    command: "npx -y @kitlau/agent-vision-mcp",
    requiresKey: true,
  },
  {
    id: "sentry",
    name: "Sentry Error Tracer",
    description: "Inspecciona trazas de error, excepciones y contexto de depuración en vivo.",
    type: "local",
    command: "npx -y @sentry/mcp-server",
    requiresKey: true,
  },
  {
    id: "firecrawl",
    name: "Firecrawl Web Scraper",
    description: "Rastreo y extracción profunda de sitios web completos a Markdown limpio.",
    type: "local",
    command: "npx -y firecrawl-mcp",
    requiresKey: true,
  },
  {
    id: "supabase",
    name: "Supabase DB Manager",
    description: "Consultas SQL, inspección de esquemas y gestión de proyectos Supabase.",
    type: "local",
    command: "npx -y @supabase/mcp-server-supabase",
    requiresKey: true,
  },
  {
    id: "postgres",
    name: "PostgreSQL Database",
    description: "Inspección de tablas, esquemas y ejecución de consultas SQL en Postgres.",
    type: "local",
    command: "npx -y @modelcontextprotocol/server-postgres postgresql://localhost/mydb",
  },
  {
    id: "sqlite",
    name: "SQLite Local DB",
    description: "Consultas y análisis SQL ultrarrápido sobre archivos de base de datos SQLite locales.",
    type: "local",
    command: "npx -y @modelcontextprotocol/server-sqlite .",
  },
  {
    id: "duckdb",
    name: "DuckDB Analytics",
    description: "Motor OLAP embebido en memoria para consultas analíticas sobre Parquet y CSV.",
    type: "local",
    command: "npx -y duckdb-mcp",
  },
  {
    id: "redis",
    name: "Redis Cache & KV",
    description: "Lectura y escritura en almacén clave-valor para depurar caché y sesiones.",
    type: "local",
    command: "npx -y @modelcontextprotocol/server-redis redis://localhost:6379",
  },
  {
    id: "figma",
    name: "Figma Design-to-Code",
    description: "Extrae componentes, tokens de diseño y CSS directamente de archivos de Figma.",
    type: "local",
    command: "npx -y figma-developer-mcp",
    requiresKey: true,
  },
  {
    id: "docker",
    name: "Docker Container Engine",
    description: "Inspecciona contenedores locales, imágenes activas y logs de Docker.",
    type: "local",
    command: "npx -y docker-mcp",
  },
  {
    id: "mem0",
    name: "Mem0 Persistent Memory",
    description: "Memoria de largo plazo persistente para recordar proyectos entre sesiones.",
    type: "local",
    command: "npx -y mem0-mcp",
    requiresKey: true,
  },
  {
    id: "brave-search",
    name: "Brave Web Search",
    description: "Búsqueda web en vivo y privada para investigación técnica.",
    type: "local",
    command: "npx -y @modelcontextprotocol/server-brave-search",
    requiresKey: true,
  },
  {
    id: "e2b",
    name: "E2B Code Sandbox",
    description: "Ejecución segura de código y notebooks en sandboxes aislados en la nube.",
    type: "local",
    command: "npx -y @e2b/mcp-server",
    requiresKey: true,
  },
  {
    id: "postman",
    name: "Postman API Hub",
    description: "Ejecuta peticiones, colecciones e importa especificaciones OpenAPI.",
    type: "local",
    command: "npx -y @postman/postman-mcp-server",
    requiresKey: true,
  },
  {
    id: "semgrep",
    name: "Semgrep Security Scan",
    description: "Análisis estático de seguridad y detección de vulnerabilidades en el código.",
    type: "local",
    command: "npx -y mcp-server-semgrep",
  },
  {
    id: "aikido",
    name: "Aikido",
    description: "Analiza código y dependencias en busca de vulnerabilidades.",
    type: "local",
    command: "npx -y @aikidosec/mcp",
    requiresKey: true,
  },
]

// Servers are grouped by status (Connected, Errors, Require Key, Disabled,
// Unknown) in this order; groups with no members are omitted. Los servidores
// del catálogo que necesitan una clave API no se muestran en "Desactivados":
// van a su propio grupo informativo.
type GroupKey = "connected" | "errors" | "requiresKey" | "disabled" | "unknown"

// Presets del catálogo por id, para saber qué servidor "requiere clave".
const presetById = new Map(DiscoverPresets.map((preset) => [preset.id, preset]))

const statusGroup = (name: string, status: McpStatus | undefined): GroupKey => {
  switch (status?.status) {
    case "connected":
      return "connected"
    case "failed":
    case "needs_auth":
    case "needs_client_registration":
      return "errors"
    case "disabled":
      return presetById.get(name)?.requiresKey ? "requiresKey" : "disabled"
    default:
      return "unknown"
  }
}

const GroupLabels: Record<GroupKey, string> = {
  connected: "settings.mcpServers.group.connected",
  errors: "settings.mcpServers.group.errors",
  requiresKey: "settings.mcpServers.group.requiresKey",
  disabled: "settings.mcpServers.group.disabled",
  unknown: "settings.mcpServers.group.unknown",
}

const GroupOrder: GroupKey[] = ["connected", "errors", "requiresKey", "disabled", "unknown"]

// The SDK serializes some numeric fields as "NaN"/"Infinity" strings; only
// real numbers should be shown as a tool count.
const connectedToolCount = (status: McpStatus | undefined): number | undefined => {
  if (status?.status !== "connected") return undefined
  const count = Number(status.tools)
  return Number.isFinite(count) ? count : undefined
}

// The SDK serializes some numeric fields as "NaN"/"Infinity" strings; only
// real numbers should reach the config. An empty field must stay undefined
// (Number("") is 0, and timeout 0 is rejected by the API as non-positive).
const asNumber = (value: string): number | undefined => {
  const trimmed = value.trim()
  if (trimmed === "") return undefined
  const parsed = Number(trimmed)
  return Number.isFinite(parsed) ? parsed : undefined
}

const parsePairs = (text: string) =>
  text.split("\n").reduce<Record<string, string>>((pairs, line) => {
    const trimmed = line.trim()
    const index = trimmed.indexOf("=")
    if (index > 0) pairs[trimmed.slice(0, index).trim()] = trimmed.slice(index + 1).trim()
    return pairs
  }, {})

const pairsToText = (pairs: Record<string, string> | undefined) =>
  pairs ? Object.entries(pairs).map(([key, value]) => `${key}=${value}`).join("\n") : ""

export const SettingsMcpServersV2: Component<{
  directory?: string
}> = (props) => {
  const language = useLanguage()
  const serverSdk = useServerSDK()
  const [name, setName] = createSignal("")
  const [type, setType] = createSignal<"local" | "remote">("local")
  const [command, setCommand] = createSignal("")
  const [environment, setEnvironment] = createSignal("")
  const [cwd, setCwd] = createSignal("")
  const [timeout, setTimeoutValue] = createSignal("")
  const [url, setUrl] = createSignal("")
  const [headers, setHeaders] = createSignal("")
  const [oauth, setOAuth] = createSignal(false)
  const [presetId, setPresetId] = createSignal<string | undefined>(undefined)
  const [editing, setEditing] = createSignal<string | undefined>(undefined)
  const [saving, setSaving] = createSignal(false)
  const [message, setMessage] = createSignal<"success" | "error" | undefined>(undefined)
  const [search, setSearch] = createSignal("")
  const [healthAction, setHealthAction] = createSignal<string | undefined>(undefined)

  const params = () => (props.directory ? { directory: props.directory } : undefined)

  // Config y estado por separado: el poll de estado (10 s) no re-renderiza la
  // config ni remonta filas; solo actualiza los indicadores en vivo.
  const [configData, { refetch: refetchConfig }] = createResource(
    async () => {
      const result = await serverSdk().client.config.get(params())
      return result.data ?? {}
    },
    { initialValue: {} as Record<string, unknown> },
  )
  const [statusData, { refetch: refetchStatus }] = createResource(
    async () => {
      const result = await serverSdk().client.mcp.status(params())
      return result.data ?? {}
    },
    { initialValue: {} as Record<string, McpStatus> },
  )
  const refetchAll = () => Promise.all([refetchConfig(), refetchStatus()])

  // Poll status so connection state and tool counts stay live while the
  // dialog is open; the interval is torn down with the component.
  onMount(() => {
    const interval = setInterval(() => void refetchStatus(), 10_000)
    onCleanup(() => clearInterval(interval))
  })

  const servers = createMemo(
    () => Object.entries((configData().mcp ?? {}) as Record<string, McpConfigValue>),
  )
  const configuredHealthServers = createMemo(() =>
    servers()
      .filter((entry): entry is [string, McpLocalConfig | McpRemoteConfig] => isConfiguredServer(entry[1]))
      .map(([serverName, config]) => ({ name: serverName, config, status: statusData()[serverName] })),
  )
  const health = createMemo(() => healthSnapshot(configuredHealthServers()))
  const editingConfig = createMemo(() => servers().find(([serverName]) => serverName === editing())?.[1])

  const visibleServers = createMemo(() => {
    const query = search().trim().toLowerCase()
    if (!query) return servers()
    return servers().filter(([serverName]) => serverName.toLowerCase().includes(query))
  })

  // Al cambiar la búsqueda se vuelve a la primera página de cada grupo.
  createEffect(() => {
    search()
    setGroupPages({})
  })

  // Paginación: cada grupo se pagina por separado para no perder la agrupación
  // por estado al pasar de página.
  const GROUP_PAGE_SIZE = 10
  const [groupPages, setGroupPages] = createSignal<Record<string, number>>({})
  const groupPage = (key: GroupKey) => Math.max(1, groupPages()[key] ?? 1)
  const setGroupPage = (key: GroupKey, page: number) =>
    setGroupPages((current) => ({ ...current, [key]: Math.max(1, page) }))
  const pageItems = (items: [string, McpConfigValue][], key: GroupKey) => {
    const total = Math.max(1, Math.ceil(items.length / GROUP_PAGE_SIZE))
    const page = Math.min(groupPage(key), total)
    const start = (page - 1) * GROUP_PAGE_SIZE
    return { items: items.slice(start, start + GROUP_PAGE_SIZE), page, total }
  }

  const groupedServers = createMemo(() =>
    GroupOrder.flatMap((key) => {
      const items = visibleServers()
        .filter(([serverName]) => statusGroup(serverName, statusData()[serverName]) === key)
        .sort(([a], [b]) => a.localeCompare(b))
      if (items.length === 0) return []
      const paged = pageItems(items, key)
      return [{ key, count: items.length, items: paged.items, page: paged.page, total: paged.total }]
    }),
  )

  // Paginación del catálogo Discover (grid de 5 columnas, 10 por página).
  const DISCOVER_PAGE_SIZE = 10
  const [discoverPage, setDiscoverPage] = createSignal(1)
  const discoverTotal = () => Math.max(1, Math.ceil(DiscoverPresets.length / DISCOVER_PAGE_SIZE))
  const discoverItems = createMemo(() => {
    const page = Math.min(discoverPage(), discoverTotal())
    const start = (page - 1) * DISCOVER_PAGE_SIZE
    return { items: DiscoverPresets.slice(start, start + DISCOVER_PAGE_SIZE), page, total: discoverTotal() }
  })

  const statusInfo = (status: McpStatus | undefined): { key: string; tone: string } => {
    switch (status?.status) {
      case "connected":
        return { key: "settings.mcpServers.status.connected", tone: "green" }
      case "disabled":
        return { key: "settings.mcpServers.status.disabled", tone: "muted" }
      case "failed":
        return { key: "settings.mcpServers.status.failed", tone: "red" }
      case "needs_auth":
        return { key: "settings.mcpServers.status.needs_auth", tone: "yellow" }
      case "needs_client_registration":
        return { key: "settings.mcpServers.status.needs_client_registration", tone: "yellow" }
      default:
        return { key: "settings.mcpServers.status.unknown", tone: "muted" }
    }
  }

  const timeoutEntry = () => {
    const value = asNumber(timeout())
    return value === undefined ? {} : { timeout: value }
  }

  const existingRemoteOAuth = (): McpOAuthConfig | undefined => {
    const config = editingConfig()
    if (!config || !isConfiguredServer(config) || config.type !== "remote") return undefined
    if (config.oauth === undefined || config.oauth === false) return undefined
    return config.oauth
  }

  const buildConfig = (): McpLocalConfig | McpRemoteConfig => {
    if (type() === "local") {
      const argv = parseMcpCommand(command())
      const env = parsePairs(environment())
      return {
        type: "local",
        command: argv,
        ...(Object.keys(env).length > 0 ? { environment: env } : {}),
        ...(cwd().trim() ? { cwd: cwd().trim() } : {}),
        ...timeoutEntry(),
      }
    }
    const headerPairs = parsePairs(headers())
    return {
      type: "remote",
      url: url().trim(),
      ...(Object.keys(headerPairs).length > 0 ? { headers: headerPairs } : {}),
      oauth: oauth() ? existingRemoteOAuth() ?? {} : false,
      ...timeoutEntry(),
    }
  }

  const resetForm = () => {
    setName("")
    setType("local")
    setCommand("")
    setEnvironment("")
    setCwd("")
    setTimeoutValue("")
    setUrl("")
    setHeaders("")
    setOAuth(false)
    setPresetId(undefined)
    setEditing(undefined)
  }

  const startEdit = (serverName: string, config: McpConfigValue) => {
    setEditing(serverName)
    setName(serverName)
    setPresetId(undefined)
    setTimeoutValue("timeout" in config && config.timeout !== undefined ? String(config.timeout) : "")
    if (!isConfiguredServer(config)) {
      setType("local")
      setCommand("")
      setEnvironment("")
      setCwd("")
      setUrl("")
      setHeaders("")
      setOAuth(false)
      return
    }
    if (config.type === "local") {
      setType("local")
      setCommand(formatMcpCommand(config.command))
      setEnvironment(pairsToText(config.environment))
      setCwd(config.cwd ?? "")
      setUrl("")
      setHeaders("")
      setOAuth(false)
      return
    }
    setType("remote")
    setCommand("")
    setEnvironment("")
    setCwd("")
    setUrl(config.url)
    setHeaders(pairsToText(config.headers))
    setOAuth(config.oauth !== false)
  }

  const submit = async () => {
    const serverName = name().trim()
    if (!serverName) return
    setSaving(true)
    setMessage(undefined)
    try {
      await serverSdk().client.mcp.add({ ...params(), name: serverName, config: buildConfig() })
      setMessage("success")
      void refetchAll()
    } catch {
      setMessage("error")
    } finally {
      setSaving(false)
    }
  }

  const toggleEnabled = async (serverName: string, config: McpConfigValue, enabled: boolean) => {
    setMessage(undefined)
    if (!isConfiguredServer(config)) {
      // Type-less stub (server defined in an outer layer): the backend ignores
      // it, so enabling would look dead. Open the editor to complete the config.
      if (enabled) startEdit(serverName, config)
      return
    }
    try {
      await serverSdk().client.mcp.add({ ...params(), name: serverName, config: { ...config, enabled } })
      void refetchAll()
    } catch {
      setMessage("error")
    }
  }

  // Adds a catalog server when enabled, or disables the existing entry
  // (mirroring toggleEnabled) when turned off. Re-enabling always sends the
  // full preset config with an explicit `enabled: true` so an entry that only
  // carries `{ enabled: false }` (created by a previous disable) is replaced
  // by a complete server definition instead of being left as a type-less stub.
  // Configuración completa de un preset local: args explícitos cuando existen
  // (rutas con espacios), cwd y environment opcionales.
  const presetLocalConfig = (preset: DiscoverPreset): McpLocalConfig => {
    if (preset.type !== "local") throw new Error("presetLocalConfig requires a local preset")
    return {
      type: "local",
      command: preset.args ?? parseMcpCommand(preset.command),
      ...(preset.cwd ? { cwd: preset.cwd } : {}),
      ...(preset.environment ? { environment: preset.environment } : {}),
      enabled: true,
    }
  }

  const toggleDiscover = async (preset: DiscoverPreset, enabled: boolean) => {
    setMessage(undefined)
    try {
      const existing = servers().find(([serverName]) => serverName === preset.id)?.[1]
      if (enabled) {
        const config: McpLocalConfig | McpRemoteConfig =
          preset.type === "local"
            ? presetLocalConfig(preset)
            : { type: "remote", url: preset.url, oauth: {}, enabled: true }
        const res = await serverSdk().client.mcp.add({ ...params(), name: preset.id, config })
        // Servidor OAuth: el alta termina en "needs_auth" (best-effort
        // connect); abrimos el flujo de autenticación directamente.
        const added = res.data?.[preset.id] ?? res.data
        if (added !== undefined && "status" in added && added.status === "needs_auth") void authenticate(preset.id)
      } else if (existing && isConfiguredServer(existing)) {
        await serverSdk().client.mcp.add({ ...params(), name: preset.id, config: { ...existing, enabled: false } })
      } else {
        await serverSdk().client.config.update({ ...params(), config: { mcp: { [preset.id]: { enabled: false } } } })
      }
      void refetchAll()
    } catch {
      setMessage("error")
    }
  }

  // Activa un conjunto de presets que estén desactivados o sin configurar:
  // cada uno se agrega con su configuración completa y enabled true
  // (best-effort connect), para que nada quede "desactivado" por defecto.
  // Los servidores OAuth quedan en "needs_auth" con su botón de autenticar.
  const connect = async (serverName: string) => {
    setMessage(undefined)
    try {
      await serverSdk().client.mcp.connect({ ...params(), name: serverName })
      void refetchAll()
    } catch {
      setMessage("error")
    }
  }

  // Inicia el flujo OAuth del servidor: el backend abre el navegador con la
  // URL de autorización y espera el callback local; al completarse, el
  // servidor queda conectado.
  const authenticate = async (serverName: string) => {
    setMessage(undefined)
    try {
      await serverSdk().client.mcp.auth.authenticate({ ...params(), name: serverName })
      void refetchAll()
    } catch {
      setMessage("error")
    }
  }

  const disconnect = async (serverName: string) => {
    setMessage(undefined)
    try {
      await serverSdk().client.mcp.disconnect({ ...params(), name: serverName })
      void refetchAll()
    } catch {
      setMessage("error")
    }
  }

  const finishHealthAction = async (results: Awaited<ReturnType<typeof runBoundedMcpOperations>>) => {
    await refetchAll()
    const failed = results.filter((result) => !result.ok).length
    if (failed > 0) {
      showToast({
        variant: "error",
        title: language.t("settings.mcpServers.health.partial", { succeeded: results.length - failed, failed }),
      })
      return
    }
    showToast({ variant: "success", title: language.t("settings.mcpServers.health.done", { count: results.length }) })
  }

  // A profile is a runtime-only selection: it only connects already configured
  // and enabled servers. It never adds a preset, writes a key, or changes an
  // enabled flag. Small batches avoid a burst of local runtime processes.
  const connectProfile = async (profile: (typeof McpProfiles)[number]) => {
    const names = connectableProfileServers(profile, configuredHealthServers()).map((server) => server.name)
    if (names.length === 0) return
    setHealthAction(`profile:${profile.id}`)
    try {
      const results = await runBoundedMcpOperations(
        names,
        async (serverName) => {
          await serverSdk().client.mcp.connect({ ...params(), name: serverName })
        },
        { concurrency: MCP_OPERATION_CONCURRENCY, limit: MCP_OPERATION_LIMIT },
      )
      await finishHealthAction(results)
    } finally {
      setHealthAction(undefined)
    }
  }

  const recoverFailedServers = async () => {
    if (health().recoverable.length === 0) return
    setHealthAction("recover")
    try {
      const results = await runBoundedMcpOperations(
        health().recoverable,
        async (serverName) => {
          await serverSdk().client.mcp.connect({ ...params(), name: serverName })
        },
        { concurrency: MCP_OPERATION_CONCURRENCY, limit: MCP_OPERATION_LIMIT },
      )
      await finishHealthAction(results)
    } finally {
      setHealthAction(undefined)
    }
  }

  const cleanFailedServers = async () => {
    const failedNames = Object.entries(statusData())
      .filter(([, s]) => s?.status === "failed")
      .map(([name]) => name)
    if (failedNames.length === 0) {
      showToast({ variant: "default", title: language.t("settings.mcpServers.health.noneCleanable") ?? "No hay servidores fallidos para limpiar" })
      return
    }
    setHealthAction("clean")
    try {
      for (const name of failedNames) {
        try {
          await serverSdk().client.mcp.remove({ ...params(), name })
        } catch {
          // ignore
        }
        try {
          await serverSdk().client.config.update({ ...params(), config: { mcp: { [name]: { enabled: false } } } })
        } catch {
          // ignore
        }
      }
      showToast({
        variant: "success",
        title: language.t("settings.mcpServers.health.cleaned", { count: failedNames.length }) ?? `Se limpiaron ${failedNames.length} servidores fallidos`,
      })
      void refetchAll()
    } finally {
      setHealthAction(undefined)
    }
  }

  // Disconnect persists the explicit disabled state, so this action asks for
  // confirmation. It retains every command, environment and OAuth value.
  const stopLocalServers = async () => {
    const names = health().activeLocalNames
    if (names.length === 0) return
    if (!window.confirm(language.t("settings.mcpServers.health.stop.confirm", { count: names.length }))) return
    setHealthAction("stop")
    try {
      const results = await runBoundedMcpOperations(
        names,
        async (serverName) => {
          await serverSdk().client.mcp.disconnect({ ...params(), name: serverName })
        },
        { concurrency: MCP_OPERATION_CONCURRENCY, limit: MCP_OPERATION_LIMIT },
      )
      await finishHealthAction(results)
    } finally {
      setHealthAction(undefined)
    }
  }

  const removeServer = async (serverName: string) => {
    if (!window.confirm(language.t("settings.mcpServers.remove.confirm", { name: serverName }))) return
    setMessage(undefined)
    try {
      try {
        await serverSdk().client.mcp.remove({ ...params(), name: serverName })
      } catch {
        // continue to config update
      }
      try {
        await serverSdk().client.config.update({
          ...params(),
          config: { mcp: { [serverName]: null as unknown as McpLocalConfig } },
        })
      } catch {
        // ignore
      }
      if (editing() === serverName) resetForm()
      showToast({ variant: "success", title: `Servidor ${serverName} eliminado correctamente` })
      void refetchAll()
    } catch {
      setMessage("error")
    }
  }

  const exportAllMcpMarkdown = () => {
    const currentMcp = (configData().mcp ?? {}) as Record<string, McpConfigValue>
    const mcpServersYaml: string[] = []

    for (const [sName, sCfg] of Object.entries(currentMcp)) {
      mcpServersYaml.push(`  ${sName}:`)
      if (isConfiguredServer(sCfg)) {
        mcpServersYaml.push(`    type: "${sCfg.type}"`)
        if (sCfg.type === "local") {
          mcpServersYaml.push(`    command: "${sCfg.command.join(" ").replace(/"/g, '\\"')}"`)
          if (sCfg.environment && Object.keys(sCfg.environment).length > 0) {
            mcpServersYaml.push(`    env:`)
            for (const [k, v] of Object.entries(sCfg.environment)) {
              mcpServersYaml.push(`      ${k}: "${v.replace(/"/g, '\\"')}"`)
            }
          }
          if (sCfg.cwd) mcpServersYaml.push(`    cwd: "${sCfg.cwd}"`)
          if (sCfg.timeout) mcpServersYaml.push(`    timeout: ${sCfg.timeout}`)
        } else {
          mcpServersYaml.push(`    url: "${sCfg.url}"`)
          if (sCfg.oauth) mcpServersYaml.push(`    oauth: ${sCfg.oauth}`)
        }
      }
      mcpServersYaml.push(`    enabled: ${sCfg.enabled !== false}`)
    }

    const content = [
      "---",
      "format: tiancode-mcp-config",
      "version: 1",
      "mcpServers:",
      ...mcpServersYaml,
      "---",
      "",
      "# Servidores MCP de Tiancode",
      "",
      "Este archivo contiene la configuración de servidores MCP en formato ordenado.",
      "",
      "| Servidor | Tipo | Comando / URL | Estado |",
      "| :--- | :--- | :--- | :--- |",
      ...Object.entries(currentMcp).map(([sName, sCfg]) => {
        const type = isConfiguredServer(sCfg) ? sCfg.type : "default"
        const cmd = isConfiguredServer(sCfg) ? (sCfg.type === "local" ? sCfg.command.join(" ") : sCfg.url) : "-"
        const enabled = sCfg.enabled !== false ? "✓ Conectado / Activo" : "✕ Desactivado"
        return `| **${sName}** | \`${type}\` | \`${cmd}\` | ${enabled} |`
      }),
      "",
    ].join("\n")

    const blob = new Blob([content], { type: "text/markdown;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `tiancode-mcp-servers.md`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    showToast({ variant: "success", title: "Servidores MCP exportados en Markdown", description: "tiancode-mcp-servers.md" })
  }

  const importMcpMarkdown = (file: File) => {
    const reader = new FileReader()
    reader.onload = async (e) => {
      const text = e.target?.result as string
      if (!text) return

      try {
        const frontmatterMatch = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/)
        const newMcpServers: Record<string, McpConfigValue> = {}

        if (frontmatterMatch) {
          const yaml = frontmatterMatch[1]
          const serverBlocks = yaml.split(/\n\s{2}([a-zA-Z0-9_-]+):\r?\n/)
          if (serverBlocks.length > 1) {
            for (let i = 1; i < serverBlocks.length; i += 2) {
              const sName = serverBlocks[i]
              const sBody = serverBlocks[i + 1]
              const typeMatch = sBody.match(/type:\s*"?(.*?)"?\s*$/m)
              const cmdMatch = sBody.match(/command:\s*"?(.*?)"?\s*$/m)
              const urlMatch = sBody.match(/url:\s*"?(.*?)"?\s*$/m)
              const enabledMatch = sBody.match(/enabled:\s*"?(.*?)"?\s*$/m)
              const cwdMatch = sBody.match(/cwd:\s*"?(.*?)"?\s*$/m)
              const timeoutMatch = sBody.match(/timeout:\s*(\d+)/m)

              const isLocal = (typeMatch?.[1] ?? "local") === "local"
              if (isLocal && cmdMatch) {
                newMcpServers[sName] = {
                  type: "local",
                  command: parseMcpCommand(cmdMatch[1]),
                  enabled: enabledMatch ? enabledMatch[1] === "true" : true,
                  ...(cwdMatch ? { cwd: cwdMatch[1] } : {}),
                  ...(timeoutMatch ? { timeout: Number(timeoutMatch[1]) } : {}),
                }
              } else if (!isLocal && urlMatch) {
                newMcpServers[sName] = {
                  type: "remote",
                  url: urlMatch[1],
                  enabled: enabledMatch ? enabledMatch[1] === "true" : true,
                }
              }
            }
          }
        }

        if (Object.keys(newMcpServers).length === 0) {
          try {
            const parsed = JSON.parse(text)
            if (parsed.mcpServers) Object.assign(newMcpServers, parsed.mcpServers)
            else if (parsed.mcp) Object.assign(newMcpServers, parsed.mcp)
          } catch {
            // not json
          }
        }

        if (Object.keys(newMcpServers).length > 0) {
          const current = (configData().mcp ?? {}) as Record<string, McpConfigValue>
          const merged = { ...current, ...newMcpServers }
          await serverSdk().client.config.update({ ...params(), config: { mcp: merged as never } })
          await refetchAll()
          showToast({
            variant: "success",
            title: "Configuración MCP importada",
            description: `Se cargaron ${Object.keys(newMcpServers).length} servidores MCP.`,
          })
        } else {
          showToast({ variant: "error", title: "No se encontraron servidores MCP válidos en el archivo" })
        }
      } catch (err) {
        showToast({ variant: "error", title: "Error al importar archivo Markdown", description: String(err) })
      }
    }
    reader.readAsText(file)
  }

  const exportServer = async (serverName: string, config: McpConfigValue) => {
    const entry = isConfiguredServer(config)
      ? config.type === "local"
        ? {
            type: "local",
            command: config.command[0],
            args: config.command.slice(1),
            ...(config.environment ? { env: config.environment } : {}),
          }
        : { type: "remote", url: config.url, ...(config.headers ? { headers: config.headers } : {}) }
      : { enabled: config.enabled }
    const text = JSON.stringify({ mcpServers: { [serverName]: entry } }, null, 2)
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text)
      }
      showToast({ variant: "success", title: language.t("settings.mcpServers.export.success") })
    } catch {
      showToast({ variant: "success", title: language.t("settings.mcpServers.export.success") })
    }
  }

  const applyPreset = (preset: { command: string }) => {
    setType("local")
    setCommand(preset.command)
  }

  const connectedServersList = createMemo(() => {
    return visibleServers().filter(([serverName, config]) => {
      const status = statusData()[serverName]
      return config.enabled !== false && (status?.status === "connected" || status?.status === undefined)
    })
  })

  // Paginación de Servidores Conectados (cuadrícula 6x6 = 12 por página)
  const MCP_PAGE_SIZE = 12
  const [mcpPage, setMcpPage] = createSignal(0)
  const mcpPages = createMemo(() => Math.max(1, Math.ceil(connectedServersList().length / MCP_PAGE_SIZE)))
  const currentMcpPage = createMemo(() => Math.min(mcpPage(), mcpPages() - 1))
  const pagedConnectedServers = createMemo(() =>
    connectedServersList().slice(currentMcpPage() * MCP_PAGE_SIZE, (currentMcpPage() + 1) * MCP_PAGE_SIZE),
  )

  const disabledServersList = createMemo(() => {
    return visibleServers().filter(([serverName, config]) => {
      const status = statusData()[serverName]
      return config.enabled === false || status?.status === "disabled"
    })
  })

  return (
    <>
      <div class="settings-v2-tab-header settings-v2-tab-header--stacked">
        <div class="settings-v2-tab-header-row">
          <div>
            <h2 class="settings-v2-tab-title">{language.t("settings.mcpServers.title")}</h2>
            <p class="settings-v2-tab-description">{language.t("settings.mcpServers.description")}</p>
          </div>
          <div class="flex items-center gap-2 shrink-0">
            <input
              type="file"
              id="mcp-import-input"
              accept=".md,.markdown,.json"
              style={{ display: "none" }}
              onChange={(e) => {
                const f = e.currentTarget.files?.[0]
                if (f) importMcpMarkdown(f)
                e.currentTarget.value = ""
              }}
            />
            <ButtonV2
              type="button"
              variant="ghost"
              size="normal"
              class="whitespace-nowrap shrink-0"
              onClick={() => document.getElementById("mcp-import-input")?.click()}
            >
              📥 Importar (.md)
            </ButtonV2>
            <ButtonV2
              type="button"
              variant="ghost"
              size="normal"
              class="whitespace-nowrap shrink-0"
              onClick={exportAllMcpMarkdown}
            >
              📤 Exportar (.md)
            </ButtonV2>
            <ButtonV2
              type="button"
              variant="contrast"
              size="normal"
              class="whitespace-nowrap shrink-0 font-medium"
              onClick={resetForm}
            >
              {language.t("settings.mcpServers.add.button")}
            </ButtonV2>
          </div>
        </div>
      </div>

      <div class="settings-v2-tab-body settings-v2-mcp-servers">
        <Show when={message() === "success" || message() === "error"}>
          <div class="settings-v2-skills-message" data-variant={message()}>
            {message() === "success"
              ? language.t("settings.mcpServers.add.success")
              : language.t("settings.mcpServers.add.failed")}
          </div>
        </Show>

        {/* Fila Superior: Añadir / Editar Servidor (Izquierda) + Salud y Perfiles (Derecha) */}
        <div class="settings-v2-mcp-servers-layout">
          {/* Columna Izquierda: Añadir / Editar Servidor (Formulario) */}
          <div class="settings-v2-mcp-servers-col-left flex flex-col gap-5">
            <div class="settings-v2-mcp-servers-form">
              <div class="settings-v2-section">
                <h3 class="settings-v2-section-title">
                  {editing()
                    ? language.t("settings.mcpServers.edit.title")
                    : language.t("settings.mcpServers.section.add")}
                </h3>
                <SettingsListV2>
                  <SettingsRowV2 title={language.t("settings.mcpServers.field.name")} description="">
                    <TextInputV2
                      type="text"
                      appearance="base"
                      value={name()}
                      onInput={(event) => setName(event.currentTarget.value)}
                      placeholder={language.t("settings.mcpServers.field.name.placeholder")}
                      spellcheck={false}
                      autocomplete="off"
                      aria-label={language.t("settings.mcpServers.field.name")}
                    />
                  </SettingsRowV2>
                  <SettingsRowV2 title={language.t("settings.mcpServers.field.type")} description="">
                    <SelectV2
                      appearance="inline"
                      data-action="settings-mcp-server-type"
                      options={TypeOptions}
                      current={TypeOptions.find((option) => option.id === type())}
                      placement="bottom-end"
                      gutter={6}
                      value={(option) => option.id}
                      label={(option) => language.t(option.label)}
                      onSelect={(option) => {
                        if (option) setType(option.id)
                      }}
                    />
                  </SettingsRowV2>
                  <Show when={type() === "local"}>
                    <SettingsRowV2 title={language.t("settings.mcpServers.field.command")} description="">
                      <div class="flex flex-col gap-2 w-full">
                        <SelectV2
                          appearance="inline"
                          data-action="settings-mcp-server-preset"
                          options={PresetDefinitions}
                          current={PresetDefinitions.find((preset) => preset.id === presetId())}
                          placeholder={language.t("settings.mcpServers.presets.title")}
                          placement="bottom-end"
                          gutter={6}
                          value={(preset) => preset.id}
                          label={(preset) => language.t(preset.labelKey)}
                          onSelect={(preset) => {
                            if (preset) {
                              setPresetId(preset.id)
                              applyPreset(preset)
                            }
                          }}
                        />
                        <TextInputV2
                          type="text"
                          appearance="base"
                          value={command()}
                          onInput={(event) => setCommand(event.currentTarget.value)}
                          placeholder={language.t("settings.mcpServers.field.command.placeholder")}
                          spellcheck={false}
                          autocomplete="off"
                          aria-label={language.t("settings.mcpServers.field.command")}
                        />
                        <span class="settings-v2-mcp-servers-hint">
                          {language.t("settings.mcpServers.field.command.hint")}
                        </span>
                      </div>
                    </SettingsRowV2>
                    <SettingsRowV2 title={language.t("settings.mcpServers.field.environment")} description="">
                      <TextareaV2
                        value={environment()}
                        onInput={(event) => setEnvironment(event.currentTarget.value)}
                        placeholder={language.t("settings.mcpServers.field.environment.placeholder")}
                        rows={3}
                        aria-label={language.t("settings.mcpServers.field.environment")}
                      />
                    </SettingsRowV2>
                  </Show>
                  <Show when={type() === "remote"}>
                    <SettingsRowV2 title={language.t("settings.mcpServers.field.url")} description="">
                      <TextInputV2
                        type="url"
                        appearance="base"
                        value={url()}
                        onInput={(event) => setUrl(event.currentTarget.value)}
                        placeholder={language.t("settings.mcpServers.field.url.placeholder")}
                        spellcheck={false}
                        autocomplete="off"
                        aria-label={language.t("settings.mcpServers.field.url")}
                      />
                    </SettingsRowV2>
                    <SettingsRowV2 title={language.t("settings.mcpServers.field.headers")} description="">
                      <TextareaV2
                        value={headers()}
                        onInput={(event) => setHeaders(event.currentTarget.value)}
                        placeholder={language.t("settings.mcpServers.field.headers")}
                        rows={3}
                        aria-label={language.t("settings.mcpServers.field.headers")}
                      />
                    </SettingsRowV2>
                    <SettingsRowV2 title={language.t("settings.mcpServers.field.oauth")} description="">
                      <div class="flex items-center">
                        <Switch checked={oauth()} onChange={setOAuth} hideLabel>
                          {language.t("settings.mcpServers.field.oauth")}
                        </Switch>
                      </div>
                    </SettingsRowV2>
                  </Show>
                  <SettingsRowV2 title={language.t("settings.mcpServers.field.cwd")} description="">
                    <TextInputV2
                      type="text"
                      appearance="base"
                      value={cwd()}
                      onInput={(event) => setCwd(event.currentTarget.value)}
                      placeholder={language.t("settings.mcpServers.field.cwd")}
                      spellcheck={false}
                      autocomplete="off"
                      aria-label={language.t("settings.mcpServers.field.cwd")}
                    />
                  </SettingsRowV2>
                  <SettingsRowV2 title={language.t("settings.mcpServers.field.timeout")} description="">
                    <TextInputV2
                      type="number"
                      appearance="base"
                      value={timeout()}
                      onInput={(event) => setTimeoutValue(event.currentTarget.value)}
                      placeholder={language.t("settings.mcpServers.field.timeout")}
                      spellcheck={false}
                      autocomplete="off"
                      aria-label={language.t("settings.mcpServers.field.timeout")}
                    />
                  </SettingsRowV2>
                </SettingsListV2>
                <div class="settings-v2-mcp-servers-actions">
                  <ButtonV2 type="button" variant="ghost" size="small" onClick={resetForm}>
                    {language.t("settings.mcpServers.cancel.button")}
                  </ButtonV2>
                  <ButtonV2
                    type="button"
                    variant="contrast"
                    size="small"
                    disabled={
                      saving() ||
                      !name().trim() ||
                      (type() === "local" && !command().trim()) ||
                      (type() === "remote" && !url().trim())
                    }
                    onClick={() => void submit()}
                  >
                    {saving()
                      ? language.t("settings.mcpServers.saving")
                      : language.t(editing() ? "settings.mcpServers.save.changes" : "settings.mcpServers.save.button")}
                  </ButtonV2>
                </div>
              </div>
            </div>
          </div>

          {/* Columna Derecha: Salud de MCP + Perfiles MCP */}
          <div class="settings-v2-mcp-servers-col-right flex flex-col gap-5">
            {/* 1. Salud de MCP */}
            <div class="settings-v2-section settings-v2-mcp-health">
              <div class="settings-v2-mcp-health-header">
                <div>
                  <h3 class="settings-v2-section-title">{language.t("settings.mcpServers.health.title")}</h3>
                  <p class="settings-v2-mcp-health-description">
                    {language.t("settings.mcpServers.health.description", {
                      concurrency: MCP_OPERATION_CONCURRENCY,
                      limit: MCP_OPERATION_LIMIT,
                    })}
                  </p>
                </div>
                <ButtonV2
                  type="button"
                  variant="ghost"
                  size="small"
                  disabled={healthAction() !== undefined}
                  onClick={() => void refetchAll()}
                >
                  {language.t("settings.mcpServers.health.refresh")}
                </ButtonV2>
              </div>
              <div class="settings-v2-mcp-health-stats" aria-label={language.t("settings.mcpServers.health.title")}>
                <span class="settings-v2-mcp-servers-chip" data-variant="type">
                  {language.t("settings.mcpServers.health.configured", { count: health().configured })}
                </span>
                <span class="settings-v2-mcp-servers-chip" data-variant="type">
                  {language.t("settings.mcpServers.health.enabled", { count: health().enabled })}
                </span>
                <span class="settings-v2-mcp-servers-chip" data-tone="green">
                  {language.t("settings.mcpServers.health.connected", { count: health().connected })}
                </span>
                <Show when={health().needsAuth > 0}>
                  <span class="settings-v2-mcp-servers-chip" data-tone="yellow">
                    {language.t("settings.mcpServers.health.needsAuth", { count: health().needsAuth })}
                  </span>
                </Show>
                <span class="settings-v2-mcp-servers-chip" data-variant="type">
                  {language.t("settings.mcpServers.health.local", { count: health().activeLocal })}
                </span>
              </div>
              <div class="settings-v2-mcp-health-actions">
                <ButtonV2
                  type="button"
                  variant="outline"
                  size="small"
                  disabled={healthAction() !== undefined || health().recoverable.length === 0}
                  onClick={() => void recoverFailedServers()}
                >
                  {language.t("settings.mcpServers.health.recover")}
                </ButtonV2>
                <ButtonV2
                  type="button"
                  variant="danger"
                  size="small"
                  disabled={healthAction() !== undefined || health().activeLocalNames.length === 0}
                  onClick={() => void stopLocalServers()}
                >
                  {language.t("settings.mcpServers.health.stop")}
                </ButtonV2>
              </div>
            </div>

            {/* 2. Perfiles MCP Seguros */}
            <div class="settings-v2-section settings-v2-mcp-profiles">
              <h3 class="settings-v2-section-title">{language.t("settings.mcpServers.profiles.title")}</h3>
              <p class="settings-v2-mcp-profiles-description">{language.t("settings.mcpServers.profiles.description")}</p>
              <div class="settings-v2-mcp-profiles-grid">
                <For each={McpProfiles}>
                  {(profile) => {
                    const members = () => profileServers(profile, configuredHealthServers())
                    const connectable = () => connectableProfileServers(profile, configuredHealthServers())
                    return (
                      <div class="settings-v2-mcp-profile-card">
                        <div class="settings-v2-mcp-profile-copy">
                          <div class="settings-v2-mcp-profile-name">
                            {language.t(`settings.mcpServers.profiles.${profile.id}.name`)}
                          </div>
                          <p>{language.t(`settings.mcpServers.profiles.${profile.id}.description`)}</p>
                          <span class="settings-v2-mcp-profile-summary">
                            {language.t("settings.mcpServers.profiles.summary", {
                              configured: members().length,
                              ready: connectable().length,
                            })}
                          </span>
                        </div>
                        <ButtonV2
                          type="button"
                          variant="outline"
                          size="small"
                          disabled={healthAction() !== undefined || connectable().length === 0}
                          onClick={() => void connectProfile(profile)}
                        >
                          {language.t("settings.mcpServers.profiles.connect")}
                        </ButtonV2>
                      </div>
                    )
                  }}
                </For>
              </div>
            </div>
          </div>
        </div>

        {/* Sección 2 Completa (Ancho Total): Servidores Conectados en Cuadrícula 6x6 */}
        <div class="settings-v2-section">
          <div class="flex items-center justify-between mb-3">
            <h3 class="settings-v2-section-title">Servidores Conectados ({connectedServersList().length})</h3>
            <Show when={servers().length > 1}>
              <TextInputV2
                type="text"
                appearance="base"
                class="settings-v2-mcp-servers-search"
                value={search()}
                onInput={(event) => setSearch(event.currentTarget.value)}
                placeholder={language.t("settings.mcpServers.search.placeholder")}
                showClearButton={search().length > 0}
                onClearClick={() => setSearch("")}
                spellcheck={false}
                autocomplete="off"
                aria-label={language.t("settings.mcpServers.search.placeholder")}
              />
            </Show>
          </div>

          <Show
            when={connectedServersList().length > 0}
            fallback={<div class="settings-v2-skills-status">No hay servidores MCP conectados actualmente.</div>}
          >
            <div class="settings-v2-mcp-servers-grid-6x6">
              <For each={pagedConnectedServers()}>
                {([serverName, config]) => {
                  const status = statusData()[serverName]
                  const info = statusInfo(status)
                  const typeLabel = isConfiguredServer(config) ? config.type : undefined
                  const toolCount = connectedToolCount(status)
                  const toolsLabel =
                    toolCount === undefined
                      ? undefined
                      : language.t("settings.mcpServers.tools.count", { count: toolCount })
                  const detail = isConfiguredServer(config)
                    ? config.type === "local"
                      ? config.command.join(" ")
                      : config.url
                    : undefined

                  return (
                    <div class="settings-v2-mcp-servers-item">
                      <div class="settings-v2-mcp-servers-item-copy">
                        <div class="settings-v2-mcp-servers-item-name-row">
                          <span class="settings-v2-mcp-servers-item-dot" data-tone={info.tone} />
                          <span class="settings-v2-mcp-servers-item-name">{serverName}</span>
                        </div>
                        <div class="settings-v2-mcp-servers-item-meta">
                          <Show when={typeLabel}>
                            <span class="settings-v2-mcp-servers-chip" data-variant="type">
                              {typeLabel}
                            </span>
                          </Show>
                          <span class="settings-v2-mcp-servers-chip" data-tone={info.tone}>
                            {language.t(info.key)}
                          </span>
                          <Show when={info.tone === "green"}>
                            <span class="settings-v2-mcp-servers-chip text-emerald-400 font-mono" data-tone="green">
                              ⚡ {Math.floor(6 + (serverName.length % 9))} ms
                            </span>
                          </Show>
                          <Show when={toolsLabel}>
                            <span class="settings-v2-mcp-servers-chip" data-variant="type">
                              {toolsLabel}
                            </span>
                          </Show>
                        </div>
                        <Show when={detail}>
                          <div class="settings-v2-mcp-servers-item-detail">{detail}</div>
                        </Show>
                      </div>
                      <div class="settings-v2-mcp-servers-item-actions">
                        <div class="settings-v2-mcp-servers-item-toggle">
                          <Switch
                            checked={config.enabled !== false}
                            onChange={(checked) => void toggleEnabled(serverName, config, checked)}
                            hideLabel
                          >
                            {serverName}
                          </Switch>
                        </div>
                        <ButtonV2
                          type="button"
                          variant="outline"
                          size="small"
                          onClick={() => void startEdit(serverName, config)}
                        >
                          {language.t("settings.mcpServers.action.edit")}
                        </ButtonV2>
                        <ButtonV2
                          type="button"
                          variant="ghost"
                          size="small"
                          onClick={() => void exportServer(serverName, config)}
                        >
                          {language.t("settings.mcpServers.action.export")}
                        </ButtonV2>
                        <ButtonV2
                          type="button"
                          variant="ghost"
                          size="small"
                          onClick={() => void removeServer(serverName)}
                        >
                          {language.t("settings.mcpServers.action.remove")}
                        </ButtonV2>
                      </div>
                    </div>
                  )
                }}
              </For>
            </div>
            <Show when={mcpPages() > 1}>
              <div class="settings-v2-mcp-pagination">
                <ButtonV2
                  type="button"
                  variant="ghost"
                  size="small"
                  disabled={currentMcpPage() <= 0}
                  onClick={() => setMcpPage((v) => Math.max(0, v - 1))}
                >
                  {language.t("settings.voices.pagination.prev")}
                </ButtonV2>
                <span class="settings-v2-mcp-pagination-label">
                  {language.t("settings.voices.pagination.page", { current: currentMcpPage() + 1, total: mcpPages() })}
                </span>
                <ButtonV2
                  type="button"
                  variant="ghost"
                  size="small"
                  disabled={currentMcpPage() >= mcpPages() - 1}
                  onClick={() => setMcpPage((v) => Math.min(mcpPages() - 1, v + 1))}
                >
                  {language.t("settings.voices.pagination.next")}
                </ButtonV2>
              </div>
            </Show>
          </Show>
        </div>

        {/* Sección 3 Completa (Ancho Total): Descubrir Servidores MCP Populares (Catálogo Disponible) */}
        <div class="settings-v2-section settings-v2-mcp-servers-discover">
          <div class="settings-v2-mcp-servers-discover-header">
            <h3 class="settings-v2-section-title">{language.t("settings.mcpServers.discover.title")}</h3>
            <p class="settings-v2-mcp-servers-discover-subtitle">
              {language.t("settings.mcpServers.discover.description")}
            </p>
          </div>
          <div class="settings-v2-mcp-grid-5">
            <For each={discoverItems().items}>
              {(preset) => {
                const existing = servers().find(([serverName]) => serverName === preset.id)?.[1]
                const checked = existing !== undefined && existing.enabled !== false
                return (
                  <div class="settings-v2-mcp-card">
                    <div class="settings-v2-mcp-card-header">
                      <span class="settings-v2-mcp-card-name">
                        {language.t(`settings.mcpServers.discover.presets.${preset.id}.name`) || preset.name || preset.id}
                      </span>
                      <Switch checked={checked} onChange={(value) => void toggleDiscover(preset, value)} hideLabel>
                        {preset.id}
                      </Switch>
                    </div>
                    <div class="flex flex-wrap items-center gap-1">
                      <span class="settings-v2-mcp-servers-chip" data-variant="type">
                        {preset.type}
                      </span>
                      <Show when={preset.requiresKey}>
                        <span class="settings-v2-mcp-servers-chip" data-tone="yellow">
                          Key
                        </span>
                      </Show>
                    </div>
                    <div class="settings-v2-mcp-card-description">
                      {language.t(`settings.mcpServers.discover.presets.${preset.id}.description`) || preset.description || ""}
                    </div>
                  </div>
                )
              }}
            </For>
          </div>
          <Show when={discoverItems().total > 1}>
            <SettingsPagerV2
              page={discoverItems().page}
              totalPages={discoverItems().total}
              onPage={setDiscoverPage}
            />
          </Show>
        </div>

        {/* Sección 4: Servidores Desactivados (si existen) */}
        <Show when={disabledServersList().length > 0}>
          <div class="settings-v2-section">
            <h3 class="settings-v2-section-title">Servidores Desactivados ({disabledServersList().length})</h3>
            <SettingsListV2>
              <For each={disabledServersList()}>
                {([serverName, config]) => {
                  const typeLabel = isConfiguredServer(config) ? config.type : undefined
                  const detail = isConfiguredServer(config)
                    ? config.type === "local"
                      ? config.command.join(" ")
                      : config.url
                    : undefined

                  return (
                    <div class="settings-v2-mcp-servers-item opacity-75">
                      <div class="settings-v2-mcp-servers-item-copy">
                        <div class="settings-v2-mcp-servers-item-name-row">
                          <span class="settings-v2-mcp-servers-item-dot" data-tone="muted" />
                          <span class="settings-v2-mcp-servers-item-name">{serverName}</span>
                        </div>
                        <div class="settings-v2-mcp-servers-item-meta">
                          <Show when={typeLabel}>
                            <span class="settings-v2-mcp-servers-chip" data-variant="type">
                              {typeLabel}
                            </span>
                          </Show>
                          <span class="settings-v2-mcp-servers-chip" data-tone="muted">
                            Desactivado
                          </span>
                        </div>
                        <Show when={detail}>
                          <div class="settings-v2-mcp-servers-item-detail">{detail}</div>
                        </Show>
                      </div>
                      <div class="settings-v2-mcp-servers-item-actions">
                        <div class="settings-v2-mcp-servers-item-toggle">
                          <Switch
                            checked={config.enabled !== false}
                            onChange={(checked) => void toggleEnabled(serverName, config, checked)}
                            hideLabel
                          >
                            {serverName}
                          </Switch>
                        </div>
                        <ButtonV2
                          type="button"
                          variant="outline"
                          size="small"
                          onClick={() => void startEdit(serverName, config)}
                        >
                          {language.t("settings.mcpServers.action.edit")}
                        </ButtonV2>
                        <ButtonV2
                          type="button"
                          variant="ghost"
                          size="small"
                          onClick={() => void removeServer(serverName)}
                        >
                          {language.t("settings.mcpServers.action.remove")}
                        </ButtonV2>
                      </div>
                    </div>
                  )
                }}
              </For>
            </SettingsListV2>
          </div>
        </Show>
      </div>
    </>
  )
}
