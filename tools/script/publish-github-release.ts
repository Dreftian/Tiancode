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
  const releaseName = `Tiancode v${version} - Fish Audio S2.1 Pro Ultra-Fluida, Soporte de Apps Nativas de Escritorio (WPF/GUI) & Live Preview Universal`
  const body = `## 🚀 Tiancode v${version} — Fish Audio S2.1 Pro Ultra-Fluida, Soporte de Apps Nativas de Escritorio & Live Preview Universal

### 🐟 Integración de Fish Audio S2.1 Pro (Voces Femeninas Ultra-Fluidas Free API)
- **Calidad de Estudio Hiper-Realista:** Integración con la API oficial gratuita S2.1 Pro de Fish Audio, proporcionando voces de locución humana con cadencia natural, respiración y prosodia impecable a 0% de consumo de CPU local.
- **Catálogo de Voces Femeninas en Español:** Acceso directo a voces curadas de alta calidad: *Natasha (Español Natural)*, *Española Conversacional y Viva*, *Española Profesional*, *Española Brillante y Dinámica*, *Española Neutra y Suave*, y *Española Conversación Natural*.
- **Selector y Prueba de Voz en Vivo:** Panel dedicado en Configuración > Voces con botón para probar la síntesis de voz, selector rápido de voces, soporte para claves personalizadas y enlace al directorio de modelos de la comunidad.

### 🖥️ Soporte Integral de Aplicaciones de Escritorio Nativas en Vista Previa
- **Detección Automática de GUI (.NET WPF / WinForms / Python GUI / Rust GUI):** Identificación inteligente de proyectos de escritorio (como C# con WPF, NAudio, Windows Forms, Tkinter, PyQt, etc.) evitando falsos bloqueos de puerto HTTP.
- **Ejecución Visible en Windows:** Lanzamiento del proceso sin ocultar la ventana (\`windowsHide: false\`), permitiendo al usuario interactuar directamente con la ventana nativa de su aplicación en el sistema operativo.
- **Panel Sandbox para Aplicaciones de Escritorio:** Interfaz dedicada con controles de proceso (\`▶ Ejecutar en Windows\`, \`■ Detener Aplicación\`, \`↻ Reiniciar\`), indicador de estado en tiempo real (En ejecución / Detenida) y terminal de logs en vivo (stdout / stderr) con botón de copiado.
- **Resolución Inmediata de URLs de Desarrollo:** Corrección en el algoritmo de enlace de Vista Previa para adoptar sin demora las URLs de desarrollo locales detectadas en los registros de ejecución.

### 🤖 Activación Automática de Sub-Agentes y UI Codex Desktop
- **Orquestación Autónoma de Enjambres:** Sub-agentes especializados (\`ui-ux-master\`, \`fullstack-coder\`, \`software-architect\`, \`devsecops-auditor\`, \`qa-e2e-tester\`) invocados automáticamente para tareas complejas.
- **Tarjetas Ejecutivas Estilo Codex Desktop:** Tarjetas de especialistas con distintivos de rol cromáticos, estado de pulso en vivo y visualización colapsable de directivas y resultados.

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
