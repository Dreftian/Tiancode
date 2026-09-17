#!/usr/bin/env bun
// Builds the Tiancode CLI (the same server + TUI the desktop app embeds) as standalone binaries for
// Windows, macOS and Linux, then packs them as release assets in backend/tiancode/dist/cli.
// Usage: bun tools/script/build-cli.ts [--targets linux-x64,darwin-arm64,...] [--version 1.0.0]
import { $ } from "bun"
import { existsSync, mkdirSync, readdirSync, rmSync } from "node:fs"
import path from "node:path"

const root = path.resolve(import.meta.dir, "../..")
const backend = path.join(root, "backend/tiancode")
const argv = process.argv.slice(2)
const flag = (name: string) => {
  const index = argv.indexOf(name)
  return index >= 0 ? argv[index + 1] : undefined
}
const version = flag("--version") ?? "1.0.0"
const packOnly = argv.includes("--pack-only")
const targets = (flag("--targets") ?? "win32-x64,darwin-arm64,darwin-x64,linux-x64,linux-arm64").split(",").map((t) => t.trim())

if (!packOnly) {
  console.log(`building tiancode CLI ${version} for ${targets.join(", ")}`)
  await $`bun run script/build.ts --skip-install`.cwd(backend).env({
    ...process.env,
    TIANCODE_VERSION: version,
    TIANCODE_CHANNEL: "latest",
    TIANCODE_TARGETS: targets.join(","),
  })
}

const out = path.join(backend, "dist/cli")
rmSync(out, { recursive: true, force: true })
mkdirSync(out, { recursive: true })
for (const name of readdirSync(path.join(backend, "dist"))) {
  if (!name.startsWith("tiancode-") || name === "tiancode-ai") continue
  const bin = path.join(backend, "dist", name, "bin")
  if (!existsSync(bin)) continue
  const asset = name.replace("win32", "windows")
  if (name.includes("linux")) {
    // --force-local: GNU tar on Windows would read "C:" as a remote host.
    await $`tar --force-local -czf ${path.join(out, `${asset}.tar.gz`)} -C ${bin} .`
  } else {
    const zip = path.join(out, `${asset}.zip`)
    await $`powershell -NoProfile -Command Compress-Archive -Path ${bin + "/*"} -DestinationPath ${zip} -CompressionLevel Optimal -Force`
  }
  console.log("packed", asset)
}
const checksums: string[] = []
for (const file of readdirSync(out).sort()) {
  const hash = new Bun.CryptoHasher("sha256").update(await Bun.file(path.join(out, file)).bytes()).digest("hex")
  checksums.push(`${hash}  ${file}`)
}
await Bun.write(path.join(out, "SHA256SUMS.txt"), checksums.join("\n") + "\n")
console.log(checksums.join("\n"))
console.log("CLI BUILD DONE")
