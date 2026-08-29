import type { NormalizedProviderListResponse } from "@tiancode-ai/session-ui/context"

const emptyProviderCatalog: NormalizedProviderListResponse = { all: new Map(), connected: [], default: {} }

type DirectoryCatalog = {
  ready: boolean
  providers: NormalizedProviderListResponse
}

type ProviderCatalogInput = {
  explicit?: boolean
  directory?: string
  catalog?: DirectoryCatalog
  global?: NormalizedProviderListResponse
}

export function selectProviderCatalog(input: ProviderCatalogInput): NormalizedProviderListResponse {
  if (input.directory && input.catalog?.ready && input.catalog.providers?.all?.size) {
    return input.catalog.providers
  }
  if (input.global && input.global.all && input.global.all.size > 0) {
    return input.global
  }
  if (input.catalog?.providers?.all?.size) {
    return input.catalog.providers
  }
  return input.global ?? emptyProviderCatalog
}
