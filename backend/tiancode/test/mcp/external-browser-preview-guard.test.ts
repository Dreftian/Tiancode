import { expect, test } from "bun:test"
import { McpCatalog, blocksExternalPreviewNavigation } from "../../src/mcp/catalog"

test("blocks Chrome DevTools navigation to local previews", () => {
  expect(blocksExternalPreviewNavigation("chrome-devtools_new_page", { url: "http://127.0.0.1:4173" })).toBe(true)
  expect(blocksExternalPreviewNavigation("chrome_devtools_navigate_page", { url: "http://localhost:5173/crm" })).toBe(true)
  expect(blocksExternalPreviewNavigation("chrome-devtools_new_page", { url: "file:///C:/demo/index.html" })).toBe(true)
})

test("blocks Playwright navigation to local previews", () => {
  expect(blocksExternalPreviewNavigation("playwright_browser_navigate", { url: "http://[::1]:3000" })).toBe(true)
  expect(blocksExternalPreviewNavigation("playwright_open", { target: { url: "http://0.0.0.0:4173" } })).toBe(true)
})

test("keeps non-navigation and non-local browser workflows available", () => {
  expect(blocksExternalPreviewNavigation("chrome-devtools_new_page", { url: "https://example.com" })).toBe(false)
  expect(blocksExternalPreviewNavigation("chrome-devtools_take_snapshot", { url: "http://localhost:4173" })).toBe(false)
  expect(blocksExternalPreviewNavigation("custom_browser_navigate", { url: "http://localhost:4173" })).toBe(false)
})

test("rejects before an external MCP browser is invoked", async () => {
  let calls = 0
  const tool = McpCatalog.convertTool(
    {
      name: "new_page",
      inputSchema: { type: "object", properties: { url: { type: "string" } } },
    } as never,
    {
      callTool: async () => {
        calls += 1
        return { content: [] }
      },
    } as never,
    undefined,
    "chrome-devtools_new_page",
  )

  await expect(
    tool.execute?.({ url: "http://localhost:4173" }, { abortSignal: new AbortController().signal } as never),
  ).rejects.toThrow("navegacion de una vista previa local")
  expect(calls).toBe(0)
})
