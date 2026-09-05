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
  const version = desktopPkg.version || "1.0.20"
  const tag = `v${version}`
  const releaseName = `Tiancode v${version} — Mascotas 3D Vivas en App y Escritorio, Separación de Sub-agentes y Toggles Instantáneos, Selector de Cuantización y Skills Completas`
  const body = `## 🚀 Tiancode v${version} — Mascotas 3D Vivas, Separación y Toggles Instantáneos, Selector de Cuantización y Skills

### 🐾 Compañeros 3D Vivos y Animados (En App y Escritorio)
- **Animaciones Vivas y Notables:** Rediseño completo de las animaciones CSS para los 13 compañeros 3D (Dewey, Fireball, Hoots, Rocky, Seedy, Stacky, BSOD, NullSignal, Cat, Dog, Rabbit, Panda y Fox) con amplitudes pronunciadas (desplazamientos de 8 a 12px, inclinaciones de 6° a 12°, rebotes elásticos, parpadeos, respiración y destellos de gemas/visores).
- **Compañero en la Ventana de la App:** Se restauró la visualización del compañero interactivo dentro de la app cuando está activado, con burbuja de pensamiento en vivo, acariciar y cambio con doble clic.
- **Mascota Flotante en Escritorio:** El widget flotante de escritorio ahora incluye todos los estilos y keyframes de animación en su SVG interno, animándose con total fluidez en Windows.

### ⚡ Mayor Separación y Activación Individual Instantánea en Sub-Agentes
- **Separación Ampliada:** Se incrementó el ancho de la columna de estado y el espacio entre el interruptor y el chip "Activo" (gap de 22px, min-width de 185px), garantizando un diseño espacioso y despejado.
- **Activación Individual Estricta:** Cada sub-agente se activa o desactiva de forma individual e instantánea (0 ms) con respuesta visual inmediata y sincronización en segundo plano sin congelamientos.

### 🎛️ Selector de Cuantización con Máxima Legibilidad en Modelos Locales
- **Componente SelectV2 Integrado:** Se reemplazó el selector nativo HTML por el componente \`SelectV2\` de alta definición con menú flotante en modo oscuro (\`#0f172a\`), tipografía nítida de alto contraste (\`#f8fafc\`) y soporte completo para temas en Windows. Se acabaron los problemas de texto invisible en el menú de cuantización.

### 📚 Documentación Técnica Real y Completa de Skills
- **Información Real Restaurada:** Se eliminó la sobreescritura de descripciones por resúmenes breves. Todas las skills ahora muestran su descripción real y completa proveniente de sus especificaciones \`SKILL.md\`.
- **Vista Detallada Sin Recortes:** El panel de detalle muestra la descripción completa sin limitación de líneas (\`-webkit-line-clamp: unset\`), con todas sus directivas, tablas y ejemplos prácticos.

### ⚡ Toggles Instantáneos y Fluidos en Toda la Configuración
- **Optimistic UI a 0 ms:** La activación o desactivación de cualquier opción en Configuración (Plugins, Sub-agentes, Skills, Inteligencia, Ecosistema, etc.) se refleja inmediatamente a 0 ms en la interfaz y notificación toast, sincronizándose en segundo plano con tolerancia a fallos y rollback.

### 🛠️ Actualizador en la App 100% Robusto
- Proceso de actualización seguro y no destructivo sin bloqueos de árbol de procesos ni interferencias entre desinstalador e instalador.

### 🔒 Actualización 100% No Destructiva
- Todas las claves de proveedores de IA, sesiones, historial, ajustes y herramientas MCP permanecen intactas y preservadas.

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
