import { AgentV2 } from "@tiancode-ai/core/agent"
import { AISDK } from "@tiancode-ai/core/aisdk"
import { Catalog } from "@tiancode-ai/core/catalog"
import { CommandV2 } from "@tiancode-ai/core/command"
import { Credential } from "@tiancode-ai/core/credential"
import { AppNodeBuilder } from "@tiancode-ai/core/effect/app-node-builder"
import { LayerNodePlatform } from "@tiancode-ai/core/effect/app-node-platform"
import { LayerNode } from "@tiancode-ai/core/effect/layer-node"
import { EventV2 } from "@tiancode-ai/core/event"
import { FileSystem } from "@tiancode-ai/core/filesystem"
import { FSUtil } from "@tiancode-ai/core/fs-util"
import { Integration } from "@tiancode-ai/core/integration"
import { Location } from "@tiancode-ai/core/location"
import { Npm } from "@tiancode-ai/core/npm"
import { PluginV2 } from "@tiancode-ai/core/plugin"
import { Reference } from "@tiancode-ai/core/reference"
import { SkillV2 } from "@tiancode-ai/core/skill"
import { Effect, Layer } from "effect"
import { tempLocationLayer } from "../fixture/location"

const npmLayer = Layer.succeed(
  Npm.Service,
  Npm.Service.of({
    add: () => Effect.succeed({ directory: "", entrypoint: undefined }),
    install: () => Effect.void,
    which: () => Effect.succeed(undefined),
  }),
)

export const PluginTestLayer = AppNodeBuilder.build(
  LayerNode.group([
    FileSystem.node,
    FSUtil.node,
    Location.node,
    Npm.node,
    Credential.node,
    EventV2.node,
    LayerNodePlatform.httpClient,
    PluginV2.node,
    AgentV2.node,
    AISDK.node,
    Catalog.node,
    CommandV2.node,
    Integration.node,
    Reference.node,
    SkillV2.node,
  ]),
  [
    [Location.node, tempLocationLayer],
    [Npm.node, npmLayer],
  ],
)
