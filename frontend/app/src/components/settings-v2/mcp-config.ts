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
