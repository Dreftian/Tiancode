import { existsSync } from "node:fs"
import { cp, mkdir, readdir, rm, stat } from "node:fs/promises"
import { dirname, join, relative, resolve, sep } from "node:path"
import { resolveDesktopXdgPaths, type DesktopXdgPaths } from "./xdg-paths"

// Respaldo automático de datos de la app: sesiones, configuración y estado.
// Los modelos descargados (GGUF, voces, cachés) NO se respaldan — ocupan GB y
// se pueden volver a descargar; aquí solo va lo que no se puede regenerar.
//
// Las bases SQLite no se copian como archivos: el respaldo corre al arrancar,
// en paralelo con el servidor que las tiene abiertas en modo WAL, y en Windows
// una copia cruda bloquea el archivo el tiempo que dure — con una base de
// 5,5 GB fueron 60 s en los que el servidor quedó en solo lectura y la app
// mostró "No se pudo conectar". Se piden a SQLite (VACUUM INTO): una
// instantánea consistente, con sus bloqueos, y ya compactada.

const BACKUP_DIR = "backups"
const KEEP_BACKUPS = 7

// backupNow genera los nombres con este patrón (ver más abajo).
const BACKUP_NAME_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}$/

// Carpetas/archivos de userData que se copian tal cual. electron-store guarda
// los stores con estos nombres sin extensión, y credentials.key permite abrir
// las credenciales cifradas que el sidecar persiste junto al estado.
const BACKUP_ENTRIES = [
  "config.json",
  "tiancode.json",
  "tiancode.jsonc",
  "session",
  "state",
  "desktop",
  "drafts.sqlite",
  "credentials.key",
  "tiancode.settings",
  "tiancode.global.dat",
  "default.dat",
  "tiancode.updater",
]

const SQLITE_DATABASE = /\.(db|sqlite|sqlite3)$/i
// El -wal/-shm de una base abierta no tiene sentido fuera de su proceso, y
// restaurarlos encima de una base viva la corrompe.
const SQLITE_SIDECAR = /\.(db|sqlite|sqlite3)-(wal|shm|journal)$/i

export const isSqliteDatabase = (path: string) => SQLITE_DATABASE.test(path)
export const isSqliteSidecar = (path: string) => SQLITE_SIDECAR.test(path)

type BackupLog = (scope: string, event: string, data?: Record<string, unknown>) => void

export type BackupInfo = { name: string; createdAt: number }
export type BackupGlobalPaths = Pick<DesktopXdgPaths["global"], "data" | "config" | "state">
export type SnapshotDatabase = (source: string, destination: string) => Promise<void>

type BackupOptions = {
  global?: BackupGlobalPaths
  /** Cómo obtener la copia de una base SQLite; por defecto, VACUUM INTO. */
  snapshotDatabase?: SnapshotDatabase
}

type BackupEntry = {
  source: string
  destination: string
  excludeModels?: boolean
}

type CopyMode = { direction: "backup"; snapshot: SnapshotDatabase; log: BackupLog } | { direction: "restore" }

