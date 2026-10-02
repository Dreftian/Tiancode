export * as MarketplaceCatalog from "./catalog"

// Normalizes the public catalogs Tiancode mirrors (Claude Code and Codex plugin marketplaces, the
// Anthropic connector directory, the GitHub and official MCP registries, skill repositories and
// Cline's catalog) into one shape. Everything here is pure so it can be tested without the network.

export type ItemType = "mcp" | "plugin" | "skill"
export type Auth = "none" | "oauth" | "own-app" | "token" | "restricted"

export interface McpInstall {
  transport: "remote" | "local"
  url?: string
  headers?: Record<string, string>
  command?: string[]
  environment?: Record<string, string>
}

/** Where a plugin's files live: a GitHub repository at a ref, under a folder. */
export interface PluginSource {
  format: "claude" | "codex"
  owner: string
  repo: string
  ref: string
  path: string
  /**
   * What the marketplace entry itself declares (skills, commands, agents, mcpServers…). With
   * `strict: false` it is the whole definition and the folder may have no plugin.json.
   */
  components?: Record<string, unknown>
  strict?: boolean
  /** Only these folders of `path` are downloaded (an entry whose source is a whole repository). */
  include?: string[]
}

export interface Item {
  id: string
  type: ItemType
  /** Config-safe name: the MCP key, the skill folder or the plugin folder. */
  name: string
  title: string
  description: string
  source: string
  category: string
  icon?: string
  domain?: string
  homepage?: string
  verified?: boolean
  stars?: number
  auth?: Auth
  mcp?: McpInstall
  skillUrl?: string
  plugin?: PluginSource
}

export interface Connector {
  id: string
  name: string
  title: string
  description: string
  category: string
  url: string
  transport: "http" | "sse"
  auth: Auth
  icon?: string
  domain?: string
  docs?: string
  sources: string[]
}

// ---------------------------------------------------------------------------------------- helpers

type Json = Record<string, unknown>
const record = (value: unknown): value is Json => typeof value === "object" && value !== null && !Array.isArray(value)
const text = (value: unknown) => (typeof value === "string" ? value.trim() : "")
const list = (value: unknown): unknown[] => (Array.isArray(value) ? value : [])

/** A key that config, folders and URLs all accept. */
export function slug(value: string) {
  return (
    value
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 64) || "item"
  )
}

export function httpsUrl(value: unknown) {
  const raw = text(value)
  if (!raw || !URL.canParse(raw)) return
  const url = new URL(raw)
  if (url.protocol !== "https:" || url.username || url.password) return
  return url.href
}

export function domainOf(value: unknown) {
  const url = httpsUrl(value) ?? (text(value) && URL.canParse(`https://${text(value)}`) ? `https://${text(value)}` : undefined)
  if (!url) return
  const host = new URL(url).hostname.toLowerCase()
  if (!host.includes(".") || /^[\d.]+$/.test(host) || host.endsWith(".local") || host.endsWith(".internal")) return
  return host
}

/** `https://github.com/owner/...` → the owner's avatar, the logo organisations use on GitHub. */
export function githubAvatar(value: unknown) {
  const url = httpsUrl(value)
  if (!url) return
  const parsed = new URL(url)
  if (parsed.hostname !== "github.com") return
  const owner = parsed.pathname.split("/").filter(Boolean)[0]
  if (!owner || !/^[\w.-]+$/.test(owner)) return
  return `https://avatars.githubusercontent.com/${owner}?size=96`
}

/** `owner/repo` or `git@github.com:owner/repo.git`. */
export function githubShorthand(value: string) {
  const match = /^(?:git@github\.com:)?([\w.-]+)\/([\w.-]+?)(?:\.git)?$/.exec(value.trim())
  if (!match || match[1]!.startsWith(".")) return
  return { owner: match[1]!, repo: match[2]! }
}

export function githubRepo(value: unknown) {
  const url = httpsUrl(value)
  if (!url) return
  const parsed = new URL(url)
  if (parsed.hostname !== "github.com") return
  const [owner, repo] = parsed.pathname.replace(/\.git$/, "").split("/").filter(Boolean)
  if (!owner || !repo) return
  return { owner, repo }
}

const CATEGORY: [RegExp, string][] = [
  [/secur|vulnerab|auth\b|compliance/i, "seguridad"],
  [/design|creativ|image|video|media|art\b|ui\b|ux\b/i, "diseno"],
  [/financ|payment|accounting|invest|bank|crypto|equity/i, "finanzas"],
  [/sales|crm|marketing|commerce|business|ads\b|seo\b|customer/i, "ventas"],
  [/data|analytic|database|sql|warehouse|bi\b|monitor|observab/i, "datos"],
  [/research|doc|knowledge|learn|education|science|health|legal|life-science|search/i, "documentacion"],
  [/communicat|email|chat|messag|productiv|calendar|meeting|note|project|task/i, "productividad"],
  [/develop|code|software|devops|deploy|testing|git|cloud|infra|api|tool|automation|migration|language/i, "desarrollo"],
]

