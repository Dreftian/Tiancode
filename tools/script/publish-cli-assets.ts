#!/usr/bin/env bun
// Attaches the CLI archives (backend/tiancode/dist/cli/*) to an existing GitHub release of
// Dreftian/Tiancode, replacing assets with the same name.
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

type Release = { id: number; upload_url: string; assets: { id: number; name: string }[] }
const release = await api<Release>(`/releases/tags/${tag}`)
for (const file of readdirSync(dir).sort()) {
  const existing = release.assets.find((asset) => asset.name === file)
  if (existing) await api(`/releases/assets/${existing.id}`, { method: "DELETE" })
  const full = path.join(dir, file)
  const upload = release.upload_url.replace(/\{.*\}$/, "") + `?name=${encodeURIComponent(file)}`
  const type = file.endsWith(".zip") ? "application/zip" : file.endsWith(".gz") ? "application/gzip" : "text/plain"
  await api(upload, { method: "POST", headers: { "content-type": type, "content-length": String(statSync(full).size) }, body: readFileSync(full) })
  console.log(`uploaded ${file} (${(statSync(full).size / 1024 / 1024).toFixed(1)} MiB)`)
}
console.log("done")
