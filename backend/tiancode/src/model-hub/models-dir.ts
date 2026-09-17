/**
 * The local models directory, changeable at runtime.
 *
 * Resolution order: an explicit `TIANCODE_MODELS_DIR` (the desktop app passes the folder the user
 * picked in Settings), then the folder saved by `setModelsDir`, then `<data>/models`. Changing it
 * takes effect immediately for scans, downloads and the engine; the desktop app also stores it so
 * the next start passes the same folder through the environment.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import path from "node:path"
import { Global } from "@tiancode-ai/core/global"

const SETTINGS_FILE = "models-dir.json"

let current: string | undefined
let listeners: Array<(dir: string) => void> = []

export function defaultModelsDir() {
  return path.resolve(path.join(Global.Path.data, "models"))
}

function settingsFile() {
  return path.join(Global.Path.data, SETTINGS_FILE)
}

export function modelsDir(): string {
  if (current) return current
  const env = process.env.TIANCODE_MODELS_DIR?.trim()
  if (env) {
    current = path.resolve(env)
    return current
  }
  try {
    const parsed = JSON.parse(readFileSync(settingsFile(), "utf8")) as { dir?: unknown }
    if (typeof parsed.dir === "string" && parsed.dir.trim()) {
      current = path.resolve(parsed.dir.trim())
      return current
    }
  } catch {
    // no saved folder
  }
  current = defaultModelsDir()
  return current
}

export function isCustomModelsDir() {
  return modelsDir() !== defaultModelsDir()
}

/** Switch the folder (null restores the default). Creates it, persists the choice and notifies. */
export function setModelsDir(dir: string | null | undefined): string {
  const custom = typeof dir === "string" && dir.trim() ? path.resolve(dir.trim()) : undefined
  const next = custom ?? defaultModelsDir()
  mkdirSync(next, { recursive: true })
  try {
    mkdirSync(Global.Path.data, { recursive: true })
    writeFileSync(settingsFile(), JSON.stringify({ dir: custom ?? null }, null, 2))
  } catch {
    // the choice still applies for this process
  }
  if (custom) process.env.TIANCODE_MODELS_DIR = custom
  else delete process.env.TIANCODE_MODELS_DIR
  current = next
  for (const listener of listeners) listener(next)
  return next
}

export function onModelsDirChange(listener: (dir: string) => void) {
  listeners.push(listener)
  return () => {
    listeners = listeners.filter((entry) => entry !== listener)
  }
}

/** Test hook: forget the cached folder so the next read resolves again. */
export function resetModelsDirCache() {
  current = undefined
}
