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

  onMount(() => {
    const timer = setInterval(() => void refetchStatus(), 8000)
    onCleanup(() => clearInterval(timer))
  })

  // Connected MCP servers list
  const mcpServers = createMemo(() => {
    const configMcp = (configData().mcp ?? {}) as Record<string, McpConfigValue>
    const statusMap = mcpStatusData()
    const query = searchQuery().toLowerCase().trim()

    return Object.entries(configMcp)
      .map(([name, conf]) => {
        const isObject = typeof conf === "object" && conf !== null
        const isLocal = isObject && "type" in conf && conf.type === "local"
        const isRemote = isObject && "type" in conf && conf.type === "remote"
        const enabled = isObject && "enabled" in conf ? (conf as any).enabled !== false : true
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
    return BUILTIN_PLUGINS.map((p) => {
      const entry = rawList.find((item) => pluginName(item) === `builtin-${p.id}`)
      const enabled = entry ? pluginEnabled(entry) : true
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

    // Base installed list
    const configured = rawList.map((entry) => {
      const name = pluginName(entry)
      const display = displayName(entry)
      const enabled = pluginEnabled(entry)
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

    // If none configured, show all 23 default installed plugins ready to toggle
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

  // Toggle MCP Server
  const toggleMcpServer = async (name: string, currentEnabled: boolean) => {
    const nextEnabled = !currentEnabled
    try {
      const currentConfig = { ...((configData().mcp ?? {}) as Record<string, any>) }
      const serverEntry = currentConfig[name]
      const updatedEntry =
        typeof serverEntry === "object" && serverEntry !== null
          ? { ...serverEntry, enabled: nextEnabled }
          : { enabled: nextEnabled }

      currentConfig[name] = updatedEntry

      if (nextEnabled && typeof serverEntry === "object" && serverEntry !== null) {
        await serverSdk().client.mcp.add({ ...params(), name, config: updatedEntry as any }).catch(() => {})
        await serverSdk().client.mcp.connect({ ...params(), name }).catch(() => {})
      } else if (!nextEnabled) {
        await serverSdk().client.mcp.add({ ...params(), name, config: updatedEntry as any }).catch(() => {})
      }
      await serverSdk().client.config.update({ ...params(), config: { mcp: currentConfig } })

      void refetchConfig()
      void refetchStatus()
      showToast({
        variant: "success",
        title: nextEnabled ? `Servidor "${name}" activado y en ejecución` : `Servidor "${name}" desactivado`,
      })
    } catch {
      showToast({ variant: "error", title: "Error al actualizar el servidor MCP" })
    }
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

  // Toggle Built-in Plugin
  const toggleBuiltinPlugin = async (id: string, currentEnabled: boolean) => {
    const nextEnabled = !currentEnabled
    const currentPlugins = [...((configData().plugin ?? []) as PluginEntry[])]
    const pluginId = `builtin-${id}`
    const updated = currentPlugins.filter((p) => pluginName(p) !== pluginId)
    if (!nextEnabled) {
      updated.push({ spec: pluginId, enabled: false } as any)
    }
    try {
      await serverSdk().client.config.update({ ...params(), config: { plugin: updated } as any })
      void refetchConfig()
      showToast({
        variant: "success",
        title: nextEnabled ? `Plugin integrado activado` : `Plugin integrado desactivado`,
      })
    } catch {
      showToast({ variant: "error", title: "Error al actualizar plugin" })
    }
  }

  // Toggle Plugin
  const togglePlugin = async (spec: PluginEntry, currentEnabled: boolean) => {
    const nextEnabled = !currentEnabled
    const currentPlugins = [...((configData().plugin ?? []) as PluginEntry[])]
    const targetName = pluginName(spec)

    let found = false
    const updated = currentPlugins.map((p) => {
      if (pluginName(p) === targetName) {
        found = true
        if (typeof p === "string") return `${p}@${nextEnabled ? "enabled" : "disabled"}`
        return { ...p, enabled: nextEnabled }
      }
      return p
    })

    if (!found) {
      updated.push({ spec: targetName, enabled: nextEnabled } as any)
    }

    try {
      await serverSdk().client.config.update({ ...params(), config: { plugin: updated } as any })
      void refetchConfig()
      showToast({
        variant: "success",
        title: nextEnabled ? `Plugin activado` : `Plugin desactivado`,
      })
    } catch {
      showToast({ variant: "error", title: "Error al actualizar el plugin" })
    }
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
              <div class="mcp-plugins-grid">
                <For each={mcpServers()}>
                  {(server) => (
                    <div
                      class="mcp-plugins-card"
                      classList={{ running: server.enabled && server.status === "connected" }}
                    >
                      <div class="mcp-plugins-card-header">
                        <div class="mcp-plugins-card-identity">
                          <div class="mcp-plugins-icon-badge">
                            <span>🔌</span>
                          </div>
                          <div class="mcp-plugins-card-info">
                            <div class="flex items-center gap-2">
                              <span class="mcp-plugins-card-title">{server.name}</span>
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
                            <span class="mcp-plugins-card-desc font-mono text-[11px] text-v2-text-text-faint truncate">
                              {server.command}
                            </span>
                          </div>
                        </div>
                        <Switch
                          checked={server.enabled}
                          onChange={() => void toggleMcpServer(server.name, server.enabled)}
                          hideLabel
                        >
                          {server.name}
                        </Switch>
                      </div>

                      <div class="mcp-plugins-card-footer">
                        <div class="mcp-plugins-badge-list">
                          <span class="mcp-plugins-chip accent">
                            {server.isLocal ? "Local" : "Remoto"}
                          </span>
                          <Show when={server.toolsCount > 0}>
                            <span class="mcp-plugins-chip">
                              {server.toolsCount} {server.toolsCount === 1 ? "herramienta" : "herramientas"}
                            </span>
                          </Show>
                        </div>
                        <div class="flex items-center gap-1">
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
                    </div>
                  )}
                </For>
              </div>
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

              <div class="mcp-plugins-grid">
                <For each={pluginsList()}>
                  {(plugin) => (
                    <div class="mcp-plugins-card" classList={{ running: plugin.enabled }}>
                      <div class="mcp-plugins-card-header">
                        <div class="mcp-plugins-card-identity">
                          <div class="mcp-plugins-icon-badge">
                            <span>{plugin.icon}</span>
                          </div>
                          <div class="mcp-plugins-card-info">
                            <span class="mcp-plugins-card-title">{plugin.display}</span>
                            <span class="mcp-plugins-card-desc text-[11px] text-v2-text-text-muted line-clamp-2">
                              {plugin.desc ?? plugin.name}
                            </span>
                          </div>
                        </div>
                        <Switch
                          checked={plugin.enabled}
                          onChange={() => void togglePlugin(plugin.entry, plugin.enabled)}
                          hideLabel
                        >
                          {plugin.display}
                        </Switch>
                      </div>

                      <div class="mcp-plugins-card-footer">
                        <div class="mcp-plugins-badge-list">
                          <span class="mcp-plugins-chip accent capitalize">
                            {plugin.category}
                          </span>
                          <span class="mcp-plugins-chip">
                            {plugin.isLocal ? "Local" : "Plugin"}
                          </span>
                        </div>
                        <span class="text-[11px] text-v2-text-text-muted">
                          {plugin.enabled ? "Activo" : "Inactivo"}
                        </span>
                      </div>
                    </div>
                  )}
                </For>
              </div>
            </div>

            {/* Built-in Plugins */}
            <div class="flex flex-col gap-3 pt-4 border-t border-v2-border-border-muted">
              <div class="flex items-center justify-between">
                <h3 class="text-[13px] font-semibold text-v2-text-text-base flex items-center gap-2">
                  <span>Built-in Integrados</span>
                  <span class="mcp-plugins-chip">{builtinPlugins().length}</span>
                </h3>
              </div>

              <div class="mcp-plugins-grid">
                <For each={builtinPlugins()}>
                  {(plugin) => (
                    <div class="mcp-plugins-card" classList={{ running: plugin.enabled }}>
                      <div class="mcp-plugins-card-header">
                        <div class="mcp-plugins-card-identity">
                          <div class="mcp-plugins-icon-badge">
                            <span>{plugin.icon}</span>
                          </div>
                          <div class="mcp-plugins-card-info">
                            <span class="mcp-plugins-card-title">{plugin.name}</span>
                            <span class="mcp-plugins-card-desc text-[11px] text-v2-text-text-muted line-clamp-2">
                              {plugin.desc}
                            </span>
                          </div>
                        </div>
                        <Switch
                          checked={plugin.enabled}
                          onChange={() => void toggleBuiltinPlugin(plugin.id, plugin.enabled)}
                          hideLabel
                        >
                          {plugin.name}
                        </Switch>
                      </div>

                      <div class="mcp-plugins-card-footer">
                        <div class="mcp-plugins-badge-list">
                          <span class="mcp-plugins-chip accent capitalize">
                            {plugin.category}
                          </span>
                          <span class="mcp-plugins-chip">
                            Built-in
                          </span>
                        </div>
                        <span class="text-[11px] text-v2-text-text-muted">
                          {plugin.enabled ? "Activo" : "Inactivo"}
                        </span>
                      </div>
                    </div>
                  )}
                </For>
              </div>
            </div>
          </div>
        </Show>

        {/* TAB 3: DISCOVER CATALOG */}
        <Show when={activeTab() === "discover"}>
          <div class="flex flex-col gap-4">
            <div class="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar">
              <For
                each={[
                  { id: "all", label: "Todos" },
                  { id: "desarrollo", label: "💻 Desarrollo" },
                  { id: "ia", label: "🧠 IA & Agentes" },
                  { id: "seguridad", label: "🛡️ Seguridad" },
                  { id: "web", label: "🌐 Web & Navegador" },
                  { id: "database", label: "🗄️ Bases de Datos" },
                  { id: "cloud", label: "☁️ Cloud & DevOps" },
                  { id: "finanzas", label: "💳 Finanzas" },
                  { id: "diseno", label: "🎨 Diseño" },
                  { id: "ventas", label: "📊 Ventas" },
                  { id: "datos", label: "🏛️ Datos" },
                ]}
              >
                {(cat) => (
                  <button
                    type="button"
                    class={`px-3 py-1.5 rounded-full text-[12px] font-medium transition-all ${
                      discoverCategory() === cat.id
                        ? "bg-v2-background-bg-inverse text-v2-text-text-inverse shadow-sm"
                        : "bg-v2-background-bg-layer-01 text-v2-text-text-muted hover:bg-v2-background-bg-layer-02 hover:text-v2-text-text-base border border-v2-border-border-muted"
                    }`}
                    onClick={() => setDiscoverCategory(cat.id)}
                  >
                    {cat.label}
                  </button>
                )}
              </For>
            </div>

            <div class="mcp-plugins-grid">
              <For each={catalogList()}>
                {(item) => {
                  const isInstalled = createMemo(() => {
                    if (item.type === "mcp") return mcpServers().some((s) => s.name === item.id)
                    return pluginsList().some((p) => p.name === item.spec)
                  })

                  return (
                    <div class="mcp-plugins-card">
                      <div class="mcp-plugins-card-header">
                        <div class="mcp-plugins-card-identity">
                          <div class="mcp-plugins-icon-badge">
                            <span>{item.icon}</span>
                          </div>
                          <div class="mcp-plugins-card-info">
                            <span class="mcp-plugins-card-title">{item.name}</span>
                            <span class="mcp-plugins-chip accent text-[10px]">
                              {item.type === "mcp" ? "Servidor MCP" : "Plugin Runtime"}
                            </span>
                          </div>
                        </div>
                      </div>

                      <p class="mcp-plugins-card-desc text-[12px] text-v2-text-text-muted">
                        {item.desc}
                      </p>

                      <div class="mcp-plugins-card-footer">
                        <span class="text-[11px] font-mono text-v2-text-text-faint truncate max-w-[150px]">
                          {item.command ?? item.spec}
                        </span>
                        <ButtonV2
                          variant={isInstalled() ? "neutral" : "contrast"}
                          size="small"
                          disabled={isInstalled()}
                          onClick={() => void installCatalogItem(item)}
                        >
                          {isInstalled() ? "Instalado" : "Conectar"}
                        </ButtonV2>
                      </div>
                    </div>
                  )
                }}
              </For>
            </div>
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
