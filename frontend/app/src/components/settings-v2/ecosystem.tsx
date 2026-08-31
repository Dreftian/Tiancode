import { createMemo, createSignal, For, Show, type Component } from "solid-js"
import { Switch } from "@tiancode-ai/ui/v2/switch-v2"
import { TextInputV2 } from "@tiancode-ai/ui/v2/text-input-v2"
import { SegmentedControlItemV2, SegmentedControlV2 } from "@tiancode-ai/ui/v2/segmented-control-v2"
import { Icon } from "@tiancode-ai/ui/icon"
import { useLanguage } from "@/context/language"
import { useSettings, type EcosystemSettings } from "@/context/settings"
import { SettingsListV2 } from "./parts/list"
import { SettingsRowV2 } from "./parts/row"

interface RepoModule {
  id: keyof EcosystemSettings
  name: string
  repo: string
  category: "gen" | "exec" | "analysis" | "memory"
  icon: string
  title: string
  description: string
  features: string[]
}

const REPO_MODULES: RepoModule[] = [
  {
    id: "llamacoder",
    name: "LlamaCoder App Generator",
    repo: "Nutlope/llamacoder",
    category: "gen",
    icon: "sparkle",
    title: "Generación de Apps Full-Stack con Preview",
    description: "Generador de aplicaciones completas (React, Next.js, Tailwind) a partir de descripciones en lenguaje natural con previsualización en vivo.",
    features: ["Generación React/Vite", "Componentes UI automáticos", "Preview interactivo"],
  },
  {
    id: "boltDiy",
    name: "Bolt.diy Sandbox Engine",
    repo: "stackblitz-labs/bolt.diy",
    category: "gen",
    icon: "window-cursor",
    title: "Entorno WebContainer & Fullstack Sandbox",
    description: "Ejecución de stacks de desarrollo completos en navegador y contenedores locales con dev server y terminal integrada.",
    features: ["Soporte multi-framework", "Live preview HMR", "Terminal en tiempo real"],
  },
  {
    id: "openDesign",
    name: "Open Design (Figma to Code)",
    repo: "nexu-io/open-design",
    category: "gen",
    icon: "layout",
    title: "Conversión de Diseños UI y Figma a Código",
    description: "Transforma interfaces gráficas, wireframes y maquetas Figma en componentes de código TypeScript/CSS de alta fidelidad.",
    features: ["Extracción de tokens", "Componentes limpios", "Soporte Vanilla & Tailwind"],
  },
  {
    id: "monaco",
    name: "Monaco Editor Pro",
    repo: "microsoft/monaco-editor",
    category: "gen",
    icon: "code-lines",
    title: "Editor de Código Avanzado & Visor de Diffs",
    description: "El motor de edición de VS Code integrado para resaltado de sintaxis, diffs lado a lado y autocompletado inteligente.",
    features: ["Diffs interactivos", "LSP integrado", "Multilenguaje"],
  },
  {
    id: "fragments",
    name: "E2B Fragments",
    repo: "e2b-dev/fragments",
    category: "exec",
    icon: "puzzle",
    title: "Fragmentos de Código & Componentes Aislados",
    description: "Renderizado y prueba de fragmentos de código, interfaces y micro-servicios en entornos efímeros seguros.",
    features: ["Pruebas de componentes", "Aislamiento seguro", "Feedback visual"],
  },
  {
    id: "e2b",
    name: "E2B Code Interpreter",
    repo: "e2b-dev/E2B",
    category: "exec",
    icon: "server",
    title: "Sandbox Seguro de Ejecución de Código",
    description: "Entorno de sandboxing seguro para ejecutar código Python, Node.js y scripts Bash sin comprometer el sistema local.",
    features: ["Sandbox en la nube/Docker", "Análisis de datos", "Cero riesgo local"],
  },
  {
    id: "openInterpreter",
    name: "Open Interpreter (OS Control)",
    repo: "openinterpreter/openinterpreter",
    category: "exec",
    icon: "terminal",
    title: "Control Nativo de Sistema Operativo & Terminal",
    description: "Ejecución de comandos y automatización del escritorio de Windows con confirmación y auto-aprobación granular.",
    features: ["Shell nativo", "Control de ventanas", "Automatización de PC"],
  },
  {
    id: "tauri",
    name: "Tauri Desktop Core",
    repo: "tauri-apps/tauri",
    category: "exec",
    icon: "laptop",
    title: "Arquitectura de Escritorio Ligera & Rápida",
    description: "Optimización de memoria y recursos para la app de escritorio con consumo ultra-bajo de RAM y arranque instantáneo.",
    features: ["Consumo mínimo de RAM", "Seguridad nativa", "Rendimiento extremo"],
  },
  {
    id: "treeSitter",
    name: "Tree-Sitter Parser",
    repo: "tree-sitter/tree-sitter",
    category: "analysis",
    icon: "tree",
    title: "Parser Sintáctico AST Incremental",
    description: "Análisis estructural profundo del código en 40+ lenguajes para refactorizaciones precisas sin romper dependencias.",
    features: ["Árboles sintácticos AST", "Detección de errores", "Búsqueda semántica"],
  },
  {
    id: "graphify",
    name: "Graphify Codebase Graph",
    repo: "Graphify-Labs/graphify",
    category: "analysis",
    icon: "network",
    title: "Grafo de Dependencias & Call-Graphs",
    description: "Mapeo completo de la base de código para visualizar conexiones entre archivos, imports y flujos de datos.",
    features: ["Grafo de llamadas", "Impacto de cambios", "Indexación rápida"],
  },
  {
    id: "pipelines",
    name: "Open-WebUI Pipelines",
    repo: "open-webui/pipelines",
    category: "analysis",
    icon: "filter",
    title: "Pipelines de Middleware & Filtros de Seguridad",
    description: "Intercepta y procesa prompts y respuestas para aplicar guardrails, sanitización y enrutamiento personalizado.",
    features: ["Filtros de secretos", "Transformación de prompts", "Auditoría"],
  },
  {
    id: "claudeMem",
    name: "Claude-Mem (Zero-Amnesia LTM)",
    repo: "thedotmack/claude-mem",
    category: "memory",
    icon: "brain",
    title: "Memoria Continua a Largo Plazo (USER.md / MEMORY.md)",
    description: "Persistencia contextual entre sesiones para recordar preferencias de usuario y la arquitectura de cada repositorio.",
    features: ["Zero amnesia", "USER.md global", "MEMORY.md por proyecto"],
  },
  {
    id: "firecrawl",
    name: "Firecrawl Web Scraper",
    repo: "firecrawl/firecrawl",
    category: "memory",
    icon: "globe",
    title: "Extracción Web Limpia a Markdown",
    description: "Convierte páginas web y documentación técnica en Markdown limpio libre de scripts, banners y cookies.",
    features: ["Markdown optimizado", "Sin anuncios ni popups", "Búsqueda web nítida"],
  },
  {
    id: "claudeSkills",
    name: "Awesome Claude Skills",
    repo: "ComposioHQ/awesome-claude-skills",
    category: "memory",
    icon: "book",
    title: "Catálogo de 52+ Habilidades de Ingeniería",
    description: "Flujos de trabajo estructurados para TDD, code review, arquitectura, git worktrees y auto-skills con /learn.",
    features: ["52+ skills activables", "Mejores prácticas TDD", "Auto-skills /learn"],
  },
]

