import { createMemo, createSignal } from "solid-js"
import { useSDK } from "@/context/sdk"
import { useServerSDK } from "@/context/server-sdk"
import { useServerSync } from "@/context/server-sync"
import { useSettings, type WorkspaceDestination } from "@/context/settings"
import { useSync } from "@/context/sync"

/** Settings > Default environment, resolved for one project ("main" = local folder, "create" = new worktree). */
export function workspaceDefaultSelection(destination: WorkspaceDestination, lastUsed?: "local" | "workspace") {
  if (destination === "local") return "main"
  if (destination === "new") return "create"
  return lastUsed === "workspace" ? "create" : "main"
}

export function resolveNewSessionWorktree(input: {
  enabled: boolean
  selected?: string
  directory: string
  projectWorktree?: string
  fallback?: string
}) {
  if (!input.enabled) return "main"
  if (input.selected) return input.selected
  if (input.projectWorktree && input.directory !== input.projectWorktree) return input.directory
  return input.fallback ?? "main"
}

export function normalizeNewSessionWorktree(value: string, directory: string, projectWorktree?: string) {
  if (value === "main" && projectWorktree !== directory) return projectWorktree
  return value
}

export function resolveNewSessionBranch(input: {
  worktree: string
  local?: string
  worktreeBranch: (worktree: string) => string | undefined
}) {
  if (input.worktree === "main" || input.worktree === "create") return input.local
  return input.worktreeBranch(input.worktree) ?? input.local
}

export function createNewSessionWorkspaceController() {
  const sdk = useSDK()
  const serverSDK = useServerSDK()
  const sync = useSync()
  const serverSync = useServerSync()
  const settings = useSettings()
  const [worktree, setWorktree] = createSignal<string>()
  const visible = createMemo(() => sync().project?.vcs === "git")
  const projectID = () => sync().project?.id
  const fallback = createMemo(() => {
    const id = projectID()
    return workspaceDefaultSelection(
      settings.workspaces.defaultDestination(),
      id ? settings.workspaces.lastUsed(serverSDK().scope, id) : undefined,
    )
  })
  const value = createMemo(() =>
    resolveNewSessionWorktree({
      enabled: visible(),
      selected: worktree(),
      directory: sdk().directory,
      projectWorktree: sync().project?.worktree,
      fallback: fallback(),
    }),
  )
  const projectRoot = createMemo(() => sync().project?.worktree ?? sdk().directory)
  const localBranch = createMemo(() => serverSync().child(projectRoot())[0].vcs?.branch)
  const branch = createMemo(() =>
    resolveNewSessionBranch({
      worktree: value(),
      local: localBranch(),
      worktreeBranch: (worktree) => serverSync().child(worktree)[0].vcs?.branch,
    }),
  )

  return {
    selection: {
      value,
      reset: () => setWorktree(),
      set: (worktree: string) => {
        setWorktree(normalizeNewSessionWorktree(worktree, sdk().directory, sync().project?.worktree))
        // "Last used per project" remembers whether the user picked the local folder or a worktree.
        const id = projectID()
        if (id) settings.workspaces.setLastUsed(serverSDK().scope, id, worktree === "main" ? "local" : "workspace")
      },
    },
    project: {
      root: projectRoot,
      workspaces: () => sync().project?.sandboxes ?? [],
      git: () => sync().project?.vcs === "git",
    },
    bar: {
      visible,
      branch,
    },
  }
}

export type NewSessionWorkspaceController = ReturnType<typeof createNewSessionWorkspaceController>
