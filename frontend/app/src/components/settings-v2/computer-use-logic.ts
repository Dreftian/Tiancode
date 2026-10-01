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

/**
 * The browser rules as written: `permission.browser` may be one action for every site or a map
 * of patterns. The backend resolves with findLast, so the last matching rule wins.
 */
export function browserRules(rule: unknown): [string, PermissionAction][] {
  if (isAction(rule)) return [["*", rule]]
  if (typeof rule !== "object" || rule === null || Array.isArray(rule)) return []
  return Object.entries(rule).filter((entry): entry is [string, PermissionAction] => isAction(entry[1]))
}

/** The action that applies to `pattern` ("*" for the default), "allow" when nothing matches. */
export function effectiveBrowserAction(rules: [string, PermissionAction][], pattern: string): PermissionAction {
  const match = rules.findLast(([key]) => key === "*" || key === pattern)
  return match?.[1] ?? "allow"
}

/** Sites with a rule of their own that differs from the default: the exceptions worth listing. */
export function browserExceptions(rules: [string, PermissionAction][]) {
  const fallback = effectiveBrowserAction(rules.filter(([key]) => key === "*"), "*")
  const sites = [...new Set(rules.map(([key]) => key).filter((key) => key !== "*"))]
  return sites
    .map((site) => ({ site, action: effectiveBrowserAction(rules, site) }))
    .filter((item) => item.action !== fallback)
}
