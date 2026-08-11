// Detección del proyecto web y del comando de desarrollo. Detecta el
// package manager por el lockfile y el framework por las dependencias;
// prefiere el script `dev` del package.json cuando existe.

import { existsSync } from "node:fs"
import { join } from "node:path"

export type DetectedProject = {
  framework: string | null
  packageManager: string
  script: string
  port: number
}

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

export function detectPackageManager(dir: string) {
  if (existsSync(join(dir, "pnpm-lock.yaml"))) return "pnpm"
  if (existsSync(join(dir, "yarn.lock"))) return "yarn"
  if (existsSync(join(dir, "bun.lockb")) || existsSync(join(dir, "bun.lock"))) return "bun"
  return "npm"
}

export async function detectProject(dir: string): Promise<DetectedProject | null> {
  const manifest = Bun.file(join(dir, "package.json"))
  if (!(await manifest.exists())) return null

  let pkg: Record<string, unknown>
  try {
    pkg = (await manifest.json()) as Record<string, unknown>
  } catch {
    return null
  }

  const packageManager =
    typeof pkg.packageManager === "string" && pkg.packageManager.startsWith("pnpm")
      ? "pnpm"
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
  // El NOMBRE de la clave del script de desarrollo ("dev"/"develop"), no su
  // contenido: el gestor lo ejecuta como `npm run <nombre>`.
  const script = Object.keys(scripts).find((key) => key === "dev" || key === "develop") ?? "dev"

  const port = (framework && FRAMEWORK_PORTS[framework]) || 5173

  return { framework, packageManager, script, port }
}
