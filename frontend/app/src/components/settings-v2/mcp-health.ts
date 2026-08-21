export const MCP_OPERATION_CONCURRENCY = 2
export const MCP_OPERATION_LIMIT = 8

export type McpHealthConfig = {
  enabled?: boolean
  type?: "local" | "remote"
}

export type McpHealthStatus = {
  status?: string
}

export type McpHealthServer = {
  name: string
  config: McpHealthConfig
  status?: McpHealthStatus
}

export const McpProfiles = [
  {
    id: "essential",
    names: ["filesystem", "fetch", "memory", "sequential-thinking", "time", "context7", "git"],
  },
  {
    id: "design",
    names: ["agent-vision", "canva", "figma", "photoshop", "illustrator", "indesign", "coreldraw"],
  },
  {
    id: "development",
    names: [
      "filesystem",
      "fetch",
      "memory",
      "sequential-thinking",
      "time",
      "context7",
      "git",
      "node-repl",
      "android-emulator",
      "ios-simulator",
      "unreal",
      "unity",
      "live-frontend",
    ],
  },
] as const

export type McpProfile = (typeof McpProfiles)[number]

const normalizedName = (value: string) => value.trim().toLowerCase().replace(/[\s_]+/g, "-")

const matchesProfileName = (serverName: string, profileName: string) => {
  const normalizedServer = normalizedName(serverName)
  const normalizedProfile = normalizedName(profileName)
  return (
    normalizedServer === normalizedProfile ||
    normalizedServer.startsWith(`${normalizedProfile}-`) ||
    normalizedServer.endsWith(`-${normalizedProfile}`)
  )
}

export const profileServers = (profile: McpProfile, servers: readonly McpHealthServer[]) =>
  servers.filter((server) => profile.names.some((name) => matchesProfileName(server.name, name)))

const isEnabled = (server: McpHealthServer) => server.config.enabled !== false

// `connect` is a state-changing server operation for an explicitly disabled
// entry. Profiles and automatic recovery must therefore only act on entries
// the user explicitly marked enabled; default-enabled legacy entries remain
// observable but require the user to make that choice in their own row.
const isExplicitlyEnabled = (server: McpHealthServer) => server.config.enabled === true

const isConnected = (server: McpHealthServer) => server.status?.status === "connected"

const isAuthBlocked = (server: McpHealthServer) =>
  server.status?.status === "needs_auth" || server.status?.status === "needs_client_registration"

export const connectableProfileServers = (profile: McpProfile, servers: readonly McpHealthServer[]) =>
  profileServers(profile, servers).filter(
    (server) => isExplicitlyEnabled(server) && !isConnected(server) && !isAuthBlocked(server),
  )

export const healthSnapshot = (servers: readonly McpHealthServer[]) => ({
  configured: servers.length,
  enabled: servers.filter(isEnabled).length,
  connected: servers.filter(isConnected).length,
  failed: servers.filter((server) => server.status?.status === "failed").length,
  needsAuth: servers.filter(isAuthBlocked).length,
  activeLocal: servers.filter((server) => server.config.type === "local" && isConnected(server)).length,
  recoverable: servers
    .filter((server) => isExplicitlyEnabled(server) && server.status?.status === "failed")
    .map((server) => server.name),
  activeLocalNames: servers
    .filter((server) => server.config.type === "local" && isConnected(server))
    .map((server) => server.name),
})

export type McpOperationResult = {
  name: string
  ok: boolean
}

/**
 * Prevent a settings action from stampeding local runtimes. Operations are
 * deliberately capped and no operation changes configuration on its own.
 */
export async function runBoundedMcpOperations(
  names: readonly string[],
  operation: (name: string) => Promise<void>,
  options: { concurrency?: number; limit?: number } = {},
): Promise<McpOperationResult[]> {
  const concurrency = Math.max(1, options.concurrency ?? MCP_OPERATION_CONCURRENCY)
  const selected = Array.from(new Set(names)).slice(0, Math.max(0, options.limit ?? MCP_OPERATION_LIMIT))
  const results: McpOperationResult[] = []
  let next = 0

  await Promise.all(
    Array.from({ length: Math.min(concurrency, selected.length) }, async () => {
      while (next < selected.length) {
        const name = selected[next]
        next += 1
        try {
          await operation(name)
          results.push({ name, ok: true })
        } catch {
          results.push({ name, ok: false })
        }
      }
    }),
  )

  return results
}
