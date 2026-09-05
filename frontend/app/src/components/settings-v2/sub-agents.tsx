import { Switch } from "@tiancode-ai/ui/v2/switch-v2"
import type { Agent, PermissionRule } from "@tiancode-ai/sdk/v2/client"
import { type Component, createEffect, createMemo, createResource, createSignal, For, Show } from "solid-js"
import { useLanguage } from "@/context/language"
import { useServerSDK } from "@/context/server-sdk"
import { showToast } from "@/utils/toast"
import { SettingsPagerV2 } from "./parts/pager"
import { RlmHierarchyTree } from "@/components/rlm-hierarchy-tree"
import { AgentSwarmGraph } from "@/components/agent-swarm-graph"
import "./sub-agents.css"

const SPECIALIZED_PRESETS = [
  {
    name: "software-architect",
    role: "Software & System Architect",
    description: "Diseño modular de sistemas, patrones de diseño limpios, domain-driven design y arquitectura desacoplada.",
    prompt: "Eres un arquitecto de software senior de élite. Diseñas sistemas limpios, modulares y altamente escalables. Evalúas trade-offs arquitectónicos, defines límites de módulos y garantizas que el código cumpla con los principios SOLID y clean architecture.",
    color: "#3B82F6",
    icon: "🏛️",
    tools: ["Read", "Grep", "Glob", "Write", "Edit"],
  },
  {
    name: "fullstack-coder",
    role: "Fullstack Senior Engineer",
    description: "Implementación ágil de features completas de frontend, backend, APIs y bases de datos.",
    prompt: "Eres un ingeniero fullstack senior. Implementas requerimientos de inicio a fin con código robusto, tipado estricto en TypeScript/Rust/Go/Python, integración fluida de APIs y componentes limpios.",
    color: "#8B5CF6",
    icon: "⚡",
    tools: ["Read", "Grep", "Glob", "Edit", "Write", "Bash"],
  },
  {
    name: "devsecops-auditor",
    role: "DevSecOps Auditor",
    description: "Auditoría estricta de dependencias, CVEs, fugas de secretos y seguridad estática de código.",
    prompt: "Eres un auditor DevSecOps de élite. Tu función es inspeccionar dependencias, detectar vulnerabilidades de seguridad, evitar fugas de credenciales y validar que los cambios cumplan con los estándares OWASP.",
    color: "#EF4444",
    icon: "🛡️",
    tools: ["Read", "Grep", "Glob", "Bash", "Edit"],
  },
  {
    name: "ui-ux-master",
    role: "UI/UX & CSS Master",
    description: "Diseño visual moderno, Tailwind CSS, micro-interacciones fluidas y componentes accesibles.",
    prompt: "Eres un diseñador y desarrollador frontend experto en UI/UX moderna. Diseñas interfaces atractivas, limpias, con excelente jerarquía visual, espaciados precisos, transiciones suaves y soporte completo para temas oscuro/claro.",
    color: "#EC4899",
    icon: "🎨",
    tools: ["Read", "Grep", "Glob", "Edit", "Write"],
  },
  {
    name: "performance-optimizer",
    role: "Performance & Bundle Optimizer",
    description: "Perfilado de rendimiento, reducción de latencia, optimización de bundles y tiempos de carga.",
    prompt: "Eres un especialista senior en rendimiento y optimización. Identificas cuellos de botella de CPU y memoria, optimizas bundles, eliminas re-renders innecesarios y aceleras tiempos de respuesta.",
    color: "#F97316",
    icon: "🚀",
    tools: ["Read", "Grep", "Glob", "Edit", "Bash"],
  },
  {
    name: "database-architect",
    role: "Database & SQL Architect",
    description: "Optimización de esquemas, índices, planes de ejecución y migraciones seguras.",
    prompt: "Eres un arquitecto de bases de datos senior. Analizas consultas SQL, índices, normalización, migraciones Drizzle/Prisma y concurrencia para garantizar máximo rendimiento sin cuellos de botella.",
    color: "#EAB308",
    icon: "🗄️",
    tools: ["Read", "Grep", "Glob", "Edit", "Write", "Bash"],
  },
  {
    name: "docs-generator",
    role: "Docs & API Spec Generator",
    description: "Generación de especificaciones OpenAPI, documentación técnica Markdown y guías.",
    prompt: "Eres un redactor técnico y arquitecto de APIs. Documentas cada endpoint, tipo de dato, arquitectura de módulos y guías de contribución con claridad profesional en formato Markdown.",
    color: "#06B6D4",
    icon: "📝",
    tools: ["Read", "Grep", "Glob", "Write"],
  },
  {
    name: "qa-e2e-tester",
    role: "QA & E2E Test Engineer",
    description: "Creación de suites de pruebas unitarias, de integración y end-to-end con Vitest y Playwright.",
    prompt: "Eres un ingeniero de QA y testing automatizado. Escribes suites de pruebas completas, validas casos borde y aseguras cobertura integral de código.",
    color: "#10B981",
    icon: "🧪",
    tools: ["Read", "Grep", "Glob", "Edit", "Write", "Bash"],
  },
  {
    name: "python-data-engineer",
    role: "Python, AI & Data Science Specialist",
    description: "Python 3.12+, FastAPI, PyTorch, Pandas, NumPy, Scikit-learn, LangChain, pipelines ETL y agentes AI.",
    prompt: "Eres un ingeniero especialista en Python, Inteligencia Artificial y Ciencia de Datos. Desarrollas aplicaciones robustas con Python 3.12+, FastAPI, PyTorch, Pandas, NumPy, Scikit-learn y LangChain. Creas pipelines de datos eficientes, modelos de machine learning, APIs asíncronas de alto rendimiento y scripts limpios optimizados con Poetry o uv.",
    color: "#3776AB",
    icon: "🐍",
    tools: ["Read", "Grep", "Glob", "Edit", "Write", "Bash"],
  },
  {
    name: "rust-systems-engineer",
    role: "Rust & High-Performance Systems",
    description: "Rust 2024, Tokio, Axum, software de sistemas, seguridad de memoria, concurrencia y WebAssembly.",
    prompt: "Eres un ingeniero de sistemas senior experto en Rust. Desarrollas aplicaciones de alto rendimiento, microservicios asíncronos con Tokio y Axum, herramientas CLI y módulos WebAssembly. Dominas la gestión de memoria sin garbage collector, lifetimes, concurrencia segura y zero-cost abstractions.",
    color: "#DEA584",
    icon: "🦀",
    tools: ["Read", "Grep", "Glob", "Edit", "Write", "Bash"],
  },
  {
    name: "go-backend-dev",
    role: "Go & Microservices Cloud Engineer",
    description: "Go 1.22+, Goroutines, Channels, gRPC, Gin/Fiber y microservicios distribuidos cloud-native.",
    prompt: "Eres un ingeniero de backend y microservicios experto en Go (Golang). Diseñas e implementas servicios distribuidos concurrentes, APIs RESTful con Gin/Fiber, contratos gRPC con Protocol Buffers y workers asíncronos utilizando goroutines y channels con consumo mínimo de recursos.",
    color: "#00ADD8",
    icon: "🐹",
    tools: ["Read", "Grep", "Glob", "Edit", "Write", "Bash"],
  },
  {
    name: "mobile-app-developer",
    role: "Mobile App Developer (iOS & Android)",
    description: "Flutter, React Native/Expo, Swift/SwiftUI y Kotlin/Compose con arquitectura offline-first.",
    prompt: "Eres un ingeniero especializado en desarrollo móvil profesional. Creas aplicaciones nativas y multiplataforma fluidas con Flutter, React Native/Expo, Swift/SwiftUI para iOS y Kotlin/Jetpack Compose para Android. Gestionas estado reactivo, arquitecturas offline-first, animaciones fluidas a 120fps y consumo eficiente de batería.",
    color: "#10B981",
    icon: "📱",
    tools: ["Read", "Grep", "Glob", "Edit", "Write", "Bash"],
  },
  {
    name: "cloud-devops-engineer",
    role: "Cloud Infrastructure & DevOps",
    description: "Docker multi-stage, Kubernetes, Helm, Terraform, CI/CD con GitHub Actions y nubes AWS/GCP/Azure.",
    prompt: "Eres un arquitecto Cloud y DevOps de élite. Diseñas infraestructura como código con Terraform, contenedores Docker multi-stage hiperoptimizados, manifiestos de Kubernetes/Helm y pipelines de integración y despliegue continuo (CI/CD) con GitHub Actions para despliegues confiables en AWS, GCP o Azure.",
    color: "#0284C7",
    icon: "☁️",
    tools: ["Read", "Grep", "Glob", "Edit", "Write", "Bash"],
  },
  {
    name: "cpp-systems-expert",
    role: "C/C++ & Native Systems Specialist",
    description: "C++20/C++23 moderno, CMake, software de bajo nivel, depuración nativa y optimización SIMD.",
    prompt: "Eres un especialista de élite en C y C++ moderno (C++20/C++23). Desarrollas sistemas nativos, motores de procesamiento de datos, bindings nativos con CMake y software de bajo nivel. Dominas punteros inteligentes, RAII, metaprogramación de templates, depuración avanzada con GDB/LLDB y optimizaciones SIMD.",
    color: "#659AD2",
    icon: "⚙️",
    tools: ["Read", "Grep", "Glob", "Edit", "Write", "Bash"],
  },
  {
    name: "java-enterprise-architect",
    role: "Java & Spring Enterprise Architect",
    description: "Java 21 LTS, Spring Boot 3, Hibernate/JPA, microservicios empresariales y Maven/Gradle.",
    prompt: "Eres un arquitecto de software empresarial senior experto en Java 21 LTS y Spring Boot 3. Construyes microservicios robustos, arquitecturas basadas en eventos (Kafka/RabbitMQ), persistencia avanzada con Hibernate/JPA, seguridad Spring Security y pipelines de compilación con Maven o Gradle.",
    color: "#F89820",
    icon: "☕",
    tools: ["Read", "Grep", "Glob", "Edit", "Write", "Bash"],
  },
  {
    name: "dotnet-core-expert",
    role: ".NET Core & C# Enterprise Engineer",
    description: "C# 12, .NET 8/9, ASP.NET Core Web APIs, Entity Framework Core y arquitecturas limpias CQRS.",
    prompt: "Eres un ingeniero especialista en C# 12 y el ecosistema .NET 8/9. Creas APIs web de alto rendimiento con ASP.NET Core, modelos de datos y migraciones con Entity Framework Core, arquitecturas limpias en capas (Clean Architecture / CQRS) y servicios multiplataforma preparados para la nube.",
    color: "#512BD4",
    icon: "🔷",
    tools: ["Read", "Grep", "Glob", "Edit", "Write", "Bash"],
  },
  {
    name: "php-laravel-expert",
    role: "PHP & Laravel Modern Specialist",
    description: "PHP 8.3+, Laravel 11, Eloquent ORM, Livewire, Inertia.js y arquitecturas web modernas.",
    prompt: "Eres un desarrollador senior experto en PHP 8.3+ y el framework Laravel 11. Creas aplicaciones web modernas con Eloquent ORM, colas y jobs asíncronos con Redis, integración con Livewire o Inertia.js/Vue/React, APIs RESTful seguras y arquitecturas modulares comprobadas.",
    color: "#777BB4",
    icon: "🐘",
    tools: ["Read", "Grep", "Glob", "Edit", "Write", "Bash"],
  },
]

