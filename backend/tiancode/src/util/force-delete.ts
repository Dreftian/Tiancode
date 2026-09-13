// Best-effort deletion, and what to say when Windows still says no.
//
// Windows file locks are mandatory, not advisory: while a process holds a handle opened without
// FILE_SHARE_DELETE, the unlink is refused no matter what the ACLs say. Granting Full Control
// changes nothing; the delete succeeds the instant the holder dies. So "access denied" is never a
// useful answer here — the useful answer is WHO is holding it and WHAT the user can do about it.
//
// The ladder, in order, stopping at the first rung that works:
//   1. remove what can be removed (keep walking past failures instead of aborting on the first)
//   2. retry briefly — a scan or a just-closed handle clears on its own
//   2b. clear the read-only attribute and retry once more
//   3. name the holder through the Restart Manager (no admin, no bundled sysinternals)
//   4. schedule the leftovers for the next boot (MoveFileEx + MOVEFILE_DELAY_UNTIL_REBOOT)
//   5. terminate the holder — only when the caller asks for it, and never when it is us
//
// Everything here is data in, data out: no prose. The report the model reads is rendered by
// `tool/delete.ts`, which owns the wording.

import { chmod, lstat, mkdtemp, readdir, rm, rmdir, unlink, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { Process } from "./process"

export type FailureKind = "locked" | "denied" | "not-empty" | "missing" | "other"

export interface Failure {
  path: string
  directory: boolean
  code: string
  message: string
  kind: FailureKind
}

export interface RemoveResult {
  removed: number
  failures: Failure[]
}

/** One row as the Restart Manager reported it, before we work out whether it is us. */
export interface RawHolder {
  pid: number
  type?: number
  name?: string
  service?: string
  path?: string
}

export interface Holder {
  pid: number
  name: string
  /** Short service name when the holder is a Windows service (RM_APP_TYPE 3). */
  service?: string
  path?: string
  /** RM_APP_TYPE: 0 unknown, 1 main window, 2 other window, 3 service, 4 Explorer, 5 console, 1000 critical. */
  appType?: number
  /** The holder is Tiancode: this process, one of its ancestors, or a sibling running the same exe. */
  self: boolean
  /** Its executable lives inside what we were asked to delete. */
  insideTarget: boolean
}

export interface SelfInfo {
  pids: readonly number[]
  paths: readonly string[]
}

export type ProbeOutcome = "ok" | "skipped" | "unsupported" | "failed"

export interface ProbeResult {
  outcome: ProbeOutcome
  holders: RawHolder[]
  self: SelfInfo
  elevated?: boolean
  /** Paths the Restart Manager would not take: too long even as an 8.3 short name. */
  skipped?: number
  error?: string
}

export interface ScheduleResult {
  scheduled: string[]
  failed: { path: string; code: number }[]
  elevated?: boolean
  adminRequired: boolean
  error?: string
}

export type Step = "remove" | "retry" | "readonly" | "identify" | "schedule" | "terminate"

export interface Attempt {
  step: Step
  ok: boolean
  /** A short token for the renderer to translate — never prose. */
  note?: string
}

export interface Report {
  target: string
  platform: NodeJS.Platform
  removed: number
  failures: Failure[]
  holders: Holder[]
  probe: ProbeOutcome
  probeError?: string
  probeSkipped: number
  elevated?: boolean
  scheduled: string[]
  scheduleFailed: { path: string; code: number }[]
  scheduleAdminRequired: boolean
  scheduleError?: string
  terminated: Holder[]
  attempts: Attempt[]
  ok: boolean
}

// ---------------------------------------------------------------------------------------------
// Pure
// ---------------------------------------------------------------------------------------------

/**
 * Node reports a Windows sharing violation as EBUSY on some calls and EPERM on others, and EPERM
 * is also what a read-only file gives you — so both climb the whole ladder. ENOTEMPTY means a
 * child survived, which is the same problem one level down.
 */
export function classifyError(err: unknown): { code: string; message: string; kind: FailureKind } {
  const code = typeof err === "object" && err !== null && "code" in err ? String((err as { code: unknown }).code) : ""
  const message = err instanceof Error ? err.message : String(err)
  if (code === "ENOENT") return { code, message, kind: "missing" }
  if (code === "EBUSY" || code === "ETXTBSY") return { code, message, kind: "locked" }
  if (code === "ENOTEMPTY") return { code, message, kind: "not-empty" }
  if (code === "EPERM" || code === "EACCES") return { code, message, kind: "denied" }
  return { code: code || "UNKNOWN", message, kind: "other" }
}

/** Worth escalating for. `other` is not: a bad path or a broken disk does not get better by waiting. */
export function isLockLike(kind: FailureKind): boolean {
  return kind === "locked" || kind === "denied" || kind === "not-empty"
}

export function normalizeForCompare(p: string, caseInsensitive = process.platform === "win32"): string {
  const normalized = p.replace(/\\/g, "/").replace(/\/+$/, "")
  return caseInsensitive ? normalized.toLowerCase() : normalized
}

export function isInside(child: string, parent: string, caseInsensitive?: boolean): boolean {
  const a = normalizeForCompare(child, caseInsensitive)
  const b = normalizeForCompare(parent, caseInsensitive)
  return a === b || a.startsWith(b + "/")
}

/**
 * MoveFileEx removes a directory at restart ONLY if it is empty by then, and the queued operations
 * run in the order they were registered. So every file goes first and the directories follow
 * deepest-first; anything else schedules a directory that will still have children at boot and
 * silently does nothing.
 */
export function orderForRebootSchedule(failures: readonly Failure[]): string[] {
  const depth = (p: string) => normalizeForCompare(p, false).split("/").length
  const files = failures.filter((item) => !item.directory).map((item) => item.path)
  const directories = failures
    .filter((item) => item.directory)
    .map((item) => item.path)
    .sort((a, b) => depth(b) - depth(a) || b.localeCompare(a))
  return [...files, ...directories]
}

/**
 * Decides which holders are Tiancode. The pid set is our own process and its ancestors, so the
 * Electron main process that spawned this sidecar is in it. The path set is ONLY our own
 * executable — matching on every ancestor's image was tried and it lies: a stray powershell.exe
 * gets flagged as "us" the moment anything in our chain is also powershell.exe, which would tell
 * the user to close Tiancode over someone else's process. Siblings that are genuinely part of the
 * running app (Electron renderers holding app.asar) show up through `insideTarget` instead, which
 * is the case that actually matters: deleting the build the app is running from.
 */
export function markHolders(
  raw: readonly RawHolder[],
  self: SelfInfo,
  target: string,
  caseInsensitive?: boolean,
): Holder[] {
  const pids = new Set(self.pids)
  const paths = new Set(self.paths.filter(Boolean).map((item) => normalizeForCompare(item, caseInsensitive)))
  return raw.map((item) => {
    const exe = item.path?.trim() ? item.path.trim() : undefined
    const normalized = exe ? normalizeForCompare(exe, caseInsensitive) : undefined
    const name = item.name?.trim() || (normalized ? normalized.slice(normalized.lastIndexOf("/") + 1) : "")
    return {
      pid: item.pid,
      name: name || `pid ${item.pid}`,
      service: item.service?.trim() || undefined,
      appType: item.type,
      path: exe,
      self: pids.has(item.pid) || (normalized !== undefined && paths.has(normalized)),
      insideTarget: exe !== undefined && isInside(exe, target, caseInsensitive),
    }
  })
}

// ---------------------------------------------------------------------------------------------
// Filesystem
// ---------------------------------------------------------------------------------------------

/**
 * Recursive remove that does NOT stop at the first failure the way `fs.rm` does. One locked file
 * in a build folder should not leave the other nine thousand on disk — and the survivors are
 * exactly the list we need for the rungs above.
 */
export async function removeTree(target: string): Promise<RemoveResult> {
  const result: RemoveResult = { removed: 0, failures: [] }
  await removeEntry(target, result)
  return result
}

async function removeEntry(target: string, out: RemoveResult): Promise<void> {
  let directory = false
  try {
    // lstat, not stat: a symlinked directory is unlinked, never descended into.
    directory = (await lstat(target)).isDirectory()
  } catch (err) {
    const failure = classifyError(err)
    if (failure.kind !== "missing") out.failures.push({ path: target, directory: false, ...failure })
    return
  }

  if (directory) {
    // A directory we cannot read is a directory we cannot empty; the rmdir below reports it once.
    const entries = await readdir(target).catch(() => [] as string[])
    for (const entry of entries) await removeEntry(path.join(target, entry), out)
    try {
      await rmdir(target)
      out.removed++
    } catch (err) {
      const failure = classifyError(err)
      if (failure.kind !== "missing") out.failures.push({ path: target, directory: true, ...failure })
    }
    return
  }

  try {
    await unlink(target)
    out.removed++
  } catch (err) {
    const failure = classifyError(err)
    if (failure.kind !== "missing") out.failures.push({ path: target, directory: false, ...failure })
  }
}

/**
 * Windows has no permission bits; Node maps the write bit of `chmod` onto the read-only attribute,
 * which is a real reason a delete fails and one we can fix ourselves. Directories keep their
 * traverse bit so this stays harmless on POSIX.
 */
export async function clearReadOnly(failures: readonly Failure[]): Promise<number> {
  let cleared = 0
  for (const failure of failures) {
    try {
      await chmod(failure.path, failure.directory ? 0o777 : 0o666)
      cleared++
    } catch {
      // Nothing to do: the retry below reports whether it mattered.
    }
  }
  return cleared
}

// ---------------------------------------------------------------------------------------------
// Windows: who is holding it, and can we queue the delete for the next boot
// ---------------------------------------------------------------------------------------------

// An absolute path, not a bare name: libuv's Windows search starts at the current directory, so a
// planted powershell.exe next to the app would win (same reasoning as desktop/main/window-match.ts).
const POWERSHELL = path.join(
  process.env["SystemRoot"] ?? "C:\\Windows",
  "System32",
  "WindowsPowerShell",
  "v1.0",
  "powershell.exe",
)

/** Add-Type shells out to the C# compiler the first time; that is seconds, not milliseconds. */
const SCRIPT_TIMEOUT_MS = 30_000

const ERROR_MORE_DATA = 234
const ERROR_ACCESS_DENIED = 5

// The Restart Manager is the documented way to answer "which program has this file open" without
// admin rights and without shipping handle.exe: it is what installers and the Explorer "file in
// use" dialog call. MoveFileExW rides along in the same type so the reboot queue needs no second
// compile.
//
// Two limits found by measuring, not by reading:
//   - RmRegisterResources takes FILES only. A directory makes RmGetList return ERROR_ACCESS_DENIED
//     (documented), so the caller filters directories out.
//   - RmRegisterResources fails with ERROR_WRITE_FAULT (29) for any path of 260 characters or more,
//     and prepending \\?\ does NOT lift it — which matters, because build trees are exactly where
//     paths get that long. The 8.3 short name does work, so `Probeable` falls back to it and the
//     caller reports the paths it still could not ask about instead of pretending nobody holds them.
const CSHARP_SOURCE = `
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;

public static class TcForceDelete {
  [StructLayout(LayoutKind.Sequential)]
  public struct RM_UNIQUE_PROCESS { public int dwProcessId; public System.Runtime.InteropServices.ComTypes.FILETIME ProcessStartTime; }

  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
  public struct RM_PROCESS_INFO {
    public RM_UNIQUE_PROCESS Process;
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 256)] public string strAppName;
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 64)] public string strServiceShortName;
    public int ApplicationType;
    public uint AppStatus;
    public uint TSSessionId;
    [MarshalAs(UnmanagedType.Bool)] public bool bRestartable;
  }

  [DllImport("rstrtmgr.dll", CharSet = CharSet.Unicode)]
  static extern int RmStartSession(out uint pSessionHandle, int dwSessionFlags, StringBuilder strSessionKey);
  [DllImport("rstrtmgr.dll")]
  static extern int RmEndSession(uint pSessionHandle);
  [DllImport("rstrtmgr.dll", CharSet = CharSet.Unicode)]
  static extern int RmRegisterResources(uint pSessionHandle, uint nFiles, string[] rgsFilenames, uint nApplications, RM_UNIQUE_PROCESS[] rgApplications, uint nServices, string[] rgsServiceNames);
  [DllImport("rstrtmgr.dll")]
  static extern int RmGetList(uint dwSessionHandle, out uint pnProcInfoNeeded, ref uint pnProcInfo, [In, Out] RM_PROCESS_INFO[] rgAffectedApps, ref uint lpdwRebootReasons);
  [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
  static extern bool MoveFileExW(string lpExistingFileName, string lpNewFileName, uint dwFlags);
  [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
  static extern int GetShortPathNameW(string lpszLongPath, StringBuilder lpszShortPath, int cchBuffer);

  static readonly string SEP = ((char)31).ToString();
  static readonly string BS = ((char)92).ToString();

  public static string Probeable(string path) {
    if (path.Length < 260) return path;
    StringBuilder buffer = new StringBuilder(1024);
    int n = GetShortPathNameW(path, buffer, 1024);
    if (n > 0 && n < 260) return buffer.ToString();
    return null;
  }

  static string Extended(string path) {
    if (path.Length < 260) return path;
    if (path.StartsWith(BS + BS)) return path;
    if (path.Length > 2 && path[1] == ':') return BS + BS + "?" + BS + path;
    return path;
  }

  public static string[] Holders(string[] files) {
    if (files.Length == 0) return new string[0];
    uint handle;
    int rc = RmStartSession(out handle, 0, new StringBuilder(64));
    if (rc != 0) throw new Exception("RmStartSession=" + rc);
    try {
      rc = RmRegisterResources(handle, (uint)files.Length, files, 0, null, 0, null);
      if (rc != 0) throw new Exception("RmRegisterResources=" + rc);
      uint need = 0; uint have = 0; uint reasons = 0;
      rc = RmGetList(handle, out need, ref have, null, ref reasons);
      if (rc == 0) return new string[0];
      if (rc != ${ERROR_MORE_DATA}) throw new Exception("RmGetList=" + rc);
      RM_PROCESS_INFO[] infos = new RM_PROCESS_INFO[need];
      have = need;
      rc = RmGetList(handle, out need, ref have, infos, ref reasons);
      if (rc != 0) throw new Exception("RmGetList=" + rc);
      List<string> rows = new List<string>();
      for (int i = 0; i < have; i++) {
        rows.Add(infos[i].Process.dwProcessId + SEP + infos[i].ApplicationType + SEP + infos[i].strAppName + SEP + infos[i].strServiceShortName);
      }
      return rows.ToArray();
    } finally { RmEndSession(handle); }
  }

  public static int ScheduleDelete(string path) {
    if (MoveFileExW(Extended(path), null, 4)) return 0;
    int err = Marshal.GetLastWin32Error();
    return err == 0 ? -1 : err;
  }
}
`

const PREAMBLE = `$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Console]::OutputEncoding = [Text.Encoding]::UTF8`

// No backslash ever appears literally in the C# above: it would have to survive this template
// literal AND the C# lexer, and the two escapings do not agree. Hence BS and SEP as char codes.

/**
 * The script travels in -EncodedCommand (UTF-16LE, base64) so nothing has to survive command-line
 * quoting and no .ps1 is left on disk for someone to swap. Indentation and comments go first:
 * every script character costs ~2.7 encoded ones against Windows' 32 767-character limit.
 */
function encodeScript(script: string): string {
  const compact = script
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .join("\n")
  return Buffer.from(compact, "utf16le").toString("base64")
}

async function runScript(script: string, signal?: AbortSignal): Promise<{ code: number; text: string; err: string }> {
  const abort = AbortSignal.any([...(signal ? [signal] : []), AbortSignal.timeout(SCRIPT_TIMEOUT_MS)])
  const out = await Process.run(
    [
      POWERSHELL,
      "-NoProfile",
      "-NonInteractive",
      "-ExecutionPolicy",
      "Bypass",
      "-EncodedCommand",
      encodeScript(script),
    ],
    { nothrow: true, abort },
  )
  return { code: out.code, text: out.stdout.toString().trim(), err: out.stderr.toString().trim() }
}

/**
 * The path list goes through a temp file, never through the script text: it can run to thousands
 * of entries, and the paths are the one part of this that the model chose.
 */
async function withPathList<T>(paths: readonly string[], fn: (listPath: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "tiancode-delete-"))
  const listPath = path.join(dir, "paths.txt")
  await writeFile(listPath, paths.join("\n"), "utf8")
  try {
    return await fn(listPath)
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined)
  }
}

