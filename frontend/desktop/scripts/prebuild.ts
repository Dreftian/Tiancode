#!/usr/bin/env bun
import { $ } from "bun"

import { downloadCliToResources, resolveChannel } from "./utils"

const channel = resolveChannel()
await $`bun ./scripts/copy-icons.ts ${channel}`
await $`bun ./scripts/copy-metainfo.ts ${channel}`

await $`cd ../../backend/tiancode && TIANCODE_VERSION=1.0.1 bun script/build-node.ts`
if (channel === "dev") await downloadCliToResources()
