import { Auth } from "@/auth"
import { Octokit } from "@octokit/rest"
import { Effect, Schema } from "effect"

export const KEY = "github"

export class GithubNotConnectedError extends Schema.TaggedErrorClass<GithubNotConnectedError>()(
  "GithubNotConnectedError",
  { message: Schema.String },
  { httpApiStatus: 400 },
) {}

export class GithubApiError extends Schema.TaggedErrorClass<GithubApiError>()(
  "GithubApiError",
  { message: Schema.String, status: Schema.optional(Schema.Number) },
  { httpApiStatus: 400 },
) {}

export type GithubUser = { readonly login: string; readonly name?: string; readonly avatar_url?: string }

export type GithubRepo = {
  readonly name: string
  readonly fullName: string
  readonly description?: string
  readonly url: string
  readonly private: boolean
  readonly defaultBranch?: string
}

const client = (key: string) => new Octokit({ auth: key })

function githubError(cause: unknown) {
  const status =
    cause && typeof cause === "object" && "status" in cause
      ? (cause as { readonly status?: unknown }).status
      : undefined
  return new GithubApiError({
    message: cause instanceof Error ? cause.message : String(cause),
    status: typeof status === "number" ? status : undefined,
  })
}

const request = <A>(key: string, run: (client: Octokit) => Promise<A>) =>
  Effect.tryPromise({
    try: () => run(client(key)),
    catch: (cause) => githubError(cause),
  })

const repo = (data: {
  name: string
  full_name: string
  description: string | null
  html_url: string
  private: boolean
  default_branch: string | null
}): GithubRepo => ({
  name: data.name,
  fullName: data.full_name,
  description: data.description ?? undefined,
  url: data.html_url,
  private: data.private,
  defaultBranch: data.default_branch ?? undefined,
})

/** Stored credential for the github provider, if any. */
export const info = Effect.fn("Github.info")(function* () {
  const auth = yield* Auth.Service
  const stored = yield* auth.get(KEY).pipe(Effect.orDie)
  if (stored?.type !== "api") return
  return stored
})

/** Read the stored PAT, failing with a clear error when GitHub is not connected. */
export const token = Effect.fn("Github.token")(function* () {
  const stored = yield* info()
  if (!stored) return yield* new GithubNotConnectedError({ message: "GitHub account is not connected" })
  return stored.key
})

export const setToken = Effect.fn("Github.setToken")(function* (key: string, metadata: Record<string, string>) {
  const auth = yield* Auth.Service
  const stored: Auth.Info = { type: "api", key, metadata }
  yield* auth.set(KEY, stored).pipe(Effect.orDie)
})

export const removeToken = Effect.fn("Github.removeToken")(function* () {
  const auth = yield* Auth.Service
  yield* auth.remove(KEY).pipe(Effect.orDie)
})

export const user = (key: string) =>
  request(key, (client) => client.rest.users.getAuthenticated()).pipe(
    Effect.map(({ data }) => ({
      login: data.login,
      name: data.name ?? undefined,
      avatar_url: data.avatar_url ?? undefined,
    })),
  )

export const listRepos = (key: string, perPage: number) =>
  request(key, (client) =>
    client.rest.repos.listForAuthenticatedUser({ per_page: perPage, sort: "updated", direction: "desc" }),
  ).pipe(Effect.map(({ data }) => data.map(repo)))

export const searchRepos = (key: string, query: string, perPage: number) =>
  request(key, (client) => client.rest.search.repos({ q: query, per_page: perPage })).pipe(
    Effect.map(({ data }) => data.items.map(repo)),
  )

export const createRepo = (key: string, input: { name: string; private?: boolean; description?: string }) =>
  request(key, (client) => client.rest.repos.createForAuthenticatedUser(input)).pipe(Effect.map(({ data }) => repo(data)))

export * as Github from "."
