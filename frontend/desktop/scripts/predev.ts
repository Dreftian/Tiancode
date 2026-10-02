import { $ } from "bun"
import { downloadCliToResources } from "./utils"

await $`bun run install-electron`

await $`bun ./scripts/copy-icons.ts ${process.env.TIANCODE_CHANNEL ?? "dev"}`

const { version } = await Bun.file("package.json").json()
await $`bun run --cwd ../../backend/tiancode script/build-node.ts`.env({ TIANCODE_VERSION: version })
await downloadCliToResources()
