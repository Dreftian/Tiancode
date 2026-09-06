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
  const releaseName = `Tiancode v${version} — Motor de Actualización en Tiempo Real del Sandbox y Auto-Rebuild Incremental`
  const body = `## 🚀 Tiancode v${version} — Motor de Actualización en Tiempo Real del Sandbox y Auto-Rebuild Incremental

### ⚡ Motor de Reconstrucción Incremental Automática (Sandbox Hot-Engine)
- **Auto-Rebuild Reactivo:** Detecta scripts de compilación (\`build\`, \`build:web\`) en el proyecto (\`package.json\`) y reconstruye automáticamente en segundo plano cuando cualquier modelo de IA o el usuario modifica archivos en \`src/\`, templates o assets.
- **Watcher Recursivo de Workspace:** El file watcher de vista previa vigila la raíz completa del proyecto con debounce de 150ms, eliminando los puntos ciegos cuando la carpeta servida es \`dist/\` o \`build/\`.
- **Notificación Instantánea SSE:** En cuanto el build termina, emite un evento Server-Sent Events (\`reload\`) a todas las ventanas y vistas activas del Sandbox para reflejar los cambios al instante.
- **Diagnóstico Estructurado de Compilación:** Si el código fuente tiene errores de sintaxis o build, se reportan claramente en el estado de preview y en la consola sin dejar la pantalla en blanco.

### 🛡️ Cabeceras Anti-Caché Estrictas y Bypass de Caché de Navegador
- Servidor estático con cabeceras estrictas \`Cache-Control: no-store, no-cache, must-revalidate\`, \`Pragma: no-cache\` y \`Expires: 0\`.
- Recarga forzada del iframe mediante timestamps únicos (\`_t=\${Date.now()}\`) y postMessage bidireccional, garantizando que Chromium nunca sirva vistas cacheadas u obsoletas.

### 🔄 Despacho de Eventos Sin Bloqueos
- Eliminación de la limitación que impedía emitir eventos de recarga cuando se editaba consecutivamente el mismo archivo.
- Cada modificación generada por cualquier modelo (\`write\`, \`edit\`, \`apply_patch\`) dispara de inmediato la sincronización en vivo.

### 🖥️ Emulación Desktop y Multipágina para Aplicaciones como Khaos
- Inyección automática de host contenedor web para shells con marco de escritorio (\`#chrome\`), renderizando la vista activa (\`start.html\`) de forma nativa e interactiva.
- Traducción automática de esquemas personalizados como \`khaos-ui://app/\` para navegación directa en el sandbox.

### 📐 Preservación Total de Resoluciones y UI
- Funcionamiento fluido en todas las resoluciones (Desktop 1920x1080, Compact, MacBook, Laptop, Tablet, Móviles y TV) y modos de zoom.
- Mantiene el 100% de la interfaz existente sin alteraciones estéticas.

### 🔒 Actualización 100% No Destructiva
- Todas tus claves de API, configuraciones de voz, sesiones, MCPs y credenciales se mantienen completamente intactas.

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
