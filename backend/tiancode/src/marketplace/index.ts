export * as Marketplace from "."

import { mkdir, readdir, readFile, rename, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { Cause, Context, Effect, Layer, Schema, Semaphore } from "effect"
import { makeGlobalNode } from "@tiancode-ai/core/effect/app-node"
import { Global } from "@tiancode-ai/core/global"
import { SPECIALISTS, SPECIALIST_ALIASES } from "@tiancode-ai/core/plugin/agent-specialists"
import { Command } from "@/command"
import { Config } from "@/config/config"
import { MarketplaceCatalog, type Item, type McpInstall } from "./catalog"
import { MarketplaceIcons } from "./icons"
import { MarketplaceInstaller } from "./installer"
import { MarketplaceSnapshot } from "./snapshot"
import { MarketplaceSources, type Snapshot } from "./sources"

export { MarketplaceCatalog, MarketplaceSources }

export class InstallError extends Schema.TaggedErrorClass<InstallError>()(
  "MarketplaceInstallError",
  { message: Schema.String },
  { httpApiStatus: 400 },
) {}

export interface Installed {
  id: string
  name: string
  title: string
  source: string
  installedAt: number
  skills: string[]
  commands: string[]
  agents: string[]
  mcp: string[]
  skipped: string[]
}

export interface Interface {
  readonly catalog: () => Effect.Effect<Snapshot>
  readonly search: (query: string) => Effect.Effect<Item[]>
  readonly icon: (domain: string) => Effect.Effect<string | undefined>
  readonly installed: () => Effect.Effect<Installed[]>
  readonly install: (id: string) => Effect.Effect<Installed, InstallError>
  readonly uninstall: (id: string) => Effect.Effect<boolean, InstallError>
}

export class Service extends Context.Service<Service, Interface>()("@tiancode/Marketplace") {}

// The mirrored catalogs change a few times a day at most; their maintainers ask aggregators to
// refresh no more than hourly.
const FRESH_MS = 6 * 60 * 60 * 1000
// After a failed or partial refresh: try again sooner, but never in a loop.
const RETRY_MS = 30 * 60 * 1000
const ICON_FRESH_MS = 30 * 24 * 60 * 60 * 1000
const ICON_MISS_MS = 24 * 60 * 60 * 1000
const ICON_UNREACHABLE_MS = 10 * 60 * 1000
// Bumped when the cached catalog's shape or ids change, so an older cache is refetched.
const CACHE_VERSION = 2

type Kind = "skills" | "commands" | "agents" | "mcp"

// Names Tiancode itself defines: a plugin never takes them over.
const BUILTIN: Record<Kind, string[]> = {
  skills: [],
  commands: Object.values(Command.Default),
  agents: [
    "build",
    "plan",
    "webapp",
    "general",
    "explore",
    "compaction",
    "title",
    "summary",
    ...SPECIALISTS.map((specialist) => specialist.name),
    ...Object.keys(SPECIALIST_ALIASES),
  ],
  mcp: [],
}

const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const config = yield* Config.Service
    const cacheDir = path.join(Global.Path.cache, "marketplace")
    const pluginsDir = path.join(Global.Path.data, "marketplace", "plugins")
    const manifestFile = path.join(Global.Path.data, "marketplace", "installed.json")
    const lock = Semaphore.makeUnsafe(1)
    const state = {
      snapshot: undefined as Snapshot | undefined,
      refreshing: undefined as Promise<Snapshot | undefined> | undefined,
      // When the last refresh started and when the next one is due.
      attempted: 0,
      due: 0,
      icons: new Map<string, { value: string | undefined; until: number }>(),
      iconRequests: new Map<string, Promise<string | undefined>>(),
    }

    const readDisk = async () => {
      const text = await readFile(path.join(cacheDir, "catalog.json"), "utf8").catch(() => undefined)
      if (!text) return
      const value = JSON.parse(text) as Snapshot & { version?: number }
      if (value.version !== CACHE_VERSION || !Array.isArray(value.items) || !Array.isArray(value.connectors)) return
      return value
    }

    const refresh = () => {
      if (Date.now() - state.attempted < RETRY_MS / 6) return state.refreshing ?? Promise.resolve(state.snapshot)
      state.attempted = Date.now()
      state.refreshing ??= MarketplaceSources.fetchAll()
        .then(async (fetched) => {
          // A source that failed this time keeps what it had: one outage must not empty Discover.
          const previous = state.snapshot
          const failed = fetched.sources.filter((source) => !source.ok).map((source) => source.id)
          const kept = (previous?.items ?? []).filter((item) =>
            failed.some((id) => item.id.startsWith(`${id}:`) || (id === "claude-directory" && item.id.startsWith("connector:"))),
          )
          const next: Snapshot = {
            ...fetched,
            items: MarketplaceCatalog.merge(fetched.items, kept),
            connectors: failed.includes("claude-directory") && previous ? previous.connectors : fetched.connectors,
          }
          state.due = Date.now() + (failed.length ? RETRY_MS : FRESH_MS)
          if (failed.length === fetched.sources.length) return previous
          state.snapshot = next
          await mkdir(cacheDir, { recursive: true })
          const file = path.join(cacheDir, "catalog.json")
          await writeFile(`${file}.tmp`, JSON.stringify({ ...next, version: CACHE_VERSION }))
          await rename(`${file}.tmp`, file)
          return next
        })
        .catch(() => {
          state.due = Date.now() + RETRY_MS
          return state.snapshot
        })
        .finally(() => {
          state.refreshing = undefined
        })
      return state.refreshing
    }

    const catalog = Effect.fn("Marketplace.catalog")(function* () {
      return yield* Effect.promise(async () => {
        if (!state.snapshot) {
          const disk = await readDisk().catch(() => undefined)
          state.snapshot = disk ?? (await MarketplaceSnapshot.load())
          // The bundled copy leaves out the community marketplace; the first online refresh adds it.
          state.due = disk ? disk.fetchedAt + FRESH_MS : 0
        }
        if (Date.now() >= state.due) void refresh()
        return state.snapshot
      })
    })

    const search = Effect.fn("Marketplace.search")(function* (query: string) {
      const term = query.trim()
      if (term.length < 2) return []
      return yield* Effect.promise(() => MarketplaceSources.searchRegistry(term).catch(() => [] as Item[]))
    })

    const knownDomains = (snapshot: Snapshot) =>
      new Set([
        ...snapshot.items.flatMap((item) => (item.domain ? [item.domain] : [])),
        ...snapshot.connectors.flatMap((connector) => (connector.domain ? [connector.domain] : [])),
      ])

    const resolveIcon = async (host: string) => {
      const memory = state.icons.get(host)
      if (memory && memory.until > Date.now()) return memory.value
      const file = path.join(cacheDir, "icons", `${host}.txt`)
      const cached = await readFile(file, "utf8").catch(() => undefined)
      if (cached) {
        const stamp = Number(cached.slice(0, cached.indexOf(" ")))
        const value = cached.slice(cached.indexOf(" ") + 1)
        const until = stamp + (value === "-" ? ICON_MISS_MS : ICON_FRESH_MS)
        if (until > Date.now()) {
          state.icons.set(host, { value: value === "-" ? undefined : value, until })
          return value === "-" ? undefined : value
        }
      }
      const resolved = await MarketplaceIcons.resolve(host).catch(() => ({ icon: undefined, reachable: false }))
      // A site that could not be reached is asked again in a few minutes and never written down.
      if (!resolved.icon && !resolved.reachable) {
        state.icons.set(host, { value: undefined, until: Date.now() + ICON_UNREACHABLE_MS })
        return undefined
      }
      state.icons.set(host, {
        value: resolved.icon,
        until: Date.now() + (resolved.icon ? ICON_FRESH_MS : ICON_MISS_MS),
      })
      await mkdir(path.dirname(file), { recursive: true }).catch(() => undefined)
      await writeFile(file, `${Date.now()} ${resolved.icon ?? "-"}`).catch(() => undefined)
      return resolved.icon
    }

    const icon = Effect.fn("Marketplace.icon")(function* (domain: string) {
      const snapshot = yield* catalog()
      const host = MarketplaceCatalog.domainOf(domain)
      // Only the sites the catalog names: this must not become a way to make the backend fetch anything.
      if (!host || !knownDomains(snapshot).has(host)) return undefined
      return yield* Effect.promise(() => {
        const pending = state.iconRequests.get(host)
        if (pending) return pending
        const request = resolveIcon(host).finally(() => state.iconRequests.delete(host))
        state.iconRequests.set(host, request)
        return request
      })
    })

    // An unreadable manifest is an error, not an empty one: treating it as empty would forget every
    // installed plugin and leave their files behind for good.
    const readManifest = async (): Promise<Record<string, Installed>> => {
      const text = await readFile(manifestFile, "utf8").catch((error: NodeJS.ErrnoException) => {
        if (error.code === "ENOENT") return undefined
        throw error
      })
      if (!text) return {}
      const value: unknown = JSON.parse(text)
      if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("installed.json is not an object")
      return value as Record<string, Installed>
    }
    const writeManifest = async (value: Record<string, Installed>) => {
      await mkdir(path.dirname(manifestFile), { recursive: true })
      await writeFile(`${manifestFile}.tmp`, JSON.stringify(value, null, 2))
      await rename(`${manifestFile}.tmp`, manifestFile)
    }
    const manifestOrFail = Effect.tryPromise({
      try: readManifest,
      catch: (error) =>
        new InstallError({
          message: `The list of installed plugins could not be read (${error instanceof Error ? error.message : String(error)}).`,
        }),
    })

    const installed = Effect.fn("Marketplace.installed")(function* () {
      return yield* Effect.promise(async () => Object.values(await readManifest().catch(() => ({}))))
    })

    // Every name in use, lowercased (Windows and macOS folders ignore case): files and folders in
    // both spellings of each config folder, other skill roots, config entries and built-ins.
    const takenNames = async (global: Record<string, unknown>) => {
      const names = async (dirs: string[], strip: RegExp) =>
        (await Promise.all(dirs.map((dir) => readdir(dir).catch(() => [] as string[])))).flat().map((name) => name.replace(strip, ""))
      const home = os.homedir()
      const lower = (values: string[]) => new Set(values.map((value) => value.toLowerCase()))
      return {
        skills: lower([
          ...(await names(
            [
              path.join(Global.Path.config, "skills"),
              path.join(Global.Path.config, "skill"),
              path.join(home, ".claude", "skills"),
              path.join(home, ".agents", "skills"),
            ],
            /$^/,
          )),
          ...BUILTIN.skills,
        ]),
        commands: lower([
          ...(await names([path.join(Global.Path.config, "command"), path.join(Global.Path.config, "commands")], /\.md$/)),
          ...Object.keys(isObject(global.command) ? global.command : {}),
          ...BUILTIN.commands,
        ]),
        agents: lower([
          ...(await names([path.join(Global.Path.config, "agent"), path.join(Global.Path.config, "agents")], /\.md$/)),
          ...Object.keys(isObject(global.agent) ? global.agent : {}),
          ...BUILTIN.agents,
        ]),
        mcp: lower(Object.keys(isObject(global.mcp) ? global.mcp : {})),
      }
    }

    const install = Effect.fn("Marketplace.install")(function* (id: string) {
      const snapshot = yield* catalog()
      const item = snapshot.items.find((entry) => entry.id === id)
      if (!item || item.type !== "plugin" || !item.plugin)
        return yield* new InstallError({ message: "This plugin cannot be installed from its source." })
      const source = item.plugin
      const files = yield* Effect.tryPromise({
        try: () => MarketplaceInstaller.download(source),
        catch: (error) => new InstallError({ message: error instanceof Error ? error.message : String(error) }),
      })
      const key = MarketplaceCatalog.slug(item.id.replaceAll(":", "-"))
      const root = path.join(pluginsDir, key)
      const plan = MarketplaceInstaller.plan(files, { format: source.format, root, paths: folderVariables(), source })
      if (plan.skills.length + plan.commands.length + plan.agents.length + Object.keys(plan.mcp).length === 0)
        return yield* new InstallError({
          message: `Nothing in this plugin works in Tiancode yet (${plan.skipped.join(", ") || "no skills, commands, agents or MCP servers"}).`,
        })

      return yield* lock.withPermits(1)(
        Effect.gen(function* () {
          const manifest = yield* manifestOrFail
          const previous = manifest[item.id]
          const global = (yield* config.getGlobal()) as Record<string, unknown>
          const taken = yield* Effect.promise(() => takenNames(global))
          // Names another installed plugin owns count as taken; this plugin's own may be reused.
          for (const entry of Object.values(manifest))
            if (entry.id !== item.id)
              for (const kind of ["skills", "commands", "agents", "mcp"] as const)
                for (const name of entry[kind]) taken[kind].add(name.toLowerCase())
          const owned = (kind: Kind, name: string) => previous?.[kind].some((own) => own.toLowerCase() === name.toLowerCase()) ?? false
          // A name in use gets the plugin's name in front, then a number, until one is free.
          const pick = (kind: Kind, name: string) => {
            const candidates = [name, `${item.name}-${name}`, ...Array.from({ length: 20 }, (_, index) => `${item.name}-${name}-${index + 2}`)]
            const chosen = candidates.find((candidate) => !taken[kind].has(candidate.toLowerCase()) || owned(kind, candidate))
            if (!chosen) throw new Error(`no free name for ${name}`)
            taken[kind].add(chosen.toLowerCase())
            return chosen
          }

          const written: Installed = {
            id: item.id,
            name: item.name,
            title: item.title,
            source: item.source,
            installedAt: Date.now(),
            skills: [],
            commands: [],
            agents: [],
            mcp: [],
            skipped: plan.skipped,
          }
          // Whatever was written is recorded even when a later step fails (with what an earlier
          // install had), so uninstall can still remove all of it.
          const union = (kind: Kind) => [...new Set([...(previous?.[kind] ?? []), ...written[kind]])]
          const record = () =>
            writeManifest({
              ...manifest,
              [item.id]: {
                ...written,
                skills: union("skills"),
                commands: union("commands"),
                agents: union("agents"),
                mcp: union("mcp"),
              },
            })
          const fail = (error: unknown) =>
            new InstallError({ message: `The plugin could not be written: ${error instanceof Error ? error.message : String(error)}` })

          yield* Effect.tryPromise({
            try: async () => {
              // The raw copy goes to a temporary folder first, so a failed write keeps the previous one.
              await rm(`${root}.tmp`, { recursive: true, force: true })
              for (const file of files) await writeInside(`${root}.tmp`, file.path, file.bytes)
              await rm(root, { recursive: true, force: true })
              await rename(`${root}.tmp`, root)
              for (const skill of plan.skills) {
                const name = pick("skills", skill.name)
                const dir = path.join(Global.Path.config, "skills", name)
                await rm(dir, { recursive: true, force: true })
                written.skills.push(name)
                for (const file of skill.files)
                  await writeInside(
                    dir,
                    file.path,
                    file.path === "SKILL.md"
                      ? MarketplaceInstaller.skillFile(new TextDecoder().decode(file.content), name, root)
                      : file.content,
                  )
              }
              for (const command of plan.commands) {
                const name = pick("commands", command.name)
                written.commands.push(name)
                await writeInside(path.join(Global.Path.config, "command"), `${name}.md`, command.content)
              }
              for (const agent of plan.agents) {
                const name = pick("agents", agent.name)
                written.agents.push(name)
                await writeInside(path.join(Global.Path.config, "agent"), `${name}.md`, agent.content)
              }
            },
            catch: fail,
          }).pipe(Effect.tapError(() => Effect.promise(() => record().catch(() => undefined))))

          // MCP servers arrive turned off: a plugin's command or URL runs only once the user has seen
          // it in MCP y Plugins and switched it on, as with any other server.
          const mcp = yield* Effect.try({
            try: () =>
              Object.fromEntries(
                Object.entries(plan.mcp).map(([name, entry]) => {
                  const target = pick("mcp", name)
                  written.mcp.push(target)
                  return [target, { ...mcpConfig(entry), enabled: false }]
                }),
              ),
            catch: fail,
          }).pipe(Effect.tapError(() => Effect.promise(() => record().catch(() => undefined))))
          if (Object.keys(mcp).length)
            yield* config.updateGlobal({ mcp } as Parameters<typeof config.updateGlobal>[0]).pipe(
              Effect.catchCause((cause) =>
                Effect.promise(() => record().catch(() => undefined)).pipe(
                  Effect.andThen(Effect.fail(fail(Cause.squash(cause)))),
                ),
              ),
            )

          // What an earlier install of this plugin added and this one did not is removed.
          if (previous) {
            const stale = (kind: Kind) => previous[kind].filter((name) => !written[kind].includes(name))
            yield* Effect.promise(async () => {
              for (const name of stale("skills"))
                await rm(inside(path.join(Global.Path.config, "skills"), name), { recursive: true, force: true }).catch(() => undefined)
              for (const name of stale("commands"))
                await rm(inside(path.join(Global.Path.config, "command"), `${name}.md`), { force: true }).catch(() => undefined)
              for (const name of stale("agents"))
                await rm(inside(path.join(Global.Path.config, "agent"), `${name}.md`), { force: true }).catch(() => undefined)
            })
            for (const name of stale("mcp")) yield* config.removeGlobalMcp(name).pipe(Effect.ignore)
          }
          yield* Effect.tryPromise({ try: () => writeManifest({ ...manifest, [item.id]: written }), catch: fail })
          return written
        }),
      )
    })

    const uninstall = Effect.fn("Marketplace.uninstall")(function* (id: string) {
      return yield* lock.withPermits(1)(
        Effect.gen(function* () {
          const manifest = yield* manifestOrFail
          const entry = manifest[id]
          if (!entry) return false
          // Config first: a server left in the config would point at files that are gone.
          for (const name of entry.mcp) yield* config.removeGlobalMcp(name).pipe(Effect.ignore)
          yield* Effect.promise(async () => {
            for (const name of entry.skills)
              await rm(inside(path.join(Global.Path.config, "skills"), name), { recursive: true, force: true }).catch(() => undefined)
            for (const name of entry.commands)
              await rm(inside(path.join(Global.Path.config, "command"), `${name}.md`), { force: true }).catch(() => undefined)
            for (const name of entry.agents)
              await rm(inside(path.join(Global.Path.config, "agent"), `${name}.md`), { force: true }).catch(() => undefined)
            await rm(path.join(pluginsDir, MarketplaceCatalog.slug(id.replaceAll(":", "-"))), { recursive: true, force: true }).catch(
              () => undefined,
            )
          })
          const { [id]: _, ...rest } = manifest
          yield* Effect.tryPromise({
            try: () => writeManifest(rest),
            catch: (error) => new InstallError({ message: error instanceof Error ? error.message : String(error) }),
          })
          return true
        }),
      )
    })

    return Service.of({ catalog, search, icon, installed, install, uninstall })
  }),
)

