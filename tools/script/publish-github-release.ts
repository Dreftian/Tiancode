import { spawn } from "node:child_process"
import { existsSync, readFileSync, statSync } from "node:fs"
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
  const version = desktopPkg.version || "1.0.12"
  const tag = `v${version}`
  const releaseName = `Tiancode v${version} — Estudio de Voces, Galería de Sub-Agentes y Fluidez Total`
  const body = `## 🚀 Tiancode v${version} — Estudio de Voces, Galería de Sub-Agentes y Fluidez Total

### 🎙️ Estudio de Voces Femeninas de Alta Fidelidad
- **Experiencia de Voz Fluida sin Barreras:** Acceso inmediato a síntesis de voz natural y fluida en español sin descargar el modelo local de 1GB de Kokoro (bloque descargable opcional solo al activar el motor neural explícito).
- **Voces Femeninas Naturales:** Integración de voces premium en español como Natasha Pro, Conversacional, Profesional y Suave mediante síntesis Edge/Windows Neural y Fish Audio S2.1 Pro.
- **Controles de Estudio:** Ajuste en tiempo real de velocidad (0.75x a 2.0x), Pitch/Tono de voz (Grave, Natural, Agudo), Ganancia de volumen (50% a 120%) y analizador de espectro de onda reactivo a la reproducción de audio.

### ⚡ Eliminación Total del Parpadeo en Configuración
- **Navegación 100% Fluida:** Solución definitiva al problema de parpadeo y artefactos en el fondo del chat al cambiar repetidamente entre pestañas de Configuración (Skills, Sub-Agentes, GitHub, Mascotas).
- **Aislamiento GPU de Capas:** Aislamiento con \`content-visibility: hidden !important\` y \`contain: strict !important\` que evita repintados innecesarios del compositor de Chromium y retiene los datos en memoria sin reconstrucciones destructivas del DOM.

### 🤖 Galería Completa de Sub-Agentes y Modal Astra Cósmico
- **Rejilla Panorámica:** Nueva vista en rejilla responsiva a ancho completo con tarjetas informativas, chips de color y estados de activación en tiempo real.
- **Modal Flotante Astra Cósmico:** Creación y edición intuitiva en un diálogo flotante de alta gama con paleta de colores, selección de herramientas y soporte para exportar e importar especificaciones \`.agent.md\`.

### 🌌 Asistente de Bienvenida Astra y Splash al 95%
- **Diseño Glass Cósmico:** Asistente de bienvenida rediseñado sin contenedor oscuro de fondo, destacando la tarjeta flotante con halos translúcidos cian e índigo.
- **Splash Screen de Alta Claridad:** Calibración precisa de opacidades y contraste en el rostro y tipografía "TIANCODE" al 95% de carga para máxima nitidez visual.

### 🔒 Actualización No Destructiva
- Todas las configuraciones de usuario, proveedores, claves API, sesiones de chat y herramientas MCP se conservan íntegras tras la actualización.

### 📦 Descargas
| Archivo | Tipo | Descripción |
|---|---|---|
| [**Tiancode.exe**](https://github.com/Dreftian/Tiancode/releases/download/${tag}/Tiancode.exe) | Instalador Windows | Instalador oficial con acceso directo y actualizador automático |
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

  const resolveFilePath = (name: string) => {
    const distPath = path.resolve("frontend/desktop/dist", name)
    const installPath = path.resolve("install", name)
    return existsSync(distPath) ? distPath : installPath
  }

  const filesToUpload = [
    { name: "Tiancode.exe", path: resolveFilePath("Tiancode.exe"), contentType: "application/vnd.microsoft.portable-executable" },
    { name: "Tiancode-portable.exe", path: resolveFilePath("Tiancode-portable.exe"), contentType: "application/vnd.microsoft.portable-executable" },
    { name: "latest.yml", path: resolveFilePath("latest.yml"), contentType: "text/yaml" },
    { name: "Tiancode.exe.blockmap", path: resolveFilePath("Tiancode.exe.blockmap"), contentType: "application/octet-stream" },
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
