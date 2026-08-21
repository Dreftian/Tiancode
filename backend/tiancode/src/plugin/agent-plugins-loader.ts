/**
 * Agent Plugins Specification (v1.0.0) Loader
 * Inspired by agentplugins/agent-plugins-spec
 * 
 * Standardized loader for portable agent packages containing:
 * - Agent Skills (SKILL.md)
 * - Model Context Protocol (MCP) servers
 * - Lifecycle Hooks and Presets
 */

import { Effect, Schema } from "effect"
import { FSUtil } from "@tiancode-ai/core/fs-util"
import * as path from "path"

export namespace AgentPluginsSpec {
  export const McpServerConfig = Schema.Struct({
    command: Schema.String,
    args: Schema.optional(Schema.Array(Schema.String)),
    env: Schema.optional(Schema.Record(Schema.String, Schema.String)),
  })

  export const Manifest = Schema.Struct({
    schemaVersion: Schema.optional(Schema.Literals(["v1.0.0", "1.0.0", "1.0"])),
    name: Schema.String,
    version: Schema.String,
    description: Schema.optional(Schema.String),
    homepage: Schema.optional(Schema.String),
    skills: Schema.optional(Schema.Array(Schema.String)),
    mcpServers: Schema.optional(Schema.Record(Schema.String, McpServerConfig)),
    hooks: Schema.optional(Schema.Array(Schema.String)),
  })

  export type ManifestType = Schema.Schema.Type<typeof Manifest>

  /**
   * Discovers and loads agent plugins in a target workspace or global directory
   */
  export function loadPluginManifest(pluginDir: string) {
    return Effect.gen(function* () {
      const fsutil = yield* FSUtil.Service

      const candidateFiles = [
        path.join(pluginDir, "agent-plugin.json"),
        path.join(pluginDir, ".plugin", "manifest.json"),
        path.join(pluginDir, "plugin.json"),
      ]

      for (const file of candidateFiles) {
        const exists = yield* fsutil.exists(file)
        if (exists) {
          const raw = yield* fsutil.readFile(file)
          const text = typeof raw === "string" ? raw : Buffer.from(raw).toString("utf8")
          try {
            const parsed = JSON.parse(text)
            return {
              manifest: parsed as ManifestType,
              manifestPath: file,
              rootDir: pluginDir,
            }
          } catch (e) {
            continue
          }
        }
      }

      return null
    })
  }
}
