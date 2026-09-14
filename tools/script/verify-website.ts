#!/usr/bin/env bun
import path from "node:path"

const root = path.resolve(import.meta.dir, "../../frontend/website")
const errors: string[] = []
let documents = 0
for await (const relative of new Bun.Glob("**/*.html").scan(root)) {
  documents++
  const filename = path.join(root, relative)
  const html = await Bun.file(filename).text()
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1])
  for (const id of new Set(ids))
    if (ids.filter((value) => value === id).length > 1) errors.push(`${relative}: duplicate id ${id}`)
  for (const [, target] of html.matchAll(/(?:href|src)="([^"]+)"/g)) {
    if (/^(?:https?:|mailto:|data:|tel:|#\/)/.test(target)) continue
    const [uri, hash] = target.split("#")
    const pathname = decodeURIComponent(uri.split("?")[0])
    const resolved = uri
      ? path.resolve(
          pathname.startsWith("/") ? root : path.dirname(filename),
          pathname.startsWith("/") ? "." + (pathname === "/" ? "/index.html" : pathname) : pathname,
        )
      : filename
    if (!(await Bun.file(resolved).exists())) {
      errors.push(`${relative}: missing ${target}`)
      continue
    }
    if (hash && resolved.endsWith(".html") && !(await Bun.file(resolved).text()).includes(`id="${hash}"`))
      errors.push(`${relative}: missing anchor ${target}`)
  }
}
console.log(JSON.stringify({ documents, errors }, null, 2))
if (errors.length) process.exit(1)
