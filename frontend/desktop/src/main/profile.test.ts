import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { hasExistingAppState } from "./install-state"
import {
  APP_IDS,
  DEV_APP_ID,
  portableDataRoot,
  PROFILE_CHOICE_FILE,
  PUBLIC_APP_ID,
  resolveProfile,
  saveProfileChoice,
} from "./profile"

let appData: string
// Session counts by database path; the real counter (session-count.ts) needs Electron's node:sqlite.
let counts: Map<string, number | undefined>
const local = () => join(appData, APP_IDS.prod)
const release = () => join(appData, PUBLIC_APP_ID)
const dataDir = (dir: string) => join(dir, "xdg", "data", "tiancode")
const github = (overrides: Partial<Parameters<typeof resolveProfile>[0]> = {}) =>
  resolveProfile({
    distribution: "github",
    channel: "prod",
    packaged: true,
    appData,
    sessions: (file) => (counts.has(file) ? counts.get(file) : 0),
    ...overrides,
  })
// What the app does after taking the single-instance lock.
const launch = (overrides: Partial<Parameters<typeof resolveProfile>[0]> = {}) => {
  const profile = github(overrides)
  if (profile.choice) saveProfileChoice(appData, profile.choice)
  return profile
}
const record = () => JSON.parse(readFileSync(join(release(), PROFILE_CHOICE_FILE), "utf8"))

// What a launched profile leaves behind: the settings store written before any window opens.
function launched(dir: string) {
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, "tiancode.settings"), JSON.stringify({ firstLaunchOnboardingComplete: true }))
}

function withKeys(dir: string, file = "auth.json") {
  mkdirSync(dataDir(dir), { recursive: true })
  writeFileSync(join(dataDir(dir), file), JSON.stringify({ anthropic: "sealed" }))
}

function withSessions(dir: string, sessions: number | undefined) {
  mkdirSync(dataDir(dir), { recursive: true })
  writeFileSync(join(dataDir(dir), "tiancode.db"), "")
  counts.set(join(dataDir(dir), "tiancode.db"), sessions)
}

// Every file under dir with its contents, to show a run changed nothing.
function snapshot(dir: string) {
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => [join(entry.parentPath, entry.name), readFileSync(join(entry.parentPath, entry.name), "utf8")])
    .sort()
}

beforeEach(() => {
  appData = mkdtempSync(join(tmpdir(), "tiancode-profile-"))
  counts = new Map()
})

afterEach(() => {
  rmSync(appData, { recursive: true, force: true })
})

