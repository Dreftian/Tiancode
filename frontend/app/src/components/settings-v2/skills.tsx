import { ButtonV2 } from "@tiancode-ai/ui/v2/button-v2"
import { Switch } from "@tiancode-ai/ui/v2/switch-v2"
import { TextInputV2 } from "@tiancode-ai/ui/v2/text-input-v2"
import { Markdown } from "@tiancode-ai/session-ui/markdown"
import { type Component, createResource, For, Show, createSignal, createMemo } from "solid-js"
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
  "customize-tiancode": "Personaliza Tiancode con instrucciones a medida, reglas de proyecto y flujos de trabajo.",
  "database-design-and-migration": "Diseño de esquemas de bases de datos relacionales/NoSQL y migraciones seguras.",
  "database-drizzle-sqlite-pg": "Modelado y consultas de base de datos con Drizzle ORM, SQLite y PostgreSQL.",
  "debugging-and-error-recovery": "Metodología sistemática para depuración de causa raíz y resolución de errores.",
  "deploy-checklist": "Lista de verificación previa al despliegue en producción y planes de reversión (rollback).",
  "deprecation-and-migration": "Gestión de obsolescencia, migración de sistemas heredados y retirada segura de APIs.",
  "dispatching-parallel-agents": "Coordinación y ejecución de tareas independientes en agentes paralelos sin bloqueo.",
  "doc-coauthoring": "Flujo estructurado para redacción colaborativa de documentación técnica y especificaciones.",
  "docker-deploy-pipeline": "Contenedorización con Docker, compose y automatización de pipelines de despliegue.",
  "documentation-and-adrs": "Registro de decisiones arquitectónicas (ADRs), contratos y documentación viva del código.",
  "documentation-and-guides": "Generación y mantenimiento de documentación técnica, guías y READMEs completos.",
  "domain-modeling": "Modelado de dominio y definición de lenguaje ubicuo para sistemas empresariales.",
  "doubt-driven-development": "Revisión adversaria rigurosa antes de confirmar decisiones críticas en producción.",
  "finishing-a-development-branch": "Directrices para integrar ramas de desarrollo, verificación final y merge seguro.",
  "frontend-design": "Diseño visual distintivo e intencional, tipografía cuidada y dirección estética moderna.",
  "frontend-ui-engineering": "Desarrollo de interfaces de usuario modernas, accesibles y responsivas de alto nivel.",
  "frontend-ui-ux": "Desarrollo de interfaces fluidas, diseño UX/UI de alta calidad y diseño responsivo.",
  "fullstack-nextjs-tailwind": "Desarrollo fullstack moderno con Next.js App Router, React Server Components y Tailwind.",
  "git-workflow-and-releases": "Gestión de ramas Git, resolución de conflictos, versionado y creación de releases.",
  "git-workflow-and-versioning": "Buenas prácticas de versionado semántico, ramas limpias y commits estructurados.",
  "grill-me": "Entrevista intensiva para refinar planes, detectar vacíos y pulir decisiones de diseño.",
  "grill-with-docs": "Entrevista interactiva para afinar planes generando simultáneamente ADRs y glosario.",
  "handoff": "Generación de resumen y contexto de transferencia estructurado para otro agente o sesión.",
  "idea-refine": "Refinamiento de ideas iniciales en conceptos ejecutables mediante pensamiento estructurado.",
  "improve-codebase-architecture": "Escaneo de arquitectura del código, reporte visual y propuestas de profundización modular.",
  "incident-response": "Protocolo de respuesta ante incidentes: triaje, comunicación y postmortem sin culpas.",
  "incremental-implementation": "Implementación incremental de cambios complejos dividida en pasos verificables.",
  "interview-me": "Extracción de requerimientos reales del usuario mediante preguntas dirigidas paso a paso.",
  "observability-and-instrumentation": "Instrumentación de código: logs estructurados, métricas, trazas y alertas.",
  "performance-and-profiling": "Optimización del rendimiento, perfiles de memoria y velocidad de ejecución.",
  "performance-optimization": "Optimización integral de rendimiento en frontend, backend, consultas SQL y carga.",
  "planning-and-task-breakdown": "Desglose de requerimientos en tareas ordenadas, estimaciones y dependencias.",
  "requesting-code-review": "Solicitud y preparación de revisiones de código exhaustivas antes de fusionar ramas.",
  "research": "Investigación técnica basada en fuentes primarias con reporte estructurado en Markdown.",
  "resolving-merge-conflicts": "Resolución sistemática de conflictos en operaciones de merge y rebase de Git.",
  "security-and-hardening": "Protección contra vulnerabilidades, sanitización de entradas y fortificación de código.",
  "security-and-vulnerability-audit": "Auditoría de seguridad, prevención de vulnerabilidades y buenas prácticas de seguridad.",
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
  "testing-and-coverage": "Creación de pruebas unitarias, de integración y análisis de cobertura de código.",
  "testing-strategy": "Estrategia integral de pruebas: pirámide de tests, pruebas unitarias, integración y E2E.",
  "tiancode-spec-kit": "Kit de especificaciones y directivas para proyectos desarrollados con Tiancode.",
  "to-spec": "Conversión de requerimientos informales en especificaciones técnicas formales y ejecutables.",
  "using-agent-skills": "Guía para descubrimiento y ejecución óptima de habilidades especializadas por agentes.",
  "using-git-worktrees": "Gestión de múltiples ramas simultáneas en paralelo usando Git worktrees.",
  "verification-before-completion": "Protocolo estricto de verificación previa antes de dar una tarea por completada.",
  "wait-what": "Detección temprana y aclaración de suposiciones dudosas antes de proceder.",
  "web-quality-audit": "Auditoría integral de calidad web: rendimiento, accesibilidad, SEO y buenas prácticas.",
  "writing-plans": "Estructuración de planes de implementación claros, ejecutables y fáciles de revisar.",
  "agy-customizations": "Guía completa y referencia para personalizar Antigravity / Tiancode (skills, reglas, plugins, hooks).",
  "android-cli": "Herramientas de línea de comandos para desarrollo, prueba y gestión de aplicaciones Android.",
  "alphafold-database-fetch-and-analyze": "Recupera y analiza estructuras de proteínas predichas por AlphaFold con métricas pLDDT.",
  "alphagenome-single-variant-analysis": "Analiza los efectos de variantes genéticas en la expresión génica y factores de transcripción.",
  "chembl-database": "Consulta la base de datos ChEMBL para moléculas bioactivas, dianas de fármacos y bioactividad.",
  "clinical-trials-database": "Consulta ensayos clínicos en ClinicalTrials.gov por condición médica, fármaco o ubicación.",
  "clinvar-database": "Consulta clasificaciones de patogenicidad y evidencia clínica para variantes genómicas humanas.",
  "credentials": "Instrucciones para gestionar de forma segura claves de API, tokens y credenciales de autenticación.",
  "dbsnp-database": "Búsqueda y mapeo de variantes genéticas cortas (SNPs, indeles) en la base de datos dbSNP.",
  "embl-ebi-ols": "Consulta términos de ontología biomédica, definiciones y jerarquías en el servicio EMBL-EBI OLS.",
  "encode-ccres-database": "Consulta elementos regulatorios cis (cCREs) y datos experimentales en ENCODE.",
  "ensembl-database": "Consulta genes, secuencias genómicas, estructuras de exones y predicciones de variantes en Ensembl.",
  "foldseek-structural-search": "Búsqueda estructural 3D de proteínas contra bases de datos PDB, AlphaFold y CATH.",
  "gnomad-database": "Consulta frecuencias alélicas y restricciones génicas en el genoma de referencia gnomAD.",
  "gtex-database": "Recupera datos de expresión cuantitativa de ARN e información de eQTL en tejidos de GTEx.",
  "human-protein-atlas-database": "Recupera expresión de proteínas y localización espacial del Human Protein Atlas (HPA).",
  "interpro-database": "Identifica dominios, familias y sitios funcionales en proteínas con la base de datos InterPro.",
  "jaspar-database": "Consulta perfiles de unión de factores de transcripción (PFMs/PWMs) en JASPAR.",
  "literature-search-arxiv": "Búsqueda de artículos científicos, preprints y publicaciones académicas en arXiv.",
  "literature-search-biorxiv": "Búsqueda y descarga de preprints en ciencias de la vida y medicina en bioRxiv y medRxiv.",
  "literature-search-europepmc": "Búsqueda de literatura científica, artículos completos y citas en Europe PMC.",
  "literature-search-openalex": "Consulta la base de datos académica global OpenAlex para artículos, autores y fuentes.",
  "ncbi-sequence-fetch": "Recupera secuencias biológicas de proteínas y nucleótidos de las bases de datos NCBI.",
  "openfda-database": "Consulta datos de seguridad, efectos adversos, retiros y aprobaciones de medicamentos en OpenFDA.",
  "opentargets-database": "Consulta asociaciones diana-enfermedad y descubrimiento de fármacos en Open Targets.",
  "pdb-database": "Búsqueda y descarga de estructuras 3D de biomoléculas determinadas experimentalmente en el PDB.",
  "predictingthepast": "Restauración, atribución, datación y contextualización de textos e inscripciones antiguas.",
  "protein-sequence-msa": "Alineamiento múltiple de secuencias de proteínas utilizando EBI Clustal Omega.",
  "protein-sequence-similarity-search": "Búsqueda de secuencias de proteínas homólogas con MMseqs2 o BLAST.",
  "pubchem-database": "Búsqueda de sustancias químicas, fórmulas, propiedades y bioactividad en PubChem.",
  "pubmed-database": "Búsqueda en PubMed de artículos científicos y literatura médica biomédica.",
  "pymol": "Visualización, análisis y renderizado tridimensional de estructuras moleculares con PyMOL.",
  "quickgo-database": "Mapeo de genes a procesos biológicos, funciones moleculares y jerarquía Gene Ontology.",
  "reactome-database": "Análisis de rutas biológicas, reacciones y enriquecimiento de vías en Reactome.",
  "science-skills-common": "Librería compartida con cliente HTTP unificado para peticiones científicas y rate limiting.",
  "string-database": "Consulta interacciones proteína-proteína, redes funcionales y homología en STRING.",
  "ucsc-conservation-and-tfbs": "Puntajes de conservación evolutiva y sitios de unión TF en el Navegador UCSC.",
  "unibind-database": "Conjuntos de datos de sitios de unión de factores de transcripción validados en UniBind.",
  "uniprot-database": "Metadatos de proteínas, función, taxonomía y secuencias en UniProtKB.",
  "uv": "Verifica e instala el gestor ultra-rápido de paquetes y entornos virtuales de Python uv.",
  "workflow-skill-creator": "Empaqueta y convierte un flujo de trabajo o interacción completada en una skill reutilizable.",
  "nextjs-app-router-expert": "Especialista en Next.js 15, App Router, React Server Components (RSC), Server Actions y caché.",
  "typescript-strict-patterns": "Patrones avanzados de tipado estricto en TypeScript 5+: branded types, discriminated unions y cero any.",
  "tailwind-v4-styling": "Estilizado moderno con Tailwind CSS v4: variables de tema CSS (@theme), utilidades nativas y diseño Apple.",
  "docker-containerization-expert": "Contenedorización avanzada con Docker: builds multi-stage, compose, seguridad non-root y healthchecks.",
  "playwright-e2e-testing": "Automatización y pruebas End-to-End con Playwright: Page Object Model (POM), fixtures y visual regression.",
}

