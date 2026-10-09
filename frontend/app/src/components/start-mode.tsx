import { createEffect } from "solid-js"
import { readStartMode, START_PENDING_KEY } from "@/components/dialogs/dialog-welcome-setup"
import { useDirectoryPicker } from "@/components/file-tree/directory-picker"
import { useGlobal } from "@/context/global"
import { ServerConnection, useServer } from "@/context/server"
import { useTabs } from "@/context/tabs"
import { pathKey } from "@/utils/path-key"

const STARTED_KEY = "tiancode.start.applied"

/**
 * "Al abrir Tiancode" from the welcome wizard: Chat opens a plain conversation, Code opens a
 * session in the last project (asking for a folder only when there is none yet), Home does
 * nothing. Lives next to the tab strip so it runs on every start, whatever page the desktop
 * restored (the home page is not always mounted).
 * Applied once per window session: sessionStorage survives a reload but not a new window.
 */
export function StartModeRunner() {
  const global = useGlobal()
  const server = useServer()
  const tabs = useTabs()
  const pickDirectory = useDirectoryPicker()

  createEffect(() => {
    // The standalone welcome window hosts the card only.
    if (typeof window !== "undefined" && new URLSearchParams(window.location.search).has("welcome")) return
    // The saved projects decide what Code opens and the saved tabs which draft is reused, so wait
    // until both are read from disk.
    if (!server.ready() || !tabs.ready()) return
    const list = global.servers.list()
    const conn = list.find((item) => ServerConnection.key(item) === server.key) ?? list[0]
    // ServerSync's provider lives below the routes; the global server context carries the same store.
    const path = global.ensureServerCtx(conn).sync.data.path as { directory?: string; home?: string } | undefined
    const desktop = typeof window !== "undefined" && !!(window as { api?: unknown }).api
    const dir = (desktop ? path?.directory : undefined) || path?.home
    if (!conn || !dir) return
    try {
      if (sessionStorage.getItem(STARTED_KEY)) return
      sessionStorage.setItem(STARTED_KEY, "1")
      localStorage.removeItem(START_PENDING_KEY)
    } catch {
      return
    }
    const mode = readStartMode()
    if (mode === "home") return
    const open = (directory: string) => {
      // A draft left by an earlier start in the same folder is reused instead of piling up tabs.
      const draft = tabs.store.find(
        (tab) =>
          tab.type === "draft" && tab.server === ServerConnection.key(conn) && pathKey(tab.directory) === pathKey(directory),
      )
      if (draft) {
        tabs.select(draft)
        return
      }
      void tabs.newDraft({ server: ServerConnection.key(conn), directory })
    }
    if (mode === "chat") {
      open(dir)
      return
    }
    // Opening the system folder dialog on every start was in the way: Code continues in the last
    // project and only asks for a folder the first time.
    const projects = server.projects.forServer(ServerConnection.key(conn))
    // Closing a project keeps it as `last`, so only trust it while it is still listed.
    const listed = projects.list()
    const last = (listed.find((project) => project.worktree === projects.last()) ?? listed[0])?.worktree
    if (last) {
      open(last)
      return
    }
    pickDirectory({
      server: conn,
      onSelect: (result) => {
        const picked = Array.isArray(result) ? result[0] : result
        // Saved as the last project so the next start opens it without asking again.
        if (picked) {
          projects.open(picked)
          projects.touch(picked)
        }
        open(picked || dir)
      },
    })
  })

  return null
}
