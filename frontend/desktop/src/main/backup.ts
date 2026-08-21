import { existsSync } from "node:fs"
import { cp, mkdir, readdir, rm, stat } from "node:fs/promises"
import { dirname, join, relative, resolve, sep } from "node:path"
import { resolveDesktopXdgPaths, type DesktopXdgPaths } from "./xdg-paths"

// Respaldo automático de datos de la app: sesiones, configuración y estado.
// Los modelos descargados (GGUF, voces, cachés) NO se respaldan — ocupan GB y
// se pueden volver a descargar; aquí solo va lo que no se puede regenerar.

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

type BackupLog = (scope: string, event: string, data?: Record<string, unknown>) => void

export type BackupInfo = { name: string; createdAt: number }
export type BackupGlobalPaths = Pick<DesktopXdgPaths["global"], "data" | "config" | "state">

type BackupOptions = {
  global?: BackupGlobalPaths
}

type BackupEntry = {
  source: string
  destination: string
  excludeModels?: boolean
}

export function createBackupService(userData: string, writeLog: BackupLog = () => {}, options: BackupOptions = {}) {
  const backupsDir = () => join(userData, BACKUP_DIR)
  const global = options.global ?? resolveDesktopXdgPaths(userData).global
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
      await copyBackupEntry(entry, destination, false)
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
      await copyBackupEntry({ ...entry, source: join(source, entry.destination) }, entry.source, true)
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

async function copyBackupEntry(entry: BackupEntry, destination: string, force: boolean) {
  if (!entry.excludeModels) {
    await cp(entry.source, destination, { recursive: true, force })
    return
  }
  await cp(entry.source, destination, {
    recursive: true,
    force,
    filter: (source) => {
      const path = relative(entry.source, source)
      return path !== "models" && !path.startsWith(`models${sep}`)
    },
  })
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