export const SAFE_SKILLS = new Set([
  "accessibility",
  "api-and-interface-design",
  "api-rest-graphql-openapi",
  "ci-cd-and-automation",
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
  "git-workflow-and-releases",
  "git-workflow-and-versioning",
  "observability-and-instrumentation",
  "performance-and-profiling",
  "performance-optimization",
  "security-and-hardening",
  "security-and-vulnerability-audit",
  "security-sast-owasp",
  "testing-and-coverage",
  "testing-strategy",
  "verification-before-completion",
  "agy-customizations",
  "credentials",
  "typescript-strict-patterns",
])

export const CATEGORY_FRONTEND = new Set([
  "accessibility",
  "apple-hig",
  "browser-automation",
  "browser-testing-with-devtools",
  "claude-design-system-extractor",
  "claude-frontend-engineer",
  "claude-react-nextjs-expert",
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
])

export const SPECIALIZED_CONFLICT_TIPS: Record<string, string> = {
  "test-driven-development": "⚠️ Metodología TDD estricta: exige pruebas unitarias previas antes de cualquier código. Puede colisionar con 'spec-driven-development' o 'incremental-implementation' si se activan juntas en prototipos rápidos.",
  "spec-driven-development": "⚠️ Metodología Spec-First: redacta especificaciones completas antes de codificar. No combinar con TDD simultáneo para evitar parálisis de ejecución.",
  "source-driven-development": "⚠️ Desarrollo basado en fuentes estrictas: requiere documentación oficial explícita antes de cualquier cambio.",
  "doubt-driven-development": "⚠️ Revisión adversaria escéptica: somete cada decisión a cuestionamiento riguroso. Útil para cambios críticos, pero ralentiza prototipos ágiles.",
  "grill-me": "⚠️ Flujo interactivo de entrevista: detiene la generación de código para interrogar al usuario sobre decisiones de diseño.",
  "interview-me": "⚠️ Flujo interrogativo de requisitos: formula preguntas continuas antes de implementar.",
  "wait-what": "⚠️ Detención preventiva de supuestos: interrumpe el flujo si detecta ambigüedad en lugar de inferir valores por defecto.",
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

  "customize-tiancode": `# Personalización de Tiancode

## Descripción General
Aprende a configurar y adaptar Tiancode según tu flujo de trabajo: gestión de agentes, configuración de modelos, reglas de proyecto, atajos de teclado y extensiones MCP.

## Componentes Personalizables
- **Reglas del Proyecto**: Define directivas y convenciones en \`AGENTS.md\`.
- **Sub-agentes**: Crea agentes especializados con roles y permisos específicos.
- **Modelos y Proveedores**: Conecta modelos locales (Ollama, LM Studio) o en la nube.
- **Servidores MCP**: Amplía las capacidades con herramientas externas y APIs.`,

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

  "database-design-and-migration": `# Diseño de Bases de Datos y Migraciones

## Descripción General
Buenas prácticas para modelado de datos relacionales, consultas optimizadas y migraciones seguras con Drizzle, Prisma o SQL nativo.

## Buenas Prácticas
- Esquemas con nombres en snake_case y claves foráneas explícitas.
- Migraciones incrementales y no destructivas.
- Índices adecuados en columnas de búsqueda y filtrado frecuente.`,

  "documentation-and-guides": `# Documentación Técnica y Guías

## Descripción General
Creación de documentación clara, precisa y accesible para desarrolladores y usuarios finales.

## Estructura Recomendada
- Resúmenes concisos al inicio.
- Ejemplos prácticos y ejecutables de código.
- Secciones de solución de problemas y preguntas frecuentes.`,

  "frontend-ui-ux": `# Desarrollo Frontend, UI y UX

## Descripción General
Directrices para crear interfaces modernas, fluidas, accesibles y estéticamente refinadas.

## Principios Visuales
- **Jerarquía Visual**: Tipografía equilibrada, espaciado armónico y contraste accesible.
- **Micro-interacciones**: Estados de hover, animaciones sutiles y transiciones fluidas.
- **Diseño Responsivo**: Adaptabilidad completa a cualquier tamaño de pantalla.`,

  "git-workflow-and-releases": `# Flujo de Git, Ramas y Releases

## Descripción General
Convenciones para ramas cortas, commits semánticos y empaquetado seguro de versiones.

## Convenciones
- **Nombres de Ramas**: Máximo 3 palabras separadas por guiones (ej. \`session-recovery\`).
- **Mensajes de Commit**: Formato convencional \`tipo(alcance): descripción\` (\`feat\`, \`fix\`, \`chore\`, etc.).
- **Releases**: Incrementos de versión no destructivos preservando configuraciones y datos de usuario.`,

  "performance-and-profiling": `# Rendimiento y Optimización

## Descripción General
Diagnóstico de cuellos de botella, optimización de renderizado, consumo de CPU y memoria.

## Técnicas
- Reducción del tamaño de paquetes y eliminación de dependencias no utilizadas.
- Memorización selectiva y optimización de reactividad.
- Carga perezosa (lazy loading) de módulos pesados.`,

  "security-and-vulnerability-audit": `# Auditoría de Seguridad y Vulnerabilidades

## Descripción General
Evaluación de seguridad, prevención de inyecciones (OWASP Top 10) y manejo seguro de credenciales.

## Puntos Críticos
- Validación estricta de entradas de usuario y desinfección de HTML/scripts.
- Almacenamiento seguro de claves de API y tokens de autenticación.
- Políticas de permisos restrictivas por defecto.`,

  "testing-and-coverage": `# Pruebas Automatizadas y Cobertura

## Descripción General
Estrategias para pruebas unitarias, de integración y de extremo a extremo (E2E) con alta cobertura.

## Buenas Prácticas
- Probar el comportamiento real en lugar de detalles internos de implementación.
- Minimizar el uso de mocks complejos.
- Pruebas rápidas, deterministas y aisladas.`,
}

