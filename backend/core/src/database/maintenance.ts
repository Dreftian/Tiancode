export * as DatabaseMaintenance from "./maintenance"

import { Effect, Result } from "effect"
import type { EffectDrizzleSqlite } from "@tiancode-ai/effect-drizzle-sqlite"

type Database = EffectDrizzleSqlite.EffectSQLiteDatabase

// Startup checks on the SQLite file. database.ts runs them right after opening the
// connection and before migrations.

/** A file smaller than this is not worth rewriting, however empty it is. */
export const COMPACT_MIN_BYTES = 64 * 1024 * 1024
/** Rewrite once at least this share of the pages sits on the freelist. */
export const COMPACT_MIN_FREE_RATIO = 0.5
/** 40 × 750 ms: long enough for a backup or an antivirus pass to let go of the file. */
export const WRITE_PROBE_ATTEMPTS = 40
export const WRITE_PROBE_DELAY_MS = 750

export type Stats = { pageSize: number; pageCount: number; freelistCount: number }

export class DatabaseLockedError extends Error {
  readonly _tag = "DatabaseLockedError"
  constructor(
    readonly attempts: number,
    cause: unknown,
  ) {
    super(
      `database is still locked by another process after ${attempts} attempts ` +
        `(a backup, an antivirus scan or a previous instance may be holding it): ${String(cause)}`,
      { cause },
    )
    this.name = "DatabaseLockedError"
  }
}

const pragma = (db: Database, name: string) =>
  db
    .all<Record<string, number | bigint>>(`PRAGMA ${name}`)
    .pipe(Effect.map((rows) => Number(rows[0]?.[name] ?? 0)))

export const stats = Effect.fn("DatabaseMaintenance.stats")(function* (db: Database) {
  const result: Stats = {
    pageSize: yield* pragma(db, "page_size"),
    pageCount: yield* pragma(db, "page_count"),
    freelistCount: yield* pragma(db, "freelist_count"),
  }
  return result
})

export function shouldCompact(input: Stats) {
  const bytes = input.pageSize * input.pageCount
  if (bytes < COMPACT_MIN_BYTES) return false
  return input.freelistCount / Math.max(input.pageCount, 1) >= COMPACT_MIN_FREE_RATIO
}

/**
 * Deleting sessions leaves their pages on the freelist and SQLite never returns that space
 * on its own. One machine reached 5.5 GB for 28 MB of live data, which turned every copy or
 * antivirus scan of the file into a minute-long lock. VACUUM rewrites only the live pages, so
 * it is cheap even on a huge file (627 ms for that 5.5 GB one).
 */
export const compact = Effect.fn("DatabaseMaintenance.compact")(function* (db: Database) {
  const before = yield* stats(db)
  if (!shouldCompact(before)) return { compacted: false as const, before }
  const started = Date.now()
  yield* db.run("VACUUM")
  const after = yield* stats(db)
  yield* Effect.logInfo("compacted database", {
    bytesBefore: before.pageSize * before.pageCount,
    bytesAfter: after.pageSize * after.pageCount,
    ms: Date.now() - started,
  })
  return { compacted: true as const, before, after }
})

export function isLockError(error: unknown): boolean {
  const seen = new Set<unknown>()
  const parts: string[] = []
  let current: unknown = error
  while (current !== undefined && current !== null && !seen.has(current) && parts.length < 8) {
    seen.add(current)
    parts.push(current instanceof Error ? current.message : String(current))
    current = current instanceof Error ? current.cause : undefined
  }
  return /readonly|read-only|locked|busy|EPERM|EBUSY|EACCES/i.test(parts.join(" "))
}

/**
 * Takes and releases a write lock, retrying while another process holds the file. Without
 * this a connection opened during a backup or an antivirus pass quietly degrades to read-only
 * and every write fails for the rest of the session — which the desktop app shows as
 * "could not connect to the local server" right after an update.
 */
export const probeWritable = Effect.fn("DatabaseMaintenance.probeWritable")(function* (
  db: Database,
  attempts: number = WRITE_PROBE_ATTEMPTS,
  delayMs: number = WRITE_PROBE_DELAY_MS,
) {
  for (let attempt = 1; ; attempt++) {
    const result = yield* Effect.result(db.run("BEGIN IMMEDIATE").pipe(Effect.andThen(db.run("ROLLBACK"))))
    if (Result.isSuccess(result)) return attempt
    const error: unknown = result.failure
    if (!isLockError(error)) return yield* Effect.fail(error)
    if (attempt >= attempts) return yield* Effect.fail(new DatabaseLockedError(attempt, error))
    yield* Effect.logWarning("database is locked, retrying", { attempt, attempts, error: String(error) })
    yield* Effect.sleep(delayMs)
  }
})
