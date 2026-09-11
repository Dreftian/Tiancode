import { describe, expect, test } from "bun:test"
import { Database as BunDatabase } from "bun:sqlite"
import { stat } from "node:fs/promises"
import path from "node:path"
import { SqliteClient } from "@effect/sql-sqlite-bun"
import { EffectDrizzleSqlite } from "@tiancode-ai/effect-drizzle-sqlite"
import { Effect, Result } from "effect"
import { DatabaseMaintenance } from "@tiancode-ai/core/database/maintenance"
import { tmpdir } from "./fixture/tmpdir"

const makeDb = EffectDrizzleSqlite.makeWithDefaults()

const withDb = <A, E>(
  filename: string,
  f: (db: Effect.Success<typeof makeDb>) => Effect.Effect<A, E, never>,
) =>
  Effect.runPromise(
    Effect.gen(function* () {
      const db = yield* makeDb
      return yield* f(db)
    }).pipe(Effect.provide(SqliteClient.layer({ filename })), Effect.scoped),
  )

// Writes ~80 MB of rows and deletes them again: a file that is almost entirely freelist,
// which is what a long-lived database looks like after its sessions are deleted.
function bloat(filename: string) {
  const db = new BunDatabase(filename)
  db.exec("PRAGMA journal_mode = WAL")
  db.exec("CREATE TABLE bloat (id INTEGER PRIMARY KEY, data BLOB NOT NULL)")
  const insert = db.prepare("INSERT INTO bloat (data) VALUES (?)")
  const chunk = new Uint8Array(4096).fill(7)
  db.transaction(() => {
    for (let i = 0; i < 20_000; i++) insert.run(chunk)
  })()
  db.exec("DELETE FROM bloat")
  db.exec("PRAGMA wal_checkpoint(TRUNCATE)")
  db.close()
}

describe("DatabaseMaintenance", () => {
  test("shouldCompact wants a large file that is mostly free pages", () => {
    const page = 4096
    const big = DatabaseMaintenance.COMPACT_MIN_BYTES / page
    expect(DatabaseMaintenance.shouldCompact({ pageSize: page, pageCount: big, freelistCount: big * 0.9 })).toBe(true)
    expect(DatabaseMaintenance.shouldCompact({ pageSize: page, pageCount: big, freelistCount: big * 0.3 })).toBe(false)
    // Small files are not worth a rewrite however empty they are.
    expect(DatabaseMaintenance.shouldCompact({ pageSize: page, pageCount: 100, freelistCount: 99 })).toBe(false)
  })

  test("compacts a file that is mostly free pages", async () => {
    await using tmp = await tmpdir()
    const filename = path.join(tmp.path, "bloated.db")
    bloat(filename)
    const before = (await stat(filename)).size
    expect(before).toBeGreaterThanOrEqual(DatabaseMaintenance.COMPACT_MIN_BYTES)

    const result = await withDb(filename, (db) => DatabaseMaintenance.compact(db))

    expect(result.compacted).toBe(true)
    expect((await stat(filename)).size).toBeLessThan(4 * 1024 * 1024)
  })

  test("leaves a small file alone", async () => {
    await using tmp = await tmpdir()
    const filename = path.join(tmp.path, "small.db")
    const result = await withDb(filename, (db) =>
      db.run("CREATE TABLE t (id INTEGER PRIMARY KEY)").pipe(Effect.andThen(DatabaseMaintenance.compact(db))),
    )
    expect(result.compacted).toBe(false)
  })

  test("isLockError recognises the SQLite lock family anywhere in the cause chain", () => {
    const nested = new Error("Failed query", { cause: new Error("attempt to write a readonly database") })
    expect(DatabaseMaintenance.isLockError(nested)).toBe(true)
    expect(DatabaseMaintenance.isLockError(new Error("database is locked"))).toBe(true)
    expect(DatabaseMaintenance.isLockError("EPERM: operation not permitted, rename")).toBe(true)
    expect(DatabaseMaintenance.isLockError(new Error("no such table: session"))).toBe(false)
  })

  test("probeWritable retries while another process holds the file, then gives up loudly", async () => {
    await using tmp = await tmpdir()
    const filename = path.join(tmp.path, "locked.db")
    const holder = new BunDatabase(filename)
    holder.exec("PRAGMA journal_mode = WAL")
    holder.exec("CREATE TABLE t (id INTEGER PRIMARY KEY)")
    holder.exec("BEGIN IMMEDIATE")

    const failed = await withDb(filename, (db) => Effect.result(DatabaseMaintenance.probeWritable(db, 3, 20)))
    expect(Result.isFailure(failed)).toBe(true)
    if (Result.isFailure(failed)) {
      expect(failed.failure).toBeInstanceOf(DatabaseMaintenance.DatabaseLockedError)
      expect((failed.failure as DatabaseMaintenance.DatabaseLockedError).attempts).toBe(3)
    }

    holder.exec("ROLLBACK")
    holder.close()

    expect(await withDb(filename, (db) => DatabaseMaintenance.probeWritable(db, 3, 20))).toBe(1)
  })
})
