export * as IntelligenceSwitches from "./intelligence-switches"

import { Effect, type LayerMap } from "effect"
import { Config as CoreConfig } from "@tiancode-ai/core/config"
import { ConfigIntelligence } from "@tiancode-ai/core/config/intelligence"
import { Global } from "@tiancode-ai/core/global"
import { Location } from "@tiancode-ai/core/location"
import type { LocationError, LocationServices } from "@tiancode-ai/core/location-services"
import { AbsolutePath } from "@tiancode-ai/core/schema"
import { InstanceState } from "@/effect/instance-state"
import type { Config } from "./config"

/**
 * The Settings → Inteligencia switches for the current instance, as they are now.
 *
 * Saving them only rewrites the global file and does not reopen projects (that would cancel
 * running sessions), so the global block is read fresh and the project documents the location
 * already holds are layered on top.
 */
export const read = (
  config: Config.Interface,
  locations: LayerMap.LayerMap<Location.Ref, LocationServices, LocationError>,
) =>
  Effect.gen(function* () {
    const ctx = yield* InstanceState.context
    const core = yield* CoreConfig.Service.pipe(
      Effect.provide(locations.get(Location.Ref.make({ directory: AbsolutePath.make(ctx.directory) }))),
    )
    const global = (yield* config.getGlobal()).experimental?.intelligence
    return ConfigIntelligence.layered(global, yield* core.entries(), Global.Path.config)
  })
