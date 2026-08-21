import { createHash } from "node:crypto"

const pkg = await Bun.file("package.json").json()
const version = pkg.version

const installer = Bun.file("dist/Tiancode.exe")
const buffer = Buffer.from(await installer.arrayBuffer())
const hash = createHash("sha512").update(buffer).digest("base64")
const size = installer.size
const now = new Date().toISOString()

const content = `version: ${version}
files:
  - url: Tiancode.exe
    sha512: ${hash}
    size: ${size}
path: Tiancode.exe
sha512: ${hash}
releaseDate: '${now}'
`

await Bun.write("dist/latest.yml", content)
console.log(`Updated dist/latest.yml for ${version}: size=${size}, sha512=${hash}`)
