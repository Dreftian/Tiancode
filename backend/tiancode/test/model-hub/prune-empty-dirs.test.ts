import { test, expect } from "bun:test"
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { forgetRemovedSomething, modelsRootCandidates, pruneEmptyDirsUnder } from "@/model-hub"

// Deleting the .gguf left `models/bartowski/` behind as an empty directory, which is
// what kept making the Hub look like something was still installed.

const scratch = () => mkdtempSync(path.join(tmpdir(), "tiancode-prune-"))

test("removes a model directory left empty by the deletion, but never the models root", async () => {
  const root = scratch()
  const owner = path.join(root, "bartowski")
  mkdirSync(owner, { recursive: true })

  const removed = await pruneEmptyDirsUnder(root)

  expect(removed).toEqual([owner])
  expect(existsSync(owner)).toBe(false)
  // The models directory itself has to survive: the next download writes into it.
  expect(existsSync(root)).toBe(true)
})

test("keeps a directory that still holds a model", async () => {
  const root = scratch()
  const owner = path.join(root, "bartowski")
  mkdirSync(owner, { recursive: true })
  writeFileSync(path.join(owner, "Qwen2.5-Coder-7B-Q4_K_M.gguf"), "not really a model")

  const removed = await pruneEmptyDirsUnder(root)

  expect(removed).toEqual([])
  expect(existsSync(owner)).toBe(true)
})

test("keeps a partially emptied tree and collapses only the genuinely empty branch", async () => {
  const root = scratch()
  const kept = path.join(root, "bartowski")
  const keptQuant = path.join(kept, "Q4_K_M")
  const gone = path.join(root, "unsloth", "Q8_0")
  mkdirSync(keptQuant, { recursive: true })
  mkdirSync(gone, { recursive: true })
  writeFileSync(path.join(keptQuant, "model.gguf"), "x")

  const removed = await pruneEmptyDirsUnder(root)

  // Depth-first: the empty quant folder goes, and its now-empty parent goes with it.
  expect(removed.sort()).toEqual([gone, path.join(root, "unsloth")].sort())
  expect(existsSync(keptQuant)).toBe(true)
  expect(existsSync(path.join(root, "unsloth"))).toBe(false)
})

test("leaves a directory holding only an empty file alone", async () => {
  const root = scratch()
  const owner = path.join(root, "bartowski")
  mkdirSync(owner, { recursive: true })
  // A zero-byte .part from an aborted download is still content: removing the folder
  // would delete state the download registry expects to resume from.
  writeFileSync(path.join(owner, "model.gguf.part"), "")

  const removed = await pruneEmptyDirsUnder(root)

  expect(removed).toEqual([])
  expect(existsSync(owner)).toBe(true)
})

// `pruneEmptyDirs()` walks every root `modelsRootCandidates()` hands it and rmdir's
// whatever it finds empty. When those roots were literal `os.homedir()`/`%APPDATA%`
// paths they ignored the XDG_DATA_HOME + TIANCODE_TEST_HOME redirection the tests
// install, so an exercise run on a developer machine pruned directories under the
// real user profile.

test("every models root stays inside the redirected home, so a prune cannot reach the real profile", () => {
  const home = scratch()
  const primary = path.join(home, "share", "tiancode", "models")

  const roots = modelsRootCandidates(primary, home)

  expect(roots).toContain(path.resolve(primary))
  const escaped = roots.filter((root) => root !== path.resolve(primary) && !root.startsWith(home + path.sep))
  expect(escaped).toEqual([])
})

test("the legacy desktop roots are still visited, rebuilt under the redirected home", () => {
  const home = scratch()
  const primary = path.join(home, "share", "tiancode", "models")

  const roots = modelsRootCandidates(primary, home)

  // Same set of build layouts as before, just anchored to `home` instead of the
  // process' own profile: a real install still gets its legacy dirs tidied.
  expect(roots).toContain(path.resolve(path.join(home, ".local", "share", "tiancode", "models")))
  expect(roots).toContain(
    path.resolve(path.join(home, "AppData", "Roaming", "ai.tiancode.desktop", "xdg", "data", "tiancode", "models")),
  )
  expect(roots).toContain(
    path.resolve(
      path.join(home, "AppData", "Roaming", "ai.tiancode.desktop.codex", "xdg", "data", "tiancode", "models"),
    ),
  )
})

test("a %APPDATA% tree outside the redirected home survives a prune over every root", async () => {
  const home = scratch()
  const outside = scratch()
  // Stands in for the developer's real roaming profile: %APPDATA% points at it, but
  // the run was handed a different home, so nothing may walk into it.
  const decoy = path.join(outside, "AppData", "Roaming", "ai.tiancode.desktop", "xdg", "data", "tiancode", "models")
  mkdirSync(path.join(decoy, "bartowski"), { recursive: true })
  const primary = path.join(home, "share", "tiancode", "models")
  const doomed = path.join(primary, "bartowski")
  mkdirSync(doomed, { recursive: true })

  const previous = process.env["APPDATA"]
  process.env["APPDATA"] = path.join(outside, "AppData", "Roaming")
  try {
    for (const root of modelsRootCandidates(primary, home)) {
      if (!existsSync(root)) continue
      await pruneEmptyDirsUnder(root)
    }
  } finally {
    if (previous === undefined) delete process.env["APPDATA"]
    else process.env["APPDATA"] = previous
  }

  expect(existsSync(doomed)).toBe(false)
  expect(existsSync(path.join(decoy, "bartowski"))).toBe(true)
})

// The forget endpoint prunes only when the config surgery actually removed something:
// the exercise posts a file name nothing matches, and a delete needs a cause.
test("forgetRemovedSomething is false for a forget that matched nothing", () => {
  expect(forgetRemovedSomething({ models: [], providers: [], files: [] })).toBe(false)
  expect(forgetRemovedSomething({ models: ["local/a.gguf"], providers: [], files: [] })).toBe(true)
  expect(forgetRemovedSomething({ models: [], providers: ["local"], files: [] })).toBe(true)
  expect(forgetRemovedSomething({ models: [], providers: [], files: ["/tmp/tiancode.jsonc"] })).toBe(true)
})
