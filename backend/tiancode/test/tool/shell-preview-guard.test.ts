import { describe, expect, test } from "bun:test"
import { opensLocalPreviewOutsideTiancode } from "../../src/tool/shell/preview-guard"

describe("opensLocalPreviewOutsideTiancode", () => {
  test("blocks common browser launchers for local preview URLs", () => {
    expect(opensLocalPreviewOutsideTiancode("Start-Process http://127.0.0.1:4173")).toBe(true)
    expect(opensLocalPreviewOutsideTiancode('start "" http://localhost:5173')).toBe(true)
    expect(opensLocalPreviewOutsideTiancode("explorer.exe http://localhost:3000")).toBe(true)
    expect(opensLocalPreviewOutsideTiancode("xdg-open http://[::1]:4321")).toBe(true)
  })

  test("blocks local HTML files opened through browser launchers", () => {
    expect(opensLocalPreviewOutsideTiancode("start index.html")).toBe(true)
    expect(opensLocalPreviewOutsideTiancode('Start-Process "index.html"')).toBe(true)
    expect(opensLocalPreviewOutsideTiancode("explorer .\\index.html")).toBe(true)
    expect(opensLocalPreviewOutsideTiancode("Invoke-Item .\\dist\\index.html")).toBe(true)
    expect(opensLocalPreviewOutsideTiancode("open index.html")).toBe(true)
    expect(opensLocalPreviewOutsideTiancode('start "file:///C:/demo/index.html"')).toBe(true)
    expect(opensLocalPreviewOutsideTiancode("explorer.exe C:\\demo\\index.html")).toBe(true)
  })

  test("blocks dev server scripts that auto-open the desktop browser", () => {
    expect(opensLocalPreviewOutsideTiancode("npm run dev -- --open")).toBe(true)
    expect(opensLocalPreviewOutsideTiancode("npx vite --open")).toBe(true)
    expect(opensLocalPreviewOutsideTiancode("bun run dev --open=http://localhost:5173")).toBe(true)
    expect(opensLocalPreviewOutsideTiancode("yarn start --open")).toBe(true)
  })

  test("keeps local server and ordinary URL commands usable", () => {
    expect(opensLocalPreviewOutsideTiancode("python -m http.server 4173 --bind 127.0.0.1")).toBe(false)
    expect(opensLocalPreviewOutsideTiancode("curl http://127.0.0.1:4173/health")).toBe(false)
    expect(opensLocalPreviewOutsideTiancode("Start-Process https://example.com")).toBe(false)
    expect(opensLocalPreviewOutsideTiancode("npm run dev")).toBe(false)
    expect(opensLocalPreviewOutsideTiancode("npx vite")).toBe(false)
    expect(opensLocalPreviewOutsideTiancode("npx vite build")).toBe(false)
    expect(opensLocalPreviewOutsideTiancode("npm test --coverage --openHandles")).toBe(false)
    expect(opensLocalPreviewOutsideTiancode("explorer .")).toBe(false)
    expect(opensLocalPreviewOutsideTiancode("Get-Content index.html")).toBe(false)
    expect(opensLocalPreviewOutsideTiancode("code index.html")).toBe(false)
  })
})
