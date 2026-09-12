/**
 * Reads the Settings → Intelligence switches from the server config and pushes them back.
 *
 * The renderer's own settings store is `localStorage`-only, so anything kept there can never
 * influence the agent: the system prompt builder, the bash tool, the session processor and
 * several tools all run server-side. These switches therefore live in the server config under
 * `experimental.intelligence`, where ConfigIntelligence reads them.
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
  outputDistiller: boolean
  toolCallRepair: boolean
  loopBreaker: boolean
  cleanWeb: boolean
  autoSkillLearn: boolean
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
 * Reads the switches the server currently has.
 *
 * The panel seeds its local store with this before it starts writing: the local defaults are
 * all-on, so a client that only ever PATCHed would re-enable everything the user had turned
 * off from another client or by hand in the config file.
 *
 * Returns undefined when there is no server, it cannot be reached, or it has no switch block
 * yet — all of which mean "keep what you have" rather than "everything is off".
 */
export async function loadIntelligenceConfig(
  server: ServerHttp | undefined,
  signal?: AbortSignal,
): Promise<Partial<IntelligenceSwitches> | undefined> {
  if (!server?.url) return undefined
  const base = server.url.replace(/\/+$/, "")
  try {
    const response = await fetch(`${base}/global/config`, { headers: headersFor(server), signal })
    if (!response.ok) return undefined
    const config = (await response.json()) as { experimental?: { intelligence?: Partial<IntelligenceSwitches> } }
    return config.experimental?.intelligence
  } catch {
    return undefined
  }
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
