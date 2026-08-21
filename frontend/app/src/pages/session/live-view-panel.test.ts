import { describe, expect, test } from "bun:test"
import {
  applyLiveSnapshotUpdate,
  embeddedPreviewTarget,
  filterPreviewFiles,
  filterPreviewFilesByScope,
  findDevServerUrl,
  liveViewContentForTab,
  managedUrlForDirectory,
  mergePreviewWorkspaceFiles,
  mergeLiveSnapshot,
  preferredPreviewCodePath,
  previewFileTree,
  previewAutoStartKey,
  resolveReportedUrl,
  serverTargetOf,
  shouldScanPreviewWorkspaceDirectory,
  type SnapshotPayload,
} from "./live-view-panel"

describe("liveViewContentForTab", () => {
  test("muestra Preview y Código como modos completos mutuamente excluyentes", () => {
    expect(liveViewContentForTab("preview")).toBe("preview")
    expect(liveViewContentForTab("code")).toBe("code")
  })
})

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

describe("previewAutoStartKey", () => {
  test("detects generated HTML and JSX entries", () => {
    expect(
      previewAutoStartKey({
        files: [
          { rel: "src/App.tsx", mtime: 10, size: 40 },
          { rel: "README.md", mtime: 11, size: 20 },
          { rel: "index.html", mtime: 12, size: 30 },
        ],
      }),
    ).toBe("index.html:12:30|src/App.tsx:10:40")
  })

  test("uses current source content when the watcher has not published the tree yet", () => {
    const initial = previewAutoStartKey({ current_file: "src/main.jsx", current_code: "export default null" })
    expect(initial).toStartWith("src/main.jsx:")
    expect(previewAutoStartKey({ current_file: "src/main.jsx", current_code: "export default <main />" })).not.toBe(initial)
  })

  test("does not start a preview for unrelated files", () => {
    expect(previewAutoStartKey({ files: [{ rel: "notes.txt", mtime: 2 }] })).toBeUndefined()
  })
})

describe("managedUrlForDirectory", () => {
  test("never carries a managed runtime into another workspace", () => {
    expect(managedUrlForDirectory({ directory: "C:\\one", url: "http://127.0.0.1:5173" }, "C:\\one")).toBe(
      "http://127.0.0.1:5173",
    )
    expect(managedUrlForDirectory({ directory: "C:\\one", url: "http://127.0.0.1:5173" }, "C:\\two")).toBeUndefined()
  })
})

describe("embeddedPreviewTarget", () => {
  test("waits for the managed runtime instead of navigating dashboard file preview", () => {
    expect(
      embeddedPreviewTarget(undefined, "C:\\crm", {
        preview_default: "preview/",
        files: [{ rel: "index.html", size: 10, mtime: 1 }, { rel: "app.jsx", size: 20, mtime: 2 }],
      }),
    ).toBeUndefined()
  })

  test("uses the confirmed managed URL and explicit set_preview URL", () => {
    expect(
      embeddedPreviewTarget({ directory: "C:\\crm", url: "http://127.0.0.1:4174" }, "C:\\crm", {
        preview_default: "preview/",
      }),
    ).toBe("http://127.0.0.1:4174")
    expect(
      embeddedPreviewTarget(undefined, "C:\\crm", {
        preview_url: "http://127.0.0.1:5173",
        files: [{ rel: "index.html", size: 10, mtime: 1 }],
      }),
    ).toBe("http://127.0.0.1:5173")
  })
})

describe("filterPreviewFiles", () => {
  const files = ["src/App.tsx", "src/components/Button.tsx", "README.md"]

  test("returns all paths for an empty search", () => {
    expect(filterPreviewFiles(files, "  ")).toEqual(files)
  })

  test("matches paths without case sensitivity", () => {
    expect(filterPreviewFiles(files, "BUTTON")).toEqual(["src/components/Button.tsx"])
  })

  test("returns no paths when nothing matches", () => {
    expect(filterPreviewFiles(files, "server")).toEqual([])
  })
})

describe("preview code tree filters", () => {
  const files = ["src/App.tsx", "src/components/Button.tsx", "server/routes/users.ts", "backend/db/schema.sql", "README.md"]

  test("separa frontend y backend sin ocultar archivos en Todos", () => {
    expect(filterPreviewFilesByScope(files, "frontend")).toEqual(["src/App.tsx", "src/components/Button.tsx"])
    expect(filterPreviewFilesByScope(files, "backend")).toEqual(["server/routes/users.ts", "backend/db/schema.sql"])
    expect(filterPreviewFilesByScope(files, "all")).toEqual(files)
  })

  test("construye un árbol jerárquico estable para el navegador de Código", () => {
    expect(previewFileTree(["src/components/Button.tsx", "src/App.tsx", "README.md"])).toEqual([
      { name: "README.md", path: "README.md", children: [] },
      {
        name: "src",
        children: [
          { name: "App.tsx", path: "src/App.tsx", children: [] },
          { name: "components", children: [{ name: "Button.tsx", path: "src/components/Button.tsx", children: [] }] },
        ],
      },
    ])
  })
})

