import { closeSync, existsSync, mkdirSync, openSync, readdirSync, readFileSync, writeFileSync } from "node:fs"
import { join, resolve, sep } from "node:path"
import { hasExistingAppState } from "./install-state"

// Profile folders under %APPDATA% (app.getPath("appData")).
export const APP_IDS: Record<string, string> = {
  dev: "ai.tiancode.desktop.codex",
  beta: "ai.tiancode.desktop.beta",
  prod: "ai.tiancode.desktop",
}
// The GitHub build's own folder: a machine that never ran Tiancode starts clean there.
export const PUBLIC_APP_ID = "ai.tiancode.desktop.release"
export const DEV_APP_ID = "ai.tiancode.desktop.codex"
// Kept inside the GitHub folder: which folder this edition uses and why. hasExistingAppState()
// does not count it as app state.
export const PROFILE_CHOICE_FILE = "profile-adoption.json"

// keys: provider keys or MCP sign-ins saved in the folder.
export type ProfileStats = { keys: boolean; sessions: number | undefined }

export type ProfileChoice =
  // Picked in Settings › General › Data: holds until the user switches again.
  | { path: string; reason: "chosen" }
  | {
      path: string
      reason: "empty" | "user-data" | "kept"
      // The folder not chosen, as it was then. An automatic choice stands until that folder gains
      // keys or sessions (someone worked in it with another version or edition).
      other: ProfileStats
    }

export type Profile = {
  path: string
  kind: "test" | "portable" | "dev" | "own" | "adopted"
  reason?: "recorded" | "chosen" | "empty" | "user-data" | "in-use"
  // The other folder of the pair, which Settings › General › Data can switch to.
  alternative?: { path: string } & ProfileStats
  // Written only after this process holds the single-instance lock.
  choice?: ProfileChoice
}

/**
 * The folder the app keeps its data in (userData).
 *
 * Both editions install into the same folder and share the update feed, so the GitHub build can
 * replace a local or pre-split install in place. Updates must never hide sessions, provider keys
 * or settings (AGENTS.md), so on the prod channel the GitHub build uses the local folder when that
 * is where the user's data is, and Settings › General › Data can switch between the two. The
 * local edition never adopts: its migrations would run over the GitHub profile.
 */
export function resolveProfile(input: {
  distribution: "github" | "local"
  channel: string
  packaged: boolean
  appData: string
  portableDir?: string
  testRoot?: string
  // Rows in the session table (WAL included), undefined when the database cannot be read.
  sessions: (database: string) => number | undefined
}): Profile {
  if (input.testRoot) return { path: join(input.testRoot, "desktop"), kind: "test" }
  if (input.portableDir) return { path: join(input.portableDir, "data"), kind: "portable" }
  if (!input.packaged) return { path: join(input.appData, DEV_APP_ID), kind: "dev" }

  const own = join(input.appData, input.distribution === "github" ? PUBLIC_APP_ID : APP_IDS[input.channel])
  if (input.distribution !== "github" || input.channel !== "prod") return { path: own, kind: "own" }

  const local = join(input.appData, APP_IDS.prod)
  if (!hasAppState(local)) return { path: own, kind: "own" }
  const stats = (dir: string): ProfileStats => ({
    keys: hasEntries(join(dataDir(dir), "auth.json")) || hasEntries(join(dataDir(dir), "mcp-auth.json")),
    sessions: input.sessions(join(dataDir(dir), "tiancode.db")),
  })
  const ownStats = stats(own)
  const localStats = stats(local)
  // Any folder that was ever used is offered, so a choice can always be undone in Settings.
  const offer = (dir: string, dirStats: ProfileStats) =>
    hasAppState(dir) || hasUserData(dirStats) ? { path: dir, ...dirStats } : undefined
  const adopted = (reason: Profile["reason"], choice?: ProfileChoice): Profile => ({
    path: local,
    kind: "adopted",
    reason,
    alternative: offer(own, ownStats),
    choice,
  })
  const kept = (reason?: Profile["reason"], choice?: ProfileChoice): Profile => ({
    path: own,
    kind: "own",
    reason,
    alternative: offer(local, localStats),
    choice,
  })

  // Another instance already runs on one of the folders: open the same one so the single-instance
  // lock forwards to that window instead of starting a second app on the other folder.
  if (inUse(own)) return kept("in-use")
  if (inUse(local)) return adopted("in-use")

  const recorded = readChoice(own)
  if (recorded?.reason === "chosen" && recorded.path === own) return kept("chosen")
  if (recorded?.reason === "chosen" && recorded.path === local) return adopted("chosen")
  if (recorded && recorded.reason !== "chosen") {
    if (recorded.path === local && !grew(ownStats, recorded.other)) return adopted("recorded")
    if (recorded.path === own && !grew(localStats, recorded.other)) return kept("recorded")
  }

  if (!hasAppState(own) && !hasUserData(ownStats))
    return adopted("empty", { path: local, reason: "empty", other: ownStats })
  if (prefersLocal(ownStats, localStats))
    return adopted("user-data", { path: local, reason: "user-data", other: ownStats })
  return kept(undefined, { path: own, reason: "kept", other: localStats })
}

