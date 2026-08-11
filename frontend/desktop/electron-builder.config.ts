import { execFile } from "node:child_process"
import { existsSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { promisify } from "node:util"

import type { Configuration } from "electron-builder"

const execFileAsync = promisify(execFile)
const packageDir = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(packageDir, "../..")
export const windowsSignScript = path.join(rootDir, "backend", "tools", "script", "sign-windows.ps1")
// The Electron 42 packaging update briefly installed Linux launchers/icons under
// "tiancode-desktop". Keep that hidden desktop entry around so existing GNOME/KDE
// pins still resolve after the canonical app id changes back to ai.tiancode.desktop.
const legacyDesktopEntry = path.join(packageDir, "resources", "linux", "tiancode-desktop.desktop")
const legacyDesktopEntryFpm = `${legacyDesktopEntry}=/usr/share/applications/tiancode-desktop.desktop`

const metainfoFpm = (appId: string) =>
  `${path.join(packageDir, "resources", `${appId}.metainfo.xml`)}=/usr/share/metainfo/${appId}.metainfo.xml`

async function signWindows(configuration: { path: string }) {
  if (process.platform !== "win32") return
  if (process.env.GITHUB_ACTIONS !== "true") return

  await execFileAsync(
    "pwsh",
    ["-NoLogo", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", windowsSignScript, configuration.path],
    { cwd: rootDir },
  )
}

const channel = (() => {
  const raw = process.env.TIANCODE_CHANNEL
  if (raw === "dev" || raw === "beta" || raw === "prod") return raw
  return "dev"
})()

const APP_IDS = {
  dev: "ai.tiancode.desktop.codex",
  beta: "ai.tiancode.desktop.beta",
  prod: "ai.tiancode.desktop",
} as const

const getBase = (appId: string): Configuration => ({
  artifactName: "tiancode-desktop-${os}-${arch}.${ext}",
  directories: {
    output: "dist",
    buildResources: "resources",
  },
  // Linux launchers are .desktop files, so this is the desktop file name,
  // not just the app id. For prod, app id "ai.tiancode.desktop" becomes
  // "ai.tiancode.desktop.desktop".
  // https://developer.gnome.org/documentation/guidelines/maintainer/integrating.html
  // https://www.electron.build/docs/linux/
  extraMetadata: {
    desktopName: `${appId}.desktop`,
  },
  files: ["out/**/*", "resources/**/*", "!resources/tiancode-cli*", "!resources/icons/**/*"],
  // onnxruntime-node ships native binaries that cannot load from inside the
  // asar; kokoro-js and phonemizer ship binary assets (voice style vectors,
  // espeak-ng wasm) that are safer unpacked. sherpa-onnx is a WASM build and
  // loads its .wasm through the patched fs, but unpacking keeps it identical
  // to the dev environment.
  asarUnpack: [
    "**/node_modules/onnxruntime-node/**",
    "**/node_modules/kokoro-js/**",
    "**/node_modules/phonemizer/**",
    "**/node_modules/sherpa-onnx/**",
  ],
  extraResources: [
    // BrowserWindow and Tray load their icons through native Windows APIs. Keep
    // them outside app.asar so every runtime surface can read a real file.
    {
      from: "resources/icons",
      to: "icons",
    },
    // MCP empaquetados (vista en vivo + suite): se sirven desde
    // resources/mcp tanto en instalado como en portable.
    {
      from: "resources/mcp",
      to: "mcp",
    },
    ...(channel === "dev"
      ? [
          {
            from: "resources/",
            to: "",
            filter: ["tiancode-cli*"],
          },
        ]
      : []),
    ...(existsSync(path.join(packageDir, "native"))
      ? [
          {
            from: "native/",
            to: "native/",
            filter: ["index.js", "index.d.ts", "build/Release/mac_window.node", "swift-build/**"],
          },
        ]
      : []),
  ],
  mac: {
    category: "public.app-category.developer-tools",
    icon: `resources/icons/icon.icns`,
    hardenedRuntime: true,
    gatekeeperAssess: false,
    entitlements: "resources/entitlements.plist",
    entitlementsInherit: "resources/entitlements.plist",
    notarize: true,
    target: ["dmg", "zip"],
  },
  dmg: {
    sign: true,
  },
  protocols: {
    name: "Tiancode",
    schemes: ["tiancode"],
  },
  win: {
    icon: `resources/icons/icon.ico`,
    signtoolOptions: {
      sign: signWindows,
    },
    target: [
      { target: "nsis", arch: ["x64"] },
      { target: "portable", arch: ["x64"] },
    ],
    // Los builds de beta/prod salen firmados desde CI (Azure Trusted Signing)
    // y electron-updater debe verificar la firma del paquete antes de
    // instalarlo. El canal dev (sin firmar) no verifica para no romper sus
    // actualizaciones locales; además UPDATER_ENABLED lo desactiva en runtime.
    verifyUpdateCodeSignature: channel !== "dev",
    // publisherName se omite a propósito: electron-builder lo deriva del
    // certificado de firma en build time, garantizando que siempre coincida con
    // el Subject CN real de Azure Trusted Signing (cuenta/perfil viven en los
    // secrets del CI, no en el repo).
  },
  nsis: {
    oneClick: true,
    perMachine: false,
    installerIcon: `resources/icons/icon.ico`,
    installerHeaderIcon: `resources/icons/icon.ico`,
    // Los nombres de artefacto son los que enlaza la web y el latest.yml
    // (tools/website/recursos/descargas.html → /releases/latest/download/Tiancode.exe).
    // El CI construye arm64 y x64: sin sufijo ambos producirían "Tiancode.exe"
    // y la release se pisa a sí misma (el updater serviría arm64 a todos). El
    // job arm64 del CI setea TIANCODE_ARCH=arm64 para distinguirlos.
    artifactName: process.env.TIANCODE_ARCH === "arm64" ? "Tiancode-arm64.${ext}" : "Tiancode.${ext}",
  },
  portable: {
    artifactName: process.env.TIANCODE_ARCH === "arm64" ? "Tiancode-portable-arm64.${ext}" : "Tiancode-portable.${ext}",
  },
  linux: {
    icon: `resources/icons`,
    category: "Development",
    executableName: appId,
    desktop: {
      entry: {
        // Match the installed .desktop file and hicolor icon basename so
        // Linux shells can associate the running Electron window with its launcher.
        StartupWMClass: appId,
      },
    },
    target: ["AppImage", "deb", "rpm"],
  },
})

function getConfig() {
  const appId = APP_IDS[channel]
  const base = getBase(appId)

  switch (channel) {
    case "dev": {
      return {
        ...base,
        appId,
        productName: "Tiancode Codex",
        deb: { fpm: [metainfoFpm(appId)] },
        rpm: { packageName: "tian-dev", fpm: [metainfoFpm(appId)] },
      }
    }
    case "beta": {
      return {
        ...base,
        appId,
        productName: "Tiancode Beta",
        protocols: { name: "Tiancode Beta", schemes: ["tiancode"] },
        publish: { provider: "github", owner: "Dreftian", repo: "Tiancode", channel: "latest" },
        deb: { fpm: [metainfoFpm(appId)] },
        rpm: { packageName: "tian-beta", fpm: [metainfoFpm(appId)] },
      }
    }
    case "prod": {
      return {
        ...base,
        appId,
        productName: "Tiancode",
        protocols: { name: "Tiancode", schemes: ["tiancode"] },
        publish: { provider: "github", owner: "Dreftian", repo: "Tiancode", channel: "latest" },
        deb: { fpm: [metainfoFpm(appId), legacyDesktopEntryFpm] },
        rpm: { packageName: "tian", fpm: [metainfoFpm(appId), legacyDesktopEntryFpm] },
      }
    }
  }
}

export default getConfig()
