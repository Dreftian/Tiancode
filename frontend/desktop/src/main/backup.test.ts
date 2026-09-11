import { afterEach, describe, expect, test } from "bun:test"
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { createBackupService } from "./backup"

const roots: string[] = []
const stores = [
  ["credentials.key", "safe-storage-encrypted-key"],
  ["tiancode.settings", '{"theme":"dark"}'],
  ["tiancode.global.dat", '{"language":"es"}'],
  ["default.dat", '{"layout":"wide"}'],
  ["tiancode.updater", '{"ready":{"version":"1.0.12"}}'],
] as const

async function userData() {
  const root = await mkdtemp(join(tmpdir(), "tiancode-backup-"))
  roots.push(root)
  return root
}

async function writeEntry(root: string, entry: string, value: string) {
  const path = join(root, entry)
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, value)
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

describe("backups", () => {
  test("includes the credential key and Electron configuration stores", async () => {
    const root = await userData()
    await Promise.all(stores.map(([entry, value]) => writeEntry(root, entry, value)))

    const name = await createBackupService(root).backupNow()
    if (!name) throw new Error("expected a backup")

    await Promise.all(
      stores.map(async ([entry, value]) => {
        expect(await readFile(join(root, "backups", name, entry), "utf8")).toBe(value)
      }),
    )
  })

  test("restores backed-up stores without deleting entries absent from the snapshot", async () => {
    const root = await userData()
    await Promise.all(stores.map(([entry, value]) => writeEntry(root, entry, value)))
    const backups = createBackupService(root)
    const name = await backups.backupNow()
    if (!name) throw new Error("expected a backup")

    await Promise.all(stores.map(([entry, value]) => writeEntry(root, entry, `changed:${value}`)))
    await writeEntry(root, "state/created-after-backup.json", '{"keep":true}')
    await writeEntry(root, "untracked.txt", "keep")

    await backups.restoreBackup(name)

    await Promise.all(
      stores.map(async ([entry, value]) => {
        expect(await readFile(join(root, entry), "utf8")).toBe(value)
      }),
    )
    expect(await readFile(join(root, "state", "created-after-backup.json"), "utf8")).toBe('{"keep":true}')
    expect(await readFile(join(root, "untracked.txt"), "utf8")).toBe("keep")
  })

  test("keeps current credentials and stores when restoring an older partial backup", async () => {
    const root = await userData()
    const name = "2026-08-09T10-00-00"
    await writeEntry(root, join("backups", name, "config.json"), '{"legacy":true}')
    await Promise.all(stores.map(([entry, value]) => writeEntry(root, entry, value)))

    await createBackupService(root).restoreBackup(name)

    expect(await readFile(join(root, "config.json"), "utf8")).toBe('{"legacy":true}')
    await Promise.all(
      stores.map(async ([entry, value]) => {
        expect(await readFile(join(root, entry), "utf8")).toBe(value)
      }),
    )
  })

  test("backs up and restores backend auth and global configuration without removing models", async () => {
    const root = await userData()
    const global = {
      data: join(root, "backend-data"),
      config: join(root, "backend-config"),
      state: join(root, "backend-state"),
    }
    await Promise.all([
      writeEntry(root, "backend-data/mcp-auth.json", '{"remote":{"tokens":{"accessToken":"token"}}}'),
      writeEntry(root, "backend-data/auth.json", '{"provider":"key"}'),
      writeEntry(root, "backend-data/models/download.gguf", "not-backed-up"),
      writeEntry(root, "backend-config/config.json", '{"mcp":{"remote":{"type":"remote"}}}'),
      writeEntry(root, "backend-config/skills/release/SKILL.md", "# Release skill"),
      writeEntry(root, "backend-config/plugins/example/plugin.json", '{"name":"example"}'),
      writeEntry(root, "backend-config/agent/reviewer.md", "Review carefully."),
      writeEntry(root, "backend-state/plugin-meta.json", '{"example":"enabled"}'),
    ])
    const backups = createBackupService(root, undefined, { global })
    const name = await backups.backupNow()
    if (!name) throw new Error("expected a backup")

    expect(await readFile(join(root, "backups", name, "backend", "data", "mcp-auth.json"), "utf8")).toContain("token")
    expect(await readFile(join(root, "backups", name, "backend", "config", "skills", "release", "SKILL.md"), "utf8")).toBe(
      "# Release skill",
    )
    expect(await Bun.file(join(root, "backups", name, "backend", "data", "models", "download.gguf")).exists()).toBe(false)

    await Promise.all([
      writeEntry(root, "backend-data/mcp-auth.json", '{"remote":{"tokens":{"accessToken":"changed"}}}'),
      writeEntry(root, "backend-config/skills/release/SKILL.md", "changed"),
      writeEntry(root, "backend-data/models/current.gguf", "keep"),
      writeEntry(root, "backend-data/created-after-backup.json", '{"keep":true}'),
    ])
    await backups.restoreBackup(name)

    expect(await readFile(join(root, "backend-data", "mcp-auth.json"), "utf8")).toContain("token")
    expect(await readFile(join(root, "backend-config", "skills", "release", "SKILL.md"), "utf8")).toBe("# Release skill")
    expect(await readFile(join(root, "backend-data", "models", "current.gguf"), "utf8")).toBe("keep")
    expect(await readFile(join(root, "backend-data", "created-after-backup.json"), "utf8")).toBe('{"keep":true}')
  })

  test("snapshots SQLite databases through SQLite instead of copying the live file", async () => {
    const root = await userData()
    const global = {
      data: join(root, "backend-data"),
      config: join(root, "backend-config"),
      state: join(root, "backend-state"),
    }
    await Promise.all([
      writeEntry(root, "backend-data/tiancode.db", "live database"),
      writeEntry(root, "backend-data/tiancode.db-wal", "wal"),
      writeEntry(root, "backend-data/tiancode.db-shm", "shm"),
      writeEntry(root, "backend-data/nested/other.sqlite", "another database"),
      writeEntry(root, "backend-data/auth.json", '{"provider":"key"}'),
      writeEntry(root, "drafts.sqlite", "drafts"),
    ])
    const calls: Array<[string, string]> = []
    const backups = createBackupService(root, undefined, {
      global,
      snapshotDatabase: async (source, destination) => {
        calls.push([source, destination])
        await writeFile(destination, `snapshot of ${source}`)
      },
    })
    const name = await backups.backupNow()
    if (!name) throw new Error("expected a backup")
    const data = join(root, "backups", name, "backend", "data")

    // Every database goes through SQLite, whether it is a top-level entry or nested in a dir.
    expect(calls.map(([source]) => source).sort()).toEqual(
      [join(root, "drafts.sqlite"), join(root, "backend-data", "tiancode.db"), join(root, "backend-data", "nested", "other.sqlite")].sort(),
    )
    expect(await readFile(join(data, "tiancode.db"), "utf8")).toContain("snapshot of")
    expect(await readFile(join(root, "backups", name, "drafts.sqlite"), "utf8")).toContain("snapshot of")
    // A WAL and its index only mean something to the process that has the file open.
    expect(await Bun.file(join(data, "tiancode.db-wal")).exists()).toBe(false)
    expect(await Bun.file(join(data, "tiancode.db-shm")).exists()).toBe(false)
    // Ordinary files are still plain copies.
    expect(await readFile(join(data, "auth.json"), "utf8")).toBe('{"provider":"key"}')
  })

  test("leaves a database out of the backup, and says so, when SQLite cannot snapshot it", async () => {
    const root = await userData()
    const global = {
      data: join(root, "backend-data"),
      config: join(root, "backend-config"),
      state: join(root, "backend-state"),
    }
    await Promise.all([
      writeEntry(root, "backend-data/tiancode.db", "live database"),
      writeEntry(root, "backend-data/auth.json", '{"provider":"key"}'),
    ])
    const logs: Array<[string, string, Record<string, unknown> | undefined]> = []
    const backups = createBackupService(root, (scope, event, data) => logs.push([scope, event, data]), {
      global,
      snapshotDatabase: async () => {
        throw new Error("database is locked")
      },
    })
    const name = await backups.backupNow()
    if (!name) throw new Error("expected a backup")

    // A torn copy of a live database would be worse than none.
    expect(await Bun.file(join(root, "backups", name, "backend", "data", "tiancode.db")).exists()).toBe(false)
    expect(await readFile(join(root, "backups", name, "backend", "data", "auth.json"), "utf8")).toBe('{"provider":"key"}')
    expect(logs.some(([scope, event, data]) => scope === "backup" && event === "database skipped" && String(data?.error).includes("locked"))).toBe(true)
  })

  test("never restores a WAL or shared-memory file over a live database", async () => {
    const root = await userData()
    const global = {
      data: join(root, "backend-data"),
      config: join(root, "backend-config"),
      state: join(root, "backend-state"),
    }
    const backups = createBackupService(root, undefined, { global, snapshotDatabase: async (s, d) => writeFile(d, "snapshot") })
    await writeEntry(root, "backend-data/tiancode.db", "live database")
    const name = await backups.backupNow()
    if (!name) throw new Error("expected a backup")
    // Simulate an old backup made with a raw copy that dragged the sidecar files along.
    await writeEntry(root, `backups/${name}/backend/data/tiancode.db-wal`, "stale wal")
    await writeEntry(root, `backups/${name}/backend/data/tiancode.db-shm`, "stale shm")

    await backups.restoreBackup(name)

    expect(await readFile(join(root, "backend-data", "tiancode.db"), "utf8")).toBe("snapshot")
    expect(await Bun.file(join(root, "backend-data", "tiancode.db-wal")).exists()).toBe(false)
    expect(await Bun.file(join(root, "backend-data", "tiancode.db-shm")).exists()).toBe(false)
  })
})