/**
 * Saves the decision once the process holds the lock. Returns whether it was written: without the
 * record an automatic choice is simply made again next launch, but a switch would not apply.
 */
export function saveProfileChoice(appData: string, choice: ProfileChoice) {
  const own = join(appData, PUBLIC_APP_ID)
  try {
    mkdirSync(own, { recursive: true })
    writeFileSync(join(own, PROFILE_CHOICE_FILE), JSON.stringify({ ...choice, decidedAt: new Date().toISOString() }, null, 2))
    return true
  } catch {
    return false
  }
}

/**
 * The portable copy's data folder. The portable runs from its unpacked folder under the temp
 * directory; an installed app started by a portable's updater inherits PORTABLE_EXECUTABLE_DIR
 * but runs from its install folder, and must not take the portable's data.
 */
export function portableDataRoot(env: Record<string, string | undefined>, execPath: string, tempDir: string) {
  const dir = env.PORTABLE_EXECUTABLE_DIR
  if (!dir) return undefined
  return inside(execPath, tempDir) ? dir : undefined
}

// The local folder wins a conflict only when it clearly holds what the user works with: their
// provider keys while the GitHub folder has none, or (without keys on either side) far more
// sessions. Anything closer stays put, and the user can switch in Settings.
function prefersLocal(own: ProfileStats, local: ProfileStats) {
  if (!hasUserData(own)) return hasUserData(local)
  if (own.sessions === undefined || local.sessions === undefined) return false
  if (local.keys && !own.keys) return local.sessions >= own.sessions
  // Keys entered in the GitHub folder are a deliberate choice of that folder.
  if (local.keys || own.keys) return false
  return local.sessions >= 10 * Math.max(own.sessions, 1)
}

function hasUserData(stats: ProfileStats) {
  return stats.keys || stats.sessions === undefined || stats.sessions > 0
}

// A count that cannot be read now (a locked database) is not growth: the choice stands. One that
// could not be read when the choice was made is decided once more as soon as it can.
function grew(now: ProfileStats, then: ProfileStats) {
  if (now.keys && !then.keys) return true
  if (now.sessions === undefined) return false
  if (then.sessions === undefined) return true
  return now.sessions > then.sessions
}

// Saved entries in a credentials file. An unreadable file may still hold some, so it counts.
function hasEntries(file: string) {
  if (!existsSync(file)) return false
  try {
    const value: unknown = JSON.parse(readFileSync(file, "utf8"))
    return typeof value !== "object" || value === null || Object.keys(value).length > 0
  } catch {
    return true
  }
}

function dataDir(profile: string) {
  return join(profile, "xdg", "data", "tiancode")
}

function hasAppState(dir: string) {
  try {
    return hasExistingAppState(readdirSync(dir, { withFileTypes: true }))
  } catch {
    return false
  }
}

// Chromium keeps <userData>/lockfile open without write sharing while an instance runs (Windows).
function inUse(profile: string) {
  const file = join(profile, "lockfile")
  if (!existsSync(file)) return false
  try {
    closeSync(openSync(file, "r+"))
    return false
  } catch (error) {
    return typeof error === "object" && error !== null && "code" in error && (error.code === "EBUSY" || error.code === "EPERM")
  }
}

function readChoice(own: string): ProfileChoice | undefined {
  try {
    const value: unknown = JSON.parse(readFileSync(join(own, PROFILE_CHOICE_FILE), "utf8"))
    if (typeof value !== "object" || value === null) return
    const record = value as Record<string, unknown>
    if (typeof record.path !== "string") return
    if (record.reason === "chosen") return { path: record.path, reason: "chosen" }
    if (record.reason !== "empty" && record.reason !== "user-data" && record.reason !== "kept") return
    const then = typeof record.other === "object" && record.other !== null ? (record.other as Record<string, unknown>) : {}
    return {
      path: record.path,
      reason: record.reason,
      other: { keys: then.keys === true, sessions: typeof then.sessions === "number" ? then.sessions : undefined },
    }
  } catch {
    return undefined
  }
}

function inside(path: string, dir: string) {
  const child = resolve(path).toLowerCase()
  const parent = resolve(dir).toLowerCase()
  return child === parent || child.startsWith(parent.endsWith(sep) ? parent : parent + sep)
}