/** One of the Discover categories, from whatever words a source uses. */
export function category(...hints: unknown[]) {
  for (const hint of hints.flatMap((value) => (Array.isArray(value) ? value : [value]))) {
    const word = text(hint)
    if (!word) continue
    const hit = CATEGORY.find(([pattern]) => pattern.test(word))
    if (hit) return hit[1]
  }
  return "herramientas"
}

// Folders, not secrets. Tiancode splices {env:} values into its JSON config as they are, so a
// Windows path there (C:\Users\…) would break the whole file: these are written as real paths at
// install time instead, and left as they are when there is nothing to resolve them with.
const PATH_VARIABLES = new Set([
  "HOME",
  "USERPROFILE",
  "APPDATA",
  "LOCALAPPDATA",
  "TEMP",
  "TMP",
  "TMPDIR",
  "PWD",
  "PROGRAMFILES",
  "PROGRAMDATA",
  "XDG_CONFIG_HOME",
  "XDG_DATA_HOME",
  "XDG_CACHE_HOME",
  "XDG_STATE_HOME",
])

/**
 * A `${VAR}` written for Claude Code or Codex is an environment variable; Tiancode spells it
 * {env:VAR}. `paths` resolves the folder variables above.
 */
export function envPlaceholders(value: string, root?: string, paths?: Record<string, string>) {
  return value
    .replace(/\$\{(?:CLAUDE_PLUGIN_ROOT|PLUGIN_ROOT|CODEX_PLUGIN_ROOT)\}/g, root ?? "")
    .replace(/\$\{([A-Z_][A-Z0-9_]*)(?::-[^}]*)?\}/g, (token, name: string) =>
      PATH_VARIABLES.has(name) ? (paths?.[name] ?? token) : `{env:${name}}`,
    )
}

// Tiancode's own config tokens: a plugin that writes them would read files or variables it never
// declared (`{file:~/.ssh/id_rsa}` as a header), so such a server is refused.
const CONFIG_TOKEN = /\{(file|env):/

/** An MCP server entry from a `.mcp.json` (Claude Code or Codex) in Tiancode's config shape. */
export function mcpFromEntry(entry: unknown, root?: string, paths?: Record<string, string>): McpInstall | undefined {
  if (!record(entry)) return
  const strings = [
    entry.url,
    entry.command,
    ...list(entry.args),
    ...Object.values(record(entry.headers) ? entry.headers : {}),
    ...Object.values(record(entry.env) ? entry.env : {}),
  ]
  if (strings.some((value) => typeof value === "string" && CONFIG_TOKEN.test(value))) return
  const url = text(entry.url)
  if (url) {
    const resolved = envPlaceholders(url, root, paths)
    if (!httpsUrl(resolved) && !/^https:\/\/[^\s]+$/.test(resolved)) return
    const headers = record(entry.headers)
      ? Object.fromEntries(
          Object.entries(entry.headers)
            .filter((pair): pair is [string, string] => typeof pair[1] === "string")
            .map(([key, value]) => [key, envPlaceholders(value, root, paths)]),
        )
      : undefined
    return { transport: "remote", url: resolved, ...(headers && Object.keys(headers).length ? { headers } : {}) }
  }
  const command = text(entry.command)
  if (!command) return
  const args = list(entry.args).filter((arg): arg is string => typeof arg === "string")
  const env = record(entry.env)
    ? Object.fromEntries(
        Object.entries(entry.env)
          .filter((pair): pair is [string, string] => typeof pair[1] === "string")
          .map(([key, value]) => [key, envPlaceholders(value, root, paths)]),
      )
    : undefined
  return {
    transport: "local",
    command: [command, ...args].map((part) => envPlaceholders(part, root, paths)),
    ...(env && Object.keys(env).length ? { environment: env } : {}),
  }
}

/** `.mcp.json` comes flat (`{name: entry}`) or wrapped (`{mcpServers: {name: entry}}`). */
export function mcpServers(value: unknown): Record<string, unknown> {
  if (!record(value)) return {}
  if (record(value.mcpServers)) return value.mcpServers
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => record(entry)))
}

// ------------------------------------------------------------------- Claude Code marketplaces

/**
 * A Claude Code `marketplace.json`. `repo` is where the marketplace itself lives, so relative
 * sources (`./plugins/x`) resolve against it.
 */
export function fromClaudeMarketplace(
  value: unknown,
  input: { source: string; owner: string; repo: string; ref: string; verified?: boolean },
): Item[] {
  if (!record(value)) return []
  return list(value.plugins).flatMap((raw): Item[] => {
    if (!record(raw)) return []
    const name = text(raw.name)
    if (!name) return []
    const plugin = claudePlugin(raw, input)
    const homepage = httpsUrl(raw.homepage) ?? httpsUrl(record(raw.author) ? raw.author.url : undefined)
    const author = record(raw.author) ? text(raw.author.name) : ""
    return [
      {
        // The repository is part of the id: the work marketplaces share a source and reuse names
        // ("operations", "datadog") for different plugins.
        id: `${input.source}:${input.repo}:${slug(name)}`,
        type: "plugin",
        name: slug(name),
        title: text(raw.displayName) || titleCase(name),
        description: text(raw.description) || author,
        source: input.source,
        category: category(raw.category, raw.tags, raw.keywords, raw.description),
        icon: githubAvatar(homepage) ?? (plugin && plugin.owner !== input.owner ? avatarOf(plugin.owner) : undefined),
        domain: domainOf(homepage),
        homepage,
        verified: input.verified,
        plugin,
      },
    ]
  })
}

