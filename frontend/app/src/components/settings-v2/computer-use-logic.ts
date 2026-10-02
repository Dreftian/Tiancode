export type PermissionAction = "ask" | "allow" | "deny"

export const isAction = (value: unknown): value is PermissionAction =>
  value === "ask" || value === "allow" || value === "deny"

/**
 * The origin the backend matches when the agent asks to drive a page (tool/preview.ts). A bare
 * local host is read as http, since a dev server on localhost or 127.0.0.1 rarely speaks https.
 */
export function toOrigin(raw: string): string | undefined {
  const value = raw.trim()
  if (!value) return undefined
  const local = /^(localhost|127\.0\.0\.1|\[::1\]|0\.0\.0\.0)(:\d+)?(\/|$)/i.test(value)
  const candidate = /^[a-z][a-z0-9+.-]*:\/\//i.test(value) ? value : `${local ? "http" : "https"}://${value}`
  if (!URL.canParse(candidate)) return undefined
  const url = new URL(candidate)
  if (url.origin === "null" || !url.hostname) return undefined
  return url.origin
}

/**
 * An executable name as the desktop main compares it: the last path segment in lower case.
 * An extension is required because Windows always reports one; without it the entry would never
 * match and would block nothing.
 */
export function toExecutable(raw: string): string | undefined {
  const parts = raw.trim().toLowerCase().split(/[\\/]/)
  const name = parts[parts.length - 1] ?? ""
  if (!/^[^\s].*\.[a-z0-9]{1,8}$/.test(name)) return undefined
  return name
}

export type PermissionRule = { key: string; pattern: string; action: PermissionAction }

const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

/**
 * The permission config as the backend reads it, in order: a single action ("allow") is the `*`
 * rule for every key, and a key holds one action or a map of patterns.
 */
export function permissionRules(permission: unknown): PermissionRule[] {
  if (isAction(permission)) return [{ key: "*", pattern: "*", action: permission }]
  if (!record(permission)) return []
  return Object.entries(permission).flatMap(([key, value]): PermissionRule[] => {
    if (isAction(value)) return [{ key, pattern: "*", action: value }]
    if (!record(value)) return []
    return Object.entries(value).flatMap(([pattern, action]) => (isAction(action) ? [{ key, pattern, action }] : []))
  })
}

/** What applies to `key` on `pattern`: the last matching rule wins, as on the backend (findLast). */
export function resolveRule(rules: PermissionRule[], key: string, pattern = "*"): PermissionAction | undefined {
  return rules.findLast(
    (rule) => (rule.key === key || rule.key === "*") && (rule.pattern === "*" || rule.pattern === pattern),
  )?.action
}

/** Browser sites whose rule differs from the default ("allow" when nothing is written). */
export function browserExceptions(rules: PermissionRule[]) {
  const fallback = resolveRule(rules, "browser") ?? "allow"
  const sites = [
    ...new Set(rules.filter((rule) => rule.key === "browser" && rule.pattern !== "*").map((rule) => rule.pattern)),
  ]
  return sites
    .map((site) => ({ site, action: resolveRule(rules, "browser", site) ?? fallback }))
    .filter((item) => item.action !== fallback)
}
