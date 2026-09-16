import type { Config } from "@tiancode-ai/sdk/v2/client"

/** Persist the block before removing credentials or refreshing any catalog. */
export async function disconnectProvider(input: {
  providerID: string
  readConfig: () => Promise<Config>
  updateConfig: (config: Config) => Promise<unknown>
  removeAuth: () => Promise<unknown>
  refresh: () => Promise<unknown>
}) {
  const config = await input.readConfig()
  await input.updateConfig({
    disabled_providers: [...new Set([...(config.disabled_providers ?? []), input.providerID])],
  })
  // Provider definitions may come from project files or plugins. Omitting one from a
  // merge patch never deletes it; the saved block must remain authoritative.
  await input.removeAuth()
  await input.refresh()
}
