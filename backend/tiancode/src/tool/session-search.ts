import { Effect, Schema } from "effect"
import { Database } from "@tiancode-ai/core/database/database"
import { SessionTable, PartTable, MessageTable, SessionMessageTable } from "@tiancode-ai/core/session/sql"
import { InstanceState } from "@/effect/instance-state"
import { and, desc, eq, sql, or } from "drizzle-orm"
import type { SQL } from "drizzle-orm"
import { Tool } from "./tool"

export const Parameters = Schema.Struct({
  query: Schema.String.annotate({
    description: "Search query or keywords to find across past sessions, messages, and discussions",
  }),
  limit: Schema.optional(Schema.Number).annotate({
    description: "Maximum number of search results to return (default: 10, max: 50)",
  }),
  sessionID: Schema.optional(Schema.String).annotate({
    description: "Optional specific session ID to filter the search to a single session",
  }),
  scope: Schema.optional(Schema.Literals(["project", "global"])).annotate({
    description: "Search scope: 'project' (current project only) or 'global' (all sessions) (default: project)",
  }),
})

type Metadata = Record<string, unknown>

function extractSnippet(text: string, query: string, maxLength = 250): string {
  const clean = text.replace(/\s+/g, " ").trim()
  const lowerText = clean.toLowerCase()
  const lowerQuery = query.toLowerCase()
  const idx = lowerText.indexOf(lowerQuery)
  if (idx === -1) {
    if (clean.length <= maxLength) return clean
    return `${clean.slice(0, maxLength)}...`
  }
  const start = Math.max(0, idx - 80)
  const end = Math.min(clean.length, idx + query.length + 120)
  const prefix = start > 0 ? "..." : ""
  const suffix = end < clean.length ? "..." : ""
  return `${prefix}${clean.slice(start, end).trim()}${suffix}`
}

function extractPartText(data: unknown): { label: string; text: string } {
  if (!data || typeof data !== "object") {
    return { label: "message", text: String(data ?? "") }
  }
  const record = data as Record<string, unknown>
  if (record.type === "text" && typeof record.text === "string") {
    return { label: "text", text: record.text }
  }
  if (record.type === "reasoning" && typeof record.text === "string") {
    return { label: "reasoning", text: record.text }
  }
  if (record.type === "tool" && typeof record.tool === "string") {
    const state = record.state as Record<string, unknown> | undefined
    const title = typeof state?.title === "string" ? state.title : ""
    const output = typeof state?.output === "string" ? state.output : ""
    const input = state?.input ? JSON.stringify(state.input) : ""
    return {
      label: `tool:${record.tool}`,
      text: [title, output, input].filter(Boolean).join(" "),
    }
  }
  return { label: String(record.type ?? "part"), text: JSON.stringify(record) }
}

