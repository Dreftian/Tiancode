import { LayerNode } from "@tiancode-ai/core/effect/layer-node"
import path from "path"
import { serviceUse } from "@tiancode-ai/core/effect/service-use"
import { Global } from "@tiancode-ai/core/global"
import { Effect, Layer, Context, Option, Record, Result, Schema } from "effect"
import { FSUtil } from "@tiancode-ai/core/fs-util"
import { EffectFlock } from "@tiancode-ai/core/util/effect-flock"
import { isSealed, open, readCredentialKey, seal } from "@tiancode-ai/core/credential/cipher"

export const Tokens = Schema.Struct({
  accessToken: Schema.mutableKey(Schema.String),
  refreshToken: Schema.mutableKey(Schema.optional(Schema.String)),
  expiresAt: Schema.mutableKey(Schema.optional(Schema.Number)),
  scope: Schema.mutableKey(Schema.optional(Schema.String)),
})
export type Tokens = Schema.Schema.Type<typeof Tokens>

export const ClientInfo = Schema.Struct({
  clientId: Schema.mutableKey(Schema.String),
  clientSecret: Schema.mutableKey(Schema.optional(Schema.String)),
  clientIdIssuedAt: Schema.mutableKey(Schema.optional(Schema.Number)),
  clientSecretExpiresAt: Schema.mutableKey(Schema.optional(Schema.Number)),
})
export type ClientInfo = Schema.Schema.Type<typeof ClientInfo>

export const Entry = Schema.Struct({
  tokens: Schema.mutableKey(Schema.optional(Tokens)),
  clientInfo: Schema.mutableKey(Schema.optional(ClientInfo)),
  codeVerifier: Schema.mutableKey(Schema.optional(Schema.String)),
  oauthState: Schema.mutableKey(Schema.optional(Schema.String)),
  serverUrl: Schema.mutableKey(Schema.optional(Schema.String)),
})
export type Entry = Schema.Schema.Type<typeof Entry>

type AuthData = Record<string, Entry>

const filepath = path.join(Global.Path.data, "mcp-auth.json")
const lockKey = `mcp-auth:${filepath}`

export interface Interface {
  readonly all: () => Effect.Effect<Record<string, Entry>>
  readonly get: (mcpName: string) => Effect.Effect<Entry | undefined>
  readonly getForUrl: (mcpName: string, serverUrl: string) => Effect.Effect<Entry | undefined>
  readonly set: (mcpName: string, entry: Entry, serverUrl?: string) => Effect.Effect<void>
  readonly remove: (mcpName: string) => Effect.Effect<void>
  readonly updateTokens: (mcpName: string, tokens: Tokens, serverUrl?: string) => Effect.Effect<void>
  readonly updateClientInfo: (mcpName: string, clientInfo: ClientInfo, serverUrl?: string) => Effect.Effect<void>
  readonly updateCodeVerifier: (mcpName: string, codeVerifier: string) => Effect.Effect<void>
  readonly clearCodeVerifier: (mcpName: string) => Effect.Effect<void>
  readonly updateOAuthState: (mcpName: string, oauthState: string) => Effect.Effect<void>
  readonly getOAuthState: (mcpName: string) => Effect.Effect<string | undefined>
  readonly clearOAuthState: (mcpName: string) => Effect.Effect<void>
}

export class Service extends Context.Service<Service, Interface>()("@tiancode/McpAuth") {}

export const use = serviceUse(Service)

