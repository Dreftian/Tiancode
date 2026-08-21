import { ServerAuth } from "@/server/auth"
import { Effect, Encoding, Layer, Option, Redacted } from "effect"
import { HttpEffect, HttpRouter, HttpServerRequest, HttpServerResponse } from "effect/unstable/http"
import { HttpApiError, HttpApiMiddleware } from "effect/unstable/httpapi"
import { hasPtyConnectTicketURL } from "@/server/shared/pty-ticket"
import { isPublicUIPath } from "@/server/shared/public-ui"
export {
  Authorization as ServerAuthorization,
  authorizationLayer as serverAuthorizationLayer,
} from "@tiancode-ai/server/middleware/authorization"

const AUTH_TOKEN_QUERY = "auth_token"
const UNAUTHORIZED = 401
const TOO_MANY_REQUESTS = 429
const WWW_AUTHENTICATE = 'Basic realm="Secure Area"'

// --- Basic-auth brute-force guard ---------------------------------------------
// Failed credential attempts are limited per client IP (10 failures per
// 15 minutes) and answered with 429 + Retry-After instead of 401. The map is
// in-memory (single-process server) and pruned periodically so it never grows
// unbounded. Only requests that actually presented a credential count, so
// unauthenticated browsing is never throttled.
const MAX_FAILED_AUTH_ATTEMPTS = 10
const AUTH_LIMIT_WINDOW_MS = 15 * 60 * 1000
const RETRY_AFTER_SECONDS = Math.ceil(AUTH_LIMIT_WINDOW_MS / 1000)

interface AuthAttempts {
  readonly count: number
  readonly windowStart: number
}

const authFailures = new Map<string, AuthAttempts>()

function recordAuthFailure(ip: string) {
  const now = Date.now()
  const current = authFailures.get(ip)
  const inWindow = current !== undefined && now - current.windowStart < AUTH_LIMIT_WINDOW_MS
  authFailures.set(ip, {
    count: inWindow ? current.count + 1 : 1,
    windowStart: inWindow ? current.windowStart : now,
  })
}

function isAuthLimited(ip: string) {
  const current = authFailures.get(ip)
  return (
    current !== undefined &&
    Date.now() - current.windowStart < AUTH_LIMIT_WINDOW_MS &&
    current.count >= MAX_FAILED_AUTH_ATTEMPTS
  )
}

// Periodic cleanup of expired windows; unref'd so it never keeps the process
// alive by itself.
setInterval(() => {
  const now = Date.now()
  for (const [ip, attempts] of authFailures) {
    if (now - attempts.windowStart >= AUTH_LIMIT_WINDOW_MS) authFailures.delete(ip)
  }
}, AUTH_LIMIT_WINDOW_MS).unref()

// The rate limit is keyed by the peer address only: the server is local-first
// and binds loopback by default, so honoring X-Forwarded-For here would let a
// local client rotate the header to bypass the limit.
const clientIP = (request: HttpServerRequest.HttpServerRequest) =>
  Option.getOrElse(request.remoteAddress, () => "unknown")

const presentedCredential = (url: URL, request: HttpServerRequest.HttpServerRequest) =>
  url.searchParams.has(AUTH_TOKEN_QUERY) || /^Basic\s+/i.test(request.headers.authorization ?? "")

function tooManyRequestsResponse() {
  return HttpServerResponse.empty({
    status: TOO_MANY_REQUESTS,
    headers: { "retry-after": String(RETRY_AFTER_SECONDS) },
  })
}

// Avoid HttpApiSecurity alternatives here: Effect security middleware wraps the
// full handler, so a downstream failure can make the next auth alternative run
// and remap an authorized NotFound into Unauthorized.
export class Authorization extends HttpApiMiddleware.Service<Authorization>()(
  "@tiancode/ExperimentalHttpApiAuthorization",
  {
    error: HttpApiError.UnauthorizedNoContent,
  },
) {}

export class PtyConnectAuthorization extends HttpApiMiddleware.Service<PtyConnectAuthorization>()(
  "@tiancode/ExperimentalHttpApiPtyConnectAuthorization",
  {
    error: HttpApiError.UnauthorizedNoContent,
  },
) {}

function emptyCredential() {
  return {
    username: "",
    password: Redacted.make(""),
  }
}

