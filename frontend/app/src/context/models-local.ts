/**
 * The two pure rules the local (GGUF) model slice needs, kept out of the Solid
 * components so they can be tested without a store or a server.
 *
 * Both exist because the app shows local models from *two* sources that can
 * disagree: the provider catalogue the backend computes (authoritative — it only
 * lists a local model whose .gguf is actually on disk, and drops the `local`
 * provider once it has none left) and the cached global config document (the
 * user's declaration, refreshed on its own schedule). `mergeConfigLocalModels`
 * is what lets a just-activated model show up before the catalogue catches up;
 * `pruneForgottenFromConfig` is what stops a just-deleted one from being
 * resurrected by that same merge.
 */

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
 * and `mergeConfigLocalModels` faithfully puts it back into the model list. This
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

type ProviderLike = {
  readonly id: string
  readonly models?: Record<string, unknown>
}

/**
 * The `local` provider entry the model list should render, given the catalogue
 * entry the backend produced (if any) and the local models the cached config
 * declares.
 *
 * The catalogue always wins for a model it already knows: it carries the real
 * metadata and it has checked the file is on disk. The config only contributes
 * models the catalogue has not got, which is the window this merge exists for —
 * activating a freshly downloaded model writes the config and then waits on a
 * provider refetch, and without this the new model would blink out of "Modelos"
 * until that refetch landed.
 *
 * It can only ever *add*, so the cached config has to stay honest about removals;
 * `pruneForgottenFromConfig` is what keeps it that way.
 */
export function mergeConfigLocalModels<P extends ProviderLike>(
  existing: P | undefined,
  configModels: Record<string, unknown> | undefined,
  fallback: P,
): P | undefined {
  const declared = Object.entries(configModels ?? {})
  if (declared.length === 0) return existing

  const base = existing ?? fallback
  const models: Record<string, unknown> = { ...(base.models ?? {}) }
  // Indexed without the extension: the catalogue may key a model `foo.gguf` while
  // the config keys it `foo`, and adding both would duplicate the same file.
  const known = new Set(Object.keys(models).map((key) => stripGguf(key).toLowerCase()))

  for (const [key, value] of declared) {
    const id = stripGguf(key)
    if (known.has(id.toLowerCase())) continue
    known.add(id.toLowerCase())
    const name = (value as { name?: unknown } | undefined)?.name
    models[id] = {
      id,
      name: typeof name === "string" ? stripGguf(name) : id,
      status: "active",
    }
  }

  return { ...base, models } as P
}
