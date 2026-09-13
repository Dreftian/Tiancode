import { describe, expect, test } from "bun:test"
import fs from "node:fs/promises"
import path from "node:path"
import { ForceDelete } from "../../src/util/force-delete"
import { renderReport } from "../../src/tool/delete"
import { tmpdir } from "../fixture/fixture"

const TARGET = "C:/Users/dev/app/dist"
const ASAR = "C:/Users/dev/app/dist/win-unpacked/resources/app.asar"

function failure(p: string, over: Partial<ForceDelete.Failure> = {}): ForceDelete.Failure {
  return {
    path: p,
    directory: false,
    code: "EBUSY",
    message: `EBUSY: resource busy, unlink '${p}'`,
    kind: "locked",
    ...over,
  }
}

function fakeDeps(overrides: Partial<ForceDelete.Deps> = {}): ForceDelete.Deps {
  return {
    remove: async () => ({ removed: 0, failures: [] }),
    clearReadOnly: async () => 0,
    probe: async () => ({ outcome: "skipped", holders: [], self: { pids: [], paths: [] } }),
    schedule: async () => ({ scheduled: [], failed: [], adminRequired: false }),
    wait: async () => undefined,
    platform: "win32",
    ...overrides,
  }
}

function report(over: Partial<ForceDelete.Report> = {}): ForceDelete.Report {
  return {
    target: TARGET,
    platform: "win32",
    removed: 0,
    failures: [],
    holders: [],
    probe: "skipped",
    probeSkipped: 0,
    scheduled: [],
    scheduleFailed: [],
    scheduleAdminRequired: false,
    terminated: [],
    attempts: [],
    ok: true,
    ...over,
  }
}

describe("classifyError", () => {
  // Node surfaces a Windows sharing violation as EBUSY on some calls and EPERM on others, and
  // EPERM is also what a read-only file gives you: both have to keep climbing.
  test("maps the codes that mean 'something is holding it'", () => {
    expect(ForceDelete.classifyError({ code: "EBUSY" }).kind).toBe("locked")
    expect(ForceDelete.classifyError({ code: "EPERM" }).kind).toBe("denied")
    expect(ForceDelete.classifyError({ code: "EACCES" }).kind).toBe("denied")
    expect(ForceDelete.classifyError({ code: "ENOTEMPTY" }).kind).toBe("not-empty")
    expect(ForceDelete.classifyError({ code: "ENOENT" }).kind).toBe("missing")
    expect(ForceDelete.classifyError(new Error("boom")).kind).toBe("other")
  })

  test("only lock-like failures are worth escalating", () => {
    expect(ForceDelete.isLockLike("locked")).toBe(true)
    expect(ForceDelete.isLockLike("denied")).toBe(true)
    expect(ForceDelete.isLockLike("not-empty")).toBe(true)
    expect(ForceDelete.isLockLike("missing")).toBe(false)
    expect(ForceDelete.isLockLike("other")).toBe(false)
  })
})

describe("orderForRebootSchedule", () => {
  // MoveFileEx removes a directory at restart only if it is empty by then, and the queued
  // operations run in registration order. Files first, directories deepest-first, or the boot-time
  // pass silently skips every directory that still has children.
  test("files first, then directories deepest first", () => {
    const ordered = ForceDelete.orderForRebootSchedule([
      failure("C:/a/b", { directory: true, kind: "not-empty", code: "ENOTEMPTY" }),
      failure("C:/a/b/c/file.txt"),
      failure("C:/a/b/c", { directory: true, kind: "not-empty", code: "ENOTEMPTY" }),
    ])
    expect(ordered).toEqual(["C:/a/b/c/file.txt", "C:/a/b/c", "C:/a/b"])
  })
})

describe("isInside", () => {
  test("a sibling with a shared prefix is not inside", () => {
    expect(ForceDelete.isInside("C:/build2/app.exe", "C:/build", true)).toBe(false)
    expect(ForceDelete.isInside("C:/build/app.exe", "C:/build", true)).toBe(true)
    expect(ForceDelete.isInside("C:/BUILD/app.exe", "C:/build", true)).toBe(true)
    expect(ForceDelete.isInside("/build/app", "/BUILD", false)).toBe(false)
  })

  test("backslashes and trailing separators compare equal", () => {
    expect(ForceDelete.isInside("C:\\build\\app.exe", "C:/build/", true)).toBe(true)
  })
})

