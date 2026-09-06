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
  const version = desktopPkg.version || "1.0.25"
  const tag = `v${version}`
  const releaseName = `Tiancode v${version} — Rediseño GitHub, Voces en 4 Columnas, Skills Completas y Sandbox 100% Interactivo`
  const body = `## 🚀 Tiancode v${version}

### 🐙 Rediseño Completo de GitHub en Ajustes
- **Visualización Ampliada (1040px):** Mayor espacio, contraste y claridad para todos los elementos y detalles de repositorios y commits.
- **Tarjetas de Repositorio Enriquecidas:** Muestran avatar del propietario, insignia de visibilidad (Público/Privado), indicador de Fork, rama por defecto, descripción completa sin cortes, punto de color y lenguaje de programación, contador de estrellas (⭐), forks (🍴) y fecha relativa de actualización.
- **Acciones Rápidas:** Botón de copiar enlace directo al portapapeles, enlace "Ver ↗" en GitHub, y detección inteligente si el proyecto ya existe en tu equipo ("Abrir Proyecto") o si requiere clonación ("Clonar y Abrir").
- **Control de Versiones (VCS) Mejorado:** Indicador en tiempo real de la rama actual y del estado del árbol de trabajo (árbol al día o archivos modificados pendientes).
- **Ordenación:** Filtro por fecha de actualización, mayor número de estrellas o alfabético (A-Z).

### 🎙️ Panel de Voces en 4 Columnas Compactas
- **Grid de 4 Columnas:** Distribución limpia y semi-junta sin paginación excesiva para ver todas las 21 voces disponibles a simple vista.
- **Adaptable:** Diseño responsive que se ajusta a 3, 2 o 1 columna según el ancho de la ventana.

### 🧠 Skills con Documentación Técnica Completa
- **Manuales Exhaustivos:** Eliminación del truncamiento con puntos suspensivos en la lista de skills.
- **Panel Detallado:** Renderizado de la documentación markdown completa con disparadores ("Cuándo Usar"), directivas de comportamiento del agente, ejemplos prácticos y comandos CLI (como \`database-drizzle-sqlite-pg\`).

### 🌐 Sandbox Preview 100% Interactivo
- **Permisos Totales:** Se habilitaron en el iframe y en Electron los permisos de portapapeles (\`clipboard-read\`, \`clipboard-write\`), pantalla completa (\`fullscreen\`), puntero bloqueado (\`pointer-lock\` para juegos y 3D), audio/video, popups (\`allow-popups\`, \`allow-popups-to-escape-sandbox\`), y descarga.
- **Khaos Browser y Web Apps:** Soporte interactivo completo con historial de navegación (\`goBack\`, \`goForward\`), recarga, marcadores dinámicos, limpieza de caché y eventos IPC simulados sin bloqueos.

### 🔒 Actualización 100% No Destructiva
- Todas tus claves de API activas, configuraciones, sesiones, historial y MCPs se conservan intactas en tu equipo.

### 📦 Descargas
| Archivo | Tipo | Descripción |
|---|---|---|
| [**Tiancode.exe**](https://github.com/Dreftian/Tiancode/releases/download/${tag}/Tiancode.exe) | Instalador Windows | Instalador oficial con actualizaciones automáticas |
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