const AgentColors: { id: string; value: string; label: string }[] = [
  { id: "yellow", value: "#EAB308", label: "settings.subAgents.form.color.yellow" },
  { id: "red", value: "#EF4444", label: "settings.subAgents.form.color.red" },
  { id: "orange", value: "#F97316", label: "settings.subAgents.form.color.orange" },
  { id: "green", value: "#10B981", label: "settings.subAgents.form.color.green" },
  { id: "cyan", value: "#06B6D4", label: "settings.subAgents.form.color.cyan" },
  { id: "blue", value: "#3B82F6", label: "settings.subAgents.form.color.blue" },
  { id: "purple", value: "#8B5CF6", label: "settings.subAgents.form.color.purple" },
  { id: "pink", value: "#EC4899", label: "settings.subAgents.form.color.pink" },
]

const AgentTools: { id: string; label: string; sensitive: boolean }[] = [
  { id: "Read", label: "settings.subAgents.form.tools.read", sensitive: false },
  { id: "Grep", label: "settings.subAgents.form.tools.grep", sensitive: false },
  { id: "Glob", label: "settings.subAgents.form.tools.glob", sensitive: false },
  { id: "Bash", label: "settings.subAgents.form.tools.bash", sensitive: true },
  { id: "Edit", label: "settings.subAgents.form.tools.edit", sensitive: true },
  { id: "Write", label: "settings.subAgents.form.tools.write", sensitive: true },
  { id: "WebFetch", label: "settings.subAgents.form.tools.webFetch", sensitive: false },
  { id: "WebSearch", label: "settings.subAgents.form.tools.webSearch", sensitive: false },
  { id: "TodoWrite", label: "settings.subAgents.form.tools.todoWrite", sensitive: false },
]

