import { ButtonV2 } from "@tiancode-ai/ui/v2/button-v2"
import { SegmentedControlItemV2, SegmentedControlV2 } from "@tiancode-ai/ui/v2/segmented-control-v2"
import { Switch } from "@tiancode-ai/ui/v2/switch-v2"
import { TextInputV2 } from "@tiancode-ai/ui/v2/text-input-v2"
import { Icon as IconV2 } from "@tiancode-ai/ui/v2/icon"
import { IconButtonV2 } from "@tiancode-ai/ui/v2/icon-button-v2"
import { Icon } from "@tiancode-ai/ui/icon"
import type { McpLocalConfig, McpRemoteConfig, McpStatus } from "@tiancode-ai/sdk/v2/client"
import {
  type Component,
  createEffect,
  createResource,
  For,
  Show,
  createSignal,
  createMemo,
  onMount,
  onCleanup,
} from "solid-js"
import { useLanguage } from "@/context/language"
import { useServerSDK } from "@/context/server-sdk"
import { showToast } from "@/utils/toast"
import {
  displayName,
  pluginEnabled,
  pluginName,
  pluginOrigin,
  type PluginEntry,
} from "./plugins-origin"
import { SettingsPagerV2 } from "./parts/pager"
import "./mcp-plugins.css"

type McpConfigValue = McpLocalConfig | McpRemoteConfig | { enabled: boolean }
type TabMode = "mcp" | "plugins" | "discover"

// 8 Built-in Plugins
const BUILTIN_PLUGINS = [
  {
    id: "android-emulator",
    name: "Android Emulator",
    desc: "Provides Android development workflows and emulator automation for Tiancode.",
    icon: "🤖",
    category: "desarrollo",
  },
  {
    id: "browser-use",
    name: "Browser Use",
    desc: "Built-in browser automation runtime and guidance for Desktop IAB and explicitly enabled CLI-managed headless CDP: open, click, inspect, screenshot.",
    icon: "🌐",
    category: "web",
  },
  {
    id: "document-skills",
    name: "Document Skills",
    desc: "Built-in DOCX and PDF document production skills, published as an official Tiancode plugin.",
    icon: "📄",
    category: "herramientas",
  },
  {
    id: "ios-simulator",
    name: "iOS Simulator",
    desc: "Provides iOS development workflows and simulator automation for Tiancode.",
    icon: "📱",
    category: "desarrollo",
  },
  {
    id: "restore-legacy-sessions",
    name: "Restore Legacy Sessions",
    desc: "Select and restore legacy sessions into the new Tiancode task and session store.",
    icon: "💾",
    category: "sistema",
  },
  {
    id: "skill-creator",
    name: "Skill Creator",
    desc: "Create, edit, iterate local Tiancode skills.",
    icon: "✏️",
    category: "ia",
  },
  {
    id: "tiancode-guide",
    name: "Tiancode Guide",
    desc: "Tiancode usage and self-diagnosis guide: teaches agents and users how to configure MCP servers, commands, skills, hooks, and extensions.",
    icon: "📖",
    category: "documentacion",
  },
  {
    id: "computer-use",
    name: "Computer Use",
    desc: "Computer Use: automate desktop apps with mouse, keyboard, and UI element control.",
    icon: "💻",
    category: "sistema",
  },
] as const

const formatCategory = (cat?: string) => {
  if (!cat) return "General"
  const map: Record<string, string> = {
    diseno: "Diseño",
    web: "Web",
    backend: "Backend",
    seguridad: "Seguridad",
    finanzas: "Finanzas",
    ia: "IA & ML",
    desarrollo: "Desarrollo",
    herramientas: "Herramientas",
    sistema: "Sistema",
    documentacion: "Documentación",
    database: "Base de Datos",
    cloud: "Cloud & DevOps",
    ventas: "Ventas & CRM",
    datos: "Ciencia Datos",
  }
  return map[cat.toLowerCase()] || cat.charAt(0).toUpperCase() + cat.slice(1)
}

