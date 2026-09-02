import { Context } from "effect"
import { Flag } from "@tiancode-ai/core/flag/flag"

// Exact production origins the web app and marketing site are served from.
// frontend/web deploys to https://tiancode.vercel.app (and https://tiancode.ai)
// and the server proxies the UI from https://app.opencode.ai
// (server/shared/ui.ts). Only exact origins are allowed (no wildcards).
const allowedSiteOrigins = new Set([
  "https://tiancode.vercel.app",
  "https://tiancode.ai",
  "https://app.tiancode.ai",
])

export type CorsOptions = { readonly cors?: ReadonlyArray<string> }

export const CorsConfig = Context.Reference<CorsOptions | undefined>("@tiancode/ServerCorsConfig", {
  defaultValue: () => undefined,
})

export function isAllowedCorsOrigin(input: string | undefined, opts?: CorsOptions) {
  if (!input) return true
  if (input.startsWith("http://localhost:") || input.startsWith("http://127.0.0.1:")) {
    // Cualquier página servida desde un puerto local (un dev server del
    // proyecto, o una web maliciosa con servidor propio en localhost) comparte
    // este prefijo: solo se admiten orígenes loopback cuando el servidor está
    // autenticado con password. Sin password, el flujo local es same-origin
    // (el UI embebido lo sirve el propio servidor) o requiere listar el
    // origen en server.cors.
    return Flag.TIANCODE_SERVER_PASSWORD !== undefined
  }
  if (input.startsWith("oc://renderer")) return true
  if (input === "tauri://localhost" || input === "http://tauri.localhost" || input === "https://tauri.localhost")
    return true
  if (allowedSiteOrigins.has(input)) return true
  return opts?.cors?.includes(input) ?? false
}

export function isAllowedRequestOrigin(input: string | undefined, host: string | undefined, opts?: CorsOptions) {
  if (!input) return true
  if (host && sameHost(input, host)) return true
  return isAllowedCorsOrigin(input, opts)
}

function sameHost(origin: string, host: string) {
  try {
    return new URL(origin).host === host
  } catch {
    return false
  }
}
