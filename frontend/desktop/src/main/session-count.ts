import { existsSync } from "node:fs"
import { createRequire } from "node:module"
import { pathToFileURL } from "node:url"

/**
 * Rows in a Tiancode database's session table, or undefined when it cannot be read. The folder may
 * belong to the profile not in use, so nothing is written there: a cleanly closed database is
 * opened immutable (a plain read-only open would leave -wal/-shm files behind), and one with a
 * WAL file is read through it, since recent sessions live there until a checkpoint.
 */
export function countSessions(database: string) {
  if (!existsSync(database)) return 0
  if (existsSync(`${database}-wal`)) return read(database)
  // A network path (a redirected %APPDATA%) cannot be opened as a URI; read it the plain way.
  return read(new URL(`${pathToFileURL(database).href}?immutable=1`)) ?? read(database)
}

function read(target: string | URL) {
  try {
    // node:sqlite exists in Electron's Node but not in the Bun test runner, hence the late require.
    const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite") as {
      DatabaseSync: new (file: string | URL, options: { readOnly: boolean }) => {
        prepare(sql: string): { get(): unknown }
        close(): void
      }
    }
    const db = new DatabaseSync(target, { readOnly: true })
    try {
      const row = db.prepare("select count(*) as n from session").get()
      return typeof row === "object" && row !== null && "n" in row ? Number(row.n) : undefined
    } finally {
      db.close()
    }
  } catch {
    return undefined
  }
}
