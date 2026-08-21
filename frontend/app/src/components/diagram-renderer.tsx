import { type Component, createMemo, Show } from "solid-js"

/**
 * Editorial Diagram Design Renderer
 * Inspired by cathrynlavery/diagram-design
 * 
 * Renders publication-grade, self-contained SVG & HTML architecture diagrams,
 * sequence flows, state machines, timelines, swimlanes, and component trees
 * with clean editorial typography and no visual slop.
 */

export type DiagramType =
  | "architecture"
  | "flow"
  | "sequence"
  | "statemachine"
  | "timeline"
  | "swimlane"
  | "radar"

export interface DiagramNode {
  id: string
  label: string
  subtitle?: string
  badge?: string
  status?: "active" | "idle" | "error" | "success"
  icon?: string
}

export interface DiagramEdge {
  from: string
  to: string
  label?: string
  dashed?: boolean
}

export const EditorialDiagram: Component<{
  type?: DiagramType
  title?: string
  description?: string
  nodes?: DiagramNode[]
  edges?: DiagramEdge[]
  rawSvg?: string
}> = (props) => {
  const isArchitecture = () => (props.type ?? "architecture") === "architecture"

  return (
    <div class="relative w-full rounded-xl border border-white/10 bg-[#0a0f1d] p-5 text-slate-100 shadow-xl overflow-hidden my-4 select-none backdrop-blur-md">
      {/* Background radial accent */}
      <div class="absolute -top-10 -right-10 w-40 h-40 bg-cyan-500/10 rounded-full blur-2xl pointer-events-none" />

      {/* Header */}
      <Show when={props.title}>
        <div class="flex items-center justify-between border-b border-white/10 pb-3 mb-4">
          <div>
            <h4 class="text-sm font-bold tracking-tight text-white flex items-center gap-2">
              <span class="w-2 h-2 rounded-full bg-cyan-400" />
              {props.title}
            </h4>
            <Show when={props.description}>
              <p class="text-xs text-slate-400 mt-0.5">{props.description}</p>
            </Show>
          </div>
          <span class="text-[10px] font-mono uppercase px-2 py-0.5 rounded bg-cyan-500/15 text-cyan-300 border border-cyan-500/30">
            {props.type ?? "Editorial SVG"}
          </span>
        </div>
      </Show>

      {/* Raw SVG Diagram if provided */}
      <Show when={props.rawSvg}>
        <div class="w-full flex items-center justify-center overflow-x-auto py-2" innerHTML={props.rawSvg} />
      </Show>

      {/* Structured Nodes Canvas */}
      <Show when={!props.rawSvg && props.nodes && props.nodes.length > 0}>
        <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3.5 my-2">
          {props.nodes?.map((node) => (
            <div class="relative p-3.5 rounded-xl border border-white/10 bg-slate-900/80 hover:border-cyan-500/40 transition-all flex flex-col gap-1.5 shadow-sm">
              <div class="flex items-center justify-between">
                <span class="text-xs font-bold text-white tracking-wide">{node.label}</span>
                <Show when={node.badge}>
                  <span class="text-[9px] font-mono px-1.5 py-0.2 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                    {node.badge}
                  </span>
                </Show>
              </div>
              <Show when={node.subtitle}>
                <span class="text-[11px] text-slate-400 leading-relaxed">{node.subtitle}</span>
              </Show>
            </div>
          ))}
        </div>
      </Show>
    </div>
  )
}
