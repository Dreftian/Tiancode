export * as MarketplaceInstaller from "./installer"

import { MarketplaceCatalog, type McpInstall, type PluginSource } from "./catalog"
import { MarketplaceFetch } from "./fetch"

// Installs a Claude Code or Codex plugin by translating what Tiancode understands: skills
// (SKILL.md folders), slash commands and sub-agents (Markdown with frontmatter) and MCP servers.
// Hooks, LSP servers, output styles and the rest have no Tiancode equivalent and are reported.

export interface File {
  path: string
  bytes: Uint8Array
}

export interface Plan {
  skills: { name: string; files: { path: string; content: Uint8Array }[] }[]
  commands: { name: string; content: string }[]
  agents: { name: string; content: string }[]
  mcp: Record<string, McpInstall>
  skipped: string[]
}

const MAX_FILES = 600
const MAX_FILE = 3 * 1024 * 1024
const MAX_TOTAL = 20 * 1024 * 1024
const SKIP_PATH = /(^|\/)(node_modules|\.git|__pycache__|\.venv|dist)\//

/** The plugin's files, read from GitHub within the size limits. */
export async function download(source: PluginSource): Promise<File[]> {
  const base = `https://api.github.com/repos/${source.owner}/${source.repo}`
  const tree = await MarketplaceFetch.json(`${base}/git/trees/${encodeURIComponent(source.ref)}?recursive=1`, {
    maxBytes: 32 * 1024 * 1024,
  })
  const prefix = source.path ? `${source.path}/` : ""
  // An entry that names its folders inside a whole repository downloads only those (and manifests).
  const wanted = (path: string) =>
    !source.include ||
    path === ".mcp.json" ||
    path.startsWith(".claude-plugin/") ||
    path.startsWith(".codex-plugin/") ||
    source.include.some((folder) => path === folder || path.startsWith(`${folder}/`))
  const entries = (
    tree && typeof tree === "object" && Array.isArray((tree as { tree?: unknown }).tree)
      ? (tree as { tree: { path?: unknown; type?: unknown; size?: unknown }[] }).tree
      : []
  ).filter(
    (entry): entry is { path: string; type: string; size: number } =>
      entry.type === "blob" &&
      typeof entry.path === "string" &&
      entry.path.startsWith(prefix) &&
      !SKIP_PATH.test(entry.path.slice(prefix.length)) &&
      wanted(entry.path.slice(prefix.length)) &&
      (typeof entry.size !== "number" || entry.size <= MAX_FILE),
  )
  if (entries.length === 0) throw new Error("the plugin has no files at its source")
  if (entries.length > MAX_FILES) throw new Error(`the plugin has more than ${MAX_FILES} files`)
  const total = entries.reduce((sum, entry) => sum + (typeof entry.size === "number" ? entry.size : 0), 0)
  if (total > MAX_TOTAL) throw new Error("the plugin is larger than 20 MB")
  const raw = `https://raw.githubusercontent.com/${source.owner}/${source.repo}/${encodeURIComponent(source.ref)}`
  const files = await MarketplaceFetch.pool(entries, 8, async (entry) => {
    const response = await MarketplaceFetch.get(`${raw}/${entry.path.split("/").map(encodeURIComponent).join("/")}`, {
      maxBytes: MAX_FILE,
      accept: "*/*",
    })
    return { path: entry.path.slice(prefix.length), bytes: response.bytes }
  })
  const missing = files.filter((file) => !file).length
  if (missing > 0) throw new Error(`${missing} files of the plugin could not be downloaded`)
  return files.flatMap((file): File[] => (file ? [file] : []))
}

/**
 * What to write, given the plugin's files. `root` is where its raw copy lives on disk, `paths`
 * resolves folder variables such as ${HOME}, and `source` carries what the marketplace entry
 * declares (the whole definition when it is `strict: false`).
 */
