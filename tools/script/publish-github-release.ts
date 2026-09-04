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
  const version = desktopPkg.version || "1.0.6"
  const tag = `v${version}`
  const releaseName = `Tiancode v${version} - Cero Parpadeo en Configuración, Animación 3D Cósmica Vercel & Voces Fish Audio Ultra-fluidas`
  const body = `## 🚀 Tiancode v${version} — Cero Parpadeo en Configuración, Animación 3D Cósmica Vercel & Voces Fish Audio Ultra-fluidas

### ⚡ Eliminación Definitiva del Parpadeo de Fondo al Abrir Configuración
- **Aislamiento de Capas GPU en Diálogo:** Se integró \`isolation: isolate\`, \`contain: layout paint\` y aceleración por hardware (\`transform: translateZ(0)\`) en la ventana modal de configuración, impidiendo la invalidación del compositor de Chromium y eliminando cualquier repintado en el chat.
- **Lazy Mounting Inteligente con Persistencia (Estilo OpenCode):** Las pestañas ahora se montan bajo demanda en el primer clic y se mantienen en caché con \`forceMount\`, garantizando cambios instantáneos a 0ms sin sobrecargar el DOM.
- **AudioWaveform en Pausa Inactiva:** Se detuvo el bucle \`requestAnimationFrame\` innecesario cuando el componente está inactivo y se eliminaron las señales de estado a 60 FPS que reactivaban el virtualizador de mensajes.

### 🌌 Animación 3D Cósmica Oficial de Carga (Port de tiancode.vercel.app)
- **Motor de Constelaciones 3D Completo:** Port directo del motor cósmico de la web oficial a Canvas 2D interactivo con proyección en perspectiva 3D (\`fov: 520\`).
- **Logo del Gato Cósmico Tiancode en 3D:** Polígonos vectoriales exactos de los ojos radiantes, sonrisa estelar y colmillos felinos formados por estrellas ensambladas desde el espacio profundo.
- **Letras 3D "TIANCODE":** Rotación sutil y profundidad geométrica tridimensional con brazos espirales galácticos, auroras cósmicas y destellos de difracción en cruz (\`+\`).

### 🐟 Voces Femeninas Fish Audio S2.1 Pro Free
- **Integración Nativa con IPC Bridge:** Verificación y validación de las 6 voces femeninas en español con el modelo gratuito \`s2.1-pro-free\` sin límites de CORS.
- **Streaming y Respuesta Inmediata:** Latencia inferior a 100ms con reproducción en búfer de alta fidelidad.

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
