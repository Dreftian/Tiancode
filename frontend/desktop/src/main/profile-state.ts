import type { Profile } from "./profile"

// The data folder chosen at startup (index.ts), read by Settings › General › Data over IPC.
let resolved: Profile | undefined

export function setResolvedProfile(profile: Profile) {
  resolved = profile
}

export function resolvedProfile() {
  return resolved
}