describe("markHolders", () => {
  const self = { pids: [4000, 4100], paths: ["C:/Program Files/Tiancode/tiancode-sidecar.exe"] }

  test("an ancestor pid is us", () => {
    const holders = ForceDelete.markHolders([{ pid: 4100, name: "Tiancode" }], self, TARGET, true)
    expect(holders[0].self).toBe(true)
  })

  test("another instance of our own binary is us", () => {
    const holders = ForceDelete.markHolders(
      [{ pid: 9999, name: "Tiancode", path: "C:\\Program Files\\Tiancode\\tiancode-sidecar.exe" }],
      self,
      TARGET,
      true,
    )
    expect(holders[0].self).toBe(true)
  })

  // Measured against a real lock: matching every ancestor's image made a stray powershell.exe come
  // back as "us", because the chain that launched the sidecar also contained powershell.exe. That
  // would have told the user to close Tiancode over somebody else's process.
  test("a process that merely shares a host binary with our chain is not us", () => {
    const holders = ForceDelete.markHolders(
      [{ pid: 9192, name: "Windows PowerShell", path: "C:/Windows/System32/WindowsPowerShell/v1.0/powershell.exe" }],
      self,
      TARGET,
      true,
    )
    expect(holders[0].self).toBe(false)
  })

  test("an unrelated process is not us, and gets flagged when it runs from inside the target", () => {
    const holders = ForceDelete.markHolders(
      [
        { pid: 500, name: "notepad", path: "C:/Windows/notepad.exe" },
        { pid: 600, name: "", path: "C:/Users/dev/app/dist/win-unpacked/Tiancode.exe" },
      ],
      self,
      TARGET,
      true,
    )
    expect(holders[0].self).toBe(false)
    expect(holders[0].insideTarget).toBe(false)
    expect(holders[1].self).toBe(false)
    expect(holders[1].insideTarget).toBe(true)
    expect(holders[1].name).toBe("tiancode.exe")
  })
})

describe("renderReport, a holder running from inside the target", () => {
  test("says the process has to be closed, without calling it Tiancode", () => {
    const text = renderReport(
      report({
        ok: false,
        failures: [failure(ASAR)],
        probe: "ok",
        holders: [
          {
            pid: 1200,
            name: "Tiancode",
            path: "C:/Users/dev/app/dist/win-unpacked/Tiancode.exe",
            self: false,
            insideTarget: true,
          },
        ],
        attempts: [{ step: "identify", ok: true, note: "ok" }],
      }),
    )
    expect(text).toContain("Se está ejecutando desde dentro de lo que se quiere borrar")
    expect(text).toContain("hay que cerrarlo")
    expect(text).not.toContain("ES TIANCODE MISMO")
  })
})

describe("removeTree", () => {
  test("removes a nested tree and reports what it removed", async () => {
    await using tmp = await tmpdir()
    const root = path.join(tmp.path, "dist")
    await fs.mkdir(path.join(root, "a", "b"), { recursive: true })
    await fs.writeFile(path.join(root, "a", "one.txt"), "1")
    await fs.writeFile(path.join(root, "a", "b", "two.txt"), "2")

    const result = await ForceDelete.removeTree(root)

    expect(result.failures).toEqual([])
    expect(result.removed).toBe(5)
    expect(await fs.stat(root).catch(() => undefined)).toBeUndefined()
  })

  test("a missing target is not a failure", async () => {
    await using tmp = await tmpdir()
    const result = await ForceDelete.removeTree(path.join(tmp.path, "nope"))
    expect(result).toEqual({ removed: 0, failures: [] })
  })
})

