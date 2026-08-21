#!/usr/bin/env bun

import { existsSync } from "node:fs"
import path from "node:path"

const root = "resources/mcp"
const servers = [
  { name: "live_frontend", dir: "AI-LIVE-FRONTEND-MCP", script: "live_server.py", config: "config.json" },
  { name: "photoshop", dir: "AI-MCP-SUITE/Photoshop", script: "server.py", config: "config.json" },
  { name: "indesign", dir: "AI-MCP-SUITE/InDesign", script: "server.py", config: "config.json" },
  { name: "illustrator", dir: "AI-MCP-SUITE/Illustrator", script: "server.py", config: "config.json" },
  { name: "coreldraw", dir: "AI-MCP-SUITE/CorelDRAW", script: "server.py", config: "config.json" },
  { name: "opera_gx", dir: "AI-MCP-SUITE/OperaGX", script: "server.py", config: "config.json" },
  { name: "unreal_cli", dir: "AI-MCP-SUITE/GameDev/UnrealEngine", script: "server.py", config: "config.json" },
  { name: "unity", dir: "AI-MCP-SUITE/GameDev/Unity", script: "server.py", config: "config.json" },
  { name: "godot", dir: "AI-MCP-SUITE/GameDev/Godot", script: "server.py", config: "config.json" },
  { name: "android_studio", dir: "AI-MCP-SUITE/AndroidStudio", script: "server.py", config: "config.json" },
]

const configurations = await Promise.all(
  servers.map(async (server) => {
    const directory = path.join(root, server.dir)
    const script = path.join(directory, server.script)
    const config = Bun.file(path.join(directory, server.config))
    if (!existsSync(script)) throw new Error(`${server.name} is missing ${server.script}`)
    if (!(await config.exists())) throw new Error(`${server.name} is missing ${server.config}`)
    const value = await config.json()
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${server.name} config must be an object`)
    const example = Bun.file(path.join(directory, "config.example.json"))
    if (!(await example.exists())) throw new Error(`${server.name} is missing config.example.json`)
    const exampleValue = await example.json()
    if (!exampleValue || typeof exampleValue !== "object" || Array.isArray(exampleValue)) {
      throw new Error(`${server.name} config.example.json must be an object`)
    }
    return { name: server.name, value }
  }),
)

const liveFrontend = configurations.find((server) => server.name === "live_frontend")?.value as Record<string, unknown>
if (liveFrontend.dashboard_host !== "127.0.0.1") throw new Error("live_frontend dashboard_host must remain loopback-only")
if (!Number.isInteger(liveFrontend.dashboard_port) || Number(liveFrontend.dashboard_port) < 1 || Number(liveFrontend.dashboard_port) > 65_535) {
  throw new Error("live_frontend dashboard_port must be a valid TCP port")
}

console.log(`Verified ${configurations.length} bundled MCP configurations and scripts`)
