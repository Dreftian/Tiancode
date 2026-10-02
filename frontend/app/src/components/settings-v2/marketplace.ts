import type { MarketplaceItem, MarketplaceMcp, McpLocalConfig, McpRemoteConfig } from "@tiancode-ai/sdk/v2/client"

// Discover lists the catalog the server mirrors (Claude Code and Codex plugins, the Anthropic
// connector directory, the GitHub and official MCP registries, skill repositories and Cline's
// catalog) plus a few entries Tiancode picks itself, which come first.

/** Entries Tiancode recommends; their descriptions are translated (see `CURATED_DESCRIPTIONS`). */
export const CURATED_ITEMS: MarketplaceItem[] = [
  skill("diagram-design", "Diagram Design", "diseno", "https://github.com/cathrynlavery/diagram-design/tree/main/skills/diagram-design"),
  skill("security-audit", "Security Audit", "seguridad", "https://github.com/cloudflare/security-audit-skill/tree/main/skills/security-audit"),
  // Composio's hosted MCP: 1000+ app integrations behind one server, signed in through MCP OAuth
  // in the browser (no key in the catalog; per-user `x-consumer-api-key` headers are the user's).
  {
    id: "tiancode:composio",
    type: "mcp",
    name: "composio",
    title: "Composio",
    description: "Connect 1000+ apps (Gmail, Slack, GitHub, Notion…) through one MCP server.",
    source: "tiancode",
    category: "productividad",
    icon: "https://github.com/ComposioHQ.png?size=96",
    domain: "composio.dev",
    homepage: "https://docs.composio.dev/docs/composio-connect",
    verified: true,
    auth: "oauth",
    mcp: { transport: "remote", url: "https://connect.composio.dev/mcp" },
    installable: false,
  },
  // ui-skills.com (ibelick/ui-skills, MIT): design-engineering skills imported from GitHub.
  ...["baseline-ui", "fixing-accessibility", "fixing-motion-performance", "fixing-metadata", "improve-ui", "create-design-md"].map(
    (name) =>
      skill(
        name,
        name === "create-design-md" ? "Create DESIGN.md" : titleCase(name),
        "diseno",
        `https://github.com/ibelick/ui-skills/tree/main/skills/${name}`,
      ),
  ),
  skill("i-have-adhd", "I Have ADHD", "productividad", "https://github.com/ayghri/i-have-adhd/tree/main/skills/i-have-adhd"),
]

/** Which catalog an entry comes from, as the Discover source filter groups them. */
export function sourceGroup(source: string) {
  if (source === "tiancode") return "tiancode"
  if (source === "claude" || source === "claude-work" || source === "anthropic-skills") return "claude"
  if (source === "codex" || source === "openai-skills") return "codex"
  if (source === "github" || source === "registry") return "registry"
  if (source === "cline") return "cline"
  return "community"
}

export const SOURCE_GROUPS = ["tiancode", "claude", "codex", "registry", "cline", "community"] as const

/**
 * A catalog MCP entry as Tiancode config. It starts disabled: the user reviews it in the server
 * dialog, and turning it on there is the approval that runs it.
 */
export function mcpConfig(mcp: MarketplaceMcp): McpLocalConfig | McpRemoteConfig | undefined {
  if (mcp.transport === "remote") {
    if (!mcp.url) return
    return { type: "remote", url: mcp.url, ...(mcp.headers ? { headers: { ...mcp.headers } } : {}), enabled: false }
  }
  if (!mcp.command?.length) return
  return {
    type: "local",
    command: [...mcp.command],
    ...(mcp.environment ? { environment: { ...mcp.environment } } : {}),
    enabled: false,
  }
}

/** Catalog order, with matches on the name ahead of matches in the description. */
export function searchCatalog(items: MarketplaceItem[], query: string) {
  const term = query.toLowerCase().trim()
  if (!term) return items
  const rank = (item: MarketplaceItem) => {
    const title = item.title.toLowerCase()
    if (title === term || item.name === term) return 0
    if (title.startsWith(term) || item.name.startsWith(term)) return 1
    if (title.includes(term) || item.name.includes(term)) return 2
    if (item.description.toLowerCase().includes(term)) return 3
    return 4
  }
  return items
    .map((item, index) => ({ item, index, rank: rank(item) }))
    .filter((entry) => entry.rank < 4)
    .toSorted((a, b) => a.rank - b.rank || a.index - b.index)
    .map((entry) => entry.item)
}

/** One list from several, keeping the first entry for an id or for an MCP server's URL or command. */
export function mergeCatalog(...lists: MarketplaceItem[][]) {
  const seen = new Set<string>()
  return lists.flat().filter((item) => {
    const keys = [item.id, ...(item.mcp ? [mcpKey(item.mcp)] : [])]
    if (keys.some((key) => seen.has(key))) return false
    for (const key of keys) seen.add(key)
    return true
  })
}

/**
 * What identifies a server across versions: the URL's host and path, or the command without
 * version pins (pkg@1.2.3, pkg==1.2, image:tag) and docker's -e flags, so an upgraded catalog
 * entry still matches the server added from it.
 */
export function mcpKey(mcp: { url?: string; command?: readonly string[] }) {
  if (mcp.url && URL.canParse(mcp.url)) {
    const url = new URL(mcp.url)
    return `${url.hostname}${url.pathname.replace(/\/+$/, "")}`
  }
  return normalizedCommand(mcp.command ?? []).join(" ")
}

/** The package or image a local command runs: the first argument after the runner and its flags. */
export function mcpPackage(command: readonly string[]) {
  return normalizedCommand(command)
    .slice(1)
    .find((token) => !token.startsWith("-") && token !== "run")
}

function normalizedCommand(command: readonly string[]) {
  return command
    .filter((token, index) => token !== "-e" && command[index - 1] !== "-e")
    .map((token) =>
      token
        .replace(/^(@?[^@\s]+)@[\w.^~<>=*-]+$/, "$1")
        .replace(/==[\w.*-]+$/, "")
        .replace(/^([\w.-]+\/[\w./-]+):[\w.-]+$/, "$1"),
    )
}

function skill(name: string, title: string, category: string, url: string): MarketplaceItem {
  return {
    id: `tiancode:${name}`,
    type: "skill",
    name,
    title,
    description: "",
    source: "tiancode",
    category,
    icon: `https://github.com/${new URL(url).pathname.split("/")[1]}.png?size=96`,
    homepage: url,
    skillUrl: url,
    verified: true,
    installable: false,
  }
}

function titleCase(value: string) {
  return value
    .split("-")
    .map((word) => (word === "ui" ? "UI" : word[0]!.toUpperCase() + word.slice(1)))
    .join(" ")
}