const ToolPermissionNames = AgentTools.map((tool) => tool.id.toLowerCase())

const ModelOptions: { id: "inherit" | "custom"; label: string }[] = [
  { id: "inherit", label: "settings.subAgents.form.model.inherit" },
  { id: "custom", label: "settings.subAgents.form.model.custom" },
]

const StatusOptions: { id: "all" | "enabled" | "disabled"; label: string }[] = [
  { id: "all", label: "settings.subAgents.list.filter.all" },
  { id: "enabled", label: "settings.subAgents.list.filter.enabled" },
  { id: "disabled", label: "settings.subAgents.list.filter.disabled" },
]

// Native agents ship with English descriptions from the server (frontmatter);
// translate the known built-in names so the list reads in the UI language.
const NativeAgentDescriptionKeys: Record<string, string> = {
  build: "settings.subAgents.native.build",
  plan: "settings.subAgents.native.plan",
  webapp: "settings.subAgents.native.webapp",
  general: "settings.subAgents.native.general",
  explore: "settings.subAgents.native.explore",
  "software-architect": "settings.subAgents.native.softwareArchitect",
  "fullstack-coder": "settings.subAgents.native.fullstackCoder",
  "devsecops-auditor": "settings.subAgents.native.devsecopsAuditor",
  "ui-ux-master": "settings.subAgents.native.uiUxMaster",
  "performance-optimizer": "settings.subAgents.native.performanceOptimizer",
  "database-architect": "settings.subAgents.native.databaseArchitect",
  "docs-generator": "settings.subAgents.native.docsGenerator",
  "qa-e2e-tester": "settings.subAgents.native.qaE2eTester",
  "python-data-engineer": "settings.subAgents.native.pythonDataEngineer",
  "rust-systems-engineer": "settings.subAgents.native.rustSystemsEngineer",
  "go-backend-dev": "settings.subAgents.native.goBackendDev",
  "mobile-app-developer": "settings.subAgents.native.mobileAppDeveloper",
  "cloud-devops-engineer": "settings.subAgents.native.cloudDevopsEngineer",
  "cpp-systems-expert": "settings.subAgents.native.cppSystemsExpert",
  "java-enterprise-architect": "settings.subAgents.native.javaEnterpriseArchitect",
  "dotnet-core-expert": "settings.subAgents.native.dotnetCoreExpert",
  "php-laravel-expert": "settings.subAgents.native.phpLaravelExpert",
  compaction: "settings.subAgents.native.compaction",
  title: "settings.subAgents.native.title",
  summary: "settings.subAgents.native.summary",
}

