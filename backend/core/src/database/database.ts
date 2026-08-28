export * as Database from "./database"

import { EffectDrizzleSqlite } from "@tiancode-ai/effect-drizzle-sqlite"
import { layer as sqliteLayer } from "#sqlite"
import { Context, Effect, Layer } from "effect"
import { Global } from "../global"
import { Flag } from "../flag/flag"
import { isAbsolute, join } from "path"
import { DatabaseMigration } from "./migration"
import { InstallationChannel } from "../installation/version"
import { makeGlobalNode } from "../effect/app-node"

const makeDatabase = EffectDrizzleSqlite.makeWithDefaults()
type DatabaseShape = Effect.Success<typeof makeDatabase>

export interface Interface {
  db: DatabaseShape
}

export class Service extends Context.Service<Service, Interface>()("@tiancode/v2/storage/Database") {}

const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const db = yield* makeDatabase

    yield* db.run("PRAGMA journal_mode = WAL").pipe(Effect.ignore)
    yield* db.run("PRAGMA synchronous = NORMAL").pipe(Effect.ignore)
    yield* db.run("PRAGMA busy_timeout = 5000").pipe(Effect.ignore)
    yield* db.run("PRAGMA cache_size = -64000").pipe(Effect.ignore)
    yield* db.run("PRAGMA foreign_keys = ON").pipe(Effect.ignore)
    yield* DatabaseMigration.apply(db)

    return { db }
  }).pipe(Effect.orDie),
)

export function layerFromPath(filename: string) {
  return layer.pipe(Layer.provide(sqliteLayer({ filename })))
}

export function path() {
  if (Flag.TIANCODE_DB) {
    if (Flag.TIANCODE_DB === ":memory:" || isAbsolute(Flag.TIANCODE_DB)) return Flag.TIANCODE_DB
    return join(Global.Path.data, Flag.TIANCODE_DB)
  }
  if (
    ["latest", "beta", "prod"].includes(InstallationChannel) ||
    process.env.TIANCODE_DISABLE_CHANNEL_DB === "1" ||
    process.env.TIANCODE_DISABLE_CHANNEL_DB === "true"
  )
    return join(Global.Path.data, "tiancode.db")
  return join(Global.Path.data, `tiancode-${InstallationChannel.replace(/[^a-zA-Z0-9._-]/g, "-")}.db`)
}

export const node = makeGlobalNode({ service: Service, layer: layerFromPath(path()), deps: [] })
