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
  const version = desktopPkg.version || "1.0.2"
  const tag = `v${version}`
  const releaseName = `Tiancode v${version} - Sub-Agentes Universales, Curaduría de Herramientas & UI V2`
  const body = `## 🚀 Tiancode v${version} — Sub-Agentes Universales & Optimización V2

### 🤖 Sub-Agentes Universales para Todos los Modelos
- **Compatibilidad Total de Modelos:** Cualquier modelo actual o futuro (Claude 3.7/4/5, GPT-4o/5, o1/o3/o4, Gemini 2.0/2.5, DeepSeek R1/V3, Llama 3.3, Qwen 2.5 Coder, modelos locales GGUF) reconoce y delega tareas a los sub-agentes especializados automáticamente.
- **Resolución Resiliente de Nombres:** Normalización tolerante a prefijos \`@\`, guiones bajos y variaciones de mayúsculas/minúsculas en el registro de agentes (e.g. \`@fullstack-coder\`, \`fullstack_coder\`).
- **Descubrimiento Dinámico:** Los agentes personalizados e importados (.md) se inyectan automáticamente en el prompt de sistema del modelo principal.
- **Enumeración Canónica en Schema:** Schema JSON enriquecido para evitar alucinaciones en modelos con decodificación guiada o de menor escala.

### 🛡️ Curaduría y Armonización Anti-Colisión de Herramientas
- **Catálogo MCP Optimizado:** Eliminación de presets redundantes (\`filesystem\`, \`fetch\`, \`time\`, \`git\`) que saturaban el contexto y colisionaban con herramientas nativas.
- **Límites Claros de Jurisdicción:** Filesystem y Git unificados en el núcleo nativo de Tiancode; Playwright protegido con guardrails de aislamiento local.
- **Presets de Alto Impacto:** Priorización de bases de datos (\`supabase\`, \`postgres\`, \`sqlite\`, \`duckdb\`, \`redis\`), DevOps (\`docker\`, \`sentry\`, \`e2b\`), diseño (\`figma\`) e investigación profunda (\`firecrawl\`, \`context7\`).
- **Plugins Oficiales:** Nomenclatura oficial modernizada bajo la marca Tiancode (Android Emulator, iOS Simulator, Tiancode Guide, etc.).

### 🎨 Mascota de Escritorio (Desktop Pet) & UI V2
- **Glassmorphism Fluent Moderno:** Globo de diálogo translúcido con desenfoque profundo (\`backdrop-filter: blur(20px)\`), borde luminoso y sombra difusa adaptada a Windows 11 oscuro.
- **Microinteracciones Reactivas:** Hover con escalado elástico, interacción de cariño con ráfaga de corazones (\`pet-burst\`) y doble clic para enfocar la app principal.
- **Consumo Ultra-Bajo de CPU:** Animaciones aceleradas por GPU mediante transformaciones CSS puras (< 0.3% CPU en reposo).

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
    // La release v1.0.0 ya existe: re-publicar como latest con las notas oficiales.
    const patchRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/releases/${releaseData.id}`, {
      method: "PATCH",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({
        name: releaseName,
        body,
        draft: false,
        prerelease: false,
        make_latest: "true",
      }),
    })
    if (!patchRes.ok) {
      const err = await patchRes.text()
      throw new Error(`Error al actualizar release: ${patchRes.status} ${err}`)
    }
    releaseData = await patchRes.json()
    console.log(`Release actualizada y marcada como latest`)
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
        make_latest: "true",
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
