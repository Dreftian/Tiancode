import { LayerNode } from "@tiancode-ai/core/effect/layer-node"
import path from "path"
import { Effect, Layer, Option, Record, Result, Schema, Context } from "effect"
import { NonNegativeInt } from "@tiancode-ai/core/schema"
import { Global } from "@tiancode-ai/core/global"
import { FSUtil } from "@tiancode-ai/core/fs-util"
import { isSealed, open, readCredentialKey, seal } from "@tiancode-ai/core/credential/cipher"

export const OAUTH_DUMMY_KEY = "tiancode-oauth-dummy-key"

const file = path.join(Global.Path.data, "auth.json")

const fail = (message: string) => (cause: unknown) => new AuthError({ message, cause })

export class Oauth extends Schema.Class<Oauth>("OAuth")({
  type: Schema.Literal("oauth"),
  refresh: Schema.String,
  access: Schema.String,
  expires: NonNegativeInt,
  accountId: Schema.optional(Schema.String),
  enterpriseUrl: Schema.optional(Schema.String),
}) {}

export class Api extends Schema.Class<Api>("ApiAuth")({
  type: Schema.Literal("api"),
  key: Schema.String,
  metadata: Schema.optional(Schema.Record(Schema.String, Schema.String)),
}) {}

export class WellKnown extends Schema.Class<WellKnown>("WellKnownAuth")({
  type: Schema.Literal("wellknown"),
  key: Schema.String,
  token: Schema.String,
}) {}

export const Info = Schema.Union([Oauth, Api, WellKnown]).annotate({ discriminator: "type", identifier: "Auth" })
export type Info = Schema.Schema.Type<typeof Info>

export class AuthError extends Schema.TaggedErrorClass<AuthError>()("AuthError", {
  message: Schema.String,
  cause: Schema.optional(Schema.Defect()),
}) {}

export interface Interface {
  readonly get: (providerID: string) => Effect.Effect<Info | undefined, AuthError>
  readonly all: () => Effect.Effect<Record<string, Info>, AuthError>
  readonly set: (key: string, info: Info) => Effect.Effect<void, AuthError>
  readonly remove: (key: string) => Effect.Effect<void, AuthError>
}

export class Service extends Context.Service<Service, Interface>()("@tiancode/Auth") {}

const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const fsys = yield* FSUtil.Service
    const decode = Schema.decodeUnknownOption(Info)
    // auth.json guarda las claves de proveedor en texto plano; con la clave
    // del escritorio (TIANCODE_CREDENTIAL_KEY) cada valor se cifra con el
    // mismo envelope AES-GCM que la tabla de credenciales.
    const key = readCredentialKey()
    const encode = (info: Info): unknown => (key === undefined ? info : seal(JSON.stringify(info), key))
    const decodeStored = (value: unknown): Option.Option<Info> => {
      if (typeof value === "string" && isSealed(value)) {
        if (key === undefined) return Option.none()
        const plain = open(value, key)
        if (plain === undefined) return Option.none()
        return decode(JSON.parse(plain))
      }
      return decode(value)
    }

    const all = Effect.fn("Auth.all")(function* () {
      if (process.env.TIANCODE_AUTH_CONTENT) {
        try {
          const data = JSON.parse(process.env.TIANCODE_AUTH_CONTENT) as Record<string, unknown>
          return Record.filterMap(data, (value) => Result.fromOption(decodeStored(value), () => undefined))
        } catch (err) {
          yield* Effect.logWarning("malformed TIANCODE_AUTH_CONTENT; falling back to auth.json").pipe(
            Effect.annotateLogs({ error: String(err) }),
          )
        }
      }

      const data = (yield* fsys.readJson(file).pipe(Effect.orElseSucceed(() => ({})))) as Record<string, unknown>
      return Record.filterMap(data, (value) => Result.fromOption(decodeStored(value), () => undefined))
    })

    const get = Effect.fn("Auth.get")(function* (providerID: string) {
      return (yield* all())[providerID]
    })

    const set = Effect.fn("Auth.set")(function* (key: string, info: Info) {
      const norm = key.replace(/\/+$/, "")
      const data = yield* all()
      if (norm !== key) delete data[key]
      delete data[norm + "/"]
      yield* fsys
        .writeJson(file, { ...data, [norm]: encode(info) }, 0o600)
        .pipe(Effect.mapError(fail("Failed to write auth data")))
    })

    const remove = Effect.fn("Auth.remove")(function* (key: string) {
      const norm = key.replace(/\/+$/, "")
      const data = yield* all()
      delete data[key]
      delete data[norm]
      yield* fsys.writeJson(file, data, 0o600).pipe(Effect.mapError(fail("Failed to write auth data")))
    })

    // Migración única: con clave disponible, re-cifra los valores que siguen
    // en texto plano de antes de que existiera el cifrado.
    const migrateAtRest = Effect.fn("Auth.migrateAtRest")(function* () {
      if (key === undefined) return
      const data = (yield* fsys.readJson(file).pipe(Effect.orElseSucceed(() => ({})))) as Record<string, unknown>
      if (!Object.values(data).some((value) => typeof value !== "string")) return
      yield* fsys
        .writeJson(
          file,
          Record.map(data, (value) => (typeof value === "string" ? value : seal(JSON.stringify(value), key))),
          0o600,
        )
        .pipe(Effect.mapError(fail("Failed to migrate auth data")))
    })
    yield* migrateAtRest().pipe(Effect.catch((error) => Effect.logError("failed to migrate auth data", { error })))

    return Service.of({ get, all, set, remove })
  }),
)

export const node = LayerNode.make({ service: Service, layer: layer, deps: [FSUtil.node] })

export * as Auth from "."
