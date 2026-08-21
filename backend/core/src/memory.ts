export * as Memory from "./memory"

import { makeLocationNode } from "./effect/app-node"
import { Context, Effect, Layer } from "effect"
import { Location } from "./location"
import { Global } from "./global"
import { FSUtil } from "./fs-util"
import path from "path"

export const USER_MAX_CHARS = 4_000
export const PROJECT_MAX_CHARS = 6_000

export type MemoryCategory = "preference" | "convention" | "architecture" | "quirk" | "general"

export interface Interface {
  readonly userPath: () => string
  readonly projectPath: () => string
  readonly readUser: () => Effect.Effect<string>
  readonly readProject: () => Effect.Effect<string>
  readonly saveUser: (entry: string, category?: MemoryCategory) => Effect.Effect<void>
  readonly saveProject: (entry: string, category?: MemoryCategory) => Effect.Effect<void>
  readonly recall: (query?: string) => Effect.Effect<{ user: string; project: string; matching: string[] }>
  readonly format: () => Effect.Effect<string | undefined>
}

export class Service extends Context.Service<Service, Interface>()("@tiancode/Memory") {}

function trimContent(content: string, maxChars: number): string {
  if (content.length <= maxChars) return content
  const lines = content.split("\n")
  const header = lines.slice(0, 3).join("\n")
  const remaining = lines.slice(3)
  const kept: string[] = []
  let currentLen = header.length + 1

  for (let i = remaining.length - 1; i >= 0; i--) {
    const line = remaining[i]
    if (currentLen + line.length + 1 > maxChars) break
    kept.unshift(line)
    currentLen += line.length + 1
  }

  return [header, "<!-- older entries compacted -->", ...kept].join("\n")
}

function appendEntry(existing: string, entry: string, category: MemoryCategory = "general", title: string): string {
  const cleanEntry = entry.trim()
  if (!cleanEntry) return existing

  const now = new Date().toISOString().split("T")[0]
  const formattedEntry = `- [${now}] ${cleanEntry}`

  if (!existing || existing.trim().length === 0) {
    return [
      `# ${title}`,
      "",
      `## ${category.toUpperCase()}`,
      formattedEntry,
      "",
    ].join("\n")
  }

  const categoryHeader = `## ${category.toUpperCase()}`
  if (existing.includes(categoryHeader)) {
    const parts = existing.split(categoryHeader)
    const before = parts[0]
    const after = parts.slice(1).join(categoryHeader)
    return `${before}${categoryHeader}\n${formattedEntry}${after.startsWith("\n") ? "" : "\n"}${after}`
  }

  return `${existing.trim()}\n\n${categoryHeader}\n${formattedEntry}\n`
}

function filterByQuery(text: string, query?: string): string[] {
  if (!query || !query.trim()) return []
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean)
  const lines = text.split("\n")
  return lines.filter((line) => {
    const lower = line.toLowerCase()
    return terms.some((term) => lower.includes(term))
  })
}

const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const location = yield* Location.Service
    const global = yield* Global.Service
    const fsys = yield* FSUtil.Service

    const userMemoryPath = path.join(global.config, "USER.md")
    const projectMemoryPath = path.join(location.project.directory, ".tiancode", "MEMORY.md")

    const userPath = () => userMemoryPath
    const projectPath = () => projectMemoryPath

    const readUser = Effect.fn("Memory.readUser")(function* () {
      const exists = yield* fsys.existsSafe(userMemoryPath)
      if (!exists) return ""
      const content = yield* fsys.readFileStringSafe(userMemoryPath).pipe(Effect.orDie)
      return content ?? ""
    })

    const readProject = Effect.fn("Memory.readProject")(function* () {
      const exists = yield* fsys.existsSafe(projectMemoryPath)
      if (!exists) return ""
      const content = yield* fsys.readFileStringSafe(projectMemoryPath).pipe(Effect.orDie)
      return content ?? ""
    })

    const saveUser = Effect.fn("Memory.saveUser")(function* (entry: string, category?: MemoryCategory) {
      const current = yield* readUser()
      const updated = appendEntry(current, entry, category, "User Preferences & Profile")
      const trimmed = trimContent(updated, USER_MAX_CHARS)
      yield* fsys.writeWithDirs(userMemoryPath, trimmed).pipe(Effect.orDie)
    })

    const saveProject = Effect.fn("Memory.saveProject")(function* (entry: string, category?: MemoryCategory) {
      const current = yield* readProject()
      const updated = appendEntry(current, entry, category, "Project Memory & Learnings")
      const trimmed = trimContent(updated, PROJECT_MAX_CHARS)
      yield* fsys.writeWithDirs(projectMemoryPath, trimmed).pipe(Effect.orDie)
    })

    const recall = Effect.fn("Memory.recall")(function* (query?: string) {
      const user = yield* readUser()
      const project = yield* readProject()
      const matchingUser = filterByQuery(user, query)
      const matchingProject = filterByQuery(project, query)
      return {
        user,
        project,
        matching: [...matchingUser, ...matchingProject],
      }
    })

    const format = Effect.fn("Memory.format")(function* () {
      const user = yield* readUser()
      const project = yield* readProject()

      if (!user.trim() && !project.trim()) return undefined

      const parts: string[] = ["<long_term_memory>"]
      if (user.trim()) {
        parts.push("  <user_preferences>", ...user.trim().split("\n").map((line) => `    ${line}`), "  </user_preferences>")
      }
      if (project.trim()) {
        parts.push("  <project_memory>", ...project.trim().split("\n").map((line) => `    ${line}`), "  </project_memory>")
      }
      parts.push("</long_term_memory>")
      return parts.join("\n")
    })

    return Service.of({
      userPath,
      projectPath,
      readUser,
      readProject,
      saveUser,
      saveProject,
      recall,
      format,
    })
  }),
)

export const node = makeLocationNode({
  service: Service,
  layer: layer,
  deps: [Location.node, Global.node, FSUtil.node],
})