export const SessionSearchTool = Tool.define<typeof Parameters, Metadata, Database.Service>(
  "session_search",
  Effect.gen(function* () {
    const { db } = yield* Database.Service

    return {
      description:
        "Search through past messages and sessions in SQLite using text matching / keyword search. Use this tool to recall past solutions, debug discussions, architectural decisions, and error resolutions across previous agent turns and sessions.",
      parameters: Parameters,
      execute: (params: Schema.Schema.Type<typeof Parameters>, ctx: Tool.Context<Metadata>) =>
        Effect.gen(function* () {
          const rawQuery = params.query.trim()
          if (!rawQuery) {
            return {
              title: "Session search",
              output: "Error: Search query cannot be empty.",
              metadata: { count: 0 },
            }
          }

          const maxResults = Math.min(Math.max(params.limit ?? 10, 1), 50)
          const instCtx = yield* InstanceState.context.pipe(Effect.catch(() => Effect.succeed(undefined)))
          const filterProject = params.scope !== "global" && instCtx?.project?.id

          // 1. Search matching session titles
          const sessionConditions: SQL[] = []
          if (filterProject) {
            sessionConditions.push(sql`${SessionTable.project_id} = ${instCtx.project.id}`)
          }
          if (params.sessionID) {
            sessionConditions.push(sql`${SessionTable.id} = ${params.sessionID}`)
          }
          sessionConditions.push(sql`${SessionTable.title} LIKE ${`%${rawQuery}%`}`)

          const matchingSessions = yield* db
            .select({
              id: SessionTable.id,
              title: SessionTable.title,
              directory: SessionTable.directory,
              projectID: SessionTable.project_id,
              timeUpdated: SessionTable.time_updated,
            })
            .from(SessionTable)
            .where(and(...sessionConditions))
            .orderBy(desc(SessionTable.time_updated))
            .limit(maxResults)
            .all()
            .pipe(Effect.orDie)

          // 2. Search parts in PartTable
          const partConditions: SQL[] = []
          if (filterProject) {
            partConditions.push(sql`${SessionTable.project_id} = ${instCtx.project.id}`)
          }
          if (params.sessionID) {
            partConditions.push(sql`${PartTable.session_id} = ${params.sessionID}`)
          }

          const terms = rawQuery.split(/\s+/).filter((t) => t.length > 0)
          const phraseCondition = sql`${PartTable.data} LIKE ${`%${rawQuery}%`}`
          const termConditions = terms.map((term) => sql`${PartTable.data} LIKE ${`%${term}%`}`)
          partConditions.push(or(phraseCondition, and(...termConditions))!)

          const matchingParts = yield* db
            .select({
              partID: PartTable.id,
              messageID: PartTable.message_id,
              sessionID: PartTable.session_id,
              timeCreated: PartTable.time_created,
              partData: PartTable.data,
              sessionTitle: SessionTable.title,
              sessionDirectory: SessionTable.directory,
              sessionProjectID: SessionTable.project_id,
              messageData: MessageTable.data,
            })
            .from(PartTable)
            .innerJoin(SessionTable, eq(PartTable.session_id, SessionTable.id))
            .innerJoin(MessageTable, eq(PartTable.message_id, MessageTable.id))
            .where(and(...partConditions))
            .orderBy(desc(PartTable.time_created))
            .limit(maxResults)
            .all()
            .pipe(Effect.orDie)

          // 3. Search V2 session messages in SessionMessageTable
          const v2Conditions: SQL[] = []
          if (filterProject) {
            v2Conditions.push(sql`${SessionTable.project_id} = ${instCtx.project.id}`)
          }
          if (params.sessionID) {
            v2Conditions.push(sql`${SessionMessageTable.session_id} = ${params.sessionID}`)
          }
          const v2Phrase = sql`${SessionMessageTable.data} LIKE ${`%${rawQuery}%`}`
          const v2Terms = terms.map((term) => sql`${SessionMessageTable.data} LIKE ${`%${term}%`}`)
          v2Conditions.push(or(v2Phrase, and(...v2Terms))!)

          const matchingV2Messages = yield* db
            .select({
              messageID: SessionMessageTable.id,
              sessionID: SessionMessageTable.session_id,
              type: SessionMessageTable.type,
              timeCreated: SessionMessageTable.time_created,
              data: SessionMessageTable.data,
              sessionTitle: SessionTable.title,
              sessionDirectory: SessionTable.directory,
              sessionProjectID: SessionTable.project_id,
            })
            .from(SessionMessageTable)
            .innerJoin(SessionTable, eq(SessionMessageTable.session_id, SessionTable.id))
            .where(and(...v2Conditions))
            .orderBy(desc(SessionMessageTable.time_created))
            .limit(maxResults)
            .all()
            .pipe(Effect.orDie)

          // Aggregate and group results by session
          type ResultEntry = {
            sessionID: string
            title: string
            directory: string
            snippets: Array<{ role: string; text: string }>
          }
          const sessionMap = new Map<string, ResultEntry>()

          for (const s of matchingSessions) {
            if (!sessionMap.has(s.id)) {
              sessionMap.set(s.id, {
                sessionID: s.id,
                title: s.title,
                directory: s.directory,
                snippets: [{ role: "title", text: `Session title: ${s.title}` }],
              })
            }
          }

          for (const p of matchingParts) {
            const entry = sessionMap.get(p.sessionID) ?? {
              sessionID: p.sessionID,
              title: p.sessionTitle,
              directory: p.sessionDirectory,
              snippets: [],
            }
            const { label, text } = extractPartText(p.partData)
            const role =
              typeof p.messageData === "object" && p.messageData && "role" in p.messageData
                ? String((p.messageData as Record<string, unknown>).role)
                : label
            const snippet = extractSnippet(text, rawQuery)
            entry.snippets.push({ role: `${role} (${label})`, text: snippet })
            sessionMap.set(p.sessionID, entry)
          }

          for (const v2 of matchingV2Messages) {
            const entry = sessionMap.get(v2.sessionID) ?? {
              sessionID: v2.sessionID,
              title: v2.sessionTitle,
              directory: v2.sessionDirectory,
              snippets: [],
            }
            const dataStr = typeof v2.data === "string" ? v2.data : JSON.stringify(v2.data)
            const snippet = extractSnippet(dataStr, rawQuery)
            entry.snippets.push({ role: v2.type, text: snippet })
            sessionMap.set(v2.sessionID, entry)
          }

          const results = Array.from(sessionMap.values()).slice(0, maxResults)

          if (results.length === 0) {
            return {
              title: `Session search: "${rawQuery}" (0 results)`,
              output: `No past messages or sessions found matching "${rawQuery}". Try using different keywords or setting scope to 'global'.`,
              metadata: { query: rawQuery, resultsCount: 0 },
            }
          }

          const outputSections: string[] = [
            `## Session Search Results for: "${rawQuery}"`,
            `Found matches across ${results.length} session${results.length === 1 ? "" : "s"}:\n`,
          ]

          for (const item of results) {
            outputSections.push(`### Session: ${item.title} (\`${item.sessionID}\`)`)
            outputSections.push(`- Directory: \`${item.directory}\``)
            outputSections.push("- Matches:")
            for (const s of item.snippets.slice(0, 5)) {
              outputSections.push(`  - **[${s.role}]** ${s.text}`)
            }
            outputSections.push("")
          }

          return {
            title: `Session search: "${rawQuery}" (${results.length} sessions)`,
            output: outputSections.join("\n"),
            metadata: {
              query: rawQuery,
              resultsCount: results.length,
            },
          }
        }).pipe(Effect.orDie),
    }
  }),
)
