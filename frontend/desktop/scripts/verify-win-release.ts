#!/usr/bin/env bun

import { createHash } from "node:crypto"
import { readdir } from "node:fs/promises"
import path from "node:path"

type PackageMetadata = {
  version?: unknown
}

type LatestYml = {
  version: string
  url: string
  sha512: string
  size: number
}

const output = process.argv[2] ?? "dist"
const packageFile = Bun.file("package.json")
const packageMetadata = (await packageFile.json()) as PackageMetadata
const version = typeof packageMetadata.version === "string" ? packageMetadata.version : undefined
if (!version) throw new Error("package.json must include a release version")
const suffix = process.env.TIANCODE_ARCH === "arm64" ? "-arm64" : ""
const installerName = `Tiancode${suffix}.exe`
const portableName = `Tiancode-portable${suffix}.exe`

const installer = await requireFile(path.join(output, installerName))
const portable = await requireFile(path.join(output, portableName))
const blockmap = await requireFile(path.join(output, `${installerName}.blockmap`))
const manifest = await requireFile(path.join(output, "latest.yml"))
const runtimeIcon = await requireFile(path.join(output, "win-unpacked", "resources", "icons", "icon.ico"))
const trayIcon = await requireFile(path.join(output, "win-unpacked", "resources", "icons", "icon-tray.png"))
const mcpFiles = await requireDirectory(path.join(output, "win-unpacked", "resources", "mcp"))
const latest = parseLatestYml(await manifest.text(), installerName)

if (latest.version !== version) throw new Error(`latest.yml version ${latest.version} does not match package.json ${version}`)
if (latest.url !== installerName) throw new Error(`latest.yml must target ${installerName}, received ${latest.url}`)
if (latest.size !== installer.size) throw new Error(`latest.yml size ${latest.size} does not match installer size ${installer.size}`)
if (latest.sha512 !== sha512(await installer.arrayBuffer())) throw new Error(`latest.yml SHA-512 does not match ${installerName}`)
if (portable.size === 0 || blockmap.size === 0 || runtimeIcon.size === 0 || trayIcon.size === 0)
  throw new Error("Windows release artifacts and runtime icons must not be empty")
const generatedCaches = mcpFiles.filter((file) => file.endsWith(".pyc") || file.split(path.sep).includes("__pycache__"))
if (generatedCaches.length > 0) throw new Error(`Bundled MCP resources contain generated Python caches: ${generatedCaches.join(", ")}`)

console.log(`Verified Windows release ${version}: ${installerName}, ${portableName}, blockmap, latest.yml, runtime icons and clean MCP resources`)

async function requireFile(filepath: string) {
  const file = Bun.file(filepath)
  if (!(await file.exists())) throw new Error(`Missing release artifact: ${filepath}`)
  return file
}

async function requireDirectory(directory: string): Promise<string[]> {
  try {
    const entries = await readdir(directory, { withFileTypes: true })
    return (
      await Promise.all(
        entries.map(async (entry) => {
          const filepath = path.join(directory, entry.name)
          if (entry.isDirectory()) return requireDirectory(filepath)
          return [filepath]
        }),
      )
    ).flat()
  } catch {
    throw new Error(`Missing packaged resource directory: ${directory}`)
  }
}

function parseLatestYml(content: string, expectedInstaller: string): LatestYml {
  const version = required(content, /^version:\s*(.+?)\s*$/m, "version")
  const escapedInstaller = expectedInstaller.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  const installer = content.match(new RegExp(`^\\s*-\\s+url:\\s*${escapedInstaller}\\s*\\r?\\n\\s+sha512:\\s*(\\S+)\\s*\\r?\\n\\s+size:\\s*(\\d+)\\s*$`, "m"))
  if (!installer) throw new Error(`latest.yml must include ${expectedInstaller} with SHA-512 and size`)
  const url = required(content, /^path:\s*(.+?)\s*$/m, "path")
  if (url !== expectedInstaller) throw new Error(`latest.yml path must be ${expectedInstaller}, received ${url}`)
  return { version, url: expectedInstaller, sha512: installer[1], size: Number(installer[2]) }
}

function required(content: string, expression: RegExp, label: string) {
  const value = content.match(expression)?.[1]
  if (!value) throw new Error(`latest.yml is missing ${label}`)
  return value
}

function sha512(contents: ArrayBuffer) {
  return createHash("sha512").update(new Uint8Array(contents)).digest("base64")
}