const COMPONENTS = ["skills", "commands", "agents", "mcpServers", "hooks", "lspServers", "outputStyles"]
const RUNNABLE = ["skills", "commands", "agents", "mcpServers"]

/** The entry's source plus what the entry declares; undefined when nothing in it can run here. */
function claudePlugin(raw: Json, marketplace: { owner: string; repo: string; ref: string }): PluginSource | undefined {
  const source = claudeSource(raw.source, marketplace)
  if (!source) return
  const components = Object.fromEntries(COMPONENTS.filter((key) => raw[key] !== undefined).map((key) => [key, raw[key]]))
  const strict = raw.strict !== false
  // A strict:false entry is its whole definition: one that only brings LSP servers or hooks has
  // nothing Tiancode runs.
  if (!strict && !RUNNABLE.some((key) => components[key] !== undefined)) return
  const folders = RUNNABLE.flatMap((key) => {
    const value = components[key]
    return (Array.isArray(value) ? value : [value]).filter((entry): entry is string => typeof entry === "string")
  }).map(cleanPath)
  return {
    ...source,
    ...(Object.keys(components).length ? { components } : {}),
    ...(strict ? {} : { strict: false }),
    // An entry sourced at a whole repository (life-sciences' "./") names the folders it uses.
    ...(!strict && folders.length && !folders.includes("") ? { include: folders } : {}),
  }
}

function claudeSource(
  value: unknown,
  marketplace: { owner: string; repo: string; ref: string },
): PluginSource | undefined {
  if (typeof value === "string") {
    if (!value.startsWith("./")) return
    return { format: "claude", owner: marketplace.owner, repo: marketplace.repo, ref: marketplace.ref, path: cleanPath(value) }
  }
  if (!record(value)) return
  const kind = text(value.source)
  if (kind === "github") {
    const [owner, repo] = text(value.repo).split("/")
    if (!owner || !repo) return
    return { format: "claude", owner, repo, ref: text(value.sha) || text(value.ref) || "HEAD", path: "" }
  }
  if (kind === "url" || kind === "git-subdir") {
    // Claude Code also accepts GitHub shorthand ("owner/repo") and SSH remotes here.
    const repo = githubRepo(value.url) ?? githubShorthand(text(value.url))
    if (!repo) return
    return {
      format: "claude",
      ...repo,
      ref: text(value.sha) || text(value.ref) || "HEAD",
      path: cleanPath(text(value.path)),
    }
  }
  return
}

// --------------------------------------------------------------------------- Codex plugins

/** `openai/plugins` `.agents/plugins/marketplace.json`; `logos` maps a plugin to its logo URL. */
export function fromCodexMarketplace(
  value: unknown,
  input: { owner: string; repo: string; ref: string; logos?: Record<string, { logo?: string; website?: string; title?: string; description?: string }> },
): Item[] {
  if (!record(value)) return []
  return list(value.plugins).flatMap((raw): Item[] => {
    if (!record(raw)) return []
    const name = text(raw.name)
    if (!name) return []
    const policy = record(raw.policy) ? raw.policy : {}
    if (text(policy.installation) === "NOT_AVAILABLE") return []
    const source = raw.source
    const plugin: PluginSource | undefined = (() => {
      if (typeof source === "string" && source.startsWith("./"))
        return { format: "codex", owner: input.owner, repo: input.repo, ref: input.ref, path: cleanPath(source) }
      if (!record(source)) return
      if (text(source.source) === "local" && text(source.path).startsWith("./"))
        return { format: "codex", owner: input.owner, repo: input.repo, ref: input.ref, path: cleanPath(text(source.path)) }
      const repo = githubRepo(source.url)
      if (!repo) return
      return { format: "codex", ...repo, ref: text(source.sha) || text(source.ref) || "HEAD", path: cleanPath(text(source.path)) }
    })()
    const extra = input.logos?.[name]
    const ui = record(raw.interface) ? raw.interface : {}
    return [
      {
        id: `codex:${slug(name)}`,
        type: "plugin",
        name: slug(name),
        title: extra?.title || text(ui.displayName) || titleCase(name),
        description: extra?.description || text(raw.description) || titleCase(name),
        source: "codex",
        category: category(raw.category),
        icon: httpsUrl(extra?.logo),
        domain: domainOf(extra?.website),
        homepage:
          httpsUrl(extra?.website) ??
          (plugin
            ? `https://github.com/${plugin.owner}/${plugin.repo}/tree/${plugin.ref}/${plugin.path}`
            : `https://github.com/${input.owner}/${input.repo}`),
        verified: true,
        plugin,
      },
    ]
  })
}

