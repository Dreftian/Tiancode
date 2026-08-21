import path from "node:path"
import { describe, expect, test } from "bun:test"
import { agentDefinitionPath } from "../../src/server/routes/instance/httpapi/handlers/instance"

describe("agent definition paths", () => {
  test("keeps nested agent definitions inside the global agent directory", () => {
    const config = path.join(path.parse(process.cwd()).root, "tiancode-config")
    expect(agentDefinitionPath(config, "review/security")).toBe(path.join(config, "agent", "review", "security.md"))
  })

  test("rejects blank, Windows or POSIX parent-traversal, and absolute agent names", () => {
    const config = path.join(path.parse(process.cwd()).root, "tiancode-config")
    expect(agentDefinitionPath(config, "")).toBeUndefined()
    expect(agentDefinitionPath(config, "../outside")).toBeUndefined()
    expect(agentDefinitionPath(config, "..\\outside")).toBeUndefined()
    expect(agentDefinitionPath(config, "C:\\outside")).toBeUndefined()
    expect(agentDefinitionPath(config, "/outside")).toBeUndefined()
  })
})
