import { Component, createMemo, createSignal, For, Show, type Accessor } from "solid-js"
import { useLanguage } from "@/context/language"
import type { DelegationRoot, PanelAgent } from "@/components/settings-v2/sub-agents-logic"

/**
 * Delegation topology of the configured agents: primary agents as roots, the sub-agents they
 * can hand work to underneath.
 *
 * It used to render four invented agents with invented statuses ("Activo", "Completado") and
 * invented results ("0 vulnerabilidades detectadas") because it was always mounted without
 * props and fell through to its own placeholder data. Everything drawn here now comes from the
 * agent list the panel already has; there is deliberately no status, duration or result column,
 * because the settings panel has no way to know any of that.
 *
 * Styling lives in settings-v2/sub-agents.css so the tree reads as part of the panel it sits in
 * rather than a detached card, and so it follows the light/dark theme tokens instead of the
 * dark-only slate/white-alpha colours it used to hardcode.
 */

/**
 * How many roots are drawn before the "show all" button. Every markdown agent defaults to
 * `mode: "all"`, so it is both a root and a delegate: the real list is ~30 roots with ~27
 * children each. Fully expanded that is ~150 rows in a panel whose table above it paginates at
 * ten, so the tree starts collapsed and shows a first page of roots.
 */
const ROOT_PAGE_SIZE = 8

export const RlmHierarchyTree: Component<{
  roots: DelegationRoot[]
  onSelectNode?: (agentName: string) => void
}> = (props) => {
  const language = useLanguage()
  const [selected, setSelected] = createSignal<string | null>(null)
  // Expanded, not collapsed: a branch opens because the user asked for it.
  const [expanded, setExpanded] = createSignal<Record<string, boolean>>({})
  const [showAllRoots, setShowAllRoots] = createSignal(false)

  const isOpen = (name: string) => expanded()[name] === true
  const toggle = (name: string) => setExpanded((prev) => ({ ...prev, [name]: !(prev[name] === true) }))

  const visibleRoots = createMemo(() => (showAllRoots() ? props.roots : props.roots.slice(0, ROOT_PAGE_SIZE)))
  const hiddenRoots = createMemo(() => Math.max(0, props.roots.length - visibleRoots().length))

  const select = (agent: PanelAgent) => {
    setSelected(agent.name)
    props.onSelectNode?.(agent.name)
  }

  const noteFor = (root: DelegationRoot) => {
    if (root.reason === "denied") return language.t("settings.subAgents.hierarchy.noDelegation")
    if (root.reason === "disabled") return language.t("settings.subAgents.hierarchy.rootDisabled")
    return language.t("settings.subAgents.hierarchy.noDelegates")
  }

  // `open` is an accessor, never a boolean: <For> runs its mapper inside createRoot with no
  // listener, so a value read here would be read once and never again — the children hid but the
  // chevron never rotated and aria-expanded stayed frozen on whatever it was at first render.
  const row = (
    agent: PanelAgent,
    options: { depth: number; onToggle?: () => void; open?: Accessor<boolean>; count?: number },
  ) => (
    <div
      class="settings-v2-sub-agents-tree-row"
      data-selected={selected() === agent.name ? "" : undefined}
      data-disabled={agent.enabled ? undefined : ""}
      style={{ "margin-inline-start": `${options.depth * 20}px` }}
      onClick={() => select(agent)}
      role="button"
      tabindex="0"
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault()
          select(agent)
        }
      }}
    >
      <Show when={options.onToggle}>
        <button
          type="button"
          class="settings-v2-sub-agents-tree-toggle"
          aria-expanded={options.open?.() ? "true" : "false"}
          aria-label={language.t(
            options.open?.() ? "settings.subAgents.hierarchy.collapse" : "settings.subAgents.hierarchy.expand",
          )}
          onClick={(event) => {
            event.stopPropagation()
            options.onToggle?.()
          }}
        >
          <span data-open={options.open?.() ? "" : undefined}>›</span>
        </button>
      </Show>

      <div
        class="settings-v2-sub-agents-tree-avatar"
        style={{
          "background-color": `color-mix(in srgb, ${agent.color} 18%, transparent)`,
          "border-color": `color-mix(in srgb, ${agent.color} 40%, transparent)`,
        }}
      >
        {agent.icon}
      </div>

      <div class="settings-v2-sub-agents-tree-copy">
        <div class="settings-v2-sub-agents-tree-headline">
          <span class="settings-v2-sub-agents-tree-name">{agent.title}</span>
          <span class="settings-v2-sub-agents-tree-handle">@{agent.name}</span>
        </div>
        <Show when={agent.description}>
          <span class="settings-v2-sub-agents-tree-description">{agent.description}</span>
        </Show>
      </div>

      <div class="settings-v2-sub-agents-tree-meta">
        <Show when={options.count !== undefined}>
          <span class="settings-v2-chip text-[10px]" data-tone="muted">
            {language.t("settings.subAgents.hierarchy.delegates", { count: options.count ?? 0 })}
          </span>
        </Show>
        <span class="settings-v2-chip text-[10px]" data-tone={agent.enabled ? "accent" : "muted"}>
          {language.t(agent.enabled ? "settings.subAgents.status.active" : "settings.subAgents.status.inactive")}
        </span>
      </div>
    </div>
  )

  return (
    <div class="settings-v2-sub-agents-tree">
      <div class="settings-v2-sub-agents-tree-header">
        <span aria-hidden="true">🌳</span>
        <div class="settings-v2-sub-agents-tree-header-copy">
          <h3 class="settings-v2-section-title">{language.t("settings.subAgents.hierarchy.title")}</h3>
          <span class="settings-v2-sub-agents-tree-header-hint">
            {language.t("settings.subAgents.hierarchy.description")}
          </span>
        </div>
      </div>

      <Show
        when={props.roots.length > 0}
        fallback={<p class="settings-v2-sub-agents-tree-empty">{language.t("settings.subAgents.hierarchy.empty")}</p>}
      >
        <div class="settings-v2-sub-agents-tree-body">
          <For each={visibleRoots()}>
            {(root) => (
              <div class="settings-v2-sub-agents-tree-branch">
                {row(root.agent, {
                  depth: 0,
                  open: () => isOpen(root.agent.name),
                  onToggle: root.children.length > 0 ? () => toggle(root.agent.name) : undefined,
                  count: root.children.length,
                })}
                <Show
                  when={root.children.length > 0}
                  fallback={
                    <p class="settings-v2-sub-agents-tree-note" style={{ "margin-inline-start": "20px" }}>
                      {noteFor(root)}
                    </p>
                  }
                >
                  <Show when={isOpen(root.agent.name)}>
                    <For each={root.children}>{(child) => row(child, { depth: 1 })}</For>
                  </Show>
                </Show>
              </div>
            )}
          </For>

          <Show when={hiddenRoots() > 0 || showAllRoots()}>
            <button
              type="button"
              class="settings-v2-sub-agents-tree-more"
              onClick={() => setShowAllRoots((value) => !value)}
            >
              {showAllRoots()
                ? language.t("settings.subAgents.hierarchy.showLess")
                : language.t("settings.subAgents.hierarchy.showAll", { count: hiddenRoots() })}
            </button>
          </Show>
        </div>
      </Show>
    </div>
  )
}
