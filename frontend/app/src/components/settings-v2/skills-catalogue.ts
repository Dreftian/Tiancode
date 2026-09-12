// Clasificadores y utilidades del panel de Skills.
//
// El catálogo en sí lo sirve el servidor (backend/tiancode/src/skill/index.ts, que devuelve el
// SKILL.md completo de cada skill). Aquí sólo vive lo que clasifica y presenta esos nombres, y
// vive fuera de skills.tsx para poder probarlo sin montar el panel.

export const SAFE_SKILLS = new Set([
  "accessibility",
  "api-and-interface-design",
  "api-rest-graphql-openapi",
  "ci-cd-and-automation",
  "claude-design-system-extractor",
  "code-review-and-quality",
  "code-simplification",
  "codebase-design",
  "context-engineering",
  "core-web-vitals",
  "customize-tiancode",
  "database-design-and-migration",
  "database-drizzle-sqlite-pg",
  "debugging-and-error-recovery",
  "deploy-checklist",
  "documentation-and-adrs",
  "documentation-and-guides",
  "docx",
  "frontend-design",
  "git-workflow-and-releases",
  "git-workflow-and-versioning",
  "mcp-builder",
  "observability-and-instrumentation",
  "pdf",
  "performance-and-profiling",
  "performance-optimization",
  "pptx",
  "security-and-hardening",
  "security-and-vulnerability-audit",
  "security-sast-owasp",
  "testing-and-coverage",
  "testing-strategy",
  "verification-before-completion",
  "web-quality-audit",
  "xlsx",
  "agy-customizations",
  "credentials",
  "typescript-strict-patterns",
  "pen-design",
  "hermes-orchestrator",
  "hermes-research",
  "hermes-sqlite-search",
  "openclaw-resilience",
  "openclaw-gateway",
  "opendesign-ui",
  "generative_ui",
])

export const CATEGORY_FRONTEND = new Set([
  "accessibility",
  "apple-hig",
  "browser-automation",
  "browser-testing-with-devtools",
  "claude-design-system-extractor",
  "core-web-vitals",
  "frontend-design",
  "frontend-ui-engineering",
  "frontend-ui-ux",
  "fullstack-nextjs-tailwind",
  "nextjs-app-router-expert",
  "scandinavian-design",
  "tailwind-v4-styling",
  "web-quality-audit",
  "generative_ui",
  "pen-design",
  "opendesign-ui",
])

export const CATEGORY_BACKEND = new Set([
  "api-and-interface-design",
  "api-rest-graphql-openapi",
  "database-design-and-migration",
  "database-drizzle-sqlite-pg",
  "docker-containerization-expert",
  "docker-deploy-pipeline",
  "domain-modeling",
  "sql-queries",
  "system-design",
  "observability-and-instrumentation",
  "incident-response",
  "deploy-checklist",
  "hermes-orchestrator",
  "hermes-sqlite-search",
  "openclaw-resilience",
  "openclaw-gateway",
])

export const CATEGORY_TESTING = new Set([
  "code-review-and-quality",
  "code-simplification",
  "debugging-and-error-recovery",
  "test-driven-development",
  "testing-and-coverage",
  "testing-strategy",
  "verification-before-completion",
  "playwright-e2e-testing",
  "security-and-hardening",
  "security-sast-owasp",
  "security-and-vulnerability-audit",
  "pentest-redteam",
])


// El servidor devuelve el SKILL.md tal cual, en inglés. Traducir el cuerpo entero queda fuera de
// alcance, pero los encabezados estándar son un vocabulario cerrado: traducirlos le da al lector
// en español un índice navegable sin tocar el texto, el código ni las tablas.
const ES_HEADINGS: Record<string, string> = {
  overview: "Descripción general",
  "when to use": "Cuándo usar",
  "core principles": "Principios fundamentales",
  guidelines: "Directivas y reglas",
  "best practices": "Buenas prácticas",
  requirements: "Requisitos",
  examples: "Ejemplos prácticos",
  "how it works": "Cómo funciona",
  workflow: "Flujo de trabajo",
  summary: "Resumen",
  "quick reference": "Referencia rápida",
  checklist: "Lista de verificación",
  rules: "Reglas principales",
}

export function localizeSkillHeadings(content: string | undefined, isSpanish: boolean): string {
  const body = content?.trim() ?? ""
  if (!isSpanish || body.length === 0) return body
  return body.replace(/^(#{1,3})[ 	]+(.+?)[ 	]*$/gm, (line, hashes: string, title: string) => {
    const translated = ES_HEADINGS[title.toLowerCase()]
    return translated ? `${hashes} ${translated}` : line
  })
}

export type CatalogueState = "loading" | "empty" | "ready"

/**
 * An empty list is ambiguous: either the server is still starting, or there genuinely is nothing.
 * Only once the retries are spent has the panel earned the right to say "no skills" — showing that
 * during a slow boot is what made the old bundled stub catalogue look necessary.
 */
export function catalogueState(input: { count: number; settled: boolean }): CatalogueState {
  if (input.count > 0) return "ready"
  return input.settled ? "empty" : "loading"
}
