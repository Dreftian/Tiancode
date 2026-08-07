export * as ServerAuth from "./auth"

import { timingSafeEqual } from "node:crypto"
import { ConfigService } from "@/effect/config-service"
import { Flag } from "@tiancode-ai/core/flag/flag"
import { Config as EffectConfig, Context, Option, Redacted } from "effect"

export type Credentials = {
  password?: string
  username?: string
}

export type DecodedCredentials = {
  readonly username: string
  readonly password: Redacted.Redacted
}

export class Config extends ConfigService.Service<Config>()("@tiancode/ServerAuthConfig", {
  password: EffectConfig.string("TIANCODE_SERVER_PASSWORD").pipe(EffectConfig.option),
  username: EffectConfig.string("TIANCODE_SERVER_USERNAME").pipe(EffectConfig.withDefault("tiancode")),
}) {}

export type Info = Context.Service.Shape<typeof Config>

export function required(config: Info) {
  return Option.isSome(config.password) && config.password.value !== ""
}

export function authorized(credentials: DecodedCredentials, config: Info) {
  if (!Option.isSome(config.password)) return false
  if (credentials.username !== config.username) return false
  // Comparación en tiempo constante para no filtrar información por timing.
  const expected = Buffer.from(config.password.value)
  const actual = Buffer.from(Redacted.value(credentials.password))
  return expected.length === actual.length && timingSafeEqual(expected, actual)
}

export function header(credentials?: Credentials) {
  const password = credentials?.password ?? Flag.TIANCODE_SERVER_PASSWORD
  if (!password) return undefined

  const username = credentials?.username ?? Flag.TIANCODE_SERVER_USERNAME ?? "tiancode"
  return `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`
}

export function headers(credentials?: Credentials) {
  const authorization = header(credentials)
  if (!authorization) return undefined
  return { Authorization: authorization }
}
