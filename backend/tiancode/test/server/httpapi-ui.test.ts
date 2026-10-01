import { createHash } from "node:crypto"
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { describe, expect } from "bun:test"
import { Flag } from "@tiancode-ai/core/flag/flag"
import { ConfigProvider, Effect, Layer, Option } from "effect"
import { AppNodeBuilder } from "@tiancode-ai/core/effect/app-node-builder"
import {
  HttpClient,
  HttpClientRequest,
  HttpClientResponse,
  HttpRouter,
  HttpServer,
  HttpServerRequest,
  HttpServerResponse,
} from "effect/unstable/http"
import { FSUtil } from "@tiancode-ai/core/fs-util"
import { RuntimeFlags } from "../../src/effect/runtime-flags"
import { ServerAuth } from "../../src/server/auth"
import { authorizationRouterMiddleware } from "../../src/server/routes/instance/httpapi/middleware/authorization"
import { HttpApiApp } from "../../src/server/routes/instance/httpapi/server"
import { serveDirectoryUIEffect, serveEmbeddedUIEffect, serveUIEffect } from "../../src/server/shared/ui"
import { testEffect } from "../lib/effect"

const testStateLayer = Layer.effectDiscard(
  Effect.gen(function* () {
    const original = {
      TIANCODE_SERVER_PASSWORD: Flag.TIANCODE_SERVER_PASSWORD,
      TIANCODE_SERVER_USERNAME: Flag.TIANCODE_SERVER_USERNAME,
      envPassword: process.env.TIANCODE_SERVER_PASSWORD,
      envUsername: process.env.TIANCODE_SERVER_USERNAME,
    }

    yield* Effect.addFinalizer(() =>
      Effect.sync(() => {
        Flag.TIANCODE_SERVER_PASSWORD = original.TIANCODE_SERVER_PASSWORD
        Flag.TIANCODE_SERVER_USERNAME = original.TIANCODE_SERVER_USERNAME
        restoreEnv("TIANCODE_SERVER_PASSWORD", original.envPassword)
        restoreEnv("TIANCODE_SERVER_USERNAME", original.envUsername)
      }),
    )
  }),
)

const fsUtilLayer = AppNodeBuilder.build(FSUtil.node)
const it = testEffect(Layer.mergeAll(testStateLayer, fsUtilLayer, RuntimeFlags.layer()))

function authConfigLayer(input?: { password?: string; username?: string }) {
  return ServerAuth.Config.configLayer({
    password: input?.password === undefined ? Option.none() : Option.some(input.password),
    username: input?.username ?? "tiancode",
  })
}

function restoreEnv(key: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[key]
    return
  }
  process.env[key] = value
}

function app(input?: { password?: string; username?: string }) {
  const handler = HttpRouter.toWebHandler(
    HttpApiApp.routes.pipe(
      Layer.provide(
        ConfigProvider.layer(
          ConfigProvider.fromUnknown({
            TIANCODE_SERVER_PASSWORD: input?.password,
            TIANCODE_SERVER_USERNAME: input?.username,
          }),
        ),
      ),
    ),
    { disableLogger: true },
  ).handler
  return {
    request(input: string | URL | Request, init?: RequestInit) {
      return Effect.promise(() =>
        Promise.resolve(
          handler(
            input instanceof Request ? input : new Request(new URL(input, "http://localhost"), init),
            HttpApiApp.context,
          ),
        ),
      )
    },
  }
}

function uiApp(input?: {
  password?: string
  username?: string
  client?: Layer.Layer<HttpClient.HttpClient>
  disableEmbeddedWebUi?: boolean
}) {
  const handler = HttpRouter.toWebHandler(
    HttpRouter.use((router) =>
      Effect.gen(function* () {
        const fs = yield* FSUtil.Service
        const client = yield* HttpClient.HttpClient
        const flags = yield* RuntimeFlags.Service
        yield* router.add("*", "/*", (request) =>
          serveUIEffect(request, { fs, client, disableEmbeddedWebUi: flags.disableEmbeddedWebUi }),
        )
      }),
    ).pipe(
      Layer.provide(authorizationRouterMiddleware.layer.pipe(Layer.provide(authConfigLayer(input)))),
      Layer.provide([
        fsUtilLayer,
        input?.client ?? httpClient(new Response("ui")),
        RuntimeFlags.layer({ disableEmbeddedWebUi: input?.disableEmbeddedWebUi ?? false }),
        HttpServer.layerServices,
      ]),
    ),
    { disableLogger: true },
  ).handler
  return {
    request(input: string | URL | Request, init?: RequestInit) {
      return Effect.promise(() =>
        Promise.resolve(
          handler(
            input instanceof Request ? input : new Request(new URL(input, "http://localhost"), init),
            HttpApiApp.context,
          ),
        ),
      )
    },
  }
}

