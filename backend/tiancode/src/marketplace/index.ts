export * as Marketplace from "."

import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises"
import path from "node:path"
import { Context, Effect, Layer, Schema, Semaphore } from "effect"
import { makeGlobalNode } from "@tiancode-ai/core/effect/app-node"
import { Global } from "@tiancode-ai/core/global"
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
  readonly uninstall: (id: string) => Effect.Effect<boolean>
}

export class Service extends Context.Service<Service, Interface>()("@tiancode/Marketplace") {}

// The mirrored catalogs change a few times a day at most; their maintainers ask aggregators to
// refresh no more than hourly.
const FRESH_MS = 6 * 60 * 60 * 1000
const ICON_FRESH_MS = 30 * 24 * 60 * 60 * 1000
const ICON_MISS_MS = 24 * 60 * 60 * 1000

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
      icons: new Map<string, string | null>(),
    }

    const readDisk = async () => {
      const text = await readFile(path.join(cacheDir, "catalog.json"), "utf8").catch(() => undefined)
      if (!text) return
      const value = JSON.parse(text) as Snapshot
      return Array.isArray(value.items) && Array.isArray(value.connectors) ? value : undefined
    }

    const refresh = () => {
      state.refreshing ??= MarketplaceSources.fetchAll()
        .then(async (next) => {
          // A run where most sources failed must not replace a good list with a thin one.
          const previous = state.snapshot?.items.length ?? 0
          if (next.items.length < Math.min(200, previous / 2)) return state.snapshot
          state.snapshot = next
          await mkdir(cacheDir, { recursive: true })
          await writeFile(path.join(cacheDir, "catalog.json"), JSON.stringify(next))
          return next
        })
        .catch(() => state.snapshot)
        .finally(() => {
          state.refreshing = undefined
        })
      return state.refreshing
    }

    const catalog = Effect.fn("Marketplace.catalog")(function* () {
      return yield* Effect.promise(async () => {
        if (!state.snapshot) {
          const disk = await readDisk().catch(() => undefined)
          state.snapshot = disk ?? MarketplaceSnapshot.load()
          // The bundled copy leaves out the community marketplace; the first online refresh adds it.
          if (!disk) void refresh()
        }
        if (Date.now() - state.snapshot.fetchedAt > FRESH_MS) void refresh()
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

    const icon = Effect.fn("Marketplace.icon")(function* (domain: string) {
      const snapshot = yield* catalog()
      const host = MarketplaceCatalog.domainOf(domain)
      // Only the sites the catalog names: this must not become a way to make the backend fetch anything.
      if (!host || !knownDomains(snapshot).has(host)) return undefined
      return yield* Effect.promise(async () => {
        const memory = state.icons.get(host)
        if (memory !== undefined) return memory ?? undefined
        const file = path.join(cacheDir, "icons", `${host}.txt`)
        const cached = await readFile(file, "utf8").catch(() => undefined)
        if (cached) {
          const [stamp, value] = [Number(cached.slice(0, cached.indexOf(" "))), cached.slice(cached.indexOf(" ") + 1)]
          const age = Date.now() - stamp
          if (value === "-" ? age < ICON_MISS_MS : age < ICON_FRESH_MS) {
            state.icons.set(host, value === "-" ? null : value)
            return value === "-" ? undefined : value
          }
        }
        const resolved = await MarketplaceIcons.resolve(host).catch(() => undefined)
        state.icons.set(host, resolved ?? null)
        await mkdir(path.dirname(file), { recursive: true })
        await writeFile(file, `${Date.now()} ${resolved ?? "-"}`).catch(() => undefined)
        return resolved
      })
    })

    const readManifest = async (): Promise<Record<string, Installed>> => {
      const text = await readFile(manifestFile, "utf8").catch(() => undefined)
      if (!text) return {}
      const value: unknown = JSON.parse(text)
      return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, Installed>) : {}
    }
    const writeManifest = async (value: Record<string, Installed>) => {
      await mkdir(path.dirname(manifestFile), { recursive: true })
      await writeFile(manifestFile, JSON.stringify(value, null, 2))
    }

    const installed = Effect.fn("Marketplace.installed")(function* () {
      return yield* Effect.promise(async () => Object.values(await readManifest().catch(() => ({}))))
    })

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
      const key = MarketplaceCatalog.slug(item.id.replace(":", "-"))
      const root = path.join(pluginsDir, key)
      const plan = MarketplaceInstaller.plan(files, { format: source.format, root })
      if (plan.skills.length + plan.commands.length + plan.agents.length + Object.keys(plan.mcp).length === 0)
        return yield* new InstallError({
          message: `Nothing in this plugin works in Tiancode yet (${plan.skipped.join(", ") || "no skills, commands, agents or MCP servers"}).`,
        })

      return yield* lock.withPermits(1)(
        Effect.gen(function* () {
          const manifest = yield* Effect.promise(() => readManifest().catch(() => ({}) as Record<string, Installed>))
          const previous = manifest[item.id]
          const global = yield* config.getGlobal()
          const owned = (kind: "skills" | "commands" | "agents" | "mcp", name: string) =>
            previous?.[kind].includes(name) ?? false
          const taken = yield* Effect.promise(async () => ({
            skills: new Set(await readdir(path.join(Global.Path.config, "skills")).catch(() => [] as string[])),
            commands: new Set(
              (await readdir(path.join(Global.Path.config, "command")).catch(() => [] as string[])).map((file) =>
                file.replace(/\.md$/, ""),
              ),
            ),
            agents: new Set(
              (await readdir(path.join(Global.Path.config, "agent")).catch(() => [] as string[])).map((file) =>
                file.replace(/\.md$/, ""),
              ),
            ),
            mcp: new Set(Object.keys(global.mcp ?? {})),
          }))
          // A name someone else already uses gets the plugin's name in front, so nothing is overwritten.
          const pick = (kind: "skills" | "commands" | "agents" | "mcp", name: string) =>
            !taken[kind].has(name) || owned(kind, name) ? name : `${item.name}-${name}`

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
          yield* Effect.promise(async () => {
            await rm(root, { recursive: true, force: true })
            for (const file of files) await writeInside(root, file.path, file.bytes)
            for (const skill of plan.skills) {
              const name = pick("skills", skill.name)
              const dir = path.join(Global.Path.config, "skills", name)
              await rm(dir, { recursive: true, force: true })
              for (const file of skill.files) await writeInside(dir, file.path, file.content)
              written.skills.push(name)
            }
            for (const command of plan.commands) {
              const name = pick("commands", command.name)
              await writeInside(path.join(Global.Path.config, "command"), `${name}.md`, command.content)
              written.commands.push(name)
            }
            for (const agent of plan.agents) {
              const name = pick("agents", agent.name)
              await writeInside(path.join(Global.Path.config, "agent"), `${name}.md`, agent.content)
              written.agents.push(name)
            }
          })
          const mcp = Object.fromEntries(
            Object.entries(plan.mcp).map(([name, entry]) => {
              const target = pick("mcp", name)
              written.mcp.push(target)
              return [target, mcpConfig(entry)]
            }),
          )
          if (Object.keys(mcp).length) yield* config.updateGlobal({ mcp } as Parameters<typeof config.updateGlobal>[0])
          yield* Effect.promise(() => writeManifest({ ...manifest, [item.id]: written }))
          return written
        }),
      )
    })

    const uninstall = Effect.fn("Marketplace.uninstall")(function* (id: string) {
      return yield* lock.withPermits(1)(
        Effect.gen(function* () {
          const manifest = yield* Effect.promise(() => readManifest().catch(() => ({}) as Record<string, Installed>))
          const entry = manifest[id]
          if (!entry) return false
          yield* Effect.promise(async () => {
            for (const name of entry.skills) await rm(inside(path.join(Global.Path.config, "skills"), name), { recursive: true, force: true })
            for (const name of entry.commands) await rm(inside(path.join(Global.Path.config, "command"), `${name}.md`), { force: true })
            for (const name of entry.agents) await rm(inside(path.join(Global.Path.config, "agent"), `${name}.md`), { force: true })
            await rm(path.join(pluginsDir, MarketplaceCatalog.slug(id.replace(":", "-"))), { recursive: true, force: true })
          })
          for (const name of entry.mcp) yield* config.removeGlobalMcp(name)
          const { [id]: _, ...rest } = manifest
          yield* Effect.promise(() => writeManifest(rest))
          return true
        }),
      )
    })

    return Service.of({ catalog, search, icon, installed, install, uninstall })
  }),
)

function mcpConfig(entry: McpInstall) {
  if (entry.transport === "remote")
    return { type: "remote" as const, url: entry.url!, ...(entry.headers ? { headers: entry.headers } : {}), enabled: true }
  return {
    type: "local" as const,
    command: entry.command ?? [],
    ...(entry.environment ? { environment: entry.environment } : {}),
    enabled: true,
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
