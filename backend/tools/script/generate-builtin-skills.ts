// Regenerates the canonical built-in skill registry from the skills/ directory.
//
// The catalogue used to be transcribed by hand into two registries that drifted 41 skills
// apart, so which skills existed depended on which code path loaded them. It is now generated
// from disk into backend/core (the lower-level package), and backend/tiancode re-exports it.
//
// Run from the repo root:  bun run backend/tools/script/generate-builtin-skills.ts
import { readdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"

const SKILLS_DIR = "skills"
const OUT = "backend/core/src/plugin/skill/builtin.ts"
// Bundled licence text, not a skill.
const EXCLUDE = new Set(["LICENSE-ADDYOSMANI.md"])

const files = readdirSync(SKILLS_DIR)
  .filter((f) => f.endsWith(".md") && !EXCLUDE.has(f))
  .sort()

const slugs = files.map((f) => f.replace(/\.md$/, ""))
const ident = (slug: string) => slug.replace(/-/g, "_")

// A slug that is not a valid identifier stem would produce uncompilable output.
for (const slug of slugs) {
  if (!/^[a-z0-9-]+$/.test(slug)) throw new Error(`skill slug is not kebab-case: ${slug}`)
}

// Warn rather than fail: a skill without frontmatter still loads, it just has no description.
const missingFrontmatter = files.filter((f) => !readFileSync(join(SKILLS_DIR, f), "utf8").startsWith("---"))
if (missingFrontmatter.length > 0) {
  console.warn(`warning: no frontmatter in ${missingFrontmatter.join(", ")}`)
}

const header = `// GENERATED FILE — do not edit by hand.
// Run \`bun run backend/tools/script/generate-builtin-skills.ts\` after adding or removing a
// file in skills/. builtin-skills.test.ts fails if this drifts from the directory.
//
// Built-in engineering workflow skills bundled from https://github.com/addyosmani/agent-skills
// (MIT, (c) 2025 Addy Osmani), plus Tiancode's own. Each is a SKILL.md-style document whose
// frontmatter supplies the name and description; they register before disk discovery, so a
// user's own skill of the same name overrides them.
`

const imports = slugs.map((s) => `import ${ident(s)} from "../../../../../skills/${s}.md" with { type: "text" }`)
const entries = slugs.map((s) => `  "${s}": ${ident(s)},`)

const body = `${header}
${imports.join("\n")}

export const builtinAgentSkills: Record<string, string> = {
${entries.join("\n")}
}
`

writeFileSync(OUT, body)
console.log(`wrote ${OUT} with ${slugs.length} skills`)