/** What `fromCodexMarketplace` needs from a plugin's `.codex-plugin/plugin.json`. */
export function codexPluginInfo(value: unknown, rawBase: string) {
  if (!record(value)) return
  const ui = record(value.interface) ? value.interface : {}
  const logo = text(ui.logo) || text(ui.composerIcon)
  return {
    logo: logo ? (httpsUrl(logo) ?? `${rawBase}/${cleanPath(logo)}`) : undefined,
    website: httpsUrl(ui.websiteURL) ?? httpsUrl(value.homepage),
    title: text(ui.displayName) || undefined,
    description: text(ui.shortDescription) || text(value.description) || undefined,
  }
}

// ------------------------------------------------------------- Anthropic connector directory

const CLAUDE_ONLY = /(^|\.)mcp\.claude\.com$|(^|\.)claude\.ai$/
// Vendors whose OAuth only accepts clients they registered themselves or approved.
const OWN_APP = /googleapis\.com$|(^|\.)slack\.com$|hubspot\.com$|asana\.com$|(^|\.)box\.com$|zoom\.us$|xero\.com$|docusign\.com$|pagerduty\.com$|render\.com$|githubcopilot\.com$/
const RESTRICTED = /(^|\.)vercel\.com$|(^|\.)figma\.com$/

export function connectorAuth(url: string, authless: boolean): Auth {
  const host = new URL(url).hostname
  if (authless) return "none"
  if (RESTRICTED.test(host)) return "restricted"
  if (OWN_APP.test(host)) return "own-app"
  return "oauth"
}

export function fromAnthropicDirectory(value: unknown): Connector[] {
  const servers = Array.isArray(value) ? value : record(value) ? list(value.servers) : []
  return servers.flatMap((raw): Connector[] => {
    if (!record(raw) || !record(raw.server)) return []
    const meta = record(raw._meta) && record(raw._meta["com.anthropic.api/mcp-registry"]) ? raw._meta["com.anthropic.api/mcp-registry"] : {}
    const remote = list(raw.server.remotes).find((entry): entry is Json => record(entry) && Boolean(httpsUrl(entry.url)))
    const url = httpsUrl(meta.url) ?? (remote ? httpsUrl(remote.url) : undefined)
    if (!url) return []
    const host = new URL(url).hostname
    // Hosted by Claude for Claude alone: a third-party client cannot sign in there.
    if (CLAUDE_ONLY.test(host)) return []
    const title = text(meta.displayName) || text(raw.server.title) || text(raw.server.name)
    const author = record(meta.author) ? meta.author : {}
    const logo = directoryLogo(meta.iconUrl, author.url, url)
    const worksWith = list(meta.worksWith).map(text)
    // Connectors that do not list Claude Code accept only Anthropic's own clients; "requiredFields"
    // means the user brings something (their OAuth client ID, their workspace URL).
    const auth: Auth =
      worksWith.length && !worksWith.includes("claude-code")
        ? "restricted"
        : list(meta.requiredFields).length
          ? "own-app"
          : connectorAuth(url, meta.isAuthless === true)
    return [
      {
        id: slug(text(meta.slug) || title),
        name: slug(text(meta.slug) || title),
        title,
        description: text(meta.oneLiner) || text(raw.server.description),
        category: category(meta.useCases, raw.server.description),
        url,
        transport: remote && text(remote.type) === "sse" ? "sse" : "http",
        auth,
        icon: logo.icon,
        domain: logo.domain,
        docs: httpsUrl(meta.documentation),
        sources: ["claude"],
      },
    ]
  })
}

const IMAGE_PATH = /\.(svg|png|jpe?g|webp|gif|ico)(\?|$)/i
const FAVICON_SERVICE = /^(www\.google\.com|t\d\.gstatic\.com)$/

/**
 * The directory's `iconUrl` is sometimes an image, sometimes a favicon service, sometimes the
 * vendor's site and sometimes just the MCP endpoint again. The site whose icon to show is the
 * first of those that is a website, then the author's site, then the endpoint without its
 * `mcp.` label (mcp.linear.app → linear.app).
 */
export function directoryLogo(iconUrl: unknown, authorUrl: unknown, endpoint: string) {
  const icon = httpsUrl(iconUrl)
  const parsed = icon ? new URL(icon) : undefined
  if (parsed && FAVICON_SERVICE.test(parsed.hostname)) {
    const target = parsed.searchParams.get("domain") ?? parsed.searchParams.get("url") ?? ""
    return { icon, domain: domainOf(target.replace(/^http:/, "https:")) }
  }
  const image = parsed && IMAGE_PATH.test(parsed.pathname) ? icon : undefined
  const endpointHost = new URL(endpoint).hostname
  const site = [icon, authorUrl]
    .map((value) => (httpsUrl(value) ? new URL(httpsUrl(value)!) : undefined))
    .find(
      (value) =>
        value &&
        value.hostname !== endpointHost &&
        !/(^|\.)mcp[.-]/.test(value.hostname) &&
        !/\/mcp\b/.test(value.pathname) &&
        Boolean(domainOf(value.href)),
    )
  return {
    icon: image,
    domain: site ? domainOf(site.href) : domainOf(endpointHost.replace(/^(mcp-server|mcp|api)[.-]/, "")),
  }
}

