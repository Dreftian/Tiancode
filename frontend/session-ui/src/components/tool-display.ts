type Translate = (key: string, params?: Record<string, string | number>) => string

export type ToolDisplay = {
  title: string
  subtitle?: string
  // A tool this file names; unknown ones (MCP, plugins) also list their arguments.
  known: boolean
}

const COMPUTER_ACTIONS: Record<string, string> = {
  move: "ui.toolName.computer.move",
  click: "ui.toolName.computer.click",
  type: "ui.toolName.computer.type",
  key: "ui.toolName.computer.key",
  scroll: "ui.toolName.computer.scroll",
  cursor_position: "ui.toolName.computer.cursor",
  foreground_window: "ui.toolName.computer.window",
}

const INTERACT_ACTIONS: Record<string, string> = {
  click: "ui.toolName.previewInteract.click",
  fill: "ui.toolName.previewInteract.fill",
  select: "ui.toolName.previewInteract.select",
  press: "ui.toolName.previewInteract.press",
  scroll: "ui.toolName.previewInteract.scroll",
  navigate: "ui.toolName.previewInteract.navigate",
}

const SIMPLE: Record<string, string> = {
  // Tools with their own renderer, named the same way where only a label fits (activity lists).
  read: "ui.tool.read",
  list: "ui.tool.list",
  glob: "ui.tool.glob",
  grep: "ui.tool.grep",
  webfetch: "ui.tool.webfetch",
  websearch: "ui.tool.websearch",
  bash: "ui.tool.shell",
  shell: "ui.tool.shell",
  edit: "ui.messagePart.title.edit",
  write: "ui.messagePart.title.write",
  patch: "ui.tool.patch",
  apply_patch: "ui.tool.patch",
  todowrite: "ui.tool.todos",
  question: "ui.tool.questions",
  task: "ui.tool.task",
  skill: "ui.tool.skill",
  preview_start: "ui.toolName.previewStart",
  preview_restart: "ui.toolName.previewRestart",
  preview_stop: "ui.toolName.previewStop",
  preview_status: "ui.toolName.previewStatus",
  preview_logs: "ui.toolName.previewLogs",
  screenshot: "ui.toolName.screenshot",
  plan_exit: "ui.toolName.planExit",
  execute: "ui.toolName.execute",
}

/**
 * A readable title for tools without a renderer of their own (the Sandbox preview tools, computer
 * use, memory, MCP and plugin tools) instead of their raw identifier. Typed text is never shown:
 * `fill` and `type` may carry passwords.
 */
export function toolDisplay(tool: string, input: Record<string, unknown> | undefined, t: Translate): ToolDisplay {
  const text = (key: string) => {
    const value = input?.[key]
    return typeof value === "string" && value.trim() ? value.trim() : undefined
  }
  const action = text("action")
  const simple = SIMPLE[tool]
  if (simple) return { title: t(simple), known: true }
  if (tool === "preview_inspect")
    return {
      title: t("ui.toolName.previewInspect"),
      subtitle: text("target") ?? (text("surface") === "browser" ? t("ui.toolName.surface.browser") : undefined),
      known: true,
    }
  if (tool === "preview_interact")
    return {
      title: t(INTERACT_ACTIONS[action ?? ""] ?? "ui.toolName.previewInteract"),
      subtitle: action === "navigate" ? text("url") : action === "press" ? text("key") : action === "scroll" ? text("direction") : text("target"),
      known: true,
    }
  if (tool === "computer")
    return {
      title: t(COMPUTER_ACTIONS[action ?? ""] ?? "ui.toolName.computer"),
      subtitle: action === "key" ? text("keys") : undefined,
      known: true,
    }
  if (tool === "clipboard")
    return { title: t(action === "write" ? "ui.toolName.clipboardWrite" : "ui.toolName.clipboardRead"), known: true }
  if (tool === "memory")
    return {
      title: t(action === "save" ? "ui.toolName.memorySave" : "ui.toolName.memoryRecall"),
      subtitle: text("query"),
      known: true,
    }
  if (tool === "codegraph") return { title: t("ui.toolName.codegraph"), subtitle: text("name") ?? text("file"), known: true }
  if (tool === "skill_create") return { title: t("ui.toolName.skillCreate"), subtitle: text("name"), known: true }
  if (tool === "session_search") return { title: t("ui.toolName.sessionSearch"), subtitle: text("query"), known: true }
  if (tool === "delete") return { title: t("ui.toolName.delete"), subtitle: text("path"), known: true }
  if (tool === "lsp") return { title: t("ui.toolName.lsp"), subtitle: text("operation"), known: true }
  return { title: humanize(tool), known: false }
}

// "github_create_issue" → "Github create issue".
function humanize(tool: string) {
  const words = tool.replace(/[_-]+/g, " ").trim()
  return words ? words[0]!.toUpperCase() + words.slice(1) : tool
}
