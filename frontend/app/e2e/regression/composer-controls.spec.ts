import { expect, test, type Page } from "@playwright/test"
import { base64Encode } from "@tiancode-ai/core/util/encode"
import { mockTiancodeServer } from "../utils/mock-server"
import appPackage from "../../package.json" with { type: "json" }

const directory = "C:/Tiancode/ComposerControls"
const sessionID = "ses_composer_controls"
const catalog = [
  ...["build", "plan", "webapp"].map((name) => ({ name, mode: "primary", native: true })),
  ...["software-architect", "qa-e2e-tester", "marketing-strategist", "pentest", "reverse-engineer"].map((name) => ({
    name,
    mode: "subagent",
    native: true,
  })),
  { name: "backend", mode: "primary", native: false, description: "Custom backend agent" },
]

for (const width of [1000, 720, 520, 390]) {
  test(`keeps Spanish composer controls and permission descriptions readable at ${width}px`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height: 850 })
    const cspErrors: string[] = []
    page.on("console", (message) => {
      if (message.type() === "error" && message.text().includes("Content Security Policy"))
        cspErrors.push(message.text())
    })
    await setup(page)
    const composer = page.locator('[data-component="prompt-input-v2"]')
    const mode = composer.getByRole("button", { name: "Modo", exact: true })
    await expect(mode).toBeEnabled()
    await expect(mode).toHaveCSS("white-space", "nowrap")
    await expect(composer.getByRole("button", { name: "Elegir agente", exact: true })).toHaveText("Build")
    await expect(composer.getByRole("button", { name: "Activar el modo rápido" })).toBeEnabled()
    const overflow = await composer.evaluate((element) => {
      const parent = element.getBoundingClientRect()
      return [...element.querySelectorAll<HTMLElement>("button")]
        .filter((button) => {
          const box = button.getBoundingClientRect()
          return box.width && (box.left < parent.left - 1 || box.right > parent.right + 1)
        })
        .map((button) => button.getAttribute("aria-label") ?? button.textContent)
    })
    expect(overflow).toEqual([])
    await mode.click()
    const menu = page.getByTestId("composer-mode-menu")
    await expect(menu.getByRole("menuitem")).toHaveCount(5)
    await expect(menu).toBeInViewport({ ratio: 1 })
    await expect(menu).toHaveCSS("opacity", "1")
    const rows = await menu.getByRole("menuitem").evaluateAll((elements) =>
      elements.map((element) => {
        const box = element.getBoundingClientRect()
        return {
          top: box.top,
          bottom: box.bottom,
          height: box.height,
          scroll: element.scrollHeight,
          client: element.clientHeight,
        }
      }),
    )
    rows.forEach((row, index) => {
      expect(row.height).toBeGreaterThanOrEqual(52)
      expect(row.scroll).toBeLessThanOrEqual(row.client + 1)
      if (index) expect(row.top).toBeGreaterThanOrEqual(rows[index - 1]!.bottom)
    })
    expect(cspErrors).toEqual([])
    await page.screenshot({ path: testInfo.outputPath(`composer-${width}.png`) })
  })
}

test("offers exactly three primary agents and enables Fast on a non-native model", async ({ page }) => {
  await setup(page)
  const composer = page.locator('[data-component="prompt-input-v2"]')
  const agents = composer.getByRole("button", { name: "Elegir agente", exact: true })
  await expect(agents).toHaveText("Build")
  await agents.click()
  await expect(page.getByRole("menuitemradio")).toHaveText(["Build", "Plan", "Web App"])
  await page.getByRole("menuitemradio", { name: "Web App", exact: true }).click()
  await expect(agents).toHaveText("Web App")
  const speed = composer.locator('[data-action="toggle-speed-mode-2x"]')
  await expect(speed).toBeEnabled()
  await speed.click()
  await expect(speed).toHaveAttribute("aria-pressed", "true")
  await page.reload()
  await expect(speed).toHaveAttribute("aria-pressed", "true")
  const submitted: { system?: string; variant?: string }[] = []
  await page.route(`**/session/${sessionID}/prompt_async`, async (route) => {
    submitted.push(route.request().postDataJSON())
    await route.fulfill({ status: 204 })
  })
  await composer.getByRole("button", { name: "Elegir variante del modelo" }).click()
  await page.getByRole("menuitemradio", { name: "max", exact: true }).click()
  await composer.getByRole("textbox", { name: "Prompt", exact: true }).fill("Comprueba la función solicitada")
  await composer.getByRole("button", { name: "Enviar", exact: true }).click()
  await expect.poll(() => submitted.length).toBe(1)
  expect(submitted[0]?.system).toContain("[TIANCODE FAST WORKFLOW]")
  expect(submitted[0]?.system).not.toContain("[TIANCODE_NATIVE_FAST]")
  expect(submitted[0]?.variant).toBe("max")
  await speed.click()
  await expect(speed).toHaveAttribute("aria-pressed", "false")
})