/** Connectors Codex ships whose URL is public, beyond the directory above. */
export const CODEX_CONNECTORS: { title: string; url: string; domain: string; category: string }[] = [
  { title: "Gmail", url: "https://gmailmcp.googleapis.com/mcp/v1", domain: "mail.google.com", category: "productividad" },
  { title: "Google Calendar", url: "https://calendarmcp.googleapis.com/mcp/v1", domain: "calendar.google.com", category: "productividad" },
  { title: "Google Drive", url: "https://drivemcp.googleapis.com/mcp/v1", domain: "drive.google.com", category: "productividad" },
  { title: "Google Docs", url: "https://docsmcp.googleapis.com/mcp/v1", domain: "docs.google.com", category: "productividad" },
  { title: "Google Sheets", url: "https://sheetsmcp.googleapis.com/mcp/v1", domain: "sheets.google.com", category: "datos" },
  { title: "GitHub", url: "https://api.githubcopilot.com/mcp/", domain: "github.com", category: "desarrollo" },
  { title: "Notion", url: "https://mcp.notion.com/mcp", domain: "notion.so", category: "productividad" },
  { title: "Linear", url: "https://mcp.linear.app/mcp", domain: "linear.app", category: "productividad" },
  { title: "Slack", url: "https://mcp.slack.com/mcp", domain: "slack.com", category: "productividad" },
  { title: "Atlassian", url: "https://mcp.atlassian.com/v1/mcp", domain: "atlassian.com", category: "productividad" },
  { title: "Dropbox", url: "https://mcp.dropbox.com/mcp", domain: "dropbox.com", category: "productividad" },
  { title: "Box", url: "https://mcp.box.com", domain: "box.com", category: "productividad" },
  { title: "Figma", url: "https://mcp.figma.com/mcp", domain: "figma.com", category: "diseno" },
  { title: "Canva", url: "https://mcp.canva.com/mcp", domain: "canva.com", category: "diseno" },
  { title: "Airtable", url: "https://mcp.airtable.com/mcp", domain: "airtable.com", category: "datos" },
  { title: "ClickUp", url: "https://mcp.clickup.com/mcp", domain: "clickup.com", category: "productividad" },
  { title: "monday.com", url: "https://mcp.monday.com/mcp", domain: "monday.com", category: "productividad" },
  { title: "Stripe", url: "https://mcp.stripe.com", domain: "stripe.com", category: "finanzas" },
  { title: "Sentry", url: "https://mcp.sentry.dev/mcp", domain: "sentry.io", category: "desarrollo" },
  { title: "Vercel", url: "https://mcp.vercel.com", domain: "vercel.com", category: "desarrollo" },
  { title: "Supabase", url: "https://mcp.supabase.com/mcp", domain: "supabase.com", category: "datos" },
  { title: "Cloudflare", url: "https://mcp.cloudflare.com/mcp", domain: "cloudflare.com", category: "desarrollo" },
  { title: "Zoom", url: "https://mcp.zoom.us/mcp/meeting/streamable", domain: "zoom.us", category: "productividad" },
  { title: "Granola", url: "https://mcp.granola.ai/mcp", domain: "granola.ai", category: "productividad" },
  { title: "PostHog", url: "https://mcp.posthog.com/mcp", domain: "posthog.com", category: "datos" },
  { title: "Datadog", url: "https://mcp.datadoghq.com/v1/mcp", domain: "datadoghq.com", category: "datos" },
  { title: "Shopify", url: "https://setup.shopify.com/mcp", domain: "shopify.com", category: "ventas" },
  { title: "Consensus", url: "https://mcp.consensus.app/mcp", domain: "consensus.app", category: "documentacion" },
  { title: "Higgsfield", url: "https://mcp.higgsfield.ai/mcp", domain: "higgsfield.ai", category: "diseno" },
  { title: "Intercom", url: "https://mcp.intercom.com/mcp", domain: "intercom.com", category: "ventas" },
  { title: "PayPal", url: "https://mcp.paypal.com/mcp", domain: "paypal.com", category: "finanzas" },
  { title: "Webflow", url: "https://mcp.webflow.com/mcp", domain: "webflow.com", category: "diseno" },
  { title: "Wix", url: "https://mcp.wix.com/mcp", domain: "wix.com", category: "diseno" },
  { title: "Netlify", url: "https://netlify-mcp.netlify.app/mcp", domain: "netlify.com", category: "desarrollo" },
  { title: "GitLab", url: "https://gitlab.com/api/v4/mcp", domain: "gitlab.com", category: "desarrollo" },
  { title: "Zapier", url: "https://mcp.zapier.com/api/v1/connect", domain: "zapier.com", category: "productividad" },
  { title: "OpenAI Docs", url: "https://developers.openai.com/mcp", domain: "openai.com", category: "documentacion" },
  { title: "Context7", url: "https://mcp.context7.com/mcp", domain: "context7.com", category: "desarrollo" },
]

