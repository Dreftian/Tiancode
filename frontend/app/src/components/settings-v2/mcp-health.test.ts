import { describe, expect, test } from "bun:test"
import {
  connectableProfileServers,
  healthSnapshot,
  McpProfiles,
  MCP_OPERATION_CONCURRENCY,
  MCP_OPERATION_LIMIT,
  profileServers,
  runBoundedMcpOperations,
} from "./mcp-health"

describe("MCP health profiles", () => {
  const servers = [
    { name: "filesystem", config: { type: "local" as const, enabled: true }, status: { status: "connected" } },
    { name: "context7-docs", config: { type: "local" as const, enabled: true }, status: { status: "failed" } },
    { name: "canva", config: { type: "remote" as const, enabled: true }, status: { status: "needs_auth" } },
    { name: "playwright", config: { type: "local" as const, enabled: true }, status: { status: "connected" } },
    { name: "git", config: { type: "local" as const, enabled: false }, status: { status: "disabled" } },
  ]

  test("profiles only select configured matching integrations", () => {
    const essential = McpProfiles.find((profile) => profile.id === "essential")!
    const design = McpProfiles.find((profile) => profile.id === "design")!
    const development = McpProfiles.find((profile) => profile.id === "development")!

    expect(profileServers(essential, servers).map((server) => server.name)).toEqual(["filesystem", "context7-docs", "git"])
    expect(connectableProfileServers(essential, servers).map((server) => server.name)).toEqual(["context7-docs"])
    expect(connectableProfileServers(design, servers)).toEqual([])
    expect(development.names).not.toContain("playwright")
    expect(development.names).not.toContain("chrome-devtools")
  })

  test("health only classifies actual configured connection state", () => {
    expect(healthSnapshot(servers)).toEqual({
      configured: 5,
      enabled: 4,
      connected: 2,
      failed: 1,
      needsAuth: 1,
      activeLocal: 2,
      recoverable: ["context7-docs"],
      activeLocalNames: ["filesystem", "playwright"],
    })
  })

  test("automatic recovery ignores legacy default-enabled entries", () => {
    expect(
      healthSnapshot([
        { name: "legacy", config: { type: "local" as const }, status: { status: "failed" } },
        { name: "explicit", config: { type: "local" as const, enabled: true }, status: { status: "failed" } },
      ]).recoverable,
    ).toEqual(["explicit"])
  })

  test("recovery runner deduplicates, caps work, and keeps concurrency bounded", async () => {
    let running = 0
    let peak = 0
    const results = await runBoundedMcpOperations(
      Array.from({ length: MCP_OPERATION_LIMIT + 3 }, (_, index) => `server-${index}`).concat("server-0"),
      async () => {
        running += 1
        peak = Math.max(peak, running)
        await new Promise((resolve) => setTimeout(resolve, 2))
        running -= 1
      },
    )

    expect(results).toHaveLength(MCP_OPERATION_LIMIT)
    expect(results.every((result) => result.ok)).toBe(true)
    expect(peak).toBeLessThanOrEqual(MCP_OPERATION_CONCURRENCY)
  })
})
