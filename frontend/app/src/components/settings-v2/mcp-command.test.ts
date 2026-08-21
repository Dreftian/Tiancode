import { describe, expect, test } from "bun:test"
import { formatMcpCommand, parseMcpCommand } from "./mcp-command"

describe("MCP command parsing", () => {
  test("keeps quoted executable paths intact", () => {
    expect(parseMcpCommand('"C:\\Program Files\\Python\\python.exe" -m unreal_mcp.server')).toEqual([
      "C:\\Program Files\\Python\\python.exe",
      "-m",
      "unreal_mcp.server",
    ])
  })

  test("round trips command arguments with spaces and quotes", () => {
    const command = ["npx", "-y", "@modelcontextprotocol/server-filesystem", "C:\\Project Files", 'name "with quote"']

    expect(parseMcpCommand(formatMcpCommand(command))).toEqual(command)
  })
})
