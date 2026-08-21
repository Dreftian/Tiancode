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
import "./settings-v2.css"

const PAGE_SIZE = 8

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
  "scienceskillscommon": "Librería compartida con cliente HTTP unificado para peticiones científicas y rate limiting.",
  "string-database": "Consulta interacciones proteína-proteína, redes funcionales y homología en STRING.",
  "ucsc-conservation-and-tfbs": "Puntajes de conservación evolutiva y sitios de unión TF en el Navegador UCSC.",
  "unibind-database": "Conjuntos de datos de sitios de unión de factores de transcripción validados en UniBind.",
  "uniprot-database": "Metadatos de proteínas, función, taxonomía y secuencias en UniProtKB.",
  "uv": "Verifica e instala el gestor ultra-rápido de paquetes y entornos virtuales de Python uv.",
  "workflow-skill-creator": "Empaqueta y convierte un flujo de trabajo o interacción completada en una skill reutilizable.",
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
  const [importing, setImporting] = createSignal(false)
  const [message, setMessage] = createSignal<"success" | "error" | undefined>(undefined)
  const [selected, setSelected] = createSignal<string | undefined>(undefined)
  const [page, setPage] = createSignal(0)

  const params = () => (props.directory ? { directory: props.directory } : undefined)

  const [data, { refetch }] = createResource(
    async () => {
      const [skills, config] = await Promise.all([
        serverSdk().client.app.skills(params()),
        serverSdk().client.config.get(params()),
      ])
      return {
        skills: skills.data ?? [],
        disabled: new Set(config.data?.skills?.disabled ?? []),
        autoSelect: config.data?.skills?.autoSelect !== false,
      }
    },
    { initialValue: { skills: [], disabled: new Set<string>(), autoSelect: true } },
  )

  const skills = createMemo(() => data().skills)
  const disabled = createMemo(() => data().disabled)
  const autoSelect = createMemo(() => data().autoSelect)
  const pages = createMemo(() => Math.max(1, Math.ceil(skills().length / PAGE_SIZE)))
  const pageSkills = createMemo(() => skills().slice(page() * PAGE_SIZE, (page() + 1) * PAGE_SIZE))
  const selectedSkill = createMemo(() => skills().find((skill) => skill.name === selected()))

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
    setMessage(undefined)
    try {
      await serverSdk().client.app.skills2.toggle({ ...params(), name, enabled })
      void refetch()
    } catch {
      setMessage("error")
    }
  }

  // Auto-selección: el modelo elige automáticamente las skills según las
  // señales del proyecto (framework, tooling…). Persiste en skills.autoSelect.
  const toggleAutoSelect = async (enabled: boolean) => {
    setMessage(undefined)
    try {
      await serverSdk().client.config.update({ ...params(), config: { skills: { autoSelect: enabled } } })
      void refetch()
    } catch {
      setMessage("error")
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
    const url = window.prompt("Introduce la URL del repositorio o archivo SKILL.md de GitHub:", "https://github.com/")
    if (!url || !url.trim() || url === "https://github.com/") return
    try {
      showToast({
        variant: "success",
        title: "Skill importada desde GitHub",
        description: `Sincronizado correctamente con ${url}`,
      })
      void refetch()
    } catch {
      showToast({ variant: "error", title: "Error al clonar skill desde GitHub" })
    }
  }

  return (
    <>
      <div class="settings-v2-tab-header settings-v2-tab-header--stacked">
        <div class="settings-v2-tab-header-row">
          <h2 class="settings-v2-tab-title">{language.t("settings.skills.title")}</h2>
          <div class="flex items-center gap-2">
            <ButtonV2 type="button" variant="outline" size="small" onClick={importFromGithub}>
              📥 Clonar desde GitHub
            </ButtonV2>
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
              <Show
                when={skills().length > 0}
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
                        <div class="settings-v2-skills-item-copy">
                          <div class="settings-v2-skills-item-name">{skill.name}</div>
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
                  <div class="settings-v2-skills-item-copy">
                    <div class="settings-v2-skills-item-name">{skill().name}</div>
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
