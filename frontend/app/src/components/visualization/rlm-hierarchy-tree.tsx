import { Component, createMemo, createSignal, For, Show } from "solid-js"
import { useLanguage } from "@/context/language"

export type RlmAgentNode = {
  id: string
  name: string
  role?: string
  status: "idle" | "running" | "completed" | "error"
  level: number
  icon?: string
  color?: string
  taskPrompt?: string
  children?: RlmAgentNode[]
  resultPreview?: string
  durationMs?: number
}

export const RlmHierarchyTree: Component<{
  nodes?: RlmAgentNode[]
  onSelectNode?: (nodeId: string) => void
}> = (props) => {
  const language = useLanguage()
  const [selectedId, setSelectedId] = createSignal<string | null>(null)
  const [expanded, setExpanded] = createSignal(true)

  const defaultNodes: RlmAgentNode[] = [
    {
      id: "root-orchestrator",
      name: "Tiancode Prime Orchestrator",
      role: "Orquestador de Descomposición RLM (Nivel 0)",
      status: "running",
      level: 0,
      icon: "🧠",
      color: "#38bdf8",
      taskPrompt: "Coordinación central, planificación atómica y reconciliación de contexto persistente.",
      children: [
        {
          id: "sub-arch",
          name: "Software & System Architect",
          role: "Arquitectura & Límites Modulares",
          status: "completed",
          level: 1,
          icon: "🏛️",
          color: "#3B82F6",
          taskPrompt: "Análisis de dependencias, diseño desacoplado y contratos de API limpios.",
          resultPreview: "Estructura modular verificada sin ciclos de dependencia.",
        },
        {
          id: "sub-fullstack",
          name: "Fullstack Senior Engineer",
          role: "Implementación Multi-Lenguaje",
          status: "running",
          level: 1,
          icon: "⚡",
          color: "#8B5CF6",
          taskPrompt: "Implementación de frontend, backend y lógica de negocio con tipado estricto.",
          resultPreview: "Cambios aplicados de manera atómica con preservación de estado.",
        },
        {
          id: "sub-devsecops",
          name: "DevSecOps & Code Auditor",
          role: "Auditoría de Seguridad & Dependencias",
          status: "completed",
          level: 1,
          icon: "🛡️",
          color: "#EF4444",
          taskPrompt: "Revisión estricta de CVEs, secretos y consistencia de compilación.",
          resultPreview: "0 vulnerabilidades detectadas en paquetes y rutas críticas.",
        },
        {
          id: "sub-qa",
          name: "QA & Verification Specialist",
          role: "Verificación Autónoma & Tipos",
          status: "idle",
          level: 1,
          icon: "🧪",
          color: "#10B981",
          taskPrompt: "Ejecución de suites de prueba, verificación de tipos y validación de regresiones.",
        },
      ],
    },
  ]

  const treeNodes = createMemo(() => props.nodes ?? defaultNodes)

  const renderNode = (node: RlmAgentNode) => {
    const isSelected = () => selectedId() === node.id
    const indentPx = node.level * 20

    return (
      <div class="flex flex-col gap-1.5">
        <div
          class={`flex items-center justify-between p-3 rounded-xl border transition-all cursor-pointer select-none ${
            isSelected()
              ? "border-cyan-500/60 bg-cyan-500/10 shadow-[0_0_16px_rgba(56,189,248,0.15)]"
              : "border-white/[0.08] bg-slate-900/40 hover:border-white/20 hover:bg-white/[0.03]"
          }`}
          style={{ "margin-left": `${indentPx}px` }}
          onClick={() => {
            setSelectedId(node.id)
            props.onSelectNode?.(node.id)
          }}
        >
          <div class="flex items-center gap-3 min-w-0">
            <div
              class="size-8 rounded-lg flex items-center justify-center text-sm font-semibold shrink-0 border"
              style={{
                "background-color": `color-mix(in srgb, ${node.color || "#38bdf8"} 18%, transparent)`,
                "border-color": `color-mix(in srgb, ${node.color || "#38bdf8"} 40%, transparent)`,
              }}
            >
              {node.icon || `L${node.level}`}
            </div>
            <div class="flex flex-col min-w-0">
              <div class="flex items-center gap-2">
                <span class="font-semibold text-xs text-slate-100 truncate">{node.name}</span>
                <Show when={node.role}>
                  <span class="text-[10px] px-1.5 py-0.5 rounded-md bg-white/[0.06] text-slate-400 font-mono">
                    {node.role}
                  </span>
                </Show>
              </div>
              <Show when={node.taskPrompt}>
                <span class="text-[11px] text-slate-400 line-clamp-1 mt-0.5">{node.taskPrompt}</span>
              </Show>
              <Show when={node.resultPreview}>
                <span class="text-[10.5px] text-emerald-400/90 font-mono line-clamp-1 mt-0.5">
                  ✓ {node.resultPreview}
                </span>
              </Show>
            </div>
          </div>

          <div class="flex items-center gap-2 shrink-0 ml-3">
            <span
              class={`text-[10px] px-2 py-0.5 rounded-full font-semibold uppercase tracking-wider ${
                node.status === "completed"
                  ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
                  : node.status === "running"
                  ? "bg-cyan-500/15 text-cyan-300 border border-cyan-500/30 animate-pulse"
                  : node.status === "error"
                  ? "bg-red-500/15 text-red-400 border border-red-500/30"
                  : "bg-slate-500/15 text-slate-400 border border-slate-500/30"
              }`}
            >
              {node.status === "completed" ? "Completado" : node.status === "running" ? "Activo" : node.status === "error" ? "Error" : "En espera"}
            </span>
          </div>
        </div>

        <Show when={node.children && node.children.length > 0}>
          <For each={node.children}>{(child) => renderNode(child)}</For>
        </Show>
      </div>
    )
  }

  return (
    <div class="flex flex-col gap-3 p-4 rounded-2xl border border-white/10 bg-slate-900/50 backdrop-blur-sm">
      <div class="flex items-center justify-between border-b border-white/[0.06] pb-3">
        <div class="flex items-center gap-2.5">
          <span class="text-base">🌳</span>
          <div class="flex flex-col">
            <h3 class="text-xs font-semibold text-slate-200">Árbol de Recursión RLM (Sub-Agentes)</h3>
            <span class="text-[11px] text-slate-400">Topología de orquestación jerárquica y delegación atómica</span>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setExpanded(!expanded())}
          class="px-2.5 py-1 text-[11px] rounded-lg bg-white/[0.05] hover:bg-white/[0.1] text-slate-300 border border-white/10 transition-all"
        >
          {expanded() ? "Colapsar" : "Expandir"}
        </button>
      </div>

      <Show when={expanded()}>
        <div class="flex flex-col gap-2 pt-1">
          <For each={treeNodes()}>{(root) => renderNode(root)}</For>
        </div>
      </Show>
    </div>
  )
}
