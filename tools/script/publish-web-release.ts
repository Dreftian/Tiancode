#!/usr/bin/env bun
// Publishes a release of the website repository (Dreftian/Tiancode-web) for the current web tree:
// creates the tag on main, the release with the notes file and attaches a zip of the site.
// Usage: bun tools/script/publish-web-release.ts v1.0.0 tools/releases/web-v1.0.0.md dist/tiancode-web-1.0.0.zip
import { execFileSync } from "node:child_process"
import { readFileSync, statSync } from "node:fs"
import path from "node:path"

const [tag, notesFile, asset] = process.argv.slice(2)
if (!tag || !/^v\d+\.\d+\.\d+$/.test(tag) || !notesFile) throw new Error("Usage: publish-web-release.ts vX.Y.Z notes.md [asset.zip]")
const root = path.resolve(import.meta.dir, "../..")
const notes = readFileSync(path.resolve(root, notesFile), "utf8")

const credential = execFileSync("git", ["credential", "fill"], { input: "protocol=https\nhost=github.com\n\n", encoding: "utf8" })
const token = credential.split("\n").find((line) => line.startsWith("password="))?.slice(9).trim()
if (!token) throw new Error("No GitHub credential available")
const headers = { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "User-Agent": "Tiancode-Release" }
const repo = "Dreftian/Tiancode-web"
const base = `https://api.github.com/repos/${repo}`
async function api<T>(route: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${base}${route}`, { ...init, headers: { ...headers, ...(init.headers ?? {}) } })
  if (!response.ok) throw new Error(`GitHub ${init.method ?? "GET"} ${route}: ${response.status} ${await response.text()}`)
  return (response.status === 204 ? undefined : response.json()) as Promise<T>
}

const main = await api<{ object: { sha: string } }>("/git/ref/heads/main")
const existing = await api<{ id: number; tag_name: string }[]>("/releases?per_page=100")
const previous = existing.find((release) => release.tag_name === tag)
if (previous) {
  await api(`/releases/${previous.id}`, { method: "DELETE" })
  await fetch(`${base}/git/refs/tags/${tag}`, { method: "DELETE", headers })
  console.log(`replaced previous ${tag}`)
}
const release = await api<{ id: number; html_url: string; upload_url: string }>("/releases", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    tag_name: tag,
    target_commitish: main.object.sha,
    name: `Tiancode Web ${tag.slice(1)}`,
    body: notes,
    draft: false,
    prerelease: false,
  }),
})
console.log(`created ${release.html_url}`)
if (asset) {
  const file = path.resolve(root, asset)
  const size = statSync(file).size
  const name = path.basename(file)
  const upload = release.upload_url.replace(/\{.*\}$/, "") + `?name=${encodeURIComponent(name)}`
  const response = await fetch(upload, {
    method: "POST",
    headers: { ...headers, "content-type": "application/zip", "content-length": String(size) },
    body: readFileSync(file),
  })
  if (!response.ok) throw new Error(`upload ${name}: ${response.status} ${await response.text()}`)
  console.log(`uploaded ${name} (${(size / 1024).toFixed(0)} KiB)`)
}
console.log("done")
