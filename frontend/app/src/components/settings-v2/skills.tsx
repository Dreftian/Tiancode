import { ButtonV2 } from "@tiancode-ai/ui/v2/button-v2"
import { Switch } from "@tiancode-ai/ui/v2/switch-v2"
import { TextInputV2 } from "@tiancode-ai/ui/v2/text-input-v2"
import { Markdown } from "@tiancode-ai/session-ui/markdown"
import {
  type Component,
  createEffect,
  createMemo,
  createResource,
  createSignal,
  For,
  on,
  onCleanup,
  Show,
} from "solid-js"
import { useLanguage } from "@/context/language"
import { usePlatform } from "@/context/platform"
import { useServerSDK } from "@/context/server-sdk"
import { showToast } from "@/utils/toast"
import { SettingsListV2 } from "./parts/list"
import { SettingsRowV2 } from "./parts/row"
import { fallbackGlyph, hashColor, SettingsItemIconV2 } from "./parts/item-icon"
import "./settings-v2.css"

const PAGE_SIZE = 8

const GITHUB_URL_RE =
  /^https?:\/\/github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?(?:\/(tree|blob)\/([^/\s#]+)((?:\/[^\s#]*)?))?(?:[?#].*)?$/i

const MAX_GITHUB_SKILLS = 20
const MAX_FILES_PER_SKILL = 30

type GitHubSource = {
  owner: string
  repo: string
  kind?: "tree" | "blob"
  ref: string
  subpath: string
}

function decodeGitHubUrl(value: string): GitHubSource | undefined {
  const match = GITHUB_URL_RE.exec(value.trim())
  if (!match) return undefined
  const kind = match[3] === "tree" || match[3] === "blob" ? match[3] : undefined
  const subpath = (match[5] ?? "").replace(/^\//, "").replace(/\/$/, "")
  return {
    owner: match[1],
    repo: match[2],
    kind,
    ref: match[4] ?? "HEAD",
    subpath,
  }
}

const githubApiJson = async (url: string) => {
  const response = await fetch(url, { headers: { Accept: "application/vnd.github+json" } })
  if (!response.ok) throw new Error(`GitHub request failed with ${response.status}`)
  return response.json()
}

const fetchGitHubFile = async (source: GitHubSource, path: string) => {
  const response = await fetch(`https://raw.githubusercontent.com/${source.owner}/${source.repo}/${source.ref}/${path}`)
  if (!response.ok) throw new Error(`Failed to download ${path} (${response.status})`)
  return response.text()
}

type GitHubSkillFiles = { name: string; files: { path: string; content: string }[] }

// Resolves a GitHub URL (repo root, tree folder, or a single SKILL.md blob)
// into one entry per discovered SKILL.md. Sibling files inside each skill's
// own directory ride along so references keep working.
type GitHubTreeEntry = { type: string; path: string }

// Validates the git-trees API response shape without type assertions.
function parseGitHubBlobPaths(value: unknown): string[] {
  if (!value || typeof value !== "object" || !("tree" in value) || !Array.isArray(value.tree)) return []
  const paths: string[] = []
  for (const entry of value.tree) {
    if (!entry || typeof entry !== "object") continue
    if (!("type" in entry) || !("path" in entry)) continue
    if (typeof entry.type === "string" && typeof entry.path === "string") {
      paths.push(entry.path)
    }
  }
  return paths
}

async function fetchGitHubSkills(source: GitHubSource): Promise<GitHubSkillFiles[]> {
  if (source.kind === "blob") {
    if (!source.subpath.endsWith("SKILL.md")) return []
    const content = await fetchGitHubFile(source, source.subpath)
    const segments = source.subpath.split("/")
    segments.pop()
    const name = segments.pop() ?? source.repo
    return [{ name, files: [{ path: "SKILL.md", content }] }]
  }

  const data = await githubApiJson(
    `https://api.github.com/repos/${source.owner}/${source.repo}/git/trees/${source.ref}?recursive=1`,
  )
  const blobPaths: GitHubTreeEntry["path"][] = parseGitHubBlobPaths(data)

  const prefix = source.kind === "tree" && source.subpath ? `${source.subpath}/` : ""
  const skillPaths = blobPaths
    .filter((filePath) => filePath === "SKILL.md" || filePath.endsWith("/SKILL.md"))
    .filter((filePath) => !prefix || filePath.startsWith(prefix))
    .sort()
    .slice(0, MAX_GITHUB_SKILLS)

  return Promise.all(
    skillPaths.map(async (skillPath) => {
      const dir = skillPath.includes("/") ? skillPath.slice(0, skillPath.lastIndexOf("/")) : ""
      const siblings = dir
        ? blobPaths.filter((filePath) => filePath.startsWith(`${dir}/`)).slice(0, MAX_FILES_PER_SKILL)
        : [skillPath]
      const files = await Promise.all(
        siblings.map(async (filePath) => ({
          path: dir ? filePath.slice(dir.length + 1) : filePath,
          content: await fetchGitHubFile(source, filePath),
        })),
      )
      return { name: dir || source.repo, files }
    }),
  )
}


const SKILL_ES_DESCRIPTIONS: Record<string, string> = {
  "accessibility": "Audita y mejora la accesibilidad web siguiendo las pautas WCAG 2.2 y navegación por teclado.",
  "api-and-interface-design": "Diseño y especificación de APIs REST, GraphQL y contratos de interfaz fuertemente tipados.",
  "api-rest-graphql-openapi": "Diseño de APIs RESTful, GraphQL y especificaciones OpenAPI estándar.",
  "browser-automation": "Automatización del navegador para pruebas funcionales, scraping y flujos interactivos.",
  "browser-testing-with-devtools": "Pruebas automatizadas de navegador e inspección con herramientas de desarrollo Chrome DevTools.",
  "ci-cd-and-automation": "Configuración de integración continua, despliegues automatizados y workflows de CI/CD.",
  "code-review-and-quality": "Revisión de código, estándares de calidad, refactorización y detección de bugs.",
  "code-simplification": "Simplificación y optimización de código, reduciendo complejidad y redundancia.",
  "codebase-design": "Vocabulario y diseño de módulos profundos, desacoplamiento y arquitectura escalable.",
  "context-engineering": "Optimización del contexto de agentes, reglas de proyecto y configuración de sesiones.",
  "core-web-vitals": "Optimización de Core Web Vitals (LCP, INP, CLS) para mejor experiencia y rendimiento.",
  "database-drizzle-sqlite-pg": "Modelado y consultas de base de datos con Drizzle ORM, SQLite y PostgreSQL.",
  "debugging-and-error-recovery": "Metodología sistemática para depuración de causa raíz y resolución de errores.",
  "deploy-checklist": "Lista de verificación previa al despliegue en producción y planes de reversión (rollback).",
  "deprecation-and-migration": "Gestión de obsolescencia, migración de sistemas heredados y retirada segura de APIs.",
  "dispatching-parallel-agents": "Coordinación y ejecución de tareas independientes en agentes paralelos sin bloqueo.",
  "doc-coauthoring": "Flujo estructurado para redacción colaborativa de documentación técnica y especificaciones.",
  "docker-deploy-pipeline": "Contenedorización con Docker, compose y automatización de pipelines de despliegue.",
  "documentation-and-adrs": "Registro de decisiones arquitectónicas (ADRs), contratos y documentación viva del código.",
  "domain-modeling": "Modelado de dominio y definición de lenguaje ubicuo para sistemas empresariales.",
  "doubt-driven-development": "Revisión adversaria rigurosa antes de confirmar decisiones críticas en producción.",
  "finishing-a-development-branch": "Directrices para integrar ramas de desarrollo, verificación final y merge seguro.",
  "frontend-design": "Diseño visual distintivo e intencional, tipografía cuidada y dirección estética moderna.",
  "frontend-ui-engineering": "Desarrollo de interfaces de usuario modernas, accesibles y responsivas de alto nivel.",
  "fullstack-nextjs-tailwind": "Desarrollo fullstack moderno con Next.js App Router, React Server Components y Tailwind.",
  "git-workflow-and-versioning": "Buenas prácticas de versionado semántico, ramas limpias y commits estructurados.",
  "handoff": "Generación de resumen y contexto de transferencia estructurado para otro agente o sesión.",
  "idea-refine": "Refinamiento de ideas iniciales en conceptos ejecutables mediante pensamiento estructurado.",
  "improve-codebase-architecture": "Escaneo de arquitectura del código, reporte visual y propuestas de profundización modular.",
  "incident-response": "Protocolo de respuesta ante incidentes: triaje, comunicación y postmortem sin culpas.",
  "incremental-implementation": "Implementación incremental de cambios complejos dividida en pasos verificables.",
  "interview-me": "Extracción de requerimientos reales del usuario mediante preguntas dirigidas paso a paso.",
  "observability-and-instrumentation": "Instrumentación de código: logs estructurados, métricas, trazas y alertas.",
  "performance-optimization": "Optimización integral de rendimiento en frontend, backend, consultas SQL y carga.",
  "planning-and-task-breakdown": "Desglose de requerimientos en tareas ordenadas, estimaciones y dependencias.",
  "requesting-code-review": "Solicitud y preparación de revisiones de código exhaustivas antes de fusionar ramas.",
  "research": "Investigación técnica basada en fuentes primarias con reporte estructurado en Markdown.",
  "resolving-merge-conflicts": "Resolución sistemática de conflictos en operaciones de merge y rebase de Git.",
  "security-and-hardening": "Protección contra vulnerabilidades, sanitización de entradas y fortificación de código.",
  "security-sast-owasp": "Análisis estático de seguridad (SAST) y prevención de vulnerabilidades OWASP Top 10.",
  "shipping-and-launch": "Preparación de lanzamientos a producción, despliegues escalonados y monitorización.",
  "skill-creator": "Creación, edición, optimización y benchmarking de nuevas habilidades para agentes.",
  "source-driven-development": "Desarrollo basado en documentación oficial y fuentes de alta confianza sin alucinaciones.",
  "spec-driven-development": "Creación de especificaciones técnicas claras antes de escribir código de producción.",
  "sql-queries": "Escritura de consultas SQL correctas y de alto rendimiento en PostgreSQL, SQLite y BigQuery.",
  "system-automation-windows": "Automatización de tareas del sistema operativo Windows con scripts PowerShell y batch.",
  "system-design": "Diseño de sistemas distribuidos, microservicios, APIs y límites de servicio escalables.",
  "tech-debt": "Identificación, priorización y reducción planificada de deuda técnica acumulada.",
  "test-driven-development": "Desarrollo guiado por pruebas (TDD): ciclo red-green-refactor y cobertura sólida.",
  "testing-strategy": "Estrategia integral de pruebas: pirámide de tests, pruebas unitarias, integración y E2E.",
  "tiancode-spec-kit": "Kit de especificaciones y directivas para proyectos desarrollados con Tiancode.",
  "to-spec": "Conversión de requerimientos informales en especificaciones técnicas formales y ejecutables.",
  "using-agent-skills": "Guía para descubrimiento y ejecución óptima de habilidades especializadas por agentes.",
  "using-git-worktrees": "Gestión de múltiples ramas simultáneas en paralelo usando Git worktrees.",
  "verification-before-completion": "Protocolo estricto de verificación previa antes de dar una tarea por completada.",
  "web-quality-audit": "Auditoría integral de calidad web: rendimiento, accesibilidad, SEO y buenas prácticas.",
  "writing-plans": "Estructuración de planes de implementación claros, ejecutables y fáciles de revisar.",
  "nextjs-app-router-expert": "Especialista en Next.js 15, App Router, React Server Components (RSC), Server Actions y caché.",
  "typescript-strict-patterns": "Patrones avanzados de tipado estricto en TypeScript 5+: branded types, discriminated unions y cero any.",
  "tailwind-v4-styling": "Estilizado moderno con Tailwind CSS v4: variables de tema CSS (@theme), utilidades nativas y diseño Apple.",
  "docker-containerization-expert": "Contenedorización avanzada con Docker: builds multi-stage, compose, seguridad non-root y healthchecks.",
  "playwright-e2e-testing": "Automatización y pruebas End-to-End con Playwright: Page Object Model (POM), fixtures y visual regression.",
  "mcp-builder": "Construcción, validación e integración rápida de servidores Model Context Protocol (MCP) en TypeScript y Python.",
}

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

export const SPECIALIZED_CONFLICT_TIPS: Record<string, string> = {
  "test-driven-development": "⚠️ Metodología TDD estricta: exige pruebas unitarias previas antes de cualquier código. Puede colisionar con 'spec-driven-development' o 'incremental-implementation' si se activan juntas en prototipos rápidos.",
  "spec-driven-development": "⚠️ Metodología Spec-First: redacta especificaciones completas antes de codificar. No combinar con TDD simultáneo para evitar parálisis de ejecución.",
  "source-driven-development": "⚠️ Desarrollo basado en fuentes estrictas: requiere documentación oficial explícita antes de cualquier cambio.",
  "doubt-driven-development": "⚠️ Revisión adversaria escéptica: somete cada decisión a cuestionamiento riguroso. Útil para cambios críticos, pero ralentiza prototipos ágiles.",
  "interview-me": "⚠️ Flujo interrogativo de requisitos: formula preguntas continuas antes de implementar.",
  "apple-hig": "⚠️ Guía de estilo Apple Human Interface: tipografía SF Pro y minimalismo estricto. Puede chocar con 'scandinavian-design' o 'frontend-design' si se combinan.",
  "scandinavian-design": "⚠️ Estética nórdica ultra-minimalista: paletas monocromáticas. Puede entrar en conflicto visual con 'frontend-design'.",
  "system-automation-windows": "⚠️ Automatización profunda de Windows: ejecuta scripts de PowerShell/CMD a nivel de sistema.",
  "browser-automation": "⚠️ Requiere navegador headless configurado para testing de UI.",
  "dispatching-parallel-agents": "⚠️ Lanza swarms de agentes en paralelo: alto consumo de recursos y tokens.",
}

const SKILL_ES_CONTENTS: Record<string, string> = {
  "accessibility": `# Accesibilidad Web (WCAG 2.2)

## Descripción General
Auditoría y optimización integral de accesibilidad web para asegurar que todas las personas puedan percibir, comprender, navegar e interactuar con la aplicación.

## Puntos Clave
- **Navegación por Teclado**: Foco visible, orden de tabulación coherente y trampas de foco evitadas.
- **Lectores de Pantalla**: Roles ARIA adecuados, etiquetas accesibles y anuncios dinámicos de estado.
- **Contraste y Legibilidad**: Relaciones de contraste mínimas de 4.5:1 para texto normal y 3:1 para texto grande.`,

  "core-web-vitals": `# Optimización de Core Web Vitals

## Descripción General
Mejora de métricas clave de experiencia del usuario: Largest Contentful Paint (LCP), Interaction to Next Paint (INP) y Cumulative Layout Shift (CLS).

## Estrategias Principales
- **LCP (< 2.5s)**: Optimización de imágenes críticas, precarga de fuentes y reducción de JavaScript bloqueante.
- **INP (< 200ms)**: Minimización de tareas largas en el hilo principal y uso de transiciones concurrentes.
- **CLS (< 0.1)**: Dimensiones explícitas en medios e imágenes y reserva de espacio para contenido dinámico.`,

  "debugging-and-error-recovery": `# Depuración Sistemática y Recuperación de Errores

## Descripción General
Metodología estructurada para identificar la causa raíz de problemas complejos en lugar de adivinar soluciones superficiales.

## Pasos del Flujo
1. **Reproducción Confiable**: Crear una prueba mínima que falle consistentemente.
2. **Aislamiento**: Rastrear datos de entrada y salida hasta el punto exacto de divergencia.
3. **Corrección de Causa Raíz**: Resolver el origen estructural del problema.
4. **Verificación y Prevención**: Asegurar que la prueba pase y no existan regresiones.`,

  "deploy-checklist": `# Lista de Verificación Previa al Despliegue

## Descripción General
Protocolo de verificación para garantizar lanzamientos a producción seguros, estables y sin sorpresas.

## Elementos Esenciales
- **Migraciones de Base de Datos**: Compatibilidad hacia atrás y ejecución previa al despliegue de código.
- **Variables de Entorno**: Verificación de presencia y formato de todas las claves requeridas.
- **Plan de Reversión (Rollback)**: Procedimiento documentado y probado para revertir en minutos.`,

  "security-and-hardening": `# Fortificación de Seguridad y Buenas Prácticas

## Descripción General
Protección exhaustiva de aplicaciones contra vulnerabilidades comunes (OWASP Top 10) y ataques maliciosos.

## Reglas Críticas
- **Validación Estricta**: Sanitización y validación de tipos en todas las entradas no confiables.
- **Autenticación y Autorización**: Verificación de permisos a nivel de recurso y tokens seguros.
- **Secretos**: Cero claves en el código fuente; uso exclusivo de variables de entorno y almacenes seguros.`,

  "ci-cd-and-automation": `# Integración Continua (CI/CD) y Automatización

## Descripción General
Automatiza las puertas de calidad para garantizar que ningún cambio llegue a producción sin pasar las pruebas, el análisis estático (linter), la verificación de tipos y la compilación. CI/CD asegura la calidad consistente en cada cambio.

- **Detección Temprana (Shift Left)**: Detecta errores lo antes posible. Un error detectado en el linter toma minutos en solucionarse; en producción toma horas.
- **Entregas Frecuentes y Seguras**: Entregas pequeñas y constantes reducen el riesgo y facilitan la depuración.

## Cuándo Usar
- Configurar el pipeline de CI/CD para nuevos proyectos.
- Añadir o modificar verificaciones automáticas de tests, tipos o linting.
- Configurar despliegues automáticos a entornos de staging y producción.
- Solucionar fallos en flujos de trabajo de GitHub Actions u otros ejecutores.

## Fases del Pipeline de Calidad
1. **Linting y Formateo**: Verificación rápida de estilo y patrones erróneos.
2. **Verificación de Tipos (Typecheck)**: Comprobación estricta de tipos estáticos.
3. **Pruebas Automatizadas**: Pruebas unitarias y de integración.
4. **Compilación de Producción**: Generación y verificación de artefactos finales.`,

  "api-and-interface-design": `# Diseño de APIs e Interfaces

## Descripción General
Directivas y buenas prácticas para el diseño de APIs REST, OpenAPI, GraphQL y contratos TypeScript fuertemente tipados.

## Principios Clave
- **Consistencia**: Convenciones claras en nombres de rutas, verbos HTTP y códigos de estado.
- **Tipado Estricto**: Esquemas compartidos entre frontend y backend para evitar discrepancias.
- **Evolución No Destructiva**: Versionado semántico y retrocompatibilidad en cambios de API.`,

  "browser-testing-with-devtools": `# Pruebas de Navegador y Depuración con DevTools

## Descripción General
Automatización y pruebas en navegadores reales, inspección de elementos DOM, logs de consola y rendimiento de la red.

## Capacidades
- Inspección interactiva de UI y captura de pantallas en tiempo real.
- Detección y diagnóstico de errores en JavaScript y problemas de renderizado CSS.
- Validación de accesibilidad y diseño responsivo.`,

  "code-review-and-quality": `# Revisión de Código y Calidad

## Descripción General
Estrategias para revisiones de código exhaustivas, análisis estático y refactorización orientada a la mantenibilidad.

## Lista de Verificación
- **Claridad y Simplicidad**: Código legible sin abstracciones prematuras innecesarias.
- **Manejo de Errores**: Tratamiento explícito de casos borde y fallos.
- **Rendimiento**: Evitar bucles anidados costosos y fugas de memoria.`,

  "code-simplification": `# Simplificación y Limpieza de Código

## Descripción General
Identificación y eliminación de complejidad accidental, código muerto y sobreingeniería.

## Reglas Principales
- **Menos es Más**: Elimina funciones auxiliares de un solo uso cuando el código es más claro en el punto de llamada.
- **Flujo Lineal**: Prefiere retornos tempranos en lugar de estructuras if/else anidadas.`,

  "database-drizzle-sqlite-pg": `# Modelado de Bases de Datos con Drizzle ORM (SQLite, LibSQL y PostgreSQL)

## Descripción General
Directrices completas para diseñar bases de datos relacionales, crear esquemas tipados, ejecutar consultas de alto rendimiento y gestionar migraciones seguras sin tiempo de inactividad con Drizzle ORM.

## Cuándo Usar
- Creación, modificación o refactorización de tablas y entidades relacionales.
- Configuración de clientes Drizzle (\`drizzle-orm/better-sqlite3\`, \`drizzle-orm/libsql\`, \`@effect/sql-sqlite-bun\`).
- Definición de relaciones tipadas 1-a-1, 1-a-Muchos y Muchos-a-Muchos con Drizzle Relations.
- Generación y ejecución de migraciones automáticas mediante \`drizzle-kit\`.
- Validación de datos con esquemas Zod o Effect Schema en capas de entrada y salida.

## Directivas Principales
1. **Snake Case Estricto en SQL**: Define columnas como \`id\`, \`created_at\`, \`user_id\` de forma nativa para evitar discrepancias con el motor SQL.
2. **Cero Tipos \`any\`**: Utiliza \`typeof table.$inferSelect\` y \`typeof table.$inferInsert\` para inferencia de tipos estricta.
3. **Migraciones Seguras (Zero-Downtime)**: Toda nueva columna no nula (\`notNull()\`) debe incluir valor por defecto (\`default(...)\`).
4. **Relaciones Declarativas**: Define \`relations(table, ({ one, many }) => ...)\` para permitir consultas con \`db.query.*\` y carga ansiosa (*eager loading*).

## Comandos CLI Fundamentales
- \`bunx drizzle-kit generate\`: Genera los archivos de migración SQL analizando los cambios de esquema.
- \`bunx drizzle-kit push\`: Aplica cambios directamente al esquema de la base de datos para desarrollo ágil.
- \`bunx drizzle-kit studio\`: Inicia el explorador visual de base de datos en el navegador.`,

  "testing-strategy": `# Estrategias de Pruebas y Cobertura

## Descripción General
Estrategias para pruebas unitarias, de integración y de extremo a extremo (E2E) con alta cobertura.

## Buenas Prácticas
- Probar el comportamiento real en lugar de detalles internos de implementación.
- Minimizar el uso de mocks complejos.
- Pruebas rápidas, deterministas y aisladas.`,
}

function localizeSkillDescription(name: string, defaultDesc: string | undefined, isSpanish: boolean): string {
  // Always preserve the real, comprehensive description from the skill itself!
  if (defaultDesc && defaultDesc.trim().length > 0) {
    return defaultDesc
  }
  if (isSpanish && SKILL_ES_DESCRIPTIONS[name]) {
    return SKILL_ES_DESCRIPTIONS[name]
  }
  return defaultDesc ?? ""
}

function localizeSkillContent(name: string, content: string | undefined, isSpanish: boolean, description?: string): string {
  const baseContent = (content && content.trim().length > 0 && content.trim() !== `# ${name}`)
    ? content.trim()
    : SKILL_ES_CONTENTS[name]

  if (baseContent && baseContent.length > 0 && baseContent !== `# ${name}\n\n${description}`) {
    if (!isSpanish) return baseContent

    // Conserva el 100% de la documentación técnica completa, bloques de código, tablas y ejemplos,
    // adaptando dinámicamente los encabezados y secciones estándar a español.
    return baseContent
      .replace(/^#\s+Overview/gm, "# Descripción general")
      .replace(/^##\s+Overview/gm, "## Descripción general")
      .replace(/^###\s+Overview/gm, "### Descripción general")
      .replace(/^#\s+When to Use/gm, "# Cuándo usar")
      .replace(/^##\s+When to Use/gm, "## Cuándo usar")
      .replace(/^###\s+When to Use/gm, "### Cuándo usar")
      .replace(/^#\s+Core Principles/gm, "# Principios fundamentales")
      .replace(/^##\s+Core Principles/gm, "## Principios fundamentales")
      .replace(/^#\s+Guidelines/gm, "# Directivas y reglas")
      .replace(/^##\s+Guidelines/gm, "## Directivas y reglas")
      .replace(/^###\s+Guidelines/gm, "### Directivas y reglas")
      .replace(/^#\s+Best Practices/gm, "# Buenas prácticas")
      .replace(/^##\s+Best Practices/gm, "## Buenas prácticas")
      .replace(/^#\s+Requirements/gm, "# Requisitos")
      .replace(/^##\s+Requirements/gm, "## Requisitos")
      .replace(/^#\s+Examples/gm, "# Ejemplos prácticos")
      .replace(/^##\s+Examples/gm, "## Ejemplos prácticos")
      .replace(/^#\s+How It Works/gm, "# Cómo funciona")
      .replace(/^##\s+How It Works/gm, "## Cómo funciona")
      .replace(/^#\s+Workflow/gm, "# Flujo de trabajo")
      .replace(/^##\s+Workflow/gm, "## Flujo de trabajo")
      .replace(/^#\s+Summary/gm, "# Resumen")
      .replace(/^##\s+Summary/gm, "## Resumen")
      .replace(/^#\s+Quick Reference/gm, "# Referencia rápida")
      .replace(/^##\s+Quick Reference/gm, "## Referencia rápida")
      .replace(/^#\s+Checklist/gm, "# Lista de verificación")
      .replace(/^##\s+Checklist/gm, "## Lista de verificación")
      .replace(/^#\s+Rules/gm, "# Reglas principales")
      .replace(/^##\s+Rules/gm, "## Reglas principales")
  }

  const desc = description || SKILL_ES_DESCRIPTIONS[name] || ""
  if (isSpanish) {
    return `## Descripción General\n${desc}\n\n## 🎯 Cuándo Usar\n- Tareas específicas de desarrollo, arquitectura y refactorización relacionadas con **${name}**.\n- Activación automática por el agente inteligente al detectar contexto afín en la conversación.\n\n## 📋 Directivas Principales\n- Aplicación rigurosa de estándares de calidad, código limpio y mantenibilidad.\n- Tipado estricto sin abstracciones innecesarias y validación continua.`
  }
  return `## Overview\n${desc}\n\n## 🎯 When to Use\n- Specialized workflows and requirements matching **${name}**.\n- Autonomous activation when context indicates specific engineering needs.\n\n## 📋 Core Guidelines\n- Strict quality assurance, type safety, and clean execution.`
}

type SkillFilter = "all" | "safe" | "specialized" | "frontend" | "backend" | "testing"

export const SettingsSkillsV2: Component<{
  directory?: string
  active?: boolean
}> = (props) => {
  const language = useLanguage()
  const platform = usePlatform()
  const serverSdk = useServerSDK()
  const isSpanish = createMemo(() => language.intl().toLowerCase().startsWith("es"))
  const [url, setUrl] = createSignal("")
  const [githubUrl, setGithubUrl] = createSignal("")
  const [importing, setImporting] = createSignal(false)
  const [message, setMessage] = createSignal<"success" | "error" | undefined>(undefined)
  const [selected, setSelected] = createSignal<string | undefined>(undefined)
  const [page, setPage] = createSignal(0)
  const [filterCategory, setFilterCategory] = createSignal<SkillFilter>("all")

  const params = () => (props.directory ? { directory: props.directory } : undefined)

  const [data, { refetch }] = createResource(
    async () => {
      try {
        const p = params()
        const loc = p ? { location: p } : undefined
        const [skillsRes, config] = await Promise.all([
          serverSdk()
            .client.v2.skill.list(p ? { location: p } : undefined, { throwOnError: false })
            .then((res) => ((res?.data as any)?.data ?? res?.data ?? []) as any[])
            .catch(async () => {
              const api = serverSdk().api as any
              const apiRes = await (api?.skills ?? api?.skill)?.list?.(loc).catch(() => undefined)
              return ((apiRes?.data as any)?.data ?? apiRes?.data ?? []) as any[]
            })
            .catch(() => [] as any[]),
          serverSdk()
            .client.config.get(p ?? undefined)
            .catch(() => ({ data: {} })),
        ])
        return {
          skills: (Array.isArray(skillsRes) ? skillsRes : []) as any[],
          disabled: new Set(((config?.data as any)?.skills?.disabled ?? []) as string[]),
          autoSelect: (config?.data as any)?.skills?.autoSelect !== false,
        }
      } catch {
        return { skills: [], disabled: new Set<string>(), autoSelect: true }
      }
    },
    { initialValue: { skills: [], disabled: new Set<string>(), autoSelect: true } },
  )

  // El servidor es la única fuente real del catálogo (incluye el SKILL.md completo de cada
  // skill). Si responde vacío porque todavía se estaba levantando — lo típico al abrir la app
  // recién actualizada — el panel se quedaba con el resumen incrustado y sin la ficha completa
  // hasta cerrar y volver a abrir. Se vuelve a preguntar unas pocas veces y al activar la
  // pestaña, en vez de dar el vacío por definitivo.
  const SKILL_RETRY_DELAYS_MS = [700, 2000, 5000]
  let skillRetries = 0
  let skillRetryTimer: ReturnType<typeof setTimeout> | undefined
  onCleanup(() => clearTimeout(skillRetryTimer))
  createEffect(() => {
    if (data.loading) return
    if (data().skills.length > 0) {
      skillRetries = SKILL_RETRY_DELAYS_MS.length
      return
    }
    const delay = SKILL_RETRY_DELAYS_MS[skillRetries]
    if (delay === undefined) return
    skillRetries += 1
    clearTimeout(skillRetryTimer)
    skillRetryTimer = setTimeout(() => void refetch(), delay)
  })

  // Volver a la pestaña es una petición implícita de "enséñame lo que hay ahora".
  createEffect(
    on(
      () => props.active,
      (active, previous) => {
        if (active && !previous) void refetch()
      },
      { defer: true },
    ),
  )

  const builtInSkills = createMemo(() => {
    return Object.entries(SKILL_ES_DESCRIPTIONS).map(([name, description]) => ({
      name,
      description,
      builtin: true,
      location: "Built-in Engineering Skill",
      content: SKILL_ES_CONTENTS[name] || `# ${name}\n\n${description}`,
    }))
  })

  const skills = createMemo(() => {
    const serverSkills = data().skills
    // The server list is authoritative. This used to append every hardcoded entry the server
    // had not returned, which surfaced ~60 skills that do not exist in skills/ — they could be
    // browsed and toggled but never loaded. The Spanish map is a translation layer
    // (localizeSkillDescription), not a second catalogue.
    if (serverSkills.length > 0) return serverSkills
    // Offline or server not reachable yet: fall back to the bundled list.
    return builtInSkills()
  })

  const filteredSkills = createMemo(() => {
    const list = skills()
    const cat = filterCategory()
    if (cat === "safe") return list.filter((s) => SAFE_SKILLS.has(s.name))
    if (cat === "specialized") return list.filter((s) => !SAFE_SKILLS.has(s.name))
    if (cat === "frontend") return list.filter((s) => CATEGORY_FRONTEND.has(s.name))
    if (cat === "backend") return list.filter((s) => CATEGORY_BACKEND.has(s.name))
    if (cat === "testing") return list.filter((s) => CATEGORY_TESTING.has(s.name))
    return list
  })

  const [skillOverrides, setSkillOverrides] = createSignal<Record<string, boolean>>({})

  const disabled = createMemo(() => {
    const base = new Set(data().disabled)
    const overrides = skillOverrides()
    for (const [name, enabled] of Object.entries(overrides)) {
      if (enabled) base.delete(name)
      else base.add(name)
    }
    return base
  })
  const autoSelect = createMemo(() => data().autoSelect)
  const pages = createMemo(() => Math.max(1, Math.ceil(filteredSkills().length / PAGE_SIZE)))
  const pageSkills = createMemo(() => filteredSkills().slice(page() * PAGE_SIZE, (page() + 1) * PAGE_SIZE))
  const selectedSkill = createMemo(() => skills().find((skill) => skill.name === selected()) ?? filteredSkills()[0] ?? skills()[0])

  const enabledCount = createMemo(() => skills().filter((s) => !disabled().has(s.name)).length)
  const filterOptions = createMemo<{ id: SkillFilter; label: string; count: number }[]>(() => {
    const list = skills()
    const count = (pred: (name: string) => boolean) => list.filter((s) => pred(s.name)).length
    return [
      { id: "all", label: language.t("settings.skills.filter.all"), count: list.length },
      { id: "safe", label: language.t("settings.skills.filter.safe"), count: count((n) => SAFE_SKILLS.has(n)) },
      { id: "specialized", label: language.t("settings.skills.filter.specialized"), count: count((n) => !SAFE_SKILLS.has(n)) },
      { id: "frontend", label: language.t("settings.skills.filter.frontend"), count: count((n) => CATEGORY_FRONTEND.has(n)) },
      { id: "backend", label: language.t("settings.skills.filter.backend"), count: count((n) => CATEGORY_BACKEND.has(n)) },
      { id: "testing", label: language.t("settings.skills.filter.testing"), count: count((n) => CATEGORY_TESTING.has(n)) },
    ]
  })
  const safeEnabledCount = createMemo(() => skills().filter((s) => SAFE_SKILLS.has(s.name) && !disabled().has(s.name)).length)
  const specializedEnabledCount = createMemo(() => skills().filter((s) => !SAFE_SKILLS.has(s.name) && !disabled().has(s.name)).length)

  const updateDisabledSkills = async (newDisabledList: string[]) => {
    try {
      const sorted = newDisabledList.toSorted()
      await serverSdk().client.config.update({
        ...params(),
        config: { skills: { disabled: sorted } },
      })
      void refetch()
    } catch (e) {
      console.warn("Failed to update disabled skills", e)
    }
  }

  const enableAll = async () => {
    await updateDisabledSkills([])
  }

  const disableAll = async () => {
    await updateDisabledSkills(skills().map((s) => s.name))
  }

  const enableSafeOnly = async () => {
    const specializedNames = skills().filter((s) => !SAFE_SKILLS.has(s.name)).map((s) => s.name)
    await updateDisabledSkills(specializedNames)
  }

  const toggleSpecialized = async () => {
    const specializedNames = skills().filter((s) => !SAFE_SKILLS.has(s.name)).map((s) => s.name)
    const allSpecializedDisabled = specializedNames.every((name) => disabled().has(name))
    if (allSpecializedDisabled) {
      const newDisabled = Array.from(disabled()).filter((name) => !specializedNames.includes(name))
      await updateDisabledSkills(newDisabled)
    } else {
      const newDisabled = Array.from(new Set([...disabled(), ...specializedNames]))
      await updateDisabledSkills(newDisabled)
    }
  }

  const pickFolder = () => {
    const input = document.createElement("input")
    input.type = "file"
    input.multiple = true
    input.setAttribute("webkitdirectory", "")
    input.onchange = async () => {
      const files = Array.from(input.files ?? [])
      if (files.length === 0) return
      const entries = []
      for (const file of files) {
        const path = (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name
        entries.push({ path, content: await file.text() })
      }
      const root = entries[0].path.split("/")[0] || "skill"
      await runImport({
        name: root,
        files: entries.map(({ path, content }) => ({
          path: path.startsWith(`${root}/`) ? path.slice(root.length + 1) : path,
          content,
        })),
      })
    }
    input.click()
  }

  const downloadFromUrl = () => {
    const value = url().trim()
    if (!value) return
    void runImport({ url: value })
  }

  const runImport = async (input: { name?: string; files?: { path: string; content: string }[]; url?: string }) => {
    setImporting(true)
    setMessage(undefined)
    try {
      await serverSdk().client.app.skills2.import({ ...params(), ...input })
      setMessage("success")
      void refetch()
    } catch {
      setMessage("error")
    } finally {
      setImporting(false)
    }
  }

  const toggleSkill = (name: string, enabled: boolean) => {
    // 1. Inmediato (0 ms) reactivo y toast
    setSkillOverrides((prev) => ({ ...prev, [name]: enabled }))
    showToast({
      variant: "success",
      title: language.t(enabled ? "settings.skills.toggle.enabled" : "settings.skills.toggle.disabled", { name }),
    })

    // 2. Persistencia en segundo plano sin congelar la animación del switch
    const nextDisabled = new Set(disabled())
    if (enabled) {
      nextDisabled.delete(name)
    } else {
      nextDisabled.add(name)
    }

    void updateDisabledSkills(Array.from(nextDisabled)).catch(() => {
      setSkillOverrides((prev) => {
        const next = { ...prev }
        delete next[name]
        return next
      })
      showToast({ variant: "error", title: language.t("settings.skills.toggle.failed") })
    })
  }

  // Auto-selección: el modelo elige automáticamente las skills según las
  // señales del proyecto (framework, tooling…). Persiste en skills.autoSelect.
  const toggleAutoSelect = async (enabled: boolean) => {
    try {
      await serverSdk().client.config.update({
        ...params(),
        config: { skills: { autoSelect: enabled } },
      })
      void refetch()
    } catch (e) {
      console.warn("Failed to toggle autoSelect", e)
    }
  }

  const searchGoogle = () => {
    platform.openExternal(
      `https://www.google.com/search?q=${encodeURIComponent("tiancode skills SKILL.md")}`,
    )
  }

  const prevPage = () => {
    setPage((page() + pages() - 1) % pages())
  }

  const nextPage = () => {
    setPage((page() + 1) % pages())
  }

  const importFromGithub = async () => {
    const value = githubUrl().trim()
    if (!value) return
    const source = decodeGitHubUrl(value)
    if (!source) {
      showToast({ variant: "error", title: language.t("settings.skills.github.failed") })
      return
    }
    setImporting(true)
    setMessage(undefined)
    try {
      const skills = await fetchGitHubSkills(source)
      if (skills.length === 0) {
        showToast({ variant: "error", title: language.t("settings.skills.github.none") })
        return
      }
      for (const skill of skills) {
        await serverSdk().client.app.skills2.import({ ...params(), name: skill.name, files: skill.files })
      }
      showToast({
        variant: "success",
        title:
          skills.length === 1
            ? language.t("settings.skills.github.success.one", { name: skills[0].name })
            : language.t("settings.skills.github.success.many", { count: skills.length }),
      })
      setGithubUrl("")
      void refetch()
    } catch {
      showToast({ variant: "error", title: language.t("settings.skills.github.failed") })
    } finally {
      setImporting(false)
    }
  }

  return (
    <>
      <div class="settings-v2-tab-header settings-v2-tab-header--stacked">
        <div class="settings-v2-tab-header-row">
          <h2 class="settings-v2-tab-title">{language.t("settings.skills.title")}</h2>
          <div class="flex items-center gap-2">
            <ButtonV2 type="button" variant="ghost" size="small" onClick={searchGoogle}>
              {language.t("settings.skills.search.google")}
            </ButtonV2>
          </div>
        </div>
        <p class="settings-v2-tab-description">{language.t("settings.skills.description")}</p>
      </div>

      <div class="settings-v2-tab-body settings-v2-skills">
        <Show when={message() === "success" || message() === "error"}>
          <div class="settings-v2-skills-message" data-variant={message()}>
            {message() === "success"
              ? language.t("settings.skills.import.success")
              : language.t("settings.skills.import.failed")}
          </div>
        </Show>

        <div class="settings-v2-skills-layout">
          <div class="settings-v2-skills-list">
            <div class="settings-v2-section">
              <h3 class="settings-v2-section-title">{language.t("settings.skills.section.installed")}</h3>
              <SettingsListV2>
                <SettingsRowV2
                  title={language.t("settings.skills.autoSelect.title")}
                  description={language.t("settings.skills.autoSelect.description")}
                >
                  <Switch checked={autoSelect()} onChange={(checked) => void toggleAutoSelect(checked)} hideLabel>
                    {language.t("settings.skills.autoSelect.title")}
                  </Switch>
                </SettingsRowV2>
              </SettingsListV2>

              <div class="settings-v2-skills-toolbar">
                <div class="settings-v2-skills-toolbar-row">
                  <span class="settings-v2-skills-stats-pill">
                    {language.t("settings.skills.stats.active", { enabled: enabledCount(), total: skills().length })}
                  </span>
                  <div class="settings-v2-skills-quick-buttons">
                    <ButtonV2 type="button" variant="outline" size="small" onClick={() => void enableAll()}>
                      {language.t("settings.skills.actions.enableAll")}
                    </ButtonV2>
                    <ButtonV2 type="button" variant="outline" size="small" onClick={() => void enableSafeOnly()}>
                      {language.t("settings.skills.actions.safeOnly")}
                    </ButtonV2>
                    <ButtonV2 type="button" variant="outline" size="small" onClick={() => void toggleSpecialized()}>
                      {language.t(
                        specializedEnabledCount() > 0
                          ? "settings.skills.actions.specialized.disable"
                          : "settings.skills.actions.specialized.enable",
                      )}
                    </ButtonV2>
                    <ButtonV2 type="button" variant="ghost" size="small" onClick={() => void disableAll()}>
                      {language.t("settings.skills.actions.disableAll")}
                    </ButtonV2>
                  </div>
                </div>

                <div class="settings-v2-skills-filters-row">
                  <For each={filterOptions()}>
                    {(option) => (
                      <button
                        type="button"
                        class="settings-v2-skills-filter-btn"
                        data-active={filterCategory() === option.id ? "" : undefined}
                        onClick={() => {
                          setFilterCategory(option.id)
                          setPage(0)
                        }}
                      >
                        {option.label}
                        <span class="settings-v2-skills-filter-count">{option.count}</span>
                      </button>
                    )}
                  </For>
                </div>
              </div>

              <Show
                when={filteredSkills().length > 0}
                fallback={<div class="settings-v2-skills-status">{language.t("settings.skills.empty")}</div>}
              >
                <SettingsListV2>
                  <For each={pageSkills()}>
                    {(skill) => (
                      <div
                        class="settings-v2-skills-item"
                        data-selected={selected() === skill.name ? "" : undefined}
                        data-disabled={disabled().has(skill.name) ? "" : undefined}
                        onClick={() => setSelected(skill.name)}
                      >
                        <SettingsItemIconV2
                          icon={skill.icon}
                          fallback={fallbackGlyph(skill.name)}
                          color={hashColor(skill.name)}
                        />
                        <div class="settings-v2-skills-item-copy">
                          <div class="settings-v2-skills-item-name flex items-center">
                            {skill.name}
                            <span
                              class={`settings-v2-skill-badge ${SAFE_SKILLS.has(skill.name) ? "settings-v2-skill-badge--safe" : "settings-v2-skill-badge--specialized"}`}
                            >
                              {language.t(
                                SAFE_SKILLS.has(skill.name) ? "settings.skills.badge.safe" : "settings.skills.badge.specialized",
                              )}
                            </span>
                          </div>
                          <div class="settings-v2-skills-item-description">
                            {localizeSkillDescription(skill.name, skill.description, isSpanish())}
                          </div>
                        </div>
                        <div
                          class="settings-v2-skills-item-toggle"
                          onClick={(event) => event.stopPropagation()}
                        >
                          <Switch
                            checked={!disabled().has(skill.name)}
                            onChange={(checked) => void toggleSkill(skill.name, checked)}
                            hideLabel
                          >
                            {skill.name}
                          </Switch>
                        </div>
                      </div>
                    )}
                  </For>
                </SettingsListV2>
                <Show when={pages() > 1}>
                  <div class="settings-v2-skills-pagination">
                    <ButtonV2 type="button" variant="ghost" size="small" onClick={prevPage}>
                      ←
                    </ButtonV2>
                    <span class="settings-v2-skills-pagination-label">
                      {page() + 1} / {pages()}
                    </span>
                    <ButtonV2 type="button" variant="ghost" size="small" onClick={nextPage}>
                      →
                    </ButtonV2>
                  </div>
                </Show>
              </Show>
            </div>

            <div class="settings-v2-section">
              <h3 class="settings-v2-section-title">{language.t("settings.skills.section.import")}</h3>
              <SettingsListV2>
                <div class="settings-v2-skills-import-row">
                  <div class="settings-v2-skills-import-copy">
                    <div class="settings-v2-skills-item-name">
                      {language.t("settings.skills.import.folder.title")}
                    </div>
                    <div class="settings-v2-skills-item-description">
                      {language.t("settings.skills.import.folder.description")}
                    </div>
                  </div>
                  <ButtonV2
                    type="button"
                    variant="outline"
                    size="small"
                    disabled={importing()}
                    onClick={pickFolder}
                  >
                    {importing()
                      ? language.t("settings.skills.importing")
                      : language.t("settings.skills.import.folder.button")}
                  </ButtonV2>
                </div>
                <div class="settings-v2-skills-import-row">
                  <div class="settings-v2-skills-import-copy">
                    <div class="settings-v2-skills-item-name">
                      {language.t("settings.skills.import.github.title")}
                    </div>
                    <div class="settings-v2-skills-item-description">
                      {language.t("settings.skills.import.github.description")}
                    </div>
                  </div>
                  <div class="settings-v2-skills-url">
                    <TextInputV2
                      type="url"
                      appearance="base"
                      value={githubUrl()}
                      onInput={(event) => setGithubUrl(event.currentTarget.value)}
                      placeholder={language.t("settings.skills.import.github.placeholder")}
                      spellcheck={false}
                      autocomplete="off"
                      aria-label={language.t("settings.skills.import.github.title")}
                    />
                    <ButtonV2
                      type="button"
                      variant="outline"
                      size="small"
                      disabled={importing() || !githubUrl()}
                      onClick={() => void importFromGithub()}
                    >
                      {importing()
                        ? language.t("settings.skills.importing")
                        : language.t("settings.skills.import.github.button")}
                    </ButtonV2>
                  </div>
                </div>
                <div class="settings-v2-skills-import-row">
                  <div class="settings-v2-skills-import-copy">
                    <div class="settings-v2-skills-item-name">
                      {language.t("settings.skills.import.url.title")}
                    </div>
                    <div class="settings-v2-skills-item-description">
                      {language.t("settings.skills.import.url.description")}
                    </div>
                  </div>
                  <div class="settings-v2-skills-url">
                    <TextInputV2
                      type="url"
                      appearance="base"
                      value={url()}
                      onInput={(event) => setUrl(event.currentTarget.value)}
                      placeholder={language.t("settings.skills.import.url.placeholder")}
                      spellcheck={false}
                      autocomplete="off"
                      aria-label={language.t("settings.skills.import.url.title")}
                    />
                    <ButtonV2
                      type="button"
                      variant="outline"
                      size="small"
                      disabled={importing() || !url()}
                      onClick={downloadFromUrl}
                    >
                      {importing()
                        ? language.t("settings.skills.importing")
                        : language.t("settings.skills.import.url.button")}
                    </ButtonV2>
                  </div>
                </div>
              </SettingsListV2>
            </div>
          </div>

          <Show when={selectedSkill()} fallback={<div class="settings-v2-skills-detail-empty" />}>
            {(skill) => (
              <div class="settings-v2-skills-detail">
                <div class="settings-v2-skills-detail-header">
                  <SettingsItemIconV2
                    icon={skill().icon}
                    fallback={fallbackGlyph(skill().name)}
                    color={hashColor(skill().name)}
                  />
                  <div class="settings-v2-skills-item-copy">
                    <div class="settings-v2-skills-item-name flex items-center">
                      {skill().name}
                      <span
                        class={`settings-v2-skill-badge ${SAFE_SKILLS.has(skill().name) ? "settings-v2-skill-badge--safe" : "settings-v2-skill-badge--specialized"}`}
                      >
                        {language.t(
                          SAFE_SKILLS.has(skill().name) ? "settings.skills.badge.safe" : "settings.skills.badge.specialized",
                        )}
                      </span>
                    </div>
                    <div class="settings-v2-skills-item-description">
                      {localizeSkillDescription(skill().name, skill().description, isSpanish())}
                    </div>
                  </div>
                  <div class="settings-v2-skills-item-toggle">
                    <Switch
                      checked={!disabled().has(skill().name)}
                      onChange={(checked) => void toggleSkill(skill().name, checked)}
                      hideLabel
                    >
                      {skill().name}
                    </Switch>
                  </div>
                </div>
                <div class="settings-v2-skills-detail-meta">{skill().location}</div>

                {/* Caja de aviso de compatibilidad y optimización */}
                <div
                  class={`settings-v2-skill-compatibility-callout ${SAFE_SKILLS.has(skill().name) ? "settings-v2-skill-compatibility-callout--safe" : "settings-v2-skill-compatibility-callout--specialized"}`}
                >
                  {SAFE_SKILLS.has(skill().name)
                    ? language.t("settings.skills.callout.safe")
                    : SPECIALIZED_CONFLICT_TIPS[skill().name] || language.t("settings.skills.callout.specialized")}
                </div>

                <div class="settings-v2-skills-detail-body">
                  <Markdown text={localizeSkillContent(skill().name, skill().content, isSpanish(), skill().description)} class="text-12-regular" />
                </div>
              </div>
            )}
          </Show>
        </div>
      </div>
    </>
  )
}
