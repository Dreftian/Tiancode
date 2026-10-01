import { z } from "zod"
import type { McpLocalConfig, McpRemoteConfig } from "@tiancode-ai/sdk/v2/client"
import snapshot from "./marketplace-snapshot"

export const MARKETPLACE_URL = "https://cline.github.io/marketplace/catalog.json"

const entrySchema = z.object({
  id: z.string().regex(/^[\w-]+$/),
  type: z.enum(["mcp", "plugin", "skill"]),
  name: z.string(),
  description: z.string(),
  tags: z.array(z.string()).default([]),
  homepage: z.string().optional(),
  repo: z.string().optional(),
  license: z.string().optional(),
  featured: z.boolean().optional(),
  install: z.object({ args: z.array(z.string()) }),
})

export type MarketplaceItem = {
  id: string
  name: string
  type: "mcp" | "plugin" | "skill"
  category: string
  desc: string
  icon: string
  popular: boolean
  source?: string
  license?: string
  command?: string
  spec?: string
  config?: McpLocalConfig | McpRemoteConfig
  skillURL?: string
}

function httpsURL(value?: string) {
  if (!value || !URL.canParse(value)) return
  const url = new URL(value)
  if (url.protocol === "https:" && !url.username && !url.password) return url.href
}

// Catalog commands are data. Never evaluate a shell string or invoke the Cline CLI.
export function marketplaceMcpConfig(args: string[]): McpLocalConfig | McpRemoteConfig | undefined {
  const separator = args.indexOf("--")
  if (separator > 0 && separator < args.length - 1) {
    return { type: "local", command: args.slice(separator + 1), enabled: false }
  }
  const transport = args.indexOf("--transport")
  if (transport < 1 || !["http", "sse"].includes(args[transport + 1])) return
  const url = httpsURL(args[transport + 2])
  if (!url) return
  const headers: Record<string, string> = {}
  for (let index = transport + 3; index < args.length; index += 2) {
    if (args[index] !== "--header") return
    const header = args[index + 1]
    const colon = header?.indexOf(":") ?? -1
    if (colon <= 0) return
    headers[header.slice(0, colon).trim()] = header.slice(colon + 1).trim()
  }
  return { type: "remote", url, ...(Object.keys(headers).length ? { headers } : {}), enabled: false }
}

export function parseMarketplace(value: unknown): MarketplaceItem[] {
  const parsed = z.object({ entries: z.array(z.unknown()) }).safeParse(value)
  if (!parsed.success) return []
  const seen = new Set<string>()
  return parsed.data.entries.flatMap((raw) => {
    const result = entrySchema.safeParse(raw)
    if (!result.success) return []
    const entry = result.data
    const key = `${entry.type}:${entry.id}`
    if (seen.has(key)) return []
    seen.add(key)
    const config = entry.type === "mcp" ? marketplaceMcpConfig(entry.install.args) : undefined
    const source = httpsURL(entry.homepage) ?? httpsURL(entry.repo)
    const skillURL = entry.type === "skill" && source?.startsWith("https://github.com/") ? source : undefined
    const categories: Record<string, string> = {
      software: "desarrollo", data: "datos", security: "seguridad", creative: "diseno",
      finance: "finanzas", business: "ventas", research: "documentacion", productivity: "herramientas",
    }
    return [{
      id: entry.id, name: entry.name, type: entry.type, desc: entry.description,
      category: entry.tags.map((tag) => categories[tag]).find(Boolean) ?? "herramientas",
      icon: entry.type === "mcp" ? "🔌" : entry.type === "skill" ? "⚡" : "🧩",
      popular: entry.featured === true, source, license: entry.license, config, skillURL,
      command: config?.type === "local" ? JSON.stringify(config.command) : config?.url,
      spec: source,
    }]
  })
}

export const MARKETPLACE_SNAPSHOT = parseMarketplace(snapshot)

export const CURATED_SKILLS = parseMarketplace({ entries: [
  { id: "diagram-design", type: "skill", name: "Diagram Design", description: "Architecture and process diagrams as self-contained HTML and SVG.", tags: ["creative"], homepage: "https://github.com/cathrynlavery/diagram-design/tree/main/skills/diagram-design", license: "MIT", install: { args: [] } },
  { id: "security-audit", type: "skill", name: "Security Audit", description: "Security audits with evidence, independent validation and structured findings.", tags: ["security"], homepage: "https://github.com/cloudflare/security-audit-skill/tree/main/skills/security-audit", license: "Apache-2.0", install: { args: [] } },
  // Composio's hosted MCP: 1000+ app integrations behind one server, signed in through MCP OAuth
  // in the browser (no key in the catalog; per-user `x-consumer-api-key` headers are the user's).
  { id: "composio", type: "mcp", name: "Composio", description: "Connect 1000+ apps (Gmail, Slack, GitHub, Notion…) through one MCP server.", tags: ["productivity"], homepage: "https://docs.composio.dev/docs/composio-connect", license: "MIT", featured: true, install: { args: ["composio", "--transport", "http", "https://connect.composio.dev/mcp"] } },
  { id: "i-have-adhd", type: "skill", name: "I Have ADHD", description: "Concise, action-first responses with clear next steps and reduced reading load.", tags: ["productivity"], homepage: "https://github.com/ayghri/i-have-adhd/tree/main/skills/i-have-adhd", license: "MIT", install: { args: [] } },
] })

export async function fetchMarketplace() {
  const response = await fetch(MARKETPLACE_URL, { signal: AbortSignal.timeout(10_000), credentials: "omit" })
  if (!response.ok) throw new Error(`Marketplace: HTTP ${response.status}`)
  const entries = parseMarketplace(await response.json())
  if (entries.length === 0) throw new Error("Marketplace: empty or invalid catalog")
  return entries
}
