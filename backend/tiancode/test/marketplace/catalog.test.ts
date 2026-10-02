import { describe, expect, test } from "bun:test"
import { MarketplaceCatalog } from "../../src/marketplace/catalog"
import { MarketplaceFetch } from "../../src/marketplace/fetch"
import { MarketplaceIcons } from "../../src/marketplace/icons"
import { MarketplaceSnapshot } from "../../src/marketplace/snapshot"

describe("MarketplaceCatalog", () => {
  test("reads a Claude Code marketplace with relative, github and git-subdir sources", () => {
    const items = MarketplaceCatalog.fromClaudeMarketplace(
      {
        plugins: [
          { name: "code-review", description: "Reviews PRs", category: "development", source: "./plugins/code-review" },
          {
            name: "Stripe",
            description: "Payments",
            source: { source: "github", repo: "stripe/ai", sha: "abc123" },
            homepage: "https://github.com/stripe/ai",
          },
          {
            name: "sub",
            source: { source: "git-subdir", url: "https://github.com/acme/tools.git", path: "plugins/sub", ref: "v2" },
          },
          { name: "", source: "./nothing" },
          { name: "npm-only", source: { source: "npm", package: "x" } },
        ],
      },
      { source: "claude", owner: "anthropics", repo: "claude-plugins-official", ref: "main", verified: true },
    )
    expect(items.map((item) => item.id)).toEqual(["claude:code-review", "claude:stripe", "claude:sub", "claude:npm-only"])
    expect(items[0]!.plugin).toEqual({
      format: "claude",
      owner: "anthropics",
      repo: "claude-plugins-official",
      ref: "main",
      path: "plugins/code-review",
    })
    expect(items[0]!.category).toBe("desarrollo")
    expect(items[1]!.plugin).toEqual({ format: "claude", owner: "stripe", repo: "ai", ref: "abc123", path: "" })
    expect(items[1]!.icon).toBe("https://avatars.githubusercontent.com/stripe?size=96")
    expect(items[2]!.plugin).toEqual({ format: "claude", owner: "acme", repo: "tools", ref: "v2", path: "plugins/sub" })
    // A source Tiancode cannot download is still listed, without an installer.
    expect(items[3]!.plugin).toBeUndefined()
  })

  test("reads Codex plugins with their manifest logos and skips unavailable ones", () => {
    const info = MarketplaceCatalog.codexPluginInfo(
      { interface: { displayName: "Linear", logo: "./assets/logo.png", websiteURL: "https://linear.app" } },
      "https://raw.githubusercontent.com/openai/plugins/main/plugins/linear",
    )
    expect(info?.logo).toBe("https://raw.githubusercontent.com/openai/plugins/main/plugins/linear/assets/logo.png")
    const items = MarketplaceCatalog.fromCodexMarketplace(
      {
        plugins: [
          { name: "linear", source: { source: "local", path: "./plugins/linear" }, category: "Productivity" },
          { name: "hidden", source: "./plugins/hidden", policy: { installation: "NOT_AVAILABLE" } },
        ],
      },
      { owner: "openai", repo: "plugins", ref: "main", logos: { linear: info! } },
    )
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({
      id: "codex:linear",
      title: "Linear",
      domain: "linear.app",
      category: "productividad",
      plugin: { format: "codex", owner: "openai", repo: "plugins", ref: "main", path: "plugins/linear" },
    })
  })

  test("keeps directory connectors a third-party client can reach and marks how they sign in", () => {
    const connectors = MarketplaceCatalog.fromAnthropicDirectory([
      entry("notion", "Notion", "https://mcp.notion.com/mcp"),
      entry("gmail", "Gmail", "https://gmail.mcp.claude.com/mcp"),
      entry("slack", "Slack", "https://mcp.slack.com/mcp"),
      entry("figma", "Figma", "https://mcp.figma.com/mcp"),
      entry("docs", "Docs", "https://docs.example.com/mcp", true),
    ])
    expect(connectors.map((connector) => [connector.id, connector.auth])).toEqual([
      ["notion", "oauth"],
      ["slack", "own-app"],
      ["figma", "restricted"],
      ["docs", "none"],
    ])
    expect(connectors[0]!.domain).toBe("notion.so")
  })

  test("finds the vendor site behind a directory connector", () => {
    expect(MarketplaceCatalog.directoryLogo("https://mcp.linear.app/mcp", "https://linear.app", "https://mcp.linear.app/mcp")).toEqual({
      icon: undefined,
      domain: "linear.app",
    })
    expect(
      MarketplaceCatalog.directoryLogo(
        "https://www.notion.so/images/notion-logo-block-main.svg",
        "https://notion.com",
        "https://mcp.notion.com/mcp",
      ),
    ).toEqual({ icon: "https://www.notion.so/images/notion-logo-block-main.svg", domain: "www.notion.so" })
    expect(
      MarketplaceCatalog.directoryLogo(
        "https://www.google.com/s2/favicons?domain=jotform.com&sz=256",
        "https://www.jotform.com/",
        "https://mcp.jotform.com/mcp-app",
      ),
    ).toEqual({ icon: "https://www.google.com/s2/favicons?domain=jotform.com&sz=256", domain: "jotform.com" })
    expect(
      MarketplaceCatalog.directoryLogo("https://bindings.mcp.cloudflare.com/mcp", "https://cloudflare.com", "https://bindings.mcp.cloudflare.com/mcp")
        .domain,
    ).toBe("cloudflare.com")
    expect(MarketplaceCatalog.directoryLogo(undefined, undefined, "https://mcp-server.egnyte.com/mcp").domain).toBe("egnyte.com")
  })

  test("adds the Codex connectors the directory lacks without duplicating the ones it has", () => {
    const merged = MarketplaceCatalog.mergeConnectors(
      MarketplaceCatalog.fromAnthropicDirectory([entry("notion", "Notion", "https://mcp.notion.com/mcp/")]),
    )
    const notion = merged.filter((connector) => connector.title === "Notion")
    expect(notion).toHaveLength(1)
    expect(notion[0]!.sources).toEqual(["claude", "codex"])
    expect(merged.find((connector) => connector.title === "Gmail")).toMatchObject({ auth: "own-app", sources: ["codex"] })
    expect(merged.find((connector) => connector.title === "OpenAI Docs")?.auth).toBe("none")
    expect(merged.map((connector) => connector.title)).toEqual(
      [...merged.map((connector) => connector.title)].sort((a, b) => a.localeCompare(b)),
    )
  })

  test("turns registry servers into installable MCP entries", () => {
    const items = MarketplaceCatalog.fromMcpRegistry(
      {
        servers: [
          {
            server: {
              name: "io.github.acme/remote",
              description: "Remote search",
              remotes: [
                { type: "streamable-http", url: "https://mcp.acme.dev/{tenant}" },
                {
                  type: "streamable-http",
                  url: "https://mcp.acme.dev/mcp",
                  headers: [{ name: "Authorization", value: "Bearer {api_key}", isSecret: true }],
                },
              ],
              _meta: {
                "io.modelcontextprotocol.registry/publisher-provided": {
                  github: { ownerAvatarUrl: "https://avatars.githubusercontent.com/u/1", stargazerCount: 42 },
                },
              },
            },
          },
          {
            server: {
              name: "io.github.acme/local",
              packages: [
                {
                  registryType: "npm",
                  identifier: "@acme/mcp",
                  version: "1.2.3",
                  environmentVariables: [{ name: "ACME_TOKEN", isRequired: true }, { name: "OPTIONAL" }],
                },
              ],
            },
          },
          {
            server: { name: "gone", remotes: [{ url: "https://gone.dev/mcp" }] },
            _meta: { "io.modelcontextprotocol.registry/official": { status: "deleted" } },
          },
        ],
      },
      "github",
    )
    expect(items).toHaveLength(2)
    expect(items[0]).toMatchObject({
      id: "github:io.github.acme/remote",
      name: "remote",
      icon: "https://avatars.githubusercontent.com/u/1",
      stars: 42,
      mcp: { transport: "remote", url: "https://mcp.acme.dev/mcp", headers: { Authorization: "Bearer {env:API_KEY}" } },
    })
    expect(items[1]!.mcp).toEqual({
      transport: "local",
      command: ["npx", "-y", "@acme/mcp@1.2.3"],
      environment: { ACME_TOKEN: "{env:ACME_TOKEN}" },
    })
  })

  test("translates .mcp.json entries, including plugin-root and environment placeholders", () => {
    expect(
      MarketplaceCatalog.mcpFromEntry(
        { command: "node", args: ["${CLAUDE_PLUGIN_ROOT}/server.js"], env: { KEY: "${API_KEY:-none}" } },
        "/data/plugins/x",
      ),
    ).toEqual({ transport: "local", command: ["node", "/data/plugins/x/server.js"], environment: { KEY: "{env:API_KEY}" } })
    expect(MarketplaceCatalog.mcpFromEntry({ type: "http", url: "http://localhost:3000/mcp" })).toBeUndefined()
    expect(MarketplaceCatalog.mcpServers({ mcpServers: { a: { command: "x" } } })).toEqual({ a: { command: "x" } })
    expect(MarketplaceCatalog.mcpServers({ a: { command: "x" }, version: 1 })).toEqual({ a: { command: "x" } })
  })

  test("lists skills from a skill marketplace and from a repository tree", () => {
    expect(
      MarketplaceCatalog.fromSkillMarketplace(
        { plugins: [{ name: "document-skills", skills: ["./skills/pdf", "./skills/docx", "./skills/pdf"] }] },
        { owner: "anthropics", repo: "skills", ref: "main" },
      ).map((item) => [item.id, item.skillUrl]),
    ).toEqual([
      ["anthropic-skills:pdf", "https://github.com/anthropics/skills/tree/main/skills/pdf"],
      ["anthropic-skills:docx", "https://github.com/anthropics/skills/tree/main/skills/docx"],
    ])
    expect(
      MarketplaceCatalog.fromSkillTree(
        {
          tree: [
            { type: "blob", path: "skills/.system/x/SKILL.md" },
            { type: "blob", path: "skills/.curated/gh-fix-ci/SKILL.md" },
            { type: "blob", path: "README.md" },
          ],
        },
        { owner: "openai", repo: "skills", ref: "main", prefix: "skills/", source: "openai-skills" },
      ).map((item) => item.name),
    ).toEqual(["x", "gh-fix-ci"])
  })

  test("reads Cline's catalog, leaving out entries it cannot install", () => {
    const items = MarketplaceCatalog.fromCline({
      entries: [
        { id: "context7", type: "mcp", name: "Context7", tags: ["software"], install: { args: ["mcp", "add", "--", "npx", "-y", "@upstash/context7-mcp"] } },
        {
          id: "remote",
          type: "mcp",
          install: { args: ["mcp", "add", "--transport", "http", "https://mcp.example.dev/mcp", "--header", "X-Key: ${KEY}"] },
        },
        { id: "broken", type: "mcp", install: { args: ["mcp", "add"] } },
        { id: "skill", type: "skill", homepage: "https://github.com/acme/skills/tree/main/skill" },
        { id: "bundle", type: "plugin" },
      ],
    })
    expect(items.map((item) => item.id)).toEqual(["cline:context7", "cline:remote", "cline:skill"])
    expect(items[0]!.mcp).toEqual({ transport: "local", command: ["npx", "-y", "@upstash/context7-mcp"] })
    expect(items[1]!.mcp).toEqual({ transport: "remote", url: "https://mcp.example.dev/mcp", headers: { "X-Key": "{env:KEY}" } })
  })

  test("merging keeps the first copy of a server listed by several sources", () => {
    const directory = MarketplaceCatalog.connectorItems(
      MarketplaceCatalog.fromAnthropicDirectory([entry("linear", "Linear", "https://mcp.linear.app/mcp")]),
    )
    const registry = MarketplaceCatalog.fromMcpRegistry(
      { servers: [{ server: { name: "app.linear/linear", remotes: [{ url: "https://mcp.linear.app/mcp/" }] } }] },
      "registry",
    )
    const merged = MarketplaceCatalog.merge(directory, registry, directory)
    expect(merged.map((item) => item.id)).toEqual(["claude:linear"])
  })

  test("only accepts https URLs and public host names", () => {
    expect(MarketplaceCatalog.httpsUrl("http://example.com")).toBeUndefined()
    expect(MarketplaceCatalog.httpsUrl("https://user:pw@example.com")).toBeUndefined()
    expect(MarketplaceCatalog.domainOf("https://www.notion.so/x")).toBe("www.notion.so")
    expect(MarketplaceCatalog.domainOf("10.0.0.1")).toBeUndefined()
    expect(MarketplaceCatalog.domainOf("printer.local")).toBeUndefined()
    expect(MarketplaceFetch.publicHttps("https://api.github.com/x")).toBe(true)
    expect(MarketplaceFetch.publicHttps("http://api.github.com/x")).toBe(false)
    expect(MarketplaceFetch.publicHttps("https://127.0.0.1/x")).toBe(false)
    expect(MarketplaceFetch.publicHttps("https://[::1]/x")).toBe(false)
    expect(MarketplaceFetch.publicHttps("https://localhost/x")).toBe(false)
    expect(MarketplaceFetch.publicHttps("https://nas.home/x")).toBe(false)
  })

  test("prefers a site's apple-touch-icon, then its largest declared icon", () => {
    expect(
      MarketplaceIcons.iconLinks(
        `<head>
          <link rel="icon" href="/favicon-16.png" sizes="16x16">
          <link rel='icon' href='/favicon-192.png' sizes='192x192'>
          <link rel="mask-icon" href="/mask.svg">
          <link rel="apple-touch-icon" href="https://cdn.example.com/touch.png">
          <link rel="icon" href="data:image/png;base64,AAAA">
        </head>`,
        "https://example.com/home",
      ),
    ).toEqual(["https://cdn.example.com/touch.png", "https://example.com/favicon-192.png", "https://example.com/favicon-16.png"])
  })

  test("the bundled snapshot holds every kind of entry", () => {
    const snapshot = MarketplaceSnapshot.load()
    const types = new Set(snapshot.items.map((item) => item.type))
    expect([...types].sort()).toEqual(["mcp", "plugin", "skill"])
    expect(snapshot.connectors.length).toBeGreaterThan(100)
    expect(new Set(snapshot.items.map((item) => item.id)).size).toBe(snapshot.items.length)
  })
})

function entry(slug: string, displayName: string, url: string, isAuthless = false) {
  return {
    server: { name: `com.example/${slug}`, title: displayName, remotes: [{ type: "streamable-http", url }] },
    _meta: {
      "com.anthropic.api/mcp-registry": {
        slug,
        displayName,
        oneLiner: `${displayName} connector`,
        url,
        isAuthless,
        iconUrl: slug === "notion" ? "https://notion.so" : undefined,
      },
    },
  }
}