test("loads the V1 specialist catalog and preserves it when a refresh fails", async ({ page }, testInfo) => {
  await setup(page)
  await page.keyboard.press("Control+,")
  const dialog = page.locator(".settings-v2-dialog")
  await dialog.getByRole("tab", { name: "Sub-Agentes", exact: true }).click()
  await expect(dialog.getByText("8 sub-agentes nativos", { exact: true })).toBeVisible()
  await expect(dialog.getByText("1 sub-agentes propios", { exact: true })).toBeVisible()
  const search = dialog.getByPlaceholder("Buscar sub-agentes", { exact: true })
  await search.fill("marketing-strategist")
  await expect(dialog.locator(".settings-v2-subagents-row")).toContainText("Marketing")
  await search.fill("")
  await page.route(
    (url) => url.pathname === "/agent",
    (route) => route.fulfill({ status: 503, json: { error: "Unavailable" } }),
  )
  await dialog.getByRole("button", { name: "Global", exact: true }).click()
  await expect(dialog.getByRole("alert")).toContainText("No se pudo cargar")
  await expect(dialog.getByText("8 sub-agentes nativos", { exact: true })).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath("subagents-retained.png") })
})

async function setup(page: Page) {
  await mockTiancodeServer(page, {
    directory,
    project: {
      id: "proj_composer",
      worktree: directory,
      vcs: "git",
      name: "Composer",
      time: { created: 1, updated: 1 },
      sandboxes: [],
    },
    sessions: [
      {
        id: sessionID,
        projectID: "proj_composer",
        directory,
        title: "Composer controls",
        version: "dev",
        time: { created: 1, updated: 1 },
      },
    ],
    provider: {
      all: [
        {
          id: "tiancode",
          name: "Tiancode",
          models: {
            free: {
              id: "free",
              name: "North Mini Code (free)",
              limit: { context: 200_000 },
              variants: { high: {}, max: {} },
            },
          },
        },
      ],
      connected: ["tiancode"],
      default: { providerID: "tiancode", modelID: "free" },
    },
    pageMessages: () => ({ items: [] }),
  })
  await page.route(
    (url) => url.pathname === "/agent",
    (route) => route.fulfill({ json: catalog }),
  )
  await page.route(
    (url) => url.pathname === "/api/agent",
    (route) => route.fulfill({ status: 404, json: {} }),
  )
  await page.route(
    (url) => url.pathname === "/pty/shells",
    (route) => route.fulfill({ json: [] }),
  )
  await page.addInitScript((version) => {
    localStorage.setItem("tiancode.first_launch.completed", version)
    localStorage.setItem("tiancode.global.dat:language", JSON.stringify({ locale: "es" }))
    localStorage.setItem("tiancode-color-scheme", "dark")
      if (!localStorage.getItem("settings.v3"))
        localStorage.setItem("settings.v3", JSON.stringify({ general: { newLayoutDesigns: true } }))
  }, process.env.VITE_TIANCODE_VERSION ?? appPackage.version)
  const server = `http://${process.env.PLAYWRIGHT_SERVER_HOST ?? "127.0.0.1"}:${process.env.PLAYWRIGHT_SERVER_PORT ?? "4096"}`
  await page.goto(`/server/${base64Encode(server)}/session/${sessionID}`)
  await expect(
    page.locator('[data-component="prompt-input-v2"]').getByRole("button", { name: "Modo", exact: true }),
  ).toBeEnabled()
  await page.getByRole("button", { name: "Descartar información sobre las pestañas", exact: true }).click()
  await expect(page.getByRole("heading", { name: "Composer controls", exact: true })).toBeVisible()
}
