import { Effect } from "effect"
import { HttpApiBuilder } from "effect/unstable/httpapi"
import { Marketplace, MarketplaceCatalog } from "@/marketplace"
import { EffectBridge } from "@/effect/bridge"
import { disposeAllInstancesAndEmitGlobalDisposed } from "@/server/global-lifecycle"
import { RootHttpApi } from "../api"

// Only the fields the API declares: an item's plugin source stays on the server, which looks it
// up again by id when asked to install.
function wire(item: MarketplaceCatalog.Item) {
  return {
    id: item.id,
    type: item.type,
    name: item.name,
    title: item.title,
    description: item.description,
    source: item.source,
    category: item.category,
    icon: item.icon,
    domain: item.domain,
    homepage: item.homepage,
    verified: item.verified,
    stars: item.stars,
    auth: item.auth,
    mcp: item.mcp,
    skillUrl: item.skillUrl,
    installable: item.type === "plugin" && Boolean(item.plugin),
  }
}

export const marketplaceHandlers = HttpApiBuilder.group(RootHttpApi, "marketplace", (handlers) =>
  Effect.gen(function* () {
    const marketplace = yield* Marketplace.Service
    const bridge = yield* EffectBridge.make()

    const catalog = Effect.fn("MarketplaceHttpApi.catalog")(function* () {
      const snapshot = yield* marketplace.catalog()
      return { fetchedAt: snapshot.fetchedAt, items: snapshot.items.map(wire), sources: snapshot.sources }
    })

    const connectors = Effect.fn("MarketplaceHttpApi.connectors")(function* () {
      return (yield* marketplace.catalog()).connectors
    })

    const search = Effect.fn("MarketplaceHttpApi.search")(function* (ctx: { query: { q: string } }) {
      return (yield* marketplace.search(ctx.query.q)).map(wire)
    })

    const icon = Effect.fn("MarketplaceHttpApi.icon")(function* (ctx: { query: { domain: string } }) {
      return (yield* marketplace.icon(ctx.query.domain)) ?? null
    })

    const installed = Effect.fn("MarketplaceHttpApi.installed")(function* () {
      return yield* marketplace.installed()
    })

    // New skills, commands, agents and MCP servers are read when a project opens, so every open
    // project is reopened, as a global config change does.
    const install = Effect.fn("MarketplaceHttpApi.install")(function* (ctx: { payload: { id: string } }) {
      const result = yield* marketplace.install(ctx.payload.id)
      bridge.fork(disposeAllInstancesAndEmitGlobalDisposed({ swallowErrors: true }))
      return result
    })

    const uninstall = Effect.fn("MarketplaceHttpApi.uninstall")(function* (ctx: { query: { id: string } }) {
      const removed = yield* marketplace.uninstall(ctx.query.id)
      if (removed) bridge.fork(disposeAllInstancesAndEmitGlobalDisposed({ swallowErrors: true }))
      return removed
    })

    return handlers
      .handle("marketplaceCatalog", catalog)
      .handle("marketplaceConnectors", connectors)
      .handle("marketplaceSearch", search)
      .handle("marketplaceIcon", icon)
      .handle("marketplaceInstalled", installed)
      .handle("marketplaceInstall", install)
      .handle("marketplaceUninstall", uninstall)
  }),
)