describe("preferredPreviewCodePath", () => {
  test("elige la entrada HTML antes de dejar el panel vacio", () => {
    expect(preferredPreviewCodePath(["styles.css", "src/App.jsx", "index.html"])).toBe("index.html")
  })

  test("prefiere App y main cuando el proyecto no tiene index.html", () => {
    expect(preferredPreviewCodePath(["README.md", "src/main.tsx", "src/App.tsx"])).toBe("src/App.tsx")
    expect(preferredPreviewCodePath(["README.md", "src/main.tsx"])).toBe("src/main.tsx")
  })

  test("usa el primer archivo disponible como ultimo recurso", () => {
    expect(preferredPreviewCodePath(["z-notes.txt", "a-config.json"])).toBe("a-config.json")
    expect(preferredPreviewCodePath([])).toBeUndefined()
  })
})

describe("workspace Code fallback", () => {
  test("mezcla los archivos del snapshot con el workspace sin duplicarlos", () => {
    expect(mergePreviewWorkspaceFiles(["src/App.tsx", "index.html"], ["index.html", "styles.css"])).toEqual([
      "index.html",
      "src/App.tsx",
      "styles.css",
    ])
  })

  test("omite directorios de dependencias y artefactos al explorar el workspace", () => {
    expect(shouldScanPreviewWorkspaceDirectory("src/components")).toBe(true)
    expect(shouldScanPreviewWorkspaceDirectory("node_modules/react")).toBe(false)
    expect(shouldScanPreviewWorkspaceDirectory(".git/objects")).toBe(false)
    expect(shouldScanPreviewWorkspaceDirectory("dist/assets")).toBe(false)
  })
})

describe("applyLiveSnapshotUpdate", () => {
  const snapshot: SnapshotPayload = {
    session_id: "session-a",
    updated_at: 1,
    files: [{ rel: "src/App.tsx", kind: "file" }],
    logs: [],
  }

  test("aplica enseguida el archivo y código que reporta el agente", () => {
    expect(
      applyLiveSnapshotUpdate(snapshot, {
        type: "current_file",
        session_id: "session-a",
        ts: 2,
        data: { rel: "src/App.tsx", code: "export default () => <main />" },
      }),
    ).toMatchObject({
      current_file: "src/App.tsx",
      current_code: "export default () => <main />",
      updated_at: 2,
    })
  })

  test("actualiza archivos y logs sin esperar el siguiente snapshot", () => {
    const withFile = applyLiveSnapshotUpdate(snapshot, {
      type: "file_added",
      session_id: "session-a",
      data: { rel: "src/Button.tsx", kind: "file", size: 42, mtime: 10 },
    })
    const withLog = applyLiveSnapshotUpdate(withFile, {
      type: "log",
      session_id: "session-a",
      data: { line: "Local: http://localhost:5173/" },
    })
    expect(withLog?.files).toEqual([
      { rel: "src/App.tsx", kind: "file" },
      { rel: "src/Button.tsx", kind: "file", size: 42, mtime: 10 },
    ])
    expect(withLog?.logs).toEqual([{ line: "Local: http://localhost:5173/" }])
  })

  test("ignora eventos de otra sesión", () => {
    expect(
      applyLiveSnapshotUpdate(snapshot, {
        type: "preview",
        session_id: "session-b",
        data: { url: "http://localhost:5173" },
      }),
    ).toBe(snapshot)
  })
})

describe("mergeLiveSnapshot", () => {
  test("no deja que un poll anterior pise un evento SSE más nuevo", () => {
    const current: SnapshotPayload = { session_id: "session-a", updated_at: 4, current_file: "src/new.tsx" }
    const stale: SnapshotPayload = { session_id: "session-a", updated_at: 3, current_file: "src/old.tsx" }
    expect(mergeLiveSnapshot(current, stale)).toBe(current)
  })

  test("conserva el estado SSE cuando un poll atrasado aún no ve una sesión", () => {
    const current: SnapshotPayload = { session_id: "session-a", updated_at: 4, current_file: "src/new.tsx" }
    expect(mergeLiveSnapshot(current, undefined)).toBe(current)
  })
})
