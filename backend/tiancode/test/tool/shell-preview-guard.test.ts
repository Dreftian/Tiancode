import { describe, expect, test } from "bun:test"
import { opensLocalPreviewOutsideTiancode } from "../../src/tool/shell/preview-guard"

describe("opensLocalPreviewOutsideTiancode", () => {
  test("blocks common browser launchers for local preview URLs", () => {
    expect(opensLocalPreviewOutsideTiancode("Start-Process http://127.0.0.1:4173")).toBe(true)
    expect(opensLocalPreviewOutsideTiancode('start "" http://localhost:5173')).toBe(true)
    expect(opensLocalPreviewOutsideTiancode("explorer.exe http://localhost:3000")).toBe(true)
    expect(opensLocalPreviewOutsideTiancode("xdg-open http://[::1]:4321")).toBe(true)
  })

  test("keeps local server and ordinary URL commands usable", () => {
    expect(opensLocalPreviewOutsideTiancode("python -m http.server 4173 --bind 127.0.0.1")).toBe(false)
    expect(opensLocalPreviewOutsideTiancode("curl http://127.0.0.1:4173/health")).toBe(false)
    expect(opensLocalPreviewOutsideTiancode("Start-Process https://example.com")).toBe(false)
  })
})