function localizeSkillDescription(name: string, defaultDesc: string | undefined, isSpanish: boolean): string {
  if (isSpanish && SKILL_ES_DESCRIPTIONS[name]) {
    return SKILL_ES_DESCRIPTIONS[name]
  }
  return defaultDesc ?? ""
}

function localizeSkillContent(name: string, content: string | undefined, isSpanish: boolean): string {
  if (!content) return ""
  if (!isSpanish) return content

  if (SKILL_ES_CONTENTS[name]) {
    return SKILL_ES_CONTENTS[name]
  }

  // Traducción automática enriquecida de títulos, subtítulos y términos comunes de Markdown
  return content
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

export const SettingsSkillsV2: Component<{
  directory?: string
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
  const [filterCategory, setFilterCategory] = createSignal<"all" | "safe" | "specialized" | "frontend" | "backend" | "testing">("all")

  const params = () => (props.directory ? { directory: props.directory } : undefined)

  const [data, { refetch }] = createResource(
    async () => {
      try {
        const [skills, config] = await Promise.all([
          serverSdk()
            .api.skill.list(params() ? { location: params()! } : undefined)
            .catch(() => ({ data: [] })),
          serverSdk()
            .client.config.get(params())
            .catch(() => ({ data: {} })),
        ])
        return {
          skills: (skills?.data ?? []) as any[],
          disabled: new Set(((config?.data as any)?.skills?.disabled ?? []) as string[]),
          autoSelect: (config?.data as any)?.skills?.autoSelect !== false,
        }
      } catch {
        return { skills: [], disabled: new Set<string>(), autoSelect: true }
      }
    },
    { initialValue: { skills: [], disabled: new Set<string>(), autoSelect: true } },
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
    if (serverSkills.length > 0) {
      const names = new Set(serverSkills.map((s) => s.name))
      const extra = builtInSkills().filter((s) => !names.has(s.name))
      return [...serverSkills, ...extra]
    }
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

  const disabled = createMemo(() => data().disabled)
  const autoSelect = createMemo(() => data().autoSelect)
  const pages = createMemo(() => Math.max(1, Math.ceil(filteredSkills().length / PAGE_SIZE)))
  const pageSkills = createMemo(() => filteredSkills().slice(page() * PAGE_SIZE, (page() + 1) * PAGE_SIZE))
  const selectedSkill = createMemo(() => skills().find((skill) => skill.name === selected()) ?? filteredSkills()[0] ?? skills()[0])

  const enabledCount = createMemo(() => skills().filter((s) => !disabled().has(s.name)).length)
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

  const toggleSkill = async (name: string, enabled: boolean) => {
    try {
      const nextDisabled = new Set(disabled())
      if (enabled) {
        nextDisabled.delete(name)
      } else {
        nextDisabled.add(name)
      }
      await updateDisabledSkills(Array.from(nextDisabled))
    } catch (e) {
      console.warn("Failed to toggle skill", e)
    }
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

              {/* Barra de Herramientas Compacta: Acciones Rápidas y Filtros en 1 sola sección reducida */}
              <div class="settings-v2-skills-toolbar-compact">
                <div class="settings-v2-skills-quick-row">
                  <div class="settings-v2-skills-quick-buttons">
                    <button
                      type="button"
                      class="settings-v2-skills-action-btn settings-v2-skills-action-btn--enable"
                      onClick={() => void enableAll()}
                      title={isSpanish() ? "Activar todas las skills del catálogo" : "Enable all skills in catalog"}
                    >
                      ⚡ {isSpanish() ? "Activar Todas" : "Enable All"}
                    </button>
                    <button
                      type="button"
                      class="settings-v2-skills-action-btn settings-v2-skills-action-btn--safe"
                      onClick={() => void enableSafeOnly()}
                      title={isSpanish() ? "Activar sólo las skills 100% seguras" : "Enable safe skills"}
                    >
                      🛡️ {isSpanish() ? "Sólo Seguras" : "Safe Only"} ({skills().filter((s) => SAFE_SKILLS.has(s.name)).length})
                    </button>
                    <button
                      type="button"
                      class="settings-v2-skills-action-btn settings-v2-skills-action-btn--specialized"
                      onClick={() => void toggleSpecialized()}
                      title={isSpanish() ? "Activar o desactivar especializadas" : "Toggle specialized"}
                    >
                      ⚠️ {specializedEnabledCount() > 0 ? (isSpanish() ? "Desactivar Esp." : "Disable Spec.") : (isSpanish() ? "Especializadas" : "Specialized")}
                    </button>
                    <button
                      type="button"
                      class="settings-v2-skills-action-btn settings-v2-skills-action-btn--disable"
                      onClick={() => void disableAll()}
                      title={isSpanish() ? "Desactivar todas las skills" : "Disable all skills"}
                    >
                      🛑 {isSpanish() ? "Desactivar Todas" : "Disable All"}
                    </button>
                  </div>
                  <span class="settings-v2-skills-stats-pill">
                    {enabledCount()}/{skills().length} {isSpanish() ? "activas" : "active"}
                  </span>
                </div>

                {/* Categorías de Filtro Compactas */}
                <div class="settings-v2-skills-filters-row">
                  <button
                    type="button"
                    class="settings-v2-skills-filter-btn"
                    data-active={filterCategory() === "all" ? "" : undefined}
                    onClick={() => { setFilterCategory("all"); setPage(0); }}
                  >
                    {isSpanish() ? "Todas" : "All"} ({skills().length})
                  </button>
                  <button
                    type="button"
                    class="settings-v2-skills-filter-btn"
                    data-active={filterCategory() === "safe" ? "" : undefined}
                    onClick={() => { setFilterCategory("safe"); setPage(0); }}
                  >
                    🛡️ {isSpanish() ? "Seguras" : "Safe"} ({skills().filter((s) => SAFE_SKILLS.has(s.name)).length})
                  </button>
                  <button
                    type="button"
                    class="settings-v2-skills-filter-btn"
                    data-active={filterCategory() === "specialized" ? "" : undefined}
                    onClick={() => { setFilterCategory("specialized"); setPage(0); }}
                  >
                    ⚠️ {isSpanish() ? "Especializadas" : "Specialized"} ({skills().filter((s) => !SAFE_SKILLS.has(s.name)).length})
                  </button>
                  <button
                    type="button"
                    class="settings-v2-skills-filter-btn"
                    data-active={filterCategory() === "frontend" ? "" : undefined}
                    onClick={() => { setFilterCategory("frontend"); setPage(0); }}
                  >
                    🎨 Frontend
                  </button>
                  <button
                    type="button"
                    class="settings-v2-skills-filter-btn"
                    data-active={filterCategory() === "backend" ? "" : undefined}
                    onClick={() => { setFilterCategory("backend"); setPage(0); }}
                  >
                    ⚙️ Backend
                  </button>
                  <button
                    type="button"
                    class="settings-v2-skills-filter-btn"
                    data-active={filterCategory() === "testing" ? "" : undefined}
                    onClick={() => { setFilterCategory("testing"); setPage(0); }}
                  >
                    🧪 Testing
                  </button>
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
                              {SAFE_SKILLS.has(skill.name)
                                ? (isSpanish() ? "🛡️ Seguro" : "🛡️ Safe")
                                : (isSpanish() ? "⚠️ Especializado" : "⚠️ Specialized")}
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
                        {SAFE_SKILLS.has(skill().name)
                          ? (isSpanish() ? "🛡️ Seguro" : "🛡️ Safe")
                          : (isSpanish() ? "⚠️ Especializado" : "⚠️ Specialized")}
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
                    ? (isSpanish()
                        ? "🛡️ Skill universal segura y compatible: puede estar activa junto a cualquier otra skill sin riesgo de interferencia ni bloqueos en el flujo de trabajo."
                        : "🛡️ Safe & universal skill: compatible to run alongside any other skill without workflow conflicts.")
                    : (SPECIALIZED_CONFLICT_TIPS[skill().name] ||
                        (isSpanish()
                          ? "⚠️ Skill especializada: diseñada para un propósito específico. Evita activarla junto a otras metodologías o estilos de diseño opuestos para mantener la fluidez y evitar respuestas contradictorias."
                          : "⚠️ Specialized skill: designed for a specific workflow. Avoid combining with opposing methodologies or styling guides."))}
                </div>

                <div class="settings-v2-skills-detail-body">
                  <Markdown text={localizeSkillContent(skill().name, skill().content, isSpanish())} class="text-12-regular" />
                </div>
              </div>
            )}
          </Show>
        </div>
      </div>
    </>
  )
}
