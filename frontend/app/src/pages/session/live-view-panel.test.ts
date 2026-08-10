import { describe, expect, test } from "bun:test"
import { findDevServerUrl, resolveReportedUrl, serverTargetOf, type SnapshotPayload } from "./live-view-panel"

describe("resolveReportedUrl", () => {
  test("usa la URL fijada por el agente (set_preview)", () => {
    expect(resolveReportedUrl({ preview_url: "http://localhost:5173" })).toBe("http://localhost:5173")
  })

  test("deriva el preview local del servidor (preview_default)", () => {
    expect(resolveReportedUrl({ preview_default: "index.html" })).toBe("http://127.0.0.1:8790/index.html")
    expect(resolveReportedUrl({ preview_default: "/index.html" })).toBe("http://127.0.0.1:8790/index.html")
  })

  test("sin sesión no hay URL reportada", () => {
    expect(resolveReportedUrl(undefined)).toBeUndefined()
    expect(resolveReportedUrl({})).toBeUndefined()
  })
})

describe("findDevServerUrl", () => {
  test("detecta el primer servidor de desarrollo local en los logs", () => {
    const snapshot: SnapshotPayload = {
      logs: [{ line: "> vite@5.0.0 dev" }, { line: "  Local: http://localhost:5173/" }],
    }
    expect(findDevServerUrl(snapshot)).toBe("http://localhost:5173")
  })

  test("quita la barra final de la URL detectada", () => {
    expect(findDevServerUrl({ logs: [{ line: "Local: http://127.0.0.1:3000/" }] })).toBe("http://127.0.0.1:3000")
  })

  test("sin dev server en los logs no detecta nada", () => {
    expect(findDevServerUrl({ logs: [{ line: "ready in 300ms" }] })).toBeUndefined()
  })
})

describe("serverTargetOf", () => {
  test("la URL del agente gana sobre el dev server detectado", () => {
    const snapshot: SnapshotPayload = {
      preview_url: "http://localhost:5173",
      logs: [{ line: "Local: http://127.0.0.1:8080/" }],
    }
    expect(serverTargetOf(snapshot)).toBe("http://localhost:5173")
  })

  test("cae al dev server detectado si no hay URL reportada", () => {
    expect(serverTargetOf({ logs: [{ line: "Local: http://localhost:5173/" }] })).toBe("http://localhost:5173")
  })

  test("sin URL ni logs no hay destino", () => {
    expect(serverTargetOf(undefined)).toBeUndefined()
  })
})
