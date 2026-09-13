import { LayerNode } from "@tiancode-ai/core/effect/layer-node"
import { httpClient } from "@tiancode-ai/core/effect/app-node-platform"
import { serviceUse } from "@tiancode-ai/core/effect/service-use"
import path from "path"
import { pathToFileURL } from "url"
import os from "os"
import { mergeDeep } from "remeda"
import { Global } from "@tiancode-ai/core/global"
import fsNode from "fs/promises"
import { Flag } from "@tiancode-ai/core/flag/flag"
import { Auth } from "../auth"
import { Env } from "../env"
import { applyEdits, modify } from "jsonc-parser"
import { InstallationLocal } from "@tiancode-ai/core/installation/version"
import { existsSync } from "fs"
import { Account } from "@/account/account"
import { isRecord } from "@/util/record"
import type { ConsoleState } from "@tiancode-ai/core/v1/config/console-state"
import { FSUtil } from "@tiancode-ai/core/fs-util"
import { InstanceState } from "@/effect/instance-state"
import { Context, Duration, Effect, Exit, Fiber, Layer, Option, Schema } from "effect"
import { FetchHttpClient, HttpClient, HttpClientRequest } from "effect/unstable/http"
import { EffectFlock } from "@tiancode-ai/core/util/effect-flock"
import { containsPath, type InstanceContext } from "../project/instance-context"
import { ConfigV1 } from "@tiancode-ai/core/v1/config/config"
import { RemoteAuthError } from "@tiancode-ai/core/v1/config/error"
import { ConfigPermissionV1 } from "@tiancode-ai/core/v1/config/permission"
import { ConfigPluginV1 } from "@tiancode-ai/core/v1/config/plugin"
import { ConfigAgent } from "./agent"
import { ConfigCommand } from "./command"
import { ConfigManaged } from "./managed"
import { ConfigParse } from "./parse"
import { ConfigPaths } from "./paths"
import { ConfigPlugin } from "./plugin"
import { ConfigVariable } from "./variable"
import { Npm } from "@tiancode-ai/core/npm"
import { withTransientReadRetry } from "@/util/effect-http-client"

// Custom merge function that concatenates array fields instead of replacing them
// Keep remeda's deep conditional merge type out of hot config-loading paths; TS profiling showed it dominates here.
function mergeConfig(target: Info, source: Info): Info {
  return mergeDeep(target, source) as Info
}

function mergeConfigConcatArrays(target: Info, source: Info): Info {
  const merged = mergeConfig(target, source)
  if (target.instructions && source.instructions) {
    merged.instructions = Array.from(new Set([...target.instructions, ...source.instructions]))
  }
  return merged
}

function normalizeLoadedConfig(data: unknown) {
  if (!isRecord(data)) return data
  const copy = { ...data }
  const hadLegacy = "theme" in copy || "keybinds" in copy || "tui" in copy
  if (!hadLegacy) return copy
  delete copy.theme
  delete copy.keybinds
  delete copy.tui
  return copy
}

async function substituteWellKnownRemoteConfig(input: {
  value: unknown
  dir: string
  source: string
  env: Record<string, string>
}) {
  if (!isRecord(input.value) || typeof input.value.url !== "string") return undefined

  const url = await ConfigVariable.substitute({
    text: input.value.url,
    type: "virtual",
    dir: input.dir,
    source: input.source,
    env: input.env,
  })
  const headers = isRecord(input.value.headers)
    ? Object.fromEntries(
        await Promise.all(
          Object.entries(input.value.headers)
            .filter((entry): entry is [string, string] => typeof entry[1] === "string")
            .map(async ([key, value]) => [
              key,
              await ConfigVariable.substitute({
                text: value,
                type: "virtual",
                dir: input.dir,
                source: input.source,
                env: input.env,
              }),
            ]),
        ),
      )
    : undefined

  return { url, headers }
}

async function resolveLoadedPlugins<T extends { plugin?: ConfigPluginV1.Spec[] }>(config: T, filepath: string) {
  if (!config.plugin) return config
  for (let i = 0; i < config.plugin.length; i++) {
    // Normalize path-like plugin specs while we still know which config file declared them.
    // This prevents `./plugin.ts` from being reinterpreted relative to some later merge location.
    config.plugin[i] = await ConfigPlugin.resolvePluginSpec(config.plugin[i], filepath)
  }
  return config
}

type Info = ConfigV1.Info & {
  // plugin_origins is derived state, not a persisted config field. It keeps each winning plugin spec together
  // with the file and scope it came from so later runtime code can make location-sensitive decisions.
  plugin_origins?: ConfigPlugin.Origin[]
}

type State = {
  config: Info
  directories: string[]
  deps: Fiber.Fiber<void>[]
  consoleState: ConsoleState
}

