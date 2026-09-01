import { spawn } from "node:child_process"
import { readFileSync, statSync } from "node:fs"
import path from "node:path"

async function getGitHubToken(): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn("git", ["credential", "fill"])
    let output = ""
    proc.stdout.on("data", (d) => { output += d.toString() })
    proc.stderr.on("data", (d) => { console.error(d.toString()) })
    proc.on("close", (code) => {
      const lines = output.split("\n")
      const passwordLine = lines.find((l) => l.startsWith("password="))
      if (passwordLine) {
        resolve(passwordLine.replace("password=", "").trim())
      } else {
        reject(new Error("No token found in git credentials"))
      }
    })
    proc.stdin.write("protocol=https\nhost=github.com\n\n")
    proc.stdin.end()
  })
}

async function main() {
  const token = await getGitHubToken()
  const owner = "Dreftian"
  const repo = "Tiancode"
  const desktopPkg = JSON.parse(readFileSync(path.resolve("frontend/desktop/package.json"), "utf-8"))
  const version = desktopPkg.version || "1.0.1"
  const tag = `v${version}`
  const releaseName = `Tiancode v${version} - Soporte DESIGN.md, Vibe Coding y Next.js 15`
  const body = `## 🚀 Tiancode v${version} — Versión Oficial

### ✨ Novedades y Características Principales
- **Soporte Nativo de Sistemas de Diseño (DESIGN.md):** Tiancode ahora detecta automáticamente archivos \`DESIGN.md\` en cualquier proyecto e inyecta su sistema de diseño, tokens de color y contratos de componentes en el contexto del modelo.
- **Subagente UI/UX Especializado (\`ui-ux-master\`):** Diseñado para aplicar rigurosamente tokens semánticos, escalas tipográficas y espaciados armónicos basados en \`DESIGN.md\`.
- **Habilidad de Sistemas de Diseño (\`design-system-spec\`):** Habilidad canónica basada en el estándar Rico UI para auditar, crear y sincronizar especificaciones visuales y Tailwind CSS.
- **Metodología Vibe Coding en 3 Fases (\`vibe-coding-workflow\`):** Flujo estructurado inspirado en Lovable (Planificación de Esquemas y Contratos → Implementación Modular Tipada → Verificación y Polish).
- **Habilidad Fullstack Next.js 15+ (\`fullstack-nextjs-tailwind\`):** Directrices avanzadas para React Server Components (RSC), Server Actions con esquemas tipados y Tailwind CSS v4.
- **Detección Automática de Modelos Locales:** Descubre automáticamente todos los modelos GGUF descargados en disco y los activa de inmediato.
- **73 Built-in Engineering Skills:** Catálogo expandido de habilidades de ingeniería y flujo de trabajo.
- **Plugins y MCP Servers:** Ecosistema completo con activación funcional y suite de herramientas.
- **Voces TTS Kokoro y Piper:** Síntesis de voz neural con dictado en español.
- **Actualizador Automático:** Detección e instalación fluida de nuevas versiones.

### 📦 Descargas
| Archivo | Tipo | Descripción |
|---|---|---|
| [**Tiancode.exe**](https://github.com/Dreftian/Tiancode/releases/download/${tag}/Tiancode.exe) | Instalador Windows | Instalador oficial con acceso directo y actualizador |
| [**Tiancode-portable.exe**](https://github.com/Dreftian/Tiancode/releases/download/${tag}/Tiancode-portable.exe) | Portable Windows | Ejecutable directo sin instalación |
| [**latest.yml**](https://github.com/Dreftian/Tiancode/releases/download/${tag}/latest.yml) | Metadatos | Registro para el actualizador automático |
`

  console.log(`[1/4] Verificando release ${tag} en GitHub...`)
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "User-Agent": "Tiancode-Release-Script",
  }

  let releaseData: any
  const getRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/releases/tags/${tag}`, { headers })
  if (getRes.ok) {
    releaseData = await getRes.json()
    console.log(`Release encontrada con id ${releaseData.id}`)
  } else {
    console.log(`Creando nueva release ${tag}...`)
    const createRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/releases`, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({
        tag_name: tag,
        name: releaseName,
        body,
        draft: false,
        prerelease: false,
      }),
    })
    if (!createRes.ok) {
      const err = await createRes.text()
      throw new Error(`Error al crear release: ${createRes.status} ${err}`)
    }
    releaseData = await createRes.json()
    console.log(`Release creada exitosamente con id ${releaseData.id}`)
  }

  const uploadUrlBase = releaseData.upload_url.replace(/\{(\?.*)?\}$/, "")

  const filesToUpload = [
    { name: "Tiancode.exe", path: "install/Tiancode.exe", contentType: "application/vnd.microsoft.portable-executable" },
    { name: "Tiancode-portable.exe", path: "install/Tiancode-portable.exe", contentType: "application/vnd.microsoft.portable-executable" },
    { name: "latest.yml", path: "install/latest.yml", contentType: "text/yaml" },
    { name: "Tiancode.exe.blockmap", path: "install/Tiancode.exe.blockmap", contentType: "application/octet-stream" },
  ]

  for (const file of filesToUpload) {
    console.log(`[Upload] Preparando ${file.name}...`)
    const existingAsset = releaseData.assets?.find((a: any) => a.name === file.name)
    if (existingAsset) {
      console.log(`Eliminando asset existente ${file.name} (id: ${existingAsset.id})...`)
      await fetch(`https://api.github.com/repos/${owner}/${repo}/releases/assets/${existingAsset.id}`, {
        method: "DELETE",
        headers,
      })
    }

    const content = readFileSync(file.path)
    const size = statSync(file.path).size
    console.log(`Subiendo ${file.name} (${(size / (1024 * 1024)).toFixed(2)} MB)...`)

    const uploadRes = await fetch(`${uploadUrlBase}?name=${encodeURIComponent(file.name)}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": file.contentType,
        "Content-Length": size.toString(),
        "User-Agent": "Tiancode-Release-Script",
      },
      body: content,
    })

    if (!uploadRes.ok) {
      const err = await uploadRes.text()
      console.error(`Error subiendo ${file.name}: ${uploadRes.status} ${err}`)
    } else {
      console.log(`✓ ${file.name} subido exitosamente!`)
    }
  }

  console.log(`\n🎉 ¡Release ${tag} publicada exitosamente con todos los binarios y metadatos!`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
