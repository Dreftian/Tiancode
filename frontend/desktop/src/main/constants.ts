import { app } from "electron"

type Channel = "dev" | "beta" | "prod"
const raw = import.meta.env.TIANCODE_CHANNEL
export const CHANNEL: Channel = raw === "dev" || raw === "beta" || raw === "prod" ? raw : "prod"

export const UPDATER_ENABLED = true

// Nombres visibles por canal: dev y prod comparten la marca "Tiancode Codex"
// (el canal de desarrollo se renombró); beta conserva su etiqueta.
export const APP_NAMES: Record<Channel, string> = {
  dev: "Tiancode",
  beta: "Tiancode Beta",
  prod: "Tiancode",
}
