import type { Argv, InferredOptionTypes } from "yargs"
import { ConfigV1 } from "@tiancode-ai/core/v1/config/config"
import type { Config } from "@/config/config"
import { Effect } from "effect"
import { errorMessage } from "@/util/error"
import { CliError, fail } from "./effect-cmd"

const options = {
  port: {
    type: "number" as const,
    describe: "port to listen on",
    default: 0,
  },
  hostname: {
    type: "string" as const,
    describe: "hostname to listen on",
    default: "127.0.0.1",
  },
  mdns: {
    type: "boolean" as const,
    describe: "enable mDNS service discovery (defaults hostname to 0.0.0.0)",
    default: false,
  },
  "mdns-domain": {
    type: "string" as const,
    describe: "custom domain name for mDNS service (default: tiancode.local)",
    default: "tiancode.local",
  },
  cors: {
    type: "string" as const,
    array: true,
    describe: "additional domains to allow for CORS",
    default: [] as string[],
  },
}

export type NetworkOptions = InferredOptionTypes<typeof options>

export function withNetworkOptions<T>(yargs: Argv<T>) {
  return yargs.options(options)
}

export function hasArg(name: string) {
  return networkArgs().some((arg) => arg === name || arg.startsWith(name + "="))
}

function hasBooleanArg(name: string) {
  return networkArgs().some(
    (arg) => arg === name || arg === name + "=true" || arg === name + "=false" || arg === "--no-" + name.slice(2),
  )
}

function networkArgs() {
  const separator = process.argv.indexOf("--")
  return process.argv.slice(2, separator === -1 ? undefined : separator)
}

export const resolveNetworkOptions = Effect.fn("Cli.resolveNetworkOptions")(function* (args: NetworkOptions) {
  const { Config } = yield* Effect.promise(() => import("@/config/config"))
  const config = yield* Config.Service.use((cfg) => cfg.getGlobal())
  return resolveNetworkOptionsNoConfig(args, config)
})

export function resolveNetworkOptionsNoConfig(args: NetworkOptions, config?: ConfigV1.Info) {
  const portExplicitlySet = hasArg("--port")
  const hostnameExplicitlySet = hasArg("--hostname")
  const mdnsExplicitlySet = hasBooleanArg("--mdns")
  const mdnsDomainExplicitlySet = hasArg("--mdns-domain")
  const mdns = mdnsExplicitlySet ? args.mdns : (config?.server?.mdns ?? args.mdns)
  const mdnsDomain = mdnsDomainExplicitlySet ? args["mdns-domain"] : (config?.server?.mdnsDomain ?? args["mdns-domain"])
  const port = portExplicitlySet ? args.port : (config?.server?.port ?? args.port)
  const hostname = hostnameExplicitlySet
    ? args.hostname
    : mdns && !config?.server?.hostname
      ? "0.0.0.0"
      : (config?.server?.hostname ?? args.hostname)
  const configCors = config?.server?.cors ?? []
  const argsCors = Array.isArray(args.cors) ? args.cors : args.cors ? [args.cors] : []
  const cors = [...configCors, ...argsCors]

  return { hostname, port, mdns, mdnsDomain, cors }
}

// Ningún comando debe exponer el HttpApi fuera de loopback sin password: lo
// aplican serve, web y acp justo antes de Server.listen (web/acp antes solo
// avisaban por pantalla y escuchaban igualmente).
export const ensureSecuredListen = Effect.fn("Cli.ensureSecuredListen")(function* (opts: {
  hostname: string
  port: number
}) {
  const { Flag } = yield* Effect.promise(() => import("@tiancode-ai/core/flag/flag"))
  // yargs turns `--port abc` into NaN, which used to fall through to a random port.
  if (!Number.isInteger(opts.port) || opts.port < 0 || opts.port > 65535)
    return yield* fail(`Invalid --port value. Use a number between 0 and 65535 (0 picks a free port).`)
  const loopback = opts.hostname === "127.0.0.1" || opts.hostname === "localhost" || opts.hostname === "::1"
  if (!loopback && !Flag.TIANCODE_SERVER_PASSWORD)
    return yield* fail(
      `Refusing to listen on ${opts.hostname} without TIANCODE_SERVER_PASSWORD. ` +
        "Set a password or use --hostname 127.0.0.1.",
    )
})

// Server.listen rejects with the raw socket error, which the CLI printed as "Unexpected error".
export function listenFailure(error: unknown, opts: { hostname: string; port: number }) {
  const text = errorText(error)
  if (text.includes("EADDRINUSE"))
    return new CliError({
      message: `Port ${opts.port} is already in use on ${opts.hostname}. Stop the other process or pass another --port.`,
    })
  if (text.includes("EACCES"))
    return new CliError({ message: `Not allowed to listen on ${opts.hostname}:${opts.port}. Try a port above 1024.` })
  if (text.includes("EADDRNOTAVAIL") || text.includes("ENOTFOUND"))
    return new CliError({ message: `Cannot listen on ${opts.hostname}: the address is not available on this machine.` })
  return new CliError({ message: `Could not start the server on ${opts.hostname}:${opts.port}: ${errorMessage(error)}` })
}

function errorText(error: unknown): string {
  if (error instanceof Error) return `${error.message} ${"code" in error ? String(error.code) : ""} ${errorText(error.cause)}`
  if (error && typeof error === "object") return `${JSON.stringify(error, Object.getOwnPropertyNames(error))}`
  return String(error ?? "")
}

// `attach` and `run --attach` reported "Session not found" or a 401 stack trace when the server was
// down or wanted a password: ask its health endpoint first and say which one it is.
export async function reachServer(url: string, headers?: Record<string, string>) {
  const response = await fetch(`${url.replace(/\/+$/, "")}/global/health`, {
    headers,
    signal: AbortSignal.timeout(5000),
  }).catch(() => undefined)
  if (!response) return `Cannot reach a tiancode server at ${url}. Start one with \`tiancode serve\` or check the URL.`
  if (response.status === 401)
    return `The server at ${url} needs a password. Pass --password or set TIANCODE_SERVER_PASSWORD.`
  if (!response.ok) return `The server at ${url} answered ${response.status} ${response.statusText}.`
}
