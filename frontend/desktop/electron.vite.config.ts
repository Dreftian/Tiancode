import { sentryVitePlugin } from "@sentry/vite-plugin"
import { defineConfig } from "electron-vite"
import appPlugin from "@tiancode-ai/app/vite"
import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"
import { readFile, readdir, writeFile } from "node:fs/promises"
import { fileURLToPath } from "node:url"

const TIANCODE_SERVER_DIST = "../../backend/tiancode/dist/node"

const channel = (() => {
  const raw = process.env.TIANCODE_CHANNEL
  if (raw === "dev" || raw === "beta" || raw === "prod") return raw
  if (process.env.TIANCODE_CHANNEL === "latest") return "prod"
  return "dev"
})()

// La versión real del package del desktop llega al renderer (splash/menus) por
// define de build; el build web de la app no la define y se oculta.
const desktopVersion = (JSON.parse(readFileSync(fileURLToPath(new URL("./package.json", import.meta.url)), "utf8")) as {
  version?: string
}).version

const nodePtyPkg = `@lydell/node-pty-${process.platform}-${process.arch}`

// CSP estricto solo en el build de producción (el dev necesita HMR sin
// restricciones). El script inline del theme-preload lo inyecta el plugin de
// @tiancode-ai/app/vite; se permite por hash SHA-256 para no abrir
// 'unsafe-inline'. connect-src incluye http: porque el renderer habla con el
// sidecar local (http://127.0.0.1) y con servidores remotos configurados por
// el usuario. media-src incluye blob: y data: (audio TTS desde data: URIs) y
// https: (vídeos de las release notes).
const rendererCsp = (() => {
  const themePreloadPath = fileURLToPath(new URL("../app/public/oc-theme-preload.js", import.meta.url))
  const themeHash = createHash("sha256").update(readFileSync(themePreloadPath, "utf8")).digest("base64")
  return [
    "default-src 'self'",
    // wasm-unsafe-eval: la terminal (ghostty) compila su wasm en runtime
    // (igual que la CSP web); sin esto el terminal no carga.
    `script-src 'self' 'wasm-unsafe-eval' 'sha256-${themeHash}'`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    "media-src 'self' blob: data: https:",
    // data: en connect-src: la terminal (ghostty) carga su wasm desde una URL
    // data:application/wasm;base64 embebida (igual que la CSP web).
    "connect-src 'self' data: http: https: wss: ws:",
    // La vista previa integrada carga sólo servicios loopback administrados. Los
    // proyectos y herramientas publican indistintamente 127.0.0.1, localhost o
    // ::1, así que los tres orígenes deben poder usarse dentro del iframe.
    // Chromium does not match IPv6 literals in CSP host sources. The preview
    // transport canonicalizes ::1 to localhost before assigning iframe.src.
    "frame-src 'self' https: http://127.0.0.1:* http://localhost:*",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join("; ")
})()

const sentry =
  process.env.SENTRY_AUTH_TOKEN && process.env.SENTRY_ORG && process.env.SENTRY_PROJECT
    ? sentryVitePlugin({
        authToken: process.env.SENTRY_AUTH_TOKEN,
        org: process.env.SENTRY_ORG,
        project: process.env.SENTRY_PROJECT,
        telemetry: false,
        release: {
          name: process.env.SENTRY_RELEASE ?? process.env.VITE_SENTRY_RELEASE,
        },
        sourcemaps: {
          assets: "./out/renderer/**",
          filesToDeleteAfterUpload: "./out/renderer/**/*.map",
        },
      })
    : false

export default defineConfig({
  main: {
    define: {
      "import.meta.env.TIANCODE_CHANNEL": JSON.stringify(channel),
    },
    build: {
      rollupOptions: {
        input: { index: "src/main/index.ts", sidecar: "src/main/sidecar.ts" },
        // Keep this identical to electron-vite's Node 20.11+ shim. Its regex insertion can
        // corrupt bundled TypeScript, while a Rollup banner places the shim safely.
        output: {
          banner: `
// -- CommonJS Shims --
import __cjs_mod__ from 'node:module';
const __filename = import.meta.filename;
const __dirname = import.meta.dirname;
const require = __cjs_mod__.createRequire(import.meta.url);
`,
        },
      },
      externalizeDeps: { include: [nodePtyPkg] },
    },
    plugins: [
      {
        name: "tiancode:node-pty-narrower",
        enforce: "pre",
        resolveId(s) {
          if (s === "@lydell/node-pty") return nodePtyPkg
        },
      },
      {
        name: "tiancode:virtual-server-module",
        enforce: "pre",
        resolveId(id) {
          if (id === "virtual:tiancode-server") return this.resolve(`${TIANCODE_SERVER_DIST}/node.js`)
        },
      },
      {
        name: "tiancode:copy-server-assets",
        async writeBundle() {
          try {
            for (const l of await readdir(TIANCODE_SERVER_DIST)) {
              if (!l.endsWith(".wasm")) continue
              await writeFile(`./out/main/chunks/${l}`, await readFile(`${TIANCODE_SERVER_DIST}/${l}`))
            }
          } catch {}
        },
      },
    ],
  },
  preload: {
    build: {
      rollupOptions: {
        input: { index: "src/preload/index.ts" },
        output: {
          format: "cjs",
          entryFileNames: "[name].js",
        },
      },
    },
  },
  renderer: {
    resolve: {
      alias: {
        "@": fileURLToPath(new URL("../app/src", import.meta.url)),
        "@tiancode-ai/app": fileURLToPath(new URL("../app/src", import.meta.url)),
      },
    },
    define: {
      "import.meta.env.VITE_TIANCODE_CHANNEL": JSON.stringify(channel),
      "import.meta.env.VITE_TIANCODE_VERSION": JSON.stringify(desktopVersion ?? ""),
    },
    plugins: [
      appPlugin,
      sentry,
      {
        name: "tiancode:renderer-csp",
        apply: "build",
        transformIndexHtml() {
          return [
            {
              tag: "meta",
              attrs: {
                "http-equiv": "Content-Security-Policy",
                content: rendererCsp,
              },
              injectTo: "head-prepend",
            },
          ]
        },
      },
    ],
    publicDir: "../../../app/public",
    root: "src/renderer",
    build: {
      sourcemap: true,
      rollupOptions: {
        input: {
          main: "src/renderer/index.html",
        },
      },
    },
  },
})
