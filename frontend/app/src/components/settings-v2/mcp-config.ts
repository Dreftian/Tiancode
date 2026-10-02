import { z } from "zod"

const common = {
  enabled: z.boolean().optional(),
  timeout: z.number().int().positive().optional(),
}

const mcpConfig = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("local"),
    command: z.array(z.string()).min(1).refine((args) => Boolean(args[0]?.trim())),
    cwd: z.string().optional(),
    environment: z.record(z.string(), z.string()).optional(),
    ...common,
  }).strict(),
  z.object({
    type: z.literal("remote"),
    url: z.string().url().refine((value) => /^https?:\/\//.test(value)),
    headers: z.record(z.string(), z.string()).optional(),
    oauth: z.union([z.literal(false), z.object({
      clientId: z.string().optional(), clientSecret: z.string().optional(), scope: z.string().optional(),
      callbackPort: z.number().int().min(1).max(65535).optional(), redirectUri: z.string().optional(),
    }).strict()]).optional(),
    ...common,
  }).strict(),
])

export function parseMcpConfig(value: unknown) {
  return mcpConfig.parse(value)
}

// Keep Windows paths and quoted arguments intact. This only tokenizes; it never runs a shell.
export function parseCommand(value: string): string[] {
  if (value.trim().startsWith("[")) return z.array(z.string()).min(1).parse(JSON.parse(value))
  const args: string[] = []
  let token = ""
  let quote = ""
  let started = false
  for (const char of value.trim()) {
    if ((char === '"' || char === "'") && (!quote || quote === char)) {
      quote = quote ? "" : char
      started = true
      continue
    }
    if (/\s/.test(char) && !quote) {
      if (started) args.push(token)
      token = ""
      started = false
      continue
    }
    token += char
    started = true
  }
  if (quote) throw new Error("Unclosed command quote")
  if (started) args.push(token)
  return args
}

/** What the add/edit dialog edits; every field is text so half-typed values never throw. */
export type McpForm = {
  type: "local" | "remote"
  command: string
  cwd: string
  environment: string
  url: string
  headers: string
  oauth: boolean
  clientId: string
  scope: string
  /** Seconds, as the label says; the config stores milliseconds. */
  timeout: string
}

export const EMPTY_MCP_FORM: McpForm = {
  type: "local",
  command: "",
  cwd: "",
  environment: "",
  url: "",
  headers: "",
  oauth: false,
  clientId: "",
  scope: "",
  timeout: "",
}

// Quote what parseCommand would otherwise split, so the text reads back as the same list.
export function formatCommand(args: string[]) {
  return args
    .map((arg) => {
      if (arg && !/[\s"']/.test(arg)) return arg
      return arg.includes('"') ? `'${arg}'` : `"${arg}"`
    })
    .join(" ")
}

// One KEY=VALUE per line (headers also accept "Key: Value"); the first separator splits, so
// values may contain "=" (base64 tokens). Lines without a key are ignored.
export function parseKeyValues(text: string, colon = false) {
  const entries = text.split(/\r?\n/).flatMap((line) => {
    const equals = line.indexOf("=")
    const index = equals >= 0 ? equals : colon ? line.indexOf(":") : -1
    const key = (index < 0 ? line : line.slice(0, index)).trim()
    if (!key) return []
    return [[key, index < 0 ? "" : line.slice(index + 1).trim()] as const]
  })
  return entries.length ? Object.fromEntries(entries) : undefined
}

export function formatKeyValues(values: Record<string, string> | undefined) {
  return Object.entries(values ?? {})
    .map(([key, value]) => `${key}=${value}`)
    .join("\n")
}

export function mcpFormFromConfig(config: z.infer<typeof mcpConfig>): McpForm {
  const timeout = config.timeout ? String(config.timeout / 1000) : ""
  if (config.type === "local") {
    return {
      ...EMPTY_MCP_FORM,
      type: "local",
      command: formatCommand(config.command),
      cwd: config.cwd ?? "",
      environment: formatKeyValues(config.environment),
      timeout,
    }
  }
  const oauth = config.oauth === false ? undefined : config.oauth
  return {
    ...EMPTY_MCP_FORM,
    type: "remote",
    url: config.url,
    headers: formatKeyValues(config.headers),
    oauth: config.oauth !== false,
    clientId: oauth?.clientId ?? "",
    scope: oauth?.scope ?? "",
    timeout,
  }
}

/**
 * The saved definition for a form. `base` is the entry being edited: its `enabled` flag and the
 * OAuth fields the form does not show (secret, callback port, redirect URI) carry over, so an
 * edit never switches a server on or off or drops credentials. Throws when the result is invalid.
 */
export function mcpConfigFromForm(form: McpForm, base?: z.infer<typeof mcpConfig>) {
  const seconds = form.timeout.trim()
  const timeout = seconds ? Math.round(Number(seconds) * 1000) : undefined
  if (seconds && !(Number.isFinite(timeout) && timeout! > 0)) throw new Error("Invalid timeout")
  const common = defined({ timeout, enabled: base?.enabled })
  if (form.type === "local") {
    return parseMcpConfig({
      type: "local",
      command: parseCommand(form.command),
      ...defined({ cwd: form.cwd.trim() || undefined, environment: parseKeyValues(form.environment) }),
      ...common,
    })
  }
  const previous = base?.type === "remote" && base.oauth ? base.oauth : {}
  return parseMcpConfig({
    type: "remote",
    url: form.url.trim(),
    ...defined({ headers: parseKeyValues(form.headers, true) }),
    oauth: form.oauth
      ? defined({ ...previous, clientId: form.clientId.trim() || undefined, scope: form.scope.trim() || undefined })
      : false,
    ...common,
  })
}

function defined<T extends Record<string, unknown>>(value: T) {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined)) as Partial<T>
}
