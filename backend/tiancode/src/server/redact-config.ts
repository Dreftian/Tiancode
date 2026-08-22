import type { ConfigV1 } from "@tiancode-ai/core/v1/config/config"
import type { ConfigMCPV1 } from "@tiancode-ai/core/v1/config/mcp"

// Valor con el que se sustituyen los secretos en las respuestas HTTP de
// configuración (GET /config y GET /global/config). El mismo placeholder en un
// update significa "conservar el valor existente", así el round-trip
// GET → editar → POST de los ajustes nunca sobrescribe una clave real.
export const REDACTED = "<redacted>"

// Claves cuyo valor es un secreto por nombre: apiKey, Authorization,
// VISION_API_KEY, clientSecret... Las que no casan (baseURL, config paths,
// LIVE_FRONTEND_CONFIG) siguen viéndose para poder editarlas.
const SENSITIVE_KEY = /(key|token|secret|password|passwd|auth|credential)/i

type Dict = Record<string, unknown>

const isDict = (value: unknown): value is Dict => typeof value === "object" && value !== null && !Array.isArray(value)

function redactMap(map: Dict): Dict {
  const out: Dict = {}
  for (const [key, value] of Object.entries(map)) {
    if (isDict(value) && key.toLowerCase() === "headers") out[key] = redactMap(value)
    else if (SENSITIVE_KEY.test(key) && typeof value === "string" && value) out[key] = REDACTED
    else out[key] = value
  }
  return out
}

function unredactMap(incoming: Dict, existing: Dict | undefined): Dict {
  const out: Dict = {}
  for (const [key, value] of Object.entries(incoming)) {
    const before = existing?.[key]
    if (isDict(value) && isDict(before) && key.toLowerCase() === "headers") out[key] = unredactMap(value, before)
    else if (value === REDACTED && before !== undefined) out[key] = before
    else out[key] = value
  }
  return out
}

function redactOAuth(oauth: unknown): unknown {
  if (!isDict(oauth)) return oauth
  const out: Dict = { ...oauth }
  if (typeof out.clientSecret === "string" && out.clientSecret) out.clientSecret = REDACTED
  return out
}

function unredactOAuth(incoming: unknown, existing: unknown): unknown {
  if (!isDict(incoming)) return incoming
  const out: Dict = { ...incoming }
  if (incoming.clientSecret === REDACTED && isDict(existing) && typeof existing.clientSecret === "string") {
    out.clientSecret = existing.clientSecret
  }
  return out
}

function redactEntry(entry: unknown): unknown {
  if (!isDict(entry)) return entry
  return {
    ...entry,
    ...(isDict(entry.options) ? { options: redactMap(entry.options) } : {}),
    ...(isDict(entry.environment) ? { environment: redactMap(entry.environment) } : {}),
    ...(isDict(entry.headers) ? { headers: redactMap(entry.headers) } : {}),
    ...(entry.oauth !== undefined ? { oauth: redactOAuth(entry.oauth) } : {}),
  }
}

function unredactEntry(incoming: unknown, existing: unknown): unknown {
  if (!isDict(incoming)) return incoming
  return {
    ...incoming,
    ...(isDict(incoming.options)
      ? { options: unredactMap(incoming.options, isDict(existing) ? (existing.options as Dict | undefined) : undefined) }
      : {}),
    ...(isDict(incoming.environment)
      ? {
          environment: unredactMap(
            incoming.environment,
            isDict(existing) ? (existing.environment as Dict | undefined) : undefined,
          ),
        }
      : {}),
    ...(isDict(incoming.headers)
      ? { headers: unredactMap(incoming.headers, isDict(existing) ? (existing.headers as Dict | undefined) : undefined) }
      : {}),
    ...(incoming.oauth !== undefined ? { oauth: unredactOAuth(incoming.oauth, isDict(existing) ? existing.oauth : undefined) } : {}),
  }
}

function mapSection(section: Dict | undefined, transform: (entry: unknown) => unknown): Dict | undefined {
  if (!section) return section
  const out: Dict = {}
  for (const [name, entry] of Object.entries(section)) out[name] = transform(entry)
  return out
}

export function redactConfigInfo(info: ConfigV1.Info): ConfigV1.Info {
  return {
    ...info,
    provider: mapSection(info.provider as Dict | undefined, redactEntry) as ConfigV1.Info["provider"],
    mcp: mapSection(info.mcp as Dict | undefined, redactEntry) as ConfigV1.Info["mcp"],
  }
}

export function unredactConfigInfo(incoming: ConfigV1.Info, existing: ConfigV1.Info): ConfigV1.Info {
  return {
    ...incoming,
    provider: mapSectionWithExisting(
      incoming.provider as Dict | undefined,
      existing.provider as Dict | undefined,
    ) as ConfigV1.Info["provider"],
    mcp: mapSectionWithExisting(incoming.mcp as Dict | undefined, existing.mcp as Dict | undefined) as ConfigV1.Info["mcp"],
  }
}

function mapSectionWithExisting(incoming: Dict | undefined, existing: Dict | undefined): Dict | undefined {
  if (!incoming) return incoming
  const out: Dict = {}
  for (const [name, entry] of Object.entries(incoming)) out[name] = unredactEntry(entry, existing?.[name])
  return out
}

// POST /mcp: el editor del renderer rellena el formulario desde un GET
// redactado; los placeholders se restauran contra la entrada existente.
// La config admite entradas parciales { enabled } para los toggles.
export function unredactMcpEntry(
  incoming: ConfigMCPV1.Info,
  existing: ConfigMCPV1.Info | { enabled: boolean } | undefined,
): ConfigMCPV1.Info {
  return unredactEntry(incoming, existing) as ConfigMCPV1.Info
}
