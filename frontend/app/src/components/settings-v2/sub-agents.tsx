import { ButtonV2 } from "@tiancode-ai/ui/v2/button-v2"
import { CheckboxV2 } from "@tiancode-ai/ui/v2/checkbox-v2"
import { Icon } from "@tiancode-ai/ui/v2/icon"
import { IconButtonV2 } from "@tiancode-ai/ui/v2/icon-button-v2"
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
  general: "settings.subAgents.native.general",
  explore: "settings.subAgents.native.explore",
  compaction: "settings.subAgents.native.compaction",
  title: "settings.subAgents.native.title",
  summary: "settings.subAgents.native.summary",
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
// walking the ruleset in order.
const effectiveToolRule = (agent: Agent, tool: string): PermissionRule | undefined => {
  const permission = tool.toLowerCase()
  return agent.permission.findLast(
    (rule) => rule.pattern === "*" && (rule.permission === permission || rule.permission === "*"),
  )
}

// A restricted ruleset is one with a deny/ask rule (pattern `*`) for a tool
// permission or for `*` itself; unrestricted agents inherit everything.
const hasRestrictedTools = (agent: Agent): boolean =>
  agent.permission.some(
    (rule) =>
      rule.pattern === "*" &&
      (rule.permission === "*" || ToolPermissionNames.includes(rule.permission)) &&
      rule.action !== "allow",
  )

const allowedToolCount = (agent: Agent): number =>
  ToolPermissionNames.filter((permission) =>
    agent.permission.some((rule) => rule.pattern === "*" && rule.permission === permission && rule.action === "allow"),
  ).length

