import path from "node:path"
import { describe, expect, test } from "bun:test"
import { skillImportDestination, skillImportRoot } from "../../src/server/routes/instance/httpapi/handlers/instance"

describe("skill import destinations", () => {
  const root = path.join(process.cwd(), "skills")

  test("keeps imported skill files inside the selected skill directory", () => {
    expect(skillImportDestination(root, "references/guide.md")).toBe(path.join(root, "references", "guide.md"))
  })

  test("rejects parent traversals and absolute paths", () => {
    expect(skillImportDestination(root, "../config.json")).toBeUndefined()
    expect(skillImportDestination(root, "..\\config.json")).toBeUndefined()
    expect(skillImportDestination(root, "C:\\config.json")).toBeUndefined()
    expect(skillImportDestination(root, path.resolve(root, "..", "config.json"))).toBeUndefined()
  })

  test("keeps skill names below the global skills directory", () => {
    const config = path.join(process.cwd(), "config")

    expect(skillImportRoot(config, "my-skill")).toBe(path.join(config, "skills", "my-skill"))
    expect(skillImportRoot(config, "../outside")).toBeUndefined()
  })
})
