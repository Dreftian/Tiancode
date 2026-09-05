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
  const version = desktopPkg.version || "1.0.16"
  const tag = `v${version}`
  const releaseName = `Tiancode v${version} — Corrección de Actualizador en la App, Sub-agentes y Toggles Instantáneos, Mascotas 3D y Skills`
  const body = `## 🚀 Tiancode v${version} — Corrección de Actualizador en la App, Sub-agentes y Toggles Instantáneos

### 🛠️ Corrección Crítica en el Actualizador Automático
- **Ciclo de Vida Limpio del Instalador:** Se corrigió la terminación de procesos en el instalador NSIS para no usar el flag de árbol \`/T\` al cerrar instancias previas de la app. Esto evita que el instalador termine prematuramente su propio proceso hijo cuando es lanzado por \`electron-updater\`.
- **Aislamiento del Desinstalador:** Se aisló \`customCheckAppRunning\` y \`customInit\` dentro de \`!ifndef BUILD_UNINSTALLER\` para garantizar que el proceso de desinstalación previa nunca intente terminar la instancia principal del instalador durante una actualización.
- **Tolerancia a Fallos en Actualización:** Se añadió \`customUnInstallCheck\` para permitir que la actualización continúe limpiamente sin interrupciones ni cuadros de diálogo residuales.

### ⚡ Reactividad Instantánea (0 ms) y Separación en Sub-Agentes
- **Sub-Agentes Individuales e Instantáneos:** Separación aumentada (18px) entre el interruptor y la etiqueta de estado "Activo". Activación estrictamente individual e instantánea (0 ms) con animación fluida y sincronización en segundo plano sin bloqueos.
- **Configuración Global Instantánea:** Toggles y notificaciones inmediatas en Servidores MCP, Plugins integrados, Plugins de catálogo y Skills, eliminando retardos perceptibles.

### 🐾 Mascotas 3D Prominentes y Animadas
- **Animaciones Vivas y Distintivas:** Los 13 compañeros interactivos cuentan con animaciones CSS fluidas (flotación, balanceo, respiración, parpadeo, llamas y destellos de gemas/visores).
- **Contenedores Ampliados:** Contenedor de mascota expandido a 56px con icono de 44px y resplandor dinámico en el compañero activo.

### 🎛️ Selector de Cuantización en Modelos Locales
- **Alto Contraste y Legibilidad:** Dropdown de cuantización GGUF con \`color-scheme: dark\`, fondo oscuro (\`#0f172a\`) y texto de alto contraste (\`#f8fafc\`), garantizando perfecta legibilidad en Windows/Electron.

### 📚 Documentación Técnica Completa en Skills
- **Contenido Exhaustivo Restaurado:** Se preserva el 100% de la documentación técnica completa, tablas, directivas y ejemplos prácticos de todas las skills sin sustituciones por textos breves o incompletos.
- **Carga Robusta:** El motor de skills carga la totalidad de skills integradas con su documentación nativa completa.

- **Buscador Prominente y Sugerencias Rápidas:** Barra de búsqueda espaciosa con etiquetas directas ("DeepSeek-R1", "Qwen 2.5 Coder", "Llama 3.2", "Gemma 2", "Phi-4", "Nemotron").
- **Hero Inicial Explicativo:** Vista limpia sin volcar modelos de golpe; las tarjetas técnicas completas se despliegan al buscar o filtrar.

### 📋 Listas Detalladas en Columnas y Paginación 10x10
- **Sub-Agentes:** Holgura amplia entre el switch y el indicador de estado sin colisiones visuales.
- **MCP y Plugins:** Tablas estructuradas para Servidores MCP, Plugins Instalados y Built-in Integrados con paginación de 10 en 10.
- **Colores de Tema Dinámicos:** Los badges y estados activos respetan el color de acento del tema activo (\`var(--interactive-accent)\`).

### 🌌 Asistente de Bienvenida Sin Scroll
- Eliminación de scrollbars horizontales y verticales (\`overflow: hidden !important\`), fondo \`#08080a\` a juego con la web y tarjeta editorial flotante \`rgba(14, 14, 18, 0.92)\`.

### 🔒 Actualización 100% No Destructiva
- Se preservan de forma segura todas las claves de proveedores, configuraciones, sesiones y herramientas MCP del usuario.

### 📦 Descargas
| Archivo | Tipo | Descripción |
|---|---|---|
| [**Tiancode.exe**](https://github.com/Dreftian/Tiancode/releases/download/${tag}/Tiancode.exe) | Instalador Windows | Instalador oficial con tema Glass y actualizador automático |
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