export const SettingsSubAgentsV2: Component<{
  directory?: string
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
  const [saving, setSaving] = createSignal(false)
  const [message, setMessage] = createSignal<FormMessage>(undefined)

  const params = () => (props.directory ? { directory: props.directory } : undefined)

  const [agents, { refetch }] = createResource(
    () => serverSdk().client.app.agents(params()),
    (request) => request.then((x) => x.data),
    { initialValue: [] },
  )

  const agentList = createMemo(() => agents() ?? [])
  const userAgents = createMemo(() => agentList().filter((agent) => agent.native !== true))
  const builtinAgents = createMemo(() => agentList().filter((agent) => agent.native === true))

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

  // Paginación de la lista de agentes de usuario: 5 filas en pantalla,
  // sin scroll largo. La página se re-ajusta si la lista se encoge.
  const USER_PAGE_SIZE = 5
  const [userPage, setUserPage] = createSignal(1)
  const userTotal = () => Math.max(1, Math.ceil(visibleUserAgents().length / USER_PAGE_SIZE))
  const pageUserAgents = createMemo(() => {
    const page = Math.min(userPage(), userTotal())
    const start = (page - 1) * USER_PAGE_SIZE
    return { items: visibleUserAgents().slice(start, start + USER_PAGE_SIZE), page, total: userTotal() }
  })
  createEffect(() => {
    if (userPage() > userTotal()) setUserPage(userTotal())
  })
  // Al cambiar la búsqueda o el filtro se vuelve a la primera página: seguir
  // en la página 5 de una lista filtrada desorienta.
  createEffect(() => {
    query()
    status()
    setUserPage(1)
  })

  const editingAgent = createMemo(
    () => agentList().find((agent) => agent.name === editing()) ?? null,
  )

  const resetForm = () => {
    setName("")
    setDescription("")
    setPrompt("")
    setModelKind("inherit")
    setModelValue("")
    setColor("")
    setToolsMode("all")
    setTools([])
    setInjectAgentsMd(true)
    setEditing(null)
    setMessage(undefined)
  }

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

  const startCreate = () => {
    resetForm()
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

  const installPreset = (preset: (typeof SPECIALIZED_PRESETS)[0]) => {
    setName(preset.name)
    setDescription(preset.description)
    setPrompt(preset.prompt)
    setColor(preset.color)
    setToolsMode("custom")
    setTools(preset.tools.map((t) => t.toLowerCase()))
    showToast({
      variant: "success",
      title: `Preset ${preset.role} cargado`,
      description: "Revisa los campos y guarda tu nuevo sub-agente.",
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

        {/* 1. Grafo Visual de Enjambre Multi-Agente */}
        <AgentSwarmGraph class="mb-5" />

        {/* 2. Catálogo de Presets Especializados en 1 Clic */}
        <div class="settings-v2-section mb-6">
          <div class="flex items-center justify-between mb-2.5">
            <h3 class="settings-v2-section-title">Catálogo de Sub-Agentes Especializados (1 Clic)</h3>
            <span class="text-xs text-slate-400">Instala roles preconfigurados con permisos óptimos</span>
          </div>
          <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5">
            <For each={SPECIALIZED_PRESETS}>
              {(preset) => (
                <div class="flex flex-col justify-between p-3 rounded-lg border border-white/10 bg-slate-900/50 hover:border-white/20 transition-colors">
                  <div class="flex items-start gap-2.5 mb-2">
                    <span class="text-2xl">{preset.icon}</span>
                    <div class="min-w-0 flex-1">
                      <span class="text-xs font-semibold text-white block truncate">{preset.role}</span>
                      <p class="text-[11px] text-slate-400 line-clamp-2 leading-relaxed mt-0.5">{preset.description}</p>
                    </div>
                  </div>
                  <div class="flex items-center justify-between mt-2 pt-2 border-t border-white/5">
                    <span class="text-[10px] text-slate-400">{preset.tools.length} herramientas</span>
                    <ButtonV2
                      type="button"
                      variant="outline"
                      size="small"
                      onClick={() => installPreset(preset)}
                    >
                      Cargar Preset ⚡
                    </ButtonV2>
                  </div>
                </div>
              )}
            </For>
          </div>
        </div>

        <div class="settings-v2-sub-agents-layout">
          <div class="settings-v2-sub-agents-form">
            <div class="settings-v2-section">
              <h3 class="settings-v2-section-title">
                {editing()
                  ? language.t("settings.subAgents.form.edit.title", { name: editing() ?? "" })
                  : language.t("settings.subAgents.form.new.title")}
              </h3>
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
                        ✨ Mejorar Agente
                      </ButtonV2>
                    </div>
                  }
                  description=""
                >
                  <TextareaV2
                    value={prompt()}
                    onInput={(event) => setPrompt(event.currentTarget.value)}
                    placeholder={language.t("settings.subAgents.form.field.prompt.placeholder")}
                    rows={4}
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

              <Show when={props.directory}>
                <div class="settings-v2-sub-agents-workspace-hint">
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 16 16"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                    aria-hidden="true"
                  >
                    <path
                      d="M8 14.5A6.5 6.5 0 1 0 8 1.5a6.5 6.5 0 0 0 0 13Z"
                      stroke="currentColor"
                    />
                    <path d="M8 7.25V11M8 5.25H8.01" stroke="currentColor" stroke-linecap="round" />
                  </svg>
                  {language.t("settings.subAgents.form.workspace.unsupported")}
                </div>
              </Show>

              <div class="settings-v2-sub-agents-form-actions">
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
                <span class="settings-v2-sub-agents-form-actions-spacer" />
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

          <div class="settings-v2-sub-agents-list">
            <div class="settings-v2-sub-agents-toolbar">
              <TextInputV2
                type="text"
                appearance="base"
                value={query()}
                onInput={(event) => setQuery(event.currentTarget.value)}
                placeholder={language.t("settings.subAgents.list.search.placeholder")}
                leadingIcon={<Icon name="magnifying-glass" />}
                showClearButton={query().length > 0}
                onClearClick={() => setQuery("")}
                clearLabel={language.t("settings.subAgents.list.search.clear")}
                spellcheck={false}
                aria-label={language.t("settings.subAgents.list.search.placeholder")}
              />
              <SegmentedControlV2
                class="settings-v2-sub-agents-filter"
                value={status()}
                onChange={(value) => setStatus((value ?? "all") as StatusId)}
              >
                <For each={StatusOptions}>
                  {(option) => (
                    <SegmentedControlItemV2 value={option.id}>{language.t(option.label)}</SegmentedControlItemV2>
                  )}
                </For>
              </SegmentedControlV2>
            </div>

            <div class="settings-v2-section">
              <Show
                when={visibleUserAgents().length > 0}
                fallback={
                  <Show when={visibleBuiltinAgents().length === 0}>
                    <div class="settings-v2-skills-status">{language.t("settings.subAgents.list.empty")}</div>
                  </Show>
                }
              >
                <div class="settings-v2-sub-agents-group-title">
                  {language.t("settings.subAgents.list.group.user")}
                  <span class="settings-v2-sub-agents-group-count">{visibleUserAgents().length}</span>
                </div>
                <SettingsListV2>
                  <For each={pageUserAgents().items}>
                    {(agent) => (
                      <div
                        class="settings-v2-sub-agents-item"
                        data-active={editing() === agent.name ? "" : undefined}
                      >
                        <div
                          class="settings-v2-sub-agents-avatar"
                          style={{ "--agent-color": agent.color ?? "var(--v2-text-text-faint)" }}
                        >
                          <span class="settings-v2-sub-agents-avatar-dot" />
                        </div>
                        <div class="settings-v2-sub-agents-item-copy">
                          <div class="settings-v2-sub-agents-item-name">{agent.name}</div>
                          <div class="settings-v2-sub-agents-badges">
                            <span class="settings-v2-sub-agents-badge settings-v2-sub-agents-badge--accent">
                              {agent.model?.modelID ?? language.t("settings.subAgents.list.model.inherit")}
                            </span>
                            <span class="settings-v2-sub-agents-badge">
                              {hasRestrictedTools(agent)
                                ? language.t("settings.subAgents.list.tools.summary", {
                                    count: allowedToolCount(agent),
                                  })
                                : language.t("settings.subAgents.list.tools.all")}
                            </span>
                          </div>
                          <div class="settings-v2-sub-agents-item-description">{nativeDescription(agent)}</div>
                        </div>
                        <div class="settings-v2-sub-agents-item-actions">
                          <IconButtonV2
                            size="small"
                            variant="ghost-muted"
                            icon={<Icon name="edit" />}
                            aria-label={language.t("settings.subAgents.list.edit")}
                            onClick={() => startEdit(agent)}
                          />
                          <IconButtonV2
                            size="small"
                            variant="ghost-muted"
                            icon={
                              <svg
                                width="16"
                                height="16"
                                viewBox="0 0 16 16"
                                fill="none"
                                xmlns="http://www.w3.org/2000/svg"
                                aria-hidden="true"
                              >
                                <path
                                  d="M2.5 4.5H13.5M6.25 2.5H9.75M6.25 7V11M9.75 7V11M3.25 4.5L3.9 13.2C3.95 13.85 4.2 14.5 5.25 14.5H10.75C11.8 14.5 12.05 13.85 12.1 13.2L12.75 4.5"
                                  stroke="currentColor"
                                  stroke-linecap="round"
                                  stroke-linejoin="round"
                                />
                              </svg>
                            }
                            aria-label={language.t("settings.subAgents.list.delete")}
                            onClick={() => void removeAgent(agent)}
                          />
                        </div>
                      </div>
                    )}
                  </For>
                </SettingsListV2>
                <Show when={pageUserAgents().total > 1}>
                  <SettingsPagerV2
                    page={pageUserAgents().page}
                    totalPages={pageUserAgents().total}
                    onPage={setUserPage}
                  />
                </Show>
              </Show>
            </div>
          </div>
        </div>

        <div class="settings-v2-section mb-6">
          <RlmHierarchyTree />
        </div>

        <Show when={visibleBuiltinAgents().length > 0}>
          <div class="settings-v2-section settings-v2-sub-agents-builtin-section">
            <div class="settings-v2-sub-agents-group-title">
              {language.t("settings.subAgents.list.group.builtin")}
              <span class="settings-v2-sub-agents-group-count">{visibleBuiltinAgents().length}</span>
              <span class="settings-v2-sub-agents-group-hint">
                {language.t("settings.subAgents.list.builtin.hint")}
              </span>
            </div>
            <div class="settings-v2-sub-agents-grid">
              <For each={visibleBuiltinAgents()}>
                {(agent) => (
                  <div class="settings-v2-sub-agents-card" data-builtin="">
                    <div class="settings-v2-sub-agents-card-header">
                      <div
                        class="settings-v2-sub-agents-avatar"
                        style={{ "--agent-color": agent.color ?? "var(--v2-text-text-faint)" }}
                      >
                        <span class="settings-v2-sub-agents-avatar-dot" />
                      </div>
                      <div class="settings-v2-sub-agents-card-name">{agent.name}</div>
                    </div>
                    <div class="settings-v2-sub-agents-badges">
                      <span class="settings-v2-sub-agents-badge settings-v2-sub-agents-badge--accent">
                        {agent.model?.modelID ?? language.t("settings.subAgents.list.model.inherit")}
                      </span>
                      <span class="settings-v2-sub-agents-badge">
                        {hasRestrictedTools(agent)
                          ? language.t("settings.subAgents.list.tools.summary", {
                              count: allowedToolCount(agent),
                            })
                          : language.t("settings.subAgents.list.tools.all")}
                      </span>
                    </div>
                    <div class="settings-v2-sub-agents-card-description">{nativeDescription(agent)}</div>
                  </div>
                )}
              </For>
            </div>

            <div class="settings-v2-sub-agents-list-footer">
              {language.t("settings.subAgents.list.footer", {
                count: agentList().length,
                enabled: agentList().length,
              })}
            </div>
          </div>
        </Show>
      </div>
    </>
  )
}