/** Directory first (its descriptions and auth flags), then the Codex URLs it lacks. */
export function mergeConnectors(directory: Connector[]): Connector[] {
  const seen = new Map(directory.map((connector) => [connectorKey(connector.url), connector]))
  const byTitle = new Map(directory.map((connector) => [connector.title.toLowerCase(), connector]))
  const ids = new Set(directory.map((connector) => connector.id))
  const extra = CODEX_CONNECTORS.flatMap((entry): Connector[] => {
    const known = seen.get(connectorKey(entry.url)) ?? byTitle.get(entry.title.toLowerCase())
    if (known) {
      if (!known.sources.includes("codex")) known.sources.push("codex")
      // Codex reaching it proves a third-party client can sign in, whatever the directory lists.
      if (known.auth === "restricted" && !RESTRICTED.test(new URL(known.url).hostname))
        known.auth = connectorAuth(known.url, false)
      return []
    }
    // Codex's "Cloudflare" is not the directory's "Cloudflare Developer Platform" (slug cloudflare).
    const id = ids.has(slug(entry.title)) ? `${slug(entry.title)}-codex` : slug(entry.title)
    ids.add(id)
    return [
      {
        id,
        name: id,
        title: entry.title,
        // Codex lists these without a description; the app shows a generic line for them.
        description: "",
        category: entry.category,
        url: entry.url,
        transport: "http",
        auth: connectorAuth(entry.url, entry.url.startsWith("https://developers.openai.com")),
        domain: entry.domain,
        sources: ["codex"],
      },
    ]
  })
  return [...directory, ...extra].sort((a, b) => a.title.localeCompare(b.title))
}

function connectorKey(url: string) {
  const parsed = new URL(url)
  return `${parsed.hostname}${parsed.pathname.replace(/\/+$/, "")}`
}

// ----------------------------------------------------------------------------- MCP registries

/** GitHub's curated MCP registry (and the official one, same schema), as Discover entries. */
export function fromMcpRegistry(value: unknown, source: "github" | "registry"): Item[] {
  if (!record(value)) return []
  return list(value.servers).flatMap((raw): Item[] => {
    if (!record(raw) || !record(raw.server)) return []
    const server = raw.server
    const official = record(raw._meta) ? raw._meta["io.modelcontextprotocol.registry/official"] : undefined
    if (record(official) && text(official.status) === "deleted") return []
    const name = text(server.name)
    if (!name) return []
    const meta = record(server._meta) ? server._meta["io.modelcontextprotocol.registry/publisher-provided"] : undefined
    const github = record(meta) && record(meta.github) ? meta.github : {}
    const icons = list(server.icons).filter(record)
    const repository = record(server.repository) ? httpsUrl(server.repository.url) : undefined
    const mcp = registryInstall(server, envName(name.split("/").pop() ?? name))
    if (!mcp) return []
    const title = text(github.displayName) || text(server.title) || titleCase(name.split("/").pop() ?? name)
    return [
      {
        id: `${source}:${name}`,
        type: "mcp",
        name: slug(name.split("/").pop() ?? name),
        title,
        description: text(server.description),
        source,
        category: category(list(github.topics), server.description),
        icon: httpsUrl(icons[0]?.src) ?? httpsUrl(github.ownerAvatarUrl) ?? githubAvatar(repository),
        domain: domainOf(server.websiteUrl),
        homepage: httpsUrl(server.websiteUrl) ?? repository,
        verified: source === "github" || Boolean(github.isInOrganization),
        stars: typeof github.stargazerCount === "number" ? github.stargazerCount : undefined,
        auth: mcp.transport === "remote" ? "oauth" : undefined,
        mcp,
      },
    ]
  })
}

/**
 * How to run a registry server. `prefix` namespaces the variables it invents (APIFY_AUTHORIZATION),
 * so one vendor's token is never sent to another that happens to use the same header name.
 */
