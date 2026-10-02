export * as MarketplaceSources from "./sources"

import { MarketplaceCatalog, type Connector, type Item } from "./catalog"
import { MarketplaceFetch } from "./fetch"

// The public catalogs Discover mirrors. Each is fetched on its own and a failure leaves the others.

const RAW = "https://raw.githubusercontent.com"

export const CLAUDE_MARKETPLACES = [
  { source: "claude", owner: "anthropics", repo: "claude-plugins-official", verified: true },
  { source: "claude", owner: "anthropics", repo: "claude-code", verified: true },
  { source: "claude-work", owner: "anthropics", repo: "knowledge-work-plugins", verified: true },
  { source: "claude-work", owner: "anthropics", repo: "financial-services", verified: true },
  { source: "claude-work", owner: "anthropics", repo: "life-sciences", verified: true },
  { source: "claude-work", owner: "anthropics", repo: "claude-for-legal", verified: true },
  { source: "claude-work", owner: "anthropics", repo: "healthcare", verified: true },
  { source: "claude-work", owner: "anthropics", repo: "claude-tag-plugins", verified: true },
  { source: "claude-community", owner: "anthropics", repo: "claude-plugins-community", verified: false },
] as const

export interface Status {
  id: string
  ok: boolean
  count: number
}

export interface Snapshot {
  fetchedAt: number
  items: Item[]
  connectors: Connector[]
  sources: Status[]
}

/** Every source, fetched in parallel. */
export async function fetchAll(): Promise<Snapshot> {
  const tracked = async <T>(id: string, work: () => Promise<T[]>) => {
    const items = await work().catch(() => undefined)
    return { id, items: items ?? [], ok: items !== undefined }
  }
  const [directory, github, codex, anthropicSkills, openaiSkills, cline, ...claude] = await Promise.all([
    tracked("claude-directory", anthropicDirectory),
    tracked("github", () => registryPages("https://api.mcp.github.com/v0.1/servers?version=latest&limit=100", "github", 10)),
    tracked("codex", codexPlugins),
    tracked("anthropic-skills", async () =>
      MarketplaceCatalog.fromSkillMarketplace(
        await MarketplaceFetch.json(`${RAW}/anthropics/skills/main/.claude-plugin/marketplace.json`),
        { owner: "anthropics", repo: "skills", ref: "main" },
      ),
    ),
    tracked("openai-skills", async () =>
      MarketplaceCatalog.fromSkillTree(
        await MarketplaceFetch.json("https://api.github.com/repos/openai/skills/git/trees/main?recursive=1", {
          maxBytes: 16 * 1024 * 1024,
        }),
        { owner: "openai", repo: "skills", ref: "main", prefix: "skills/", source: "openai-skills" },
      ),
    ),
    tracked("cline", async () => MarketplaceCatalog.fromCline(await MarketplaceFetch.json("https://cline.github.io/marketplace/catalog.json"))),
    ...CLAUDE_MARKETPLACES.map((entry) =>
      tracked(`${entry.source}:${entry.repo}`, async () =>
        MarketplaceCatalog.fromClaudeMarketplace(
          await MarketplaceFetch.json(`${RAW}/${entry.owner}/${entry.repo}/main/.claude-plugin/marketplace.json`, {
            maxBytes: 16 * 1024 * 1024,
          }),
          { source: entry.source, owner: entry.owner, repo: entry.repo, ref: "main", verified: entry.verified },
        ),
      ),
    ),
  ])
  const connectors = MarketplaceCatalog.mergeConnectors(directory.items)
  const plugins = claude.flatMap((entry) => entry.items)
  // Order is precedence: an MCP server listed twice keeps the first source's entry.
  const items = MarketplaceCatalog.merge(
    MarketplaceCatalog.connectorItems(connectors),
    github.items,
    cline.items.filter((item) => item.type === "mcp"),
    plugins.filter((item) => item.source !== "claude-community"),
    codex.items,
    anthropicSkills.items,
    openaiSkills.items,
    cline.items.filter((item) => item.type === "skill"),
    plugins.filter((item) => item.source === "claude-community"),
  )
  return {
    fetchedAt: Date.now(),
    items,
    connectors,
    sources: [directory, github, codex, anthropicSkills, openaiSkills, cline, ...claude].map((entry) => ({
      id: entry.id,
      ok: entry.ok,
      count: entry.items.length,
    })),
  }
}

async function anthropicDirectory(): Promise<Connector[]> {
  const servers: unknown[] = []
  let cursor = ""
  for (let page = 0; page < 10; page++) {
    const value = await MarketplaceFetch.json(
      `https://api.anthropic.com/mcp-registry/v0/servers?version=latest&visibility=commercial&limit=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`,
    )
    const data = value as { servers?: unknown[]; metadata?: { nextCursor?: string } }
    servers.push(...(data.servers ?? []))
    cursor = data.metadata?.nextCursor ?? ""
    if (!cursor) break
  }
  if (servers.length === 0) throw new Error("empty connector directory")
  return MarketplaceCatalog.fromAnthropicDirectory(servers)
}

async function registryPages(base: string, source: "github" | "registry", pages: number) {
  const items: Item[] = []
  let cursor = ""
  for (let page = 0; page < pages; page++) {
    const value = await MarketplaceFetch.json(`${base}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`)
    items.push(...MarketplaceCatalog.fromMcpRegistry(value, source))
    cursor = (value as { metadata?: { nextCursor?: string } }).metadata?.nextCursor ?? ""
    if (!cursor) break
  }
  return items
}

async function codexPlugins() {
  const owner = "openai"
  const repo = "plugins"
  const ref = "main"
  const marketplace = await MarketplaceFetch.json(`${RAW}/${owner}/${repo}/${ref}/.agents/plugins/marketplace.json`)
  const plugins = ((marketplace as { plugins?: { name?: unknown; source?: unknown }[] }).plugins ?? []).flatMap((plugin) => {
    const source = plugin.source
    const path =
      typeof source === "string"
        ? source
        : source && typeof source === "object" && (source as { source?: unknown }).source === "local"
          ? String((source as { path?: unknown }).path ?? "")
          : ""
    return typeof plugin.name === "string" && path.startsWith("./") ? [{ name: plugin.name, path: path.slice(2) }] : []
  })
  // Logos and short descriptions live in each plugin's own manifest.
  const manifests = await MarketplaceFetch.pool(plugins, 8, async (plugin) => {
    const base = `${RAW}/${owner}/${repo}/${ref}/${plugin.path}`
    return [plugin.name, MarketplaceCatalog.codexPluginInfo(await MarketplaceFetch.json(`${base}/.codex-plugin/plugin.json`), base)] as const
  })
  const logos = Object.fromEntries(manifests.flatMap((entry) => (entry && entry[1] ? [[entry[0], entry[1]]] : [])))
  return MarketplaceCatalog.fromCodexMarketplace(marketplace, { owner, repo, ref, logos })
}

/** Live search in the official MCP Registry (38k servers) for what the mirrored lists lack. */
export async function searchRegistry(query: string) {
  const value = await MarketplaceFetch.json(
    `https://registry.modelcontextprotocol.io/v0.1/servers?version=latest&limit=40&search=${encodeURIComponent(query)}`,
    { timeoutMs: 12_000 },
  )
  return MarketplaceCatalog.fromMcpRegistry(value, "registry")
}
