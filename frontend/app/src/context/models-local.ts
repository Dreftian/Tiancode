import { reconcile } from "solid-js/store"

/** A `{ [modelKey]: { name } }` map as it appears under a provider in the config. */
export type ConfigModelMap = Record<string, unknown>

export type ConfigProvider = { models?: ConfigModelMap } & Record<string, unknown>

export type ConfigProviders = Record<string, ConfigProvider | undefined>

/** Shape of what `POST /models/forget` reports it removed. */
export type ForgetOutcome = {
  readonly models: readonly string[]
  readonly providers: readonly string[]
}

const stripGguf = (key: string) => key.replace(/\.gguf$/i, "")

/**
 * The config keys a removal has to clear for one file — the same set the server's
 * `forgetModelKeys()` deletes, because `activateDownloadedModel` writes both the
 * bare name and the `.gguf` file name.
 */
export function forgetModelKeyVariants(file: string): string[] {
  const bare = stripGguf(file)
  return Array.from(new Set([file, bare, `${bare}.gguf`]))
}

/**
 * The cached `config.provider` map with a forgotten model taken out of it.
 *
 * `POST /models/forget` rewrites the config *files* on the server, but nothing
 * refetches the config query afterwards (`refreshProviders()` only refetches
 * queries keyed `[scope, …, "providers"]`, and no event publishes `config.updated`),
 * so the cached document keeps the deleted model for the rest of the session —
 * and provider settings continue to offer the removed entry. This
 * is the removal counterpart of the `serverSync().set("config", "provider", …)`
 * that `activateDownloadedModel` already does on the way in.
 *
 * Mirrors the server's `forgetModelInText`: every provider loses every key that
 * matches the file, and the local engine provider disappears when that empties it.
 * A provider the user configured by hand keeps its entry even with no models.
 */
export function pruneForgottenFromConfig(input: {
  providers: ConfigProviders | undefined
  forgotten: ForgetOutcome
  /** The file that was deleted; clears keys the server pruned from its own copy too. */
  file?: string
  /** Only this provider is disposable once it runs out of models. */
  engineProvider?: string
}): ConfigProviders {
  const source = input.providers ?? {}
  const engineProvider = input.engineProvider ?? "local"
  const dead = new Set(input.forgotten.providers)

  // `models` entries are `providerID/modelKey`, and a model key can itself contain
  // a slash (a repo sub-path), so the split is on the first one — same as the server.
  const doomedByProvider = new Map<string, Set<string>>()
  for (const ref of input.forgotten.models) {
    const cut = ref.indexOf("/")
    if (cut <= 0) continue
    const providerID = ref.slice(0, cut)
    const existing = doomedByProvider.get(providerID) ?? new Set<string>()
    existing.add(ref.slice(cut + 1).toLowerCase())
    doomedByProvider.set(providerID, existing)
  }
  // The cached document can hold keys the server's copy did not, so the file's own
  // variants are dropped everywhere regardless of what the server reported.
  const doomedEverywhere = new Set(input.file ? forgetModelKeyVariants(input.file).map((k) => k.toLowerCase()) : [])

  const next: ConfigProviders = {}
  for (const [providerID, provider] of Object.entries(source)) {
    if (dead.has(providerID)) continue
    if (!provider) {
      next[providerID] = provider
      continue
    }
    const doomed = doomedByProvider.get(providerID)
    const models: ConfigModelMap = {}
    for (const [key, value] of Object.entries(provider.models ?? {})) {
      const lower = key.toLowerCase()
      if (doomed?.has(lower) || doomedEverywhere.has(lower)) continue
      models[key] = value
    }
    const removedAny = Object.keys(models).length !== Object.keys(provider.models ?? {}).length
    if (!removedAny) {
      next[providerID] = provider
      continue
    }
    // Only the engine provider is disposable: it exists purely to carry downloaded
    // GGUF files, so an empty one is not a provider the user still has.
    if (providerID === engineProvider && Object.keys(models).length === 0) continue
    next[providerID] = { ...provider, models }
  }
  return next
}

/** Solid setters merge object keys, so removals require reconciliation. */
export function reconcileForgottenFromConfig(input: Parameters<typeof pruneForgottenFromConfig>[0]) {
  return reconcile(pruneForgottenFromConfig(input))
}

type ProviderLike = {
  readonly id: string
  readonly models?: Record<string, unknown>
}

/** Only server-validated local files may appear; cached config is not inventory. */
export function availableModelProviders<P extends ProviderLike, C extends ProviderLike>(
  all: readonly P[],
  connected: readonly C[],
): (P | C)[] {
  const providers = new Map<string, P | C>(
    connected.filter((provider) => provider.id !== "tiancode-native").map((provider) => [provider.id, provider]),
  )
  for (const provider of all) {
    if (provider.id !== "local") continue
    if (Object.keys(provider.models ?? {}).length === 0) {
      providers.delete(provider.id)
      continue
    }
    providers.set(provider.id, provider)
  }
  return Array.from(providers.values())
}
