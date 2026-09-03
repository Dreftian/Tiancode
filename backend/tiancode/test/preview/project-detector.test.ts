import { describe, expect, test } from "bun:test"
import { mkdir } from "node:fs/promises"
import path from "node:path"
import { tmpdir } from "../fixture/fixture"
import { detectProject } from "../../src/preview/project-detector"

describe("detectProject", () => {
  test("finds a Vite JSX development script", async () => {
    await using tmp = await tmpdir()
    await Bun.write(
      path.join(tmp.path, "package.json"),
      JSON.stringify({ devDependencies: { vite: "latest", react: "latest" }, scripts: { dev: "vite" } }),
    )
    await Bun.write(path.join(tmp.path, "bun.lock"), "")

    expect(await detectProject(tmp.path)).toEqual({ framework: "vite", packageManager: "bun", script: "dev", port: 5173 })
  })

  test("uses a React start script when dev is absent", async () => {
    await using tmp = await tmpdir()
    await Bun.write(
      path.join(tmp.path, "package.json"),
      JSON.stringify({ dependencies: { react: "latest" }, scripts: { start: "react-scripts start" } }),
    )

    expect(await detectProject(tmp.path)).toEqual({ framework: "react", packageManager: "npm", script: "start", port: 3000 })
  })

  test("serves an HTML-only project even if it has package metadata", async () => {
    await using tmp = await tmpdir()
    await Bun.write(path.join(tmp.path, "package.json"), JSON.stringify({ name: "site" }))
    await Bun.write(path.join(tmp.path, "index.html"), "<main>site</main>")

    expect(await detectProject(tmp.path)).toEqual({ framework: "html", packageManager: "static", script: "", port: 4173 })
  })

  test("runs a conventional bare JSX entry without creating package files", async () => {
    await using tmp = await tmpdir()
    await mkdir(path.join(tmp.path, "src"))
    await Bun.write(path.join(tmp.path, "src", "App.jsx"), "export default function App() { return <main /> }")

    expect(await detectProject(tmp.path)).toEqual({
      framework: "jsx",
      packageManager: "bare-jsx",
      script: "",
      port: 4173,
      entry: "src/App.jsx",
    })
  })

  test("uses the JSX entry declared by a static HTML shell", async () => {
    await using tmp = await tmpdir()
    await Bun.write(path.join(tmp.path, "index.html"), '<script type="module" src="./landing.jsx"></script>')
    await Bun.write(path.join(tmp.path, "landing.jsx"), "export default function Landing() { return <main /> }")

    expect(await detectProject(tmp.path)).toEqual({
      framework: "jsx",
      packageManager: "bare-jsx",
      script: "",
      port: 4173,
      entry: "landing.jsx",
    })
  })

  test("detects a Babel CDN JSX shell as a no-build JSX preview", async () => {
    await using tmp = await tmpdir()
    await Bun.write(
      path.join(tmp.path, "index.html"),
      [
        '<div id="root"></div>',
        '<script src="https://unpkg.com/react@18/umd/react.production.min.js"></script>',
        '<script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>',
        '<script type="text/babel" data-presets="react" src="app.jsx"></script>',
      ].join("\n"),
    )
    await Bun.write(path.join(tmp.path, "app.jsx"), "ReactDOM.createRoot(document.getElementById('root')).render(<main>CRM</main>)")

    expect(await detectProject(tmp.path)).toEqual({
      framework: "jsx",
      packageManager: "bare-jsx",
      script: "",
      port: 4173,
      entry: "app.jsx",
    })
  })

  test("keeps a declared development script ahead of the bare JSX fallback", async () => {
    await using tmp = await tmpdir()
    await Bun.write(
      path.join(tmp.path, "package.json"),
      JSON.stringify({ devDependencies: { vite: "latest", react: "latest" }, scripts: { dev: "vite" } }),
    )
    await Bun.write(path.join(tmp.path, "App.jsx"), "export default function App() { return <main /> }")

    expect(await detectProject(tmp.path)).toEqual({ framework: "vite", packageManager: "npm", script: "dev", port: 5173 })
  })

  test("prioritizes a local explicit runtime adapter", async () => {
    await using tmp = await tmpdir()
    await Bun.write(
      path.join(tmp.path, "tiancode.preview.json"),
      JSON.stringify({
        framework: "python",
        command: ["py", "-3", "-m", "http.server", "8910"],
        url: "http://127.0.0.1:8910/app/",
        workingDirectory: ".",
      }),
    )
    await Bun.write(path.join(tmp.path, "package.json"), JSON.stringify({ scripts: { dev: "vite" } }))

    expect(await detectProject(tmp.path)).toEqual({
      framework: "python",
      packageManager: "custom",
      script: "",
      port: 8910,
      command: ["py", "-3", "-m", "http.server", "8910"],
      url: "http://127.0.0.1:8910/app/",
      workingDirectory: ".",
    })
  })

  test("rejects a configured preview outside the local machine", async () => {
    await using tmp = await tmpdir()
    await Bun.write(
      path.join(tmp.path, "tiancode.preview.json"),
      JSON.stringify({ command: ["python", "app.py"], url: "https://example.com" }),
    )

    expect(await detectProject(tmp.path)).toEqual({
      framework: "custom",
      packageManager: "custom",
      script: "",
      port: 0,
      error: "tiancode.preview.json.url debe usar http(s) en localhost, 127.0.0.1 o ::1.",
    })
  })

  test("does not invent a dev command for a JSX project", async () => {
    await using tmp = await tmpdir()
    await Bun.write(path.join(tmp.path, "package.json"), JSON.stringify({ dependencies: { react: "latest" } }))

    expect(await detectProject(tmp.path)).toBeNull()
  })

  test("prioritizes web dev script when dev script contains desktop runners", async () => {
    await using tmp = await tmpdir()
    await Bun.write(
      path.join(tmp.path, "package.json"),
      JSON.stringify({
        dependencies: { react: "latest" },
        devDependencies: { vite: "latest" },
        scripts: {
          dev: 'concurrently -k "npm:dev:vite" "npm:dev:electron"',
          "dev:vite": "vite",
          "dev:electron": "wait-on tcp:5173 && electron .",
        },
      }),
    )

    expect(await detectProject(tmp.path)).toEqual({
      framework: "vite",
      packageManager: "npm",
      script: "dev:vite",
      port: 5173,
    })
  })

  test("detects project inside subdirectories like Dios or frontend", async () => {
    await using tmp = await tmpdir()
    const subDir = path.join(tmp.path, "Dios")
    await Bun.write(
      path.join(subDir, "package.json"),
      JSON.stringify({
        dependencies: { react: "^19.0.0" },
        devDependencies: { vite: "^6.0.0" },
        scripts: {
          dev: "vite",
        },
      }),
    )

    expect(await detectProject(tmp.path)).toEqual({
      framework: "vite",
      packageManager: "npm",
      script: "dev",
      port: 5173,
      workingDirectory: "Dios",
    })
  })

  test("detects static site inside subfolder", async () => {
    await using tmp = await tmpdir()
    const subDir = path.join(tmp.path, "site")
    await Bun.write(path.join(subDir, "index.html"), "<!doctype html><html><body><h1>Hello</h1></body></html>")

    expect(await detectProject(tmp.path)).toEqual({
      framework: "html",
      packageManager: "static",
      script: "",
      port: 4173,
      workingDirectory: "site",
    })
  })
})