interface AgentDisplayMeta {
  title: string
  role: string
  icon: string
  color: string
  category: string
  description?: string
}

const AGENT_META: Record<string, AgentDisplayMeta> = {
  build: {
    title: "Constructor Principal",
    role: "Core Execution & Code Build",
    icon: "🔨",
    color: "#3B82F6",
    category: "🏗️ Core",
    description: "Modo predeterminado de construcción. Analiza, crea y modifica código con herramientas de sistema.",
  },
  plan: {
    title: "Planificador Estratégico",
    role: "Architecture & Research",
    icon: "📋",
    color: "#8B5CF6",
    category: "📐 Planificación",
    description: "Modo de investigación y diseño de arquitectura. No realiza modificaciones destructivas.",
  },
  webapp: {
    title: "Web App (Live Preview)",
    role: "Full-JSX Interactive Apps",
    icon: "🌐",
    color: "#06B6D4",
    category: "🌐 Frontend",
    description: "Desarrollo ágil de aplicaciones web con vista previa reactiva en tiempo real.",
  },
  general: {
    title: "Asistente Multitarea",
    role: "General Purpose Assistant",
    icon: "🔍",
    color: "#10B981",
    category: "🧠 Inteligencia",
    description: "Investigación profunda, resolución de consultas complejas y flujos de trabajo autónomos.",
  },
  explore: {
    title: "Explorador Rápido",
    role: "Fast Codebase Discovery",
    icon: "🧭",
    color: "#F59E0B",
    category: "🔍 Exploración",
    description: "Búsqueda semántica y mapeo estructural de repositorios a alta velocidad.",
  },
  "software-architect": {
    title: "Arquitecto de Software",
    role: "System Architecture & SOLID",
    icon: "🏛️",
    color: "#3B82F6",
    category: "🏛️ Arquitectura",
    description: "Diseño modular de sistemas, patrones limpios, domain-driven design y desacoplamiento.",
  },
  "fullstack-coder": {
    title: "Ingeniero Fullstack",
    role: "Fullstack Senior Implementation",
    icon: "⚡",
    color: "#8B5CF6",
    category: "⚡ Fullstack",
    description: "Implementación ágil de features completas de frontend, backend, APIs y bases de datos.",
  },
  "devsecops-auditor": {
    title: "Auditor DevSecOps",
    role: "Security, CVEs & Secret Audits",
    icon: "🛡️",
    color: "#EF4444",
    category: "🛡️ Seguridad",
    description: "Auditoría estricta de dependencias, detección de CVEs y prevención de fugas de credenciales.",
  },
  "ui-ux-master": {
    title: "Maestro UI/UX & CSS",
    role: "Design Systems & Tailwind",
    icon: "🎨",
    color: "#EC4899",
    category: "🎨 Diseño",
    description: "Diseño visual moderno, Tailwind CSS, micro-interacciones fluidas y componentes accesibles.",
  },
  "performance-optimizer": {
    title: "Optimizador Rendimiento",
    role: "Profiling, Latency & Bundles",
    icon: "🚀",
    color: "#F97316",
    category: "🚀 Rendimiento",
    description: "Perfilado de CPU y memoria, reducción de latencia, optimización de bundles y tiempos de carga.",
  },
  "database-architect": {
    title: "Arquitecto de Datos",
    role: "SQL, Drizzle & Query Tuning",
    icon: "🗄️",
    color: "#EAB308",
    category: "🗄️ Backend/DB",
    description: "Optimización de esquemas, índices, planes de ejecución y migraciones Drizzle/SQL seguras.",
  },
  "docs-generator": {
    title: "Generador de Docs",
    role: "OpenAPI & Markdown Specs",
    icon: "📝",
    color: "#06B6D4",
    category: "📝 Docs",
    description: "Generación de especificaciones OpenAPI, documentación técnica Markdown y guías.",
  },
  "qa-e2e-tester": {
    title: "Ingeniero QA / Testing",
    role: "Vitest & Playwright E2E",
    icon: "🧪",
    color: "#10B981",
    category: "🧪 Calidad",
    description: "Creación de suites de pruebas unitarias, de integración y end-to-end automatizadas.",
  },
  "python-data-engineer": {
    title: "Especialista Python & IA",
    role: "Python, AI & Data Science",
    icon: "🐍",
    color: "#3776AB",
    category: "🐍 Python / IA",
    description: "FastAPI, PyTorch, Pandas, NumPy, Scikit-learn, LangChain, scripts científicos y pipelines ETL.",
  },
  "rust-systems-engineer": {
    title: "Ingeniero Rust & Sistemas",
    role: "Rust, Tokio & Low-Level",
    icon: "🦀",
    color: "#DEA584",
    category: "🦀 Rust",
    description: "Sistemas de alto rendimiento, Tokio, Axum, seguridad de memoria sin GC y WebAssembly.",
  },
  "go-backend-dev": {
    title: "Desarrollador Go & Cloud",
    role: "Golang Microservices & gRPC",
    icon: "🐹",
    color: "#00ADD8",
    category: "🐹 Go",
    description: "Microservicios concurrentes de baja latencia, gRPC, Gin/Fiber y sistemas distribuidos.",
  },
  "mobile-app-developer": {
    title: "Desarrollador Móvil",
    role: "Flutter, React Native, Swift & Kotlin",
    icon: "📱",
    color: "#10B981",
    category: "📱 Móvil",
    description: "Apps nativas y multiplataforma con Flutter, Expo, Swift/SwiftUI y Kotlin/Compose.",
  },
  "cloud-devops-engineer": {
    title: "Ingeniero Cloud & DevOps",
    role: "Docker, K8s, Terraform & CI/CD",
    icon: "☁️",
    color: "#0284C7",
    category: "☁️ DevOps",
    description: "Infraestructura como código con Terraform, Docker multi-stage, Kubernetes y GitHub Actions.",
  },
  "cpp-systems-expert": {
    title: "Especialista C/C++ Nativo",
    role: "Modern C++23 & Embedded",
    icon: "⚙️",
    color: "#659AD2",
    category: "⚙️ C / C++",
    description: "C++20/23 moderno, CMake, software de bajo nivel, depuración nativa y optimización SIMD.",
  },
  "java-enterprise-architect": {
    title: "Arquitecto Java Enterprise",
    role: "Java 21 & Spring Boot 3",
    icon: "☕",
    color: "#F89820",
    category: "☕ Java",
    description: "Microservicios empresariales con Java 21 LTS, Spring Boot 3, Hibernate/JPA y Maven/Gradle.",
  },
  "dotnet-core-expert": {
    title: "Ingeniero .NET Core & C#",
    role: "C# 12 & .NET 8/9 Enterprise",
    icon: "🔷",
    color: "#512BD4",
    category: "🔷 .NET / C#",
    description: "APIs de alto rendimiento con ASP.NET Core, Entity Framework Core y Clean Architecture.",
  },
  "php-laravel-expert": {
    title: "Especialista PHP & Laravel",
    role: "PHP 8.3 & Laravel 11",
    icon: "🐘",
    color: "#777BB4",
    category: "🐘 PHP",
    description: "Aplicaciones web modernas con PHP 8.3+, Laravel 11, Eloquent ORM, Livewire y APIs RESTful.",
  },
}

