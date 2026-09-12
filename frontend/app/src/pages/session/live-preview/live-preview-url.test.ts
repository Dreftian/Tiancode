import { describe, expect, test } from "bun:test"
import {
  previewActionUrl,
  previewAgentDemandUrl,
  previewAgentPendingUrl,
  previewStatusUrl,
} from "./live-preview-url"

describe("live preview endpoints", () => {
  test("uses the preview root for status", () => {
    expect(previewStatusUrl("http://127.0.0.1:4096/", "C:\\work folder")).toBe(
      "http://127.0.0.1:4096/preview?directory=C%3A%5Cwork%20folder",
    )
  })

  test("uses an action route for lifecycle requests", () => {
    expect(previewActionUrl("http://127.0.0.1:4096", "restart", "/work/app")).toBe(
      "http://127.0.0.1:4096/preview/restart?directory=%2Fwork%2Fapp",
    )
  })

  test("declares what this client can do when long-polling for agent actions", () => {
    // The backend hands work only to a client that says it has a page: without these flags it
    // would deliver to a closed panel, and delivery empties the queue.
    expect(previewAgentPendingUrl("http://127.0.0.1:4096", "/work/app", 20000, { surface: true, capable: true })).toBe(
      "http://127.0.0.1:4096/preview/agent/pending?directory=%2Fwork%2Fapp&wait=20000&surface=1&capable=1",
    )
    expect(previewAgentPendingUrl("http://127.0.0.1:4096", "/work/app", -5, { surface: false, capable: false })).toBe(
      "http://127.0.0.1:4096/preview/agent/pending?directory=%2Fwork%2Fapp&wait=0&surface=0&capable=0",
    )
  })

  test("asks what the agent is waiting for without consuming it", () => {
    expect(previewAgentDemandUrl("http://127.0.0.1:4096/", "C:\\work folder", { capable: false })).toBe(
      "http://127.0.0.1:4096/preview/agent/demand?directory=C%3A%5Cwork%20folder&capable=0",
    )
  })
})
