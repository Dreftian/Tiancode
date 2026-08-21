#!/usr/bin/env bun

import { Script } from "@tiancode-ai/script"
import { $ } from "bun"

const output = [`version=${Script.version}`]
const sha = process.env.GITHUB_SHA ?? (await $`git rev-parse HEAD`.text()).trim()

if (!Script.preview) {
  await $`bun backend/tools/script/changelog.ts --to ${sha}`.cwd(process.cwd())
  // Notas de la release: UPCOMING_CHANGELOG.md si existe; si no, la sección
  // superior de CHANGELOG.md commiteado; por último un texto por defecto.
  const upcoming = await Bun.file(`${process.cwd()}/UPCOMING_CHANGELOG.md`)
    .text()
    .catch(() => "")
  const committed = await Bun.file(`${process.cwd()}/CHANGELOG.md`)
    .text()
    .catch(() => "")
  const body =
    upcoming.trim() ||
    committed
      .split(/^## \[/m)[1]
      ?.split(/^## \[/m)[0]
      ?.trim() ||
    "No notable changes"
  const dir = process.env.RUNNER_TEMP ?? "/tmp"
  const notesFile = `${dir}/tiancode-release-notes.txt`
  await Bun.write(notesFile, body)
  await $`gh release create v${Script.version} -d --target ${sha} --title "v${Script.version}" --notes-file ${notesFile}`
  const release = await $`gh release view v${Script.version} --json tagName,databaseId`.json()
  output.push(`release=${release.databaseId}`)
  output.push(`tag=${release.tagName}`)
} else if (Script.channel === "beta") {
  await $`gh release create v${Script.version} -d --title "v${Script.version}" --repo ${process.env.GH_REPO}`
  const release =
    await $`gh release view v${Script.version} --json tagName,databaseId --repo ${process.env.GH_REPO}`.json()
  output.push(`release=${release.databaseId}`)
  output.push(`tag=${release.tagName}`)
}

output.push(`repo=${process.env.GH_REPO}`)

if (process.env.GITHUB_OUTPUT) {
  await Bun.write(process.env.GITHUB_OUTPUT, output.join("\n"))
}

process.exit(0)
