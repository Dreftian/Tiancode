import { execFile } from "node:child_process"
import pty from "@lydell/node-pty"
import type { Opts, Proc } from "./pty"

export type { Disp, Exit, Opts, Proc } from "./pty"

function terminateWindowsProcessTree(pid: number) {
  if (process.platform !== "win32" || !pid) return
  const taskkill = `${process.env.SystemRoot || "C:\\Windows"}\\System32\\taskkill.exe`
  execFile(taskkill, ["/PID", String(pid), "/T", "/F"], () => {})
}

export function spawn(file: string, args: string[], opts: Opts): Proc {
  const proc = pty.spawn(file, args, {
    ...opts,
    ...(process.platform === "win32" ? { useConptyDll: true } : {}),
  })
  return {
    pid: proc.pid,
    onData(listener) {
      return proc.onData(listener)
    },
    onExit(listener) {
      return proc.onExit(listener)
    },
    write(data) {
      proc.write(data)
    },
    resize(cols, rows) {
      proc.resize(cols, rows)
    },
    kill(signal) {
      if (process.platform === "win32" && proc.pid) {
        terminateWindowsProcessTree(proc.pid)
      }
      proc.kill(signal)
    },
  }
}
