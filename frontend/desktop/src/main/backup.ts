import { app } from "electron"
import { cp, mkdir, readdir, rm, stat } from "node:fs/promises"
import { existsSync } from "node:fs"
import { join } from "node:path"
import { write as writeLog } from "./logging"

// Respaldo automático de datos de la app: sesiones, configuración y estado.
// Los modelos descargados (GGUF, voces, cachés) NO se respaldan — ocupan GB y
// se pueden volver a descargar; aquí solo va lo que no se puede regenerar.

const BACKUP_DIR = "backups"
const KEEP_BACKUPS = 7

// Carpetas/archivos de userData que se copian tal cual.
const BACKUP_ENTRIES = ["config.json", "tiancode.json", "tiancode.jsonc", "session", "state", "desktop", "drafts.sqlite"]

function backupsDir() {
  return join(app.getPath("userData"), BACKUP_DIR)
}

export async function backupNow(): Promise<string | null> {
  const dir = backupsDir()
  await mkdir(dir, { recursive: true })
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)
  const target = join(dir, stamp)
  await mkdir(target, { recursive: true })
  const userData = app.getPath("userData")
  let copied = 0
  for (const entry of BACKUP_ENTRIES) {
    const source = join(userData, entry)
    if (!existsSync(source)) continue
    await cp(source, join(target, entry), { recursive: true, force: false })
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

export type BackupInfo = { name: string; createdAt: number }

export async function listBackups(): Promise<BackupInfo[]> {
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

// Restaura un respaldo: borra las carpetas de datos actuales y copia de
// vuelta el contenido del respaldo. La app debe reiniciarse después (el
// renderer confirma antes de llamar).
export async function restoreBackup(name: string): Promise<void> {
  const source = join(backupsDir(), name)
  if (!existsSync(source)) throw new Error(`Backup not found: ${name}`)
  const userData = app.getPath("userData")
  for (const entry of BACKUP_ENTRIES) {
    const target = join(userData, entry)
    await rm(target, { recursive: true, force: true })
  }
  for (const entry of BACKUP_ENTRIES) {
    const from = join(source, entry)
    if (!existsSync(from)) continue
    await cp(from, join(userData, entry), { recursive: true, force: false })
  }
  writeLog("backup", "restored", { name })
}
