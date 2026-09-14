#!/usr/bin/env bun
import { execFileSync } from "node:child_process"
import { createHash } from "node:crypto"
import path from "node:path"

type Asset = { id: number; name: string; size: number; digest?: string }
type Release = { id: number; tag_name: string; draft: boolean; upload_url: string; html_url: string; assets: Asset[] }

const root = path.resolve(import.meta.dir, "../..")
const version = (await Bun.file(path.join(root, "frontend/desktop/package.json")).json()).version as string
if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error("Expected a stable desktop version")
const tag = `v${version}`
const notes = Bun.file(process.argv[2] ?? path.join(root, `tools/releases/${tag}.md`))
if (!(await notes.exists())) throw new Error(`Missing release notes: ${notes.name}`)
const body = await notes.text()
if (!body.trim()) throw new Error("Release notes must not be empty")
const output = path.join(root, "frontend/desktop/dist")
const validation = Bun.spawnSync([process.execPath, "./scripts/verify-win-release.ts", output], {
  cwd: path.join(root, "frontend/desktop"),
  stdout: "inherit",
  stderr: "inherit",
})
if (validation.exitCode !== 0) throw new Error("Release validation failed; nothing was published")
const files = await Promise.all(
  ["Tiancode.exe", "Tiancode-portable.exe", "Tiancode.exe.blockmap", "latest.yml"].map(async (name) => {
    const file = Bun.file(path.join(output, name))
    const digest = `sha256:${createHash("sha256")
      .update(await file.bytes())
      .digest("hex")}`
    return { name, file, digest }
  }),
)

const credential = execFileSync("git", ["credential", "fill"], {
  input: "protocol=https\nhost=github.com\n\n",
  encoding: "utf8",
})
const token = credential
  .split("\n")
  .find((line) => line.startsWith("password="))
  ?.slice(9)
  .trim()
if (!token) throw new Error("No GitHub credential available")
const headers = {
  Authorization: `Bearer ${token}`,
  Accept: "application/vnd.github+json",
  "User-Agent": "Tiancode-Release",
  "Content-Type": "application/json",
}
const base = "https://api.github.com/repos/Dreftian/Tiancode"
async function api<T>(route: string, method = "GET", payload?: unknown): Promise<T> {
  const response = await fetch(`${base}${route}`, {
    method,
    headers,
    body: payload === undefined ? undefined : JSON.stringify(payload),
  })
  if (!response.ok) throw new Error(`GitHub ${method} ${route}: ${response.status} ${await response.text()}`)
  return response.json() as Promise<T>
}
const commit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim()
// The tag must point at the exact tested source already available remotely.
await api(`/commits/${commit}`)
const releases = await api<Release[]>("/releases?per_page=100")
const existing = releases.find((release) => release.tag_name === tag)
const release =
  existing ??
  (await api<Release>("/releases", "POST", {
    tag_name: tag,
    target_commitish: commit,
    name: `Tiancode ${tag}`,
    body,
    draft: true,
    prerelease: false,
  }))
if (!release.draft) {
  if (files.some((file) => !release.assets.some((asset) => asset.name === file.name && asset.digest === file.digest)))
    throw new Error(`Published ${tag} has different assets. Bump the version; published binaries are never replaced.`)
  console.log(`Already published and verified: ${release.html_url}`)
  process.exit(0)
}
for (const file of files) {
  const previous = release.assets.find((asset) => asset.name === file.name)
  if (previous?.digest === file.digest && previous.size === file.file.size) continue
  if (previous) throw new Error(`Draft contains a different ${file.name}; inspect the draft before continuing`)
  console.log(`Uploading ${file.name} (${(file.file.size / 1048576).toFixed(1)} MiB)`)
  const response = await fetch(`${release.upload_url.split("{")[0]}?name=${encodeURIComponent(file.name)}`, {
    method: "POST",
    headers: {
      ...headers,
      "Content-Type": file.name.endsWith(".yml") ? "text/yaml" : "application/octet-stream",
      "Content-Length": String(file.file.size),
    },
    body: file.file,
  })
  if (!response.ok) throw new Error(`Upload ${file.name} failed: ${response.status} ${await response.text()}`)
  const asset = (await response.json()) as Asset
  if (asset.digest !== file.digest || asset.size !== file.file.size)
    throw new Error(`GitHub digest/size mismatch: ${file.name}`)
}
const verified = await api<Release>(`/releases/${release.id}`)
for (const file of files) {
  const asset = verified.assets.find((asset) => asset.name === file.name)
  if (asset?.digest !== file.digest || asset.size !== file.file.size) throw new Error(`Incomplete draft: ${file.name}`)
}
await api(`/releases/${release.id}`, "PATCH", {
  name: `Tiancode ${tag}`,
  body,
  draft: false,
  prerelease: false,
  make_latest: "true",
})
const latest = await api<Release>("/releases/latest")
if (latest.tag_name !== tag) throw new Error(`Latest is ${latest.tag_name}, expected ${tag}`)
console.log(`Published and verified ${tag}: four assets with matching SHA-256. ${latest.html_url}`)
