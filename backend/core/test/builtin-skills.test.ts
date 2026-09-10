import { describe, expect, test } from "bun:test"
import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { builtinAgentSkills } from "@tiancode-ai/core/plugin/skill/builtin"

// The registry is generated from this directory; the repo root is five levels up from
// backend/core/test.
const SKILLS_DIR = join(import.meta.dir, "..", "..", "..", "skills")
const EXCLUDE = new Set(["LICENSE-ADDYOSMANI.md"])

const onDisk = readdirSync(SKILLS_DIR)
  .filter((f) => f.endsWith(".md") && !EXCLUDE.has(f))
  .map((f) => f.replace(/\.md$/, ""))
  .sort()

describe("builtin skill registry", () => {
  // This is the check that matters: the catalogue was previously transcribed by hand into two
  // registries that drifted 41 skills apart, so which skills existed depended on which code
  // path loaded them. Regenerate with:
  //   bun run backend/tools/script/generate-builtin-skills.ts
  test("matches the skills/ directory exactly", () => {
    expect(Object.keys(builtinAgentSkills).sort()).toEqual(onDisk)
  })

  test("registers every skill with non-empty content", () => {
    const empty = Object.entries(builtinAgentSkills)
      .filter(([, content]) => !content || content.trim().length === 0)
      .map(([name]) => name)
    expect(empty).toEqual([])
  })

  test("every skill carries frontmatter with a name and description", () => {
    // Without them a skill registers under its filename and with no description, which is
    // what the model matches against when deciding whether to load it.
    const bad: string[] = []
    for (const slug of onDisk) {
      const raw = readFileSync(join(SKILLS_DIR, `${slug}.md`), "utf8")
      const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/)
      if (!match) {
        bad.push(`${slug}: no frontmatter`)
        continue
      }
      if (!/^name:\s*\S/m.test(match[1])) bad.push(`${slug}: no name`)
      if (!/^description:\s*\S/m.test(match[1])) bad.push(`${slug}: no description`)
    }
    expect(bad).toEqual([])
  })

  test("the tiancode package re-exports the same object", async () => {
    // Both registries feed different loaders; they must never be two catalogues again.
    const reexported = await import("../../tiancode/src/skill/builtin/skills")
    expect(reexported.builtinAgentSkills).toBe(builtinAgentSkills)
  })
})
