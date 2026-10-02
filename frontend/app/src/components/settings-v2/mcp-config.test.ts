import { describe, expect, test } from "bun:test"
import {
  EMPTY_MCP_FORM,
  formatCommand,
  mcpConfigFromForm,
  mcpFormFromConfig,
  parseCommand,
  parseKeyValues,
} from "./mcp-config"

describe("MCP server form", () => {
  test("a command with spaces and quotes reads back as the same arguments", () => {
    const args = ["C:\\Program Files\\node.exe", "server.js", "--name", "two words", 'say "hi"', ""]
    expect(parseCommand(formatCommand(args))).toEqual(args)
  })

  test("key/value lines keep '=' inside values and accept 'Key: Value' only for headers", () => {
    expect(parseKeyValues("TOKEN=abc==\n\n  =ignored\nEMPTY")).toEqual({ TOKEN: "abc==", EMPTY: "" })
    expect(parseKeyValues("Authorization: Bearer x", true)).toEqual({ Authorization: "Bearer x" })
    expect(parseKeyValues("Authorization: Bearer x")).toEqual({ "Authorization: Bearer x": "" })
    expect(parseKeyValues(" \n")).toBeUndefined()
  })

  test("a local server round-trips through the form, with the timeout in seconds", () => {
    const config = {
      type: "local" as const,
      command: ["npx", "-y", "@scope/server", "C:\\My Files"],
      cwd: "C:\\work",
      environment: { API_KEY: "sk-1=2" },
      timeout: 15000,
      enabled: true,
    }
    const form = mcpFormFromConfig(config)
    expect(form.timeout).toBe("15")
    expect(mcpConfigFromForm(form, config)).toEqual(config)
  })

  test("clearing a field removes it instead of keeping the old value", () => {
    const config = { type: "local" as const, command: ["node", "s.js"], cwd: "C:\\old", environment: { A: "1" } }
    const form = { ...mcpFormFromConfig(config), cwd: "", environment: "" }
    expect(mcpConfigFromForm(form, config)).toEqual({ type: "local", command: ["node", "s.js"] })
  })

  test("editing a remote server keeps its enabled flag and the OAuth fields the form does not show", () => {
    const config = {
      type: "remote" as const,
      url: "https://example.com/mcp",
      headers: { "X-Key": "1" },
      oauth: { clientId: "id", clientSecret: "secret", callbackPort: 19876 },
      enabled: false,
    }
    const form = { ...mcpFormFromConfig(config), scope: "read" }
    expect(form.oauth).toBe(true)
    expect(mcpConfigFromForm(form, config)).toEqual({
      ...config,
      oauth: { clientId: "id", clientSecret: "secret", callbackPort: 19876, scope: "read" },
    })
    expect(mcpConfigFromForm({ ...form, oauth: false }, config)).toMatchObject({ oauth: false })
  })

  test("invalid input throws instead of saving a server that can never start", () => {
    expect(() => mcpConfigFromForm({ ...EMPTY_MCP_FORM, command: "" })).toThrow()
    expect(() => mcpConfigFromForm({ ...EMPTY_MCP_FORM, type: "remote", url: "sse://example.com" })).toThrow()
    expect(() => mcpConfigFromForm({ ...EMPTY_MCP_FORM, command: "node s.js", timeout: "soon" })).toThrow()
    expect(() => mcpConfigFromForm({ ...EMPTY_MCP_FORM, command: "node s.js", timeout: "-1" })).toThrow()
  })
})
