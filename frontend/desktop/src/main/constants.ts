import { app } from "electron"

type Channel = "dev" | "beta" | "prod"
const raw = import.meta.env.TIANCODE_CHANNEL
export const CHANNEL: Channel = raw === "dev" || raw === "beta" || raw === "prod" ? raw : "prod"

export const UPDATER_ENABLED = true

// Which build this is: "github" for the installer published on GitHub, "local" for the
// developer's own build in install/. The GitHub build uses a profile of its own so a fresh
// download never inherits sessions, provider keys or the finished-onboarding flag of a local
// install on the same machine.
type Distribution = "local" | "github"
const rawDistribution = import.meta.env.TIANCODE_DISTRIBUTION
export const DISTRIBUTION: Distribution = rawDistribution === "github" ? "github" : "local"

// Nombres visibles por canal: dev y prod comparten la marca "Tiancode Codex"
// (el canal de desarrollo se renombró); beta conserva su etiqueta.
export const APP_NAMES: Record<Channel, string> = {
  dev: "Tiancode",
  beta: "Tiancode Beta",
  prod: "Tiancode",
}
