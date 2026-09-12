// The Windows queries behind the window matcher. Split from window-rank.ts so the ranking — the
// part that decides what the user sees mirrored — can be unit-tested without pulling in Electron.

import { execFile } from "node:child_process"
import { join } from "node:path"
import { write as writeLog } from "./logging"

export * from "./window-rank"

const PS_TIMEOUT_MS = 4_000

// An absolute path, not a bare name: libuv's Windows search starts at the current directory, so a
// planted powershell.exe next to the app would win.
const POWERSHELL = join(
  process.env.SystemRoot ?? "C:\\Windows",
  "System32",
  "WindowsPowerShell",
  "v1.0",
  "powershell.exe",
)

function powershell(script: string): Promise<string> {
  return new Promise((resolve) => {
    execFile(
      POWERSHELL,
      [
        "-NoProfile",
        "-NonInteractive",
        "-ExecutionPolicy",
        "Bypass",
        "-Command",
        // PowerShell 5.1 writes the OEM codepage by default, which mangles accented window titles.
        `[Console]::OutputEncoding=[Text.Encoding]::UTF8; ${script}`,
      ],
      { timeout: PS_TIMEOUT_MS, windowsHide: true, maxBuffer: 4 * 1024 * 1024 },
      (error, stdout) => {
        if (error) {
          writeLog("window-match", "powershell query failed", { error: error.message }, "warn")
          resolve("")
          return
        }
        resolve(stdout)
      },
    )
  })
}

/**
 * The spawned pid plus every descendant.
 *
 * Not optional: the manager spawns through cmd.exe on Windows, so the window belongs to a
 * grandchild (cmd → npm → electron) and the reported pid owns nothing.
 */
export async function listDescendantPids(rootPid: number): Promise<number[]> {
  if (process.platform !== "win32" || !Number.isFinite(rootPid)) return []
  const out = await powershell(
    "Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId | ConvertTo-Json -Compress",
  )
  if (!out.trim()) return [rootPid]
  let rows: unknown
  try {
    rows = JSON.parse(out)
  } catch {
    return [rootPid]
  }
  const children = new Map<number, number[]>()
  if (Array.isArray(rows)) {
    for (const row of rows) {
      if (!row || typeof row !== "object") continue
      const pid = (row as { ProcessId?: unknown }).ProcessId
      const parent = (row as { ParentProcessId?: unknown }).ParentProcessId
      if (typeof pid !== "number" || typeof parent !== "number") continue
      const list = children.get(parent)
      if (list) list.push(pid)
      else children.set(parent, [pid])
    }
  }
  const seen = new Set<number>([rootPid])
  const queue = [rootPid]
  while (queue.length > 0) {
    const current = queue.shift()!
    for (const child of children.get(current) ?? []) {
      if (seen.has(child)) continue
      seen.add(child)
      queue.push(child)
    }
  }
  return [...seen]
}

export type ProcessWindow = { pid: number; handle: number; title: string }

/** The main window handle and title of each of those pids that owns one. */
export async function windowsForPids(pids: number[]): Promise<ProcessWindow[]> {
  if (process.platform !== "win32" || pids.length === 0) return []
  const list = pids.join(",")
  const out = await powershell(
    `Get-Process -Id ${list} -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 } | ` +
      "Select-Object Id,@{n='Handle';e={[int64]$_.MainWindowHandle}},MainWindowTitle | ConvertTo-Json -Compress",
  )
  if (!out.trim()) return []
  let rows: unknown
  try {
    rows = JSON.parse(out)
  } catch {
    return []
  }
  // ConvertTo-Json emits a bare object for a single row.
  const array = Array.isArray(rows) ? rows : [rows]
  const result: ProcessWindow[] = []
  for (const row of array) {
    if (!row || typeof row !== "object") continue
    const pid = (row as { Id?: unknown }).Id
    const handle = (row as { Handle?: unknown }).Handle
    const title = (row as { MainWindowTitle?: unknown }).MainWindowTitle
    if (typeof pid !== "number" || typeof handle !== "number") continue
    result.push({ pid, handle, title: typeof title === "string" ? title : "" })
  }
  return result
}
