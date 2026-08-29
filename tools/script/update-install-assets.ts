import { copyFileSync, readFileSync, writeFileSync, statSync } from "node:fs"
import { createHash } from "node:crypto"

copyFileSync("frontend/desktop/dist/Tiancode.exe", "install/Tiancode.exe")
copyFileSync("frontend/desktop/dist/Tiancode-portable.exe", "install/Tiancode-portable.exe")
copyFileSync("frontend/desktop/dist/Tiancode.exe.blockmap", "install/Tiancode.exe.blockmap")

const fileBuffer = readFileSync("install/Tiancode.exe")
const sha512 = createHash("sha512").update(fileBuffer).digest("base64")
const size = statSync("install/Tiancode.exe").size
const date = new Date().toISOString()

const yaml = `version: 1.0.0
files:
  - url: Tiancode.exe
    sha512: ${sha512}
    size: ${size}
path: Tiancode.exe
sha512: ${sha512}
releaseDate: "${date}"
`

writeFileSync("install/latest.yml", yaml, "utf-8")
console.log("Assets copied and latest.yml updated! Size:", size, "SHA512:", sha512)
