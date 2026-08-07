import { sentryVitePlugin } from "@sentry/vite-plugin"
import { defineConfig } from "electron-vite"
import appPlugin from "@tiancode-ai/app/vite"
import * as fs from "node:fs/promises"

const TIANCODE_SERVER_DIST = "../../backend/tiancode/dist/node"

const channel = (() => {
  const raw = process.env.TIANCODE_CHANNEL
  if (raw === "dev" || raw === "beta" || raw === "prod") return raw
  if (process.env.TIANCODE_CHANNEL === "latest") return "prod"
  return "dev"
})()

const nodePtyPkg = `@lydell/node-pty-${process.platform}-${process.arch}`

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
          for (const l of await fs.readdir(TIANCODE_SERVER_DIST)) {
            if (!l.endsWith(".wasm")) continue
            await fs.writeFile(`./out/main/chunks/${l}`, await fs.readFile(`${TIANCODE_SERVER_DIST}/${l}`))
          }
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
    plugins: [appPlugin, sentry],
    publicDir: "../../../app/public",
    root: "src/renderer",
    build: {
      sourcemap: true,
      rollupOptions: {
        input: {
          main: "src/renderer/index.html",
        },
        // Divide los vendors pesados para que el chunk principal se ejecute
        // más rápido (antes 7.8MB en un solo archivo).
        output: {
          manualChunks(id) {
            if (!id.includes("node_modules")) return
            if (id.includes("effect")) return "vendor-effect"
            if (id.includes("kobalte") || id.includes("corvu") || id.includes("dnd-kit") || id.includes("sonner"))
              return "vendor-ui"
            if (id.includes("@pierre") || id.includes("pierre")) return "vendor-pierre"
            if (id.includes("framer-motion") || id.includes("motion-dom")) return "vendor-motion"
            if (id.includes("shiki") || id.includes("@shikijs")) return "vendor-shiki"
            if (id.includes("sentry")) return "vendor-sentry"
            if (id.includes("solid-js") || id.includes("@solidjs") || id.includes("solid-")) return "vendor-solid"
            if (id.includes("luxon") || id.includes("marked") || id.includes("katex")) return "vendor-markdown"
          },
        },
      },
    },
  },
})