export const SettingsEcosystemV2: Component = () => {
  const language = useLanguage()
  const settings = useSettings()
  const [query, setQuery] = createSignal("")
  const [category, setCategory] = createSignal<"all" | "gen" | "exec" | "analysis" | "memory">("all")

  const visibleModules = createMemo(() => {
    const q = query().trim().toLowerCase()
    const cat = category()
    return REPO_MODULES.filter((mod) => {
      if (cat !== "all" && mod.category !== cat) return false
      if (!q) return true
      return (
        mod.name.toLowerCase().includes(q) ||
        mod.repo.toLowerCase().includes(q) ||
        mod.title.toLowerCase().includes(q) ||
        mod.description.toLowerCase().includes(q)
      )
    })
  })

  const isEnabled = (id: keyof EcosystemSettings) => {
    const val = settings.ecosystem[id]
    return typeof val === "function" ? val() : true
  }

  const toggleModule = (id: keyof EcosystemSettings, enabled: boolean) => {
    const setterName = `set${id.charAt(0).toUpperCase()}${id.slice(1)}` as keyof typeof settings.ecosystem
    const setter = settings.ecosystem[setterName] as ((v: boolean) => void) | undefined
    if (typeof setter === "function") {
      setter(enabled)
    }
  }

  const enableAll = () => {
    for (const mod of REPO_MODULES) {
      toggleModule(mod.id, true)
    }
  }

  const enableRecommended = () => {
    const recommended: Array<keyof EcosystemSettings> = [
      "llamacoder",
      "boltDiy",
      "openDesign",
      "monaco",
      "tauri",
      "treeSitter",
      "graphify",
      "pipelines",
      "claudeMem",
    ]
    for (const mod of REPO_MODULES) {
      toggleModule(mod.id, recommended.includes(mod.id))
    }
  }

  const disableAll = () => {
    for (const mod of REPO_MODULES) {
      toggleModule(mod.id, false)
    }
  }

  return (
    <>
      <div class="settings-v2-tab-header settings-v2-tab-header--stacked">
        <div class="settings-v2-tab-header-row">
          <h2 class="settings-v2-tab-title">Módulos & Ecosistema IA</h2>
          <span class="settings-v2-chip" data-tone="green">
            14 Módulos Integrados
          </span>
        </div>
        <p class="settings-v2-tab-description">
          Activa o desactiva las tecnologías y repositorios de código abierto integrados en Tiancode para personalizar tu flujo de trabajo.
        </p>
      </div>

      <div class="settings-v2-tab-body">
        {/* Banner Explicativo de Ecosistema */}
        <div class="mb-4 p-3.5 rounded-xl border border-sky-500/20 bg-sky-500/10 text-xs text-sky-200 flex items-start gap-3">
          <span class="text-base shrink-0">💡</span>
          <div class="flex-1 leading-relaxed">
            <span class="font-semibold text-white block mb-0.5">¿Es necesario tener todo activado?</span>
            No es obligatorio. Los módulos esenciales de desarrollo y memoria (Monaco, Tree-Sitter AST, Memoria LTM, LlamaCoder) están activos por defecto para máximo rendimiento local. Módulos como E2B o Firecrawl son opcionales para sandboxing en la nube y scraping web avanzado.
          </div>
        </div>

        {/* Acciones Rápidas */}
        <div class="flex items-center justify-between gap-2 flex-wrap mb-3 p-3 rounded-xl border border-white/10 bg-slate-900/40">
          <div class="flex items-center gap-2">
            <span class="text-xs font-semibold text-slate-300">Presets Rápidos:</span>
            <button
              type="button"
              class="px-2.5 py-1 text-xs font-medium rounded-lg border border-emerald-500/40 bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25 transition-colors"
              onClick={enableRecommended}
            >
              🛡️ Configuración Recomendada
            </button>
            <button
              type="button"
              class="px-2.5 py-1 text-xs font-medium rounded-lg border border-sky-500/40 bg-sky-500/15 text-sky-300 hover:bg-sky-500/25 transition-colors"
              onClick={enableAll}
            >
              ⚡ Activar Todos (14)
            </button>
            <button
              type="button"
              class="px-2.5 py-1 text-xs font-medium rounded-lg border border-rose-500/30 bg-rose-500/10 text-rose-300 hover:bg-rose-500/20 transition-colors"
              onClick={disableAll}
            >
              🛑 Desactivar Todos
            </button>
          </div>
        </div>

        {/* Barra de herramientas y filtros */}
        <div style={{ "display": "flex", "flex-direction": "column", "gap": "10px", "margin-bottom": "16px" }}>
          <TextInputV2
            type="text"
            appearance="base"
            value={query()}
            onInput={(e) => setQuery(e.currentTarget.value)}
            placeholder="Buscar módulos (LlamaCoder, Bolt, Tree-sitter, E2B...)"
            leadingIcon={<Icon name="magnifying-glass" />}
            showClearButton={query().length > 0}
            onClearClick={() => setQuery("")}
            clearLabel="Limpiar búsqueda"
            spellcheck={false}
          />
          <div style={{ "display": "flex", "flex-wrap": "wrap", "gap": "6px" }}>
            <For each={[
              { id: "all", label: "Todos (14)" },
              { id: "gen", label: "Generación & UI" },
              { id: "exec", label: "Ejecución & OS" },
              { id: "analysis", label: "AST & Análisis" },
              { id: "memory", label: "Memoria & Web" },
            ] as const}>
              {(item) => {
                const active = () => category() === item.id
                return (
                  <button
                    type="button"
                    onClick={() => setCategory(item.id)}
                    style={{
                      "padding": "5px 12px",
                      "border-radius": "6px",
                      "font-size": "12px",
                      "font-weight": active() ? "600" : "450",
                      "background-color": active() ? "var(--v2-background-bg-base)" : "var(--v2-background-bg-layer-01)",
                      "color": active() ? "var(--v2-text-text-base)" : "var(--v2-text-text-muted)",
                      "border": active() ? "1px solid var(--v2-border-border-strong)" : "1px solid var(--v2-border-border-base)",
                      "cursor": "pointer",
                      "transition": "all 120ms ease",
                      "white-space": "nowrap",
                    }}
                  >
                    {item.label}
                  </button>
                )
              }}
            </For>
          </div>
        </div>

        {/* Lista de módulos */}
        <div class="settings-v2-section">
          <SettingsListV2>
            <For each={visibleModules()}>
              {(mod) => {
                const active = isEnabled(mod.id)
                return (
                  <SettingsRowV2
                    title={
                      <div class="flex items-center gap-2">
                        <span style={{ "font-weight": "600", "font-size": "13.5px" }}>{mod.name}</span>
                        <a
                          href={`https://github.com/${mod.repo}`}
                          target="_blank"
                          rel="noreferrer"
                          style={{
                            "font-size": "11px",
                            "font-family": "var(--font-mono)",
                            "color": "var(--color-primary-400)",
                            "text-decoration": "none",
                            "display": "inline-flex",
                            "align-items": "center",
                            "gap": "4px",
                          }}
                        >
                          <Icon name="github" />
                          {mod.repo}
                        </a>
                      </div>
                    }
                    description={
                      <div class="flex flex-col gap-1.5" style={{ "margin-top": "4px" }}>
                        <span style={{ "font-weight": "500", "color": "var(--color-neutral-100)" }}>
                          {mod.title}
                        </span>
                        <span style={{ "font-size": "12px", "color": "var(--color-neutral-400)" }}>
                          {mod.description}
                        </span>
                        <div class="flex flex-wrap gap-1.5" style={{ "margin-top": "4px" }}>
                          <For each={mod.features}>
                            {(feat) => (
                              <span
                                style={{
                                  "font-size": "10.5px",
                                  "padding": "2px 6px",
                                  "border-radius": "4px",
                                  "background": "rgba(255, 255, 255, 0.05)",
                                  "color": "var(--color-neutral-300)",
                                }}
                              >
                                {feat}
                              </span>
                            )}
                          </For>
                        </div>
                      </div>
                    }
                  >
                    <div class="flex items-center gap-3">
                      <span class="settings-v2-chip" data-tone={active ? "green" : "muted"}>
                        {active ? "Activo" : "Inactivo"}
                      </span>
                      <Switch
                        checked={active}
                        onChange={(checked) => toggleModule(mod.id, checked)}
                      />
                    </div>
                  </SettingsRowV2>
                )
              }}
            </For>
          </SettingsListV2>
        </div>
      </div>
    </>
  )
}