describe("forceDelete", () => {
  test("the plain remove is the only rung when nothing is locked", async () => {
    const result = await ForceDelete.forceDelete(
      { target: TARGET },
      fakeDeps({ remove: async () => ({ removed: 3, failures: [] }) }),
    )
    expect(result.ok).toBe(true)
    expect(result.removed).toBe(3)
    expect(result.attempts.map((item) => item.step)).toEqual(["remove"])
  })

  test("a transient lock clears on the retries", async () => {
    let calls = 0
    const result = await ForceDelete.forceDelete(
      { target: TARGET },
      fakeDeps({
        remove: async () => {
          calls++
          return calls >= 3 ? { removed: 1, failures: [] } : { removed: 0, failures: [failure(ASAR)] }
        },
      }),
    )
    expect(result.ok).toBe(true)
    expect(result.attempts.map((item) => item.step)).toEqual(["remove", "retry"])
  })

  test("a failure that is not lock-like stops the ladder instead of retrying it", async () => {
    let calls = 0
    const result = await ForceDelete.forceDelete(
      { target: TARGET },
      fakeDeps({
        remove: async () => {
          calls++
          return { removed: 0, failures: [failure(ASAR, { code: "EIO", kind: "other" })] }
        },
      }),
    )
    expect(calls).toBe(1)
    expect(result.attempts.map((item) => item.step)).toEqual(["remove"])
  })

  // The user's own case: deleting a build of the app from inside the running app. No kill can help
  // and the tool must not pretend otherwise.
  test("never offers to terminate itself", async () => {
    let offered = 0
    const result = await ForceDelete.forceDelete(
      {
        target: TARGET,
        terminateHolder: async () => {
          offered++
          return true
        },
      },
      fakeDeps({
        remove: async () => ({ removed: 812, failures: [failure(ASAR)] }),
        probe: async () => ({
          outcome: "ok",
          holders: [{ pid: 4100, name: "Tiancode", path: "C:/Program Files/Tiancode/Tiancode.exe" }],
          self: { pids: [4100], paths: [] },
        }),
      }),
    )
    expect(offered).toBe(0)
    expect(result.ok).toBe(false)
    expect(result.holders[0].self).toBe(true)
    expect(result.attempts.map((item) => item.step)).toEqual(["remove", "retry", "readonly", "identify"])
  })

  test("reports that the reboot queue needs administrator instead of failing quietly", async () => {
    const result = await ForceDelete.forceDelete(
      { target: TARGET, scheduleOnReboot: true },
      fakeDeps({
        remove: async () => ({ removed: 0, failures: [failure(ASAR)] }),
        schedule: async () => ({
          scheduled: [],
          failed: [{ path: ASAR, code: 5 }],
          adminRequired: true,
          elevated: false,
        }),
      }),
    )
    expect(result.scheduleAdminRequired).toBe(true)
    expect(result.attempts.at(-1)).toEqual({ step: "schedule", ok: false, note: "admin-required" })
  })

  test("terminating an unrelated holder frees the file", async () => {
    let killed = false
    const asked: number[] = []
    const result = await ForceDelete.forceDelete(
      {
        target: TARGET,
        terminateHolder: async (holder) => {
          asked.push(holder.pid)
          killed = true
          return true
        },
      },
      fakeDeps({
        remove: async () => (killed ? { removed: 1, failures: [] } : { removed: 0, failures: [failure(ASAR)] }),
        probe: async () => ({
          outcome: "ok",
          holders: [{ pid: 777, name: "Explorer", path: "C:/Windows/explorer.exe" }],
          self: { pids: [4100], paths: ["C:/Program Files/Tiancode/Tiancode.exe"] },
        }),
      }),
    )
    expect(asked).toEqual([777])
    expect(result.ok).toBe(true)
    expect(result.terminated.map((item) => item.pid)).toEqual([777])
  })

  // "Stop at the first rung that works": a scheduled delete already resolves it, and rebooting is
  // cheaper for the user than losing whatever that process was doing.
  test("does not kill anything once the reboot queue accepted the job", async () => {
    let offered = 0
    await ForceDelete.forceDelete(
      {
        target: TARGET,
        scheduleOnReboot: true,
        terminateHolder: async () => {
          offered++
          return true
        },
      },
      fakeDeps({
        remove: async () => ({ removed: 0, failures: [failure(ASAR)] }),
        probe: async () => ({
          outcome: "ok",
          holders: [{ pid: 777, name: "Explorer", path: "C:/Windows/explorer.exe" }],
          self: { pids: [], paths: [] },
        }),
        schedule: async () => ({ scheduled: [ASAR], failed: [], adminRequired: false, elevated: true }),
      }),
    )
    expect(offered).toBe(0)
  })
})