// 23 Installed & Catalog Plugins
const CATALOG_ITEMS = [
  {
    id: "canva",
    name: "Canva",
    type: "mcp" as const,
    category: "diseno",
    icon: "🎨",
    desc: "Create, edit, review, resize, and brand-check Canva designs with the Canva MCP server.",
    command: "npx -y @canva/mcp-server",
    popular: true,
  },
  {
    id: "chrome-devtools",
    name: "Chrome Devtools MCP",
    type: "mcp" as const,
    category: "web",
    icon: "🌐",
    desc: "Reliable automation, in-depth debugging, and performance analysis in Chrome using Chrome DevTools and Puppeteer.",
    command: "npx -y @modelcontextprotocol/server-puppeteer",
    popular: true,
  },
  {
    id: "appwrite",
    name: "Appwrite",
    type: "mcp" as const,
    category: "backend",
    icon: "⚡",
    desc: "Appwrite tools for Claude Code, including SDK skills, Appwrite MCP servers, and deployment commands.",
    command: "npx -y @appwrite/mcp",
    popular: true,
  },
  {
    id: "aikido",
    name: "Aikido",
    type: "plugin" as const,
    category: "seguridad",
    icon: "🛡️",
    desc: "Aikido Security for Claude Code: scan code (SAST, secrets, IaC) and list all issues from your Aikido feed powered by the Aikido API.",
    spec: "opencode-aikido-security",
    popular: true,
  },
  {
    id: "airwallex-agentos",
    name: "Airwallex Agentos",
    type: "mcp" as const,
    category: "finanzas",
    icon: "💳",
    desc: "Bring Airwallex's global financial infrastructure to Claude. Orchestrate actions across your account in plain language, e.g., set up payment links, check balances, transfer funds.",
    command: "npx -y @airwallex/agentos-mcp",
    popular: true,
  },
  {
    id: "agentforce-adlc",
    name: "Agentforce Adlc",
    type: "plugin" as const,
    category: "ia",
    icon: "☁️",
    desc: "Agentforce Agent Development Life Cycle — author, discover, scaffold, deploy, test, secure, and optimize .agent files.",
    spec: "opencode-agentforce-adlc",
    popular: false,
  },
  {
    id: "agent-sdk-dev",
    name: "Agent Sdk Dev",
    type: "plugin" as const,
    category: "desarrollo",
    icon: "📦",
    desc: "Claude Agent SDK Development Plugin for building, testing, and debugging agent packages.",
    spec: "opencode-agent-sdk-dev",
    popular: false,
  },
  {
    id: "42crunch-api-security",
    name: "42crunch Api Security Testing",
    type: "mcp" as const,
    category: "seguridad",
    icon: "🔒",
    desc: "Catch API security issues during development: audit, scan, remediate, validate with AI guardrails in Claude Code.",
    command: "npx -y 42crunch-mcp-server",
    popular: false,
  },
  {
    id: "superpowers",
    name: "Superpowers",
    type: "plugin" as const,
    category: "desarrollo",
    icon: "⚡",
    desc: "Core skills library for Claude Code: TDD, debugging, collaboration patterns, and proven techniques.",
    spec: "opencode-superpowers",
    popular: true,
  },
  {
    id: "feature-dev",
    name: "Feature Dev",
    type: "plugin" as const,
    category: "desarrollo",
    icon: "💡",
    desc: "Comprehensive feature development workflow with specialized agents for codebase exploration, architecture design, and implementation.",
    spec: "opencode-feature-dev",
    popular: true,
  },
  {
    id: "code-review",
    name: "Code Review",
    type: "plugin" as const,
    category: "desarrollo",
    icon: "🔎",
    desc: "Automated code review for pull requests using multiple specialized agents with confidence-based scoring.",
    spec: "opencode-code-review",
    popular: true,
  },
  {
    id: "context7",
    name: "Context7",
    type: "mcp" as const,
    category: "documentacion",
    icon: "📚",
    desc: "Upstash Context7 MCP server for up-to-date documentation lookup. Pull version-specific documentation and code examples directly into context.",
    command: "npx -y @upstash/context7-mcp",
    popular: true,
  },
  {
    id: "playwright",
    name: "Playwright Automation",
    type: "mcp" as const,
    category: "web",
    icon: "🎭",
    desc: "Browser automation and end-to-end testing MCP server by Microsoft. Enables Claude to interact with web pages, take screenshots, test UI.",
    command: "npx -y @playwright/mcp@latest",
    popular: true,
  },
  {
    id: "commit-commands",
    name: "Commit Commands",
    type: "plugin" as const,
    category: "desarrollo",
    icon: "🌿",
    desc: "Streamline your git workflow with simple commands for committing, pushing, and creating pull requests.",
    spec: "opencode-commit-commands",
    popular: true,
  },
  {
    id: "alloydb",
    name: "Alloydb",
    type: "mcp" as const,
    category: "database",
    icon: "🗄️",
    desc: "Create, connect, and interact with an AlloyDB for PostgreSQL database and data.",
    command: "npx -y @google-cloud/alloydb-mcp",
    popular: false,
  },
  {
    id: "alloydb-omni",
    name: "Alloydb Omni",
    type: "mcp" as const,
    category: "database",
    icon: "🗄️",
    desc: "Create, connect, and interact with an AlloyDB Omni database and data.",
    command: "npx -y @google-cloud/alloydb-omni-mcp",
    popular: false,
  },
  {
    id: "apollo",
    name: "Apollo",
    type: "mcp" as const,
    category: "ventas",
    icon: "📊",
    desc: "Prospect, enrich leads, load outreach sequences, and query sales analytics with Apollo.io — one-click MCP server integration.",
    command: "npx -y @apollo/mcp-server",
    popular: false,
  },
  {
    id: "apollo-skills",
    name: "Apollo Skills",
    type: "plugin" as const,
    category: "desarrollo",
    icon: "🚀",
    desc: "Agent skills for AI coding agents working with Apollo GraphQL tools and technologies.",
    spec: "opencode-apollo-graphql-skills",
    popular: false,
  },
  {
    id: "atlan",
    name: "Atlan",
    type: "plugin" as const,
    category: "datos",
    icon: "🏛️",
    desc: "Atlan context layer plugin for Claude Code. Search, explore, govern, and manage your data assets through natural language.",
    spec: "opencode-atlan-context",
    popular: false,
  },
  {
    id: "atomic-agents",
    name: "Atomic Agents",
    type: "plugin" as const,
    category: "ia",
    icon: "⚛️",
    desc: "Skills plus explorer and reviewer subagents for building, scaffolding, understanding, and auditing applications with the Atomic Agents framework.",
    spec: "opencode-atomic-agents",
    popular: false,
  },
  {
    id: "auth0",
    name: "Auth0",
    type: "plugin" as const,
    category: "seguridad",
    icon: "🛡️",
    desc: "Auth0 skills for quickstarts, migration, major version upgrades, MFA, branding, custom domains, Advanced Custom Universal Login.",
    spec: "opencode-auth0-skills",
    popular: true,
  },
  {
    id: "aws-agents",
    name: "AWS Agents",
    type: "plugin" as const,
    category: "cloud",
    icon: "☁️",
    desc: "Build, deploy, and operate AI agents on AWS. Skills for scaffolding agents with Amazon Bedrock AgentCore (Strands, Flows, Knowledge Bases).",
    spec: "opencode-aws-agents-bedrock",
    popular: true,
  },
  {
    id: "box",
    name: "Box",
    type: "plugin" as const,
    category: "cloud",
    icon: "📦",
    desc: "Box Plugin for Claude Code to help with Box Platform integrations including content workflows, shared links, webhooks.",
    spec: "opencode-box-platform",
    popular: false,
  },
  {
    id: "filesystem",
    name: "Filesystem MCP",
    type: "mcp" as const,
    category: "desarrollo",
    icon: "📁",
    desc: "Acceso seguro a lectura y escritura de archivos locales y del workspace.",
    command: "npx -y @modelcontextprotocol/server-filesystem .",
    popular: true,
  },
  {
    id: "fetch",
    name: "Web Fetch & Scraper",
    type: "mcp" as const,
    category: "web",
    icon: "🌐",
    desc: "Descarga, procesa y convierte contenido web y documentación HTML a Markdown limpio.",
    command: "npx -y @modelcontextprotocol/server-fetch",
    popular: true,
  },
  {
    id: "sqlite",
    name: "SQLite Inspector",
    type: "mcp" as const,
    category: "database",
    icon: "🗄️",
    desc: "Consultas, inspección de esquemas y análisis de bases de datos SQLite.",
    command: "npx -y @modelcontextprotocol/server-sqlite .",
    popular: true,
  },
  {
    id: "postgres",
    name: "PostgreSQL Client",
    type: "mcp" as const,
    category: "database",
    icon: "🐘",
    desc: "Ejecución de consultas SQL, inspección de tablas e índices en PostgreSQL.",
    command: "npx -y @modelcontextprotocol/server-postgres",
    popular: true,
  },
  {
    id: "docker",
    name: "Docker Engine MCP",
    type: "mcp" as const,
    category: "desarrollo",
    icon: "🐳",
    desc: "Gestión de contenedores, imágenes, logs y docker-compose en tiempo real.",
    command: "npx -y docker-mcp",
    popular: true,
  },
  {
    id: "git",
    name: "Git & VCS Tools",
    type: "mcp" as const,
    category: "desarrollo",
    icon: "🌿",
    desc: "Operaciones avanzadas de git, diffs, ramas, inspección de historial y commits.",
    command: "npx -y @modelcontextprotocol/server-git",
    popular: true,
  },
  {
    id: "brave-search",
    name: "Brave Web Search",
    type: "mcp" as const,
    category: "web",
    icon: "🔍",
    desc: "Búsqueda en la web global con Brave Search API para información fresca.",
    command: "npx -y @modelcontextprotocol/server-brave-search",
    popular: true,
  },
  {
    id: "memory",
    name: "Knowledge Graph Memory",
    type: "mcp" as const,
    category: "ia",
    icon: "🧠",
    desc: "Memoria contextual persistente con grafo de conocimiento entre sesiones.",
    command: "npx -y @modelcontextprotocol/server-memory",
    popular: true,
  },
  {
    id: "wakatime",
    name: "WakaTime Observability",
    type: "plugin" as const,
    category: "desarrollo",
    icon: "⏱️",
    desc: "Métricas de tiempo de desarrollo y telemetría de sesiones con WakaTime.",
    spec: "opencode-wakatime",
    popular: true,
  },
  {
    id: "supermemory",
    name: "Supermemory AI",
    type: "plugin" as const,
    category: "ia",
    icon: "⚡",
    desc: "Memoria contextual externa y almacenamiento semántico de snippets.",
    spec: "opencode-supermemory",
    popular: false,
  },
  {
    id: "envGuard",
    name: "Env Guard Plugin",
    type: "plugin" as const,
    category: "seguridad",
    icon: "🛡️",
    desc: "Protege archivos .env y secretos para evitar modificaciones accidentales.",
    spec: ".tiancode/plugins/env-guard.ts",
    popular: true,
  },
]

