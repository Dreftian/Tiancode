import { type Component, createSignal, For, Show } from "solid-js"
import { ButtonV2 } from "@tiancode-ai/ui/v2/button-v2"
import { TextInputV2 } from "@tiancode-ai/ui/v2/text-input-v2"

export type CodeGraphNode = {
  id: string
  name: string
  type: "file" | "class" | "function" | "hook" | "type"
  path: string
  lines: number
  importsCount: number
  exportsCount: number
  color: string
  x: number
  y: number
}

const SAMPLE_NODES: CodeGraphNode[] = [
  {
    id: "main_entry",
    name: "main.ts",
    type: "file",
    path: "frontend/desktop/src/main/index.ts",
    lines: 480,
    importsCount: 14,
    exportsCount: 6,
    color: "#38bdf8",
    x: 250,
    y: 130,
  },
  {
    id: "session_runner",
    name: "SessionRunner",
    type: "class",
    path: "backend/tiancode/src/session/runner.ts",
    lines: 720,
    importsCount: 22,
    exportsCount: 4,
    color: "#818cf8",
    x: 100,
    y: 60,
  },
  {
    id: "edit_tool",
    name: "EditTool",
    type: "function",
    path: "backend/tiancode/src/tool/edit.ts",
    lines: 740,
    importsCount: 18,
    exportsCount: 2,
    color: "#34d399",
    x: 400,
    y: 60,
  },
  {
    id: "ast_parser",
    name: "CodeGraphAST",
    type: "class",
    path: "packages/core/src/codegraph/ast.ts",
    lines: 390,
    importsCount: 11,
    exportsCount: 8,
    color: "#f59e0b",
    x: 100,
    y: 220,
  },
  {
    id: "models_hub",
    name: "ModelsHubV2",
    type: "hook",
    path: "frontend/app/src/components/settings-v2/models-hub.tsx",
    lines: 920,
    importsCount: 25,
    exportsCount: 1,
    color: "#ec4899",
    x: 400,
    y: 220,
  },
]

export const AstCodeGraphVisualizer: Component<{
  onSelectNode?: (node: CodeGraphNode) => void
  class?: string
}> = (props) => {
  const [nodes, setNodes] = createSignal<CodeGraphNode[]>(SAMPLE_NODES)
  const [search, setSearch] = createSignal("")
  const [selectedNode, setSelectedNode] = createSignal<CodeGraphNode>(SAMPLE_NODES[0])
  const [filterType, setFilterType] = createSignal<string>("all")

  const filteredNodes = () => {
    const q = search().toLowerCase().trim()
    const type = filterType()
    return nodes().filter((n) => {
      const matchQ = !q || n.name.toLowerCase().includes(q) || n.path.toLowerCase().includes(q)
      const matchT = type === "all" || n.type === type
      return matchQ && matchT
    })
  }

  const centerNode = () => nodes()[0]
  const otherNodes = () => nodes().slice(1)

  return (
    <div class={`ast-codegraph-card rounded-xl border border-white/10 bg-slate-950/70 p-4 overflow-hidden ${props.class ?? ""}`}>
      {/* Header */}
      <div class="flex flex-wrap items-center justify-between gap-3 mb-3">
        <div class="flex items-center gap-2 min-w-0">
          <span class="text-sm font-semibold text-white">AST CodeGraph Visualizer</span>
          <span class="rounded-full bg-emerald-500/20 px-2 py-0.5 text-[11px] font-medium text-emerald-400 border border-emerald-500/30">
            Símbolos Mapeados en Tiempo Real
          </span>
        </div>
        <div class="flex items-center gap-2 min-w-0 max-w-full">
          <div class="w-48 sm:w-56 max-w-full min-w-0">
            <TextInputV2
              type="text"
              size="small"
              appearance="base"
              class="!w-full max-w-full min-w-0"
              placeholder="Buscar símbolo o archivo..."
              value={search()}
              onInput={(e) => setSearch(e.currentTarget.value)}
            />
          </div>
        </div>
      </div>

      {/* Interactive Visual Graph Canvas */}
      <div class="relative w-full h-72 bg-slate-950/90 rounded-lg border border-white/5 overflow-hidden flex items-center justify-center">
        <svg class="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 500 280">
          <defs>
            <linearGradient id="edge-grad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stop-color="#38bdf8" stop-opacity="0.7" />
              <stop offset="100%" stop-color="#818cf8" stop-opacity="0.3" />
            </linearGradient>
          </defs>

          {/* Connectors */}
          <For each={otherNodes()}>
            {(node) => (
              <g>
                <line
                  x1={centerNode().x}
                  y1={centerNode().y}
                  x2={node.x}
                  y2={node.y}
                  stroke="url(#edge-grad)"
                  stroke-width="1.8"
                  stroke-dasharray="4,4"
                  stroke-opacity="0.6"
                />
              </g>
            )}
          </For>
        </svg>

        {/* Nodes */}
        <For each={filteredNodes()}>
          {(node) => {
            const isSelected = () => selectedNode().id === node.id
            return (
              <button
                type="button"
                class="absolute -translate-x-1/2 -translate-y-1/2 flex flex-col items-center group cursor-pointer transition-transform hover:scale-105"
                style={{ left: `${(node.x / 500) * 100}%`, top: `${(node.y / 280) * 100}%` }}
                onClick={() => {
                  setSelectedNode(node)
                  props.onSelectNode?.(node)
                }}
              >
                <div
                  class={`flex items-center justify-center px-3 py-1.5 rounded-lg border text-xs font-semibold shadow-lg transition-all ${
                    isSelected()
                      ? "ring-2 ring-sky-400 bg-slate-800 text-white"
                      : "bg-slate-900/90 text-slate-200"
                  }`}
                  style={{ "border-color": node.color }}
                >
                  <span class="mr-1.5 text-[10px] uppercase font-bold text-slate-400">{node.type}</span>
                  <span>{node.name}</span>
                </div>
                <span class="mt-1 text-[10px] text-slate-400 bg-slate-950/80 px-1.5 py-0.2 rounded border border-white/5">
                  {node.lines} líneas · {node.importsCount} deps
                </span>
              </button>
            )
          }}
        </For>
      </div>

      {/* Selected Node Details Card */}
      <Show when={selectedNode()}>
        {(node) => (
          <div class="mt-3 flex items-center justify-between rounded-lg bg-slate-950/80 p-3 border border-white/10">
            <div class="min-w-0 flex-1">
              <div class="flex items-center gap-2 mb-0.5">
                <span class="text-xs font-semibold text-white">{node().name}</span>
                <span
                  class="text-[10px] uppercase font-bold px-1.5 py-0.2 rounded"
                  style={{ "background-color": `${node().color}25`, color: node().color }}
                >
                  {node().type}
                </span>
              </div>
              <p class="text-[11px] text-slate-400 font-mono truncate">{node().path}</p>
            </div>
            <div class="flex items-center gap-3 text-xs text-slate-300">
              <span><strong>{node().importsCount}</strong> importaciones</span>
              <span><strong>{node().exportsCount}</strong> exportaciones</span>
              <ButtonV2
                type="button"
                variant="outline"
                size="small"
                onClick={() => props.onSelectNode?.(node())}
              >
                Ver Código ↗
              </ButtonV2>
            </div>
          </div>
        )}
      </Show>
    </div>
  )
}