const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const fs = yield* FSUtil.Service
    const flock = yield* EffectFlock.Service
    // mcp-auth.json guarda tokens OAuth y secrets de cliente en texto plano;
    // con la clave del escritorio (TIANCODE_CREDENTIAL_KEY) cada entrada se
    // cifra con el mismo envelope AES-GCM que las credenciales.
    const key = readCredentialKey()
    const decodeEntry = (value: unknown): Option.Option<Entry> => {
      if (typeof value === "string" && isSealed(value)) {
        if (key === undefined) return Option.none()
        const plain = open(value, key)
        if (plain === undefined) return Option.none()
        return Schema.decodeUnknownOption(Entry)(JSON.parse(plain))
      }
      return Schema.decodeUnknownOption(Entry)(value)
    }
    const persist = Effect.fn("McpAuth.persist")(function* (data: AuthData) {
      const next = key === undefined ? data : Record.map(data, (entry) => seal(JSON.stringify(entry), key))
      yield* fs.writeJson(filepath, next, 0o600).pipe(Effect.orDie)
    })

    const read = Effect.fn("McpAuth.read")(function* () {
      return yield* fs.readJson(filepath).pipe(
        Effect.map(
          (data): AuthData =>
            Record.filterMap(data as Record<string, unknown>, (value) =>
              Result.fromOption(decodeEntry(value), () => undefined),
            ) as AuthData,
        ),
        Effect.catch(() => Effect.succeed({} as AuthData)),
      )
    })

    // Migración única: con clave disponible, re-cifra las entradas que siguen
    // en texto plano de antes de que existiera el cifrado.
    const migrateAtRest = Effect.fn("McpAuth.migrateAtRest")(function* () {
      if (key === undefined) return
      const raw = yield* fs.readJson(filepath).pipe(Effect.catch(() => Effect.succeed(undefined)))
      if (raw === undefined) return
      if (Object.values(raw as Record<string, unknown>).some((value) => typeof value !== "string"))
        yield* persist(yield* read())
    })
    yield* migrateAtRest()

    const all = Effect.fn("McpAuth.all")(function* () {
      return yield* read().pipe(flock.withLock(lockKey), Effect.orDie)
    })

    const mutate = Effect.fn("McpAuth.mutate")(function* (update: (data: AuthData) => AuthData | undefined) {
      yield* Effect.gen(function* () {
        const next = update(yield* read())
        if (!next) return
        yield* persist(next)
      }).pipe(flock.withLock(lockKey), Effect.orDie)
    })

    const get = Effect.fn("McpAuth.get")(function* (mcpName: string) {
      const data = yield* all()
      return data[mcpName]
    })

    const getForUrl = Effect.fn("McpAuth.getForUrl")(function* (mcpName: string, serverUrl: string) {
      const entry = yield* get(mcpName)
      if (!entry) return undefined
      if (!entry.serverUrl) return undefined
      if (entry.serverUrl !== serverUrl) return undefined
      return entry
    })

    const set = Effect.fn("McpAuth.set")(function* (mcpName: string, entry: Entry, serverUrl?: string) {
      yield* mutate((data) => ({
        ...data,
        [mcpName]: serverUrl ? { ...entry, serverUrl } : entry,
      }))
    })

    const remove = Effect.fn("McpAuth.remove")(function* (mcpName: string) {
      yield* mutate((data) => {
        const next = { ...data }
        delete next[mcpName]
        return next
      })
    })

    const updateField = <K extends keyof Entry>(field: K, spanName: string) =>
      Effect.fn(`McpAuth.${spanName}`)(function* (mcpName: string, value: NonNullable<Entry[K]>, serverUrl?: string) {
        yield* mutate((data) => {
          const entry = data[mcpName] ?? {}
          entry[field] = value
          if (serverUrl) entry.serverUrl = serverUrl
          return { ...data, [mcpName]: entry }
        })
      })

    const clearField = (field: keyof Entry, spanName: string) =>
      Effect.fn(`McpAuth.${spanName}`)(function* (mcpName: string) {
        yield* mutate((data) => {
          const entry = data[mcpName]
          if (!entry) return undefined
          delete entry[field]
          return { ...data, [mcpName]: entry }
        })
      })

    const updateTokens = updateField("tokens", "updateTokens")
    const updateClientInfo = updateField("clientInfo", "updateClientInfo")
    const updateCodeVerifier = updateField("codeVerifier", "updateCodeVerifier")
    const updateOAuthState = updateField("oauthState", "updateOAuthState")
    const clearCodeVerifier = clearField("codeVerifier", "clearCodeVerifier")
    const clearOAuthState = clearField("oauthState", "clearOAuthState")

    const getOAuthState = Effect.fn("McpAuth.getOAuthState")(function* (mcpName: string) {
      const entry = yield* get(mcpName)
      return entry?.oauthState
    })

    return Service.of({
      all,
      get,
      getForUrl,
      set,
      remove,
      updateTokens,
      updateClientInfo,
      updateCodeVerifier,
      clearCodeVerifier,
      updateOAuthState,
      getOAuthState,
      clearOAuthState,
    })
  }),
)

export const node = LayerNode.make({ service: Service, layer: layer, deps: [FSUtil.node, EffectFlock.node] })

export * as McpAuth from "./auth"
