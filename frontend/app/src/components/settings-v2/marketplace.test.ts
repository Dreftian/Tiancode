import { describe, expect, test } from "bun:test"
import { MARKETPLACE_SNAPSHOT, marketplaceMcpConfig, parseMarketplace } from "./marketplace"
import { parseCommand, parseMcpConfig } from "./mcp-config"

describe("optional marketplace", () => {
  test("exposes the complete offline catalog without enabling entries", () => {
    expect(MARKETPLACE_SNAPSHOT).toHaveLength(203)
    expect(MARKETPLACE_SNAPSHOT.filter((entry) => entry.type === "mcp")).toHaveLength(149)
    expect(MARKETPLACE_SNAPSHOT.filter((entry) => entry.type === "skill")).toHaveLength(38)
    expect(MARKETPLACE_SNAPSHOT.filter((entry) => entry.type === "plugin")).toHaveLength(16)
    expect(MARKETPLACE_SNAPSHOT.filter((entry) => entry.config).every((entry) => entry.config?.enabled === false)).toBe(true)
    expect(MARKETPLACE_SNAPSHOT.filter((entry) => entry.type === "plugin").every((entry) => !entry.config && !entry.skillURL)).toBe(true)
  })

  test("keeps arguments and headers as data", () => {
    expect(marketplaceMcpConfig(["test", "--", "node", "C:\\Program Files\\server.js", "two words"]))
      .toEqual({ type: "local", command: ["node", "C:\\Program Files\\server.js", "two words"], enabled: false })
    expect(marketplaceMcpConfig(["test", "--transport", "http", "https://example.com/mcp", "--header", "Authorization: Bearer ${TOKEN}"]))
      .toEqual({ type: "remote", url: "https://example.com/mcp", headers: { Authorization: "Bearer ${TOKEN}" }, enabled: false })
    expect(marketplaceMcpConfig(["test", "--transport", "http", "javascript:alert(1)"])).toBeUndefined()
  })

  test("rejects malformed catalog entries and duplicate identifiers", () => {
    const entry = { id: "test", type: "plugin", name: "Test", description: "Test", install: { args: [] }, repo: "javascript:alert(1)" }
    expect(parseMarketplace({ entries: [null, { ...entry, id: "../test" }, entry, entry] })).toHaveLength(1)
    expect(parseMarketplace({ entries: [entry] })[0].source).toBeUndefined()
    expect(parseMarketplace({ entries: "invalid" })).toEqual([])
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