export interface Interface {
  readonly get: () => Effect.Effect<Info>
  readonly getGlobal: () => Effect.Effect<Info>
  readonly getConsoleState: () => Effect.Effect<ConsoleState>
  readonly update: (config: Info) => Effect.Effect<void>
  readonly updateGlobal: (config: Info) => Effect.Effect<{ info: Info; changed: boolean }>
  /**
   * Delete a local model from the provider registry in BOTH the project and the
   * global config file. update()/updateGlobal() cannot express this: they merge.
   */
  readonly forgetProviderModel: (input: ForgetModelInput) => Effect.Effect<{
    models: string[]
    providers: string[]
    files: string[]
    clearedDefaultModel: boolean
    clearedSmallModel: boolean
  }>
  readonly invalidate: () => Effect.Effect<void>
  readonly invalidateInstance: () => Effect.Effect<void>
  readonly directories: () => Effect.Effect<string[]>
  readonly waitForDependencies: () => Effect.Effect<void>
}

export class Service extends Context.Service<Service, Interface>()("@tiancode/Config") {}

export const use = serviceUse(Service)

function globalConfigFile() {
  const candidates = ["tiancode.jsonc", "tiancode.json", "config.json"].map((file) =>
    path.join(Global.Path.config, file),
  )
  for (const file of candidates) {
    if (existsSync(file)) return file
  }
  return candidates[0]
}

// Escritura atómica (tmp + rename): dos updateGlobal concurrentes (p. ej. el
// seeder de MCP empaquetados lanzando varios POST /mcp a la vez) no pueden
// dejar el archivo a medio escribir.
function writeGlobalAtomic(file: string, content: string) {
  return Effect.tryPromise(async () => {
    const tmp = `${file}.${process.pid}.${Math.random().toString(36).slice(2)}.tmp`
    // 0o600 en el tmp: el contenido puede llevar apiKey de proveedores y no
    // debe quedar legible por otros usuarios durante la ventana de escritura.
    await fsNode.writeFile(tmp, content, { encoding: "utf8", mode: 0o600 })
    await fsNode.rename(tmp, file)
  })
}

function patchJsonc(input: string, patch: unknown, path: string[] = []): string {
  if (!isRecord(patch)) {
    const edits = modify(input, path, patch, {
      formattingOptions: {
        insertSpaces: true,
        tabSize: 2,
      },
    })
    return applyEdits(input, edits)
  }

  return Object.entries(patch).reduce((result, [key, value]) => patchJsonc(result, value, [...path, key]), input)
}

// --- Removal -----------------------------------------------------------------
//
// update()/updateGlobal() are *merges*: mergeDeep(base, patch) can add and it can
// overwrite, but it can never delete. Sending a `models` object with one key left
// out is a no-op by construction, which is why "prune the deleted model from the
// config" looked right and did nothing. Deletion needs its own path, so it lives
// here: the surgery is done on the file exactly as written (jsonc), so comments,
// unknown keys and {env:...}/{file:...} placeholders survive.

export type ForgetModelInput = {
  /** File name as downloaded, e.g. "Llama-3.2-3B-Instruct-Q4_K_M.gguf". */
  readonly file: string
  /** HuggingFace repo id, echoed back for reporting. Not used for matching. */
  readonly model?: string
  /**
   * Provider that the local engine writes to. When it is left with zero models
   * the whole provider entry goes too, otherwise the Hub keeps listing an empty
   * "Modelos Locales" provider that can never load anything.
   */
  readonly engineProvider?: string
}

export type ForgetModelResult = {
  readonly text: string
  readonly changed: boolean
  /** Removed model references, as `providerID/modelKey`. */
  readonly models: string[]
  /** Provider ids whose whole entry was removed. */
  readonly providers: string[]
  readonly clearedDefaultModel: boolean
  readonly clearedSmallModel: boolean
}

// Both container names are honoured because provider.ts reads `cfg.provider` and
// the legacy `cfg.providers` alias; a model left behind in the alias is just as
// selectable as one in the canonical block.
const PROVIDER_CONTAINERS = ["provider", "providers"] as const

/** The exact two keys activateDownloadedModel() writes: the file, and the file without `.gguf`. */
export function forgetModelKeys(file: string): string[] {
  const bare = file.replace(/\.gguf$/i, "")
  return Array.from(new Set([file, bare, `${bare}.gguf`]))
}

function removeJsoncPath(input: string, at: (string | number)[]): string {
  // jsonc-parser's modify() with `undefined` emits a *delete* edit and keeps the
  // rest of the document byte-for-byte, comments included.
  return applyEdits(input, modify(input, at, undefined, { formattingOptions: { insertSpaces: true, tabSize: 2 } }))
}

/**
 * Remove every model key matching `file` from every provider in a config document,
 * plus the provider entry and the default model references that the removal orphans.
 * Pure: takes the file text, returns the new file text.
 */
