import { describe, expect, test } from "bun:test"
import { handleDeepLinks, type DeepLinkDeps } from "./deep-link-listener"

function spyDeps(over: Partial<DeepLinkDeps> = {}) {
  const opened: [string, boolean | undefined][] = []
  const navigated: string[] = []
  const deps: DeepLinkDeps = {
    isLocal: () => true,
    // ServerScope is a branded string, not an object.
    scope: () => "local" as never,
    openProject: (directory, navigate) => opened.push([directory, navigate]),
    navigate: (href) => navigated.push(href),
    ...over,
  }
  return { deps, opened, navigated }
}

describe("handleDeepLinks", () => {
  test("ignores everything when the server is not local", () => {
    // Acting on a deep link against a remote server would open a directory that only exists
    // on this machine.
    const { deps, opened, navigated } = spyDeps({ isLocal: () => false })
    handleDeepLinks(["tiancode://open-project?directory=/tmp/demo"], deps)
    expect(opened).toEqual([])
    expect(navigated).toEqual([])
  })

  test("opens a project without navigating", () => {
    const { deps, opened, navigated } = spyDeps()
    handleDeepLinks(["tiancode://open-project?directory=/tmp/demo"], deps)
    expect(opened).toEqual([["/tmp/demo", undefined]])
    expect(navigated).toEqual([])
  })

  test("a new-session link opens the project without navigation, then routes to the session", () => {
    // openProject is called with `false` so it does not race the explicit navigate below.
    const { deps, opened, navigated } = spyDeps()
    handleDeepLinks(["tiancode://new-session?directory=/tmp/demo"], deps)
    expect(opened).toEqual([["/tmp/demo", false]])
    expect(navigated).toHaveLength(1)
    expect(navigated[0]).toEndWith("/session")
  })

  test("a prompt is carried in the query string, encoded", () => {
    const { deps, navigated } = spyDeps()
    handleDeepLinks(["tiancode://new-session?directory=/tmp/demo&prompt=" + encodeURIComponent("fix the build & tests")], deps)
    expect(navigated[0]).toContain("prompt=")
    expect(navigated[0]).toContain(encodeURIComponent("fix the build & tests"))
    expect(navigated[0]).not.toContain("&tests")
  })

  test("ignores urls that are not deep links", () => {
    const { deps, opened, navigated } = spyDeps()
    handleDeepLinks(["https://example.com", "", "not a url"], deps)
    expect(opened).toEqual([])
    expect(navigated).toEqual([])
  })

  test("handles several links in one batch", () => {
    const { deps, opened } = spyDeps()
    handleDeepLinks(
      ["tiancode://open-project?directory=/a", "tiancode://open-project?directory=/b", "tiancode://new-session?directory=/c"],
      deps,
    )
    expect(opened).toEqual([
      ["/a", undefined],
      ["/b", undefined],
      ["/c", false],
    ])
  })
})
