import { describe, expect, test } from "bun:test"
import { createRoot, createSignal } from "solid-js"
import { createSidebarHover } from "./sidebar-hover"

/**
 * Covers the signal- and timer-driven half of the hook only.
 *
 * The repo runs unit tests with `--conditions=solid` (see package.json test:unit), which
 * resolves solid-js to its *server* build. There, createMemo evaluates once and never
 * recomputes — `createRoot(() => { const [n, setN] = createSignal(1); const d =
 * createMemo(() => n() * 2); setN(5); return d() })` returns 2, not 10. So anything derived
 * through a memo or driven by createEffect cannot be asserted here: `expanded`, `hovering`,
 * `hoverProjectData`, `peekProject` and the peek/pin effects are all covered by the browser
 * instead.
 *
 * Switching the suite to `--conditions=browser` does make memos reactive, but it also breaks
 * three server-session tests and fixes none, so it is not a straight upgrade.
 */

const PROJECTS = [{ worktree: "/a" }, { worktree: "/b" }]

function setup(over: { opened?: boolean } = {}) {
  return createRoot((dispose) => {
    const [opened, setOpened] = createSignal(over.opened ?? false)
    const activated: string[] = []
    const hover = createSidebarHover({
      sidebarOpened: opened,
      projects: () => PROJECTS,
      onActivate: (directory) => activated.push(directory),
    })
    return { hover, setOpened, activated, dispose }
  })
}

const microtask = () => new Promise((resolve) => setTimeout(resolve, 0))

describe("createSidebarHover", () => {
  test("starts with nothing hovered", () => {
    const { hover, dispose } = setup()
    expect(hover.hoverProject()).toBeUndefined()
    dispose()
  })

  test("setHoverProject sets and clears the target", () => {
    const { hover, dispose } = setup()
    hover.setHoverProject("/a")
    expect(hover.hoverProject()).toBe("/a")
    hover.setHoverProject(undefined)
    expect(hover.hoverProject()).toBeUndefined()
    dispose()
  })

  test("reset clears the target immediately", () => {
    const { hover, dispose } = setup()
    hover.setHoverProject("/a")
    hover.reset()
    expect(hover.hoverProject()).toBeUndefined()
    dispose()
  })

  test("clearHoverProjectSoon defers past the current task", async () => {
    // Deferred on purpose: a click handler on the item must still run before the rail
    // collapses out from under the pointer.
    const { hover, dispose } = setup()
    hover.setHoverProject("/a")
    hover.clearHoverProjectSoon()
    expect(hover.hoverProject()).toBe("/a")
    await microtask()
    expect(hover.hoverProject()).toBeUndefined()
    dispose()
  })

  test("arm clears the target after the leave delay", async () => {
    const { hover, dispose } = setup()
    hover.setHoverProject("/a")
    hover.arm()
    expect(hover.hoverProject()).toBe("/a")
    await new Promise((resolve) => setTimeout(resolve, 340))
    expect(hover.hoverProject()).toBeUndefined()
    dispose()
  })

  test("disarm cancels a pending leave", async () => {
    // Crossing the rail on the way somewhere else must not collapse the hovered project.
    const { hover, dispose } = setup()
    hover.setHoverProject("/a")
    hover.arm()
    hover.disarm()
    await new Promise((resolve) => setTimeout(resolve, 340))
    expect(hover.hoverProject()).toBe("/a")
    dispose()
  })

  test("arm does nothing while the sidebar is pinned open", async () => {
    // Pinned open there is no rail to collapse, so no timer should be scheduled.
    const { hover, dispose } = setup({ opened: true })
    hover.setHoverProject("/a")
    hover.arm()
    await new Promise((resolve) => setTimeout(resolve, 340))
    expect(hover.hoverProject()).toBe("/a")
    dispose()
  })

  test("nav element is exposed for the aim tracker", () => {
    const { hover, dispose } = setup()
    expect(hover.nav()).toBeUndefined()
    const el = { querySelector: () => undefined } as unknown as HTMLElement
    hover.setNav(el)
    expect(hover.nav()).toBe(el)
    dispose()
  })

  test("disposing the root cancels a pending leave timer", async () => {
    // A timer firing after teardown would write to a disposed signal.
    const { hover, dispose } = setup()
    hover.setHoverProject("/a")
    hover.arm()
    dispose()
    await new Promise((resolve) => setTimeout(resolve, 340))
    expect(hover.hoverProject()).toBe("/a")
  })
})
