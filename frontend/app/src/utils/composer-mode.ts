import { createSignal } from "solid-js"

export const COMPOSER_MODES = ["auto", "manual", "accept-edits", "plan", "skip"] as const
export type ComposerMode = (typeof COMPOSER_MODES)[number]
type Rule = { permission: string; pattern: string; action: "allow" | "ask" | "deny" }
type SavedMode = { mode: ComposerMode; baseline?: Rule[] }
const [revision, setRevision] = createSignal(0)

const key = (scope: string, directory: string, sessionID?: string) =>
  `tiancode.composer.mode:${encodeURIComponent(scope)}:${encodeURIComponent(directory)}:${sessionID ?? "draft"}`

export function getComposerMode(scope: string, directory: string, sessionID?: string): SavedMode | undefined {
  revision()
  const raw = localStorage.getItem(key(scope, directory, sessionID))
  if (!raw) return
  try {
    const value: unknown = JSON.parse(raw)
    if (!value || typeof value !== "object" || !("mode" in value)) return
    if (!COMPOSER_MODES.includes(value.mode as ComposerMode)) return
    const baseline =
      "baseline" in value && Array.isArray(value.baseline)
        ? value.baseline.filter(
            (item): item is Rule =>
              item &&
              typeof item.permission === "string" &&
              typeof item.pattern === "string" &&
              ["allow", "ask", "deny"].includes(item.action),
          )
        : undefined
    return { mode: value.mode as ComposerMode, baseline }
  } catch {
    return
  }
}

export function setComposerMode(scope: string, directory: string, sessionID: string | undefined, value: SavedMode) {
  localStorage.setItem(key(scope, directory, sessionID), JSON.stringify(value))
  setRevision((value) => value + 1)
}

export function composerPermissionRules(mode: ComposerMode, baseline: Rule[]): Rule[] {
  if (mode === "auto") return baseline
  const reads = ["read", "glob", "grep", "list", "webfetch", "websearch", "lsp", "todowrite", "skill"]
  const actions = mode === "plan" ? reads : mode === "accept-edits" ? [...reads, "edit"] : []
  return [
    ...baseline,
    { permission: "*", pattern: "*", action: mode === "skip" ? "allow" : mode === "plan" ? "deny" : "ask" },
    ...actions.map((permission): Rule => ({ permission, pattern: "*", action: "allow" })),
    // A convenience mode must never erase an explicit denial configured by the user.
    ...baseline.filter((rule) => rule.action === "deny"),
  ]
}

export async function applyComposerMode(input: {
  scope: string
  directory: string
  sessionID: string
  client: {
    session: {
      get: (input: { sessionID: string }) => Promise<{ data?: { permission?: Rule[] } }>
      update: (input: { sessionID: string; permission: Rule[] }) => Promise<unknown>
    }
  }
  mode?: ComposerMode
}) {
  const saved = getComposerMode(input.scope, input.directory, input.sessionID)
  const selected = input.mode ?? saved?.mode ?? getComposerMode(input.scope, input.directory)?.mode
  if (!selected) return
  // Once applied, leave later session-level "always" approvals intact on subsequent prompts.
  if (!input.mode && saved?.baseline) return
  const baseline =
    saved?.baseline ?? (await input.client.session.get({ sessionID: input.sessionID })).data?.permission ?? []
  await input.client.session.update({
    sessionID: input.sessionID,
    permission: composerPermissionRules(selected, baseline),
  })
  setComposerMode(input.scope, input.directory, input.sessionID, { mode: selected, baseline })
}
