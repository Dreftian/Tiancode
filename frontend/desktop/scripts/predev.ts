import { $ } from "bun"
import { downloadCliToResources } from "./utils"

await $`bun run install-electron`

await $`bun ./scripts/copy-icons.ts ${process.env.TIANCODE_CHANNEL ?? "dev"}`

await $`cd ../../backend/tiancode && bun script/build-node.ts`
await downloadCliToResources()
