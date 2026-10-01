export type SummaryService = "mcp" | "plugins" | "skills" | "lsp"

type McpStatus = "connected" | "disabled" | "failed" | "pending" | "needs_auth" | "needs_client_registration"

/** The status text shown next to an MCP server; connected and disabled speak through the switch. */
export function mcpStatusLabel(status: McpStatus | undefined) {
  if (status === "failed") return "session.summary.failed" as const
  if (status === "pending") return "session.summary.connecting" as const
  if (status === "needs_auth" || status === "needs_client_registration") return "session.summary.needsAuth" as const
  return undefined
}

type PluginEntry = string | [string, unknown] | readonly [string, unknown]

/**
 * Plugins from `config.plugin` with their real state. Entries are a spec string or a
 * [spec, options] tuple; `{ enabled: false }` is how Settings → MCP y Plugins turns one off.
 * `builtin-*` entries are UI-only markers, not plugins the user installed.
 */
export function pluginEntries(list: readonly PluginEntry[] | undefined) {
  return (list ?? [])
    .map((entry) => {
      const spec = typeof entry === "string" ? entry : entry[0]
      const options = typeof entry === "string" ? undefined : entry[1]
      const enabled = !(options && typeof options === "object" && "enabled" in options && options.enabled === false)
      return { spec, name: pluginName(spec), enabled }
    })
    .filter((plugin) => plugin.spec && !plugin.spec.startsWith("builtin-"))
    .toSorted((a, b) => a.name.localeCompare(b.name))
}

export function pluginName(spec: string) {
  if (/^(file:|[a-z]:[\\/]|\/|\.)/i.test(spec)) {
    const file = spec.replace(/^file:\/*/i, "").split(/[\\/]/).filter(Boolean).at(-1) ?? spec
    return file.replace(/\.[cm]?[jt]s$/i, "")
  }
  // npm specs: "name@1.2.3", "@scope/name@^2" -> drop the version, keep the scope.
  const at = spec.lastIndexOf("@")
  return at > 0 ? spec.slice(0, at) : spec
}

/** Where the configuration lives: the project's own file first, then the global one. */
export function summaryConfigPath(input: { directory: string; config?: string }) {
  const join = (base: string, ...parts: string[]) => {
    const separator = base.includes("\\") ? "\\" : "/"
    return [base.replace(/[\\/]+$/, ""), ...parts].join(separator)
  }
  return [
    join(input.directory, "tiancode.json"),
    join(input.directory, "tiancode.jsonc"),
    join(input.directory, ".tiancode", "tiancode.json"),
    ...(input.config ? [join(input.config, "tiancode.json"), join(input.config, "tiancode.jsonc")] : []),
  ]
}
