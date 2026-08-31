import type { UpdaterState } from "@tiancode-ai/app/updater"

export type { UpdaterState } from "@tiancode-ai/app/updater"

export type UpdaterReadyRecord = { version: string }

export type UpdaterBackend = {
  checkForUpdates(): Promise<{ isUpdateAvailable?: boolean; updateInfo?: { version?: string } } | null | undefined>
  downloadUpdate(): Promise<unknown>
  quitAndInstall(): void
}

type UpdaterPersistence = {
  get(): UpdaterReadyRecord | undefined | Promise<UpdaterReadyRecord | undefined>
  set(value: UpdaterReadyRecord): void | Promise<void>
  clear(): void | Promise<void>
}

export function createUpdaterController(input: {
  enabled: boolean
  currentVersion: string
  backend: UpdaterBackend
  persistence: UpdaterPersistence
  stop: () => Promise<void>
  log?: (message: string, data?: object) => void
}) {
  let state: UpdaterState = input.enabled ? { status: "idle" } : { status: "disabled" }
  let pending: Promise<UpdaterState> | undefined
  const listeners = new Set<(state: UpdaterState) => void>()

  const transition = (next: UpdaterState) => {
    input.log?.("updater state changed", { from: state.status, to: next.status })
    state = next
    listeners.forEach((listener) => listener(state))
    return state
  }

  const check = () => {
    if (!input.enabled) return Promise.resolve(state)
    if (state.status === "ready") return Promise.resolve(state)
    if (pending) return pending

    pending = (async () => {
      transition({ status: "checking" })
      let result: { isUpdateAvailable?: boolean; updateInfo?: { version?: string } } | null | undefined
      try {
        result = await input.backend.checkForUpdates()
      } catch (checkErr) {
        input.log?.("backend check failed, trying fallback latest.yml", { error: String(checkErr) })
        try {
          const res = await fetch("https://github.com/Dreftian/Tiancode/releases/latest/download/latest.yml")
          if (res.ok) {
            const text = await res.text()
            const match = text.match(/version:\s*([^\s]+)/)
            const remoteVersion = match ? match[1] : undefined
            if (remoteVersion && remoteVersion !== input.currentVersion) {
              result = { isUpdateAvailable: true, updateInfo: { version: remoteVersion } }
            } else if (remoteVersion) {
              result = { isUpdateAvailable: false, updateInfo: { version: remoteVersion } }
            }
          }
        } catch {}
        if (!result) throw checkErr
      }

      const version = result?.updateInfo?.version
      if (!result?.isUpdateAvailable || !version || version === input.currentVersion) {
        await input.persistence.clear()
        return transition({ status: "up-to-date" })
      }

      transition({ status: "downloading", version })
      try {
        await input.backend.downloadUpdate()
        await input.persistence.set({ version })
        return transition({ status: "ready", version })
      } catch {
        return transition({ status: "ready", version })
      }
    })()
      .catch((error) =>
        transition({ status: "error", message: error instanceof Error ? error.message : String(error) }),
      )
      .finally(() => {
        pending = undefined
      })
    return pending
  }

  return {
    getState: () => state,
    subscribe(listener: (state: UpdaterState) => void) {
      listeners.add(listener)
      listener(state)
      return () => listeners.delete(listener)
    },
    // Live download progress from the autoUpdater "download-progress" event.
    setDownloadProgress(percent: number) {
      if (state.status !== "downloading") return
      transition({ status: "downloading", version: state.version, percent: Math.round(percent) })
    },
    async start() {
      const ready = await input.persistence.get()
      if (ready?.version === input.currentVersion) await input.persistence.clear()
      return check()
    },
    check,
    async install() {
      if (state.status !== "ready") throw new Error("Update is not ready to install")
      const version = state.version
      transition({ status: "installing", version })
      await input
        .stop()
        .then(() => {
          input.backend.quitAndInstall()
          transition({ status: "ready", version })
        })
        .catch((error) => {
          transition({ status: "ready", version })
          throw error
        })
    },
  }
}

export type UpdaterController = ReturnType<typeof createUpdaterController>
