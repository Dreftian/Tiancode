export * as MarketplaceSnapshot from "./snapshot"

import type { Snapshot } from "./sources"

/**
 * The catalog as it was when this version was built (script/marketplace-snapshot.ts), so Discover
 * and Connections have something to show offline and before the first refresh finishes. It is a
 * JSON string rather than a literal: the type checker does not need to read a thousand entries.
 * Imported on first use, so the 800 KB module never slows the server's start.
 */
export async function load(): Promise<Snapshot> {
  const { default: data } = await import("./snapshot-data")
  const value = JSON.parse(data) as Snapshot
  return Array.isArray(value.items) ? value : { fetchedAt: 0, items: [], connectors: [], sources: [] }
}
