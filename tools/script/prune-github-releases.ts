#!/usr/bin/env bun
// Deletes every GitHub release (and its tag) of a repository except the ones listed in --keep, so
// the Releases page only shows the versions that are still supported.
// Usage: bun tools/script/prune-github-releases.ts Dreftian/Tiancode --keep v1.0.0 [--dry-run]
import { execFileSync } from "node:child_process"

type Release = { id: number; tag_name: string; html_url: string; draft: boolean }

const repo = process.argv[2]
if (!repo || !/^[\w.-]+\/[\w.-]+$/.test(repo)) throw new Error("Usage: prune-github-releases.ts owner/repo --keep vX.Y.Z[,vA.B.C] [--dry-run]")
const keepIndex = process.argv.indexOf("--keep")
const keep = new Set(keepIndex > 0 ? (process.argv[keepIndex + 1] ?? "").split(",").filter(Boolean) : [])
const dryRun = process.argv.includes("--dry-run")

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
}
const base = `https://api.github.com/repos/${repo}`
async function api<T>(route: string, method = "GET"): Promise<T | undefined> {
  const response = await fetch(`${base}${route}`, { method, headers })
  if (response.status === 204) return undefined
  if (!response.ok) throw new Error(`GitHub ${method} ${route}: ${response.status} ${await response.text()}`)
  return response.json() as Promise<T>
}

const releases: Release[] = []
for (let page = 1; page <= 10; page++) {
  const batch = (await api<Release[]>(`/releases?per_page=100&page=${page}`)) ?? []
  releases.push(...batch)
  if (batch.length < 100) break
}
const stale = releases.filter((release) => !keep.has(release.tag_name))
console.log(`${repo}: ${releases.length} releases, keeping ${[...keep].join(", ") || "none"}, removing ${stale.length}`)
for (const release of stale) {
  if (dryRun) {
    console.log(`would delete ${release.tag_name}`)
    continue
  }
  await api(`/releases/${release.id}`, "DELETE")
  try {
    await api(`/git/refs/tags/${release.tag_name}`, "DELETE")
  } catch (error) {
    console.log(`tag ${release.tag_name}: ${error instanceof Error ? error.message : String(error)}`)
  }
  console.log(`deleted ${release.tag_name}`)
}
// Tags that survived without a release (older experiments) go too.
const tags = (await api<{ ref: string }[]>("/git/refs/tags").catch(() => [])) ?? []
for (const tag of tags) {
  const name = tag.ref.replace("refs/tags/", "")
  if (keep.has(name)) continue
  if (dryRun) {
    console.log(`would delete tag ${name}`)
    continue
  }
  await api(`/git/refs/tags/${name}`, "DELETE").catch(() => undefined)
  console.log(`deleted tag ${name}`)
}
console.log("done")