type StatusId = "all" | "enabled" | "disabled"

// The backend rewrites tool lists into permission allow/deny rules and merges
// them on top of the default ruleset (`*: allow` plus read/external_directory
// defaults). The effective action for a tool is the last `*`-pattern rule
// matching its permission name, so the UI maps rules back to checkboxes by
const getAgentRules = (agent?: Agent | null): PermissionRule[] => {
  if (!agent) return []
  if (Array.isArray(agent.permission)) return agent.permission
  if (Array.isArray((agent as any).permissions)) return (agent as any).permissions
  return []
}

const effectiveToolRule = (agent: Agent, tool: string): PermissionRule | undefined => {
  const permission = tool.toLowerCase()
  return getAgentRules(agent).findLast(
    (rule) => rule && rule.pattern === "*" && (rule.permission === permission || rule.permission === "*"),
  )
}

// A restricted ruleset is one with a deny/ask rule (pattern `*`) for a tool
// permission or for `*` itself; unrestricted agents inherit everything.
const hasRestrictedTools = (agent: Agent): boolean =>
  getAgentRules(agent).some(
    (rule) =>
      rule &&
      rule.pattern === "*" &&
      (rule.permission === "*" || ToolPermissionNames.includes(rule.permission)) &&
      rule.action !== "allow",
  )

