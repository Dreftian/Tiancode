import { describe, expect, test } from "bun:test"
import path from "node:path"
import { pathToFileURL } from "node:url"
import { startBareJsxPreview, startStaticPreview } from "../../src/preview/bare-jsx-preview"
import { getPreviewState, startPreviewServer, stopPreviewServer } from "../../src/preview/dev-server-manager"
import { tmpdir } from "../fixture/fixture"

describe("bare JSX preview", () => {
  async function waitForState(directory: string, status: "ready" | "starting", timeout = 5_000) {
    const deadline = Date.now() + timeout
    while (Date.now() < deadline) {
      const state = getPreviewState(directory)
      if (state.status === status) return state
      await Bun.sleep(25)
    }
    throw new Error(`La vista previa no llegÃ³ al estado ${status}.`)
  }

  test("serves local JSX modules without exposing hidden project files", async () => {
    await using tmp = await tmpdir()
    await Bun.write(
      path.join(tmp.path, "App.jsx"),
      [
        'import { useState } from "react"',
        'import Title from "./Title"',
        'import "./style.css"',
        'import dateFns from "date-fns"',
        "export default function App() {",
        "  const [count, setCount] = useState(0)",
        "  return <button onClick={() => setCount(count + 1)}><Title /> {count} {String(dateFns)}</button>",
        "}",
      ].join("\n"),
    )
    await Bun.write(path.join(tmp.path, "Title.jsx"), 'export default function Title() { return <strong>Hola</strong> }')
    await Bun.write(path.join(tmp.path, "style.css"), "button { color: rebeccapurple; }")
    await Bun.write(path.join(tmp.path, ".env"), "SECRET=do-not-serve")

    const preview = await startBareJsxPreview(tmp.path, "App.jsx", 0)
    try {
      const shell = await (await fetch(preview.url)).text()
      const module = await (await fetch(`${preview.url}/App.jsx`)).text()
      const hidden = await fetch(`${preview.url}/.env`)
      const unsupported = await (await fetch(`${preview.url}/__tiancode__/unsupported?specifier=date-fns`)).text()

      expect(shell).toContain("/__tiancode__/boot")
      expect(shell).toContain('/__tiancode__/reload')
      expect(module).toContain('from "/__tiancode__/react"')
      expect(module).toContain('from "/__tiancode__/react-jsx-runtime"')
      expect(module).toContain('from "/Title.jsx"')
      expect(module).toContain('/__tiancode__/style?path=')
      expect(module).toContain('/__tiancode__/unsupported?specifier=date-fns')
      expect(hidden.status).toBe(404)
      expect(unsupported).toContain("package.json")
    } finally {
      await new Promise<void>((resolveClose) => {
        preview.server.once("close", resolveClose)
        preview.close()
      })
    }
  })

  test("serves static HTML with an internal reload client", async () => {
    await using tmp = await tmpdir()
    await Bun.write(path.join(tmp.path, "index.html"), "<html><body><main>v1</main></body></html>")
    await Bun.write(path.join(tmp.path, ".env"), "SECRET=do-not-serve")

    const preview = await startStaticPreview(tmp.path, 0)
    try {
      const page = await (await fetch(preview.url)).text()
      const before = (await (await fetch(`${preview.url}/__tiancode__/revision`)).json()) as { revision: string }
      const hidden = await fetch(`${preview.url}/.env`)
      await Bun.write(path.join(tmp.path, "index.html"), "<html><body><main>version two</main></body></html>")
      const after = (await (await fetch(`${preview.url}/__tiancode__/revision`)).json()) as { revision: string }

      expect(page).toContain('/__tiancode__/reload')
      expect(before.revision).not.toBe(after.revision)
      expect(hidden.status).toBe(404)
    } finally {
      await new Promise<void>((resolveClose) => {
        preview.server.once("close", resolveClose)
        preview.close()
      })
    }
  })

  test("uses the local JSX server through the preview manager", async () => {
    await using tmp = await tmpdir()
    await Bun.write(path.join(tmp.path, "App.tsx"), "export default function App() { return <main>Vista previa</main> }")

    const state = await startPreviewServer(tmp.path)
    try {
      expect(state).toMatchObject({
        status: "ready",
        framework: "jsx",
        packageManager: "bare-jsx",
        command: "Tiancode JSX preview",
      })
      expect(state.url).toStartWith("http://127.0.0.1:")
      expect((await fetch(state.url!)).status).toBe(200)
    } finally {
      expect(stopPreviewServer(tmp.path).status).toBe("stopped")
    }
  })

  test("uses the reloadable static server through the preview manager", async () => {
    await using tmp = await tmpdir()
    await Bun.write(path.join(tmp.path, "index.html"), "<main>Vista estatica</main>")

    const state = await startPreviewServer(tmp.path)
    try {
      expect(state).toMatchObject({
        status: "ready",
        framework: "html",
        packageManager: "static",
        command: "Tiancode static preview",
      })
      expect(await (await fetch(state.url!)).text()).toContain('/__tiancode__/reload')
    } finally {
      expect(stopPreviewServer(tmp.path).status).toBe("stopped")
    }
  })

  test("runs a React Babel HTML shell from the managed JSX runtime", async () => {
    await using tmp = await tmpdir()
    await Bun.write(
      path.join(tmp.path, "index.html"),
      [
        '<div id="root"></div>',
        '<link rel="stylesheet" href="styles.css">',
        '<script src="https://unpkg.com/react@18/umd/react.production.min.js"></script>',
        '<script src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js"></script>',
        '<script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>',
        '<script type="text/babel" data-presets="react" src="app.jsx"></script>',
      ].join("\n"),
    )
    await Bun.write(path.join(tmp.path, "app.jsx"), "ReactDOM.createRoot(document.getElementById('root')).render(<main>CRM</main>)")
    await Bun.write(path.join(tmp.path, "styles.css"), "main { color: rebeccapurple; }")

    const state = await startPreviewServer(tmp.path)
    try {
      expect(state).toMatchObject({ status: "ready", framework: "jsx", packageManager: "bare-jsx" })
      const page = await (await fetch(state.url!)).text()
      const runtime = await (await fetch(`${state.url}/__tiancode__/runtime`)).text()
      const stylesheet = await fetch(`${state.url}/styles.css`)
      expect(page).toContain('href="/styles.css"')
      expect(runtime).toContain("globalThis.React = React")
      expect(runtime).toContain("globalThis.ReactDOM = ReactDOM")
      expect(stylesheet.headers.get("content-type")).toContain("text/css")
    } finally {
      expect(stopPreviewServer(tmp.path).status).toBe("stopped")
    }
  })

  test("renders React.createContext projects generated with the Babel CDN style", async () => {
    await using tmp = await tmpdir()
    await Bun.write(
      path.join(tmp.path, "App.jsx"),
      [
        "const { useState, useEffect, useMemo, useContext } = React",
        "const LangContext = React.createContext(null)",
        "function LangProvider({ children }) {",
        '  const [lang] = useState("es")',
        "  useEffect(() => { document.documentElement.lang = lang }, [lang])",
        "  const value = useMemo(() => ({ lang }), [lang])",
        "  return <LangContext.Provider value={value}>{children}</LangContext.Provider>",
        "}",
        "function Label() { return <main>{useContext(LangContext).lang}</main> }",
        "ReactDOM.createRoot(document.getElementById('root')).render(<LangProvider><Label /></LangProvider>)",
      ].join("\n"),
    )

    const preview = await startBareJsxPreview(tmp.path, "App.jsx", 0)
    try {
      const runtime = await (await fetch(`${preview.url}/__tiancode__/runtime`)).text()
      const runtimePath = path.join(tmp.path, "runtime.mjs")
      const entryPath = path.join(tmp.path, "entry.mjs")
      const fixturePath = path.join(tmp.path, "context-smoke.mjs")
      await Bun.write(runtimePath, runtime)
      await Bun.write(
        entryPath,
        (await (await fetch(`${preview.url}/App.jsx`)).text()).replaceAll(
          '"/__tiancode__/react-jsx-runtime"',
          JSON.stringify(pathToFileURL(runtimePath).href),
        ),
      )
      await Bun.write(
        fixturePath,
        [
          'import { pathToFileURL } from "node:url"',
          "const createNode = (text = \"\") => ({",
          "  childNodes: [], style: {}, text,",
          "  append(...nodes) { this.childNodes.push(...nodes) },",
          "  replaceChildren(...nodes) { this.childNodes = []; this.append(...nodes) },",
          "  setAttribute() {}, addEventListener() {},",
          "  get textContent() { return this.text || this.childNodes.map((node) => node.textContent).join(\"\") },",
          "  set textContent(value) { this.text = String(value); this.childNodes = [] },",
          "})",
          "const root = createNode()",
          "globalThis.document = {",
          "  createComment: () => createNode(), createTextNode: (text) => createNode(String(text)),",
          "  createDocumentFragment: () => createNode(), createElement: () => createNode(), createElementNS: () => createNode(),",
          "  documentElement: { lang: \"\" }, getElementById: () => root,",
          "}",
          "await import(pathToFileURL(process.argv.at(-1)).href)",
          "if (root.textContent !== \"es\") throw new Error(`Provider did not supply context: ${root.textContent}`)",
          "if (document.documentElement.lang !== \"es\") throw new Error(`Effect did not receive context state: ${document.documentElement.lang}`)",
          'console.log("context-rendered")',
        ].join("\n"),
      )

      const subprocess = Bun.spawn([process.execPath, fixturePath, entryPath], { stdout: "pipe", stderr: "pipe" })
      expect(await subprocess.exited).toBe(0)
      expect(await new Response(subprocess.stdout).text()).toContain("context-rendered")
      expect(await new Response(subprocess.stderr).text()).toBe("")
    } finally {
      await new Promise<void>((resolveClose) => {
        preview.server.once("close", resolveClose)
        preview.close()
      })
    }
  })

  test("runs an explicit local preview adapter", async () => {
    await using tmp = await tmpdir()
    const probe = Bun.serve({ port: 0, fetch: () => new Response("probe") })
    const port = probe.port
    probe.stop(true)
    await Bun.write(
      path.join(tmp.path, "tiancode.preview.json"),
      JSON.stringify({ command: [process.execPath, "server.js"], url: `http://127.0.0.1:${port}` }),
    )
    await Bun.write(
      path.join(tmp.path, "server.js"),
      [
        'const { createServer } = require("node:http")',
        `createServer((_request, response) => response.end("adapter")).listen(${port}, "127.0.0.1")`,
      ].join("\n"),
    )

    await startPreviewServer(tmp.path)
    try {
      const state = await waitForState(tmp.path, "ready")
      expect(state).toMatchObject({ status: "ready", framework: "custom", packageManager: "custom" })
      expect((await fetch(state.url!)).status).toBe(200)
    } finally {
      expect(stopPreviewServer(tmp.path).status).toBe("stopped")
    }
  })

  test("does not publish a script preview until it answers HTTP", async () => {
    await using tmp = await tmpdir()
    const probe = Bun.serve({ port: 0, fetch: () => new Response("probe") })
    const port = probe.port
    probe.stop(true)
    const marker = path.join(tmp.path, "listening")
    await Bun.write(path.join(tmp.path, "package.json"), JSON.stringify({ scripts: { dev: "node server.js" } }))
    await Bun.write(
      path.join(tmp.path, "server.js"),
      [
        'const fs = require("node:fs")',
        'const { createServer } = require("node:http")',
        "let ready = false",
        "const server = createServer((_request, response) => {",
        "  response.statusCode = ready ? 200 : 503",
        '  response.end(ready ? "OK" : "starting")',
        "})",
        `server.listen(${port}, "127.0.0.1", () => {`,
        `  fs.writeFileSync(${JSON.stringify(marker)}, "listening")`,
        `  console.log("Local: http://localhost:${port}")`,
        "  setTimeout(() => { ready = true }, 600)",
        "})",
      ].join("\n"),
    )

    const initial = await startPreviewServer(tmp.path)
    try {
      expect(initial.status).toBe("starting")
      const markerDeadline = Date.now() + 5_000
      while (!(await Bun.file(marker).exists()) && Date.now() < markerDeadline) await Bun.sleep(25)
      expect(await Bun.file(marker).exists()).toBe(true)
      expect(getPreviewState(tmp.path).status).toBe("starting")
      const ready = await waitForState(tmp.path, "ready")
      expect(ready.url).toBe(`http://localhost:${port}`)
      expect((await fetch(ready.url!)).status).toBe(200)
    } finally {
      expect(stopPreviewServer(tmp.path).status).toBe("stopped")
    }
  })
})
