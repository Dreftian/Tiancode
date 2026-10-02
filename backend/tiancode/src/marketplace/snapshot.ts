export * as MarketplaceSnapshot from "./snapshot"

import data from "./snapshot-data"
import type { Snapshot } from "./sources"

/**
 * The catalog as it was when this version was built (script/marketplace-snapshot.ts), so Discover
 * and Connections have something to show offline and before the first refresh finishes. It is a
 * JSON string rather than a literal: the type checker does not need to read a thousand entries.
 */
export function load(): Snapshot {
  const value = JSON.parse(data) as Snapshot
  return Array.isArray(value.items) ? value : { fetchedAt: 0, items: [], connectors: [], sources: [] }
}