function registryInstall(server: Json, prefix: string): McpInstall | undefined {
  const variable = (name: string) => `{env:${prefix}_${envName(name)}}`
  const fill = (value: string) => value.replace(/\{([a-z_][\w]*)\}/gi, (_, name: string) => variable(name))
  const remote = list(server.remotes).find(
    (entry): entry is Json => record(entry) && Boolean(httpsUrl(entry.url)) && !/\{[^}]+\}/.test(text(entry.url)),
  )
  if (remote) {
    const headers = Object.fromEntries(
      list(remote.headers)
        .filter(record)
        .flatMap((header) => {
          const key = text(header.name)
          if (!key) return []
          // An optional secret header is for clients without OAuth: sending it empty would replace
          // the token the OAuth flow adds.
          const value = text(header.value) || (header.isRequired ? variable(key) : "")
          return value ? [[key, fill(value)]] : []
        }),
    )
    return { transport: "remote", url: httpsUrl(remote.url)!, ...(Object.keys(headers).length ? { headers } : {}) }
  }
  const pkg = list(server.packages).find(
    (entry): entry is Json =>
      record(entry) &&
      ["npm", "pypi", "oci"].includes(text(entry.registryType)) &&
      Boolean(text(entry.identifier)) &&
      // A package that serves over HTTP on localhost is not something to start as a stdio command.
      (!record(entry.transport) || !text(entry.transport.type) || text(entry.transport.type) === "stdio"),
  )
  if (!pkg) return
  const identifier = text(pkg.identifier)
  const version = text(pkg.version) === "latest" ? "" : text(pkg.version)
  const kind = text(pkg.registryType)
  const argument = (raw: unknown): string[] => {
    if (!record(raw)) return []
    const value = text(raw.value) || text(raw.default)
    if (text(raw.type) === "named") {
      const name = text(raw.name)
      if (!name) return []
      if (value) return [name, fill(value)]
      return raw.isRequired ? [name, variable(name.replace(/^-+/, ""))] : []
    }
    if (value) return [fill(value)]
    const hint = text(raw.valueHint)
    return raw.isRequired && hint ? [variable(hint)] : []
  }
  const runtime = list(pkg.runtimeArguments).flatMap(argument)
  const args = list(pkg.packageArguments).flatMap(argument)
  const environment = Object.fromEntries(
    list(pkg.environmentVariables)
      .filter(record)
      .flatMap((entry) => {
        const key = text(entry.name)
        return key && entry.isRequired ? [[key, `{env:${key}}`]] : []
      }),
  )
  const command =
    kind === "npm"
      ? ["npx", "-y", ...runtime, version ? `${identifier}@${version}` : identifier, ...args]
      : kind === "pypi"
        ? ["uvx", ...runtime, version ? `${identifier}==${version}` : identifier, ...args]
        : [
            "docker",
            "run",
            "-i",
            "--rm",
            // docker passes a variable into the container only when -e names it.
            ...Object.keys(environment).flatMap((key) => ["-e", key]),
            ...runtime,
            version ? `${identifier}:${version}` : identifier,
            ...args,
          ]
  return { transport: "local", command, ...(Object.keys(environment).length ? { environment } : {}) }
}

function envName(value: string) {
  return value.toUpperCase().replace(/[^A-Z0-9]+/g, "_")
}

// --------------------------------------------------------------------------------- skills

/** Skills listed by a Claude `marketplace.json` that bundles them (`anthropics/skills`). */
export function fromSkillMarketplace(value: unknown, input: { owner: string; repo: string; ref: string }): Item[] {
  if (!record(value)) return []
  const seen = new Set<string>()
  return list(value.plugins).flatMap((raw) => {
    if (!record(raw)) return []
    return list(raw.skills).flatMap((path): Item[] => {
      const clean = typeof path === "string" ? cleanPath(path) : ""
      const name = clean.split("/").pop() ?? ""
      if (!name || seen.has(name)) return []
      seen.add(name)
      return [skillItem({ ...input, path: clean, name, source: "anthropic-skills", category: category(raw.name, name) })]
    })
  })
}

/** Skills found in a Git tree: every folder that holds a `SKILL.md` under `prefix`. */
export function fromSkillTree(
  value: unknown,
  input: { owner: string; repo: string; ref: string; prefix: string; source: string },
): Item[] {
  if (!record(value)) return []
  return list(value.tree).flatMap((raw): Item[] => {
    if (!record(raw) || text(raw.type) !== "blob") return []
    const path = text(raw.path)
    if (!path.startsWith(input.prefix) || !path.endsWith("/SKILL.md")) return []
    const folder = path.slice(0, -"/SKILL.md".length)
    const name = folder.split("/").pop() ?? ""
    if (!name || name.startsWith(".")) return []
    return [skillItem({ ...input, path: folder, name, category: category(name) })]
  })
}

function skillItem(input: { owner: string; repo: string; ref: string; path: string; name: string; source: string; category: string }): Item {
  return {
    id: `${input.source}:${slug(input.name)}`,
    type: "skill",
    name: slug(input.name),
    title: titleCase(input.name),
    description: "",
    source: input.source,
    category: input.category,
    icon: avatarOf(input.owner),
    homepage: `https://github.com/${input.owner}/${input.repo}/tree/${input.ref}/${input.path}`,
    skillUrl: `https://github.com/${input.owner}/${input.repo}/tree/${input.ref}/${input.path}`,
    verified: true,
  }
}

// ---------------------------------------------------------------------------------- Cline

const CLINE_TAGS: Record<string, string> = {
  software: "desarrollo",
  data: "datos",
  databases: "datos",
  security: "seguridad",
  creative: "diseno",
  finance: "finanzas",
  business: "ventas",
  sales: "ventas",
  marketing: "ventas",
  research: "documentacion",
  memory: "documentacion",
  productivity: "productividad",
}

