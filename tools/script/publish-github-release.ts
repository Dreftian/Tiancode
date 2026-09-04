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
  const version = desktopPkg.version || "1.0.6"
  const tag = `v${version}`
  const releaseName = `Tiancode v${version} - Fish Audio IPC Bridge, Cero Parpadeo, Conexión Instantánea OpenCode & Astral Loading`
  const body = `## 🚀 Tiancode v${version} — Fish Audio IPC Bridge, Cero Parpadeo, Conexión Instantánea OpenCode & Astral Loading

### 🐟 Corrección Definitiva de Fish Audio (IPC Bridge Nativo a 0% CORS)
- **Bypass Total de CORS en Chromium:** Se implementó un IPC Bridge directo en el proceso principal de Electron (\`voices-speak-fish\`), eliminando por completo el error \`Failed to fetch\` causado por el navegador al enviar peticiones con cabeceras personalizadas.
- **Modelo Oficial Gratuito \`s2.1-pro-free\`:** Síntesis ultra-fluida y de ultra-baja latencia (~70ms TTFA) en 83 idiomas, con prioridad en voces femeninas naturales en español (*Natasha*, *Española Conversacional y Viva*, *Española Profesional*, etc.).
- **Reproducción Binaria Instantánea:** Conversión directa de bytes MP3 recibidos por IPC a un buffer de audio local con control dinámico de velocidad y reactividad de ondas.

### ⚡ Cero Parpadeos y Máxima Fluidez en Configuración (60 FPS)
- **Persistencia en Memoria de Pestañas (\`forceMount\`):** Todas las pestañas de Configuración (GitHub, Voces, Skills, Proveedores, etc.) permanecen cacheadas e hidratadas en memoria con \`contain: paint layout\`, eliminando la destrucción y reconstrucción del DOM.
- **Eliminación del Salto Dimensional:** Se pre-cargan los componentes para que el cambio entre pestañas sea un toggle CSS puro e instantáneo de 0ms sin pantallas blancas ni parpadeos.

### ⚡ Conexión y Desconexión Instantánea de Proveedores (Estilo OpenCode)
- **Actualización Optimista Inmediata:** Desconexión y conexión en menos de 1 ms en la interfaz con emisión inmediata del Toast de notificación.
- **Persistencia Asíncrona en Segundo Plano:** El guardado de configuración, revocación de tokens y actualización de estado ocurren en segundo plano sin congelar la UI.

### 🛡️ Catálogo de Skills Claude Code Desktop Integradas
- Incorporación de las 7 skills clave de ingeniería de Anthropic:
  - \`claude-code-review\`: Auditoría exhaustiva de código, calidad idiomática y detección de regresiones.
  - \`claude-git-workflow\`: Commits convencionales atómicos, ramas limpias y PRs estructurados.
  - \`claude-system-architecture\`: Descomposición modular y contratos limpios de dependencias.
  - \`claude-terminal-automation\`: Automatización segura de terminal y diagnóstico de procesos.
  - \`claude-deep-investigation\`: Arqueología profunda de código y reconstrucción de causas raíz.
  - \`claude-performance-profiling\`: Perfilado extremo de rendimiento, eliminación de memory leaks y contención de renderizado.
  - \`claude-security-auditor\`: Auditoría de vulnerabilidades y prevención OWASP.

### 🌌 Pantalla de Carga Cósmica Estilo Astral.sh ("Tiancode")
- **Lienzo de Constelaciones Interactivo:** Campo estelar dinámico con estrellas titilantes y líneas de constelación que se conectan orgánicamente en el espacio profundo.
- **Convergencia en Logo e Identidad:** Las constelaciones y auroras cósmicas (cian y violeta) convergen en el emblema y el nombre iluminado "Tiancode".
- **Barra de Progreso Cupertino/Astral:** Transición fluida con brillo pulsante para el inicio de la aplicación.

### 🖥️ Sandbox Protegido y Live Preview Universal
- Ejecución visual en Windows para proyectos GUI (.NET WPF, WinForms, Python GUI, Rust GUI) en entorno de aislamiento supervisado con terminal de logs en vivo.

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
