// Auto-selección de skills según el tipo de proyecto. Escanea el workspace en
// busca de señales (manifiestos, configuraciones, carpetas) y empareja cada
// señal con las skills del catálogo que más aplican; el contenido completo de
// las skills seleccionadas se inyecta en el system prompt del asistente y de
// sus sub-agentes, para que cualquier modelo las use sin tener que invocar la
// herramienta skill manualmente.

export * as AutoSelect from "./auto-select"

import { readdir, readFile } from "node:fs/promises"
import { join } from "node:path"
import type { Info as SkillInfo } from "./index"

const MAX_AUTO_SKILLS = 6

// Skills base que aplican a cualquier proyecto de software.
const BASE_SKILLS = [
  "test-driven-development",
  "code-review-and-quality",
  "verification-before-completion",
] as const

type Rule = { signals: string[]; skills: string[] }

// Señal -> skills del catálogo. El orden importa: las primeras reglas que
// coinciden se toman antes de agotar el límite.
const RULES: Rule[] = [
  { signals: ["web-frontend"], skills: ["frontend-design", "frontend-ui-engineering", "web-quality-audit"] },
  { signals: ["api"], skills: ["api-and-interface-design", "security-and-hardening", "observability-and-instrumentation"] },
  { signals: ["docker"], skills: ["deploy-checklist", "ci-cd-and-automation", "shipping-and-launch"] },
  { signals: ["ci"], skills: ["ci-cd-and-automation", "git-workflow-and-versioning"] },
  { signals: ["sql"], skills: ["sql-queries", "domain-modeling"] },
  { signals: ["infra"], skills: ["deploy-checklist", "incident-response", "security-and-hardening"] },
  { signals: ["docs"], skills: ["documentation-and-adrs", "doc-coauthoring"] },
  { signals: ["rust"], skills: ["performance-optimization", "debugging-and-error-recovery"] },
  { signals: ["python"], skills: ["debugging-and-error-recovery", "testing-strategy"] },
  { signals: ["node", "typescript"], skills: ["debugging-and-error-recovery", "performance-optimization"] },
  { signals: ["go", "dotnet"], skills: ["testing-strategy", "code-simplification"] },
  { signals: ["git"], skills: ["git-workflow-and-versioning", "resolving-merge-conflicts"] },
]

// Lee las señales del workspace sin recorrer árboles grandes: solo la raíz,
// .github y un par de manifiestos pequeños.
async function detectSignals(worktree: string): Promise<Set<string>> {
  const signals = new Set<string>()
  let entries: { name: string; isDir: boolean }[] = []
  try {
    const dirents = await readdir(worktree, { withFileTypes: true })
    entries = dirents.map((d) => ({ name: d.name, isDir: d.isDirectory() }))
  } catch {
    return signals
  }

  const names = new Set(entries.map((entry) => entry.name))
  const has = (name: string) => names.has(name)
  const hasDir = (name: string) => entries.some((entry) => entry.name === name && entry.isDir)

  if (has(".git") || hasDir(".git")) signals.add("git")

  const readJson = async (file: string): Promise<Record<string, unknown> | undefined> => {
    if (!has(file)) return
    try {
      const content = await readFile(join(worktree, file), "utf8")
      if (content.length > 64 * 1024) return
      return JSON.parse(content) as Record<string, unknown>
    } catch {
      return
    }
  }
  const readText = async (file: string): Promise<string | undefined> => {
    if (!has(file)) return
    try {
      const content = await readFile(join(worktree, file), "utf8")
      return content.length > 64 * 1024 ? undefined : content
    } catch {
      return
    }
  }

  const pkg = await readJson("package.json")
  if (pkg) {
    signals.add("node")
    const deps = JSON.stringify(pkg.dependencies ?? {}) + JSON.stringify(pkg.devDependencies ?? {})
    if (/react|vue|svelte|next|astro|vite|solid/.test(deps)) signals.add("web-frontend")
    if (/express|fastify|koa|nest|hono|trpc/.test(deps)) signals.add("api")
    if (/typescript|tsx/.test(deps)) signals.add("typescript")
  }
  if (has("tsconfig.json")) signals.add("typescript")
  if (has("pyproject.toml") || has("requirements.txt") || has("setup.py")) {
    signals.add("python")
    const py = await readText("pyproject.toml")
    if (py && /django|flask|fastapi|starlette/.test(py)) signals.add("api")
  }
  if (has("Cargo.toml")) signals.add("rust")
  if (has("go.mod")) signals.add("go")
  if (entries.some((entry) => /\.(csproj|sln)$/.test(entry.name))) signals.add("dotnet")
  if (has("Dockerfile") || has("docker-compose.yml") || has("docker-compose.yaml")) signals.add("docker")
  if (hasDir(".github")) {
    try {
      const workflows = await readdir(join(worktree, ".github", "workflows"))
      if (workflows.length > 0) signals.add("ci")
    } catch {
      // .github existe pero sin workflows; no es señal de CI.
    }
  }
  if (entries.some((entry) => /\.(tf|tfvars)$/.test(entry.name))) signals.add("infra")
  if (hasDir("terraform") || hasDir("k8s") || hasDir("kubernetes")) signals.add("infra")
  if (has("prisma") || entries.some((entry) => /\.sql$/.test(entry.name))) signals.add("sql")
  if (hasDir("docs") || hasDir("documentation")) signals.add("docs")
  if (entries.some((entry) => /\.(mdx|md)$/.test(entry.name))) signals.add("docs")
  return signals
}

// Devuelve las skills del catálogo que aplican al workspace (respetando el
// límite de contexto). El flag de activación lo decide el servicio Skill.
export async function autoSelectFor(worktree: string, catalog: SkillInfo[]): Promise<SkillInfo[]> {
  const signals = await detectSignals(worktree)
  const byName = new Map(catalog.map((skill) => [skill.name, skill]))
  const selected = new Set<string>()
  const add = (name: string) => {
    if (selected.size >= MAX_AUTO_SKILLS) return
    if (selected.has(name) || !byName.has(name)) return
    selected.add(name)
  }
  for (const base of BASE_SKILLS) add(base)
  for (const rule of RULES) {
    if (!rule.signals.some((signal) => signals.has(signal))) continue
    for (const name of rule.skills) add(name)
  }
  return Array.from(selected).map((name) => byName.get(name)!).filter((skill) => skill !== undefined)
}

// Formatea las skills seleccionadas como un bloque de system prompt con el
// contenido completo, para que el modelo las siga sin invocar la herramienta.
export function fmtAuto(list: SkillInfo[]): string {
  const blocks = list.map(
    (skill) => `## Skill: ${skill.name}${skill.description ? `\n${skill.description}` : ""}\n${skill.content}`,
  )
  return (
    "The following skills match this project's type and are ALREADY loaded. Follow them where relevant:\n\n" +
    blocks.join("\n\n")
  )
}
