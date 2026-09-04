// Detección del proyecto web y del comando de desarrollo. Detecta el
// package manager por el lockfile y el framework por las dependencias;
// prefiere el script `dev` del package.json cuando existe.

import { existsSync } from "node:fs"
import { readFile, readdir } from "node:fs/promises"
import { isAbsolute, join, relative, resolve, sep } from "node:path"

export type DetectedProject = {
  framework: string | null
  packageManager: string
  script: string
  port: number
  entry?: string
  command?: string[]
  url?: string
  workingDirectory?: string
  error?: string
}

const DEV_SCRIPTS = ["dev", "develop", "start", "serve"] as const
const BARE_JSX_ENTRIES = [
  "src/main.tsx",
  "src/main.jsx",
  "src/index.tsx",
  "src/index.jsx",
  "src/App.tsx",
  "src/App.jsx",
  "src/app.tsx",
  "src/app.jsx",
  "main.tsx",
  "main.jsx",
  "index.tsx",
  "index.jsx",
  "App.tsx",
  "App.jsx",
  "app.tsx",
  "app.jsx",
  "src/main.js",
  "src/index.js",
  "src/App.js",
  "src/app.js",
  "main.js",
  "index.js",
  "App.js",
  "app.js",
] as const

// Puertos por defecto de los frameworks/bundlers más comunes; el stdout del
// servidor o el escaneo de puertos confirman el puerto real.
const FRAMEWORK_PORTS: Record<string, number> = {
  vite: 5173,
  next: 3000,
  astro: 4321,
  angular: 4200,
  nuxt: 3000,
  svelte: 5173,
  vue: 5173,
  react: 3000,
  gatsby: 8000,
  docusaurus: 3000,
  html: 4173,
}

const PREVIEW_CONFIG = "tiancode.preview.json"
const LOCAL_PREVIEW_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "::1"])

export function detectPackageManager(dir: string) {
  if (existsSync(join(dir, "pnpm-lock.yaml"))) return "pnpm"
  if (existsSync(join(dir, "yarn.lock"))) return "yarn"
  if (existsSync(join(dir, "bun.lockb")) || existsSync(join(dir, "bun.lock"))) return "bun"
  return "npm"
}

// This module is included in the desktop sidecar's Node bundle as well as the
// Bun CLI. Keep project discovery on Node APIs: `Bun.file()` made every
// preview fail in the installed desktop application before it could even read
// an explicit tiancode.preview.json adapter.
async function readProjectText(path: string) {
  try {
    return await readFile(path, "utf8")
  } catch {
    return
  }
}