const allowedToolCount = (agent: Agent): number =>
  ToolPermissionNames.filter((permission) =>
    getAgentRules(agent).some((rule) => rule && rule.pattern === "*" && rule.permission === permission && rule.action === "allow"),
  ).length

export const SettingsSubAgentsV2: Component<{
  directory?: string
  active?: boolean
}> = (props) => {
  const language = useLanguage()
  const serverSdk = useServerSDK()

  const [scope, setScope] = createSignal<"project" | "global">(props.directory ? "project" : "global")

  const params = () => (props.directory ? { directory: props.directory } : undefined)
  const activeParams = () => (scope() === "project" && props.directory ? { directory: props.directory } : undefined)

  const [configData, { refetch: refetchConfig }] = createResource(
    async () => {
      try {
        const loc = activeParams()
        const res = await serverSdk().client.config.get(loc ?? undefined).catch(() => undefined)
        const raw = {
          ...((res?.data as any)?.agents ?? {}),
          ...((res?.data as any)?.agent ?? {}),
        }
        return raw as Record<string, { disable?: boolean; disabled?: boolean }>
      } catch {
        return {}
      }
    },
    { initialValue: {} },
  )

  const [agents, { refetch }] = createResource<Agent[]>(
    async () => {
      try {
        const p = params()
        const res = await serverSdk()
          .api.agent.list(p ? { location: p } : undefined)
          .catch(() => ({ data: [] as Agent[] }))
        return (res?.data ?? []) as Agent[]
      } catch {
        return []
      }
    },
    { initialValue: [] },
  )

  const [agentStatusOverrides, setAgentStatusOverrides] = createSignal<Record<string, boolean>>({})

  const isAgentActive = (agentName: string) => {
    const overrides = agentStatusOverrides()
    if (agentName in overrides) {
      return overrides[agentName]
    }
    const conf = configData()
    if (conf && (conf[agentName]?.disable === true || conf[agentName]?.disabled === true)) {
      return false
    }
    const serverList = agents() ?? []
    const match = serverList.find((a) => a?.name === agentName)
    if (match && ((match as any).disabled === true || (match as any).mode === "disabled")) {
      return false
    }
    return true
  }

  const toggleAgent = (agentName: string, enable: boolean) => {
    // 1. Reacción individual e inmediata (0 ms) en el switch y chip
    setAgentStatusOverrides((prev) => ({ ...prev, [agentName]: enable }))

    // 2. Feedback visual instantáneo
    showToast({
      variant: "success",
      title: enable ? "Sub-agente activado" : "Sub-agente desactivado",
      description: `@${agentName} ${enable ? "ahora está activo" : "ha sido desactivado"} para ${
        scope() === "project" ? "este proyecto" : "la configuración global"
      }.`,
    })

    // 3. Sincronización asíncrona en segundo plano sin congelar la animación
    const conf = { ...(configData() ?? {}) }
    conf[agentName] = {
      ...(conf[agentName] ?? {}),
      disable: !enable,
      disabled: !enable,
    }

    void serverSdk()
      .client.config.update({
        ...activeParams(),
        config: {
          agent: conf,
          agents: conf,
        } as any,
      })
      .then(() => {
        void refetchConfig()
        void refetch()
      })
      .catch(() => {
        // Rollback en caso de error
        setAgentStatusOverrides((prev) => {
          const next = { ...prev }
          delete next[agentName]
          return next
        })
        showToast({
          variant: "error",
          title: "Error al actualizar estado del sub-agente",
        })
      })
  }

  const isNative = (agent: Agent) => agent.native === true || agent.name in NativeAgentDescriptionKeys || agent.name in AGENT_META

  const builtinAgents = createMemo<Agent[]>(() => {
    const list: Agent[] = []
    const serverList = agents() ?? []

    for (const [key, meta] of Object.entries(AGENT_META)) {
      const serverMatch = serverList.find((a) => a?.name === key)
      const preset = SPECIALIZED_PRESETS.find((p) => p?.name === key)

      list.push({
        name: key,
        description: meta.description || serverMatch?.description || preset?.description || meta.role,
        prompt: serverMatch?.prompt || preset?.prompt || "",
        mode: ["build", "plan", "webapp"].includes(key) ? "primary" : "subagent",
        native: true,
        color: meta.color,
        icon: meta.icon,
        model: serverMatch?.model,
        permission: (serverMatch as any)?.permission || [],
      } as Agent)
    }

    return list
  })

  const agentList = createMemo(() => builtinAgents())

  const [query, setQuery] = createSignal("")
  const [status, setStatus] = createSignal<StatusId>("all")

  const matchesQuery = (agent: Agent) => {
    const needle = query().trim().toLowerCase()
    if (!needle) return true
    return (
      agent.name.toLowerCase().includes(needle) || (agent.description ?? "").toLowerCase().includes(needle)
    )
  }

  const visibleByStatus = (agents: Agent[]) => {
    const s = status()
    if (s === "enabled") return agents.filter((a) => (a as { disabled?: boolean }).disabled !== true && (a as { mode?: string }).mode !== "disabled")
    if (s === "disabled") return agents.filter((a) => (a as { disabled?: boolean }).disabled === true || (a as { mode?: string }).mode === "disabled")
    return agents
  }
  const visibleBuiltinAgents = createMemo(() => visibleByStatus(builtinAgents().filter(matchesQuery)))

  // Paginación 10x10 para Sub-Agentes sin scroll excesivo
  const BUILTIN_PAGE_SIZE = 10
  const [builtinPage, setBuiltinPage] = createSignal(1)
  const builtinTotal = () => Math.max(1, Math.ceil(visibleBuiltinAgents().length / BUILTIN_PAGE_SIZE))
  const pageBuiltinAgents = createMemo(() => {
    const page = Math.min(builtinPage(), builtinTotal())
    const start = (page - 1) * BUILTIN_PAGE_SIZE
    return { items: visibleBuiltinAgents().slice(start, start + BUILTIN_PAGE_SIZE), page, total: builtinTotal() }
  })

  createEffect(() => {
    if (builtinPage() > builtinTotal()) setBuiltinPage(builtinTotal())
  })

  createEffect(() => {
    query()
    status()
    setBuiltinPage(1)
  })

  const nativeDescription = (agent: Agent) => {
    const key = NativeAgentDescriptionKeys[agent.name]
    if (key) return language.t(key)
    return agent.description ?? ""
  }

  return (
    <>
      <div class="settings-v2-tab-header settings-v2-tab-header--stacked">
        <div class="settings-v2-tab-header-row">
          <div class="settings-v2-sub-agents-header-copy">
            <h2 class="settings-v2-tab-title">{language.t("settings.subAgents.title")}</h2>
            <p class="settings-v2-tab-description">{language.t("settings.subAgents.description")}</p>
          </div>
          <div class="flex items-center gap-2 shrink-0">
            <span class="px-3 py-1 rounded-full text-xs font-semibold bg-cyan-500/15 text-cyan-400 border border-cyan-500/30 shadow-sm">
              🛡️ {visibleBuiltinAgents().length} Sub-Agentes Nativos
            </span>
          </div>
        </div>
      </div>

      <div class="settings-v2-tab-body settings-v2-sub-agents">

        {/* Selector de Alcance Granular: Proyecto Actual vs Global */}
        <div class="flex items-center justify-between gap-3 mb-5 p-3 rounded-xl border border-white/10 bg-slate-900/40">
          <div class="flex items-center gap-2.5">
            <span class="text-xs font-semibold text-slate-300">Alcance de Configuración:</span>
            <div class="flex items-center gap-1.5 p-0.5 rounded-lg bg-black/40 border border-white/10">
              <button
                type="button"
                disabled={!props.directory}
                onClick={() => setScope("project")}
                class="px-2.5 py-1 text-xs rounded-md font-medium transition-all"
                classList={{
                  "bg-sky-500/25 text-sky-200 border border-sky-400/40 shadow-sm": scope() === "project",
                  "text-slate-400 hover:text-slate-200": scope() !== "project",
                  "opacity-50 cursor-not-allowed": !props.directory,
                }}
              >
                📁 Proyecto Actual {props.directory ? `(${props.directory.split(/[\\/]/).pop()})` : ""}
              </button>
              <button
                type="button"
                onClick={() => setScope("global")}
                class="px-2.5 py-1 text-xs rounded-md font-medium transition-all"
                classList={{
                  "bg-sky-500/25 text-sky-200 border border-sky-400/40 shadow-sm": scope() === "global",
                  "text-slate-400 hover:text-slate-200": scope() !== "global",
                }}
              >
                🌐 Global (Configuración Base)
              </button>
            </div>
          </div>

          <div class="text-xs text-slate-400">
            {scope() === "project"
              ? "Configuración aplicada exclusivamente a este repositorio."
              : "Configuración base predeterminada para cualquier repositorio."}
          </div>
        </div>

        {/* 1. Sub-Agentes Integrados de Élite (Fuente Principal) */}
        <Show when={visibleBuiltinAgents().length > 0}>
          <div class="settings-v2-section mb-6">
            <div class="flex items-center justify-between mb-2.5">
              <div class="flex items-center gap-2">
                <h3 class="settings-v2-section-title">
                  {language.t("settings.subAgents.list.group.builtin")}
                </h3>
                <span class="settings-v2-sub-agents-group-count">{visibleBuiltinAgents().length}</span>
              </div>
              <span class="text-xs text-slate-400">
                {language.t("settings.subAgents.list.builtin.hint")}
              </span>
            </div>

            <div class="settings-v2-subagents-table">
              <div class="settings-v2-subagents-thead">
                <div>Sub-Agente</div>
                <div>Rol y Especialidad</div>
                <div>Modelo</div>
                <div>Herramientas</div>
                <div>Estado</div>
              </div>

              <For each={pageBuiltinAgents().items}>
                {(agent) => {
                  const meta = () => AGENT_META[agent.name] || {
                    title: agent.name,
                    role: "Especialista Autónomo",
                    icon: agent.icon || "🤖",
                    color: agent.color || "#3B82F6",
                    category: "🤖 Agente",
                    description: nativeDescription(agent) || agent.description || "",
                  }

                  return (
                    <div class="settings-v2-subagents-row">
                      {/* 1. Sub-Agente */}
                      <div class="settings-v2-subagents-cell gap-2.5 pr-2">
                        <div
                          class="settings-v2-sub-agents-card-avatar shrink-0 size-8 text-base rounded-lg flex items-center justify-center"
                          style={{
                            "background-color": `color-mix(in srgb, ${meta().color} 18%, transparent)`,
                            "border-color": `color-mix(in srgb, ${meta().color} 40%, transparent)`,
                          }}
                        >
                          {meta().icon}
                        </div>
                        <div class="flex flex-col min-w-0">
                          <span class="text-xs font-semibold text-slate-100 truncate">{meta().title}</span>
                          <span class="text-[10px] font-mono text-slate-400 truncate">@{agent.name}</span>
                        </div>
                      </div>

                      {/* 2. Rol y Especialidad */}
                      <div class="settings-v2-subagents-cell flex-col items-start gap-1 pr-3">
                        <div class="flex items-center gap-1.5 flex-wrap">
                          <span class="settings-v2-sub-agents-card-category text-[9.5px] px-1.5 py-0.5">
                            {meta().category}
                          </span>
                          <span class="text-[11px] font-medium text-slate-300 truncate max-w-[200px]">
                            {meta().role}
                          </span>
                        </div>
                        <p class="text-[11px] text-slate-400 line-clamp-1 leading-normal m-0">
                          {meta().description || nativeDescription(agent)}
                        </p>
                      </div>

                      {/* 3. Modelo */}
                      <div class="settings-v2-subagents-cell">
                        <span class="settings-v2-sub-agents-badge settings-v2-sub-agents-badge--accent text-[10.5px]">
                          {agent.model?.modelID ?? language.t("settings.subAgents.list.model.inherit")}
                        </span>
                      </div>

                      {/* 4. Herramientas */}
                      <div class="settings-v2-subagents-cell">
                        <span class="settings-v2-sub-agents-badge text-[10.5px]">
                          {hasRestrictedTools(agent)
                            ? language.t("settings.subAgents.list.tools.summary", {
                                count: allowedToolCount(agent),
                              })
                            : language.t("settings.subAgents.list.tools.all")}
                        </span>
                      </div>

                      {/* 5. Estado */}
                      <div class="settings-v2-subagents-cell settings-v2-subagents-cell--status">
                        <Switch
                          checked={isAgentActive(agent.name)}
                          disabled={agent.name === "build"}
                          onChange={(checked) => toggleAgent(agent.name, checked)}
                        />
                        <span
                          class="settings-v2-chip text-[10px]"
                          data-tone={isAgentActive(agent.name) ? "accent" : "muted"}
                        >
                          {isAgentActive(agent.name) ? "Activo" : "Inactivo"}
                        </span>
                      </div>
                    </div>
                  )
                }}
              </For>
            </div>

            <Show when={pageBuiltinAgents().total > 1}>
              <SettingsPagerV2
                page={pageBuiltinAgents().page}
                totalPages={pageBuiltinAgents().total}
                onPage={(p) => setBuiltinPage(p)}
              />
            </Show>
          </div>
        </Show>

        <div class="settings-v2-section mb-6">
          <RlmHierarchyTree />
        </div>

        <div class="settings-v2-sub-agents-list-footer">
          {language.t("settings.subAgents.list.footer", {
            count: visibleBuiltinAgents().length,
            enabled: visibleBuiltinAgents().filter((a) => isAgentActive(a.name)).length,
          })}
        </div>
      </div>
    </>
  )
}
