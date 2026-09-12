import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import {
  CATEGORY_BACKEND,
  CATEGORY_FRONTEND,
  CATEGORY_TESTING,
  SAFE_SKILLS,
  catalogueState,
  localizeSkillHeadings,
} from "./skills-catalogue"

describe("catalogueState", () => {
  test("an empty list is loading until the retries are spent", () => {
    // The panel used to ship 200 lines of hand-written summaries purely so a slow first load did
    // not look like "you have no skills". This is the honest version of that.
    expect(catalogueState({ count: 0, settled: false })).toBe("loading")
    expect(catalogueState({ count: 0, settled: true })).toBe("empty")
  })

  test("a populated list is never a spinner", () => {
    expect(catalogueState({ count: 3, settled: false })).toBe("ready")
    expect(catalogueState({ count: 3, settled: true })).toBe("ready")
  })
})

describe("localizeSkillHeadings", () => {
  test("translates the standard headings of a real SKILL.md", () => {
    const body = "## Overview\ntext\n### When to Use\n- a\n# Checklist\n1. x"
    expect(localizeSkillHeadings(body, true)).toBe(
      "## Descripción general\ntext\n### Cuándo usar\n- a\n# Lista de verificación\n1. x",
    )
  })

  test("leaves the document alone in every other language", () => {
    const body = "## Overview\ntext"
    expect(localizeSkillHeadings(body, false)).toBe(body)
  })

  test("an unknown heading is left as the author wrote it", () => {
    expect(localizeSkillHeadings("## Telemetry\nbody", true)).toBe("## Telemetry\nbody")
  })

  test("code blocks and tables survive byte for byte", () => {
    const body = ["## Examples", "```bash", "bun test", "```", "| a | b |", "| - | - |"].join("\n")
    const out = localizeSkillHeadings(body, true)
    expect(out).toContain("```bash\nbun test\n```")
    expect(out).toContain("| a | b |")
    expect(out).toContain("## Ejemplos prácticos")
  })

  test("absent or blank content is an empty string, not undefined", () => {
    expect(localizeSkillHeadings(undefined, true)).toBe("")
    expect(localizeSkillHeadings("   ", true)).toBe("")
  })
})

describe("skill classifiers", () => {
  test("every set is populated and kebab-cased", () => {
    for (const set of [SAFE_SKILLS, CATEGORY_FRONTEND, CATEGORY_BACKEND, CATEGORY_TESTING]) {
      expect(set.size).toBeGreaterThan(0)
      for (const name of set) expect(name).toMatch(/^[a-z0-9][a-z0-9_-]*$/)
    }
  })
})

describe("skills.tsx", () => {
  const src = readFileSync(join(import.meta.dir, "skills.tsx"), "utf8")

  test("carries no second catalogue of its own", () => {
    // These maps shadowed the server's real SKILL.md bodies with hand-written stubs, and
    // SPECIALIZED_CONFLICT_TIPS rendered Spanish paragraphs to every locale.
    for (const symbol of [
      "SKILL_ES_DESCRIPTIONS",
      "SKILL_ES_CONTENTS",
      "SPECIALIZED_CONFLICT_TIPS",
      "builtInSkills",
      "localizeSkillDescription",
      "localizeSkillContent",
    ]) {
      expect(src).not.toContain(symbol)
    }
  })

  test("the skill list is the server's answer with no fallback branch", () => {
    const memo = src.slice(src.indexOf("const skills = createMemo"), src.indexOf("const catalogueLoading"))
    expect(memo).toContain("data().skills")
    expect(memo).not.toContain("serverSkills")
  })
})
