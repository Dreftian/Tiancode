import { existsSync } from "node:fs"
import { cp, lstat, mkdir, readdir, writeFile } from "node:fs/promises"
import { homedir } from "node:os"
import { dirname, join, resolve } from "node:path"

const appDirectory = "tiancode"
const migrationMarker = ".desktop-xdg-v1"

type Environment = Record<string, string | undefined>

export type DesktopXdgPaths = {
  root: string
  global: {
    data: string
    config: string
    state: string
  }
  homes: {
    data: string
    config: string
    cache: string
    state: string
  }
  managed: {
    data: boolean
    config: boolean
    state: boolean
  }
  legacy: {
    data: string
    config: string
    state: string
  }
}

export function resolveDesktopXdgPaths(userData: string, environment: Environment = process.env, home = homedir()) {
  const root = join(userData, "xdg")
  const dataManaged = !environment.XDG_DATA_HOME
  const configManaged = !environment.XDG_CONFIG_HOME && !environment.TIANCODE_CONFIG_DIR
  const stateManaged = !environment.XDG_STATE_HOME
  const homes = {
    data: environment.XDG_DATA_HOME || join(root, "data"),
    config: environment.XDG_CONFIG_HOME || join(root, "config"),
    cache: environment.XDG_CACHE_HOME || join(root, "cache"),
    state: environment.XDG_STATE_HOME || join(root, "state"),
  }

  return {
    root,
    homes,
    global: {
      data: join(homes.data, appDirectory),
      config: environment.TIANCODE_CONFIG_DIR || join(homes.config, appDirectory),
      state: join(homes.state, appDirectory),
    },
    managed: {
      data: dataManaged,
      config: configManaged,
      state: stateManaged,
    },
    legacy: {
      data: join(home, ".local", "share", appDirectory),
      config: join(home, ".config", appDirectory),
      state: join(userData, appDirectory),
    },
  } satisfies DesktopXdgPaths
}

// The desktop app owns these defaults. Explicit XDG/TIANCODE_CONFIG_DIR values
// remain untouched so shell and managed-install users keep their chosen paths.
export function applyDesktopXdgPaths(userData: string, environment: Environment = process.env, home = homedir()) {
  const paths = resolveDesktopXdgPaths(userData, environment, home)
  environment.XDG_DATA_HOME = paths.homes.data
  environment.XDG_CONFIG_HOME = paths.homes.config
  environment.XDG_CACHE_HOME = paths.homes.cache
  environment.XDG_STATE_HOME = paths.homes.state
  return paths
}

// Move only missing legacy files into the desktop-owned roots. The old roots
// stay in place, existing destination data wins, and downloaded models are
// intentionally not copied because they can be re-downloaded.
export async function migrateDesktopXdgPaths(paths: DesktopXdgPaths) {
  if (!paths.managed.data && !paths.managed.config && !paths.managed.state) return { migrated: false, copied: 0 }
  const marker = join(paths.root, migrationMarker)
  const markerExists = existsSync(marker)

  const candidateLegacyData = [
    paths.legacy.data,
    join(dirname(paths.root), "..", "ai.tiancode.desktop", "xdg", "data", appDirectory),
    join(dirname(paths.root), "..", "ai.tiancode.desktop.codex", "xdg", "data", appDirectory),
    join(dirname(paths.root), "..", "ai.tiancode.desktop", appDirectory),
    join(dirname(paths.root), "..", "ai.tiancode.desktop.codex", appDirectory),
  ]

  let copied = 0
  if (paths.managed.data) {
    for (const legacyData of candidateLegacyData) {
      if (existsSync(legacyData) && !samePath(legacyData, paths.global.data)) {
        copied += await copyMissing(legacyData, paths.global.data, new Set(["models"]))
      }
    }
  }

  if (paths.managed.config && !markerExists) {
    copied += await copyMissing(paths.legacy.config, paths.global.config)
  }

  if (paths.managed.state && !markerExists) {
    copied += await copyMissing(paths.legacy.state, paths.global.state)
  }

  await mkdir(paths.root, { recursive: true })
  await writeFile(marker, "1\n", { flag: "wx" }).catch((error: unknown) => {
    if (isAlreadyExists(error)) return
    throw error
  })
  return { migrated: copied > 0, copied }
}

async function copyMissing(source: string, target: string, excludedAtRoot?: Set<string>): Promise<number> {
  if (samePath(source, target)) return 0
  const sourceInfo = await lstat(source).catch(() => undefined)
  if (!sourceInfo) return 0

  const targetInfo = await lstat(target).catch(() => undefined)
  if (!targetInfo) {
    if (sourceInfo.isDirectory() && excludedAtRoot?.size) {
      await mkdir(target, { recursive: true })
      const copied = await Promise.all(
        (await readdir(source, { withFileTypes: true })).flatMap((entry) => {
          if (excludedAtRoot.has(entry.name)) return []
          return [copyMissing(join(source, entry.name), join(target, entry.name))]
        }),
      )
      return copied.reduce((total, value) => total + value, 0)
    }
    await mkdir(dirname(target), { recursive: true })
    await cp(source, target, { recursive: sourceInfo.isDirectory(), force: false, verbatimSymlinks: true })
    return 1
  }

  if (!sourceInfo.isDirectory() && !targetInfo.isDirectory()) {
    // If target is an empty stub database and source is a real database (> 100KB), restore the real database
    if (sourceInfo.size > targetInfo.size && targetInfo.size < 1_000_000 && source.endsWith(".db")) {
      await cp(source, target, { force: true })
      return 1
    }
    return 0
  }

  if (!sourceInfo.isDirectory() || !targetInfo.isDirectory()) return 0
  const entries = await readdir(source, { withFileTypes: true })
  const copied = await Promise.all(
    entries.flatMap((entry) => {
      if (excludedAtRoot?.has(entry.name)) return []
      return [copyMissing(join(source, entry.name), join(target, entry.name))]
    }),
  )
  return copied.reduce((total, value) => total + value, 0)
}

function samePath(left: string, right: string) {
  return resolve(left) === resolve(right)
}

function isAlreadyExists(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error && error.code === "EEXIST"
}
