import { createEffect, createMemo, createSignal, onCleanup } from "solid-js"
import { createAim } from "@/utils/aim"

/** Delay before a pointer that left the rail collapses the hovered project. */
const LEAVE_DELAY_MS = 300
/** Delay before the peek panel unmounts, so a quick re-hover does not flash it. */
const PEEK_EXIT_MS = 180

export interface SidebarHoverDeps<P extends { worktree: string }> {
  /** Whether the sidebar is pinned open; hover behaviour is suppressed when it is. */
  sidebarOpened: () => boolean
  projects: () => readonly P[]
  /** Called when a project becomes the hover target, to warm its data. */
  onActivate: (directory: string) => void
}

/**
 * Hover-to-peek behaviour for the collapsed sidebar rail.
 *
 * Pointing at a project expands it in place and slides out a peek panel; leaving collapses it
 * again after a grace period, so crossing the rail on the way elsewhere does not thrash. The
 * two delays differ on purpose: the hover target clears on a timer long enough to survive a
 * diagonal pointer path, while the panel lingers only briefly after that.
 *
 * `createAim` supplies the diagonal-intent tracking, so moving toward a submenu does not count
 * as leaving the item it belongs to.
 *
 * Must be called from a reactive owner: it registers effects and onCleanup.
 */
export function createSidebarHover<P extends { worktree: string }>(deps: SidebarHoverDeps<P>) {
  const [hoverProject, setHoverProjectSignal] = createSignal<string | undefined>(undefined)
  const [peek, setPeek] = createSignal<string | undefined>(undefined)
  const [peeked, setPeeked] = createSignal(false)
  const [nav, setNav] = createSignal<HTMLElement | undefined>(undefined)

  let leaveTimer: number | undefined
  let peekTimer: number | undefined

  const aim = createAim({
    enabled: () => !deps.sidebarOpened(),
    active: () => hoverProject(),
    el: () => nav()?.querySelector<HTMLElement>("[data-component='sidebar-rail']") ?? nav(),
    onActivate: (directory) => {
      deps.onActivate(directory)
      setHoverProjectSignal(directory)
    },
  })

  const setHoverProject = (value: string | undefined) => {
    setHoverProjectSignal(value)
    if (value !== undefined) return
    aim.reset()
  }

  /** Deferred so a click handler on the item still runs before the rail collapses under it. */
  const clearHoverProjectSoon = () => queueMicrotask(() => setHoverProject(undefined))

  const disarm = () => {
    if (leaveTimer === undefined) return
    clearTimeout(leaveTimer)
    leaveTimer = undefined
  }

  const reset = () => {
    disarm()
    setHoverProject(undefined)
  }

  const arm = () => {
    if (deps.sidebarOpened()) return
    if (hoverProject() === undefined) return
    disarm()
    leaveTimer = window.setTimeout(() => {
      leaveTimer = undefined
      setHoverProject(undefined)
    }, LEAVE_DELAY_MS)
  }

  const hovering = createMemo(() => !deps.sidebarOpened() && hoverProject() !== undefined)
  const expanded = createMemo(() => deps.sidebarOpened() || hovering())

  const findProject = (id: string | undefined) =>
    id ? deps.projects().find((project) => project.worktree === id) : undefined

  const hoverProjectData = createMemo(() => findProject(hoverProject()))
  const peekProject = createMemo(() => findProject(peek()))

  // Show the peek panel immediately, but keep it mounted briefly after the hover ends.
  createEffect(() => {
    const project = hoverProjectData()
    if (project) {
      if (peekTimer !== undefined) {
        clearTimeout(peekTimer)
        peekTimer = undefined
      }
      setPeek(project.worktree)
      setPeeked(true)
      return
    }

    setPeeked(false)
    if (peek() === undefined) return
    if (peekTimer !== undefined) clearTimeout(peekTimer)
    peekTimer = window.setTimeout(() => {
      peekTimer = undefined
      setPeek(undefined)
    }, PEEK_EXIT_MS)
  })

  // Pinning the sidebar open makes any hover target meaningless.
  createEffect(() => {
    if (!deps.sidebarOpened()) return
    setHoverProject(undefined)
  })

  onCleanup(() => {
    disarm()
    if (peekTimer !== undefined) clearTimeout(peekTimer)
    aim.reset()
  })

  return {
    hoverProject,
    hoverProjectData,
    peekProject,
    peeked,
    hovering,
    expanded,
    nav,
    setNav,
    setHoverProject,
    clearHoverProjectSoon,
    disarm,
    reset,
    arm,
    aim,
  }
}

export type SidebarHover<P extends { worktree: string }> = ReturnType<typeof createSidebarHover<P>>
