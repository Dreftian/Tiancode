import { describe, expect, test } from "bun:test"
import { createRoot, createSignal } from "solid-js"
import {
  liveViewNavigateRequest,
  requestLiveViewNavigation,
  useLiveViewNavigation,
} from "@/pages/session/live-view-navigate"

// Effects only start once the root's body has returned, so every step happens outside it.
function mount(enabled: () => boolean) {
  return createRoot((dispose) => {
    const [opened, setOpened] = createSignal(false)
    const urls: string[] = []
    useLiveViewNavigation({
      enabled,
      // Like the layout's open(), this reads the opened state before writing it.
      open: (url) => {
        urls.push(url)
        if (!opened()) setOpened(true)
      },
    })
    return { opened, setOpened, urls, dispose }
  })
}

describe("useLiveViewNavigation", () => {
  test("closing the Sandbox after a navigation does not reopen it", () => {
    const view = mount(() => true)

    requestLiveViewNavigation("http://localhost:5173/")
    expect(view.urls).toEqual(["http://localhost:5173/"])
    expect(view.opened()).toBe(true)

    view.setOpened(false)
    view.setOpened(false)
    expect(view.urls).toEqual(["http://localhost:5173/"])
    expect(liveViewNavigateRequest()).toBeUndefined()

    requestLiveViewNavigation("http://localhost:5174/")
    expect(view.urls).toEqual(["http://localhost:5173/", "http://localhost:5174/"])
    view.dispose()
  })

  test("a request that arrives while disabled is dropped, not replayed later", () => {
    const [enabled, setEnabled] = createSignal(false)
    const view = mount(enabled)

    requestLiveViewNavigation("http://localhost:3000/")
    setEnabled(true)
    expect(view.urls).toEqual([])
    expect(liveViewNavigateRequest()).toBeUndefined()
    view.dispose()
  })
})
