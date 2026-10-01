import { Database } from "bun:sqlite"
import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { createRequire } from "node:module"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { pathToFileURL } from "node:url"

// countSessions needs node:sqlite, which Bun lacks, so it runs in Electron's own Node: the runtime
// that calls it in the app.
// The binary is located without loading electron/index.js, which downloads it when it is missing.
const electronPackage = dirname(createRequire(import.meta.url).resolve("electron/package.json"))
const electron = existsSync(join(electronPackage, "path.txt"))
  ? join(electronPackage, "dist", readFileSync(join(electronPackage, "path.txt"), "utf8").trim())
  : ""
const count = (...databases: string[]) => {
  const run = Bun.spawnSync(
    [
      electron,
      "--input-type=module",
      "-e",
      `import { countSessions } from ${JSON.stringify(pathToFileURL(join(import.meta.dir, "session-count.ts")).href)}
console.log(JSON.stringify(process.argv.slice(1).map((file) => countSessions(file) ?? null)))`,
      ...databases,
    ],
    { env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" } },
  )
  expect(run.stderr.toString()).toBe("")
  return JSON.parse(run.stdout.toString()) as Array<number | null>
}

let dir: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "tiancode-sessions-"))
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

function database(name: string, sessions: number) {
  const db = new Database(join(dir, name))
  db.run("pragma journal_mode = wal")
  db.run("create table session (id text primary key)")
  Array.from({ length: sessions }, (_, index) => db.run("insert into session values (?)", [`ses_${index}`]))
  return db
}

describe.skipIf(!existsSync(electron))("countSessions", () => {
  test("counts a closed database without leaving files in its folder", () => {
    database("closed.db", 3).close()
    expect(readdirSync(dir)).toEqual(["closed.db"])
    expect(count(join(dir, "closed.db"))).toEqual([3])
    expect(readdirSync(dir)).toEqual(["closed.db"])
  })

  test("opens paths with spaces, # and % and non-ASCII names", () => {
    // Profiles live under the user's name, e.g. C:\Users\José Pérez; the immutable URI must encode it.
    const name = "José 50% #1.db"
    database(name, 4).close()
    expect(count(join(dir, name))).toEqual([4])
    expect(readdirSync(dir)).toEqual([name])
  })

  test("reads a database on a network path, where a URI cannot be used", () => {
    database("share.db", 2).close()
    // The same file through the administrative share, as a redirected %APPDATA% would give it.
    const shares = [`\\\\localhost\\${dir.replace(":", "$")}`, `\\\\127.0.0.1\\${dir.replace(":", "$")}`].filter((share) =>
      existsSync(join(share, "share.db")),
    )
    if (shares.length === 0) return
    expect(count(...shares.map((share) => join(share, "share.db")))).toEqual(shares.map(() => 2))
  })

  test("counts sessions still held in the WAL of a database in use", () => {
    const db = database("open.db", 2)
    try {
      db.run("pragma wal_autocheckpoint = 0")
      db.run("insert into session values ('ses_wal')")
      expect(existsSync(join(dir, "open.db-wal"))).toBe(true)
      expect(count(join(dir, "open.db"))).toEqual([3])
    } finally {
      db.close()
    }
  })

  test("a missing database has no sessions and one that is not Tiancode's is unknown", () => {
    writeFileSync(join(dir, "broken.db"), "not a database")
    const other = new Database(join(dir, "other.db"))
    other.run("create table note (id text)")
    other.close()
    expect(count(join(dir, "missing.db"), join(dir, "broken.db"), join(dir, "other.db"))).toEqual([0, null, null])
  })
})
