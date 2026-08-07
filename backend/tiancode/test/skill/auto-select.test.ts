import { afterEach, describe, expect, test } from "bun:test"
import { autoSelectFor, fmtAuto } from "../../src/skill/auto-select"
import type { Info as SkillInfo } from "../../src/skill"
import path from "node:path"
import fs from "node:fs/promises"

// Catálogo mínimo con los nombres que usan las reglas de auto-selección.
const catalog: SkillInfo[] = [
  "test-driven-development",
  "code-review-and-quality",
  "verification-before-completion",
  "frontend-design",
  "frontend-ui-engineering",
  "web-quality-audit",
  "api-and-interface-design",
  "security-and-hardening",
  "observability-and-instrumentation",
  "deploy-checklist",
  "ci-cd-and-automation",
  "shipping-and-launch",
  "git-workflow-and-versioning",
  "resolving-merge-conflicts",
  "sql-queries",
  "domain-modeling",
  "incident-response",
  "documentation-and-adrs",
  "doc-coauthoring",
  "performance-optimization",
  "debugging-and-error-recovery",
  "testing-strategy",
  "code-simplification",
].map((name) => ({ name, location: `<test:${name}>`, content: `# ${name}` }))

const names = (skills: SkillInfo[]) => skills.map((skill) => skill.name)

const created: string[] = []
afterEach(async () => {
  await Promise.all(created.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })))
})

async function project(files: Record<string, string>): Promise<string> {
  const dir = await fs.mkdtemp(path.join(import.meta.dirname, "auto-select-"))
  created.push(dir)
  for (const [file, content] of Object.entries(files)) {
    const target = path.join(dir, file)
    await fs.mkdir(path.dirname(target), { recursive: true })
    await fs.writeFile(target, content)
  }
  return dir
}

describe("skill auto-select", () => {
  test("sin señales selecciona solo las skills base", async () => {
    const dir = await project({})
    const selected = await autoSelectFor(dir, catalog)
    expect(selected.length).toBe(3)
    expect(names(selected)).toEqual([
      "test-driven-development",
      "code-review-and-quality",
      "verification-before-completion",
    ])
  })

  test("proyecto web frontend añade las skills de frontend", async () => {
    const dir = await project({
      "package.json": JSON.stringify({ dependencies: { react: "^19" } }),
    })
    const selected = names(await autoSelectFor(dir, catalog))
    expect(selected).toContain("frontend-design")
    expect(selected).toContain("frontend-ui-engineering")
    expect(selected).toContain("web-quality-audit")
    expect(selected).toContain("test-driven-development")
  })

  test("proyecto python detecta pyproject.toml", async () => {
    const dir = await project({ "pyproject.toml": "[project]\nname = \"demo\"\n" })
    const selected = names(await autoSelectFor(dir, catalog))
    expect(selected).toContain("debugging-and-error-recovery")
    expect(selected).toContain("testing-strategy")
  })

  test("proyecto rust detecta Cargo.toml", async () => {
    const dir = await project({ "Cargo.toml": "[package]\nname = \"demo\"\n" })
    const selected = names(await autoSelectFor(dir, catalog))
    expect(selected).toContain("performance-optimization")
    expect(selected).toContain("debugging-and-error-recovery")
  })

  test("docker + CI añaden deploy y ci-cd", async () => {
    const dir = await project({
      "Dockerfile": "FROM node:22\n",
      ".github/workflows/ci.yml": "name: CI\non: [push]\n",
    })
    const selected = names(await autoSelectFor(dir, catalog))
    expect(selected).toContain("deploy-checklist")
    expect(selected).toContain("ci-cd-and-automation")
  })

  test("api detectada desde package.json con framework de servidor", async () => {
    const dir = await project({
      "package.json": JSON.stringify({ dependencies: { express: "^4" } }),
    })
    const selected = names(await autoSelectFor(dir, catalog))
    expect(selected).toContain("api-and-interface-design")
  })

  test("respeto el límite máximo de skills", async () => {
    const dir = await project({
      "package.json": JSON.stringify({ dependencies: { react: "^19", express: "^4" } }),
      "Dockerfile": "FROM node:22\n",
      ".github/workflows/ci.yml": "name: CI\n",
      "prisma/schema.prisma": "model User { id Int }\n",
    })
    const selected = await autoSelectFor(dir, catalog)
    expect(selected.length).toBeLessThanOrEqual(6)
  })

  test("fmtAuto incluye el contenido de las skills seleccionadas", async () => {
    const dir = await project({})
    const selected = await autoSelectFor(dir, catalog)
    const block = fmtAuto(selected)
    expect(block).toContain("## Skill: test-driven-development")
    expect(block).toContain("# test-driven-development")
  })
})
