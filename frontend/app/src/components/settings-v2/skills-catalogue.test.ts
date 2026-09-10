import { describe, expect, test } from "bun:test"
import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"

// The Spanish maps in skills.tsx are a translation layer over the real catalogue. They used to
// carry 60 entries for skills that do not exist in skills/ — and the Skills tab appended every
// one the server had not returned, so those phantom skills were browsable and toggleable but
// could never load. This pins the maps to the real catalogue.
const ROOT = join(import.meta.dir, "..", "..", "..", "..", "..")
const SKILLS_DIR = join(ROOT, "skills")
const SOURCE = join(import.meta.dir, "skills.tsx")

const onDisk = new Set(
  readdirSync(SKILLS_DIR)
    .filter((f) => f.endsWith(".md") && f !== "LICENSE-ADDYOSMANI.md")
    .map((f) => f.replace(/\.md$/, "")),
)

const src = readFileSync(SOURCE, "utf8")

function keysOf(constName: string): string[] {
  const start = src.indexOf(`const ${constName}`)
  if (start === -1) throw new Error(`${constName} not found in skills.tsx`)
  const open = src.indexOf("{", start)
  const close = src.indexOf("\n}", open)
  const body = src.slice(open, close)
  return [...body.matchAll(/^\s*"([a-z0-9-]+)":/gm)].map((m) => m[1])
}

describe("skills.tsx Spanish maps", () => {
  test("the skills/ directory is readable from here", () => {
    // Guards the relative path above: an empty set would make every assertion below vacuous.
    expect(onDisk.size).toBeGreaterThan(50)
  })

  test("every described skill exists on disk", () => {
    const phantom = keysOf("SKILL_ES_DESCRIPTIONS").filter((k) => !onDisk.has(k))
    expect(phantom).toEqual([])
  })

  test("every inlined body belongs to a skill that exists", () => {
    const phantom = keysOf("SKILL_ES_CONTENTS").filter((k) => !onDisk.has(k))
    expect(phantom).toEqual([])
  })

  test("the server list is used as-is rather than merged with the bundled one", () => {
    // The bug was `return [...serverSkills, ...extra]`, which re-added the phantom entries.
    const memo = src.slice(src.indexOf("const skills = createMemo"), src.indexOf("const filteredSkills"))
    expect(memo).toContain("if (serverSkills.length > 0) return serverSkills")
    expect(memo).not.toContain("...extra")
  })
})
