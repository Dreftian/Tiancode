import { describe, expect, test } from "bun:test"
import type { MarketplaceItem } from "@tiancode-ai/sdk/v2/client"
import { CURATED_ITEMS, mcpConfig, mcpKey, mcpPackage, mergeCatalog, searchCatalog, sourceGroup } from "./marketplace"
import { parseCommand, parseMcpConfig } from "./mcp-config"

const item = (id: string, extra: Partial<MarketplaceItem> = {}): MarketplaceItem => ({
  id,
  type: "mcp",
  name: id.split(":").pop()!,
  title: id.split(":").pop()!,
  description: "",
  source: id.split(":")[0]!,
  category: "herramientas",
  installable: false,
  ...extra,
})

describe("Discover catalog", () => {
  test("catalog MCP entries become disabled config, keeping arguments and headers as data", () => {
    expect(mcpConfig({ transport: "local", command: ["node", "C:\\Program Files\\server.js", "two words"] })).toEqual({
      type: "local",
      command: ["node", "C:\\Program Files\\server.js", "two words"],
      enabled: false,
    })
    expect(
      mcpConfig({ transport: "remote", url: "https://example.com/mcp", headers: { Authorization: "Bearer {env:TOKEN}" } }),
    ).toEqual({ type: "remote", url: "https://example.com/mcp", headers: { Authorization: "Bearer {env:TOKEN}" }, enabled: false })
    expect(mcpConfig({ transport: "remote" })).toBeUndefined()
    expect(mcpConfig({ transport: "local", command: [] })).toBeUndefined()
  })

  test("merging keeps the first copy of a server, matched by id or by URL", () => {
    const merged = mergeCatalog(
      [item("claude:linear", { mcp: { transport: "remote", url: "https://mcp.linear.app/mcp" } })],
      [item("registry:linear", { mcp: { transport: "remote", url: "https://mcp.linear.app/mcp/" } }), item("claude:linear")],
      [item("cline:other", { mcp: { transport: "local", command: ["npx", "-y", "other"] } })],
    )
    expect(merged.map((entry) => entry.id)).toEqual(["claude:linear", "cline:other"])
    expect(mcpKey({ command: ["npx", "-y", "other"] })).toBe("npx -y other")
    // Version pins and docker's -e flags do not change which server it is.
    expect(mcpKey({ command: ["npx", "-y", "@acme/mcp@1.2.3"] })).toBe(mcpKey({ command: ["npx", "-y", "@acme/mcp"] }))
    expect(mcpKey({ command: ["uvx", "markitdown-mcp==0.0.1a4"] })).toBe("uvx markitdown-mcp")
    expect(mcpKey({ command: ["docker", "run", "-i", "--rm", "-e", "TOKEN", "docker.io/acme/mcp:1.0"] })).toBe(
      "docker run -i --rm docker.io/acme/mcp",
    )
    expect(mcpPackage(["npx", "-y", "@acme/mcp@2.0.0", "--root", "C:\\x"])).toBe("@acme/mcp")
    expect(mcpPackage(["docker", "run", "-i", "--rm", "-e", "T", "acme/mcp:1"])).toBe("acme/mcp")
  })

  test("search ranks name matches ahead of description matches", () => {
    const items = [
      item("a:notes", { description: "Works with GitHub issues" }),
      item("a:github-actions", { title: "GitHub Actions" }),
      item("a:github", { title: "GitHub" }),
      item("a:other"),
    ]
    expect(searchCatalog(items, "GitHub").map((entry) => entry.id)).toEqual(["a:github", "a:github-actions", "a:notes"])
    expect(searchCatalog(items, "  ")).toHaveLength(4)
  })

  test("groups sources for the filter", () => {
    expect(["claude", "claude-work", "anthropic-skills", "codex", "openai-skills", "github", "registry", "cline", "claude-community", "tiancode"].map(sourceGroup)).toEqual([
      "claude",
      "claude",
      "claude",
      "codex",
      "codex",
      "registry",
      "registry",
      "cline",
      "community",
      "tiancode",
    ])
  })

  test("curated entries come from GitHub folders or a hosted server, never with credentials", () => {
    const composio = CURATED_ITEMS.find((entry) => entry.name === "composio")
    expect(composio?.mcp).toEqual({ transport: "remote", url: "https://connect.composio.dev/mcp" })
    for (const id of ["baseline-ui", "fixing-accessibility", "fixing-motion-performance", "fixing-metadata", "improve-ui", "create-design-md"]) {
      const entry = CURATED_ITEMS.find((curated) => curated.name === id)
      expect(entry?.skillUrl).toBe(`https://github.com/ibelick/ui-skills/tree/main/skills/${id}`)
      expect(entry?.category).toBe("diseno")
    }
    expect(new Set(CURATED_ITEMS.map((entry) => entry.id)).size).toBe(CURATED_ITEMS.length)
  })

  test("round-trips local and remote configuration and rejects typos", () => {
    const remote = { type: "remote" as const, url: "https://example.com/mcp", enabled: false, oauth: { clientId: "client", scope: "read" }, headers: { Authorization: "Bearer token" }, timeout: 30000 }
    expect(parseMcpConfig(remote)).toEqual(remote)
    expect(() => parseMcpConfig({ ...remote, timout: 50 })).toThrow()
    expect(() => parseMcpConfig({ type: "remote", url: "file:///etc/passwd" })).toThrow()
    expect(parseCommand('"C:\\Program Files\\node.exe" "C:\\My Tools\\server.js" --name "two words"'))
      .toEqual(["C:\\Program Files\\node.exe", "C:\\My Tools\\server.js", "--name", "two words"])
    expect(() => parseCommand('node "unterminated')).toThrow()
  })
})