export function plan(
  files: File[],
  input: {
    format: PluginSource["format"]
    root: string
    paths?: Record<string, string>
    source?: Pick<PluginSource, "components" | "strict">
  },
): Plan {
  const decoder = new TextDecoder()
  const byPath = new Map(files.map((file) => [file.path, file]))
  const read = (path: string) => {
    const file = byPath.get(path)
    return file ? decoder.decode(file.bytes) : undefined
  }
  const own = parseJson(read(input.format === "codex" ? ".codex-plugin/plugin.json" : ".claude-plugin/plugin.json"))
  const declared = input.source?.components ?? {}
  const manifest: Record<string, unknown> | undefined =
    input.source?.strict === false ? declared : own || Object.keys(declared).length ? { ...declared, ...own } : undefined
  const dirs = (key: string, fallback: string) => {
    const value = manifest?.[key]
    const paths = (Array.isArray(value) ? value : typeof value === "string" ? [value] : [fallback])
      .filter((path): path is string => typeof path === "string")
      .map((path) => path.replace(/^\.\/?/, "").replace(/\/+$/, ""))
    return paths.length ? paths : [fallback]
  }
  const under = (roots: string[], path: string) => roots.some((root) => path === root || path.startsWith(`${root}/`))

  const skillRoots = dirs("skills", "skills")
  const skills = new Map<string, { path: string; content: Uint8Array }[]>()
  for (const file of files) {
    if (!file.path.endsWith("SKILL.md") || !under(skillRoots, file.path)) continue
    const folder = file.path.slice(0, -"SKILL.md".length).replace(/\/$/, "")
    const name = MarketplaceCatalog.slug(folder.split("/").pop() || "skill")
    skills.set(
      name,
      files
        .filter((item) => item.path === file.path || item.path.startsWith(`${folder}/`))
        .map((item) => ({ path: item.path.slice(folder.length).replace(/^\//, ""), content: item.bytes })),
    )
  }

  const markdown = (key: string, fallback: string) => {
    const roots = dirs(key, fallback)
    return files.filter((file) => file.path.endsWith(".md") && under(roots, file.path) && !file.path.endsWith("README.md"))
  }
  const commands = markdown("commands", "commands").map((file) => ({
    name: MarketplaceCatalog.slug(file.path.split("/").pop()!.replace(/\.md$/, "")),
    content: markdownFile(decoder.decode(file.bytes), input.root, { mode: undefined }),
  }))
  const agents = markdown("agents", "agents").map((file) => ({
    name: MarketplaceCatalog.slug(file.path.split("/").pop()!.replace(/\.md$/, "")),
    content: markdownFile(decoder.decode(file.bytes), input.root, { mode: "subagent" }),
  }))

  // `mcpServers` is inline servers, a path to a .mcp.json, or a list of such paths.
  const declaredServers = manifest?.mcpServers
  const servers =
    declaredServers && typeof declaredServers === "object" && !Array.isArray(declaredServers)
      ? MarketplaceCatalog.mcpServers({ mcpServers: declaredServers })
      : Object.assign(
          {},
          ...(Array.isArray(declaredServers) ? declaredServers : [typeof declaredServers === "string" ? declaredServers : ".mcp.json"])
            .filter((path): path is string => typeof path === "string")
            .map((path) => MarketplaceCatalog.mcpServers(parseJson(read(path.replace(/^\.\//, ""))))),
        )
  const mcp = Object.fromEntries(
    Object.entries(servers).flatMap(([name, entry]) => {
      const config = MarketplaceCatalog.mcpFromEntry(entry, input.root, input.paths)
      return config ? [[MarketplaceCatalog.slug(name), config]] : []
    }),
  )

  const skipped = [
    files.some((file) => file.path === "hooks/hooks.json" || file.path.startsWith("hooks/")) || manifest?.hooks ? "hooks" : "",
    files.some((file) => file.path === ".lsp.json") || manifest?.lspServers ? "lsp" : "",
    files.some((file) => file.path.startsWith("output-styles/")) ? "output-styles" : "",
    files.some((file) => file.path.startsWith("monitors/")) ? "monitors" : "",
    files.some((file) => file.path === ".app.json") ? "chatgpt-apps" : "",
  ].filter(Boolean)

  return {
    skills: [...skills.entries()].map(([name, list]) => ({ name, files: list })),
    commands,
    agents,
    mcp,
    skipped,
  }
}

/**
 * A command or agent file with only the frontmatter Tiancode reads. Claude Code adds fields such
 * as `allowed-tools` or a `model: sonnet` alias that Tiancode's schema would reject, and a file
 * that fails to load breaks the whole config.
 */
export function markdownFile(source: string, root: string, options: { mode?: "subagent" }) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(source)
  const body = runnableText(match ? source.slice(match[0].length) : source, root)
  const description = match ? frontmatterValue(match[1]!, "description") : undefined
  const lines = [
    "---",
    ...(description ? [`description: ${JSON.stringify(description)}`] : []),
    ...(options.mode ? [`mode: ${options.mode}`] : []),
    "---",
    "",
  ]
  return `${lines.join("\n")}${body.trimStart()}`
}

/**
 * SKILL.md with `name` set to the folder it is written to: the skill loader keys skills by that
 * name, so a renamed copy must say so, and Claude Code allows leaving it out.
 */
export function skillFile(source: string, name: string, root: string) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(source)
  const body = runnableText(match ? source.slice(match[0].length) : source, root)
  const lines = (match ? match[1]! : "").split(/\r?\n/).filter((line) => line.trim() && !/^name\s*:/.test(line))
  const description = match ? frontmatterValue(match[1]!, "description") : undefined
  const head = description || lines.some((line) => /^description\s*:/.test(line)) ? lines : [...lines, `description: ${JSON.stringify(name)}`]
  return `---\nname: ${name}\n${head.join("\n")}\n---\n${body}`
}

/**
 * Plugin text as Tiancode should read it: the plugin root resolved, and Claude Code's
 * !`command` lines (which Tiancode would run in a shell before the model sees anything, without
 * the permission prompt Claude Code's allowed-tools gives them) left as plain code the agent can
 * choose to run through its bash tool, which asks.
 */
function runnableText(source: string, root: string) {
  // Same pattern as the prompt's shell expansion (session/prompt.ts), so nothing it would run survives.
  return source.replace(/\$\{CLAUDE_PLUGIN_ROOT\}/g, root).replace(/!`([^`]+)`/g, "`$1`")
}

function frontmatterValue(block: string, key: string) {
  const lines = block.split(/\r?\n/)
  const index = lines.findIndex((line) => new RegExp(`^${key}\\s*:`).test(line))
  if (index === -1) return
  const inline = lines[index]!.replace(new RegExp(`^${key}\\s*:\\s*`), "").trim()
  if (inline && !/^[|>][+-]?$/.test(inline)) return unquote(inline)
  const folded = []
  for (const line of lines.slice(index + 1)) {
    if (!/^\s+/.test(line)) break
    folded.push(line.trim())
  }
  return folded.join(" ").trim() || undefined
}

function unquote(value: string) {
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    try {
      return value.startsWith('"') ? (JSON.parse(value) as string) : value.slice(1, -1).replace(/''/g, "'")
    } catch {
      return value.slice(1, -1)
    }
  }
  return value
}

function parseJson(text: string | undefined): Record<string, unknown> | undefined {
  if (!text) return
  try {
    const value: unknown = JSON.parse(text)
    return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined
  } catch {
    return
  }
}
