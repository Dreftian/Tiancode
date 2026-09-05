import { ButtonV2 } from "@tiancode-ai/ui/v2/button-v2"
import { CheckboxV2 } from "@tiancode-ai/ui/v2/checkbox-v2"
import { Icon } from "@tiancode-ai/ui/v2/icon"
import { IconButtonV2 } from "@tiancode-ai/ui/v2/icon-button-v2"
import { SettingsItemIconV2, itemColor } from "./parts/item-icon"
import { SegmentedControlItemV2, SegmentedControlV2 } from "@tiancode-ai/ui/v2/segmented-control-v2"
import { SelectV2 } from "@tiancode-ai/ui/v2/select-v2"
import { Switch } from "@tiancode-ai/ui/v2/switch-v2"
import { TextInputV2 } from "@tiancode-ai/ui/v2/text-input-v2"
import { TextareaV2 } from "@tiancode-ai/ui/v2/textarea-v2"
import type { Agent, PermissionRule } from "@tiancode-ai/sdk/v2/client"
import { type Component, createEffect, createMemo, createResource, createSignal, For, Show } from "solid-js"
import { useLanguage } from "@/context/language"
import { useServerSDK } from "@/context/server-sdk"
import { showToast } from "@/utils/toast"
import { SettingsListV2 } from "./parts/list"
import { SettingsPagerV2 } from "./parts/pager"
import { SettingsRowV2 } from "./parts/row"
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
type FormMessage =
  | "created"
  | "failed"
  | "updated"
  | "updateFailed"
  | "deleted"
  | "deleteFailed"
  | undefined

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

  const [name, setName] = createSignal("")
  const [description, setDescription] = createSignal("")
  const [prompt, setPrompt] = createSignal("")
  const [modelKind, setModelKind] = createSignal<"inherit" | "custom">("inherit")
  const [modelValue, setModelValue] = createSignal("")
  const [color, setColor] = createSignal("")
  const [toolsMode, setToolsMode] = createSignal<"all" | "custom">("all")
  const [tools, setTools] = createSignal<string[]>([])
  const [injectAgentsMd, setInjectAgentsMd] = createSignal(true)
  const [editing, setEditing] = createSignal<string | null>(null)
  const [showModal, setShowModal] = createSignal(false)
  const [saving, setSaving] = createSignal(false)
  const [message, setMessage] = createSignal<FormMessage>(undefined)
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

  const userAgents = createMemo<Agent[]>(() => {
    const serverList = agents() ?? []
    return serverList.filter((a) => a && !isNative(a) && !(a.name in AGENT_META))
  })

  const agentList = createMemo(() => [...builtinAgents(), ...userAgents()])

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
  const visibleUserAgents = createMemo(() => visibleByStatus(userAgents().filter(matchesQuery)))
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

  const USER_PAGE_SIZE = 10
  const [userPage, setUserPage] = createSignal(1)
  const userTotal = () => Math.max(1, Math.ceil(visibleUserAgents().length / USER_PAGE_SIZE))
  const pageUserAgents = createMemo(() => {
    const page = Math.min(userPage(), userTotal())
    const start = (page - 1) * USER_PAGE_SIZE
    return { items: visibleUserAgents().slice(start, start + USER_PAGE_SIZE), page, total: userTotal() }
  })

  createEffect(() => {
    if (builtinPage() > builtinTotal()) setBuiltinPage(builtinTotal())
    if (userPage() > userTotal()) setUserPage(userTotal())
  })

  createEffect(() => {
    query()
    status()
    setBuiltinPage(1)
    setUserPage(1)
  })

  const editingAgent = createMemo(
    () => agentList().find((agent: Agent) => agent.name === editing()) ?? null,
  )

  const nativeDescription = (agent: Agent) => {
    const key = NativeAgentDescriptionKeys[agent.name]
    if (key) return language.t(key)
    return agent.description ?? ""
  }

  const nameValid = createMemo(() => {
    const value = name().trim()
    return value.length >= 3 && value.length <= 50 && /^[a-zA-Z0-9-]+$/.test(value)
  })

  const canSave = createMemo(
    () => nameValid() && description().trim().length > 0 && prompt().trim().length > 0,
  )

  const toggleTool = (id: string) => {
    setTools((current) =>
      current.includes(id) ? current.filter((tool) => tool !== id) : [...current, id],
    )
  }

  const resetForm = () => {
    setEditing(null)
    setName("")
    setDescription("")
    setPrompt("")
    setColor("")
    setModelKind("inherit")
    setModelValue("")
    setToolsMode("all")
    setTools([])
    setInjectAgentsMd(true)
    setMessage(undefined)
    setShowModal(false)
  }

  const startCreate = () => {
    resetForm()
    setShowModal(true)
  }

  const startEdit = (agent: Agent) => {
    setEditing(agent.name)
    setName(agent.name)
    setDescription(agent.description ?? "")
    setPrompt(agent.prompt ?? "")
    const palette = AgentColors.find(
      (swatch) => swatch.value.toLowerCase() === (agent.color ?? "").toLowerCase(),
    )
    setColor(palette?.value ?? agent.color ?? "")
    setModelKind(agent.model ? "custom" : "inherit")
    setModelValue(agent.model ? `${agent.model.providerID}/${agent.model.modelID}` : "")
    const restricted = hasRestrictedTools(agent)
    setToolsMode(restricted ? "custom" : "all")
    setTools(
      restricted
        ? AgentTools.filter((tool) => effectiveToolRule(agent, tool.id)?.action !== "deny").map(
            (tool) => tool.id,
          )
        : [],
    )
    setInjectAgentsMd(true)
    setMessage(undefined)
    setShowModal(true)
  }

  const exportAgentMarkdown = () => {
    const agentName = name().trim() || "subagent"
    const content = [
      "---",
      `name: "${agentName}"`,
      `description: "${description().trim().replace(/"/g, '\\"')}"`,
      `color: "${color().trim() || "#3B82F6"}"`,
      `modelKind: "${modelKind()}"`,
      `model: "${modelValue().trim()}"`,
      `toolsMode: "${toolsMode()}"`,
      "tools:",
      ...(toolsMode() === "custom" ? tools().map((t) => `  - "${t}"`) : []),
      `injectAgentsMd: ${injectAgentsMd()}`,
      "---",
      "",
      "# System Prompt",
      "",
      prompt().trim() || "Eres un sub-agente especializado.",
      "",
    ].join("\n")

    const blob = new Blob([content], { type: "text/markdown;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `${agentName}.agent.md`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    showToast({ variant: "success", title: "Agente exportado en Markdown", description: `${agentName}.agent.md` })
  }

  const importAgentMarkdown = (file: File) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      const text = e.target?.result as string
      if (!text) return

      const frontmatterMatch = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/)
      if (frontmatterMatch) {
        const yaml = frontmatterMatch[1]
        const body = frontmatterMatch[2].replace(/^#\s*System Prompt\s*\r?\n/i, "").trim()

        const getVal = (key: string) => {
          const m = yaml.match(new RegExp(`^${key}:\\s*"?([^"\\r\\n]+)"?`, "m"))
          return m ? m[1].trim() : ""
        }

        const parsedName = getVal("name")
        const parsedDesc = getVal("description")
        const parsedColor = getVal("color")
        const parsedModelKind = getVal("modelKind")
        const parsedModel = getVal("model")
        const parsedToolsMode = getVal("toolsMode")
        const parsedInject = getVal("injectAgentsMd")

        const toolsMatches = yaml.match(/tools:\r?\n((?:\s+-\s*"?[^"\r\n]+"?\r?\n?)*)/)
        const parsedTools: string[] = []
        if (toolsMatches && toolsMatches[1]) {
          const lines = toolsMatches[1].split(/\r?\n/)
          for (const line of lines) {
            const tm = line.match(/^\s+-\s*"?(.*?)"?\s*$/)
            if (tm && tm[1]) parsedTools.push(tm[1])
          }
        }

        if (parsedName) setName(parsedName)
        if (parsedDesc) setDescription(parsedDesc)
        if (parsedColor) setColor(parsedColor)
        if (parsedModelKind === "custom" || parsedModelKind === "inherit") setModelKind(parsedModelKind)
        if (parsedModel) setModelValue(parsedModel)
        if (parsedToolsMode === "custom" || parsedToolsMode === "all") setToolsMode(parsedToolsMode)
        if (parsedTools.length > 0) setTools(parsedTools)
        if (parsedInject !== "") setInjectAgentsMd(parsedInject === "true")
        if (body) setPrompt(body)

        showToast({ variant: "success", title: "Agente importado correctamente", description: parsedName || file.name })
      } else {
        setPrompt(text.trim())
        showToast({ variant: "default", title: "Prompt cargado desde archivo", description: file.name })
      }
    }
    reader.readAsText(file)
  }

  const improveSubAgentPrompt = () => {
    const rawName = name().trim() || "Especialista"
    const rawDesc = description().trim() || "Asistente autónomo de desarrollo y resolución de tareas."
    const currentPrompt = prompt().trim()
    const activeToolsList = toolsMode() === "all" ? "Todas las herramientas habilitadas" : tools().join(", ") || "Lectura e Inspección"

    const improved = [
      `# Rol y Especialidad: ${rawName}`,
      rawDesc,
      "",
      "## Objetivos y Responsabilidades",
      `- Ejecutar tareas delegadas con máxima precisión, autonomía y verificación continua.`,
      `- Mantener la arquitectura limpia, siguiendo estrictamente las convenciones del repositorio.`,
      `- Identificar dependencias y efectos colaterales antes de realizar modificaciones.`,
      "",
      "## Protocolo de Ejecución Paso a Paso",
      `1. **Investigación e Inspección**: Analizar archivos y contexto relevante utilizando las herramientas asignadas (${activeToolsList}).`,
      `2. **Planificación Atómica**: Formular el plan de cambios específicos sin introducir regresiones.`,
      `3. **Implementación Precisa**: Aplicar los cambios necesarios directamente en los archivos correspondientes.`,
      `4. **Validación y Verificación**: Comprobar sintaxis, contratos de tipos y funcionalidad antes de concluir el turno.`,
      "",
      "## Reglas de Comportamiento y Salida",
      `- Respuestas concisas, estructuradas en Markdown y orientadas a la acción.`,
      `- Proporcionar siempre enlaces clicables a los archivos modificados o inspeccionados.`,
      `- Si surge un error imprevisto, diagnosticar la causa raíz antes de proponer la corrección.`,
      "",
      ...(currentPrompt ? ["## Contexto y Directivas Adicionales", currentPrompt] : []),
    ].join("\n")

    setPrompt(improved)
    showToast({
      variant: "success",
      title: "✨ Prompt de Sub-Agente optimizado",
      description: "Se han estructurado los protocolos, responsabilidades y reglas de ejecución.",
    })
  }

  const formBody = () => ({
    name: name().trim(),
    description: description().trim(),
    mode: "subagent" as const,
    ...(modelKind() === "custom" && modelValue().trim() ? { model: modelValue().trim() } : {}),
    ...(color().trim() ? { color: color().trim() } : {}),
    prompt: prompt().trim(),
    injectAgentsMd: injectAgentsMd(),
    ...(toolsMode() === "custom" ? { tools: tools() } : {}),
  })

  const submit = async () => {
    if (!canSave() || saving()) return
    setSaving(true)
    setMessage(undefined)
    const current = editing()
    try {
      if (current) {
        await serverSdk().client.app.agents2.update({
          ...params(),
          path_name: current,
          ...formBody(),
          body_name: name().trim(),
        })
      } else {
        await serverSdk().client.app.agents2.create({
          ...params(),
          ...formBody(),
        })
      }
      resetForm()
      setMessage(current ? "updated" : "created")
      void refetch()
    } catch {
      setMessage(current ? "updateFailed" : "failed")
    } finally {
      setSaving(false)
    }
  }

  const removeAgent = async (agent: Agent) => {
    if (
      typeof window === "object" &&
      !window.confirm(language.t("settings.subAgents.form.delete.confirm", { name: agent.name }))
    )
      return
    setSaving(true)
    setMessage(undefined)
    try {
      await serverSdk().client.app.agents2.delete({ ...params(), name: agent.name })
      if (editing() === agent.name) resetForm()
      setMessage("deleted")
      void refetch()
    } catch {
      setMessage("deleteFailed")
    } finally {
      setSaving(false)
    }
  }

  const messageVariant = createMemo(() =>
    message() === "created" || message() === "updated" || message() === "deleted" ? "success" : "error",
  )

  const messageText = createMemo(() => {
    switch (message()) {
      case "created":
        return language.t("settings.subAgents.form.success")
      case "failed":
        return language.t("settings.subAgents.form.failed")
      case "updated":
        return language.t("settings.subAgents.form.updated")
      case "updateFailed":
        return language.t("settings.subAgents.form.updateFailed")
      case "deleted":
        return language.t("settings.subAgents.form.deleted")
      case "deleteFailed":
        return language.t("settings.subAgents.form.deleteFailed")
    }
  })

  const cloneToCustom = (agent: Agent) => {
    const meta = AGENT_META[agent.name]
    setName(`${agent.name}-custom`)
    setDescription(meta?.description || nativeDescription(agent) || agent.description || "")
    setPrompt(agent.prompt || "")
    setColor(meta?.color || agent.color || "#3B82F6")
    setModelKind(agent.model ? "custom" : "inherit")
    setModelValue(agent.model ? `${agent.model.providerID}/${agent.model.modelID}` : "")
    const restricted = hasRestrictedTools(agent)
    setToolsMode(restricted ? "custom" : "all")
    setTools(
      restricted
        ? AgentTools.filter((tool) => effectiveToolRule(agent, tool.id)?.action !== "deny").map((tool) => tool.id)
        : [],
    )
    setInjectAgentsMd(true)
    setEditing(null)
    setShowModal(true)
    showToast({
      variant: "success",
      title: `Plantilla ${meta?.title || agent.name} cargada`,
      description: "Ajusta las opciones en el formulario para crear tu sub-agente.",
    })
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
            <input
              type="file"
              id="subagent-import-input"
              accept=".md,.markdown,.json"
              style={{ display: "none" }}
              onChange={(e) => {
                const f = e.currentTarget.files?.[0]
                if (f) importAgentMarkdown(f)
                e.currentTarget.value = ""
              }}
            />
            <ButtonV2
              type="button"
              variant="ghost"
              size="normal"
              class="whitespace-nowrap shrink-0"
              onClick={() => document.getElementById("subagent-import-input")?.click()}
            >
              📥 Importar (.md)
            </ButtonV2>
            <ButtonV2
              type="button"
              variant="ghost"
              size="normal"
              class="whitespace-nowrap shrink-0"
              onClick={exportAgentMarkdown}
            >
              📤 Exportar (.md)
            </ButtonV2>
            <ButtonV2
              type="button"
              variant="contrast"
              size="normal"
              icon="plus"
              class="whitespace-nowrap shrink-0 font-medium"
              onClick={startCreate}
            >
              {language.t("settings.subAgents.list.new")}
            </ButtonV2>
          </div>
        </div>
      </div>

      <div class="settings-v2-tab-body settings-v2-sub-agents">
        <Show when={message()}>
          <div class="settings-v2-skills-message" data-variant={messageVariant()}>
            {messageText()}
          </div>
        </Show>

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
                <div class="text-right">Acción</div>
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

                      {/* 6. Acciones */}
                      <div class="settings-v2-subagents-cell justify-end gap-1.5">
                        <button
                          type="button"
                          class="settings-v2-sub-agents-card-btn text-xs py-1 px-2.5"
                          onClick={() => cloneToCustom(agent)}
                          title="Cargar como base en el editor para crear tu versión personalizada"
                        >
                          ✨ Personalizar
                        </button>
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

        {/* 2. Sub-Agentes Personalizados (Galería Completa) */}
        <div class="settings-v2-section mb-6">
          <div class="flex items-center justify-between mb-3">
            <div class="flex items-center gap-2">
              <h3 class="settings-v2-section-title">
                {language.t("settings.subAgents.list.group.user")}
              </h3>
              <span class="settings-v2-sub-agents-group-count">{visibleUserAgents().length}</span>
            </div>
            <ButtonV2
              type="button"
              variant="contrast"
              size="small"
              onClick={startCreate}
            >
              + Nuevo sub-agente
            </ButtonV2>
          </div>

          <Show
            when={visibleUserAgents().length > 0}
            fallback={
              <div class="p-8 rounded-2xl border border-dashed border-white/10 bg-white/[0.02] text-center text-xs text-slate-400 flex flex-col items-center gap-3 my-2">
                <span class="text-3xl">🤖</span>
                <div class="flex flex-col gap-1 max-w-md">
                  <span class="font-semibold text-slate-200 text-sm">Sin sub-agentes personalizados creados</span>
                  <span>Crea un sub-agente especializado con tus propias directivas o haz clic en "Personalizar" en cualquier sub-agente del catálogo superior.</span>
                </div>
                <ButtonV2 type="button" variant="contrast" size="small" onClick={startCreate}>
                  + Crear Sub-Agente Personalizado
                </ButtonV2>
              </div>
            }
          >
            <div class="settings-v2-subagents-table">
              <div class="settings-v2-subagents-thead">
                <div>Sub-Agente</div>
                <div>Rol y Descripción</div>
                <div>Modelo</div>
                <div>Herramientas</div>
                <div>Estado</div>
                <div class="text-right">Acciones</div>
              </div>

              <For each={pageUserAgents().items}>
                {(agent) => (
                  <div class="settings-v2-subagents-row">
                    {/* 1. Sub-Agente */}
                    <div class="settings-v2-subagents-cell gap-2.5 pr-2">
                      <div
                        class="settings-v2-sub-agents-card-avatar shrink-0 size-8 text-base rounded-lg flex items-center justify-center"
                        style={{
                          "background-color": `color-mix(in srgb, ${agent.color || "#38bdf8"} 18%, transparent)`,
                          "border-color": `color-mix(in srgb, ${agent.color || "#38bdf8"} 40%, transparent)`,
                        }}
                      >
                        {agent.icon || "🤖"}
                      </div>
                      <div class="flex flex-col min-w-0">
                        <span class="text-xs font-semibold text-slate-100 truncate">{agent.name}</span>
                        <span class="text-[10px] font-mono text-slate-400 truncate">@{agent.name}</span>
                      </div>
                    </div>

                    {/* 2. Rol y Descripción */}
                    <div class="settings-v2-subagents-cell flex-col items-start gap-1 pr-3">
                      <span class="text-[11px] font-medium text-slate-300 truncate max-w-[200px]">
                        {(agent as any).role ?? (agent.mode === "primary" ? "Agente Principal" : "Sub-Agente Especialista")}
                      </span>
                      <p class="text-[11px] text-slate-400 line-clamp-1 leading-normal m-0">
                        {agent.description || "Sub-agente especializado personalizado."}
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
                        onChange={(checked) => toggleAgent(agent.name, checked)}
                      />
                      <span
                        class="settings-v2-chip text-[10px]"
                        data-tone={isAgentActive(agent.name) ? "accent" : "muted"}
                      >
                        {isAgentActive(agent.name) ? "Activo" : "Inactivo"}
                      </span>
                    </div>

                    {/* 6. Acciones */}
                    <div class="settings-v2-subagents-cell justify-end gap-1.5">
                      <button
                        type="button"
                        class="settings-v2-sub-agents-card-btn text-xs py-1 px-2"
                        onClick={() => startEdit(agent)}
                        title="Editar este sub-agente"
                      >
                        ✏️
                      </button>
                      <button
                        type="button"
                        class="settings-v2-sub-agents-card-btn text-xs py-1 px-2"
                        onClick={() => {
                          setName(agent.name)
                          setDescription(agent.description ?? "")
                          setPrompt(agent.prompt ?? "")
                          setColor(agent.color ?? "#3B82F6")
                          exportAgentMarkdown()
                        }}
                        title="Exportar archivo .agent.md"
                      >
                        📥
                      </button>
                      <button
                        type="button"
                        class="settings-v2-sub-agents-card-btn !text-red-400 hover:!text-red-300 text-xs py-1 px-2"
                        onClick={() => void removeAgent(agent)}
                        title="Eliminar este sub-agente"
                      >
                        🗑️
                      </button>
                    </div>
                  </div>
                )}
              </For>
            </div>

            <Show when={pageUserAgents().total > 1}>
              <SettingsPagerV2
                page={pageUserAgents().page}
                totalPages={pageUserAgents().total}
                onPage={(p) => setUserPage(p)}
              />
            </Show>
          </Show>
        </div>

        {/* Modal Diálogo Flotante de Configuración de Sub-Agente */}
        <Show when={showModal()}>
          <div class="fixed inset-0 z-[99999] flex items-center justify-center p-4 bg-black/75 backdrop-blur-md select-none">
            <div
              class="relative w-full max-w-2xl max-h-[90vh] bg-[#0c1222]/95 backdrop-blur-2xl border border-cyan-500/30 rounded-2xl p-6 flex flex-col justify-between text-white overflow-hidden shadow-[0_24px_64px_rgba(0,0,0,0.8),0_0_50px_rgba(56,189,248,0.2)]"
            >
              {/* Header Modal */}
              <div class="flex items-center justify-between pb-3 border-b border-white/[0.08] mb-3">
                <div class="flex items-center gap-3">
                  <div class="size-9 rounded-xl bg-cyan-500/15 border border-cyan-400/30 flex items-center justify-center text-lg shadow-[0_0_12px_rgba(56,189,248,0.25)]">
                    {editing() ? "✏️" : "✨"}
                  </div>
                  <div class="flex flex-col">
                    <h3 class="text-base font-semibold text-white">
                      {editing()
                        ? language.t("settings.subAgents.form.edit.title", { name: editing() ?? "" })
                        : language.t("settings.subAgents.form.new.title")}
                    </h3>
                    <p class="text-xs text-slate-400">
                      Configura herramientas, modelo, prompt del sistema y comportamiento.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={resetForm}
                  class="size-8 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] border border-white/10 flex items-center justify-center text-slate-300 hover:text-white transition-all text-sm"
                  aria-label="Cerrar"
                >
                  ✕
                </button>
              </div>

              {/* Scrollable Form Body */}
              <div class="flex-1 overflow-y-auto pr-2 my-1 flex flex-col gap-3">
                <SettingsListV2>
                  <SettingsRowV2 title={language.t("settings.subAgents.form.field.name")} description="">
                    <TextInputV2
                      type="text"
                      appearance="base"
                      value={name()}
                      onInput={(event) => setName(event.currentTarget.value)}
                      placeholder={language.t("settings.subAgents.form.field.name.placeholder")}
                      disabled={!!editing()}
                      spellcheck={false}
                      autocomplete="off"
                      aria-label={language.t("settings.subAgents.form.field.name")}
                    />
                  </SettingsRowV2>
                  <SettingsRowV2 title={language.t("settings.subAgents.form.field.color")} description="">
                    <div
                      class="settings-v2-sub-agents-swatches"
                      role="radiogroup"
                      aria-label={language.t("settings.subAgents.form.field.color")}
                    >
                      <For each={AgentColors}>
                        {(swatch) => (
                          <button
                            type="button"
                            role="radio"
                            class="settings-v2-sub-agents-swatch"
                            data-selected={color().toLowerCase() === swatch.value.toLowerCase() ? "" : undefined}
                            style={{ "--swatch": swatch.value }}
                            aria-checked={color().toLowerCase() === swatch.value.toLowerCase()}
                            aria-label={language.t(swatch.label)}
                            title={language.t(swatch.label)}
                            onClick={() => setColor(swatch.value)}
                          />
                        )}
                      </For>
                    </div>
                  </SettingsRowV2>
                  <SettingsRowV2 title={language.t("settings.subAgents.form.field.model")} description="">
                    <div class="settings-v2-sub-agents-model-stack">
                      <SelectV2
                        appearance="inline"
                        data-action="settings-sub-agent-model"
                        options={ModelOptions}
                        current={ModelOptions.find((option) => option.id === modelKind())}
                        placement="bottom-end"
                        gutter={6}
                        value={(option) => option.id}
                        label={(option) => language.t(option.label)}
                        onSelect={(option) => {
                          if (option) setModelKind(option.id)
                        }}
                      />
                      <Show when={modelKind() === "custom"}>
                        <TextInputV2
                          type="text"
                          appearance="base"
                          value={modelValue()}
                          onInput={(event) => setModelValue(event.currentTarget.value)}
                          placeholder={language.t("settings.subAgents.form.field.model.placeholder")}
                          spellcheck={false}
                          autocomplete="off"
                          aria-label={language.t("settings.subAgents.form.field.model")}
                        />
                      </Show>
                    </div>
                  </SettingsRowV2>
                  <SettingsRowV2 title={language.t("settings.subAgents.form.field.description")} description="">
                    <TextInputV2
                      type="text"
                      appearance="base"
                      value={description()}
                      onInput={(event) => setDescription(event.currentTarget.value)}
                      placeholder={language.t("settings.subAgents.form.field.description.placeholder")}
                      spellcheck={false}
                      autocomplete="off"
                      aria-label={language.t("settings.subAgents.form.field.description")}
                    />
                  </SettingsRowV2>
                  <SettingsRowV2 title={language.t("settings.subAgents.form.field.tools")} description="">
                    <div class="settings-v2-sub-agents-tools-stack">
                      <SegmentedControlV2
                        value={toolsMode()}
                        onChange={(value) => setToolsMode((value ?? "all") as "all" | "custom")}
                      >
                        <SegmentedControlItemV2 value="all">
                          {language.t("settings.subAgents.form.tools.all")}
                        </SegmentedControlItemV2>
                        <SegmentedControlItemV2 value="custom">
                          {language.t("settings.subAgents.form.tools.custom")}
                        </SegmentedControlItemV2>
                      </SegmentedControlV2>
                      <Show when={toolsMode() === "custom"}>
                        <div class="settings-v2-sub-agents-tools-grid">
                          <For each={AgentTools}>
                            {(tool) => (
                              <CheckboxV2
                                checked={tools().includes(tool.id)}
                                onChange={() => toggleTool(tool.id)}
                                label={
                                  <span class="settings-v2-sub-agents-tool-label">
                                    {language.t(tool.label)}
                                    <Show when={tool.sensitive}>
                                      <span class="settings-v2-sub-agents-sensitive-chip">
                                        {language.t("settings.subAgents.form.tools.sensitive")}
                                      </span>
                                    </Show>
                                  </span>
                                }
                              />
                            )}
                          </For>
                        </div>
                      </Show>
                    </div>
                  </SettingsRowV2>
                  <SettingsRowV2
                    title={
                      <div class="flex items-center justify-between w-full">
                        <span>{language.t("settings.subAgents.form.field.prompt")}</span>
                        <ButtonV2
                          type="button"
                          variant="ghost"
                          size="small"
                          onClick={improveSubAgentPrompt}
                        >
                          ✨ Mejorar Prompt
                        </ButtonV2>
                      </div>
                    }
                    description=""
                  >
                    <TextareaV2
                      value={prompt()}
                      onInput={(event) => setPrompt(event.currentTarget.value)}
                      placeholder={language.t("settings.subAgents.form.field.prompt.placeholder")}
                      rows={5}
                      spellcheck={false}
                      aria-label={language.t("settings.subAgents.form.field.prompt")}
                    />
                  </SettingsRowV2>
                  <SettingsRowV2
                    title={language.t("settings.subAgents.form.field.injectAgentsMd")}
                    description={language.t("settings.subAgents.form.field.injectAgentsMd.description")}
                  >
                    <Switch checked={injectAgentsMd()} onChange={setInjectAgentsMd} hideLabel>
                      {language.t("settings.subAgents.form.field.injectAgentsMd")}
                    </Switch>
                  </SettingsRowV2>
                </SettingsListV2>
              </div>

              {/* Modal Footer Actions */}
              <div class="flex items-center justify-between pt-3 border-t border-white/[0.08] mt-2">
                <Show when={editing()}>
                  <ButtonV2
                    type="button"
                    variant="danger"
                    size="small"
                    disabled={saving()}
                    onClick={() => {
                      const agent = editingAgent()
                      if (agent) void removeAgent(agent)
                    }}
                  >
                    {language.t("settings.subAgents.form.delete")}
                  </ButtonV2>
                </Show>
                <div class="flex items-center gap-2 ml-auto">
                  <ButtonV2 type="button" variant="ghost" size="small" onClick={resetForm}>
                    {language.t("settings.subAgents.form.cancel")}
                  </ButtonV2>
                  <ButtonV2
                    type="button"
                    variant="contrast"
                    size="small"
                    disabled={saving() || !canSave()}
                    onClick={() => void submit()}
                  >
                    {saving()
                      ? language.t("settings.subAgents.form.saving")
                      : language.t("settings.subAgents.form.save")}
                  </ButtonV2>
                </div>
              </div>
            </div>
          </div>
        </Show>

        <div class="settings-v2-section mb-6">
          <RlmHierarchyTree />
        </div>

        <div class="settings-v2-sub-agents-list-footer">
          {language.t("settings.subAgents.list.footer", {
            count: agentList().length,
            enabled: agentList().length,
          })}
        </div>
      </div>
    </>
  )
}
