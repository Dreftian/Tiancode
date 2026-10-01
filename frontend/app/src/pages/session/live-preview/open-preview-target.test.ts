import { describe, expect, test } from "bun:test"
import { canStartPreview, desktopPreviewUrl, parsePreviewTarget, readPreviewTarget, startPreviewTarget } from "./open-preview-target"

const http = { url: "http://127.0.0.1:4096", password: "secret" }

describe("open-preview-target", () => {
  test("parses only known statuses and drops empty strings", () => {
    expect(parsePreviewTarget({ status: "ready", url: "http://localhost:5173/", isDesktop: false, command: "" })).toEqual({
      status: "ready",
      url: "http://localhost:5173/",
      isDesktop: false,
      command: undefined,
      errorMessage: undefined,
    })
    expect(parsePreviewTarget({ status: "weird" })).toBeUndefined()
    expect(parsePreviewTarget(null)).toBeUndefined()
  })

  test("the PC browser gets a routable loopback address", () => {
    expect(desktopPreviewUrl("http://0.0.0.0:3000/app")).toBe("http://127.0.0.1:3000/app")
    expect(desktopPreviewUrl("https://example.com/")).toBe("https://example.com/")
  })

  test("a project can start when it runs already or has a command", () => {
    expect(canStartPreview({ status: "idle", isDesktop: false, command: "bun run dev" })).toBe(true)
    expect(canStartPreview({ status: "ready", isDesktop: false })).toBe(true)
    expect(canStartPreview({ status: "idle", isDesktop: false })).toBe(false)
    expect(canStartPreview(undefined)).toBe(false)
  })

  test("reads the status with basic auth", async () => {
    const calls: { url: string; auth?: string }[] = []
    const fetch = (async (url: string, init?: RequestInit) => {
      calls.push({ url, auth: (init?.headers as Record<string, string> | undefined)?.Authorization })
      return new Response(JSON.stringify({ status: "idle", command: "npm run dev", isDesktop: false }))
    }) as unknown as typeof globalThis.fetch
    const target = await readPreviewTarget({ http, directory: "/srv/proj", fetch })
    expect(target?.command).toBe("npm run dev")
    expect(calls[0].url).toBe("http://127.0.0.1:4096/preview?directory=%2Fsrv%2Fproj")
    expect(calls[0].auth).toBe(`Basic ${btoa("tiancode:secret")}`)
  })

  test("start returns at once for desktop projects and errors, and polls until ready otherwise", async () => {
    const replies = [
      { status: "starting", isDesktop: false, command: "vite" },
      { status: "starting", isDesktop: false, command: "vite" },
      { status: "ready", isDesktop: false, url: "http://localhost:5173/" },
    ]
    const fetch = (async () => new Response(JSON.stringify(replies.shift()))) as unknown as typeof globalThis.fetch
    const ready = await startPreviewTarget({ http, directory: "/p", fetch })
    expect(ready?.url).toBe("http://localhost:5173/")

    const desktop = (async () =>
      new Response(JSON.stringify({ status: "starting", isDesktop: true }))) as unknown as typeof globalThis.fetch
    expect((await startPreviewTarget({ http, directory: "/p", fetch: desktop }))?.isDesktop).toBe(true)
  })
})
