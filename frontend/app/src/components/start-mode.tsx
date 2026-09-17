import { createEffect } from "solid-js"
import { readStartMode, START_PENDING_KEY } from "@/components/dialogs/dialog-welcome-setup"
import { useDirectoryPicker } from "@/components/file-tree/directory-picker"
import { useGlobal } from "@/context/global"
import { ServerConnection, useServer } from "@/context/server"
import { useTabs } from "@/context/tabs"

const STARTED_KEY = "tiancode.start.applied"

/**
 * "Al abrir Tiancode" from the welcome wizard: Chat opens a plain conversation, Code asks for a
 * folder and opens a session in it, Home does nothing. Lives next to the tab strip so it runs on
 * every start, whatever page the desktop restored (the home page is not always mounted).
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
      void tabs.newDraft({ server: ServerConnection.key(conn), directory })
    }
    if (mode === "chat") {
      open(dir)
      return
    }
    pickDirectory({
      server: conn,
      onSelect: (result) => {
        const picked = Array.isArray(result) ? result[0] : result
        open(picked || dir)
      },
    })
  })

  return null
}
