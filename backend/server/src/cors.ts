import { Context } from "effect"

// Exact production origins the web app and marketing site are served from.
// Enumerated from the repo: frontend/web deploys to https://opencode.ai
// (config.mjs, SST production stage) and the server proxies the UI from
// https://app.opencode.ai (server/shared/ui.ts); the marketing site
// (tools/website) is hosted at https://tiancode.vercel.app. No tiancode.ai
// domain exists in the codebase, so the previous `*.tiancode.ai` wildcard
// matched nothing; only exact origins are allowed (no wildcards).
const allowedSiteOrigins = new Set(["https://opencode.ai", "https://app.opencode.ai", "https://tiancode.vercel.app"])

export type CorsOptions = { readonly cors?: ReadonlyArray<string> }

export const CorsConfig = Context.Reference<CorsOptions | undefined>("@tiancode/ServerCorsConfig", {
  defaultValue: () => undefined,
})

export function isAllowedCorsOrigin(input: string | undefined, opts?: CorsOptions) {
  if (!input) return true
  if (input.startsWith("http://localhost:")) return true
  if (input.startsWith("http://127.0.0.1:")) return true
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
