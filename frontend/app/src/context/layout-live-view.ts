// Older layouts can still contain the removed Dev tools tab. Normalize this
// small persisted leaf in place so opening an existing profile never leaves
// the Sandbox on a blank, obsolete surface.
export function normalizeLiveViewState(value: unknown) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return value
  const current = value as Record<string, unknown>
  const tab = current.tab === "code" ? "code" : "preview"
  const expanded = typeof current.expanded === "boolean" ? current.expanded : false
  if (current.tab === tab && current.expanded === expanded) return value
  return { ...current, tab, expanded }
}
