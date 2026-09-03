import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http"
import { existsSync, watch, type FSWatcher } from "node:fs"
import { readFile, readdir, stat } from "node:fs/promises"
import { dirname, extname, isAbsolute, join, relative, resolve, sep } from "node:path"
import {
  DiagnosticCategory,
  JsxEmit,
  ModuleKind,
  ScriptTarget,
  flattenDiagnosticMessageText,
  transpileModule,
} from "typescript"

const SCRIPT_EXTENSIONS = new Set([".js", ".jsx", ".mjs", ".ts", ".tsx"])
const ASSET_EXTENSIONS = new Set([".avif", ".gif", ".ico", ".jpeg", ".jpg", ".png", ".svg", ".webp", ".woff", ".woff2"])
const STYLE_EXTENSIONS = new Set([".css"])
const MODULE_EXTENSIONS = ["", ".tsx", ".jsx", ".ts", ".js", ".mjs", ".css", ".json", ".svg", ".png", ".jpg", ".jpeg", ".gif", ".webp"]

export type BareJsxPreview = {
  server: Server
  url: string
  close(): void
}

export type StaticPreview = BareJsxPreview

function setupWatcher(directory: string, sseClients: Set<ServerResponse>): FSWatcher | null {
  try {
    let timer: ReturnType<typeof setTimeout> | undefined
    return watch(directory, { recursive: true }, (_event, filename) => {
      if (filename && (filename.includes("node_modules") || filename.startsWith("."))) return
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => {
        const payload = `data: ${JSON.stringify({ type: "reload", ts: Date.now() })}\n\n`
        for (const client of sseClients) {
          try {
            client.write(payload)
          } catch {
            sseClients.delete(client)
          }
        }
      }, 25)
    })
  } catch {
    return null
  }
}

export async function startBareJsxPreview(directory: string, entry: string, port: number): Promise<BareJsxPreview> {
  const styles = await linkedStyles(directory)
  const sseClients = new Set<ServerResponse>()
  const watcher = setupWatcher(directory, sseClients)

  const server = createServer((request, response) => {
    void handleRequest(directory, entry, styles, request, response, sseClients)
  })

  await new Promise<void>((resolveListen, rejectListen) => {
    const onError = (error: Error) => {
      server.off("listening", onListen)
      rejectListen(error)
    }
    const onListen = () => {
      server.off("error", onError)
      resolveListen()
    }
    server.once("error", onError)
    server.once("listening", onListen)
    server.listen(port, "127.0.0.1")
  })

  const address = server.address()
  if (!address || typeof address === "string") {
    server.close()
    watcher?.close()
    throw new Error("La vista previa JSX no devolvió un puerto local.")
  }

  return {
    server,
    url: `http://127.0.0.1:${address.port}`,
    close: () => {
      watcher?.close()
      for (const client of sseClients) {
        try { client.end() } catch {}
      }
      sseClients.clear()
      if (server.listening) server.close()
    },
  }
}

export async function startStaticPreview(directory: string, port: number): Promise<StaticPreview> {
  const sseClients = new Set<ServerResponse>()
  const watcher = setupWatcher(directory, sseClients)

  const server = createServer((request, response) => {
    void handleStaticRequest(directory, request, response, sseClients)
  })

  await new Promise<void>((resolveListen, rejectListen) => {
    const onError = (error: Error) => {
      server.off("listening", onListen)
      rejectListen(error)
    }
    const onListen = () => {
      server.off("error", onError)
      resolveListen()
    }
    server.once("error", onError)
    server.once("listening", onListen)
    server.listen(port, "127.0.0.1")
  })

  const address = server.address()
  if (!address || typeof address === "string") {
    server.close()
    watcher?.close()
    throw new Error("La vista previa estatica no devolvio un puerto local.")
  }

  return {
    server,
    url: `http://127.0.0.1:${address.port}`,
    close: () => {
      watcher?.close()
      for (const client of sseClients) {
        try { client.end() } catch {}
      }
      sseClients.clear()
      if (server.listening) server.close()
    },
  }
}

