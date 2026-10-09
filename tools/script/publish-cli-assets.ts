#!/usr/bin/env bun
// Attaches the CLI archives (backend/tiancode/dist/cli/*) to an existing GitHub release of
// Dreftian/Tiancode, replacing assets with the same name. Re-running resumes: an asset already
// uploaded with the same size is kept.
// Usage: bun tools/script/publish-cli-assets.ts v1.0.0
import { execFileSync } from "node:child_process"
import { readdirSync, readFileSync, statSync } from "node:fs"
import path from "node:path"

const tag = process.argv[2]
if (!tag || !/^v\d+\.\d+\.\d+$/.test(tag)) throw new Error("Usage: publish-cli-assets.ts vX.Y.Z")
const root = path.resolve(import.meta.dir, "../..")
const dir = path.join(root, "backend/tiancode/dist/cli")

const credential = execFileSync("git", ["credential", "fill"], { input: "protocol=https\nhost=github.com\n\n", encoding: "utf8" })
const token = credential.split("\n").find((line) => line.startsWith("password="))?.slice(9).trim()
if (!token) throw new Error("No GitHub credential available")
const headers = { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "User-Agent": "Tiancode-Release" }
const base = "https://api.github.com/repos/Dreftian/Tiancode"
async function api<T>(route: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(route.startsWith("http") ? route : `${base}${route}`, { ...init, headers: { ...headers, ...(init.headers ?? {}) } })
  if (!response.ok) throw new Error(`GitHub ${init.method ?? "GET"} ${route}: ${response.status} ${await response.text()}`)
  return (response.status === 204 ? undefined : response.json()) as Promise<T>
}

type Release = { id: number; upload_url: string; assets: { id: number; name: string; size: number; state: string }[] }
const release = await api<Release>(`/releases/tags/${tag}`)
for (const file of readdirSync(dir).sort()) {
  const full = path.join(dir, file)
  const size = statSync(full).size
  const existing = release.assets.find((asset) => asset.name === file)
  if (existing?.state === "uploaded" && existing.size === size) {
    console.log(`kept ${file} (already uploaded)`)
    continue
  }
  await upload(file, full, size, existing?.id)
  console.log(`uploaded ${file} (${(size / 1024 / 1024).toFixed(1)} MiB)`)
}
console.log("done")

// A stalled socket once kept an upload open for 25+ minutes with no output, so each attempt has a
// deadline and a failed attempt's partial asset is removed before trying again.
async function upload(file: string, full: string, size: number, stale: number | undefined) {
  const url = release.upload_url.replace(/\{.*\}$/, "") + `?name=${encodeURIComponent(file)}`
  const type = file.endsWith(".zip") ? "application/zip" : file.endsWith(".gz") ? "application/gzip" : "text/plain"
  for (const attempt of [1, 2, 3]) {
    const leftover = attempt === 1 ? stale : await findAsset(file)
    if (leftover) await api(`/releases/assets/${leftover}`, { method: "DELETE" })
    const done = await api(url, {
      method: "POST",
      headers: { "content-type": type, "content-length": String(size) },
      body: readFileSync(full),
      signal: AbortSignal.timeout(10 * 60 * 1000),
    }).then(
      () => true,
      (error) => {
        console.log(`attempt ${attempt} for ${file} failed: ${error instanceof Error ? error.message : error}`)
        return false
      },
    )
    if (done) return
  }
  throw new Error(`Could not upload ${file}`)
}

async function findAsset(file: string) {
  const current = await api<Release>(`/releases/${release.id}`)
  return current.assets.find((asset) => asset.name === file)?.id
}