function quote(value: string): string {
  return value.replace(/'/g, "''")
}

function parseJson(text: string): Record<string, unknown> | undefined {
  try {
    const parsed = JSON.parse(text)
    return typeof parsed === "object" && parsed !== null ? (parsed as Record<string, unknown>) : undefined
  } catch {
    return undefined
  }
}

const EMPTY_SELF: SelfInfo = { pids: [], paths: [] }

/** Who is holding these files open, and which of those processes are us. Windows only. */
export async function probeHolders(files: readonly string[], signal?: AbortSignal): Promise<ProbeResult> {
  if (process.platform !== "win32") return { outcome: "unsupported", holders: [], self: EMPTY_SELF }
  if (files.length === 0) return { outcome: "skipped", holders: [], self: EMPTY_SELF }

  return withPathList(files, async (listPath) => {
    const script = `${PREAMBLE}
try {
Add-Type -TypeDefinition @'
${CSHARP_SOURCE}
'@
$files = @(Get-Content -LiteralPath '${quote(listPath)}' -Encoding UTF8 | Where-Object { $_.Length -gt 0 })
$probeable = @()
$skipped = 0
foreach ($file in $files) {
$usable = [TcForceDelete]::Probeable([string]$file)
if ($usable) { $probeable += $usable } else { $skipped++ }
}
$elevated = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
$parent = @{}
$image = @{}
Get-CimInstance -ClassName Win32_Process -Property ProcessId,ParentProcessId,ExecutablePath -ErrorAction SilentlyContinue | ForEach-Object {
$id = [int]$_.ProcessId
$parent[$id] = [int]$_.ParentProcessId
if ($_.ExecutablePath) { $image[$id] = [string]$_.ExecutablePath }
}
$selfPids = New-Object System.Collections.Generic.List[int]
$cursor = ${process.pid}
while ($cursor -gt 0 -and -not $selfPids.Contains($cursor)) {
$selfPids.Add($cursor)
if (-not $parent.ContainsKey($cursor)) { break }
$cursor = $parent[$cursor]
}
$rows = @()
foreach ($row in @([TcForceDelete]::Holders($probeable))) {
$parts = $row -split ([char]31)
$holderPid = [int]$parts[0]
$rows += @{ pid = $holderPid; type = [int]$parts[1]; name = [string]$parts[2]; service = [string]$parts[3]; path = $(if ($image.ContainsKey($holderPid)) { [string]$image[$holderPid] } else { '' }) }
}
$result = @{ ok = $true; elevated = [bool]$elevated; skipped = [int]$skipped; self = @{ pids = @($selfPids) }; holders = @($rows) }
ConvertTo-Json -InputObject $result -Compress -Depth 6
} catch {
ConvertTo-Json -InputObject @{ ok = $false; error = [string]$_.Exception.Message } -Compress -Depth 4
}`

    const out = await runScript(script, signal)
    const parsed = parseJson(out.text)
    if (!parsed) {
      return {
        outcome: "failed" as const,
        holders: [],
        self: EMPTY_SELF,
        error: out.err || out.text || `powershell exited with ${out.code}`,
      }
    }
    if (parsed["ok"] !== true) {
      return { outcome: "failed" as const, holders: [], self: EMPTY_SELF, error: String(parsed["error"] ?? "") }
    }
    const self = (parsed["self"] ?? {}) as { pids?: unknown }
    return {
      outcome: "ok" as const,
      holders: Array.isArray(parsed["holders"]) ? (parsed["holders"] as RawHolder[]) : [],
      self: {
        pids: Array.isArray(self.pids) ? (self.pids as number[]) : [],
        // Our own binary, and nothing else: see markHolders.
        paths: [process.execPath],
      },
      elevated: parsed["elevated"] === true,
      skipped: typeof parsed["skipped"] === "number" ? parsed["skipped"] : 0,
    }
  })
}

/**
 * MOVEFILE_DELAY_UNTIL_REBOOT writes to HKLM\SYSTEM\CurrentControlSet\Control\Session Manager\
 * PendingFileRenameOperations, and the docs are explicit: "This value can be used only if the
 * process is in the context of a user who belongs to the administrators group or the LocalSystem
 * account." Under UAC a non-elevated admin has that group filtered out of the token, so this
 * really does mean elevated. We attempt it anyway and report ERROR_ACCESS_DENIED as what it is,
 * rather than failing silently.
 */
export async function scheduleAtReboot(paths: readonly string[], signal?: AbortSignal): Promise<ScheduleResult> {
  if (process.platform !== "win32") {
    return { scheduled: [], failed: [], adminRequired: false, error: "unsupported" }
  }
  if (paths.length === 0) return { scheduled: [], failed: [], adminRequired: false }

  return withPathList(paths, async (listPath) => {
    const script = `${PREAMBLE}
try {
Add-Type -TypeDefinition @'
${CSHARP_SOURCE}
'@
$paths = @(Get-Content -LiteralPath '${quote(listPath)}' -Encoding UTF8 | Where-Object { $_.Length -gt 0 })
$elevated = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
$results = @()
foreach ($item in $paths) {
$results += @{ path = [string]$item; code = [int][TcForceDelete]::ScheduleDelete([string]$item) }
}
$result = @{ ok = $true; elevated = [bool]$elevated; results = @($results) }
ConvertTo-Json -InputObject $result -Compress -Depth 6
} catch {
ConvertTo-Json -InputObject @{ ok = $false; error = [string]$_.Exception.Message } -Compress -Depth 4
}`

    const out = await runScript(script, signal)
    const parsed = parseJson(out.text)
    if (!parsed || parsed["ok"] !== true) {
      return {
        scheduled: [],
        failed: [],
        adminRequired: false,
        error: String(parsed?.["error"] ?? out.err ?? out.text ?? `powershell exited with ${out.code}`),
      }
    }
    const rows = Array.isArray(parsed["results"]) ? (parsed["results"] as { path: string; code: number }[]) : []
    const scheduled = rows.filter((row) => row.code === 0).map((row) => row.path)
    const failed = rows.filter((row) => row.code !== 0)
    return {
      scheduled,
      failed,
      elevated: parsed["elevated"] === true,
      adminRequired: failed.some((row) => row.code === ERROR_ACCESS_DENIED),
    }
  })
}

/**
 * Kills exactly the pid the user was shown — no `/T`. The permission dialog names one process, so
 * this may not take its children with it.
 */
export async function terminateProcess(pid: number, signal?: AbortSignal): Promise<{ ok: boolean; error?: string }> {
  const cmd = process.platform === "win32" ? ["taskkill", "/PID", String(pid), "/F"] : ["kill", "-9", String(pid)]
  const out = await Process.run(cmd, {
    nothrow: true,
    abort: AbortSignal.any([...(signal ? [signal] : []), AbortSignal.timeout(SCRIPT_TIMEOUT_MS)]),
  })
  if (out.code === 0) return { ok: true }
  return { ok: false, error: out.stderr.toString().trim() || `exit ${out.code}` }
}

// ---------------------------------------------------------------------------------------------
// The ladder
// ---------------------------------------------------------------------------------------------

/** Short, because a lock that has not cleared in a second will not clear in ten. */
export const RETRY_DELAYS = [120, 300, 700] as const

export interface Deps {
  remove: (target: string) => Promise<RemoveResult>
  clearReadOnly: (failures: readonly Failure[]) => Promise<number>
  probe: (files: readonly string[], signal?: AbortSignal) => Promise<ProbeResult>
  schedule: (paths: readonly string[], signal?: AbortSignal) => Promise<ScheduleResult>
  wait: (ms: number) => Promise<void>
  platform: NodeJS.Platform
}

export function defaultDeps(): Deps {
  return {
    remove: removeTree,
    clearReadOnly,
    probe: probeHolders,
    schedule: scheduleAtReboot,
    wait: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    platform: process.platform,
  }
}

export interface Options {
  target: string
  /** Rung 4. Off unless the caller asked for it: it changes what happens at the user's next boot. */
  scheduleOnReboot?: boolean
  /**
   * Rung 5. Asks the user and kills on a yes; returns false on a no. Supplied by the caller
   * because killing a process to delete a file is a separate decision, not a consequence of this one.
   */
  terminateHolder?: (holder: Holder) => Promise<boolean>
  signal?: AbortSignal
}

export async function forceDelete(options: Options, deps: Deps = defaultDeps()): Promise<Report> {
  const attempts: Attempt[] = []
  const terminated: Holder[] = []
  let removed = 0
  let holders: Holder[] = []
  let probe: ProbeResult = { outcome: "skipped", holders: [], self: EMPTY_SELF }
  let schedule: ScheduleResult = { scheduled: [], failed: [], adminRequired: false }

  // Rung 1.
  let current = await deps.remove(options.target)
  removed += current.removed

  const build = (): Report => ({
    target: options.target,
    platform: deps.platform,
    removed,
    failures: current.failures,
    holders,
    probe: probe.outcome,
    probeError: probe.error,
    probeSkipped: probe.skipped ?? 0,
    elevated: probe.elevated ?? schedule.elevated,
    scheduled: schedule.scheduled,
    scheduleFailed: schedule.failed,
    scheduleAdminRequired: schedule.adminRequired,
    scheduleError: schedule.error,
    terminated,
    attempts,
    ok: current.failures.length === 0,
  })

  attempts.push({ step: "remove", ok: current.failures.length === 0 })
  if (current.failures.length === 0) return build()

  const escalates = () => current.failures.some((item) => isLockLike(item.kind))
  if (!escalates()) return build()

  // Rung 2: the transient ones — an antivirus pass, a handle closed half a second ago.
  for (const delay of RETRY_DELAYS) {
    if (options.signal?.aborted) break
    await deps.wait(delay)
    const retry = await deps.remove(options.target)
    removed += retry.removed
    current = retry
    if (current.failures.length === 0) break
  }
  attempts.push({ step: "retry", ok: current.failures.length === 0 })
  if (current.failures.length === 0) return build()

  // Rung 2b: the read-only attribute is a lock we own and can drop.
  const cleared = await deps.clearReadOnly(current.failures)
  if (cleared > 0) {
    const retry = await deps.remove(options.target)
    removed += retry.removed
    current = retry
  }
  attempts.push({ step: "readonly", ok: current.failures.length === 0, note: String(cleared) })
  if (current.failures.length === 0) return build()

  // Rung 3: name the holder. The Restart Manager takes files, not directories.
  const files = current.failures.filter((item) => !item.directory).map((item) => item.path)
  probe = await deps.probe(files, options.signal)
  holders = markHolders(probe.holders, probe.self, options.target)
  attempts.push({ step: "identify", ok: holders.length > 0, note: probe.outcome })

  // Rung 4: hand the leftovers to the boot-time queue.
  if (options.scheduleOnReboot) {
    schedule = await deps.schedule(orderForRebootSchedule(current.failures), options.signal)
    attempts.push({
      step: "schedule",
      ok: schedule.scheduled.length > 0 && schedule.failed.length === 0,
      note: schedule.adminRequired ? "admin-required" : schedule.error,
    })
  }

  // Rung 5: last, and only for holders that are not us — no kill frees a file from a process that
  // is still running our own code.
  const killable = holders.filter((item) => !item.self)
  if (options.terminateHolder && killable.length > 0 && schedule.scheduled.length === 0) {
    let any = false
    for (const holder of killable) {
      if (options.signal?.aborted) break
      const done = await options.terminateHolder(holder)
      if (!done) continue
      terminated.push(holder)
      any = true
    }
    if (any) {
      const retry = await deps.remove(options.target)
      removed += retry.removed
      current = retry
    }
    attempts.push({ step: "terminate", ok: current.failures.length === 0, note: String(terminated.length) })
  }

  return build()
}

export * as ForceDelete from "./force-delete"
