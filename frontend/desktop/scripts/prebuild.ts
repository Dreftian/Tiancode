#!/usr/bin/env bun
import { $ } from "bun"

import { downloadCliToResources, resolveChannel } from "./utils"

const channel = resolveChannel()
await $`bun ./scripts/copy-icons.ts ${channel}`
await $`bun ./scripts/copy-metainfo.ts ${channel}`

// La versión del CLI embebido sale de package.json: el daemon reinicia y toma
// la clave de cifrado solo si su versión cambia con cada release, así que el
// bump de versión debe reflejarse aquí automáticamente.
const { version } = await Bun.file("package.json").json()
await $`bun run --cwd ../../backend/tiancode script/build-node.ts`.env({ TIANCODE_VERSION: version })
if (channel === "dev") await downloadCliToResources()