export function forgetModelInText(input: string, options: ForgetModelInput): ForgetModelResult {
  const unchanged = (): ForgetModelResult => ({
    text: input,
    changed: false,
    models: [],
    providers: [],
    clearedDefaultModel: false,
    clearedSmallModel: false,
  })
  if (!input.trim()) return unchanged()

  let parsed: unknown
  try {
    parsed = ConfigParse.jsonc(input, "<forget>")
  } catch {
    // A config we cannot parse is one we must not rewrite.
    return unchanged()
  }
  if (!isRecord(parsed)) return unchanged()

  const wanted = new Set(forgetModelKeys(options.file).map((key) => key.toLowerCase()))
  const engineProvider = options.engineProvider ?? "local"

  let text = input
  const models: string[] = []
  const providers: string[] = []

  for (const container of PROVIDER_CONTAINERS) {
    const block = parsed[container]
    if (!isRecord(block)) continue
    for (const [providerID, providerValue] of Object.entries(block)) {
      if (!isRecord(providerValue)) continue
      const providerModels = providerValue["models"]
      if (!isRecord(providerModels)) continue
      const keys = Object.keys(providerModels)
      const doomed = keys.filter((key) => wanted.has(key.toLowerCase()))
      if (!doomed.length) continue
      for (const key of doomed) {
        text = removeJsoncPath(text, [container, providerID, "models", key])
        models.push(`${providerID}/${key}`)
      }
      // Only the engine provider is disposable. A provider the user configured by
      // hand keeps its npm/options/apiKey even with an empty model map.
      if (doomed.length === keys.length && providerID === engineProvider) {
        text = removeJsoncPath(text, [container, providerID])
        providers.push(providerID)
      }
    }
  }

  const orphaned = new Set(models)
  const deadProvider = new Set(providers)
  const isOrphan = (ref: unknown) => {
    if (typeof ref !== "string" || !ref.includes("/")) return false
    if (orphaned.has(ref)) return true
    return deadProvider.has(ref.slice(0, ref.indexOf("/")))
  }

  // Leaving `"model": "local/<deleted>"` behind makes every new session default to
  // something that cannot load. Dropping the key lets the normal fallback pick.
  const clearedDefaultModel = isOrphan(parsed["model"])
  if (clearedDefaultModel) text = removeJsoncPath(text, ["model"])
  const clearedSmallModel = isOrphan(parsed["small_model"])
  if (clearedSmallModel) text = removeJsoncPath(text, ["small_model"])

  return {
    text,
    changed: text !== input,
    models,
    providers,
    clearedDefaultModel,
    clearedSmallModel,
  }
}

function writable(info: Info) {
  const { plugin_origins: _plugin_origins, ...next } = info
  return next
}

function writableGlobal(info: Info) {
  const next = writable(info)
  // When a user changes config from a value back to default in the Desktop app, we don't want to leave a blank `"shell": "",` key
  if ("shell" in next && next.shell === "") return { ...next, shell: undefined }
  return next
}

