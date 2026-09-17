#!/usr/bin/env bun
// Removes a published GitHub release and its tag so the same version can be cut again.
// Used once for v1.0.0: the historical first release carried that tag, and the release script
// refuses to replace assets of a published tag. Usage: bun tools/script/retire-github-release.ts v1.0.0
import { execFileSync } from "node:child_process"
import path from "node:path"

type Release = { id: number; tag_name: string; html_url: string }

const tag = process.argv[2]
if (!tag || !/^v\d+\.\d+\.\d+$/.test(tag)) throw new Error("Usage: retire-github-release.ts vX.Y.Z")
const root = path.resolve(import.meta.dir, "../..")

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
const base = "https://api.github.com/repos/Dreftian/Tiancode"
async function api<T>(route: string, method = "GET"): Promise<T | undefined> {
  const response = await fetch(`${base}${route}`, { method, headers })
  if (response.status === 204) return undefined
  if (!response.ok) throw new Error(`GitHub ${method} ${route}: ${response.status} ${await response.text()}`)
  return response.json() as Promise<T>
}

const releases = (await api<Release[]>("/releases?per_page=100")) ?? []
const release = releases.find((item) => item.tag_name === tag)
if (release) {
  await api(`/releases/${release.id}`, "DELETE")
  console.log(`Deleted release ${tag} (${release.html_url})`)
} else {
  console.log(`No release with tag ${tag}`)
}
try {
  await api(`/git/refs/tags/${tag}`, "DELETE")
  console.log(`Deleted remote tag ${tag}`)
} catch (error) {
  console.log(`Remote tag ${tag}: ${error instanceof Error ? error.message : String(error)}`)
}
const local = execFileSync("git", ["tag", "-l", tag], { cwd: root, encoding: "utf8" }).trim()
if (local) {
  execFileSync("git", ["tag", "-d", tag], { cwd: root, stdio: "inherit" })
  console.log(`Deleted local tag ${tag}`)
}
