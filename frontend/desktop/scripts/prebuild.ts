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
await $`cd ../../backend/tiancode && TIANCODE_VERSION=${version} bun script/build-node.ts`
if (channel === "dev") await downloadCliToResources()