function routeOrderingApp() {
  let proxiedUrl: string | undefined
  const handler = HttpRouter.toWebHandler(
    HttpRouter.use((router) =>
      Effect.gen(function* () {
        const fs = yield* FSUtil.Service
        const client = yield* HttpClient.HttpClient
        const flags = yield* RuntimeFlags.Service
        yield* router.add("GET", "/session/:sessionID", () =>
          Effect.succeed(HttpServerResponse.jsonUnsafe({ error: "Not Found" }, { status: 404 })),
        )
        yield* router.add("*", "/*", (request) =>
          serveUIEffect(request, { fs, client, disableEmbeddedWebUi: flags.disableEmbeddedWebUi }),
        )
      }),
    ).pipe(
      Layer.provide([
        fsUtilLayer,
        RuntimeFlags.layer({ disableEmbeddedWebUi: true }),
        httpClient(new Response("ui"), (request) => {
          proxiedUrl = request.url
        }),
        HttpServer.layerServices,
      ]),
    ),
    { disableLogger: true },
  ).handler
  return {
    proxiedUrl: () => proxiedUrl,
    request(input: string | URL | Request, init?: RequestInit) {
      return Effect.promise(() =>
        Promise.resolve(
          handler(
            input instanceof Request ? input : new Request(new URL(input, "http://localhost"), init),
            HttpApiApp.context,
          ),
        ),
      )
    },
  }
}

function httpClient(response: Response, onRequest?: (request: HttpClientRequest.HttpClientRequest) => void) {
  return Layer.succeed(
    HttpClient.HttpClient,
    HttpClient.make((request) => {
      onRequest?.(request)
      return Effect.succeed(HttpClientResponse.fromWeb(request, response))
    }),
  )
}

function responseText(response: Response) {
  return Effect.promise(() => response.text())
}

