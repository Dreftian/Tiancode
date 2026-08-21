import { createHash } from "node:crypto"
import { eq } from "drizzle-orm"
import { blob, sqliteTable, text } from "drizzle-orm/sqlite-core"

const documents = sqliteTable("document", {
  key: text().primaryKey(),
  value: text().notNull(),
})
const blobs = sqliteTable("blob", {
  id: text().primaryKey(),
  data: blob({ mode: "buffer" }).notNull(),
})

type DraftDatabase = {
  select: (fields: any) => any
  insert: (table: any) => any
  delete: (table: any) => any
  transaction: (callback: (tx: any) => void) => void
}

export function createDesktopDraftStore(filename: string) {
  let native: { exec: (sql: string) => void; close: () => void }
  let db: DraftDatabase

  if ("Bun" in globalThis && !process.versions.electron) {
    const { Database } = require("bun:sqlite")
    const { drizzle } = require("drizzle-orm/bun-sqlite")
    const bunDb = new Database(filename)
    bunDb.exec(
      "PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS document (key TEXT PRIMARY KEY, value TEXT NOT NULL); CREATE TABLE IF NOT EXISTS blob (id TEXT PRIMARY KEY, data BLOB NOT NULL);",
    )
    native = bunDb
    db = drizzle({ client: bunDb }) as DraftDatabase
  } else {
    const { DatabaseSync } = require("node:sqlite")
    const { drizzle: nodeDrizzle } = require("drizzle-orm/node-sqlite")
    const nodeDb = new DatabaseSync(filename)
    nodeDb.exec(
      "PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS document (key TEXT PRIMARY KEY, value TEXT NOT NULL); CREATE TABLE IF NOT EXISTS blob (id TEXT PRIMARY KEY, data BLOB NOT NULL);",
    )
    native = nodeDb
    db = nodeDrizzle({ client: nodeDb }) as DraftDatabase
  }
  const used = new Set<string>()
  db.select({ value: documents.value })
    .from(documents)
    .all()
    .forEach(({ value }: { value: string }) =>
      JSON.parse(value, (_key, item) => {
        if (item?.blob && typeof item.blob.id === "string") used.add(item.blob.id)
        return item
      }),
    )
  db.select({ id: blobs.id })
    .from(blobs)
    .all()
    .filter(({ id }: { id: string }) => !used.has(id))
    .forEach(({ id }: { id: string }) => db.delete(blobs).where(eq(blobs.id, id)).run())
  const pending = new Map<string, string | null>()
  let timer: ReturnType<typeof setTimeout> | undefined
  const flush = () => {
    if (timer) clearTimeout(timer)
    timer = undefined
    const writes = [...pending]
    pending.clear()
    db.transaction((tx: any) => {
      writes.forEach(([key, value]) => {
        if (value === null) tx.delete(documents).where(eq(documents.key, key)).run()
        else
          tx.insert(documents)
            .values({ key, value })
            .onConflictDoUpdate({ target: documents.key, set: { value } })
            .run()
      })
    })
  }
  const schedule = () => {
    if (!timer) timer = setTimeout(flush, 500)
  }
  return {
    get: (key: string) =>
      pending.has(key)
        ? (pending.get(key) ?? null)
        : (db.select({ value: documents.value }).from(documents).where(eq(documents.key, key)).get()?.value ?? null),
    set(key: string, value: string | null) {
      pending.set(key, value)
      schedule()
    },
    putBlob(data: Uint8Array) {
      const id = createHash("sha256").update(data).digest("hex")
      db.insert(blobs)
        .values({ id, data: Buffer.from(data) })
        .onConflictDoNothing()
        .run()
      return id
    },
    getBlob: (id: string) => db.select({ data: blobs.data }).from(blobs).where(eq(blobs.id, id)).get()?.data ?? null,
    flush,
    close() {
      flush()
      native.close()
    },
  }
}
