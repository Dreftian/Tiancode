import { Schema } from "effect"
import { HttpApiEndpoint, HttpApiGroup, OpenApi } from "effect/unstable/httpapi"
import { Marketplace } from "@/marketplace"
import { described } from "./metadata"

export const MarketplaceAuth = Schema.Literals(["none", "oauth", "own-app", "token", "restricted"]).annotate({
  identifier: "MarketplaceAuth",
})

export const MarketplaceMcp = Schema.Struct({
  transport: Schema.Literals(["remote", "local"]),
  url: Schema.optional(Schema.String),
  headers: Schema.optional(Schema.Record(Schema.String, Schema.String)),
  command: Schema.optional(Schema.Array(Schema.String)),
  environment: Schema.optional(Schema.Record(Schema.String, Schema.String)),
}).annotate({ identifier: "MarketplaceMcp" })

export const MarketplaceItem = Schema.Struct({
  id: Schema.String,
  type: Schema.Literals(["mcp", "plugin", "skill"]),
  name: Schema.String,
  title: Schema.String,
  description: Schema.String,
  source: Schema.String,
  category: Schema.String,
  icon: Schema.optional(Schema.String),
  domain: Schema.optional(Schema.String),
  homepage: Schema.optional(Schema.String),
  verified: Schema.optional(Schema.Boolean),
  stars: Schema.optional(Schema.Finite),
  auth: Schema.optional(MarketplaceAuth),
  mcp: Schema.optional(MarketplaceMcp),
  skillUrl: Schema.optional(Schema.String),
  /** A plugin whose files Tiancode can fetch and translate. */
  installable: Schema.Boolean,
}).annotate({ identifier: "MarketplaceItem" })

export const MarketplaceSource = Schema.Struct({
  id: Schema.String,
  ok: Schema.Boolean,
  count: Schema.Finite,
}).annotate({ identifier: "MarketplaceSource" })

export const MarketplaceCatalogResponse = Schema.Struct({
  fetchedAt: Schema.Finite,
  items: Schema.Array(MarketplaceItem),
  sources: Schema.Array(MarketplaceSource),
}).annotate({ identifier: "MarketplaceCatalog" })

export const MarketplaceConnector = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  title: Schema.String,
  description: Schema.String,
  category: Schema.String,
  url: Schema.String,
  transport: Schema.Literals(["http", "sse"]),
  auth: MarketplaceAuth,
  icon: Schema.optional(Schema.String),
  domain: Schema.optional(Schema.String),
  docs: Schema.optional(Schema.String),
  sources: Schema.Array(Schema.String),
}).annotate({ identifier: "MarketplaceConnector" })

export const MarketplaceInstalled = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  title: Schema.String,
  source: Schema.String,
  installedAt: Schema.Finite,
  skills: Schema.Array(Schema.String),
  commands: Schema.Array(Schema.String),
  agents: Schema.Array(Schema.String),
  mcp: Schema.Array(Schema.String),
  skipped: Schema.Array(Schema.String),
}).annotate({ identifier: "MarketplaceInstalled" })

export const MarketplaceSearchQuery = Schema.Struct({ q: Schema.String })
export const MarketplaceIconQuery = Schema.Struct({ domain: Schema.String })
export const MarketplacePluginQuery = Schema.Struct({ id: Schema.String })
export const MarketplaceInstallInput = Schema.Struct({ id: Schema.String }).annotate({
  identifier: "MarketplaceInstallInput",
})

export const MarketplacePaths = {
  catalog: "/global/marketplace",
  connectors: "/global/marketplace/connectors",
  search: "/global/marketplace/search",
  icon: "/global/marketplace/icon",
  plugins: "/global/marketplace/plugins",
} as const

export const MarketplaceGroup = HttpApiGroup.make("marketplace")
  .add(
    HttpApiEndpoint.get("marketplaceCatalog", MarketplacePaths.catalog, {
      success: described(MarketplaceCatalogResponse, "Every MCP server, plugin and skill Discover lists"),
    }).annotateMerge(
      OpenApi.annotations({
        identifier: "global.marketplace.catalog",
        summary: "Discover catalog",
        description:
          "MCP servers, Claude Code and Codex plugins and skills from the public catalogs Tiancode mirrors, refreshed every few hours.",
      }),
    ),
    HttpApiEndpoint.get("marketplaceConnectors", MarketplacePaths.connectors, {
      success: described(Schema.Array(MarketplaceConnector), "App connectors (remote MCP servers)"),
    }).annotateMerge(
      OpenApi.annotations({
        identifier: "global.marketplace.connectors",
        summary: "App connectors",
        description: "The connectors Claude and Codex offer whose MCP server any client can reach.",
      }),
    ),
    HttpApiEndpoint.get("marketplaceSearch", MarketplacePaths.search, {
      query: MarketplaceSearchQuery,
      success: described(Schema.Array(MarketplaceItem), "MCP servers from the official registry"),
    }).annotateMerge(
      OpenApi.annotations({
        identifier: "global.marketplace.search",
        summary: "Search the MCP registry",
        description: "Searches the official MCP Registry by server name.",
      }),
    ),
    HttpApiEndpoint.get("marketplaceIcon", MarketplacePaths.icon, {
      query: MarketplaceIconQuery,
      success: described(Schema.NullOr(Schema.String), "The site's logo as a data URL, or null"),
    }).annotateMerge(
      OpenApi.annotations({
        identifier: "global.marketplace.icon",
        summary: "Logo of a catalog site",
        description: "The icon a site in the catalog publishes, fetched and cached by the server.",
      }),
    ),
    HttpApiEndpoint.get("marketplaceInstalled", MarketplacePaths.plugins, {
      success: described(Schema.Array(MarketplaceInstalled), "Plugins installed from the catalog"),
    }).annotateMerge(
      OpenApi.annotations({
        identifier: "global.marketplace.installed",
        summary: "Installed plugins",
        description: "Claude Code and Codex plugins installed from Discover, with what each one added.",
      }),
    ),
    HttpApiEndpoint.post("marketplaceInstall", MarketplacePaths.plugins, {
      payload: MarketplaceInstallInput,
      success: described(MarketplaceInstalled, "What the plugin added"),
      error: [Marketplace.InstallError],
    }).annotateMerge(
      OpenApi.annotations({
        identifier: "global.marketplace.install",
        summary: "Install a plugin",
        description:
          "Downloads a Claude Code or Codex plugin and adds its skills, commands, sub-agents and MCP servers to the global config.",
      }),
    ),
    HttpApiEndpoint.delete("marketplaceUninstall", MarketplacePaths.plugins, {
      query: MarketplacePluginQuery,
      success: described(Schema.Boolean, "Whether the plugin was installed"),
    }).annotateMerge(
      OpenApi.annotations({
        identifier: "global.marketplace.uninstall",
        summary: "Uninstall a plugin",
        description: "Removes everything a plugin installed from Discover added.",
      }),
    ),
  )
  .annotateMerge(OpenApi.annotations({ title: "marketplace", description: "Discover catalog and app connectors." }))