/** Folder variables a plugin's MCP config may use, resolved here (see MarketplaceCatalog.envPlaceholders). */
function folderVariables() {
  const home = os.homedir()
  return Object.fromEntries(
    Object.entries({
      HOME: home,
      USERPROFILE: home,
      TMPDIR: os.tmpdir(),
      TEMP: process.env.TEMP ?? os.tmpdir(),
      TMP: process.env.TMP ?? os.tmpdir(),
      APPDATA: process.env.APPDATA,
      LOCALAPPDATA: process.env.LOCALAPPDATA,
      PROGRAMFILES: process.env.PROGRAMFILES,
      PROGRAMDATA: process.env.PROGRAMDATA,
      XDG_CONFIG_HOME: process.env.XDG_CONFIG_HOME,
      XDG_DATA_HOME: process.env.XDG_DATA_HOME,
      XDG_CACHE_HOME: process.env.XDG_CACHE_HOME,
      XDG_STATE_HOME: process.env.XDG_STATE_HOME,
    }).filter((entry): entry is [string, string] => typeof entry[1] === "string" && entry[1].length > 0),
  )
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function mcpConfig(entry: McpInstall) {
  if (entry.transport === "remote")
    return { type: "remote" as const, url: entry.url!, ...(entry.headers ? { headers: entry.headers } : {}) }
  return {
    type: "local" as const,
    command: entry.command ?? [],
    ...(entry.environment ? { environment: entry.environment } : {}),
  }
}

/** `dir/relative`, refusing anything that would leave `dir`. */
function inside(dir: string, relative: string) {
  const target = path.resolve(dir, relative)
  if (target !== path.resolve(dir) && !target.startsWith(path.resolve(dir) + path.sep)) throw new Error(`refused path ${relative}`)
  return target
}

async function writeInside(dir: string, relative: string, content: Uint8Array | string) {
  const target = inside(dir, relative)
  await mkdir(path.dirname(target), { recursive: true })
  await writeFile(target, content)
}

export const node = makeGlobalNode({ service: Service, layer, deps: [Config.node] })