async function findBareJsxEntry(dir: string) {
  const index = await readProjectText(join(dir, "index.html"))
  if (index !== undefined) {
    const match = /<script\b[^>]*\bsrc\s*=\s*["']([^"']+\.(?:jsx|tsx)(?:[?#][^"']*)?)["']/i.exec(index)
    if (match?.[1] && !/^(?:https?:)?\/\//i.test(match[1])) {
      const candidate = resolve(dir, match[1].split(/[?#]/, 1)[0].replace(/^[/\\]+/, ""))
      const entry = relative(dir, candidate)
      if (entry && entry !== ".." && !entry.startsWith(`..${sep}`) && !isAbsolute(entry) && existsSync(candidate)) {
        return entry.split(sep).join("/")
      }
    }
    const babelMatch =
      /<script\b[^>]*\btype\s*=\s*["']text\/babel["'][^>]*\bsrc\s*=\s*["']([^"']+)["']/i.exec(index) ||
      /<script\b[^>]*\bsrc\s*=\s*["']([^"']+)["'][^>]*\btype\s*=\s*["']text\/babel["']/i.exec(index)
    if (babelMatch?.[1] && !/^(?:https?:)?\/\//i.test(babelMatch[1])) {
      const candidate = resolve(dir, babelMatch[1].split(/[?#]/, 1)[0].replace(/^[/\\]+/, ""))
      const entry = relative(dir, candidate)
      if (entry && entry !== ".." && !entry.startsWith(`..${sep}`) && !isAbsolute(entry) && existsSync(candidate)) {
        return entry.split(sep).join("/")
      }
    }
    // Si index.html existe pero no apunta explícitamente a JSX/TSX/Babel, debe ser servido como proyecto HTML estático
    return undefined
  }

  const standard = BARE_JSX_ENTRIES.find((entry) => existsSync(join(dir, entry)))
  if (standard) return standard

  // Escanear cualquier archivo .jsx o .tsx en raíz o src/
  try {
    const rootFiles = existsSync(dir) ? (await import("node:fs/promises")).readdir(dir) : []
    const rootCandidates = (await rootFiles).filter((f) => /\.(jsx|tsx)$/i.test(f))
    if (rootCandidates.length > 0) return rootCandidates[0]

    const srcDir = join(dir, "src")
    if (existsSync(srcDir)) {
      const srcFiles = (await import("node:fs/promises")).readdir(srcDir)
      const srcCandidates = (await srcFiles).filter((f) => /\.(jsx|tsx)$/i.test(f))
      if (srcCandidates.length > 0) return `src/${srcCandidates[0]}`
    }
  } catch {
    // ignore
  }

  return undefined
}

function bareJsxProject(entry: string): DetectedProject {
  return { framework: "jsx", packageManager: "bare-jsx", script: "", port: 4173, entry }
}

function invalidConfiguredProject(error: string): DetectedProject {
  return { framework: "custom", packageManager: "custom", script: "", port: 0, error }
}

async function detectConfiguredProject(dir: string): Promise<DetectedProject | undefined> {
  const text = await readProjectText(join(dir, PREVIEW_CONFIG))
  if (text === undefined) return

  let config: Record<string, unknown>
  try {
    const value = JSON.parse(text) as unknown
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      return invalidConfiguredProject(`${PREVIEW_CONFIG} debe contener un objeto JSON.`)
    }
    config = value as Record<string, unknown>
  } catch {
    return invalidConfiguredProject(`No se pudo leer ${PREVIEW_CONFIG}.`)
  }

  if (!Array.isArray(config.command) || config.command.length === 0 || config.command.some((item) => typeof item !== "string" || !item.trim() || item.includes("\0"))) {
    return invalidConfiguredProject(`${PREVIEW_CONFIG}.command debe ser un array no vacío de argumentos, no un comando de shell.`)
  }
  if (typeof config.url !== "string" || !config.url.trim()) {
    return invalidConfiguredProject(`${PREVIEW_CONFIG}.url debe ser una URL HTTP local.`)
  }

  let url: URL
  try {
    url = new URL(config.url)
  } catch {
    return invalidConfiguredProject(`${PREVIEW_CONFIG}.url no es una URL válida.`)
  }
  if ((url.protocol !== "http:" && url.protocol !== "https:") || !LOCAL_PREVIEW_HOSTS.has(url.hostname.toLowerCase()) || url.username || url.password) {
    return invalidConfiguredProject(`${PREVIEW_CONFIG}.url debe usar http(s) en localhost, 127.0.0.1 o ::1.`)
  }

  const inputDirectory = config.workingDirectory ?? "."
  if (typeof inputDirectory !== "string" || !inputDirectory.trim()) {
    return invalidConfiguredProject(`${PREVIEW_CONFIG}.workingDirectory debe ser una ruta relativa dentro del proyecto.`)
  }
  const resolvedDirectory = resolve(dir, inputDirectory)
  const directoryRelativePath = relative(dir, resolvedDirectory)
  if (directoryRelativePath === ".." || directoryRelativePath.startsWith(`..${sep}`) || isAbsolute(directoryRelativePath) || !existsSync(resolvedDirectory)) {
    return invalidConfiguredProject(`${PREVIEW_CONFIG}.workingDirectory debe existir dentro del proyecto.`)
  }

  return {
    framework: typeof config.framework === "string" && config.framework.trim() ? config.framework.trim() : "custom",
    packageManager: "custom",
    script: "",
    port: Number(url.port || (url.protocol === "https:" ? 443 : 80)),
    command: config.command.map((item) => item.trim()),
    url: url.toString(),
    workingDirectory: directoryRelativePath ? directoryRelativePath.split(sep).join("/") : ".",
  }
}

const IGNORED_DIRS = new Set([
  ".git",
  "node_modules",
  "dist",
  "build",
  "out",
  ".next",
  ".turbo",
  ".husky",
  ".vscode",
  ".idea",
  ".venv",
  "venv",
  "__pycache__",
  ".tiancode",
  ".opencode",
  "install",
  "coverage",
])

const PRIORITY_DIR_NAMES = [
  "dios",
  "frontend",
  "client",
  "web",
  "app",
  "ui",
  "site",
  "website",
  "src",
]

async function detectMultiLanguageProject(dir: string, relDir: string): Promise<DetectedProject | null> {
  // 1. Python projects (FastAPI, Flask, Django, Streamlit, Gradio, Python server)
  const hasRequirements = existsSync(join(dir, "requirements.txt"))
  const hasPyProject = existsSync(join(dir, "pyproject.toml"))
  const hasPipfile = existsSync(join(dir, "Pipfile"))
  const hasManagePy = existsSync(join(dir, "manage.py"))
  const hasMainPy = existsSync(join(dir, "main.py"))
  const hasAppPy = existsSync(join(dir, "app.py"))
  const hasServerPy = existsSync(join(dir, "server.py"))

  if (hasRequirements || hasPyProject || hasPipfile || hasManagePy || hasMainPy || hasAppPy || hasServerPy) {
    let framework = "python"
    let script = "main.py"
    let port = 8000

    if (hasManagePy) {
      framework = "django"
      script = "manage.py runserver 8000"
      port = 8000
    } else {
      const activePyFile = hasMainPy ? "main.py" : hasAppPy ? "app.py" : hasServerPy ? "server.py" : undefined
      const mainContent = activePyFile ? (await readProjectText(join(dir, activePyFile))) ?? "" : ""
      const reqContent = (await readProjectText(join(dir, "requirements.txt"))) ?? ""
      const pyprojContent = (await readProjectText(join(dir, "pyproject.toml"))) ?? ""
      const combined = `${mainContent}\n${reqContent}\n${pyprojContent}`.toLowerCase()

      if (combined.includes("streamlit")) {
        framework = "streamlit"
        script = `streamlit run ${activePyFile ?? "app.py"}`
        port = 8501
      } else if (combined.includes("gradio")) {
        framework = "gradio"
        script = activePyFile ?? "app.py"
        port = 7860
      } else if (combined.includes("fastapi") || combined.includes("uvicorn")) {
        framework = "fastapi"
        const entryBase = hasMainPy ? "main" : hasAppPy ? "app" : hasServerPy ? "server" : "main"
        script = `uvicorn ${entryBase}:app --reload --port 8000`
        port = 8000
      } else if (combined.includes("flask")) {
        framework = "flask"
        script = "flask run --port 5000"
        port = 5000
      } else {
        script = activePyFile ?? "main.py"
        port = 8000
      }
    }

    return {
      framework,
      packageManager: "python",
      script,
      port,
      entry: hasMainPy ? "main.py" : hasAppPy ? "app.py" : hasServerPy ? "server.py" : undefined,
      ...(relDir !== "." ? { workingDirectory: relDir } : {}),
    }
  }

  // 2. Rust projects (Cargo, Trunk WASM)
  if (existsSync(join(dir, "Cargo.toml"))) {
    const hasTrunk = existsSync(join(dir, "Trunk.toml"))
    return {
      framework: hasTrunk ? "trunk" : "rust",
      packageManager: hasTrunk ? "trunk" : "cargo",
      script: hasTrunk ? "trunk serve" : "cargo run",
      port: 8080,
      ...(relDir !== "." ? { workingDirectory: relDir } : {}),
    }
  }

  // 3. Go projects
  if (existsSync(join(dir, "go.mod")) || existsSync(join(dir, "main.go"))) {
    return {
      framework: "go",
      packageManager: "go",
      script: "go run .",
      port: 8080,
      entry: existsSync(join(dir, "main.go")) ? "main.go" : undefined,
      ...(relDir !== "." ? { workingDirectory: relDir } : {}),
    }
  }

  // 4. PHP projects (Laravel Artisan, Built-in PHP server)
  if (existsSync(join(dir, "artisan"))) {
    return {
      framework: "laravel",
      packageManager: "php",
      script: "php artisan serve --port 8000",
      port: 8000,
      ...(relDir !== "." ? { workingDirectory: relDir } : {}),
    }
  }
  if (existsSync(join(dir, "index.php")) || existsSync(join(dir, "composer.json"))) {
    return {
      framework: "php",
      packageManager: "php",
      script: "php -S 127.0.0.1:8000",
      port: 8000,
      entry: existsSync(join(dir, "index.php")) ? "index.php" : undefined,
      ...(relDir !== "." ? { workingDirectory: relDir } : {}),
    }
  }

  // 5. Ruby projects (Rails, Sinatra, Rackup)
  if (existsSync(join(dir, "Gemfile"))) {
    const hasRails = existsSync(join(dir, "config", "application.rb"))
    return {
      framework: hasRails ? "rails" : "ruby",
      packageManager: "bundle",
      script: hasRails ? "bundle exec rails s -p 3000" : "bundle exec rackup -p 9292",
      port: hasRails ? 3000 : 9292,
      ...(relDir !== "." ? { workingDirectory: relDir } : {}),
    }
  }

  // 6. Java / Kotlin (Maven / Gradle / Spring Boot)
  if (existsSync(join(dir, "pom.xml"))) {
    const mvnw = existsSync(join(dir, "mvnw")) ? (process.platform === "win32" ? "mvnw.cmd" : "./mvnw") : "mvn"
    return {
      framework: "spring-boot",
      packageManager: "maven",
      script: `${mvnw} spring-boot:run`,
      port: 8080,
      ...(relDir !== "." ? { workingDirectory: relDir } : {}),
    }
  }
  if (existsSync(join(dir, "build.gradle")) || existsSync(join(dir, "build.gradle.kts"))) {
    const gradlew = existsSync(join(dir, "gradlew")) ? (process.platform === "win32" ? "gradlew.bat" : "./gradlew") : "gradle"
    return {
      framework: "gradle",
      packageManager: "gradle",
      script: `${gradlew} bootRun`,
      port: 8080,
      ...(relDir !== "." ? { workingDirectory: relDir } : {}),
    }
  }

  // 7. C# / .NET
  try {
    if (existsSync(dir)) {
      const files = await readdir(dir)
      const hasCsproj = files.some((f) => /\.csproj$/i.test(f) || /\.sln$/i.test(f))
      if (hasCsproj) {
        return {
          framework: "dotnet",
          packageManager: "dotnet",
          script: "dotnet run",
          port: 5000,
          ...(relDir !== "." ? { workingDirectory: relDir } : {}),
        }
      }
    }
  } catch {
    // ignore readdir error
  }

  // 8. Deno projects
  if (existsSync(join(dir, "deno.json")) || existsSync(join(dir, "deno.jsonc"))) {
    return {
      framework: "deno",
      packageManager: "deno",
      script: "deno task dev",
      port: 8000,
      ...(relDir !== "." ? { workingDirectory: relDir } : {}),
    }
  }

  return null
}

async function detectSingleDirectory(dir: string, rootDir: string): Promise<DetectedProject | null> {
  const configured = await detectConfiguredProject(dir)
  if (configured) {
    if (dir !== rootDir) {
      const rel = relative(rootDir, dir).split(sep).join("/")
      return {
        ...configured,
        workingDirectory: configured.workingDirectory && configured.workingDirectory !== "."
          ? `${rel}/${configured.workingDirectory}`
          : rel,
      }
    }
    return configured
  }

  const relDir = relative(rootDir, dir).split(sep).join("/") || "."

  const manifest = await readProjectText(join(dir, "package.json"))
  if (manifest === undefined) {
    const entry = await findBareJsxEntry(dir)
    if (entry) {
      const proj = bareJsxProject(entry)
      if (relDir !== ".") proj.workingDirectory = relDir
      return proj
    }

    // Comprobar proyectos multi-lenguaje (Python, Rust, Go, PHP, Java, .NET, Ruby, Deno)
    const multiLang = await detectMultiLanguageProject(dir, relDir)
    if (multiLang) return multiLang

    if (existsSync(join(dir, "index.html"))) {
      return {
        framework: "html",
        packageManager: "static",
        script: "",
        port: 4173,
        ...(relDir !== "." ? { workingDirectory: relDir } : {}),
      }
    }

    // Comprobar si hay otros archivos HTML en el directorio (ej. home.html, app.html)
    try {
      if (existsSync(dir)) {
        const files = await readdir(dir)
        const htmlFile = files.find((f) => /\.html?$/i.test(f))
        if (htmlFile) {
          return {
            framework: "html",
            packageManager: "static",
            script: "",
            port: 4173,
            entry: htmlFile,
            ...(relDir !== "." ? { workingDirectory: relDir } : {}),
          }
        }
      }
    } catch {
      // ignore
    }

    return null
  }

  let pkg: Record<string, unknown>
  try {
    pkg = JSON.parse(manifest) as Record<string, unknown>
  } catch {
    return null
  }

  const packageManager =
    typeof pkg.packageManager === "string" && pkg.packageManager.startsWith("pnpm")
      ? "pnpm"
      : typeof pkg.packageManager === "string" && pkg.packageManager.startsWith("yarn")
        ? "yarn"
        : typeof pkg.packageManager === "string" && pkg.packageManager.startsWith("bun")
          ? "bun"
          : detectPackageManager(dir)

  const deps: Record<string, unknown> = {
    ...(typeof pkg.dependencies === "object" && pkg.dependencies !== null ? (pkg.dependencies as object) : {}),
    ...(typeof pkg.devDependencies === "object" && pkg.devDependencies !== null ? (pkg.devDependencies as object) : {}),
  }

  let framework: string | null = null
  if (deps.vite) framework = "vite"
  else if (deps.next) framework = "next"
  else if (deps.astro) framework = "astro"
  else if (deps.angular || deps["@angular/core"]) framework = "angular"
  else if (deps.nuxt) framework = "nuxt"
  else if (deps.svelte) framework = "svelte"
  else if (deps.vue) framework = "vue"
  else if (deps.react) framework = "react"
  else if (deps.gatsby) framework = "gatsby"
  else if (deps["@docusaurus/core"]) framework = "docusaurus"
  else if (existsSync(join(dir, "index.html"))) framework = "html"

  const scripts = (typeof pkg.scripts === "object" && pkg.scripts !== null ? pkg.scripts : {}) as Record<string, unknown>
  const WEB_DEV_SCRIPTS = [
    "dev:vite",
    "dev:web",
    "dev:browser",
    "dev:client",
    "dev:frontend",
    "dev:renderer",
    "dev:ui",
    "dev:app",
    "start:web",
    "start:browser",
    "start:renderer",
    "vite",
  ] as const

  const DESKTOP_RUNNER_RE = /\b(?:electron(?:\.exe)?|tauri(?:\.exe)?|nw(?:\.exe)?)\b/i

  // Si el script estándar de dev lanza un entorno de escritorio nativo (p. ej.
  // Electron o Tauri), se prioriza un script web (como dev:vite o dev:web)
  // para que la vista previa se ejecute dentro del Sandbox de Tiancode y no
  // abra ventanas de escritorio separadas en el sistema del usuario.
  const standardScript = DEV_SCRIPTS.find((key) => typeof scripts[key] === "string")
  const standardCmd = standardScript ? String(scripts[standardScript]) : ""
  const isDesktop = standardCmd && DESKTOP_RUNNER_RE.test(standardCmd)

  let script: string | undefined
  if (isDesktop) {
    script = WEB_DEV_SCRIPTS.find((key) => typeof scripts[key] === "string") ?? standardScript
  } else {
    script = standardScript ?? WEB_DEV_SCRIPTS.find((key) => typeof scripts[key] === "string")
  }

  if (!script) {
    const entry = await findBareJsxEntry(dir)
    if (entry) {
      const proj = bareJsxProject(entry)
      if (relDir !== ".") proj.workingDirectory = relDir
      return proj
    }

    if (framework === "html" || existsSync(join(dir, "index.html"))) {
      return {
        framework: "html",
        packageManager: "static",
        script: "",
        port: FRAMEWORK_PORTS.html,
        ...(relDir !== "." ? { workingDirectory: relDir } : {}),
      }
    }
    return null
  }

  const port = (framework && FRAMEWORK_PORTS[framework]) || 5173

  return {
    framework,
    packageManager,
    script,
    port,
    ...(relDir !== "." ? { workingDirectory: relDir } : {}),
  }
}

export async function detectProject(dir: string): Promise<DetectedProject | null> {
  // 1. Comprobar primero la raíz del espacio de trabajo
  const rootDetected = await detectSingleDirectory(dir, dir)
  if (rootDetected) return rootDetected

  // 2. Si no se detecta en la raíz, escanear subdirectorios hasta profundidad 2
  try {
    if (!existsSync(dir)) return null
    const entries = await readdir(dir, { withFileTypes: true })
    const subdirs = entries
      .filter((e) => e.isDirectory() && !e.name.startsWith(".") && !IGNORED_DIRS.has(e.name.toLowerCase()))
      .map((e) => e.name)

    // Priorizar carpetas comunes de apps/frontend (dios, frontend, client, web, app, ui, etc.)
    subdirs.sort((a, b) => {
      const aLower = a.toLowerCase()
      const bLower = b.toLowerCase()
      const aPriority = PRIORITY_DIR_NAMES.findIndex((p) => aLower === p || aLower.includes(p))
      const bPriority = PRIORITY_DIR_NAMES.findIndex((p) => bLower === p || bLower.includes(p))
      if (aPriority !== -1 && bPriority === -1) return -1
      if (aPriority === -1 && bPriority !== -1) return 1
      if (aPriority !== -1 && bPriority !== -1) return aPriority - bPriority
      return a.localeCompare(b)
    })

    // Escaneo nivel 1
    for (const sub of subdirs) {
      const subPath = join(dir, sub)
      const found = await detectSingleDirectory(subPath, dir)
      if (found) return found
    }

    // Escaneo nivel 2 (monorrepos, packages/web, apps/frontend, etc.)
    for (const sub of subdirs) {
      const subPath = join(dir, sub)
      try {
        const grandEntries = await readdir(subPath, { withFileTypes: true })
        const grandDirs = grandEntries
          .filter((e) => e.isDirectory() && !e.name.startsWith(".") && !IGNORED_DIRS.has(e.name.toLowerCase()))
          .map((e) => e.name)

        grandDirs.sort((a, b) => {
          const aLower = a.toLowerCase()
          const bLower = b.toLowerCase()
          const aPriority = PRIORITY_DIR_NAMES.findIndex((p) => aLower === p || aLower.includes(p))
          const bPriority = PRIORITY_DIR_NAMES.findIndex((p) => bLower === p || bLower.includes(p))
          if (aPriority !== -1 && bPriority === -1) return -1
          if (aPriority === -1 && bPriority !== -1) return 1
          return a.localeCompare(b)
        })

        for (const grand of grandDirs) {
          const grandPath = join(subPath, grand)
          const found = await detectSingleDirectory(grandPath, dir)
          if (found) return found
        }
      } catch {
        // ignore errors on subfolders
      }
    }
  } catch {
    // ignore directory read errors
  }

  return null
}
