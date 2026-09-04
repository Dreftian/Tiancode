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
  const releaseName = `Tiancode v${version} - Detección de Micrófonos de PC, Modo 2x Ultra-Rápido & Optimizador de Prompts`
  const body = `## 🚀 Tiancode v${version} — Detección de Micrófonos, Modo 2x & Optimizador de Prompts

### 🎙️ Detección y Selección de Micrófonos de la PC
- **Enumeración Dinámica de Hardware:** Detección de todos los micrófonos conectados a la PC mediante \`navigator.mediaDevices.enumerateDevices\` con actualización automática en caliente (\`devicechange\`).
- **Selector en la Interfaz:** Menú contextual (clic derecho en el botón de dictado) que lista los dispositivos, marca el micrófono activo con \`✓\` y distingue el micrófono predeterminado del sistema.
- **Diagnóstico Proactivo:** Comprobación previa de hardware disponible; si no se detecta ningún micrófono conectado, se muestra una advertencia clara para evitar fallas silenciosas de grabación.

### ⚡ Modo 2x Ultra-Rápido para el Agente de IA
- **Entrega Directa al LLM en el Backend:** Corrección en el núcleo de ejecución de sesiones (\`prompt.ts\`) garantizando que las directivas del sistema (\`lastUser.system\`) se inyecten siempre en el prompt del modelo.
- **Ejecución Inmediata sin Rodeos:** Supresión de introducciones conversacionales, saludos y preámbulos. Invocación instantánea de herramientas de lectura, búsqueda y edición para máxima velocidad de respuesta.

### ✨ Optimizador Inteligente de Prompts & Corrección de Erratas
- **Corrección Ortográfica Avanzada:** Diccionario semántico que corrige erratas habituales de teclado y términos técnicos mal escritos en español e inglés (\`inpurt\` → \`input\`, \`microfono\` → \`micrófono\`, \`axcrtualizar\` → \`actualizar\`, \`portavle\` → \`portable\`).
- **Inferencia de Intención:** Reestructuración de instrucciones ambiguas en objetivos claros (\`🎯 Objetivo Principal\`, \`📋 Requerimientos y Directivas Clave\`, \`🛠️ Directivas de Ejecución\`) sin alterar extensiones de archivo (\`.ts\`, \`.py\`, etc.).

### 🌐 Vista Previa Sandbox Universal & Explorador de Código
- **Detección Recursiva de Proyectos:** Detección inteligente de cualquier proyecto web o aplicación tanto en la raíz como en subcarpetas.
- **Live Reload Instantáneo a Milisegundos:** Recarga en tiempo real mediante SSE y monitoreo nativo con debounce de 25ms.
- **Sidebar de Código Redimensionable:** Barra lateral con arrastre para redimensionar y scroll horizontal automático.

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
