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
  const version = desktopPkg.version || "1.0.13"
  const tag = `v${version}`
  const releaseName = `Tiancode v${version} — Hub de Modelos Locales, Vistas en Lista 10x10, GitHub Avanzado y Dictado Nativo`
  const body = `## 🚀 Tiancode v${version} — Hub de Modelos Locales, Vistas en Lista 10x10, GitHub Avanzado y Dictado Nativo

### 🖥️ Hub de Modelos Locales de Nueva Generación
- **Diseño Espacioso de Ancho Completo:** Eliminada la barra lateral comprimida; ahora los modelos se presentan en tarjetas amplias con especificaciones detalladas, selector directo de cuantizaciones (Q4, Q8, FP16) con tamaños reales en disco e indicadores de ajuste en RAM/VRAM.
- **Categorización Inteligente:** Filtros por Staff Picks, Coding, Razonamiento R1, Modelos Ligeros (<4GB) y Descargados.
- **Benchmarks y Gestión Directa:** Descarga, activación, benchmarks locales de velocidad y eliminación con un solo clic.
- **Paginación 10x10:** Navegación fluida de 10 en 10 sin barras de scroll infinitas.

### 📋 Vistas en Lista Estructuradas y Paginación 10x10 (SettingsPagerV2)
- **Sub-Agentes:** Tabla en columnas detallada (Sub-Agente, Rol & Especialidad, Modelo, Herramientas, Estado, Acciones) con paginación de 10x10.
- **Mascotas:** Lista estructurada con las 13 mascotas oficiales, rasgos y especies, selección instantánea y paginación 10x10.
- **MCP y Plugins:** Tienda de extensiones/herramientas en lista organizada con paginación 10x10.
- **Voces:** Catálogo de voces en lista organizada con ecualizador de estudio y paginación 10x10.

### 🐙 Integración con GitHub Pulida y Avanzada
- **Perfil Enriquecido:** Anillo de estado en línea, métricas dinámicas (Total, Públicos, Privados) y confirmación de permisos (\`repo\`, \`read:user\`).
- **Creación Directa de Repositorios:** Formulario integrado para crear repositorios públicos o privados en GitHub sin salir de Tiancode.
- **Filtros y Paginación:** Filtros por visibilidad (Todos, Públicos, Privados), búsqueda en tiempo real y lista paginada de 10 en 10 con acciones de clonado directo y acceso web.

### 🎙️ Micrófono y Dictado Nativo Instantáneo
- Reconocimiento de voz ASR con modelos ONNX locales listos de inmediato (\`status: ready\`), eliminando la alerta de "Descargando..." al pulsar el botón de dictado.

### ✨ Motor de "Mejorar Input" y Modo Chat x2
- **Mejorar Input de Alta Fidelidad:** Corrección ortográfica inteligente en español e inglés y prompts técnicos ejecutables sin plantillas robóticas.
- **Chat x2 Fiel:** Activar el multiplicador x2 conserva íntegramente la variante seleccionada por el usuario sin degradar a \`low\`.

### 🌌 Splash al 95% y Bienvenida Cósmica Astra
- Corregida la tipografía "TIANCODE" (trazo inferior de la letra 'E') y contraste facial del gato cósmico.
- Asistente de bienvenida con fondo Astra espacial luminoso sin recuadros oscuros.

### 🔒 Actualización No Destructiva
- Todas las claves de proveedores, configuraciones, sesiones y herramientas MCP se conservan íntegras tras la actualización.

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
