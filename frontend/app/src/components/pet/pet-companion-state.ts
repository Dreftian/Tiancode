export type PetCompanionStatus = "ready" | "running" | "needs-input" | "blocked"

/**
 * Keep mascot announcements useful without mirroring a model response or a
 * reasoning trace into a tiny status bubble. This only affects mascot copy;
 * the full assistant message remains available in the transcript.
 */
export function compactPetText(input: string, limit = 96) {
  const normalized = input.replace(/\s+/g, " ").trim()
  if (!normalized || limit < 2) return normalized
  const firstSentence = normalized.match(/^.*?[.!?。！？](?:\s|$)/)?.[0]?.trim() ?? normalized
  const candidate = firstSentence.length < normalized.length ? firstSentence : normalized
  if (candidate.length <= limit) return candidate

  const clipped = candidate.slice(0, limit - 1).trimEnd()
  const boundary = clipped.lastIndexOf(" ")
  return `${(boundary > limit * 0.55 ? clipped.slice(0, boundary) : clipped).trimEnd()}…`
}

export function resolvePetCompanionStatus(input: {
  sessionStatus: { type: "idle" | "busy" | "retry" } | undefined
  pendingPermissions: ReadonlyArray<unknown> | undefined
}): PetCompanionStatus {
  if ((input.pendingPermissions?.length ?? 0) > 0) return "needs-input"
  if (input.sessionStatus?.type === "retry") return "blocked"
  if (input.sessionStatus?.type === "busy") return "running"
  return "ready"
}