const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const fs = yield* FSUtil.Service
    const authSvc = yield* Auth.Service
    const accountSvc = yield* Account.Service
    const env = yield* Env.Service
    const npmSvc = yield* Npm.Service
    const http = yield* HttpClient.HttpClient

    const readConfigFile = (filepath: string) => fs.readFileStringSafe(filepath).pipe(Effect.orDie)

    const fetchRemoteJson = Effect.fnUntraced(function* <S extends Schema.Top>(
      url: string,
      headers: Record<string, string> | undefined,
      schema: S,
      loginOrigin: string,
    ) {
      const response = yield* HttpClient.filterStatusOk(withTransientReadRetry(http))
        .execute(
          HttpClientRequest.get(url).pipe(HttpClientRequest.acceptJson, HttpClientRequest.setHeaders(headers ?? {})),
        )
        .pipe(
          Effect.catch((error) => Effect.die(new Error(`failed to fetch remote config from ${url}: ${String(error)}`))),
        )
      const body = yield* response.text.pipe(
        Effect.catch((error) => Effect.die(new Error(`failed to read remote config from ${url}: ${String(error)}`))),
      )
      // An auth proxy can answer with an HTML login page at HTTP 200 (passes filterStatusOk); treat it as a re-auth error, not a decode failure.
      const contentType = (response.headers["content-type"] ?? "").toLowerCase()
      if (contentType.includes("html") || /^\s*<!doctype|^\s*<html/i.test(body)) {
        return yield* Effect.die(new RemoteAuthError({ url: loginOrigin, remote: url }))
      }
      return yield* Schema.decodeEffect(Schema.fromJsonString(schema))(body).pipe(
        Effect.catch((error) => Effect.die(new Error(`failed to decode remote config from ${url}: ${String(error)}`))),
      )
    })

    const loadConfig = Effect.fnUntraced(function* (
      text: string,
      options: { path: string } | { dir: string; source: string },
      env?: Record<string, string>,
    ) {
      const source = "path" in options ? options.path : options.source
      const expanded = yield* Effect.promise(() =>
        ConfigVariable.substitute(
          "path" in options
            ? { text, type: "path", path: options.path, env }
            : { text, type: "virtual", ...options, env },
        ),
      )
      const parsed = ConfigParse.jsonc(expanded, source)
      const data = ConfigParse.schema(ConfigV1.Info, normalizeLoadedConfig(parsed), source)
      if (!("path" in options)) return data

      yield* Effect.promise(() => resolveLoadedPlugins(data, options.path))
      if (!data.$schema) {
        data.$schema = "https://tiancode.ai/config.json"
        const updated = text.replace(/^\s*\{/, '{\n  "$schema": "https://tiancode.ai/config.json",')
        yield* fs.writeFileString(options.path, updated).pipe(Effect.catch(() => Effect.void))
      }
      return data
    })

    const loadFile = Effect.fnUntraced(function* (filepath: string, env?: Record<string, string>) {
      yield* Effect.logInfo("loading", { path: filepath })
      const text = yield* readConfigFile(filepath)
      if (!text) return {} as Info
      return yield* loadConfig(text, { path: filepath }, env)
    })

    const loadGlobal = Effect.fnUntraced(function* (env?: Record<string, string>) {
      let result: Info = {}
      // Seed the default global config with the schema for editor completion, but avoid writing when the user
      // explicitly routes config through env-provided paths or content.
      if (!Flag.TIANCODE_CONFIG && !Flag.TIANCODE_CONFIG_DIR && !Flag.TIANCODE_CONFIG_CONTENT) {
        const file = globalConfigFile()
        if (!existsSync(file)) {
          yield* fs
            .writeWithDirs(file, JSON.stringify({ $schema: "https://tiancode.ai/config.json" }, null, 2))
            .pipe(Effect.catch(() => Effect.void))
        }
      }
      result = mergeConfig(result, yield* loadFile(path.join(Global.Path.config, "config.json"), env))
      result = mergeConfig(result, yield* loadFile(path.join(Global.Path.config, "tiancode.json"), env))
      result = mergeConfig(result, yield* loadFile(path.join(Global.Path.config, "tiancode.jsonc"), env))

      const legacy = path.join(Global.Path.config, "config")
      if (existsSync(legacy)) {
        yield* Effect.promise(() =>
          import(pathToFileURL(legacy).href, { with: { type: "toml" } })
            .then(async (mod) => {
              const { provider, model, ...rest } = mod.default
              if (provider && model) result.model = `${provider}/${model}`
              result["$schema"] = "https://tiancode.ai/config.json"
              result = mergeConfig(result, rest)
              await fsNode.writeFile(path.join(Global.Path.config, "config.json"), JSON.stringify(result, null, 2))
              await fsNode.unlink(legacy)
            })
            .catch(() => {}),
        )
      }

      return result
    })

    const [cachedGlobal, invalidateGlobal] = yield* Effect.cachedInvalidateWithTTL(
      loadGlobal().pipe(
        Effect.tapError((error) =>
          Effect.logError("failed to load global config, using defaults", { error: String(error) }),
        ),
        Effect.orElseSucceed((): Info => ({})),
      ),
      Duration.infinity,
    )

    const getGlobal = Effect.fn("Config.getGlobal")(function* () {
      return yield* cachedGlobal
    })

    const ensureGitignore = Effect.fn("Config.ensureGitignore")(function* (dir: string) {
      yield* fs.ensureDir(dir)
      const gitignore = path.join(dir, ".gitignore")
      const hasIgnore = yield* fs.existsSafe(gitignore)
      if (!hasIgnore) {
        yield* fs
          .writeFileString(
            gitignore,
            ["node_modules", "package.json", "package-lock.json", "bun.lock", ".gitignore"].join("\n"),
          )
          .pipe(
            Effect.catchIf(
              (e) => e.reason._tag === "PermissionDenied",
              () => Effect.void,
            ),
          )
      }
    })

    const loadInstanceState = Effect.fn("Config.loadInstanceState")(
      function* (ctx: InstanceContext) {
        const auth = yield* authSvc.all().pipe(Effect.orDie)

        let result: Info = {}
        const authEnv: Record<string, string> = {}
        const consoleManagedProviders = new Set<string>()
        let activeOrgName: string | undefined

        const pluginScopeForSource = Effect.fnUntraced(function* (source: string) {
          if (source.startsWith("http://") || source.startsWith("https://")) return "global"
          if (source === "TIANCODE_CONFIG_CONTENT") return "local"
          if (containsPath(source, ctx)) return "local"
          return "global"
        })

        const mergePluginOrigins = Effect.fnUntraced(function* (
          source: string,
          // mergePluginOrigins receives raw Specs from one config source, before provenance for this merge step
          // is attached.
          list: ConfigPluginV1.Spec[] | undefined,
          // Scope can be inferred from the source path, but some callers already know whether the config should
          // behave as global or local and can pass that explicitly.
          kind?: ConfigPlugin.Scope,
        ) {
          if (!list?.length) return
          const hit = kind ?? (yield* pluginScopeForSource(source))
          // Merge newly seen plugin origins with previously collected ones, then dedupe by plugin identity while
          // keeping the winning source/scope metadata for downstream installs, writes, and diagnostics.
          const plugins = ConfigPlugin.deduplicatePluginOrigins([
            ...(result.plugin_origins ?? []),
            ...list.map((spec) => ({ spec, source, scope: hit })),
          ])
          result.plugin = plugins.map((item) => item.spec)
          result.plugin_origins = plugins
        })

        // Proveniencia de las entradas MCP. La config de proyecto
        // (tiancode.json/.jsonc en el repo, incluido .tiancode/) puede venir
        // de un repo clonado: sus MCPs no se ejecutan hasta aprobación
        // explícita — activarlos desde la app los escribe en la config global
        // (MCP.add → updateGlobal), que es la aprobación. Un nombre ya
        // definido por una fuente confiable no puede redefinirse desde el
        // proyecto (evita pisar el comando de un MCP aprobado).
        const mcpOrigins = new Map<string, { trusted: boolean }>()
        const projectPrefixes = [ctx.directory, ctx.worktree].filter(Boolean).map((dir) => dir.toLowerCase())
        const isProjectSource = (source: string) => {
          const lowered = source.toLowerCase()
          return projectPrefixes.some((prefix) => lowered.startsWith(prefix))
        }

        const merge = (source: string, next: Info, kind?: ConfigPlugin.Scope) => {
          if (next.mcp) {
            const filteredMcp: NonNullable<Info["mcp"]> = {}
            for (const [name, entry] of Object.entries(next.mcp)) {
              const origin = mcpOrigins.get(name)
              if (kind === "local" || (!kind && isProjectSource(source))) {
                if (origin?.trusted) continue
                mcpOrigins.set(name, { trusted: false })
              } else {
                mcpOrigins.set(name, { trusted: true })
              }
              filteredMcp[name] = entry
            }
            next = { ...next, mcp: filteredMcp }
          }
          result = mergeConfigConcatArrays(result, next)
          return mergePluginOrigins(source, next.plugin, kind)
        }

        for (const [key, value] of Object.entries(auth)) {
          if (value.type === "wellknown") {
            const url = key.replace(/\/+$/, "")
            authEnv[value.key] = value.token
            const wellknownURL = `${url}/.well-known/tiancode`
            yield* Effect.logDebug("fetching remote config", { url: wellknownURL })
            const wellknown = yield* fetchRemoteJson(wellknownURL, undefined, ConfigV1.WellKnown, url)
            const remote = yield* Effect.promise(() =>
              substituteWellKnownRemoteConfig({
                value: wellknown.remote_config,
                dir: url,
                source: wellknownURL,
                env: authEnv,
              }),
            )
            const fetchedConfig = remote
              ? yield* Effect.gen(function* () {
                  yield* Effect.logDebug("fetching remote config", { url: remote.url })
                  const data = yield* fetchRemoteJson(remote.url, remote.headers, Schema.Json, url)
                  if (isRecord(data) && isRecord(data.config)) return data.config
                  if (isRecord(data)) return data
                  return yield* Effect.die(
                    new Error(`failed to decode remote config from ${remote.url}: expected object`),
                  )
                })
              : {}
            const remoteConfig = mergeConfig(isRecord(wellknown.config) ? wellknown.config : {}, fetchedConfig)
            if (!remoteConfig.$schema) remoteConfig.$schema = "https://tiancode.ai/config.json"
            const source = wellknownURL
            const next = yield* loadConfig(
              JSON.stringify(remoteConfig),
              {
                dir: path.dirname(source),
                source,
              },
              authEnv,
            )
            yield* merge(source, next, "global")
            yield* Effect.logDebug("loaded remote config from well-known", { url })
          }
        }

        const global = Object.keys(authEnv).length ? yield* loadGlobal(authEnv) : yield* getGlobal()
        yield* merge(Global.Path.config, global, "global")

        // Agents defined as markdown files in the global config dir (the HTTP
        // API writes them there via agentCreate/agentUpdate) are loaded before
        // the project dir so project agents can override them.
        result.agent = mergeDeep(result.agent ?? {}, yield* Effect.promise(() => ConfigAgent.load(Global.Path.config)))
        result.agent = mergeDeep(
          result.agent ?? {},
          yield* Effect.promise(() => ConfigAgent.loadMode(Global.Path.config)),
        )

        if (Flag.TIANCODE_CONFIG) {
          yield* merge(Flag.TIANCODE_CONFIG, yield* loadFile(Flag.TIANCODE_CONFIG, authEnv))
          yield* Effect.logDebug("loaded custom config", { path: Flag.TIANCODE_CONFIG })
        }

        if (!Flag.TIANCODE_DISABLE_PROJECT_CONFIG) {
          for (const file of yield* ConfigPaths.files("tiancode", ctx.directory, ctx.worktree).pipe(Effect.orDie)) {
            yield* merge(file, yield* loadFile(file, authEnv), "local")
          }
        }

        result.agent = result.agent || {}
        result.mode = result.mode || {}
        result.plugin = result.plugin || []

        const directories = yield* ConfigPaths.directories(ctx.directory, ctx.worktree)

        if (Flag.TIANCODE_CONFIG_DIR) {
          yield* Effect.logDebug("loading config from TIANCODE_CONFIG_DIR", { path: Flag.TIANCODE_CONFIG_DIR })
        }

        const deps: Fiber.Fiber<void>[] = []

        for (const dir of directories) {
          if (dir.endsWith(".tiancode") || dir === Flag.TIANCODE_CONFIG_DIR) {
            for (const file of ["tiancode.json", "tiancode.jsonc"]) {
              const source = path.join(dir, file)
              yield* Effect.logDebug(`loading config from ${source}`)
              yield* merge(source, yield* loadFile(source, authEnv))
              result.agent ??= {}
              result.mode ??= {}
              result.plugin ??= []
            }
          }

          yield* ensureGitignore(dir).pipe(Effect.orDie)

          const dep = yield* npmSvc
            .install(dir, {
              add: [
                {
                  name: "@tiancode-ai/plugin",
                  // Sin pin: el paquete se publica en npm y la versión se
                  // resuelve a latest (un pin por versión de app obligaría a
                  // publicar el paquete en cada release).
                },
              ],
            })
            .pipe(
              Effect.exit,
              Effect.tap((exit) =>
                Exit.isFailure(exit)
                  ? Effect.logWarning("background dependency install failed", { dir, error: String(exit.cause) })
                  : Effect.void,
              ),
              Effect.asVoid,
              Effect.forkDetach,
            )
          deps.push(dep)

          result.command = mergeDeep(result.command ?? {}, yield* Effect.promise(() => ConfigCommand.load(dir)))
          result.agent = mergeDeep(result.agent ?? {}, yield* Effect.promise(() => ConfigAgent.load(dir)))
          result.agent = mergeDeep(result.agent ?? {}, yield* Effect.promise(() => ConfigAgent.loadMode(dir)))
          // Auto-discovered plugins under `.tiancode/plugin(s)` are already local files, so ConfigPlugin.load
          // returns normalized Specs and we only need to attach origin metadata here.
          const list = yield* Effect.promise(() => ConfigPlugin.load(dir))
          yield* mergePluginOrigins(dir, list)
        }

        if (process.env.TIANCODE_CONFIG_CONTENT) {
          const source = "TIANCODE_CONFIG_CONTENT"
          const next = yield* loadConfig(process.env.TIANCODE_CONFIG_CONTENT, {
            dir: ctx.directory,
            source,
          })
          yield* merge(source, next, "local")
          yield* Effect.logDebug("loaded custom config from TIANCODE_CONFIG_CONTENT")
        }

        const activeAccount = Option.getOrUndefined(
          yield* accountSvc.active().pipe(Effect.catch(() => Effect.succeed(Option.none()))),
        )
        if (activeAccount?.active_org_id) {
          const accountID = activeAccount.id
          const orgID = activeAccount.active_org_id
          const url = activeAccount.url
          yield* Effect.gen(function* () {
            const [configOpt, tokenOpt] = yield* Effect.all(
              [accountSvc.config(accountID, orgID), accountSvc.token(accountID)],
              { concurrency: 2 },
            )
            if (Option.isSome(tokenOpt)) {
              process.env["TIANCODE_CONSOLE_TOKEN"] = tokenOpt.value
              yield* env.set("TIANCODE_CONSOLE_TOKEN", tokenOpt.value)
            }

            if (Option.isSome(configOpt)) {
              const source = `${url}/api/config`
              const next = yield* loadConfig(JSON.stringify(configOpt.value), {
                dir: path.dirname(source),
                source,
              })
              for (const providerID of Object.keys(next.provider ?? {})) {
                consoleManagedProviders.add(providerID)
              }
              yield* merge(source, next, "global")
            }
          }).pipe(
            Effect.withSpan("Config.loadActiveOrgConfig"),
            Effect.catch((err) =>
              Effect.logDebug("failed to fetch remote account config", {
                error: err instanceof Error ? err.message : String(err),
              }),
            ),
          )
        }

        const managedDir = ConfigManaged.managedConfigDir()
        if (existsSync(managedDir)) {
          for (const file of ["tiancode.json", "tiancode.jsonc"]) {
            const source = path.join(managedDir, file)
            yield* merge(source, yield* loadFile(source), "global")
          }
        }

        // macOS managed preferences (.mobileconfig deployed via MDM) override everything
        const managed = yield* Effect.promise(() => ConfigManaged.readManagedPreferences())
        if (managed) {
          result = mergeConfigConcatArrays(
            result,
            yield* loadConfig(managed.text, {
              dir: path.dirname(managed.source),
              source: managed.source,
            }),
          )
        }

        // MCPs definidos solo por config de proyecto (p. ej. un repo clonado):
        // deshabilitados hasta que el usuario los active desde la app. Se
        // listan en el log para que el estado "disabled" sea explicable.
        if (result.mcp) {
          const gatedNames = Object.entries(result.mcp)
            .filter(([name]) => mcpOrigins.get(name)?.trusted === false)
            .map(([name]) => name)
          if (gatedNames.length > 0) {
            yield* Effect.logWarning("project-defined MCP servers disabled pending approval", {
              servers: gatedNames,
            })
            const gatedMcp: NonNullable<Info["mcp"]> = {}
            for (const [name, entry] of Object.entries(result.mcp)) {
              gatedMcp[name] = mcpOrigins.get(name)?.trusted === false ? { ...entry, enabled: false } : entry
            }
            result.mcp = gatedMcp
          }
        }

        for (const [name, mode] of Object.entries(result.mode ?? {})) {
          result.agent = mergeDeep(result.agent ?? {}, {
            [name]: {
              ...mode,
              mode: "primary" as const,
            },
          })
        }

        if (Flag.TIANCODE_PERMISSION) {
          try {
            result.permission = mergeDeep(result.permission ?? {}, JSON.parse(Flag.TIANCODE_PERMISSION))
          } catch (err) {
            yield* Effect.logWarning("TIANCODE_PERMISSION contains invalid JSON, skipping", { err })
          }
        }

        if (result.tools) {
          const perms: Record<string, ConfigPermissionV1.Action> = {}
          for (const [tool, enabled] of Object.entries(result.tools)) {
            const action: ConfigPermissionV1.Action = enabled ? "allow" : "deny"
            if (tool === "write" || tool === "edit" || tool === "patch") {
              perms.edit = action
              continue
            }
            perms[tool] = action
          }
          result.permission = mergeDeep(perms, result.permission ?? {})
        }

        if (!result.username) {
          try {
            result.username = os.userInfo().username || "user"
          } catch (err) {
            yield* Effect.logWarning("failed to read system username, using fallback", { err })
            result.username = "user"
          }
        }

        if (result.autoshare === true && !result.share) {
          result.share = "auto"
        }

        if (Flag.TIANCODE_DISABLE_AUTOCOMPACT) {
          result.compaction = { ...result.compaction, auto: false }
        }
        if (Flag.TIANCODE_DISABLE_PRUNE) {
          result.compaction = { ...result.compaction, prune: false }
        }

        return {
          config: result,
          directories,
          deps,
          consoleState: {
            consoleManagedProviders: Array.from(consoleManagedProviders),
            activeOrgName,
            switchableOrgCount: 0,
          },
        }
      },
      Effect.provideService(FSUtil.Service, fs),
    )

    const state = yield* InstanceState.make<State>(
      Effect.fn("Config.state")(function* (ctx) {
        return yield* loadInstanceState(ctx).pipe(Effect.orDie)
      }),
    )

    const get = Effect.fn("Config.get")(function* () {
      return yield* InstanceState.use(state, (s) => s.config)
    })

    const directories = Effect.fn("Config.directories")(function* () {
      return yield* InstanceState.use(state, (s) => s.directories)
    })

    const getConsoleState = Effect.fn("Config.getConsoleState")(function* () {
      return yield* InstanceState.use(state, (s) => s.consoleState)
    })

    const waitForDependencies = Effect.fn("Config.waitForDependencies")(function* () {
      yield* InstanceState.useEffect(state, (s) =>
        Effect.forEach(s.deps, Fiber.join, { concurrency: "unbounded" }).pipe(Effect.asVoid),
      )
    })

    // El loader de config de proyecto (ConfigPaths.files) solo lee
    // `tiancode.jsonc`/`tiancode.json`, no `config.json`: escribir ahí hacía
    // que las actualizaciones desde la app (p. ej. plugins) fueran un no-op
    // silencioso. Escribimos en el archivo de proyecto existente (o creamos
    // `tiancode.json`) y limpiamos el `config.json` huérfano de versiones
    // anteriores.
    const projectConfigFile = Effect.fn("Config.projectConfigFile")(function* (dir: string) {
      for (const name of ["tiancode.jsonc", "tiancode.json"]) {
        const candidate = path.join(dir, name)
        if (yield* fs.existsSafe(candidate)) return candidate
      }
      return path.join(dir, "tiancode.json")
    })

    const update = Effect.fn("Config.update")(function* (config: Info) {
      const dir = yield* InstanceState.directory
      const file = yield* projectConfigFile(dir)
      const existing = yield* loadFile(file).pipe(Effect.orElseSucceed(() => ({})))
      // Merge into the file as written, not as loaded. loadFile() resolves {env:...} and
      // {file:...} and drops every key the schema does not know, so merging the loaded value
      // wrote resolved secrets back in plaintext and deleted the user's unrecognised keys.
      const text = yield* readConfigFile(file)
      const original = text ? ConfigParse.jsonc(text, file) : undefined
      const base = isRecord(original) ? original : writable(existing)
      const merged = mergeDeep(base, writable(config)) as Record<string, unknown>
      if (config.plugin !== undefined) {
        merged.plugin = config.plugin
      }
      yield* writeGlobalAtomic(file, JSON.stringify(merged, null, 2)).pipe(Effect.orDie)
      yield* fs.remove(path.join(dir, "config.json")).pipe(Effect.catch(() => Effect.void))
    })

    const invalidate = Effect.fn("Config.invalidate")(function* () {
      yield* invalidateGlobal
    })

    // Drops the cached per-instance state so the next get() reloads the merged
    // config from disk. Lighter than an instance reload: MCP.add/remove use it
    // so settings reflect the change without tearing down sessions.
    const invalidateInstance = Effect.fn("Config.invalidateInstance")(function* () {
      yield* InstanceState.invalidate(state)
    })

    const updateGlobal = Effect.fn("Config.updateGlobal")(function* (config: Info) {
      const file = globalConfigFile()
      const before = (yield* readConfigFile(file)) ?? "{}"
      const patch = writableGlobal(config)

      let next: Info
      let changed: boolean
      if (!file.endsWith(".jsonc")) {
        const existing = ConfigParse.schema(ConfigV1.Info, ConfigParse.jsonc(before, file), file)
        const merged = mergeDeep(writable(existing), patch) as Record<string, unknown>
        if (config.plugin !== undefined) {
          merged.plugin = config.plugin
        }
        const serialized = JSON.stringify(merged, null, 2)
        changed = serialized !== before
        if (changed) yield* writeGlobalAtomic(file, serialized).pipe(Effect.orDie)
        next = merged as Info
      } else {
        const updated = patchJsonc(before, patch)
        next = ConfigParse.schema(ConfigV1.Info, ConfigParse.jsonc(updated, file), file)
        changed = updated !== before
        if (changed) yield* writeGlobalAtomic(file, updated).pipe(Effect.orDie)
      }

      if (changed) yield* invalidate()
      return { info: next, changed }
    })

    // The deletion counterpart of update()/updateGlobal(). It writes both scopes in
    // one call because the entry the UI wants gone was written to both scopes by
    // activateDownloadedModel(), and pruning only the project file left the global
    // one — the one the user actually has it in — untouched.
    const forgetProviderModel = Effect.fn("Config.forgetProviderModel")(function* (input: ForgetModelInput) {
      const dir = yield* InstanceState.directory
      const projectFile = yield* projectConfigFile(dir)
      const targets = Array.from(new Set([projectFile, globalConfigFile()]))

      const models = new Set<string>()
      const providers = new Set<string>()
      const files: string[] = []
      let clearedDefaultModel = false
      let clearedSmallModel = false

      for (const file of targets) {
        const before = yield* readConfigFile(file)
        if (!before) continue
        const result = forgetModelInText(before, input)
        if (!result.changed) continue
        yield* writeGlobalAtomic(file, result.text).pipe(Effect.orDie)
        for (const model of result.models) models.add(model)
        for (const provider of result.providers) providers.add(provider)
        clearedDefaultModel ||= result.clearedDefaultModel
        clearedSmallModel ||= result.clearedSmallModel
        files.push(file)
      }

      if (files.length) {
        yield* invalidate()
        yield* invalidateInstance()
      }

      return {
        models: Array.from(models),
        providers: Array.from(providers),
        files,
        clearedDefaultModel,
        clearedSmallModel,
      }
    })

    return Service.of({      get,
      getGlobal,
      getConsoleState,
      update,
      updateGlobal,
      forgetProviderModel,
      invalidate,
      invalidateInstance,
      directories,
      waitForDependencies,
    })
  }),
)

export const node = LayerNode.make({
  service: Service,
  layer: layer,
  deps: [FSUtil.node, Auth.node, Account.node, Env.node, Npm.node, httpClient],
})

export * as Config from "./config"