describe("HttpApi UI fallback", () => {
  it.live("serves the web UI through the HTTP API app", () =>
    Effect.gen(function* () {
      let proxiedUrl: string | undefined

      const response = yield* uiApp({
        disableEmbeddedWebUi: true,
        client: httpClient(
          new Response("<html>tiancode</html>", { headers: { "content-type": "text/html" } }),
          (request) => {
            proxiedUrl = request.url
          },
        ),
      }).request("/")

      expect(response.status).toBe(200)
      expect(response.headers.get("content-type")).toContain("text/html")
      expect(yield* responseText(response)).toBe("<html>tiancode</html>")
      expect(proxiedUrl).toBe("https://app.opencode.ai/")
    }),
  )

  it.live("strips upstream transfer encoding headers from proxied assets", () =>
    Effect.gen(function* () {
      let proxiedUrl: string | undefined

      const response = yield* Effect.gen(function* () {
        const fs = yield* FSUtil.Service
        const client = yield* HttpClient.HttpClient
        const flags = yield* RuntimeFlags.Service
        return yield* serveUIEffect(HttpServerRequest.fromWeb(new Request("http://localhost/assets/app.js")), {
          fs,
          client,
          disableEmbeddedWebUi: flags.disableEmbeddedWebUi,
        })
      }).pipe(
        Effect.provide(
          Layer.mergeAll(
            RuntimeFlags.layer({ disableEmbeddedWebUi: true }),
            Layer.succeed(
              HttpClient.HttpClient,
              HttpClient.make((request) => {
                proxiedUrl = request.url
                return Effect.succeed(
                  HttpClientResponse.fromWeb(
                    request,
                    new Response("console.log('ok')", {
                      headers: {
                        "content-encoding": "br",
                        "content-length": "999",
                        "content-type": "text/javascript",
                      },
                    }),
                  ),
                )
              }),
            ),
          ),
        ),
        Effect.map(HttpServerResponse.toWeb),
      )

      expect(response.status).toBe(200)
      expect(proxiedUrl).toBe("https://app.opencode.ai/assets/app.js")
      expect(response.headers.get("content-encoding")).toBeNull()
      expect(response.headers.get("content-length")).not.toBe("999")
      expect(response.headers.get("content-type")).toContain("text/javascript")
      expect(yield* responseText(response)).toBe("console.log('ok')")
    }),
  )

  // Regression for #25698 (Ope): upstream `transfer-encoding: chunked` was
  // forwarded through the proxy while the proxy itself re-frames the body,
  // causing browsers to fail with `ERR_INVALID_CHUNKED_ENCODING`.
  it.live("strips upstream transfer-encoding header from proxied assets", () =>
    Effect.gen(function* () {
      const response = yield* Effect.gen(function* () {
        const fs = yield* FSUtil.Service
        const client = yield* HttpClient.HttpClient
        const flags = yield* RuntimeFlags.Service
        return yield* serveUIEffect(HttpServerRequest.fromWeb(new Request("http://localhost/")), {
          fs,
          client,
          disableEmbeddedWebUi: flags.disableEmbeddedWebUi,
        })
      }).pipe(
        Effect.provide(
          Layer.mergeAll(
            RuntimeFlags.layer({ disableEmbeddedWebUi: true }),
            Layer.succeed(
              HttpClient.HttpClient,
              HttpClient.make((request) =>
                Effect.succeed(
                  HttpClientResponse.fromWeb(
                    request,
                    new Response("<html>tiancode</html>", {
                      headers: {
                        "transfer-encoding": "chunked",
                        "content-type": "text/html",
                      },
                    }),
                  ),
                ),
              ),
            ),
          ),
        ),
        Effect.map(HttpServerResponse.toWeb),
      )

      expect(response.status).toBe(200)
      expect(response.headers.get("transfer-encoding")).toBeNull()
      expect(yield* responseText(response)).toBe("<html>tiancode</html>")
    }),
  )

  it.live("serves embedded UI assets when Bun can read them but access reports missing", () =>
    Effect.gen(function* () {
      let readPath: string | undefined

      const fs = yield* FSUtil.Service
      const response = yield* serveEmbeddedUIEffect(
        "/assets/app.js",
        {
          ...fs,
          existsSafe: () => Effect.die("embedded UI should not rely on filesystem access checks"),
          readFile: (path) => {
            readPath = path
            return path === "/$bunfs/root/assets/app.js"
              ? Effect.succeed(new TextEncoder().encode("console.log('embedded')"))
              : Effect.die(`unexpected embedded UI path: ${path}`)
          },
        },
        { "assets/app.js": "/$bunfs/root/assets/app.js" },
      ).pipe(Effect.map(HttpServerResponse.toWeb))

      expect(response.status).toBe(200)
      expect(readPath).toBe("/$bunfs/root/assets/app.js")
      expect(response.headers.get("content-type")).toContain("text/javascript")
      expect(yield* responseText(response)).toBe("console.log('embedded')")
    }),
  )

  it.live("allows embedded UI terminal wasm, blob attachments, and theme preload CSP", () =>
    Effect.gen(function* () {
      const script = 'document.documentElement.dataset.theme = "dark"'

      const fs = yield* FSUtil.Service
      const response = yield* serveEmbeddedUIEffect(
        "/",
        {
          ...fs,
          readFile: (path) => {
            return path === "/$bunfs/root/index.html"
              ? Effect.succeed(
                  new TextEncoder().encode(
                    `<html><head><script id="oc-theme-preload-script">${script}</script></head></html>`,
                  ),
                )
              : Effect.die(`unexpected embedded UI path: ${path}`)
          },
        },
        { "index.html": "/$bunfs/root/index.html" },
      ).pipe(Effect.map(HttpServerResponse.toWeb))

      const csp = response.headers.get("content-security-policy") ?? ""
      expect(csp).toContain("script-src 'self' 'wasm-unsafe-eval'")
      expect(csp).toContain(`'sha256-${createHash("sha256").update(script).digest("base64")}'`)
      expect(csp).toContain("img-src 'self' data: https: blob:")
      expect(csp).toContain("connect-src * data: blob:")
    }),
  )

  it.live("keeps matched API routes ahead of the UI fallback", () =>
    Effect.gen(function* () {
      const server = routeOrderingApp()
      const response = yield* server.request("/session/ses_nope")

      expect(response.status).toBe(404)
      expect(server.proxiedUrl()).toBeUndefined()
    }),
  )

  it.live("requires server password for the web UI", () =>
    Effect.gen(function* () {
      const response = yield* uiApp({
        password: "secret",
        username: "tiancode",
        disableEmbeddedWebUi: true,
      }).request("/")

      expect(response.status).toBe(401)
      expect(response.headers.get("www-authenticate")).toBe('Basic realm="Secure Area"')
    }),
  )

  it.live("accepts auth token for the web UI", () =>
    Effect.gen(function* () {
      const response = yield* uiApp({
        password: "secret",
        username: "tiancode",
        disableEmbeddedWebUi: true,
        client: httpClient(new Response("<html>tiancode</html>", { headers: { "content-type": "text/html" } })),
      }).request(`/?auth_token=${btoa("tiancode:secret")}`)

      expect(response.status).toBe(200)
      expect(yield* responseText(response)).toBe("<html>tiancode</html>")
    }),
  )

  it.live("serves the app bundle without auth but keeps the page shell protected", () =>
    Effect.gen(function* () {
      const app = uiApp({
        password: "secret",
        username: "tiancode",
        disableEmbeddedWebUi: true,
        client: httpClient(new Response("console.log('bundle')")),
      })
      expect((yield* app.request("/assets/index-abc.js")).status).toBe(200)
      expect((yield* app.request("/")).status).toBe(401)
      expect((yield* app.request("/assets/x.js", { method: "POST" })).status).toBe(401)
    }),
  )

  it.live("accepts basic auth for the web UI", () =>
    Effect.gen(function* () {
      const response = yield* uiApp({
        password: "secret",
        username: "tiancode",
        disableEmbeddedWebUi: true,
      }).request("/", {
        headers: { authorization: `Basic ${btoa("tiancode:secret")}` },
      })

      expect(response.status).toBe(200)
    }),
  )

  it.live("accepts basic auth passwords containing colons for the web UI", () =>
    Effect.gen(function* () {
      const response = yield* uiApp({
        password: "sec:ret",
        username: "tiancode",
        disableEmbeddedWebUi: true,
      }).request("/", {
        headers: { authorization: `Basic ${btoa("tiancode:sec:ret")}` },
      })

      expect(response.status).toBe(200)
    }),
  )

  // Regression for #25698 (Ope): the browser fetches the PWA manifest and
  // its icons via flows that don't carry app-managed credentials (the
  // `<link rel="manifest">` request is not under page-auth control), so the
  // server returning 401 breaks PWA install. These specific public assets
  // should bypass auth.
  it.live("serves the PWA manifest without auth even when a server password is set", () =>
    Effect.gen(function* () {
      for (const path of ["/site.webmanifest", "/web-app-manifest-192x192.png", "/web-app-manifest-512x512.png"]) {
        const response = yield* uiApp({
          password: "secret",
          username: "tiancode",
          disableEmbeddedWebUi: true,
          client: httpClient(new Response("ok")),
        }).request(path)
        expect(response.status).not.toBe(401)
      }
    }),
  )

  it.live("allows web UI preflight without auth", () =>
    Effect.gen(function* () {
      // Loopback origins are only trusted when the server has a password (server/src/cors.ts).
      Flag.TIANCODE_SERVER_PASSWORD = "secret"
      const response = yield* app({ password: "secret", username: "tiancode" }).request("/", {
        method: "OPTIONS",
        headers: {
          origin: "http://localhost:3000",
          "access-control-request-method": "GET",
        },
      })

      expect(response.status).toBe(204)
      expect(response.headers.get("access-control-allow-origin")).toBe("http://localhost:3000")
    }),
  )
})

