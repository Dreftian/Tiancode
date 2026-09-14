#!/usr/bin/env bun
import path from "node:path"
import { createHash } from "node:crypto"

const root = path.resolve(import.meta.dir, "../..")
const desktop = path.join(root, "frontend/desktop")
const validation = Bun.spawnSync([process.execPath, "./scripts/verify-win-release.ts"], {
  cwd: desktop,
  stdout: "inherit",
  stderr: "inherit",
})
if (validation.exitCode !== 0) throw new Error("Build validation failed; install artifacts were preserved")
for (const name of ["Tiancode.exe", "Tiancode-portable.exe", "Tiancode.exe.blockmap", "latest.yml"]) {
  const source = Bun.file(path.join(desktop, "dist", name))
  const destination = path.join(root, "install", name)
  await Bun.write(destination, source)
  const sourceHash = createHash("sha256")
    .update(await source.bytes())
    .digest("hex")
  const targetHash = createHash("sha256")
    .update(await Bun.file(destination).bytes())
    .digest("hex")
  if (sourceHash !== targetHash) throw new Error(`Copy verification failed: ${name}`)
  console.log(`${name}: SHA-256 ${targetHash}`)
}