/** Cline's catalog: MCP servers and skills (its "plugins" are Cline skill bundles, left out). */
export function fromCline(value: unknown): Item[] {
  if (!record(value)) return []
  return list(value.entries).flatMap((raw): Item[] => {
    if (!record(raw)) return []
    const type = text(raw.type)
    const id = text(raw.id)
    if (!id || (type !== "mcp" && type !== "skill")) return []
    const tags = list(raw.tags).map(text)
    const homepage = httpsUrl(raw.homepage) ?? httpsUrl(raw.repo)
    const args = record(raw.install) ? list(raw.install.args).filter((arg): arg is string => typeof arg === "string") : []
    const mcp = type === "mcp" ? clineInstall(args) : undefined
    if (type === "mcp" && !mcp) return []
    const skillUrl = type === "skill" ? clineSkillUrl(homepage, args) : undefined
    if (type === "skill" && !skillUrl) return []
    return [
      {
        id: `cline:${slug(id)}`,
        type,
        name: slug(id),
        title: text(raw.name) || titleCase(id),
        description: text(raw.description) || text(raw.tagline),
        source: "cline",
        category: tags.map((tag) => CLINE_TAGS[tag]).find(Boolean) ?? category(tags),
        icon: httpsUrl(raw.icon) ?? githubAvatar(homepage),
        domain: domainOf(raw.homepage),
        homepage,
        verified: raw.verified === true,
        auth: mcp?.transport === "remote" ? "oauth" : undefined,
        mcp,
        skillUrl,
      },
    ]
  })
}

// Fill-me-in values in Cline's commands ("<key>", "YOUR_API_KEY", a bare "api_key" header): an
// entry with one cannot run as listed.
const CLINE_PLACEHOLDER = /<[^>]+>|YOUR_[A-Z_]+|\{[a-z_]+\}/

/** A skill entry's folder: the homepage, or `skills/<name>` of the repository `--skill` names. */
function clineSkillUrl(homepage: string | undefined, args: string[]) {
  if (!homepage?.startsWith("https://github.com/")) return
  const skill = args[args.indexOf("--skill") + 1]
  const parts = new URL(homepage).pathname.split("/").filter(Boolean)
  if (args.includes("--skill") && skill && parts.length === 2) return `https://github.com/${parts[0]}/${parts[1]}/tree/HEAD/skills/${skill}`
  return homepage
}

function clineInstall(args: string[]): McpInstall | undefined {
  if (args.some((arg) => CLINE_PLACEHOLDER.test(arg) || CONFIG_TOKEN.test(arg))) return
  const separator = args.indexOf("--")
  if (separator > 0 && separator < args.length - 1)
    return { transport: "local", command: args.slice(separator + 1).map((arg) => envPlaceholders(arg)) }
  const transport = args.indexOf("--transport")
  if (transport < 1 || !["http", "sse"].includes(args[transport + 1] ?? "")) return
  const url = httpsUrl(args[transport + 2])
  if (!url) return
  const headers: Record<string, string> = {}
  for (let index = transport + 3; index < args.length; index += 2) {
    if (args[index] !== "--header") return
    const header = args[index + 1] ?? ""
    const colon = header.indexOf(":")
    if (colon <= 0) return
    const value = header.slice(colon + 1).trim()
    if (/^[a-z][a-z_]*$/.test(value)) return
    headers[header.slice(0, colon).trim()] = envPlaceholders(value)
  }
  return { transport: "remote", url, ...(Object.keys(headers).length ? { headers } : {}) }
}

// ---------------------------------------------------------------------------------- merging

/**
 * One list for Discover: the first source to list an MCP server (by its URL or package) keeps it,
 * so the directory's description wins over a registry copy, and items keep their source order.
 */
export function merge(...sources: Item[][]): Item[] {
  const seen = new Set<string>()
  const ids = new Set<string>()
  return sources.flat().filter((item) => {
    if (ids.has(item.id)) return false
    ids.add(item.id)
    if (item.type !== "mcp" || !item.mcp) return true
    const key = item.mcp.url ? connectorKey(item.mcp.url) : (item.mcp.command ?? []).join(" ")
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

/** Directory connectors are MCP servers too; Discover lists them with the rest. */
export function connectorItems(connectors: Connector[]): Item[] {
  return connectors.map((connector) => ({
    // Their own namespace: an official plugin named "github" or "linear" is a different entry.
    id: `connector:${connector.id}`,
    type: "mcp",
    name: connector.name,
    title: connector.title,
    description: connector.description,
    source: connector.sources.includes("claude") ? "claude" : "codex",
    category: connector.category,
    icon: connector.icon,
    domain: connector.domain,
    homepage: connector.docs,
    verified: true,
    auth: connector.auth,
    mcp: { transport: "remote", url: connector.url },
  }))
}

function cleanPath(value: string) {
  return value.replace(/^\.\/?/, "").replace(/^\/+|\/+$/g, "")
}

function avatarOf(owner: string) {
  return /^[\w.-]+$/.test(owner) ? `https://avatars.githubusercontent.com/${owner}?size=96` : undefined
}

function titleCase(value: string) {
  return value
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((word) => word[0]!.toUpperCase() + word.slice(1))
    .join(" ")
}
