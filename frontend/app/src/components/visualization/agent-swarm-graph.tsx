import { type Component, createSignal, For, Show } from "solid-js"
import { ButtonV2 } from "@tiancode-ai/ui/v2/button-v2"

export type SwarmNode = {
  id: string
  name: string
  role: string
  color: string
  status: "idle" | "running" | "done"
  messagesCount: number
  icon: string
  x: number
  y: number
}

const DEFAULT_NODES: SwarmNode[] = [
  {
    id: "orchestrator",
    name: "Tiancode Orchestrator",
    role: "Planificación, descomposición de tareas y consenso",
    color: "#38bdf8",
    status: "running",
    messagesCount: 42,
    icon: "🧠",
    x: 250,
    y: 140,
  },
  {
    id: "devsecops",
    name: "DevSecOps Auditor",
    role: "Auditoría de seguridad, CVEs y fuga de secretos",
    color: "#ef4444",
    status: "idle",
    messagesCount: 12,
    icon: "🛡️",
    x: 70,
    y: 50,
  },
  {
    id: "ui_master",
    name: "UI/UX & CSS Master",
    role: "Diseño visual, Tailwind, componentes y accesibilidad",
    color: "#ec4899",
    status: "running",
    messagesCount: 28,
    icon: "🎨",
    x: 430,
    y: 50,
  },
  {
    id: "db_architect",
    name: "Database & SQL Architect",
    role: "Optimización de consultas, índices y migraciones",
    color: "#eab308",
    status: "idle",
    messagesCount: 8,
    icon: "🗄️",
    x: 70,
    y: 230,
  },
  {
    id: "qa_tester",
    name: "QA & E2E Tester",
    role: "Pruebas unitarias, integración y Playwright E2E",
    color: "#10b981",
    status: "done",
    messagesCount: 19,
    icon: "🧪",
    x: 430,
    y: 230,
  },
]

export const AgentSwarmGraph: Component<{
  onSelectAgent?: (id: string) => void
  class?: string
}> = (props) => {
  const [nodes, setNodes] = createSignal<SwarmNode[]>(DEFAULT_NODES)
  const [selectedNode, setSelectedNode] = createSignal<SwarmNode>(DEFAULT_NODES[0])

  const orchestrator = () => nodes().find((n) => n.id === "orchestrator") || nodes()[0]
  const subagents = () => nodes().filter((n) => n.id !== "orchestrator")

  return (
    <div class={`agent-swarm-graph-card rounded-xl border border-white/10 bg-slate-900/60 p-4 ${props.class ?? ""}`}>
      <div class="flex items-center justify-between mb-3">
        <div class="flex items-center gap-2">
          <span class="text-base font-semibold text-white">Grafo de Enjambre Multi-Agente (Swarm Graph)</span>
          <span class="rounded-full bg-blue-500/20 px-2 py-0.5 text-xs font-medium text-blue-400 border border-blue-500/30">
            5 Agentes Conectados
          </span>
        </div>
        <span class="text-xs text-slate-400">Flujo de consenso y auto-paralelización en tiempo real</span>
      </div>

      <div class="relative w-full h-72 bg-slate-950/80 rounded-lg border border-white/5 overflow-hidden flex items-center justify-center">
        {/* SVG Canvas for dynamic links */}
        <svg class="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 500 280">
          <defs>
            <linearGradient id="link-grad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stop-color="#38bdf8" stop-opacity="0.8" />
              <stop offset="100%" stop-color="#818cf8" stop-opacity="0.2" />
            </linearGradient>
            <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="3" result="blur" />
              <feComposite in="SourceGraphic" in2="blur" operator="over" />
            </filter>
          </defs>

          {/* Links from orchestrator to subagents */}
          <For each={subagents()}>
            {(sub) => {
              const ox = orchestrator().x
              const oy = orchestrator().y
              const sx = sub.x
              const sy = sub.y
              const mx = (ox + sx) / 2
              return (
                <g>
                  <path
                    d={`M ${ox} ${oy} Q ${mx} ${oy} ${sx} ${sy}`}
                    stroke={sub.color}
                    stroke-width="2"
                    stroke-dasharray={sub.status === "running" ? "6,4" : "none"}
                    stroke-opacity={sub.status === "running" ? "0.85" : "0.35"}
                    fill="none"
                  >
                    {sub.status === "running" && (
                      <animate
                        attributeName="stroke-dashoffset"
                        from="20"
                        to="0"
                        dur="1.2s"
                        repeatCount="indefinite"
                      />
                    )}
                  </path>
                </g>
              )
            }}
          </For>
        </svg>

        {/* Nodes interactive HTML layers */}
        <For each={nodes()}>
          {(node) => {
            const isSelected = () => selectedNode().id === node.id
            const isOrch = node.id === "orchestrator"
            return (
              <button
                type="button"
                class="absolute -translate-x-1/2 -translate-y-1/2 flex flex-col items-center group cursor-pointer transition-transform hover:scale-105"
                style={{ left: `${(node.x / 500) * 100}%`, top: `${(node.y / 280) * 100}%` }}
                onClick={() => {
                  setSelectedNode(node)
                  props.onSelectAgent?.(node.id)
                }}
              >
                <div
                  class={`relative flex items-center justify-center rounded-2xl border transition-all ${
                    isOrch ? "w-14 h-14 shadow-lg shadow-sky-500/20" : "w-11 h-11"
                  } ${
                    isSelected()
                      ? "border-sky-400 ring-2 ring-sky-400/40 bg-slate-800"
                      : "border-white/15 bg-slate-900/90"
                  }`}
                  style={{ "border-color": node.color }}
                >
                  <span class={isOrch ? "text-2xl" : "text-lg"}>{node.icon}</span>
                  <span
                    class={`absolute -bottom-1 -right-1 w-3.5 h-3.5 rounded-full border-2 border-slate-950 ${
                      node.status === "running"
                        ? "bg-emerald-400 animate-pulse"
                        : node.status === "done"
                        ? "bg-blue-400"
                        : "bg-slate-500"
                    }`}
                  />
                </div>
                <span class="mt-1 text-[11px] font-semibold text-slate-200 whitespace-nowrap bg-slate-950/80 px-1.5 py-0.5 rounded border border-white/5">
                  {node.name.split(" ")[0]}
                </span>
              </button>
            )
          }}
        </For>
      </div>

      {/* Selected Node Details Card */}
      <Show when={selectedNode()}>
        {(node) => (
          <div class="mt-3 flex items-center justify-between rounded-lg bg-slate-950/60 p-2.5 border border-white/10">
            <div class="flex items-center gap-2.5">
              <span class="text-xl">{node().icon}</span>
              <div>
                <div class="flex items-center gap-2">
                  <span class="text-sm font-semibold text-white">{node().name}</span>
                  <span
                    class="text-[10px] uppercase font-bold px-1.5 py-0.2 rounded"
                    style={{ "background-color": `${node().color}25`, color: node().color }}
                  >
                    {node().status === "running" ? "Activo" : node().status === "done" ? "Listo" : "Reposo"}
                  </span>
                </div>
                <p class="text-xs text-slate-400">{node().role}</p>
              </div>
            </div>
            <div class="flex items-center gap-2">
              <span class="text-xs text-slate-400">Mensajes: {node().messagesCount}</span>
            </div>
          </div>
        )}
      </Show>
    </div>
  )
}
