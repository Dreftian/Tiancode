import { Component, createMemo, createSignal, For, Show } from "solid-js"
import { Icon as IconV2 } from "@tiancode-ai/ui/v2/icon"
import { ButtonV2 } from "@tiancode-ai/ui/v2/button-v2"
import { useLanguage } from "@/context/language"
import { useServerSync } from "@/context/server-sync"

export type RlmAgentNode = {
  id: string
  name: string
  role?: string
  status: "idle" | "running" | "completed" | "error"
  level: number
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

  const defaultNodes: RlmAgentNode[] = [
    {
      id: "root-agent",
      name: "Tiancode Master RLM",
      role: "Orchestrator",
      status: "completed",
      level: 0,
      taskPrompt: "Objetivo Principal del Usuario",
      children: [
        {
          id: "sub-1",
          name: "Codebase Researcher",
          role: "Exploration Subagent",
          status: "completed",
          level: 1,
          taskPrompt: "Inspeccionar arquitectura de archivos y contratos de API",
          resultPreview: "Identificados 14 módulos y 2 endpoints críticos.",
          durationMs: 4200,
        },
        {
          id: "sub-2",
          name: "Test & Verification Agent",
          role: "Validation Subagent",
          status: "completed",
          level: 1,
          taskPrompt: "Ejecutar suites de pruebas y validar tipos en TypeScript",
          resultPreview: "0 errores de compilación y tests unitarios pasando.",
          durationMs: 6800,
        },
      ],
    },
  ]

  const treeNodes = createMemo(() => props.nodes ?? defaultNodes)

  const renderNode = (node: RlmAgentNode) => {
    const isSelected = () => selectedId() === node.id
    const indentPx = node.level * 24

    return (
      <div class="flex flex-col gap-1">
        <div
          class={`flex items-center justify-between p-3 rounded-lg border transition-all cursor-pointer ${
            isSelected()
              ? "border-v2-border-focus bg-v2-overlay-simple-overlay-hover shadow-sm"
              : "border-v2-border-base bg-v2-surface-elevation-1 hover:border-v2-border-hover"
          }`}
          style={{ "margin-left": `${indentPx}px` }}
          onClick={() => {
            setSelectedId(node.id)
            props.onSelectNode?.(node.id)
          }}
        >
          <div class="flex items-center gap-3">
            <span class="flex size-7 items-center justify-center rounded-md bg-purple-500/15 text-purple-400 font-bold text-xs font-mono">
              L{node.level}
            </span>
            <div class="flex flex-col">
              <div class="flex items-center gap-2">
                <span class="font-semibold text-13-medium text-text-strong">{node.name}</span>
                <Show when={node.role}>
                  <span class="text-[10px] uppercase tracking-wider text-text-weak px-1 py-0.5 rounded bg-v2-overlay-simple-overlay-active">
                    {node.role}
                  </span>
                </Show>
              </div>
              <Show when={node.taskPrompt}>
                <span class="text-11-regular text-text-weak line-clamp-1">{node.taskPrompt}</span>
              </Show>
            </div>
          </div>

          <div class="flex items-center gap-2">
            <span
              class={`text-xs px-2 py-0.5 rounded font-semibold uppercase ${
                node.status === "completed"
                  ? "bg-emerald-500/15 text-emerald-400"
                  : node.status === "running"
                  ? "bg-cyan-500/15 text-cyan-400 animate-pulse"
                  : node.status === "error"
                  ? "bg-red-500/15 text-red-400"
                  : "bg-zinc-500/15 text-zinc-400"
              }`}
            >
              {node.status}
            </span>
            <Show when={node.durationMs}>
              <span class="text-11-regular text-text-weak">{((node.durationMs ?? 0) / 1000).toFixed(1)}s</span>
            </Show>
          </div>
        </div>

        <Show when={node.children && node.children.length > 0}>
          <For each={node.children}>{(child) => renderNode(child)}</For>
        </Show>
      </div>
    )
  }

  return (
    <div class="flex flex-col gap-4 p-4 rounded-lg border border-v2-border-base bg-v2-surface-elevation-1">
      <div class="flex items-center justify-between border-b border-v2-border-base pb-3">
        <div class="flex items-center gap-2">
          <span class="text-base">🌳</span>
          <h3 class="text-14-medium text-text-strong">Árbol de Recursión RLM (Sub-Agentes)</h3>
        </div>
        <span class="text-11-regular text-text-weak">Jerarquía estilo Prime Agent</span>
      </div>

      <div class="flex flex-col gap-2">
        <For each={treeNodes()}>{(root) => renderNode(root)}</For>
      </div>
    </div>
  )
}
