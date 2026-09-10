/**
 * Pushes the Settings → Intelligence switches into the server config.
 *
 * The renderer's own settings store is `localStorage`-only, so anything kept there can never
 * influence the agent: the system prompt builder and the bash tool run server-side. These
 * switches therefore live in the server config under `experimental.intelligence`, where
 * ConfigIntelligence.resolve() reads them.
 *
 * Written through a plain fetch rather than the generated SDK: the SDK's config type is
 * generated from the OpenAPI document and does not yet carry this field, and there is no
 * regeneration step wired into the repo.
 */
import { authTokenFromCredentials } from "@/utils/server"

export interface IntelligenceSwitches {
  userMemory: boolean
  projectMemory: boolean
  guardrails: boolean
  codeGraph: boolean
}

export interface ServerHttp {
  url?: string
  username?: string
  password?: string
}

function headersFor(server: ServerHttp): Record<string, string> {
  const headers: Record<string, string> = { "Content-Type": "application/json" }
  if (server.password) {
    headers["Authorization"] = `Basic ${authTokenFromCredentials({
      username: server.username,
      password: server.password,
    })}`
  }
  return headers
}

/**
 * Merges `switches` into the server's global config.
 *
 * Reads the current document first and writes it back whole: PATCH replaces the config, so
 * sending only our block would drop every other setting the user has.
 *
 * Returns true when the server accepted the update. Callers treat false as "not synced yet"
 * rather than an error — a missing or offline server must not block the toggle in the UI.
 */
export async function syncIntelligenceConfig(
  server: ServerHttp | undefined,
  switches: IntelligenceSwitches,
  signal?: AbortSignal,
): Promise<boolean> {
  if (!server?.url) return false
  const base = server.url.replace(/\/+$/, "")

  const headers = headersFor(server)
  try {
    const current = await fetch(`${base}/global/config`, { headers, signal })
    if (!current.ok) return false
    const config = (await current.json()) as Record<string, unknown>

    const experimental = (config.experimental ?? {}) as Record<string, unknown>
    const next = {
      ...config,
      experimental: { ...experimental, intelligence: { ...switches } },
    }

    const saved = await fetch(`${base}/global/config`, {
      method: "PATCH",
      headers,
      body: JSON.stringify(next),
      signal,
    })
    return saved.ok
  } catch {
    // Offline, no server, or aborted: the switch stays in local settings and syncs next time.
    return false
  }
}
