import type { Message, Part, ToolPart } from "@tiancode-ai/sdk/v2/client"

/** Read only this session; streaming another chat must never redirect its preview. */
export function liveViewSessionTools(
  sessionID: string | undefined,
  messages: readonly Message[],
  parts: Record<string, Part[] | undefined>,
  limit = 40,
) {
  if (!sessionID || limit <= 0) return []
  const result: ToolPart[] = []
  for (let index = messages.length - 1; index >= 0; index--) {
    const message = messages[index]
    if (message.sessionID !== sessionID || message.role !== "assistant") continue
    const list = parts[message.id] ?? []
    for (let part = list.length - 1; part >= 0; part--) {
      const entry = list[part]
      if (entry.type !== "tool" || entry.sessionID !== sessionID) continue
      result.push(entry)
      if (result.length >= limit) return result.reverse()
    }
  }
  return result.reverse()
}

export function liveViewToolFiles(part: ToolPart) {
  if (!["write", "edit", "apply_patch"].includes(part.tool)) return []
  const input = part.state.input
  const metadata = part.state.status === "pending" ? undefined : part.state.metadata
  const files = Array.isArray(metadata?.files) ? metadata.files : []
  return [...new Set([
    input.filePath,
    input.path,
    metadata?.filepath,
    ...files.flatMap((file: unknown) => {
      if (!file || typeof file !== "object") return []
      const entry = file as Record<string, unknown>
      return [entry.movePath, entry.filePath, entry.relativePath]
    }),
  ].filter((path): path is string => typeof path === "string" && path.length > 0))]
}

export function liveViewToolDetail(part: ToolPart) {
  const input = part.state.input
  const file = liveViewToolFiles(part)[0]
  const value = file ?? input.url ?? input.target ?? input.action ?? input.description ?? input.command
  if (typeof value === "string") return value.replace(/\s+/g, " ").slice(0, 240)
  return part.state.status === "running" || part.state.status === "completed" ? part.state.title : undefined
}

/** File paths never replace the known workspace root with src/ or package.json. */
export function liveViewProjectFolder(path: string, directory?: string) {
  const base = directory?.replace(/\\/g, "/").replace(/\/+$/, "")
  const normalized = path.replace(/\\/g, "/").replace(/^file:\/\/\//, "").replace(/\/+$/, "")
  if (!normalized) return base
  if (base) {
    const windows = /^[a-z]:\//i.test(base)
    const current = windows ? normalized.toLowerCase() : normalized
    const root = windows ? base.toLowerCase() : base
    if (current === root || current.startsWith(`${root}/`)) return base
    if (!/^(?:[a-z]:\/|\/)/i.test(normalized)) return base
  }
  // An unrelated editor tab is not evidence that the session moved to another project.
  return base
}