export function createBackupService(userData: string, writeLog: BackupLog = () => {}, options: BackupOptions = {}) {
  const backupsDir = () => join(userData, BACKUP_DIR)
  const global = options.global ?? resolveDesktopXdgPaths(userData).global
  const snapshotDatabase = options.snapshotDatabase ?? snapshotSqlite
  const entries = (): BackupEntry[] => [
    ...BACKUP_ENTRIES.map((entry) => ({ source: join(userData, entry), destination: entry })),
    { source: global.data, destination: join("backend", "data"), excludeModels: true },
    { source: global.config, destination: join("backend", "config") },
    { source: global.state, destination: join("backend", "state") },
  ]

  async function backupNow(): Promise<string | null> {
    const dir = backupsDir()
    await mkdir(dir, { recursive: true })
    const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)
    const target = join(dir, stamp)
    await mkdir(target, { recursive: true })
    let copied = 0
    for (const entry of entries()) {
      if (!existsSync(entry.source)) continue
      const destination = join(target, entry.destination)
      await mkdir(dirname(destination), { recursive: true })
      await copyBackupEntry(entry, destination, { direction: "backup", snapshot: snapshotDatabase, log: writeLog })
      copied++
    }
    if (copied === 0) {
      await rm(target, { recursive: true, force: true })
      return null
    }
    await pruneOldBackups()
    writeLog("backup", "created", { target, entries: copied })
    return stamp
  }

  async function pruneOldBackups() {
    const dir = backupsDir()
    const entries = (await readdir(dir, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort()
      .reverse()
    for (const stale of entries.slice(KEEP_BACKUPS)) {
      await rm(join(dir, stale), { recursive: true, force: true })
      writeLog("backup", "pruned", { stale })
    }
  }

  async function listBackups(): Promise<BackupInfo[]> {
    const dir = backupsDir()
    if (!existsSync(dir)) return []
    const entries = (await readdir(dir, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory())
      .map(async (entry) => {
        const info = await stat(join(dir, entry.name))
        return { name: entry.name, createdAt: info.mtimeMs }
      })
    return (await Promise.all(entries)).sort((a, b) => b.createdAt - a.createdAt)
  }

  // Restaura exclusivamente las entradas presentes en el respaldo y las
  // fusiona: snapshots antiguos no deben borrar credenciales, modelos ni datos
  // creados después de la copia.
  async function restoreBackup(name: string): Promise<void> {
    const source = assertValidBackupSource(name)
    const info = await stat(source).catch(() => null)
    if (!info || !info.isDirectory()) throw new Error(`Backup not found: ${name}`)
    const restored = entries().filter((entry) => existsSync(join(source, entry.destination)))
    for (const entry of restored) {
      await mkdir(dirname(entry.source), { recursive: true })
      await copyBackupEntry({ ...entry, source: join(source, entry.destination) }, entry.source, {
        direction: "restore",
      })
    }
    writeLog("backup", "restored", { name, entries: restored.length })
  }

  // Valida el nombre de un respaldo antes de leer nada: backupNow los nombra
  // con una marca de tiempo ISO (YYYY-MM-DDTHH-MM-SS) y deben quedar confinados
  // bajo backupsDir() — un nombre arbitrario no debe poder salirse de ahí.
  function assertValidBackupSource(name: string) {
    if (!BACKUP_NAME_PATTERN.test(name)) throw new Error(`Invalid backup name: ${name}`)
    const source = resolve(backupsDir(), name)
    if (!source.startsWith(`${backupsDir()}${sep}`)) throw new Error(`Invalid backup name: ${name}`)
    return source
  }

  return { backupNow, listBackups, restoreBackup }
}

async function copyBackupEntry(entry: BackupEntry, destination: string, mode: CopyMode) {
  const info = await stat(entry.source)
  if (info.isFile()) {
    if (isSqliteSidecar(entry.source)) return
    if (mode.direction === "backup" && isSqliteDatabase(entry.source)) {
      await snapshot(mode, entry.source, destination)
      return
    }
    await cp(entry.source, destination, { force: mode.direction === "restore" })
    return
  }

  const excluded = (path: string) =>
    entry.excludeModels === true && (path === "models" || path.startsWith(`models${sep}`))
  await cp(entry.source, destination, {
    recursive: true,
    force: mode.direction === "restore",
    filter: (source) => {
      if (excluded(relative(entry.source, source))) return false
      if (isSqliteSidecar(source)) return false
      return !(mode.direction === "backup" && isSqliteDatabase(source))
    },
  })
  if (mode.direction !== "backup") return
  for (const file of await walk(entry.source, excluded)) {
    if (!isSqliteDatabase(file)) continue
    const target = join(destination, relative(entry.source, file))
    await mkdir(dirname(target), { recursive: true })
    await snapshot(mode, file, target)
  }
}

async function snapshot(mode: Extract<CopyMode, { direction: "backup" }>, source: string, destination: string) {
  try {
    await mode.snapshot(source, destination)
  } catch (error) {
    // Una copia rota de una base viva es peor que ninguna: se deja fuera y se dice.
    await rm(destination, { force: true }).catch(() => undefined)
    mode.log("backup", "database skipped", {
      source,
      error: error instanceof Error ? error.message : String(error),
    })
  }
}

async function walk(dir: string, excluded: (path: string) => boolean, root = dir): Promise<string[]> {
  const files: string[] = []
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (excluded(relative(root, full))) continue
    if (entry.isDirectory()) files.push(...(await walk(full, excluded, root)))
    else if (entry.isFile()) files.push(full)
  }
  return files
}

// La instantánea la hace SQLite: toma sus propios bloqueos (compatibles con el
// servidor que escribe en WAL), sale consistente y compactada. Importación
// dinámica porque el bundle de tests corre en Bun, que no trae node:sqlite.
async function snapshotSqlite(source: string, destination: string) {
  const specifier = "node:sqlite"
  const { DatabaseSync } = (await import(/* @vite-ignore */ specifier)) as {
    DatabaseSync: new (filename: string) => { exec(sql: string): void; close(): void }
  }
  const db = new DatabaseSync(source)
  try {
    db.exec(`VACUUM INTO '${destination.replaceAll("'", "''")}'`)
  } finally {
    db.close()
  }
}

async function appBackups() {
  const [{ app }, { write }] = await Promise.all([import("electron"), import("./logging")])
  return createBackupService(app.getPath("userData"), write)
}

export async function backupNow() {
  return (await appBackups()).backupNow()
}

export async function listBackups() {
  return (await appBackups()).listBackups()
}

export async function restoreBackup(name: string) {
  return (await appBackups()).restoreBackup(name)
}