describe("web UI from a directory", () => {
  const withApp = <A, E, R>(run: (dir: string) => Effect.Effect<A, E, R>) =>
    Effect.acquireUseRelease(
      Effect.promise(async () => {
        const dir = await mkdtemp(path.join(tmpdir(), "tiancode-web-ui-"))
        await mkdir(path.join(dir, "assets"))
        await writeFile(path.join(dir, "index.html"), "<html>shell</html>")
        await writeFile(path.join(dir, "assets", "app.js"), "console.log('dir')")
        return dir
      }),
      run,
      (dir) => Effect.promise(() => rm(dir, { recursive: true, force: true })),
    )

  const get = (fs: FSUtil.Interface, dir: string, pathname: string) =>
    serveDirectoryUIEffect(pathname, fs, dir).pipe(Effect.map(HttpServerResponse.toWeb))

  it.live("serves assets and the app shell for client routes", () =>
    withApp((dir) =>
      Effect.gen(function* () {
        const fs = yield* FSUtil.Service
        const asset = yield* get(fs, dir, "/assets/app.js")
        expect(asset.status).toBe(200)
        expect(asset.headers.get("content-type")).toContain("javascript")
        expect(yield* responseText(asset)).toBe("console.log('dir')")

        for (const route of ["/", "/server/abc/session/ses_1"]) {
          const shell = yield* get(fs, dir, route)
          expect(shell.status).toBe(200)
          expect(shell.headers.get("content-security-policy")).toBeTruthy()
          expect(yield* responseText(shell)).toBe("<html>shell</html>")
        }
      }),
    ),
  )

  it.live("answers 404 for a missing asset instead of the shell", () =>
    withApp((dir) =>
      Effect.gen(function* () {
        const fs = yield* FSUtil.Service
        expect((yield* get(fs, dir, "/assets/missing.js")).status).toBe(404)
        expect((yield* get(fs, dir, "/assets/")).status).toBe(404)
        expect((yield* get(fs, dir, "/assets")).status).toBe(404)
      }),
    ),
  )

  it.live("never reads outside the directory", () =>
    withApp((dir) =>
      Effect.gen(function* () {
        const fs = yield* FSUtil.Service
        yield* Effect.promise(() => writeFile(path.join(path.dirname(dir), "tiancode-secret.txt"), "secret"))
        const response = yield* get(fs, dir, "/../tiancode-secret.txt")
        expect(yield* responseText(response)).not.toBe("secret")
        yield* Effect.promise(() => rm(path.join(path.dirname(dir), "tiancode-secret.txt"), { force: true }))
      }),
    ),
  )
})
