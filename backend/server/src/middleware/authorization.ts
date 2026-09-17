import { ServerAuth } from "../auth"
import { UnauthorizedError } from "@tiancode-ai/protocol/errors"
import { Authorization } from "@tiancode-ai/protocol/middleware/authorization"
export { Authorization } from "@tiancode-ai/protocol/middleware/authorization"
import { hasPtyConnectTicketURL } from "@tiancode-ai/protocol/groups/pty"
import { Effect, Encoding, Layer, Option, Redacted } from "effect"
import { HttpEffect, HttpServerRequest, HttpServerResponse } from "effect/unstable/http"
import { AuthThrottle } from "../security"

const AUTH_TOKEN_QUERY = "auth_token"
const WWW_AUTHENTICATE = 'Basic realm="Secure Area"'
// Ten wrong passwords in ten minutes lock the address for fifteen: enough to stop guessing, harmless
// for a user who mistyped once.
const throttle = new AuthThrottle()

function clientKey(request: HttpServerRequest.HttpServerRequest) {
  return Option.getOrElse(request.remoteAddress ?? Option.none<string>(), () => "unknown")
}

function emptyCredential() {
  return { username: "", password: Redacted.make("") }
}

function decodeCredential(input: string) {
  return Effect.fromResult(Encoding.decodeBase64String(input)).pipe(
    Effect.match({
      onFailure: emptyCredential,
      onSuccess: (header) => {
        const separator = header.indexOf(":")
        if (separator === -1) return emptyCredential()
        return { username: header.slice(0, separator), password: Redacted.make(header.slice(separator + 1)) }
      },
    }),
  )
}

function credentialFromRequest(request: HttpServerRequest.HttpServerRequest) {
  const url = new URL(request.url, "http://localhost")
  const token = url.searchParams.get(AUTH_TOKEN_QUERY)
  if (token) return decodeCredential(token)
  const match = /^Basic\s+(.+)$/i.exec(request.headers.authorization ?? "")
  if (match) return decodeCredential(match[1])
  return Effect.succeed(emptyCredential())
}

export const authorizationLayer = Layer.effect(
  Authorization,
  Effect.gen(function* () {
    const config = yield* ServerAuth.Config
    if (!ServerAuth.required(config)) return Authorization.of((effect) => effect)
    return Authorization.of((effect) =>
      Effect.gen(function* () {
        const request = yield* HttpServerRequest.HttpServerRequest
        // Browsers cannot set headers on WebSocket upgrades, so a ticketed PTY connect skips
        // credential checks here; the connect handler consumes and validates the ticket.
        if (hasPtyConnectTicketURL(new URL(request.url, "http://localhost"))) return yield* effect
        const key = clientKey(request)
        const locked = throttle.lockedFor(key)
        if (locked > 0) {
          yield* HttpEffect.appendPreResponseHandler((_request, response) =>
            Effect.succeed(HttpServerResponse.setHeader(response, "retry-after", String(locked))),
          )
          return yield* new UnauthorizedError({ message: "Too many failed authentication attempts; try again later" })
        }
        const credential = yield* credentialFromRequest(request)
        if (ServerAuth.authorized(credential, config)) {
          throttle.succeed(key)
          return yield* effect
        }
        if (Redacted.value(credential.password) !== "" || credential.username !== "") throttle.fail(key)
        yield* HttpEffect.appendPreResponseHandler((_request, response) =>
          Effect.succeed(HttpServerResponse.setHeader(response, "www-authenticate", WWW_AUTHENTICATE)),
        )
        return yield* new UnauthorizedError({ message: "Authentication required" })
      }),
    )
  }),
)