describe("resolveProfile", () => {
  test("test runs, portable copies and unpackaged builds keep their own folders", () => {
    launched(local())
    withKeys(local())
    expect(github({ testRoot: "C:/t" })).toEqual({ path: join("C:/t", "desktop"), kind: "test" })
    expect(github({ portableDir: "D:/usb" })).toEqual({ path: join("D:/usb", "data"), kind: "portable" })
    expect(github({ packaged: false })).toEqual({ path: join(appData, DEV_APP_ID), kind: "dev" })
  })

  test("a GitHub download on a machine without Tiancode starts clean and records nothing", () => {
    expect(launch()).toEqual({ path: release(), kind: "own" })
    expect(existsSync(release())).toBe(false)
  })

  test("the GitHub build installed over a local install opens its data and records the choice once it runs", () => {
    launched(local())
    withKeys(local())
    withSessions(local(), 12)
    const profile = github()
    expect(profile).toEqual({
      path: local(),
      kind: "adopted",
      reason: "empty",
      alternative: undefined,
      choice: { path: local(), reason: "empty", other: { keys: false, sessions: 0 } },
    })
    // Deciding writes nothing: only the process that wins the single-instance lock saves the choice.
    expect(existsSync(release())).toBe(false)
    expect(saveProfileChoice(appData, profile.choice!)).toBe(true)
    expect(record()).toMatchObject({ path: local(), reason: "empty", other: { keys: false, sessions: 0 } })
    expect(github()).toMatchObject({ path: local(), kind: "adopted", reason: "recorded", choice: undefined })
  })

  test("the record is not app state, so the GitHub folder still counts as never launched", () => {
    expect(hasExistingAppState([{ name: PROFILE_CHOICE_FILE, isDirectory: () => false }])).toBe(false)
    launched(local())
    launch()
    expect(readdirSync(release())).toEqual([PROFILE_CHOICE_FILE])
    rmSync(join(release(), PROFILE_CHOICE_FILE))
    expect(github().reason).toBe("empty")
  })

  test("the layout GitHub 1.0.2 left reopens the local keys and sessions and points at the other folder", () => {
    // Welcome finished and one session started in .release; keys and history in the local folder.
    launched(release())
    withSessions(release(), 1)
    launched(local())
    withKeys(local())
    withSessions(local(), 480)
    const before = [...snapshot(local()), ...snapshot(release())]
    expect(launch()).toEqual({
      path: local(),
      kind: "adopted",
      reason: "user-data",
      alternative: { path: release(), keys: false, sessions: 1 },
      choice: { path: local(), reason: "user-data", other: { keys: false, sessions: 1 } },
    })
    expect(record()).toMatchObject({ path: local(), reason: "user-data" })
    // Neither folder is touched; only the record is added.
    expect([...snapshot(local()), ...snapshot(release())].filter(([file]) => !file!.endsWith(PROFILE_CHOICE_FILE))).toEqual(before)
  })

  test("a GitHub folder with its own provider keys or MCP sign-ins is never abandoned", () => {
    launched(local())
    withKeys(local())
    withSessions(local(), 300)
    launched(release())
    withKeys(release())
    expect(launch()).toEqual({
      path: release(),
      kind: "own",
      alternative: { path: local(), keys: true, sessions: 300 },
      choice: { path: release(), reason: "kept", other: { keys: true, sessions: 300 } },
    })
    expect(record()).toMatchObject({ path: release(), reason: "kept" })
    rmSync(join(release(), PROFILE_CHOICE_FILE))
    rmSync(join(dataDir(release()), "auth.json"))
    withKeys(release(), "mcp-auth.json")
    expect(github()).toMatchObject({ path: release(), kind: "own" })
  })

  test("credentials files without entries are not keys", () => {
    launched(release())
    mkdirSync(dataDir(release()), { recursive: true })
    writeFileSync(join(dataDir(release()), "auth.json"), "{}")
    writeFileSync(join(dataDir(release()), "mcp-auth.json"), "{}")
    launched(local())
    withKeys(local())
    expect(github()).toMatchObject({ path: local(), reason: "user-data", alternative: { keys: false } })
    // One that cannot be read may still hold keys.
    writeFileSync(join(dataDir(release()), "mcp-auth.json"), "{damaged")
    expect(github()).toMatchObject({ path: release(), kind: "own" })
  })

  test("without keys on either side the local folder wins only with far more sessions", () => {
    launched(release())
    withSessions(release(), 2)
    launched(local())
    withSessions(local(), 19)
    expect(github()).toMatchObject({ path: release(), kind: "own" })
    withSessions(local(), 20)
    expect(github()).toMatchObject({ path: local(), kind: "adopted", reason: "user-data" })
  })

  test("a database that cannot be read keeps the GitHub folder", () => {
    launched(release())
    withSessions(release(), undefined)
    launched(local())
    withKeys(local())
    withSessions(local(), 50)
    expect(github()).toMatchObject({ path: release(), kind: "own" })
    withSessions(release(), 1)
    withSessions(local(), undefined)
    expect(github()).toMatchObject({ path: release(), kind: "own" })
    // Unless the GitHub folder holds nothing at all: then the local keys win.
    withSessions(release(), 0)
    expect(github()).toMatchObject({ path: local(), kind: "adopted", reason: "user-data" })
  })

  test("an automatic choice to adopt is decided again once the GitHub folder gains data", () => {
    launched(release())
    withSessions(release(), 1)
    launched(local())
    withKeys(local())
    withSessions(local(), 40)
    expect(launch().reason).toBe("user-data")
    expect(github().reason).toBe("recorded")
    // A count that cannot be read (a locked database) is not growth.
    withSessions(release(), undefined)
    expect(github()).toMatchObject({ path: local(), reason: "recorded" })
    // Another version kept working in .release: more sessions, still no keys, so local still wins.
    withSessions(release(), 5)
    expect(launch()).toMatchObject({ path: local(), reason: "user-data", choice: { other: { sessions: 5 } } })
    // Keys entered there are a deliberate choice of that folder.
    withKeys(release())
    expect(github()).toMatchObject({ path: release(), kind: "own", alternative: { path: local() } })
  })

  test("an automatic choice to stay holds until the local folder gains data", () => {
    launched(release())
    withSessions(release(), 4)
    launched(local())
    withSessions(local(), 30)
    expect(launch()).toMatchObject({ path: release(), choice: { reason: "kept", other: { sessions: 30 } } })
    // Deleting chats in the GitHub folder does not move the app to the other folder.
    withSessions(release(), 0)
    expect(launch()).toMatchObject({ path: release(), kind: "own", reason: "recorded", choice: undefined })
    // The local edition worked in its folder again: decide anew.
    withSessions(local(), 31)
    expect(launch()).toMatchObject({ path: local(), kind: "adopted", reason: "user-data" })
  })

  test("a choice made while a count could not be read is made again once it can", () => {
    launched(release())
    withSessions(release(), 1)
    launched(local())
    withKeys(local())
    withSessions(local(), undefined)
    expect(launch()).toMatchObject({ path: release(), choice: { reason: "kept", other: { sessions: undefined } } })
    expect(github()).toMatchObject({ path: release(), reason: "recorded" })
    withSessions(local(), 480)
    expect(launch()).toMatchObject({ path: local(), reason: "user-data", choice: { other: { sessions: 1 } } })
    expect(github()).toMatchObject({ path: local(), reason: "recorded" })
  })

  test("a folder chosen in Settings is honored either way", () => {
    launched(release())
    withKeys(release())
    launched(local())
    withKeys(local())
    expect(saveProfileChoice(appData, { path: local(), reason: "chosen" })).toBe(true)
    expect(github()).toMatchObject({ path: local(), kind: "adopted", reason: "chosen", choice: undefined })
    // Growth does not undo an explicit choice.
    withSessions(release(), 9)
    expect(github()).toMatchObject({ path: local(), reason: "chosen" })
    saveProfileChoice(appData, { path: release(), reason: "chosen" })
    expect(github()).toMatchObject({ path: release(), kind: "own", reason: "chosen" })
  })

  test("a damaged or foreign record is ignored", () => {
    launched(local())
    withKeys(local())
    launched(release())
    withKeys(release())
    const records = [
      "{not json",
      "null",
      "[]",
      JSON.stringify({ path: 3 }),
      JSON.stringify({ path: local(), reason: "whatever" }),
      JSON.stringify({ path: join(appData, "elsewhere"), reason: "chosen" }),
    ]
    for (const content of records) {
      writeFileSync(join(release(), PROFILE_CHOICE_FILE), content)
      expect(github()).toMatchObject({ path: release(), kind: "own", reason: undefined })
    }
  })

  test("a record pointing at a local folder that is gone is ignored", () => {
    launched(release())
    saveProfileChoice(appData, { path: local(), reason: "chosen" })
    expect(github()).toEqual({ path: release(), kind: "own" })
  })

  test("a GitHub folder path taken by a file does not stop the app", () => {
    launched(local())
    withKeys(local())
    writeFileSync(release(), "not a folder")
    const profile = github()
    expect(profile).toMatchObject({ path: local(), kind: "adopted" })
    expect(saveProfileChoice(appData, profile.choice!)).toBe(false)
    expect(readFileSync(release(), "utf8")).toBe("not a folder")
  })

  test("a lock file nobody holds does not count as a running instance", () => {
    launched(local())
    withKeys(local())
    writeFileSync(join(local(), "lockfile"), "")
    launched(release())
    writeFileSync(join(release(), "lockfile"), "")
    expect(github()).toMatchObject({ path: local(), reason: "user-data" })
  })

  test("the other folder is offered whenever it was used, so a choice can be undone", () => {
    launched(local())
    launched(release())
    withKeys(release())
    expect(github()).toMatchObject({ path: release(), alternative: { path: local(), keys: false, sessions: 0 } })
    // A GitHub folder that only has its settings is still offered after adopting the local one.
    rmSync(join(dataDir(release()), "auth.json"))
    withKeys(local())
    expect(github()).toMatchObject({ path: local(), alternative: { path: release(), keys: false, sessions: 0 } })
  })

  test("local builds and other channels never adopt", () => {
    launched(release())
    withKeys(release())
    launched(local())
    withKeys(local())
    expect(github({ distribution: "local" })).toEqual({ path: local(), kind: "own" })
    launched(join(appData, APP_IDS.beta))
    rmSync(release(), { recursive: true })
    expect(github({ channel: "beta" })).toEqual({ path: release(), kind: "own" })
    expect(github({ distribution: "local", channel: "beta" })).toEqual({ path: join(appData, APP_IDS.beta), kind: "own" })
  })
})

describe("portableDataRoot", () => {
  const temp = join("C:", "Users", "u", "AppData", "Local", "Temp")

  test("uses the portable folder only while running from the unpacked portable", () => {
    const env = { PORTABLE_EXECUTABLE_DIR: join("D:", "usb") }
    expect(portableDataRoot(env, join(temp, "2abc", "Tiancode.exe"), temp)).toBe(join("D:", "usb"))
    expect(portableDataRoot(env, join(temp.toUpperCase(), "2abc", "Tiancode.exe"), temp)).toBe(join("D:", "usb"))
    // An installed app started by the portable's updater inherits the variable.
    expect(portableDataRoot(env, join("C:", "Program Files", "Tiancode", "Tiancode.exe"), temp)).toBeUndefined()
    expect(portableDataRoot(env, join(`${temp}-other`, "Tiancode.exe"), temp)).toBeUndefined()
    expect(portableDataRoot({}, join(temp, "2abc", "Tiancode.exe"), temp)).toBeUndefined()
  })
})
