export type PetCompanionStatus = "ready" | "running" | "needs-input" | "blocked"

export function resolvePetCompanionStatus(input: {
  sessionStatus: { type: "idle" | "busy" | "retry" } | undefined
  pendingPermissions: ReadonlyArray<unknown> | undefined
}): PetCompanionStatus {
  if ((input.pendingPermissions?.length ?? 0) > 0) return "needs-input"
  if (input.sessionStatus?.type === "retry") return "blocked"
  if (input.sessionStatus?.type === "busy") return "running"
  return "ready"
}
