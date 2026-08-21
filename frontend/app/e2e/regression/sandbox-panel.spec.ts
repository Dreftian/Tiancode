import { base64Encode } from "@tiancode-ai/core/util/encode"
import { expect, test } from "@playwright/test"
import { mockTiancodeServer } from "../utils/mock-server"
import { expectSessionTitle } from "../utils/waits"

const directory = "C:/Tiancode/SandboxPanel"
const projectID = "proj_sandbox_panel"
const sessionID = "ses_sandbox_panel"
const title = "Sandbox panel regression"
const childSessionID = "ses_sandbox_panel_child"
const childTitle = "Sandbox child export"

test("keeps sandbox tabs accessible beside an open terminal and nests exports in the session menu", async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 900 })
  await mockTiancodeServer(page, {
    directory,
    project: {
      id: projectID,
      worktree: directory,
      vcs: "git",
      name: "sandbox-panel",
      time: { created: 1700000000000, updated: 1700000000000 },
      sandboxes: [],
    },
    provider: {
      all: [
        {
          id: "tiancode",
          name: "Tiancode",
          models: { test: { id: "test", name: "Test", limit: { context: 200_000 } } },
        },
      ],
      connected: ["tiancode"],
      default: { providerID: "tiancode", modelID: "test" },
    },
    sessions: [
      {
        id: sessionID,
        slug: "sandbox-panel",
        projectID,
        directory,
        title,
        version: "dev",
        time: { created: 1700000000000, updated: 1700000000000 },
      },
      {
        id: childSessionID,
        parentID: sessionID,
        slug: "sandbox-panel-child",
        projectID,
        directory,
        title: childTitle,
        version: "dev",
        time: { created: 1700000000000, updated: 1700000000000 },
      },
    ],
    fileList: (path) => {
      if (path) return []
      return [
        {
          name: "server.ts",
          path: "server.ts",
          absolute: `${directory}/server.ts`,
          type: "file" as const,
          ignored: false,
        },
      ]
    },
    fileContent: (path) => ({ type: "text", content: `contents:${path}` }),
    pageMessages: () => ({ items: [] }),
  })
  await page.route("http://127.0.0.1:8790/**", (route) =>
    route.fulfill({ contentType: "text/html", body: "<main>live preview</main>" }),
  )
  await page.addInitScript(() => {
    localStorage.setItem("settings.v3", JSON.stringify({ general: { newLayoutDesigns: true } }))
    localStorage.setItem(
      "tiancode.global.dat:layout",
      JSON.stringify({
        terminal: { height: 280, opened: true },
        liveView: { opened: true, tab: "preview" },
      }),
    )
  })

  await page.goto(`/${base64Encode(directory)}/session/${sessionID}`)
  await expectSessionTitle(page, title)

  const sandbox = page.locator("#live-view-panel")
  const terminal = page.locator("#terminal-panel")
  const preview = sandbox.getByRole("tab", { name: "Live view" })
  const code = sandbox.getByRole("tab", { name: "Code" })
  await expect(sandbox).toBeVisible()
  await expect(terminal).toBeVisible()
  await expect(sandbox.getByRole("tablist")).toBeVisible()
  await expect(preview).toHaveAttribute("aria-selected", "true")
  await expect(code).toHaveAttribute("aria-selected", "false")

  const previewPanelID = await preview.getAttribute("aria-controls")
  expect(previewPanelID).toBeTruthy()
  const previewPanel = page.locator(`#${previewPanelID}`)
  const iframe = sandbox.locator('[data-slot="sandbox-live-view"]')
  await iframe.evaluate((element) => element.setAttribute("data-e2e-probe", "preserved"))

  await code.click()
  await expect(code).toHaveAttribute("aria-selected", "true")
  const codePanelID = await code.getAttribute("aria-controls")
  expect(codePanelID).toBeTruthy()
  const codePanel = page.locator(`#${codePanelID}`)
  await expect(codePanel).toBeVisible()
  await expect(previewPanel).toBeHidden()
  await expect(sandbox.getByText("Workspace code", { exact: true })).toBeVisible()
  await sandbox.getByRole("button", { name: "server.ts" }).click()
  await expect(code).toHaveAttribute("aria-selected", "true")
  await expect(sandbox.getByText("contents:server.ts", { exact: true })).toBeVisible()

  await preview.click()
  await expect(preview).toHaveAttribute("aria-selected", "true")
  await expect(iframe).toHaveAttribute("data-e2e-probe", "preserved")
  await code.click()
  await expect(sandbox.getByText("contents:server.ts", { exact: true })).toBeVisible()
  await preview.click()

  const geometry = await page.evaluate(() => {
    const sandbox = document.querySelector<HTMLElement>("#live-view-panel")!.getBoundingClientRect()
    const terminal = document.querySelector<HTMLElement>("#terminal-panel")!.getBoundingClientRect()
    return { sandboxWidth: sandbox.width, terminalWidth: terminal.width, terminalTop: terminal.top, sandboxTop: sandbox.top }
  })
  expect(geometry.sandboxWidth).toBeGreaterThan(360)
  expect(geometry.terminalWidth).toBeGreaterThan(geometry.sandboxWidth)
  expect(geometry.terminalTop).toBeGreaterThan(geometry.sandboxTop)

  await expect(page.getByRole("button", { name: "Export conversation to Markdown" })).toHaveCount(0)
  await expect(page.getByRole("button", { name: "Export JSON" })).toHaveCount(0)
  await page.getByRole("button", { name: "More options" }).click()
  const exportMenu = page.getByRole("menuitem", { name: "Export…" })
  await expect(exportMenu).toBeVisible()
  await exportMenu.hover()
  await expect(page.getByRole("menuitem", { name: "Markdown" })).toBeVisible()
  await expect(page.getByRole("menuitem", { name: "JSON" })).toBeVisible()

  await page.keyboard.press("Escape")
  await page.setViewportSize({ width: 840, height: 900 })
  await expect(sandbox).toHaveCount(0)
  await expect(terminal).toBeVisible()
  await page.getByRole("button", { name: "Sandbox" }).click()
  await expect(terminal).toHaveCount(0)
  await expect(sandbox).toBeVisible()
  const narrowSandbox = await sandbox.evaluate((element) => {
    const rect = element.getBoundingClientRect()
    return { left: rect.left, right: rect.right }
  })
  expect(narrowSandbox.left).toBeGreaterThanOrEqual(0)
  expect(narrowSandbox.right).toBeLessThanOrEqual(840)

  await page.setViewportSize({ width: 1400, height: 900 })
  await page.goto(`/${base64Encode(directory)}/session/${childSessionID}`)
  await expectSessionTitle(page, childTitle)
  await page.getByRole("button", { name: "More options" }).click()
  const childExportMenu = page.getByRole("menuitem", { name: "Export…" })
  await expect(childExportMenu).toBeVisible()
  await expect(page.getByRole("menuitem", { name: "Rename" })).toHaveCount(0)
  await childExportMenu.hover()
  await expect(page.getByRole("menuitem", { name: "Markdown" })).toBeVisible()
  await expect(page.getByRole("menuitem", { name: "JSON" })).toBeVisible()
})