function validateCredential<A, E, R>(
  effect: Effect.Effect<A, E, R>,
  credential: ServerAuth.DecodedCredentials,
  config: ServerAuth.Info,
  ip: string,
  presented: boolean,
) {
  return Effect.gen(function* () {
    if (!ServerAuth.required(config)) return yield* effect
    if (isAuthLimited(ip)) return tooManyRequestsResponse()
    if (!ServerAuth.authorized(credential, config)) {
      if (presented) recordAuthFailure(ip)
      yield* HttpEffect.appendPreResponseHandler((_request, response) =>
        Effect.succeed(HttpServerResponse.setHeader(response, "www-authenticate", WWW_AUTHENTICATE)),
      )
      return yield* new HttpApiError.Unauthorized({})
    }
    return yield* effect
  })
}

function decodeCredential(input: string) {
  return Effect.fromResult(Encoding.decodeBase64String(input)).pipe(
    Effect.match({
      onFailure: emptyCredential,
      onSuccess: (header) => {
        const separator = header.indexOf(":")
        if (separator === -1) return emptyCredential()
        return {
          username: header.slice(0, separator),
          password: Redacted.make(header.slice(separator + 1)),
        }
      },
    }),
  )
}

function credentialFromURL(url: URL, request: HttpServerRequest.HttpServerRequest) {
  const token = url.searchParams.get(AUTH_TOKEN_QUERY)
  if (token) return decodeCredential(token)
  const match = /^Basic\s+(.+)$/i.exec(request.headers.authorization ?? "")
  if (match) return decodeCredential(match[1])
  return Effect.succeed(emptyCredential())
}

function validateRawCredential<A, E, R>(
  effect: Effect.Effect<A, E, R>,
  credential: ServerAuth.DecodedCredentials,
  config: ServerAuth.Info,
  ip: string,
  presented: boolean,
) {
  if (!ServerAuth.required(config)) return effect
  if (isAuthLimited(ip)) return Effect.succeed(tooManyRequestsResponse())
  if (!ServerAuth.authorized(credential, config)) {
    if (presented) recordAuthFailure(ip)
    return Effect.succeed(
      HttpServerResponse.empty({
        status: UNAUTHORIZED,
        headers: { "www-authenticate": WWW_AUTHENTICATE },
      }),
    )
  }
  return effect
}

export const authorizationRouterMiddleware = HttpRouter.middleware()(
  Effect.gen(function* () {
    const config = yield* ServerAuth.Config
    if (!ServerAuth.required(config)) return (effect) => effect

    return (effect) =>
      Effect.gen(function* () {
        const request = yield* HttpServerRequest.HttpServerRequest
        const url = new URL(request.url, "http://localhost")
        if (isPublicUIPath(request.method, url.pathname)) return yield* effect
        return yield* credentialFromURL(url, request).pipe(
          Effect.flatMap((credential) =>
            validateRawCredential(effect, credential, config, clientIP(request), presentedCredential(url, request)),
          ),
        )
      })
  }),
)

export const authorizationLayer = Layer.effect(
  Authorization,
  Effect.gen(function* () {
    const config = yield* ServerAuth.Config
    if (!ServerAuth.required(config)) return Authorization.of((effect) => effect)
    return Authorization.of((effect) =>
      Effect.gen(function* () {
        const request = yield* HttpServerRequest.HttpServerRequest
        const url = new URL(request.url, "http://localhost")
        return yield* credentialFromURL(url, request).pipe(
          Effect.flatMap((credential) =>
            validateCredential(effect, credential, config, clientIP(request), presentedCredential(url, request)),
          ),
        )
      }),
    )
  }),
)

export const ptyConnectAuthorizationLayer = Layer.effect(
  PtyConnectAuthorization,
  Effect.gen(function* () {
    const config = yield* ServerAuth.Config
    if (!ServerAuth.required(config)) return PtyConnectAuthorization.of((effect) => effect)
    return PtyConnectAuthorization.of((effect) =>
      Effect.gen(function* () {
        const request = yield* HttpServerRequest.HttpServerRequest
        const url = new URL(request.url, "http://localhost")
        if (hasPtyConnectTicketURL(url)) return yield* effect
        return yield* credentialFromURL(url, request).pipe(
          Effect.flatMap((credential) =>
            validateCredential(effect, credential, config, clientIP(request), presentedCredential(url, request)),
          ),
        )
      }),
    )
  }),
)
