import { Effect, Option } from "effect"
import { HttpApiBuilder } from "effect/unstable/httpapi"
import * as InstanceState from "@/effect/instance-state"
import { Github } from "@/github"
import { Git } from "@/git"
import { Project } from "@/project/project"
import { Global } from "@tiancode-ai/core/global"
import { parseRepositoryReference, repositoryCachePath } from "@/util/repository"
import { InstanceHttpApi } from "../api"
import { InvalidRequestError } from "../errors"

const output = (result: Git.Result) =>
  [result.text(), result.stderr.toString("utf8")].filter(Boolean).join("\n").trim()

const directoryFor = Effect.fnUntraced(function* (directory?: string) {
  if (directory) return directory
  return (yield* InstanceState.context).directory
})

const authorFor = (login: string | undefined) =>
  login ? { name: login, email: `${login}@users.noreply.github.com` } : undefined

export const githubHandlers = HttpApiBuilder.group(InstanceHttpApi, "github", (handlers) =>
  Effect.gen(function* () {
    const git = yield* Git.Service
    const project = yield* Project.Service

    const connect = Effect.fn("GithubHttpApi.connect")(function* (ctx: { payload: { token: string } }) {
      const key = ctx.payload.token.trim()
      if (!key) return yield* new InvalidRequestError({ message: "Token must not be empty", kind: "Payload", field: "token" })
      const user = yield* Github.user(key)
      yield* Github.setToken(key, { login: user.login })
      return user
    })

    const status = Effect.fn("GithubHttpApi.status")(function* () {
      const stored = yield* Github.info()
      if (!stored) return { connected: false }
      const result = yield* Github.user(stored.key).pipe(
        Effect.match({
          onFailure: (error) => ({ ok: false as const, error }),
          onSuccess: (user) => ({ ok: true as const, user }),
        }),
      )
      if (!result.ok) {
        // Invalid or expired credentials: drop the stored token so the UI
        // reflects the disconnected state instead of failing forever.
        if (result.error.status === 401) yield* Github.removeToken()
        return { connected: false }
      }
      return { connected: true, login: result.user.login, avatarUrl: result.user.avatar_url }
    })

    const disconnect = Effect.fn("GithubHttpApi.disconnect")(function* () {
      yield* Github.removeToken()
      return { success: true } as const
    })

    const repos = Effect.fn("GithubHttpApi.repos")(function* (ctx: {
      query: { query?: string; perPage?: number }
    }) {
      const key = yield* Github.token()
      const perPage = ctx.query.perPage ?? 30
      if (ctx.query.query) return yield* Github.searchRepos(key, ctx.query.query, perPage)
      return yield* Github.listRepos(key, perPage)
    })

    const createRepo = Effect.fn("GithubHttpApi.createRepo")(function* (ctx: {
      payload: { name: string; private?: boolean; description?: string }
    }) {
      const key = yield* Github.token()
      return yield* Github.createRepo(key, ctx.payload)
    })

    const cloneProject = Effect.fn("GithubHttpApi.cloneProject")(function* (ctx: {
      payload: { url: string; directory?: string; branch?: string }
    }) {
      const key = yield* Github.token().pipe(Effect.option)
      const reference = parseRepositoryReference(ctx.payload.url)
      if (!reference) {
        return yield* new InvalidRequestError({
          message: "Invalid repository URL",
          kind: "Payload",
          field: "url",
        })
      }
      const directory = ctx.payload.directory ?? repositoryCachePath(reference)
      const result = yield* git.clone(Global.Path.repos, ctx.payload.url, directory, {
        branch: ctx.payload.branch,
        token: Option.getOrUndefined(key),
      })
      if (result.exitCode !== 0) {
        return yield* new InvalidRequestError({
          message: output(result) || "Clone failed",
          kind: "Payload",
          field: "url",
        })
      }
      const registered = yield* project.fromDirectory(directory)
      return { project: registered.project, directory }
    })

    const vcsCommit = Effect.fn("GithubHttpApi.vcsCommit")(function* (ctx: {
      payload: { message: string; directory?: string }
    }) {
      const directory = yield* directoryFor(ctx.payload.directory)
      const stored = yield* Github.info()
      const added = yield* git.add(directory)
      if (added.exitCode !== 0) return { success: false, output: output(added) }
      const committed = yield* git.commit(directory, ctx.payload.message, {
        token: stored?.key,
        author: authorFor(stored?.metadata?.login),
      })
      return { success: committed.success, output: committed.output }
    })

    const vcsPush = Effect.fn("GithubHttpApi.vcsPush")(function* (ctx: {
      payload: { directory?: string; branch?: string }
    }) {
      const directory = yield* directoryFor(ctx.payload.directory)
      const stored = yield* Github.info()
      const result = yield* git.push(directory, { branch: ctx.payload.branch, token: stored?.key })
      return { success: result.exitCode === 0, output: output(result) }
    })

    const vcsPull = Effect.fn("GithubHttpApi.vcsPull")(function* (ctx: { payload: { directory?: string } }) {
      const directory = yield* directoryFor(ctx.payload.directory)
      const stored = yield* Github.info()
      const result = yield* git.pull(directory, { token: stored?.key })
      return { success: result.exitCode === 0, output: output(result) }
    })

    const vcsRemote = Effect.fn("GithubHttpApi.vcsRemote")(function* (ctx: {
      query: { directory?: string }
    }) {
      const directory = yield* directoryFor(ctx.query.directory)
      const url = yield* git.remoteUrl(directory)
      return { url, hasRemote: Boolean(url) }
    })

    return handlers
      .handle("connect", connect)
      .handle("status", status)
      .handle("disconnect", disconnect)
      .handle("repos", repos)
      .handle("createRepo", createRepo)
      .handle("cloneProject", cloneProject)
      .handle("vcsCommit", vcsCommit)
      .handle("vcsPush", vcsPush)
      .handle("vcsPull", vcsPull)
      .handle("vcsRemote", vcsRemote)
  }),
)