export const SettingsMcpPluginsV2: Component<{
  directory?: string
  active?: boolean
}> = (props) => {
  const language = useLanguage()
  const serverSdk = useServerSDK()
  const [activeTab, setActiveTab] = createSignal<TabMode>("plugins")
  const [searchQuery, setSearchQuery] = createSignal("")
  const [showAddModal, setShowAddModal] = createSignal(false)
  const [addMode, setAddMode] = createSignal<"mcp" | "plugin">("plugin")
  const [discoverCategory, setDiscoverCategory] = createSignal("all")

  // Form states
  const [formName, setFormName] = createSignal("")
  const [formCommand, setFormCommand] = createSignal("")
  const [submitting, setSubmitting] = createSignal(false)

  const params = () => (props.directory ? { directory: props.directory } : undefined)

  // Fetch Config
  const [configData, { refetch: refetchConfig }] = createResource(
    async () => {
      try {
        const result = await serverSdk().client.config.get(params()).catch(() => ({ data: {} }))
        return (result.data ?? {}) as Record<string, any>
      } catch {
        return {} as Record<string, any>
      }
    },
    { initialValue: {} as Record<string, any> },
  )

  // Fetch MCP Status
  const [mcpStatusData, { refetch: refetchStatus }] = createResource(
    async () => {
      try {
        const result = await serverSdk().client.mcp.status(params()).catch(() => ({ data: {} }))
        return (result.data ?? {}) as Record<string, McpStatus>
      } catch {
        return {} as Record<string, McpStatus>
      }
    },
    { initialValue: {} as Record<string, McpStatus> },
  )

  createEffect(() => {
    const isActive = props.active ?? true
    if (!isActive) return
    const timer = setInterval(() => void refetchStatus(), 10000)
    onCleanup(() => clearInterval(timer))
  })

  // Overrides reactivos inmediatos (0 ms) para evitar retrasos en switches y notificaciones
  const [mcpOverrides, setMcpOverrides] = createSignal<Record<string, boolean>>({})
  const [builtinOverrides, setBuiltinOverrides] = createSignal<Record<string, boolean>>({})
  const [pluginOverrides, setPluginOverrides] = createSignal<Record<string, boolean>>({})

  // Connected MCP servers list
  const mcpServers = createMemo(() => {
    const configMcp = (configData().mcp ?? {}) as Record<string, McpConfigValue>
    const statusMap = mcpStatusData()
    const query = searchQuery().toLowerCase().trim()
    const overrides = mcpOverrides()

    return Object.entries(configMcp)
      .map(([name, conf]) => {
        const isObject = typeof conf === "object" && conf !== null
        const isLocal = isObject && "type" in conf && conf.type === "local"
        const isRemote = isObject && "type" in conf && conf.type === "remote"
        const configEnabled = isObject && "enabled" in conf ? (conf as any).enabled !== false : true
        const enabled = name in overrides ? overrides[name] : configEnabled
        const statusObj = statusMap[name]
        const status = statusObj?.status ?? (enabled ? "connected" : "disabled")
        const command = isLocal ? (conf as McpLocalConfig).command.join(" ") : isRemote ? (conf as McpRemoteConfig).url : "Builtin MCP"
        const toolsCount = statusObj && "tools" in statusObj && statusObj.tools ? Object.keys((statusObj as any).tools ?? {}).length : 0

        return {
          name,
          enabled,
          status,
          command,
          toolsCount,
          isLocal,
          isRemote,
          config: conf,
        }
      })
      .filter((server) => !query || server.name.toLowerCase().includes(query) || server.command.toLowerCase().includes(query))
  })

  // Built-in plugins list
  const builtinPlugins = createMemo(() => {
    const rawList = (configData().plugin ?? []) as PluginEntry[]
    const query = searchQuery().toLowerCase().trim()
    const overrides = builtinOverrides()
    return BUILTIN_PLUGINS.map((p) => {
      const entry = rawList.find((item) => pluginName(item) === `builtin-${p.id}`)
      const configEnabled = entry ? pluginEnabled(entry) : true
      const enabled = p.id in overrides ? overrides[p.id] : configEnabled
      return {
        ...p,
        enabled,
      }
    }).filter((p) => !query || p.name.toLowerCase().includes(query) || p.desc.toLowerCase().includes(query))
  })

  // Installed Plugins list (including configured catalog plugins)
  const pluginsList = createMemo(() => {
    const rawList = (configData().plugin ?? []) as PluginEntry[]
    const query = searchQuery().toLowerCase().trim()
    const overrides = pluginOverrides()

    // Base installed list (exclude internal builtin-* which are managed in the Built-in section)
    const configured = rawList
      .filter((entry) => !pluginName(entry).startsWith("builtin-"))
      .map((entry) => {
        const name = pluginName(entry)
        const display = displayName(entry)
        const configEnabled = pluginEnabled(entry)
        const enabled = name in overrides ? overrides[name] : configEnabled
        const origin = pluginOrigin(entry)
        const catalogItem = CATALOG_ITEMS.find((item) => item.type === "plugin" && item.spec === name)

        return {
          entry,
          name,
          display: catalogItem?.name ?? display,
          desc: catalogItem?.desc,
          icon: catalogItem?.icon ?? "🧩",
          category: catalogItem?.category ?? "extension",
          enabled,
          origin,
          isLocal: origin === "local",
        }
      })

    // If none configured, show all default installed catalog plugins ready to toggle
    const items = configured.length > 0 ? configured : CATALOG_ITEMS.filter((item) => item.type === "plugin").map((item) => ({
      entry: item.spec!,
      name: item.spec!,
      display: item.name,
      desc: item.desc,
      icon: item.icon,
      category: item.category,
      enabled: true,
      origin: "npm" as const,
      isLocal: false,
    }))

    return items.filter((plugin) => !query || plugin.name.toLowerCase().includes(query) || plugin.display.toLowerCase().includes(query))
  })

  // Catalog filtered list
  const catalogList = createMemo(() => {
    const cat = discoverCategory()
    const query = searchQuery().toLowerCase().trim()
    return CATALOG_ITEMS.filter((item) => {
      const matchCat = cat === "all" || item.category === cat
      const matchQuery = !query || item.name.toLowerCase().includes(query) || item.desc.toLowerCase().includes(query)
      return matchCat && matchQuery
    })
  })

  // Pagination 10x10 for Discover Catalog
  const DISCOVER_PAGE_SIZE = 10
  const [discoverPage, setDiscoverPage] = createSignal(1)
  const discoverTotal = () => Math.max(1, Math.ceil(catalogList().length / DISCOVER_PAGE_SIZE))
  const pageDiscoverItems = createMemo(() => {
    const page = Math.min(discoverPage(), discoverTotal())
    const start = (page - 1) * DISCOVER_PAGE_SIZE
    return catalogList().slice(start, start + DISCOVER_PAGE_SIZE)
  })

  // Pagination 10x10 for MCP Servers
  const MCP_PAGE_SIZE = 10
  const [mcpPage, setMcpPage] = createSignal(1)
  const mcpTotal = () => Math.max(1, Math.ceil(mcpServers().length / MCP_PAGE_SIZE))
  const pageMcpServers = createMemo(() => {
    const page = Math.min(mcpPage(), mcpTotal())
    const start = (page - 1) * MCP_PAGE_SIZE
    return mcpServers().slice(start, start + MCP_PAGE_SIZE)
  })

  // Pagination 10x10 for Installed Plugins
  const PLUGINS_PAGE_SIZE = 10
  const [pluginsPage, setPluginsPage] = createSignal(1)
  const pluginsTotal = () => Math.max(1, Math.ceil(pluginsList().length / PLUGINS_PAGE_SIZE))
  const pagePluginsList = createMemo(() => {
    const page = Math.min(pluginsPage(), pluginsTotal())
    const start = (page - 1) * PLUGINS_PAGE_SIZE
    return pluginsList().slice(start, start + PLUGINS_PAGE_SIZE)
  })

  // Pagination 10x10 for Built-in Plugins
  const BUILTIN_PAGE_SIZE = 10
  const [builtinPage, setBuiltinPage] = createSignal(1)
  const builtinTotal = () => Math.max(1, Math.ceil(builtinPlugins().length / BUILTIN_PAGE_SIZE))
  const pageBuiltinPlugins = createMemo(() => {
    const page = Math.min(builtinPage(), builtinTotal())
    const start = (page - 1) * BUILTIN_PAGE_SIZE
    return builtinPlugins().slice(start, start + BUILTIN_PAGE_SIZE)
  })

  createEffect(() => {
    discoverCategory()
    searchQuery()
    setDiscoverPage(1)
    setMcpPage(1)
    setPluginsPage(1)
    setBuiltinPage(1)
  })

  createEffect(() => {
    if (discoverPage() > discoverTotal()) setDiscoverPage(discoverTotal())
    if (mcpPage() > mcpTotal()) setMcpPage(mcpTotal())
    if (pluginsPage() > pluginsTotal()) setPluginsPage(pluginsTotal())
    if (builtinPage() > builtinTotal()) setBuiltinPage(builtinTotal())
  })

  // Toggle MCP Server
  const toggleMcpServer = (name: string, currentEnabled: boolean) => {
    const nextEnabled = !currentEnabled
    // 1. Inmediato (0 ms) reactivo y toast
    setMcpOverrides((prev) => ({ ...prev, [name]: nextEnabled }))
    showToast({
      variant: "success",
      title: nextEnabled ? `Servidor "${name}" activado y en ejecución` : `Servidor "${name}" desactivado`,
    })

    // 2. Ejecutar sincronización en segundo plano sin bloquear UI
    const currentConfig = { ...((configData().mcp ?? {}) as Record<string, any>) }
    const serverEntry = currentConfig[name]
    const updatedEntry =
      typeof serverEntry === "object" && serverEntry !== null
        ? { ...serverEntry, enabled: nextEnabled }
        : { enabled: nextEnabled }

    currentConfig[name] = updatedEntry

    const syncTask = async () => {
      if (nextEnabled && typeof serverEntry === "object" && serverEntry !== null) {
        await serverSdk().client.mcp.add({ ...params(), name, config: updatedEntry as any }).catch(() => {})
        await serverSdk().client.mcp.connect({ ...params(), name }).catch(() => {})
      } else if (!nextEnabled) {
        await serverSdk().client.mcp.add({ ...params(), name, config: updatedEntry as any }).catch(() => {})
      }
      await serverSdk().client.config.update({ ...params(), config: { mcp: currentConfig } })
      void refetchConfig()
      void refetchStatus()
    }

    void syncTask().catch(() => {
      setMcpOverrides((prev) => {
        const next = { ...prev }
        delete next[name]
        return next
      })
      showToast({ variant: "error", title: "Error al actualizar el servidor MCP" })
    })
  }

  // Remove MCP Server
  const removeMcpServer = async (name: string) => {
    if (!window.confirm(`¿Deseas desconectar y eliminar el servidor MCP "${name}"?`)) return
    try {
      const currentConfig = { ...((configData().mcp ?? {}) as Record<string, any>) }
      delete currentConfig[name]
      await serverSdk().client.config.update({ ...params(), config: { mcp: currentConfig } })
      void refetchConfig()
      void refetchStatus()
      showToast({ variant: "success", title: `Servidor "${name}" eliminado` })
    } catch {
      showToast({ variant: "error", title: "Error al eliminar el servidor MCP" })
    }
  }

  // Toggle Built-in Plugin with proper tuple handling
  const toggleBuiltinPlugin = (id: string, currentEnabled: boolean) => {
    const nextEnabled = !currentEnabled
    // 1. Inmediato (0 ms)
    setBuiltinOverrides((prev) => ({ ...prev, [id]: nextEnabled }))
    showToast({
      variant: "success",
      title: nextEnabled ? `Plugin integrado activado` : `Plugin integrado desactivado`,
    })

    // 2. Sincronización en segundo plano
    const currentPlugins = [...((configData().plugin ?? []) as PluginEntry[])]
    const pluginId = `builtin-${id}`
    const updated = currentPlugins.filter((p) => pluginName(p) !== pluginId)
    if (!nextEnabled) {
      updated.push([pluginId, { enabled: false }])
    }

    void serverSdk()
      .client.config.update({ ...params(), config: { plugin: updated } as any })
      .then(() => {
        void refetchConfig()
      })
      .catch(() => {
        setBuiltinOverrides((prev) => {
          const next = { ...prev }
          delete next[id]
          return next
        })
        showToast({ variant: "error", title: "Error al actualizar plugin" })
      })
  }

  // Toggle Plugin with proper PluginEntry tuple format
  const togglePlugin = (spec: PluginEntry, currentEnabled: boolean) => {
    const nextEnabled = !currentEnabled
    const targetName = pluginName(spec)

    // 1. Inmediato (0 ms)
    setPluginOverrides((prev) => ({ ...prev, [targetName]: nextEnabled }))
    showToast({
      variant: "success",
      title: nextEnabled ? `Plugin activado` : `Plugin desactivado`,
    })

    // 2. Sincronización en segundo plano
    const currentPlugins = [...((configData().plugin ?? []) as PluginEntry[])]
    let found = false
    const updated = currentPlugins.map((p) => {
      if (pluginName(p) === targetName) {
        found = true
        if (nextEnabled) {
          if (Array.isArray(p)) {
            const opts = { ...p[1] }
            delete (opts as any).enabled
            return Object.keys(opts).length > 0 ? ([p[0], opts] as PluginEntry) : p[0]
          }
          return p
        } else {
          if (Array.isArray(p)) {
            return [p[0], { ...p[1], enabled: false }] as PluginEntry
          }
          return [p, { enabled: false }] as PluginEntry
        }
      }
      return p
    })

    if (!found) {
      if (!nextEnabled) {
        updated.push([targetName, { enabled: false }])
      } else {
        updated.push(targetName)
      }
    }

    void serverSdk()
      .client.config.update({ ...params(), config: { plugin: updated } as any })
      .then(() => {
        void refetchConfig()
      })
      .catch(() => {
        setPluginOverrides((prev) => {
          const next = { ...prev }
          delete next[targetName]
          return next
        })
        showToast({ variant: "error", title: "Error al actualizar el plugin" })
      })
  }

  // Add / Install from Catalog
  const installCatalogItem = async (item: (typeof CATALOG_ITEMS)[number]) => {
    try {
      if (item.type === "mcp" && item.command) {
        const currentMcp = { ...((configData().mcp ?? {}) as Record<string, any>) }
        const config: McpLocalConfig = {
          type: "local",
          command: item.command.split(" "),
          enabled: true,
        }
        currentMcp[item.id] = config
        await serverSdk().client.mcp.add({ ...params(), name: item.id, config }).catch(() => {})
        await serverSdk().client.mcp.connect({ ...params(), name: item.id }).catch(() => {})
        await serverSdk().client.config.update({ ...params(), config: { mcp: currentMcp } })
        void refetchConfig()
        void refetchStatus()
        showToast({ variant: "success", title: `Servidor MCP "${item.name}" conectado y corriendo` })
      } else if (item.type === "plugin" && item.spec) {
        const currentPlugins = [...((configData().plugin ?? []) as PluginEntry[])]
        if (!currentPlugins.some((p) => pluginName(p) === item.spec)) {
          currentPlugins.push(item.spec)
        }
        await serverSdk().client.config.update({ ...params(), config: { plugin: currentPlugins } })
        void refetchConfig()
        showToast({ variant: "success", title: `Plugin "${item.name}" instalado con éxito` })
      }
    } catch {
      showToast({ variant: "error", title: `Error al instalar ${item.name}` })
    }
  }

  // Save Custom Add Modal
  const handleSaveModal = async () => {
    const name = formName().trim()
    const cmd = formCommand().trim()
    if (!name || !cmd) {
      showToast({ variant: "error", title: "Completa el nombre y comando / URL" })
      return
    }

    setSubmitting(true)
    try {
      if (addMode() === "mcp") {
        const isUrl = cmd.startsWith("http://") || cmd.startsWith("https://") || cmd.startsWith("sse://")
        const currentMcp = { ...((configData().mcp ?? {}) as Record<string, any>) }
        if (isUrl) {
          currentMcp[name] = { type: "remote", url: cmd, enabled: true }
        } else {
          currentMcp[name] = { type: "local", command: cmd.split(" "), enabled: true }
        }
        await serverSdk().client.mcp.add({ ...params(), name, config: currentMcp[name] }).catch(() => {})
        await serverSdk().client.mcp.connect({ ...params(), name }).catch(() => {})
        await serverSdk().client.config.update({ ...params(), config: { mcp: currentMcp } })
      } else {
        const currentPlugins = [...((configData().plugin ?? []) as PluginEntry[])]
        if (!currentPlugins.some((p) => pluginName(p) === cmd)) {
          currentPlugins.push(cmd)
        }
        await serverSdk().client.config.update({ ...params(), config: { plugin: currentPlugins } })
      }

      void refetchConfig()
      void refetchStatus()
      setShowAddModal(false)
      setFormName("")
      setFormCommand("")
      showToast({ variant: "success", title: "Añadido exitosamente" })
    } catch {
      showToast({ variant: "error", title: "Error al guardar la configuración" })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      {/* Header */}
      <div class="settings-v2-tab-header settings-v2-tab-header--stacked">
        <div class="flex items-center justify-between gap-4 w-full">
          <div>
            <h2 class="settings-v2-tab-title">Plugins y Servidores MCP</h2>
            <p class="settings-v2-tab-description">
              Extiende las capacidades del agente con herramientas MCP externas y plugins de ciclo de vida.
            </p>
          </div>
          <div class="flex items-center gap-2">
            <ButtonV2
              variant="contrast"
              size="small"
              icon="plus"
              class="rounded-lg px-3 h-8 shadow-sm font-medium"
              onClick={() => {
                setAddMode(activeTab() === "plugins" ? "plugin" : "mcp")
                setShowAddModal(true)
              }}
            >
              {activeTab() === "plugins" ? "Añadir Plugin" : "Añadir Servidor"}
            </ButtonV2>
          </div>
        </div>
      </div>

      <div class="settings-v2-tab-body">
        {/* Navigation & Controls */}
        <div class="mcp-plugins-segmented-wrapper">
          <SegmentedControlV2 value={activeTab()} onChange={(v) => setActiveTab(v as TabMode)}>
            <SegmentedControlItemV2 value="plugins">
              <span class="flex items-center gap-1.5 whitespace-nowrap">
                <span>🧩 Plugins ({pluginsList().length + builtinPlugins().length})</span>
              </span>
            </SegmentedControlItemV2>
            <SegmentedControlItemV2 value="mcp">
              <span class="flex items-center gap-1.5 whitespace-nowrap">
                <span>🔌 Servidores MCP ({mcpServers().length})</span>
              </span>
            </SegmentedControlItemV2>
            <SegmentedControlItemV2 value="discover">
              <span class="flex items-center gap-1.5 whitespace-nowrap">
                <span>✨ Descubrir ({catalogList().length})</span>
              </span>
            </SegmentedControlItemV2>
          </SegmentedControlV2>

          <div class="mcp-plugins-search-box">
            <TextInputV2
              type="search"
              appearance="base"
              value={searchQuery()}
              onInput={(e) => setSearchQuery(e.currentTarget.value)}
              placeholder="Buscar por nombre, herramienta o comando..."
              aria-label="Buscar"
            />
          </div>
        </div>

        {/* TAB 1: MCP SERVERS */}
        <Show when={activeTab() === "mcp"}>
          <div class="flex flex-col gap-4">
            <div class="p-3.5 rounded-xl border border-cyan-500/20 bg-gradient-to-r from-cyan-950/20 via-slate-900/40 to-indigo-950/20 backdrop-blur-sm">
              <div class="flex items-start gap-3">
                <div class="size-8 rounded-lg bg-cyan-500/10 text-cyan-400 flex items-center justify-center shrink-0 mt-0.5 font-bold text-sm">
                  ⚡
                </div>
                <div class="flex flex-col gap-1">
                  <div class="flex items-center gap-2">
                    <h4 class="text-[13px] font-semibold text-v2-text-text-base">Arquitectura MCP (Model Context Protocol)</h4>
                    <span class="mcp-plugins-chip accent text-[10px]">v1.0 Activo</span>
                  </div>
                  <p class="text-[12px] text-slate-300 leading-relaxed mt-1">
                    <strong>MCP</strong> es un protocolo estándar que permite a los modelos de IA conectarse e interactuar de forma segura con herramientas externas, bases de datos (PostgreSQL, SQLite), software de diseño (Photoshop, Illustrator, InDesign), motores de videojuegos (Unreal Engine, Unity, Godot), navegadores y servicios web en tiempo real.
                  </p>
                  <div class="flex items-center gap-4 mt-2.5 pt-2 border-t border-white/5 text-[11px] text-slate-400 flex-wrap">
                    <span class="flex items-center gap-1">
                      <span class="text-cyan-400 font-bold">● Local (stdio):</span> Ejecución en tu máquina mediante scripts Python o comandos npx/uvx.
                    </span>
                    <span class="flex items-center gap-1">
                      <span class="text-indigo-400 font-bold">● Remoto (HTTP/SSE):</span> Conexión segura a servidores MCP en la nube o en tu red local.
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <Show
              when={mcpServers().length > 0}
              fallback={
                <div class="flex flex-col items-center justify-center p-12 text-center rounded-xl border border-dashed border-v2-border-border-muted bg-v2-background-bg-layer-01/40">
                  <div class="size-12 rounded-2xl bg-cyan-400/10 text-cyan-400 flex items-center justify-center mb-3">
                    <Icon name="mcp" size="large" />
                  </div>
                  <h3 class="text-[14px] font-medium text-v2-text-text-base">Sin servidores MCP conectados</h3>
                  <p class="text-[12px] text-v2-text-text-muted max-w-sm mt-1 mb-4">
                    Conecta herramientas externas como bases de datos, APIs o navegadores para que el agente las use libremente.
                  </p>
                  <div class="flex items-center gap-2">
                    <ButtonV2
                      variant="neutral"
                      size="small"
                      onClick={() => setActiveTab("discover")}
                    >
                      Explorar Catálogo
                    </ButtonV2>
                    <ButtonV2
                      variant="contrast"
                      size="small"
                      icon="plus"
                      onClick={() => {
                        setAddMode("mcp")
                        setShowAddModal(true)
                      }}
                    >
                      Añadir Manualmente
                    </ButtonV2>
                  </div>
                </div>
              }
            >
              <div class="mcp-plugins-table mcp-plugins-table--mcp">
                <div class="mcp-plugins-thead">
                  <div>Servidor MCP</div>
                  <div>Tipo & Alcance</div>
                  <div>Comando / Endpoint SSE</div>
                  <div>Estado</div>
                  <div class="text-right">Acción</div>
                </div>

                <div class="divide-y divide-white/[0.04]">
                  <For each={pageMcpServers()}>
                    {(server) => (
                      <div class="mcp-plugins-row">
                        {/* 1. Servidor MCP */}
                        <div class="mcp-plugins-cell gap-3 pr-2">
                          <div class="size-9 rounded-xl bg-white/[0.06] border border-white/10 flex items-center justify-center shrink-0 text-lg shadow-sm">
                            🔌
                          </div>
                          <div class="flex flex-col min-w-0">
                            <div class="flex items-center gap-1.5">
                              <span class="text-xs font-semibold text-slate-100 truncate" title={server.name}>
                                {server.name}
                              </span>
                              <span
                                class="mcp-plugins-status-dot"
                                classList={{
                                  connected: server.status === "connected" && server.enabled,
                                  error: server.status === "failed",
                                  disconnected: !server.enabled || server.status === "disabled" || server.status === "needs_auth",
                                }}
                                title={`Estado: ${server.enabled ? server.status : "desactivado"}`}
                              />
                            </div>
                            <span class="text-[10px] text-slate-400 truncate">
                              {server.enabled && server.status === "connected" ? "Conectado" : !server.enabled ? "Desactivado" : server.status}
                            </span>
                          </div>
                        </div>

                        {/* 2. Tipo & Alcance */}
                        <div class="mcp-plugins-cell gap-2 pr-2">
                          <span class="mcp-plugins-chip mcp-plugins-chip--category accent text-[10px]">
                            {server.isLocal ? "Local (stdio)" : "Remoto (SSE)"}
                          </span>
                          <Show when={server.toolsCount > 0}>
                            <span class="mcp-plugins-chip mcp-plugins-chip--type text-[10px]">
                              {server.toolsCount} {server.toolsCount === 1 ? "herramienta" : "herramientas"}
                            </span>
                          </Show>
                        </div>

                        {/* 3. Comando / Endpoint SSE */}
                        <div class="mcp-plugins-cell pr-3">
                          <div class="win11-spec-badge max-w-full text-[10.5px] py-0.5 px-2" title={server.command}>
                            <span class="truncate font-mono">{server.command}</span>
                          </div>
                        </div>

                        {/* 4. Estado */}
                        <div class="mcp-plugins-cell mcp-plugins-cell--status">
                          <Switch
                            checked={server.enabled}
                            onChange={() => void toggleMcpServer(server.name, server.enabled)}
                          />
                          <span
                            class="settings-v2-chip text-[10px]"
                            data-tone={server.enabled ? "accent" : "muted"}
                          >
                            {server.enabled ? "Activo" : "Inactivo"}
                          </span>
                        </div>

                        {/* 5. Acción */}
                        <div class="mcp-plugins-cell justify-end">
                          <IconButtonV2
                            type="button"
                            variant="ghost-muted"
                            size="small"
                            icon={<IconV2 name="trash" class="text-v2-icon-icon-muted hover:text-v2-state-fg-danger" />}
                            aria-label="Eliminar servidor"
                            onClick={() => void removeMcpServer(server.name)}
                          />
                        </div>
                      </div>
                    )}
                  </For>
                </div>
              </div>

              <Show when={mcpTotal() > 1}>
                <SettingsPagerV2
                  page={mcpPage()}
                  totalPages={mcpTotal()}
                  onPage={setMcpPage}
                />
              </Show>
            </Show>
          </div>
        </Show>

        {/* TAB 2: PLUGINS */}
        <Show when={activeTab() === "plugins"}>
          <div class="flex flex-col gap-6">
            {/* Installed & Extension Plugins */}
            <div class="flex flex-col gap-3">
              <div class="flex items-center justify-between">
                <h3 class="text-[13px] font-semibold text-v2-text-text-base flex items-center gap-2">
                  <span>Plugins Instalados y Extensiones</span>
                  <span class="mcp-plugins-chip">{pluginsList().length}</span>
                </h3>
              </div>

              <div class="mcp-plugins-table mcp-plugins-table--plugins">
                <div class="mcp-plugins-thead">
                  <div>Plugin / Extensión</div>
                  <div>Categoría & Tipo</div>
                  <div>Descripción / Especificación</div>
                  <div>Estado</div>
                </div>

                <div class="divide-y divide-white/[0.04]">
                  <For each={pagePluginsList()}>
                    {(plugin) => (
                      <div class="mcp-plugins-row">
                        {/* 1. Plugin */}
                        <div class="mcp-plugins-cell gap-3 pr-2">
                          <div class="size-9 rounded-xl bg-white/[0.06] border border-white/10 flex items-center justify-center shrink-0 text-lg shadow-sm">
                            {plugin.icon}
                          </div>
                          <div class="flex flex-col min-w-0">
                            <span class="text-xs font-semibold text-slate-100 truncate" title={plugin.display}>
                              {plugin.display}
                            </span>
                            <span class="text-[10px] font-mono text-slate-400 truncate">
                              {plugin.name}
                            </span>
                          </div>
                        </div>

                        {/* 2. Categoría & Tipo */}
                        <div class="mcp-plugins-cell gap-2 pr-2">
                          <span class="mcp-plugins-chip mcp-plugins-chip--category accent text-[10px]">
                            {formatCategory(plugin.category)}
                          </span>
                          <span class="mcp-plugins-chip mcp-plugins-chip--type text-[10px]">
                            {plugin.isLocal ? "Local" : "Plugin"}
                          </span>
                        </div>

                        {/* 3. Descripción */}
                        <div class="mcp-plugins-cell pr-3">
                          <p class="text-[11.5px] text-slate-400 line-clamp-1 leading-normal m-0" title={plugin.desc ?? plugin.name}>
                            {plugin.desc ?? plugin.name}
                          </p>
                        </div>

                        {/* 4. Estado */}
                        <div class="mcp-plugins-cell mcp-plugins-cell--status">
                          <Switch
                            checked={plugin.enabled}
                            onChange={() => void togglePlugin(plugin.entry, plugin.enabled)}
                          />
                          <span
                            class="settings-v2-chip text-[10px]"
                            data-tone={plugin.enabled ? "accent" : "muted"}
                          >
                            {plugin.enabled ? "Activo" : "Inactivo"}
                          </span>
                        </div>
                      </div>
                    )}
                  </For>
                </div>
              </div>

              <Show when={pluginsTotal() > 1}>
                <SettingsPagerV2
                  page={pluginsPage()}
                  totalPages={pluginsTotal()}
                  onPage={setPluginsPage}
                />
              </Show>
            </div>

            {/* Built-in Plugins */}
            <div class="flex flex-col gap-3 pt-4 border-t border-v2-border-border-muted">
              <div class="flex items-center justify-between">
                <h3 class="text-[13px] font-semibold text-v2-text-text-base flex items-center gap-2">
                  <span>Built-in Integrados</span>
                  <span class="mcp-plugins-chip">{builtinPlugins().length}</span>
                </h3>
              </div>

              <div class="mcp-plugins-table mcp-plugins-table--plugins">
                <div class="mcp-plugins-thead">
                  <div>Plugin Integrado</div>
                  <div>Categoría & Tipo</div>
                  <div>Descripción</div>
                  <div>Estado</div>
                </div>

                <div class="divide-y divide-white/[0.04]">
                  <For each={pageBuiltinPlugins()}>
                    {(plugin) => (
                      <div class="mcp-plugins-row">
                        {/* 1. Plugin */}
                        <div class="mcp-plugins-cell gap-3 pr-2">
                          <div class="size-9 rounded-xl bg-white/[0.06] border border-white/10 flex items-center justify-center shrink-0 text-lg shadow-sm">
                            {plugin.icon}
                          </div>
                          <div class="flex flex-col min-w-0">
                            <span class="text-xs font-semibold text-slate-100 truncate" title={plugin.name}>
                              {plugin.name}
                            </span>
                            <span class="text-[10px] font-mono text-slate-400 truncate">
                              builtin-{plugin.id}
                            </span>
                          </div>
                        </div>

                        {/* 2. Categoría & Tipo */}
                        <div class="mcp-plugins-cell gap-2 pr-2">
                          <span class="mcp-plugins-chip mcp-plugins-chip--category accent text-[10px]">
                            {formatCategory(plugin.category)}
                          </span>
                          <span class="mcp-plugins-chip mcp-plugins-chip--type text-[10px]">
                            Built-in
                          </span>
                        </div>

                        {/* 3. Descripción */}
                        <div class="mcp-plugins-cell pr-3">
                          <p class="text-[11.5px] text-slate-400 line-clamp-1 leading-normal m-0" title={plugin.desc}>
                            {plugin.desc}
                          </p>
                        </div>

                        {/* 4. Estado */}
                        <div class="mcp-plugins-cell mcp-plugins-cell--status">
                          <Switch
                            checked={plugin.enabled}
                            onChange={() => void toggleBuiltinPlugin(plugin.id, plugin.enabled)}
                          />
                          <span
                            class="settings-v2-chip text-[10px]"
                            data-tone={plugin.enabled ? "accent" : "muted"}
                          >
                            {plugin.enabled ? "Activo" : "Inactivo"}
                          </span>
                        </div>
                      </div>
                    )}
                  </For>
                </div>
              </div>

              <Show when={builtinTotal() > 1}>
                <SettingsPagerV2
                  page={builtinPage()}
                  totalPages={builtinTotal()}
                  onPage={setBuiltinPage}
                />
              </Show>
            </div>
          </div>
        </Show>

        {/* TAB 3: DISCOVER CATALOG - WINDOWS 11 FLUENT STORE DESIGN */}
        <Show when={activeTab() === "discover"}>
          <div class="win11-discover-wrapper">
            {/* Windows 11 Mica Showcase Banner */}
            <div class="win11-hero-banner">
              <div class="win11-hero-glow" />
              <div class="win11-hero-content">
                <div class="flex items-start gap-3.5">
                  <div class="win11-hero-icon-box">
                    <span class="text-xl">🪟</span>
                  </div>
                  <div class="flex flex-col gap-1">
                    <div class="flex items-center gap-2 flex-wrap">
                      <h3 class="win11-hero-title">Catálogo de Extensiones Windows 11</h3>
                      <span class="win11-badge-mica">Mica Fluent</span>
                      <span class="win11-badge-store">Store Ready</span>
                    </div>
                    <p class="win11-hero-desc">
                      Descubre herramientas oficiales del protocolo MCP y plugins modulares. Conexión nativa con un clic para tus sub-agentes autónomos y flujos de trabajo.
                    </p>
                  </div>
                </div>
                <div class="win11-hero-meta">
                  <div class="win11-meta-stat">
                    <span class="win11-meta-value">{catalogList().length}</span>
                    <span class="win11-meta-label">Extensiones</span>
                  </div>
                  <div class="win11-meta-divider" />
                  <div class="win11-meta-stat">
                    <span class="win11-meta-value">{mcpServers().length + pluginsList().length}</span>
                    <span class="win11-meta-label">Instaladas</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Windows 11 Fluent Category Filter Bar */}
            <div class="win11-filter-bar no-scrollbar">
              <For
                each={[
                  { id: "all", label: "Todos", icon: "🌐" },
                  { id: "desarrollo", label: "Desarrollo", icon: "💻" },
                  { id: "ia", label: "IA & Agentes", icon: "🧠" },
                  { id: "seguridad", label: "Seguridad", icon: "🛡️" },
                  { id: "web", label: "Web & Browser", icon: "🌍" },
                  { id: "database", label: "Bases de Datos", icon: "🗄️" },
                  { id: "cloud", label: "Cloud & DevOps", icon: "☁️" },
                  { id: "finanzas", label: "Finanzas", icon: "💳" },
                  { id: "diseno", label: "Diseño", icon: "🎨" },
                  { id: "ventas", label: "Ventas", icon: "📊" },
                  { id: "datos", label: "Datos", icon: "🏛️" },
                ]}
              >
                {(cat) => {
                  const isActive = () => discoverCategory() === cat.id
                  return (
                    <button
                      type="button"
                      class="win11-filter-chip"
                      classList={{ active: isActive() }}
                      onClick={() => setDiscoverCategory(cat.id)}
                    >
                      <span class="win11-chip-icon">{cat.icon}</span>
                      <span>{cat.label}</span>
                    </button>
                  )
                }}
              </For>
            </div>

            {/* Windows 11 Fluent App List View (10x10) */}
            <div class="mcp-plugins-table">
              <div class="mcp-plugins-thead">
                <div>Extensión / Herramienta</div>
                <div>Categoría</div>
                <div>Comando / Especificación & Descripción</div>
                <div class="text-right">Acción</div>
              </div>

              <div class="divide-y divide-white/[0.04]">
                <For each={pageDiscoverItems()}>
                  {(item) => {
                    const isInstalled = createMemo(() => {
                      if (item.type === "mcp") return mcpServers().some((s) => s.name === item.id)
                      return pluginsList().some((p) => p.name === item.spec)
                    })

                    return (
                      <div class="mcp-plugins-row">
                        {/* 1. Extensión / Herramienta */}
                        <div class="mcp-plugins-cell gap-3 pr-2">
                          <div class="size-9 rounded-xl bg-white/[0.06] border border-white/10 flex items-center justify-center shrink-0 text-lg shadow-sm">
                            {item.icon}
                          </div>
                          <div class="flex flex-col min-w-0">
                            <div class="flex items-center gap-1.5 flex-wrap">
                              <span class="text-xs font-semibold text-slate-100 truncate" title={item.name}>
                                {item.name}
                              </span>
                              <Show when={item.popular}>
                                <span class="win11-badge-popular text-[9px] py-0 px-1.5">⭐ Top</span>
                              </Show>
                            </div>
                            <div class="flex items-center gap-1.5 mt-0.5">
                              <span
                                class="win11-app-pill text-[9.5px]"
                                classList={{
                                  "pill-mcp": item.type === "mcp",
                                  "pill-plugin": item.type === "plugin",
                                }}
                              >
                                {item.type === "mcp" ? "MCP" : "Plugin"}
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* 2. Categoría */}
                        <div class="mcp-plugins-cell pr-2">
                          <span class="mcp-category-badge">
                            {formatCategory(item.category)}
                          </span>
                        </div>

                        {/* 3. Comando / Especificación & Descripción */}
                        <div class="mcp-plugins-cell flex-col items-start gap-1 pr-3">
                          <div class="win11-spec-badge max-w-full text-[10.5px] py-0.5 px-2" title={item.command ?? item.spec}>
                            <span class="truncate font-mono">{item.command ?? item.spec}</span>
                          </div>
                          <p class="text-[11px] text-slate-400 line-clamp-1 leading-normal m-0">
                            {item.desc}
                          </p>
                        </div>

                        {/* 4. Estado / Acción */}
                        <div class="mcp-plugins-cell justify-end">
                          <button
                            type="button"
                            class="win11-action-btn text-xs py-1.5 px-3"
                            classList={{
                              "btn-installed": isInstalled(),
                              "btn-install": !isInstalled(),
                            }}
                            disabled={isInstalled()}
                            onClick={() => void installCatalogItem(item)}
                          >
                            <Show when={isInstalled()} fallback={<><span>Obtener</span><span class="text-xs">↗</span></>}>
                              <span>✓ Instalado</span>
                            </Show>
                          </button>
                        </div>
                      </div>
                    )
                  }}
                </For>
              </div>
            </div>

            <Show when={discoverTotal() > 1}>
              <SettingsPagerV2
                page={discoverPage()}
                totalPages={discoverTotal()}
                onPage={setDiscoverPage}
              />
            </Show>
          </div>
        </Show>
      </div>

      {/* Modal Añadir Servidor / Plugin */}
      <Show when={showAddModal()}>
        <div class="mcp-plugins-dialog-backdrop" onClick={() => setShowAddModal(false)}>
          <div class="mcp-plugins-modal" onClick={(e) => e.stopPropagation()}>
            <div class="flex items-center justify-between pb-2 border-b border-v2-border-border-muted">
              <h3 class="text-[16px] font-semibold text-v2-text-text-base">
                {addMode() === "mcp" ? "Añadir Servidor MCP" : "Añadir Plugin"}
              </h3>
              <IconButtonV2
                type="button"
                variant="ghost-muted"
                size="small"
                icon={<IconV2 name="close" />}
                aria-label="Cerrar"
                onClick={() => setShowAddModal(false)}
              />
            </div>

            <div class="flex flex-col gap-3">
              <label class="flex flex-col gap-1.5">
                <span class="text-[12px] font-medium text-v2-text-text-base">Identificador / Nombre</span>
                <TextInputV2
                  value={formName()}
                  onInput={(e) => setFormName(e.currentTarget.value)}
                  placeholder="ej. filesystem, sqlite, analytics"
                />
              </label>

              <label class="flex flex-col gap-1.5">
                <span class="text-[12px] font-medium text-v2-text-text-base">
                  {addMode() === "mcp" ? "Comando de ejecución o URL SSE" : "Paquete npm o ruta local"}
                </span>
                <TextInputV2
                  value={formCommand()}
                  onInput={(e) => setFormCommand(e.currentTarget.value)}
                  placeholder={
                    addMode() === "mcp"
                      ? "ej. npx -y @modelcontextprotocol/server-sqlite . o https://api.mcp.io/sse"
                      : "ej. @org/plugin-name o .tiancode/plugins/my-plugin.ts"
                  }
                />
              </label>
            </div>

            <div class="flex items-center justify-end gap-2 pt-2 border-t border-v2-border-border-muted">
              <ButtonV2 variant="neutral" size="normal" onClick={() => setShowAddModal(false)}>
                Cancelar
              </ButtonV2>
              <ButtonV2
                variant="contrast"
                size="normal"
                disabled={submitting() || !formName().trim() || !formCommand().trim()}
                onClick={() => void handleSaveModal()}
              >
                {submitting() ? "Guardando..." : "Guardar y Conectar"}
              </ButtonV2>
            </div>
          </div>
        </div>
      </Show>
    </>
  )
}
