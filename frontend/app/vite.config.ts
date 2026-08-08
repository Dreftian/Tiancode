import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { sentryVitePlugin } from "@sentry/vite-plugin"
import { defineConfig, type Plugin } from "vite"
import desktopPlugin from "./vite"

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
          assets: "./dist/**",
          filesToDeleteAfterUpload: "./dist/**/*.map",
        },
      })
    : false

// El plugin de desktop (vite.js) inyecta oc-theme-preload.js inline en el HTML
// final, también en build. Su hash se permite en script-src para que la CSP
// estricta no lo bloquee; se calcula del mismo archivo en tiempo de build, así
// que nunca puede desincronizarse con el contenido inyectado.
const themePreloadHash = createHash("sha256")
  .update(readFileSync(fileURLToPath(new URL("./public/oc-theme-preload.js", import.meta.url))))
  .digest("base64")

// CSP del web app servido en Vercel (el build de escritorio usa su propio
// electron.vite.config.ts y no pasa por aquí). El renderer se conecta al
// servidor tiancode local del usuario, de ahí los puertos 127.0.0.1/localhost.
// - 'wasm-unsafe-eval': la terminal (ghostty-web) compila su wasm embebido con
//   WebAssembly.compile/instantiate; Chrome y Firefox lo bloquean sin esto.
// - data: en connect-src: la terminal obtiene ese wasm desde una URL data:.
// - media-src blob:: la lectura en voz alta y la reproducción de grabaciones
//   usan URLs blob: de createObjectURL.
const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'sha256-${themePreloadHash}' 'wasm-unsafe-eval'`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "connect-src 'self' data: https: wss: ws: http://127.0.0.1:* http://localhost:* ws://127.0.0.1:* ws://localhost:*",
  "media-src 'self' blob: data:",
  "frame-src 'self' https:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ")

const cspPlugin: Plugin = {
  name: "tiancode-web:content-security-policy",
  // Solo producción: en dev Vite inyecta módulos y estilos inline que una CSP
  // estricta rompería (y el HMR necesita websockets sin restricciones).
  apply: "build",
  transformIndexHtml() {
    return [
      {
        tag: "meta",
        attrs: {
          "http-equiv": "Content-Security-Policy",
          content: contentSecurityPolicy,
        },
        injectTo: "head-prepend",
      },
    ]
  },
}

export default defineConfig({
  plugins: [desktopPlugin, sentry, cspPlugin] as any,
  server: {
    host: "0.0.0.0",
    allowedHosts: true,
    port: 3000,
  },
  build: {
    target: "esnext",
    sourcemap: true,
  },
})
