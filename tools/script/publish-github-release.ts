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
  const releaseName = `Tiancode v${version} - Inferencia Local GGUF Robusta, Integración de Chat y Correcciones Críticas`
  const body = `## 🚀 Tiancode v${version} — Inferencia Local GGUF, Integración Directa en Chat y Estabilidad

### ⚡ Novedades y Correcciones del Motor Local (GGUF / llama.cpp)
- **Activación y Uso Inmediato en Chat:** Los modelos locales descargados (.gguf) ahora se activan automáticamente, eliminando cualquier bloqueo previo en \`disabled_providers\` y sincronizando instantáneamente el catálogo con el selector de modelos del chat.
- **Resolución Multi-Directorio de Modelos y Binarios:** Soporte exhaustivo para escanear y localizar tanto archivos \`.gguf\` como el motor \`llama-server.exe\` a través de todas las ubicaciones candidatas de datos (XDG data, AppData Roaming, Local y directorio de la aplicación).
- **Conexión Directa en 1 Clic (Sin solicitud errónea de API Key):** Conectar "Tiancode Native / GGUF" en la pestaña de Proveedores ahora activa el motor local nativo inmediatamente sin requerir credenciales ni mostrar formularios innecesarios.
- **Corrección de TypeError Fatal en el Modal de Proveedores:** Blindaje contra referencias nulas al abrir o conectar proveedores cuando no están presentes en el catálogo activo (\`Cannot read properties of undefined (reading 'name')\`).
- **Respuesta Rápida y Streaming en Chat:** Configuración optimizada de \`baseURL\` en \`127.0.0.1:58282\` eliminando latencias de resolución IPv6 en Windows y soportando streaming directo de respuestas.
- **Actualización 100% No Destructiva:** Preserva íntegramente las sesiones, configuración, modelos descargados y claves API existentes del usuario.

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