async function handleRequest(
  directory: string,
  entry: string,
  styles: readonly string[],
  request: IncomingMessage,
  response: ServerResponse,
  sseClients?: Set<ServerResponse>,
) {
  if (request.method !== "GET" && request.method !== "HEAD") {
    send(response, 405, "text/plain; charset=utf-8", "Method not allowed")
    return
  }

  try {
    const url = new URL(request.url ?? "/", "http://127.0.0.1")
    if (url.pathname === "/__tiancode__/events") {
      response.writeHead(200, {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "Access-Control-Allow-Origin": "*",
      })
      response.write("retry: 1000\n\n")
      if (sseClients) sseClients.add(response)
      request.on("close", () => {
        if (sseClients) sseClients.delete(response)
      })
      return
    }
    if (url.pathname === "/__tiancode__/reload") {
      send(response, 200, "text/javascript; charset=utf-8", RELOAD_MODULE)
      return
    }
    if (url.pathname === "/__tiancode__/revision") {
      send(response, 200, "application/json; charset=utf-8", JSON.stringify({ revision: await projectRevision(directory) }))
      return
    }
    if (url.pathname === "/") {
      send(response, 200, "text/html; charset=utf-8", htmlShell(entry, styles))
      return
    }
    if (url.pathname === "/__tiancode__/runtime") {
      send(response, 200, "text/javascript; charset=utf-8", RUNTIME_MODULE)
      return
    }
    if (url.pathname === "/__tiancode__/react") {
      send(response, 200, "text/javascript; charset=utf-8", REACT_MODULE)
      return
    }
    if (url.pathname === "/__tiancode__/react-dom") {
      send(response, 200, "text/javascript; charset=utf-8", REACT_DOM_MODULE)
      return
    }
    if (url.pathname === "/__tiancode__/react-dom-client") {
      send(response, 200, "text/javascript; charset=utf-8", REACT_DOM_CLIENT_MODULE)
      return
    }
    if (url.pathname === "/__tiancode__/react-jsx-runtime") {
      send(response, 200, "text/javascript; charset=utf-8", REACT_JSX_RUNTIME_MODULE)
      return
    }
    if (url.pathname === "/__tiancode__/react-jsx-dev-runtime") {
      send(response, 200, "text/javascript; charset=utf-8", REACT_JSX_DEV_RUNTIME_MODULE)
      return
    }
    if (url.pathname === "/__tiancode__/unsupported") {
      const specifier = url.searchParams.get("specifier") ?? ""
      send(
        response,
        200,
        "text/javascript; charset=utf-8",
        errorModule(`El módulo ${JSON.stringify(specifier)} requiere un package.json y un script de desarrollo. La vista JSX sin configuración solo admite React, react-dom y archivos relativos.`),
      )
      return
    }
    if (url.pathname === "/__tiancode__/boot") {
      const file = resolveProjectFile(directory, url.searchParams.get("entry") ?? "")
      if (!file || !SCRIPT_EXTENSIONS.has(extname(file))) {
        send(response, 404, "text/javascript; charset=utf-8", errorModule("No se encontró la entrada JSX solicitada."))
        return
      }
      send(response, 200, "text/javascript; charset=utf-8", bootstrapModule(fileToUrl(directory, file)))
      return
    }
    if (url.pathname === "/__tiancode__/style") {
      const file = resolveProjectFile(directory, url.searchParams.get("path") ?? "")
      if (!file || !STYLE_EXTENSIONS.has(extname(file))) {
        send(response, 404, "text/javascript; charset=utf-8", errorModule("No se encontró la hoja de estilos solicitada."))
        return
      }
      send(response, 200, "text/javascript; charset=utf-8", styleModule(await readFile(file, "utf8")))
      return
    }
    if (url.pathname === "/__tiancode__/asset") {
      const file = resolveProjectFile(directory, url.searchParams.get("path") ?? "")
      if (!file || !ASSET_EXTENSIONS.has(extname(file))) {
        send(response, 404, "text/javascript; charset=utf-8", errorModule("No se encontró el recurso solicitado."))
        return
      }
      send(response, 200, "text/javascript; charset=utf-8", `export default ${JSON.stringify(fileToUrl(directory, file))}`)
      return
    }

    const file = resolveProjectFile(directory, url.pathname)
    if (!file) {
      send(response, 404, "text/plain; charset=utf-8", "Not found")
      return
    }
    await sendFile(directory, file, response)
  } catch (error) {
    send(response, 500, "text/javascript; charset=utf-8", errorModule(error instanceof Error ? error.message : String(error)))
  }
}

