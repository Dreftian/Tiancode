import { describe, expect, test } from "bun:test"
import { MarketplaceInstaller } from "../../src/marketplace/installer"

const encoder = new TextEncoder()
const files = (entries: Record<string, string>) =>
  Object.entries(entries).map(([path, content]) => ({ path, bytes: encoder.encode(content) }))

describe("MarketplaceInstaller.plan", () => {
  test("maps a Claude Code plugin's skills, commands, agents and MCP servers", () => {
    const plan = MarketplaceInstaller.plan(
      files({
        ".claude-plugin/plugin.json": JSON.stringify({ name: "demo" }),
        "skills/review/SKILL.md": "---\nname: review\n---\nReview",
        "skills/review/scripts/run.sh": "echo hi",
        "commands/ship.md": "---\ndescription: Ship it\nallowed-tools: Bash(git:*)\n---\nRun ${CLAUDE_PLUGIN_ROOT}/ship.sh",
        "commands/README.md": "# docs",
        "agents/Planner.md": "---\nname: planner\ndescription: >\n  Plans work\n  carefully\nmodel: sonnet\n---\nYou plan.",
        ".mcp.json": JSON.stringify({ mcpServers: { tracker: { command: "node", args: ["${CLAUDE_PLUGIN_ROOT}/mcp.js"] } } }),
        "hooks/hooks.json": "{}",
        "output-styles/terse.md": "x",
      }),
      { format: "claude", root: "/data/demo" },
    )
    expect(plan.skills).toHaveLength(1)
    expect(plan.skills[0]!.name).toBe("review")
    expect(plan.skills[0]!.files.map((file) => file.path).sort()).toEqual(["SKILL.md", "scripts/run.sh"])
    expect(plan.commands).toEqual([{ name: "ship", content: '---\ndescription: "Ship it"\n---\nRun /data/demo/ship.sh' }])
    expect(plan.agents).toEqual([
      { name: "planner", content: '---\ndescription: "Plans work carefully"\nmode: subagent\n---\nYou plan.' },
    ])
    expect(plan.mcp).toEqual({ tracker: { transport: "local", command: ["node", "/data/demo/mcp.js"] } })
    expect(plan.skipped).toEqual(["hooks", "output-styles"])
  })

  test("follows the folders a Codex manifest names and its inline MCP servers", () => {
    const plan = MarketplaceInstaller.plan(
      files({
        ".codex-plugin/plugin.json": JSON.stringify({
          skills: "./custom-skills/",
          mcpServers: { linear: { url: "https://mcp.linear.app/mcp" } },
        }),
        "custom-skills/triage/SKILL.md": "Triage",
        "skills/ignored/SKILL.md": "Not listed",
        ".app.json": "{}",
      }),
      { format: "codex", root: "/data/codex" },
    )
    expect(plan.skills.map((skill) => skill.name)).toEqual(["triage"])
    expect(plan.mcp).toEqual({ linear: { transport: "remote", url: "https://mcp.linear.app/mcp" } })
    expect(plan.skipped).toEqual(["chatgpt-apps"])
  })

  test("uses what the marketplace entry declares, and every .mcp.json a manifest lists", () => {
    const plan = MarketplaceInstaller.plan(
      files({
        "single-cell-rna-qc/SKILL.md": "---\nname: single-cell-rna-qc\ndescription: QC\n---\nRun it",
        "servers/a.json": JSON.stringify({ mcpServers: { a: { command: "node", args: ["a.js"] } } }),
        "servers/b.json": JSON.stringify({ b: { url: "https://b.dev/mcp" } }),
      }),
      {
        format: "claude",
        root: "/data/qc",
        source: { strict: false, components: { skills: ["./single-cell-rna-qc"], mcpServers: ["./servers/a.json", "./servers/b.json"] } },
      },
    )
    expect(plan.skills.map((skill) => skill.name)).toEqual(["single-cell-rna-qc"])
    expect(Object.keys(plan.mcp).sort()).toEqual(["a", "b"])
  })

  test("leaves Claude Code's !`command` lines for the agent to run, never the prompt loader", () => {
    expect(MarketplaceInstaller.markdownFile("Status: !`git status`\nDiff: !`git diff HEAD`", "/root", {})).toBe(
      "---\n---\nStatus: `git status`\nDiff: `git diff HEAD`",
    )
  })

  test("names a renamed skill after its folder", () => {
    expect(MarketplaceInstaller.skillFile("---\nname: review\ndescription: Reviews\nlicense: MIT\n---\nUse ${CLAUDE_PLUGIN_ROOT}/x.sh", "demo-review", "/data/demo")).toBe(
      "---\nname: demo-review\ndescription: Reviews\nlicense: MIT\n---\nUse /data/demo/x.sh",
    )
    // Claude Code allows a SKILL.md without frontmatter; Tiancode needs a name and description.
    expect(MarketplaceInstaller.skillFile("Just do it", "plain", "/r")).toBe('---\nname: plain\ndescription: "plain"\n---\nJust do it')
  })

  test("keeps a command without frontmatter as plain Markdown", () => {
    expect(MarketplaceInstaller.markdownFile("Just text\n", "/root", {})).toBe("---\n---\nJust text\n")
    expect(MarketplaceInstaller.markdownFile("---\ndescription: 'It''s fine'\n---\nBody", "/root", {})).toBe(
      '---\ndescription: "It\'s fine"\n---\nBody',
    )
  })
})
