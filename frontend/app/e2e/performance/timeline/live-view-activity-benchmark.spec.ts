import { benchmark, expect } from "../benchmark"
import { fixture } from "./session-timeline-stress.fixture"
import { installTimelineSettings, installStressSessionTabs, stressSessionHref } from "./timeline-test-helpers"
import { mockTiancodeServer } from "../../utils/mock-server"
import { expectSessionTitle } from "../../utils/waits"

benchmark("reports tool activity beside a working project preview", async ({ page, report }, testInfo) => {
  await page.setViewportSize({ width: 1500, height: 950 })
  const previewURL = `http://127.0.0.1:${process.env.PLAYWRIGHT_PORT ?? 3000}/audit-preview/`
  const messages = fixture.messages[fixture.sourceID].slice(-2)
  const assistant = messages.find((message) => message.info.role === "assistant")!
  const part = {
    id: "prt_live_edit", messageID: assistant.info.id, sessionID: fixture.sourceID, callID: "call_live_edit",
    type: "tool", tool: "write", state: {
      status: "running", input: { filePath: `${fixture.directory}/src/App.tsx` },
      time: { start: 1700000000000 },
    },
  }
  let completed = false
  await mockTiancodeServer(page, {
    directory: fixture.directory, project: fixture.project, provider: fixture.provider, sessions: fixture.sessions,
    pageMessages: () => ({ items: messages.map((message) => message === assistant ? { ...message, parts: [part] } : message) }),
    events: () => completed ? [{ directory: fixture.directory, payload: { type: "message.part.updated", properties: { part: {
      ...part, state: { ...part.state, status: "completed", output: "Created App", title: "App.tsx", metadata: {}, time: { start: 1700000000000, end: 1700000000100 } },
    } } } }] : [],
    eventRetry: 100,
    fileList: () => [],
    fileContent: () => ({ type: "text", content: "export default function App() { return <main>Verified preview</main> }" }),
  })
  await page.route("http://127.0.0.1:8790/**", (route) => route.request().url().endsWith("/events")
    ? route.fulfill({ status: 204 })
    : route.fulfill({ json: { session: { session_id: "live-audit", root: fixture.directory, preview_url: previewURL } } }))
  await page.route("**/preview?**", (route) => route.fulfill({ json: { status: "ready", url: previewURL, directory: fixture.directory, isDesktop: false } }))
  await page.route("**/audit-preview/**", (route) => route.fulfill({ contentType: "text/html", body: '<!doctype html><html><body style="background:#101a26;color:#c1f2dd;font:24px system-ui;padding:32px"><h1>Verified preview</h1><button>Working button</button></body></html>' }))
  await installTimelineSettings(page)
  await installStressSessionTabs(page)
  await page.addInitScript(() => localStorage.setItem("tiancode.global.dat:layout", JSON.stringify({ liveView: { opened: true, tab: "preview", width: 760 } })))
  await page.goto(stressSessionHref(fixture.sourceID))
  await expectSessionTitle(page, fixture.expected.sourceTitle)
  const sandbox = page.locator("#live-view-panel")
  const activity = sandbox.locator('[data-component="live-view-activity"]')
  await expect(activity).toContainText("Running")
  await activity.locator("summary").click()
  await expect(activity.getByText(`${fixture.directory}/src/App.tsx`, { exact: true })).toBeVisible()
  await expect(sandbox.locator('input[aria-label="URL of the app or dev server…"]')).toHaveValue(previewURL)
  await expect(page.frameLocator(`iframe[src="${previewURL}"]`).getByRole("heading", { name: "Verified preview" })).toBeVisible()
  const started = performance.now()
  completed = true
  await expect(activity.locator('[data-tool-status="completed"]')).toBeVisible()
  await expect(activity.locator('[data-tool-status="running"]')).toHaveCount(0)
  await expect(sandbox.getByTitle(`Writing ${fixture.directory}/src/App.tsx`)).toHaveCount(0)
  report({ completionVisibleMs: performance.now() - started })
  await page.screenshot({ path: testInfo.outputPath("live-view-activity.png"), fullPage: true })
})