async function linkedStyles(directory: string) {
  try {
    const index = await readFile(join(directory, "index.html"), "utf8")
    return [...index.matchAll(/<link\b[^>]*>/gi)].flatMap(([tag]) => {
      if (!/\brel\s*=\s*["']?stylesheet(?:\s|["'])/i.test(tag)) return []
      const href = /\bhref\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1]
      if (!href || /^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(href)) return []
      const file = resolveProjectFile(directory, href.split(/[?#]/, 1)[0])
      if (!file || extname(file).toLowerCase() !== ".css") return []
      return [fileToUrl(directory, file)]
    })
  } catch {
    return []
  }
}

async function handleStaticRequest(
  directory: string,
  request: IncomingMessage,
  response: ServerResponse,
  sseClients?: Set<ServerResponse>,
) {
  if (request.method !== "GET" && request.method !== "HEAD") {
    send(response, 405, "text/plain; charset=utf-8", "Method not allowed")
    return
  }

  try {
    const url = new URL(request.url ?? "/", "http://127.0.0.1")
    if (url.pathname === "/__tiancode__/events") {
      response.writeHead(200, {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "Access-Control-Allow-Origin": "*",
      })
      response.write("retry: 1000\n\n")
      if (sseClients) sseClients.add(response)
      request.on("close", () => {
        if (sseClients) sseClients.delete(response)
      })
      return
    }
    if (url.pathname === "/__tiancode__/reload") {
      send(response, 200, "text/javascript; charset=utf-8", RELOAD_MODULE)
      return
    }
    if (url.pathname === "/__tiancode__/revision") {
      send(response, 200, "application/json; charset=utf-8", JSON.stringify({ revision: await projectRevision(directory) }))
      return
    }

    const index = resolveProjectFile(directory, "index.html")
    const requested = url.pathname === "/" ? index : resolveProjectFile(directory, url.pathname)
    const file = requested ?? (!extname(url.pathname) && !url.pathname.split("/").some((part) => part.startsWith(".")) ? index : null)
    if (!file) {
      send(response, 404, "text/plain; charset=utf-8", "Not found")
      return
    }
    await sendStaticFile(file, response)
  } catch (error) {
    send(response, 500, "text/plain; charset=utf-8", error instanceof Error ? error.message : String(error))
  }
}

async function sendStaticFile(file: string, response: ServerResponse) {
  const extension = extname(file).toLowerCase()
  if (extension === ".html" || extension === ".htm") {
    send(response, 200, "text/html; charset=utf-8", injectReloadModule(await readFile(file, "utf8")))
    return
  }
  send(response, 200, staticContentType(extension), await readFile(file))
}

function injectReloadModule(html: string) {
  if (html.includes("/__tiancode__/reload")) return html
  const tag = '<script src="/__tiancode__/reload" defer></script>'
  const closingBody = html.toLowerCase().lastIndexOf("</body>")
  if (closingBody >= 0) return `${html.slice(0, closingBody)}${tag}${html.slice(closingBody)}`
  return `${html}${tag}`
}

async function projectRevision(directory: string) {
  const entries = await revisionEntries(directory, directory)
  return entries.sort().join("|")
}

async function revisionEntries(directory: string, current: string): Promise<string[]> {
  try {
    const entries = await readdir(current, { withFileTypes: true })
    const revisions = await Promise.all(
      entries
        .filter((entry) => !entry.name.startsWith(".") && entry.name !== "node_modules" && entry.name !== "dist" && entry.name !== "build")
        .map(async (entry) => {
          const file = resolve(current, entry.name)
          if (entry.isDirectory()) return revisionEntries(directory, file)
          if (!entry.isFile()) return []
          const metadata = await stat(file)
          return [`${relative(directory, file)}:${metadata.size}:${metadata.mtimeMs}`]
        }),
    )
    return revisions.flat()
  } catch {
    return []
  }
}

async function sendFile(directory: string, file: string, response: ServerResponse) {
  const extension = extname(file).toLowerCase()
  if (SCRIPT_EXTENSIONS.has(extension)) {
    send(response, 200, "text/javascript; charset=utf-8", await compileModule(directory, file))
    return
  }
  if (STYLE_EXTENSIONS.has(extension)) {
    send(response, 200, "text/css; charset=utf-8", await readFile(file, "utf8"))
    return
  }
  if (ASSET_EXTENSIONS.has(extension)) {
    send(response, 200, contentType(extension), await readFile(file))
    return
  }
  send(response, 404, "text/plain; charset=utf-8", "Not found")
}

async function compileModule(directory: string, file: string) {
  const source = await readFile(file, "utf8")
  const transpiled = transpileModule(source, {
    fileName: file,
    reportDiagnostics: true,
    compilerOptions: {
      jsx: JsxEmit.ReactJSX,
      jsxImportSource: "react",
      module: ModuleKind.ESNext,
      target: ScriptTarget.ES2022,
    },
  })
  const diagnostic = transpiled.diagnostics?.find((item) => item.category === DiagnosticCategory.Error)
  if (diagnostic) return errorModule(flattenDiagnosticMessageText(diagnostic.messageText, "\n"))
  return rewriteModuleSpecifiers(directory, file, transpiled.outputText)
}

function rewriteModuleSpecifiers(directory: string, file: string, source: string) {
  const rewrite = (prefix: string, quote: string, specifier: string) => `${prefix}${quote}${moduleUrl(directory, file, specifier)}${quote}`
  return source
    .replace(/\b(import|export)\s+([\w*$\s,{}]+?)\s+from\s+(["'])([^"']+)\3/g, (_match, kind, bindings, quote, specifier) =>
      rewrite(`${kind} ${bindings} from `, quote, specifier),
    )
    .replace(/\bimport\s+(["'])([^"']+)\1/g, (_match, quote, specifier) => rewrite("import ", quote, specifier))
    .replace(/\bimport\s*\(\s*(["'])([^"']+)\1/g, (_match, quote, specifier) => rewrite("import(", quote, specifier))
}

function moduleUrl(directory: string, from: string, specifier: string) {
  if (specifier === "react") return "/__tiancode__/react"
  if (specifier === "react-dom") return "/__tiancode__/react-dom"
  if (specifier === "react-dom/client") return "/__tiancode__/react-dom-client"
  if (specifier === "react/jsx-runtime") return "/__tiancode__/react-jsx-runtime"
  if (specifier === "react/jsx-dev-runtime") return "/__tiancode__/react-jsx-dev-runtime"
  if (!specifier.startsWith(".") && !specifier.startsWith("/")) return unsupportedModule(specifier)

  const base = specifier.startsWith("/") ? resolveProjectFile(directory, specifier) : resolveModuleFile(directory, dirname(from), specifier)
  if (!base) return unsupportedModule(specifier)
  const extension = extname(base).toLowerCase()
  const path = fileToUrl(directory, base)
  if (STYLE_EXTENSIONS.has(extension)) return `/__tiancode__/style?path=${encodeURIComponent(path)}`
  if (ASSET_EXTENSIONS.has(extension)) return `/__tiancode__/asset?path=${encodeURIComponent(path)}`
  return path
}

function resolveModuleFile(directory: string, from: string, specifier: string) {
  const pathname = specifier.split(/[?#]/, 1)[0]
  if (!pathname) return null
  const initial = resolve(from, pathname)
  const candidates = MODULE_EXTENSIONS.flatMap((extension) => [
    `${initial}${extension}`,
    resolve(initial, `index${extension}`),
  ])
  return candidates.find((candidate) => isProjectFile(directory, candidate)) ?? null
}

function resolveProjectFile(directory: string, pathname: string) {
  let decoded: string
  try {
    decoded = decodeURIComponent(pathname)
  } catch {
    return null
  }
  if (!decoded || decoded.includes("\0")) return null
  const candidate = resolve(directory, decoded.replace(/^[/\\]+/, ""))
  return isProjectFile(directory, candidate) ? candidate : null
}

function isProjectFile(directory: string, candidate: string) {
  const path = relative(directory, candidate)
  if (!path || path === ".." || path.startsWith(`..${sep}`) || isAbsolute(path)) return false
  if (path.split(sep).some((part) => part === "node_modules" || part.startsWith("."))) return false
  return existsSync(candidate)
}

function fileToUrl(directory: string, file: string) {
  return `/${relative(directory, file)
    .split(sep)
    .map((part) => encodeURIComponent(part))
    .join("/")}`
}

function unsupportedModule(specifier: string) {
  return `/__tiancode__/unsupported?specifier=${encodeURIComponent(specifier)}`
}

function send(response: ServerResponse, status: number, type: string, body: string | Buffer) {
  response.writeHead(status, { "Cache-Control": "no-store", "Content-Type": type })
  response.end(body)
}

function contentType(extension: string) {
  switch (extension) {
    case ".svg":
      return "image/svg+xml"
    case ".png":
      return "image/png"
    case ".jpg":
    case ".jpeg":
      return "image/jpeg"
    case ".gif":
      return "image/gif"
    case ".webp":
      return "image/webp"
    case ".avif":
      return "image/avif"
    case ".ico":
      return "image/x-icon"
    case ".woff":
      return "font/woff"
    case ".woff2":
      return "font/woff2"
    default:
      return "application/octet-stream"
  }
}

function staticContentType(extension: string) {
  switch (extension) {
    case ".css":
      return "text/css; charset=utf-8"
    case ".js":
    case ".mjs":
    case ".jsx":
    case ".tsx":
      return "text/javascript; charset=utf-8"
    case ".json":
    case ".map":
      return "application/json; charset=utf-8"
    case ".svg":
      return "image/svg+xml"
    case ".png":
      return "image/png"
    case ".jpg":
    case ".jpeg":
      return "image/jpeg"
    case ".gif":
      return "image/gif"
    case ".webp":
      return "image/webp"
    case ".avif":
      return "image/avif"
    case ".ico":
      return "image/x-icon"
    case ".woff":
      return "font/woff"
    case ".woff2":
      return "font/woff2"
    case ".wasm":
      return "application/wasm"
    case ".webmanifest":
      return "application/manifest+json"
    default:
      return "application/octet-stream"
  }
}

function htmlShell(entry: string, styles: readonly string[]) {
  return `<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Vista previa JSX</title>
    ${styles.map((style) => `<link rel="stylesheet" href="${style}" />`).join("\n    ")}
    <style>html,body,#root{min-height:100%;margin:0}#tiancode-preview-error{font:14px/1.5 system-ui,sans-serif;padding:20px;color:#fee2e2;background:#450a0a;white-space:pre-wrap}</style>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/__tiancode__/boot?entry=${encodeURIComponent(`/${entry}`)}"></script>
    <script src="/__tiancode__/reload" defer></script>
  </body>
</html>`
}

const RELOAD_MODULE = String.raw`
let revision
let reloading = false

function triggerReload() {
  if (reloading) return
  reloading = true
  window.location.reload()
}

try {
  if (typeof EventSource !== "undefined") {
    const es = new EventSource("/__tiancode__/events")
    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data)
        if (data && data.type === "reload") {
          triggerReload()
        }
      } catch {}
    }
  }
} catch {}

async function refreshRevision() {
  try {
    const response = await fetch("/__tiancode__/revision", { cache: "no-store" })
    if (!response.ok) return
    const next = (await response.json()).revision
    if (typeof next !== "string") return
    if (revision === undefined) {
      revision = next
      return
    }
    if (next !== revision) {
      triggerReload()
    }
  } catch {}
}

void refreshRevision()
window.setInterval(() => void refreshRevision(), 250)
`

function bootstrapModule(entry: string) {
  return `import { createElement, createRoot } from "/__tiancode__/runtime"

const root = document.getElementById("root")
const showError = (error) => {
  if (!error) return
  console.error("Tiancode preview runtime error:", error)
}
window.addEventListener("error", (event) => showError(event.error || event.message))
window.addEventListener("unhandledrejection", (event) => showError(event.reason))

try {
  const entryModule = await import(${JSON.stringify(entry)})
  if (root && !root.childNodes.length) {
    const component = entryModule.default || entryModule.App || entryModule.Main || entryModule.Root
    if (component && (typeof component === "function" || typeof component === "object")) {
      createRoot(root).render(createElement(component, {}))
    }
  }
} catch (error) {
  showError(error)
}
`
}

function styleModule(css: string) {
  return `const style = document.createElement("style")
style.textContent = ${JSON.stringify(css)}
document.head.append(style)
export default style
`
}

function errorModule(message: string) {
  return `throw new Error(${JSON.stringify(message)})`
}

const RUNTIME_MODULE = String.raw`
const Fragment = Symbol.for("tiancode.jsx.fragment")
const ContextProvider = Symbol.for("tiancode.jsx.context.provider")
const ContextConsumer = Symbol.for("tiancode.jsx.context.consumer")
const hookSlots = new Map()
const contextValues = new Map()
let activeRoot = null
let currentComponent = null

function flat(children, values) {
  for (const child of values) {
    if (Array.isArray(child)) flat(children, child)
    else children.push(child)
  }
  return children
}

function jsx(type, props, key) {
  const next = props || {}
  return { type, key: key == null ? next.key : key, props: { ...next, children: flat([], [next.children]) } }
}

const jsxs = jsx
const jsxDEV = jsx

function createElement(type, props, ...children) {
  return jsx(type, { ...(props || {}), children })
}

function createRoot(container) {
  const root = {
    container,
    vnode: null,
    render(vnode) {
      root.vnode = vnode
      activeRoot = root
      const effects = []
      container.replaceChildren(renderNode(vnode, "root", effects, null))
      for (const effect of effects) effect()
    },
  }
  return root
}

function render(vnode, container) {
  return createRoot(container).render(vnode)
}

function renderNode(vnode, path, effects, namespace) {
  if (vnode == null || typeof vnode === "boolean") return document.createComment("")
  if (typeof vnode === "string" || typeof vnode === "number") return document.createTextNode(String(vnode))
  if (Array.isArray(vnode)) {
    const fragment = document.createDocumentFragment()
    vnode.forEach((child, index) => fragment.append(renderNode(child, path + "." + index, effects, namespace)))
    return fragment
  }
  if (vnode.type && vnode.type.$$typeof === ContextProvider) {
    const context = vnode.type._context
    const hadValue = contextValues.has(context)
    const previousValue = contextValues.get(context)
    contextValues.set(context, vnode.props.value)
    try {
      return renderNode(vnode.props.children, path, effects, namespace)
    } finally {
      if (hadValue) contextValues.set(context, previousValue)
      else contextValues.delete(context)
    }
  }
  if (vnode.type && vnode.type.$$typeof === ContextConsumer) {
    const child = Array.isArray(vnode.props.children) ? vnode.props.children[0] : vnode.props.children
    if (typeof child !== "function") throw new Error("Context.Consumer requiere una funciÃ³n como hijo.")
    return renderNode(child(useContext(vnode.type._context)), path, effects, namespace)
  }
  if (typeof vnode.type === "function") {
    const previous = currentComponent
    const key = path + ":" + (vnode.key == null ? "" : vnode.key)
    currentComponent = { key, index: 0, root: activeRoot, effects }
    try {
      return renderNode(vnode.type(vnode.props), key, effects, namespace)
    } finally {
      currentComponent = previous
    }
  }
  if (vnode.type === Fragment) return renderNode(vnode.props.children, path, effects, namespace)
  const isSvg = namespace === "http://www.w3.org/2000/svg" || vnode.type === "svg"
  const nextNamespace = isSvg ? "http://www.w3.org/2000/svg" : null
  const element = isSvg ? document.createElementNS(nextNamespace, vnode.type) : document.createElement(vnode.type)
  applyProps(element, vnode.props)
  if (!vnode.props.dangerouslySetInnerHTML) {
    vnode.props.children.forEach((child, index) => element.append(renderNode(child, path + "." + index, effects, nextNamespace)))
  }
  return element
}

function applyProps(element, props) {
  for (const [name, value] of Object.entries(props)) {
    if (name === "children" || name === "key" || name === "ref" || value == null || value === false) continue
    if (name === "dangerouslySetInnerHTML") {
      element.innerHTML = value.__html || ""
      continue
    }
    if (name === "className") {
      element.setAttribute("class", value)
      continue
    }
    if (name === "htmlFor") {
      element.setAttribute("for", value)
      continue
    }
    if (name === "style" && typeof value === "object") {
      Object.assign(element.style, value)
      continue
    }
    if (name.startsWith("on") && typeof value === "function") {
      element.addEventListener(name.slice(2).toLowerCase(), value)
      continue
    }
    if (value === true) {
      element.setAttribute(name, "")
      continue
    }
    if (name in element && !name.startsWith("data-") && !name.startsWith("aria-")) {
      try {
        element[name] = value
        continue
      } catch {}
    }
    element.setAttribute(name, String(value))
  }
}

function hook(initial) {
  if (!currentComponent) throw new Error("Los hooks solo se pueden usar dentro de un componente JSX.")
  const slots = hookSlots.get(currentComponent.key) || []
  hookSlots.set(currentComponent.key, slots)
  const index = currentComponent.index++
  if (!slots[index]) slots[index] = initial()
  return slots[index]
}

function useState(initial) {
  const root = currentComponent && currentComponent.root
  const slot = hook(() => ({ value: typeof initial === "function" ? initial() : initial }))
  return [slot.value, (next) => {
    slot.value = typeof next === "function" ? next(slot.value) : next
    root && root.render(root.vnode)
  }]
}

function useReducer(reducer, initial) {
  const state = useState(initial)
  return [state[0], (action) => state[1]((value) => reducer(value, action))]
}

function sameDeps(left, right) {
  return Array.isArray(left) && Array.isArray(right) && left.length === right.length && left.every((value, index) => Object.is(value, right[index]))
}

function useMemo(factory, deps) {
  const slot = hook(() => ({ deps: undefined, value: undefined }))
  if (!sameDeps(slot.deps, deps)) {
    slot.deps = deps
    slot.value = factory()
  }
  return slot.value
}

function useCallback(callback, deps) {
  return useMemo(() => callback, deps)
}

function useRef(value) {
  return hook(() => ({ current: value }))
}

function createContext(defaultValue) {
  const context = { _defaultValue: defaultValue }
  context.Provider = { $$typeof: ContextProvider, _context: context }
  context.Consumer = { $$typeof: ContextConsumer, _context: context }
  return context
}

function useContext(context) {
  if (!context || !("_defaultValue" in context)) throw new Error("useContext requiere un contexto creado con React.createContext.")
  return contextValues.has(context) ? contextValues.get(context) : context._defaultValue
}

function useEffect(effect, deps) {
  const component = currentComponent
  const slot = hook(() => ({ deps: undefined, cleanup: undefined }))
  if (sameDeps(slot.deps, deps)) return
  slot.deps = deps
  component.effects.push(() => {
    if (typeof slot.cleanup === "function") slot.cleanup()
    slot.cleanup = effect()
  })
}

const React = { Fragment, StrictMode: Fragment, createContext, createElement, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState }
const ReactDOM = { createRoot, render }

// Many one-file React demos use the Babel CDN style rather than ES module
// imports such as React destructuring and ReactDOM.createRoot. The
// fallback JSX runtime executes their source as a module, so expose the same
// globals before importing the entry. This keeps that common generated shape
// usable even when there is no package.json or Vite project.
globalThis.React = React
globalThis.ReactDOM = ReactDOM

export { Fragment, React as default, createContext, createElement, createRoot, jsx, jsxDEV, jsxs, render, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState }
`

const REACT_MODULE = 'export * from "/__tiancode__/runtime"\nexport { default } from "/__tiancode__/runtime"\n'
const REACT_DOM_MODULE = 'import { createRoot, render } from "/__tiancode__/runtime"\nexport { createRoot, render }\nexport default { createRoot, render }\n'
const REACT_DOM_CLIENT_MODULE = 'import { createRoot } from "/__tiancode__/runtime"\nexport { createRoot }\nexport default { createRoot }\n'
const REACT_JSX_RUNTIME_MODULE = 'export { Fragment, jsx, jsxs } from "/__tiancode__/runtime"\n'
const REACT_JSX_DEV_RUNTIME_MODULE = 'export { Fragment, jsxDEV } from "/__tiancode__/runtime"\n'