describe("renderReport", () => {
  test("names the holder and its pid", () => {
    const text = renderReport(
      report({
        ok: false,
        removed: 812,
        failures: [failure(ASAR)],
        holders: [{ pid: 777, name: "Explorer", path: "C:/Windows/explorer.exe", self: false, insideTarget: false }],
        probe: "ok",
        attempts: [
          { step: "remove", ok: false },
          { step: "identify", ok: true, note: "ok" },
        ],
      }),
    )
    expect(text).toContain("Explorer (PID 777)")
    expect(text).toContain("Cerrar Explorer (PID 777)")
    expect(text).not.toContain("undefined")
  })

  test("says outright when the holder is Tiancode itself", () => {
    const text = renderReport(
      report({
        ok: false,
        failures: [failure(ASAR)],
        holders: [{ pid: 4100, name: "Tiancode", self: true, insideTarget: true }],
        probe: "ok",
        attempts: [{ step: "remove", ok: false }],
      }),
    )
    expect(text).toContain("ES TIANCODE MISMO")
    expect(text).toContain("Cerrar Tiancode y borrar desde fuera")
  })

  // MoveFileEx really does return ERROR_ACCESS_DENIED here without elevation — measured on this
  // machine, and the docs say so too. The tool has to say it rather than fail quietly.
  test("explains the administrator requirement of the reboot queue", () => {
    const text = renderReport(
      report({
        ok: false,
        failures: [failure(ASAR)],
        elevated: false,
        scheduleAdminRequired: true,
        scheduleFailed: [{ path: ASAR, code: 5 }],
        attempts: [{ step: "schedule", ok: false, note: "admin-required" }],
      }),
    )
    expect(text).toContain("PendingFileRenameOperations")
    expect(text).toContain("Ejecutar como administrador")
  })

  // The claim has to follow the measurement, not the other way round: if we ARE elevated and it
  // still failed, telling the user to run as administrator is a lie.
  test("does not tell an already-elevated user to run as administrator", () => {
    const text = renderReport(
      report({
        ok: false,
        failures: [failure(ASAR)],
        elevated: true,
        scheduleAdminRequired: true,
        attempts: [{ step: "schedule", ok: false, note: "admin-required" }],
      }),
    )
    expect(text).toContain("sí se está ejecutando como administrador")
    expect(text).not.toContain("Ejecutar como administrador")
  })

  // Only directories left: the Restart Manager cannot be asked about a directory at all
  // (RmGetList returns ERROR_ACCESS_DENIED), so silence here would look like "nobody holds it".
  test("explains why a directory has no named holder", () => {
    const text = renderReport(
      report({
        ok: false,
        failures: [failure("C:/Users/dev/app/dist", { directory: true, kind: "not-empty", code: "ENOTEMPTY" })],
        probe: "skipped",
        attempts: [{ step: "identify", ok: false, note: "skipped" }],
      }),
    )
    expect(text).toContain("por una carpeta no se puede preguntar")
  })

  // Measured, not assumed: RmRegisterResources refuses any path of 260 characters or more, and
  // \\?\ does not lift it. Silence about those paths would read as "nobody is holding them".
  test("owns up to the paths the Restart Manager would not take", () => {
    const text = renderReport(
      report({
        ok: false,
        failures: [failure(ASAR)],
        probe: "ok",
        probeSkipped: 3,
        attempts: [{ step: "identify", ok: false, note: "ok" }],
      }),
    )
    expect(text).toContain("De 3 rutas no se pudo preguntar")
    expect(text).toContain("260 caracteres")
  })

  test("a clean delete says so without the ladder", () => {
    const text = renderReport(report({ ok: true, removed: 4, attempts: [{ step: "remove", ok: true }] }))
    expect(text).toBe(`Borrado ${TARGET} — 4 entradas.`)
  })
})
