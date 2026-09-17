import { useGlobal } from "@/context/global"
import { readStartMode, START_PENDING_KEY } from "@/components/dialogs/dialog-welcome-setup"
import { useDirectoryPicker } from "@/components/file-tree/directory-picker"
import { type HomeProjectSelection, useLayout } from "@/context/layout"
import { ServerConnection, useServer } from "@/context/server"
import { useServerSync } from "@/context/server-sync"
import { useTabs } from "@/context/tabs"
import { toggleHomeProjectSelection } from "@/pages/layout/helpers"
import { createEffect, createMemo } from "solid-js"

export function createHomeController() {
  const sync = useServerSync()
  const layout = useLayout()
  const server = useServer()
  const global = useGlobal()
  const tabs = useTabs()
  const selection = layout.home.selection
  const focusedServer = createMemo(
    () => global.servers.list().find((conn) => ServerConnection.key(conn) === selection().server) ?? server.current,
  )
  const focusedServerCtx = createMemo(() => {
    const conn = focusedServer()
    if (!conn) return undefined
    return global.ensureServerCtx(conn)
  })
  const focusedSync = () => focusedServerCtx()?.sync ?? sync()
  const homedir = createMemo(() => focusedSync().data.path.home ?? "")
  // Desktop: a chat that is not tied to a chosen folder lives in the profile's scratch workspace
  // (the sidecar's working directory), never in the user's home, so the home folder no longer
  // shows up as a project by accident. The web build keeps the home directory.
  const desktop = typeof window !== "undefined" && !!(window as { api?: unknown }).api
  const chatdir = createMemo(() => {
    const path = focusedSync().data.path as { directory?: string } | undefined
    return (desktop ? path?.directory : undefined) || homedir()
  })
  const projects = createMemo(() =>
    (focusedServerCtx()?.projects.list() ?? layout.projects.list()).filter(
      (project) => project.worktree !== chatdir(),
    ),
  )
  const recentlyClosed = createMemo(
    () => focusedServerCtx()?.projects.recentlyClosed() ?? layout.projects.recentlyClosed(),
  )
  const selectedProject = createMemo(() => projects().find((project) => project.worktree === selection().directory))
  const newSessionProject = createMemo(
    () =>
      // Only a project the user picked in the sidebar wins; otherwise the chat is a plain chat.
      selectedProject() ?? (chatdir() ? { worktree: chatdir(), expanded: false } : undefined),
  )

  createEffect(() => {
    const list = global.servers.list()
    if (list.some((conn) => ServerConnection.key(conn) === selection().server)) return
    const conn = list.find((conn) => ServerConnection.key(conn) === server.key) ?? list[0]
    if (conn) setSelection({ server: ServerConnection.key(conn) })
  })

  function setSelection(next: HomeProjectSelection) {
    layout.home.setSelection(next)
  }

  // How Tiancode opens (welcome wizard, also editable from Settings › Abrir asistente): Chat opens a
  // plain conversation, Code asks for a folder and opens a session in it, Home stays here. Applied
  // once per app start (sessionStorage survives a reload but not a new window).
  const pickDirectory = useDirectoryPicker()
  const STARTED_KEY = "tiancode.start.applied"
  createEffect(() => {
    const conn = focusedServer()
    const dir = chatdir()
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
    if (mode === "chat") {
      openProjectNewSession(conn, dir)
      return
    }
    pickDirectory({
      server: conn,
      onSelect: (result) => {
        const picked = Array.isArray(result) ? result[0] : result
        openProjectNewSession(conn, picked || dir)
      },
    })
  })

  function openProjectNewSession(conn: ServerConnection.Any, directory: string, prompt?: string) {
    const ctx = global.ensureServerCtx(conn)
    const target = directory || chatdir()
    // The scratch workspace is never listed as a project.
    if (directory && directory !== chatdir()) {
      ctx.projects.open(directory)
      ctx.projects.touch(directory)
    }
    void tabs.newDraft({ server: ServerConnection.key(conn), directory: target }, prompt)
  }

  return {
    selection: {
      value: selection,
      set: setSelection,
      focusServer: (conn: ServerConnection.Any) => setSelection({ server: ServerConnection.key(conn) }),
    },
    server: {
      list: global.servers.list,
      health: (conn: ServerConnection.Any) => global.servers.health[ServerConnection.key(conn)],
      context: (conn: ServerConnection.Any) => global.ensureServerCtx(conn),
      focused: focusedServer,
      focusedContext: focusedServerCtx,
      focusedSync,
    },
    project: {
      list: projects,
      recentlyClosed,
      homedir,
      chatdir,
      selected: selectedProject,
      newSession: newSessionProject,
      forServer: (conn: ServerConnection.Any) => global.ensureServerCtx(conn).projects.list(),
      removeRecentlyClosed: (conn: ServerConnection.Any, directory: string) => {
        global.ensureServerCtx(conn).projects.removeRecentlyClosed(directory)
      },
      clearRecentlyClosed: (conn: ServerConnection.Any) => {
        global.ensureServerCtx(conn).projects.clearRecentlyClosed()
      },
      select: (conn: ServerConnection.Any, directory: string) => {
        const key = ServerConnection.key(conn)
        if (global.servers.health[key]?.healthy === false) return
        if (
          !global
            .ensureServerCtx(conn)
            .projects.list()
            .some((project) => project.worktree === directory)
        )
          return
        setSelection(toggleHomeProjectSelection(selection(), key, directory))
      },
      add: (conn: ServerConnection.Any, directories: string[]) => {
        const directory = directories[0]
        if (!directory) return
        const ctx = global.ensureServerCtx(conn)
        directories.forEach((item) => {
          if (ctx.projects.list().some((project) => project.worktree === item)) return
          // Carpeta nueva: se registra como proyecto en el servidor (initGit si
          // está vacía) para que aparezca en el picker y en las sesiones.
          const location = { directory: item }
          void ctx.sdk.api.file
            .list({ path: ".", location })
            .then(async (files) => {
              if (files.data.length > 0) return ctx.sdk.api.project.current({ location })
              const result = await ctx.sdk.client.project.initGit({ directory: item })
              return result.data ?? ctx.sdk.api.project.current({ location })
            })
            .then((project) => ctx.sync.child(item, { bootstrap: false })[1]("project", project.id))
            .catch(() => undefined)
          ctx.projects.open(item)
        })
        ctx.projects.touch(directory)
        setSelection({ server: ServerConnection.key(conn), directory })
      },
      openNewSession: (prompt?: string) => {
        const conn = focusedServer()
        if (!conn) return
        const target = newSessionProject()?.worktree ?? chatdir()
        if (!target) return
        openProjectNewSession(conn, target, prompt)
      },
      openProjectNewSession,
    },
  }
}

export type HomeController = ReturnType<typeof createHomeController>
