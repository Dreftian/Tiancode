import { describe, expect, test } from "bun:test"
import { createUpdaterController, type UpdaterBackend, type UpdaterReadyRecord } from "./updater-controller"

function setup(input?: { currentVersion?: string; ready?: UpdaterReadyRecord; backend?: Partial<UpdaterBackend> }) {
  const calls: string[] = []
  const backend: UpdaterBackend = {
    async checkForUpdates() {
      calls.push("check")
      return { isUpdateAvailable: true, updateInfo: { version: "2.0.0" } }
    },
    async downloadUpdate() {
      calls.push("download")
    },
    quitAndInstall() {
      calls.push("install")
    },
    ...input?.backend,
  }
  let ready = input?.ready
  const controller = createUpdaterController({
    enabled: true,
    currentVersion: input?.currentVersion ?? "1.0.0",
    backend,
    persistence: {
      get: () => ready,
      set: (value) => {
        ready = value
      },
      clear: () => {
        ready = undefined
      },
    },
    stop: async () => {
      calls.push("stop")
    },
  })
  return { controller, calls, getReady: () => ready }
}

describe("updater controller", () => {
  test("checks, downloads, persists, and publishes one authoritative ready state", async () => {
    const app = setup()
    const states: ReturnType<typeof app.controller.getState>[] = []
    app.controller.subscribe((state) => states.push(state))

    await app.controller.start()

    expect(app.calls).toEqual(["check", "download"])
    expect(app.getReady()).toEqual({ version: "2.0.0" })
    expect(states.map((state) => state.status)).toEqual(["idle", "checking", "downloading", "ready"])
    expect(app.controller.getState()).toEqual({ status: "ready", version: "2.0.0" })
  })

  test("revalidates a persisted target through the updater cache on launch", async () => {
    const app = setup({ ready: { version: "2.0.0" } })

    await app.controller.start()

    expect(app.calls).toEqual(["check", "download"])
    expect(app.controller.getState()).toEqual({ status: "ready", version: "2.0.0" })
  })

  test("clears a target already installed before checking", async () => {
    const app = setup({ currentVersion: "2.0.0", ready: { version: "2.0.0" } })

    await app.controller.start()

    expect(app.getReady()).toBeUndefined()
    expect(app.calls).toEqual(["check"])
  })

  test("coalesces concurrent checks", async () => {
    const app = setup()

    await Promise.all([app.controller.check(), app.controller.check(), app.controller.check()])

    expect(app.calls).toEqual(["check", "download"])
  })

  test("a failed download is never installable and a later check can retry", async () => {
    let attempts = 0
    const app = setup({
      ready: { version: "2.0.0" },
      backend: { async downloadUpdate() {
        if (attempts++ === 0) throw new Error("checksum mismatch")
      } },
    })
    expect(await app.controller.check()).toEqual({ status: "error", message: "checksum mismatch" })
    expect(app.getReady()).toBeUndefined()
    await expect(app.controller.install()).rejects.toThrow("not ready")
    expect(await app.controller.check()).toEqual({ status: "ready", version: "2.0.0" })
  })

  test("a metadata failure does not fabricate a downloadable update", async () => {
    const app = setup({ backend: { async checkForUpdates() { throw new Error("invalid manifest") } } })
    expect(await app.controller.check()).toEqual({ status: "error", message: "invalid manifest" })
    expect(app.calls).toEqual([])
    expect(app.getReady()).toBeUndefined()
  })

  test("installation awaits backup completion and propagates backup failure", async () => {
    const backup = Promise.withResolvers<void>()
    const app = setup({ backend: { quitAndInstall: () => backup.promise } })
    await app.controller.check()
    const installation = app.controller.install()
    expect(app.controller.getState().status).toBe("installing")
    backup.reject(new Error("backup failed"))
    await expect(installation).rejects.toThrow("backup failed")
    expect(app.controller.getState().status).toBe("ready")
  })

  test("returns to ready when quitAndInstall returns without exiting", async () => {
    const app = setup()
    await app.controller.start()

    await app.controller.install()

    expect(app.calls).toEqual(["check", "download", "install"])
    expect(app.controller.getState()).toEqual({ status: "ready", version: "2.0.0" })
  })

  test("returns to ready when installation cannot start", async () => {
    const app = setup()
    await app.controller.start()

    // install() no longer stops the sidecar first — that left a live window pointed at a dead
    // port whenever quitAndInstall failed. The only thing that can fail now is the install itself.
    const failed = createUpdaterController({
      enabled: true,
      currentVersion: "1.0.0",
      backend: {
        checkForUpdates: async () => ({ isUpdateAvailable: true, updateInfo: { version: "2.0.0" } }),
        downloadUpdate: async () => {},
        quitAndInstall() {
          throw new Error("install failed")
        },
      },
      persistence: { get: () => undefined, set() {}, clear() {} },
      stop: async () => {},
    })
    await failed.start()

    await expect(failed.install()).rejects.toThrow("install failed")
    expect(failed.getState()).toEqual({ status: "ready", version: "2.0.0" })
  })
})
