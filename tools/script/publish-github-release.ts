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
  const version = desktopPkg.version || "1.0.38"
  const tag = `v${version}`
  const releaseName = `Tiancode v${version} — La bienvenida vuelve tras cada actualización y «Uso de la PC» por fin controla algo`

  const body = `## 🚀 Tiancode v${version}

### 👋 Asistente de bienvenida
- **Ahora vuelve a salir cuando actualizas**, no sólo al instalar. Pero no repite el interrogatorio: tras una actualización es **una sola pantalla de confirmación** con tus respuestas anteriores ya marcadas —leídas de los ajustes reales, no de una copia— y un único botón. En instalación nueva sigue el asistente completo.
- **El portable ya hacía lo que pedías**: guarda su estado en \`<carpeta del .exe>\\data\`, así que viaja con el pendrive y sale una vez por pendrive. No hizo falta tocarlo.
- **Dos preguntas nuevas y gratis**: mascota de escritorio y leer las respuestas en voz alta. La de voz usa el ajuste que recurre a las voces de Windows cuando no hay modelo, así que **no dispara ninguna descarga** — habría deshecho justo lo que quitamos en 1.0.45 y 1.0.46.
- **Cuatro ajustes que no guardaban nada**: \`tiancode.sound.enabled\`, \`tiancode.autoupdate.enabled\`, \`tiancode-lang\` y \`tiancode-theme\` aparecen una sola vez en todo el frontend — la escritura. Fuera.
- **Había DOS asistentes de bienvenida vivos**, con dos puertas distintas. El segundo no se veía nunca… salvo que las dos claves se desincronizaran. Eliminado con cuidado: hacía dos cosas más en *cada* arranque que había que conservar, y una mantenía la pantalla de carga esperando.
- **Medido a 1025×560**: paso 1 = 311 px de alto contra 528 disponibles, y la pantalla de carga deja 138 px de holgura bajo el emblema.

### 🖥️ «Uso de la PC»: ahora todos los controles hacen algo
La 1.0.47 añadió la herramienta de ratón y teclado **sin ninguna interfaz**. Ya la tiene.
- **Permiso del navegador — y aquí había una trampa.** El valor por defecto del sistema de permisos es \`"*": "allow"\`, así que **hoy el agente puede leer y manejar el navegador integrado en cualquier sitio sin preguntar nunca**. Una lista de «sitios permitidos» encima de eso habría mostrado dos entradas mientras en realidad estaban todos permitidos. Elegir «preguntar en cada sitio» escribe la regla base de verdad. **Es un cambio de comportamiento** y está etiquetado como tal.
- **Sitios permitidos**: listar, añadir y revocar — diciendo en el propio panel que los «Siempre» aceptados dentro de una sesión **no se guardan en disco**, así que no salen ahí y se pierden al cerrar.
- **Dónde se abren los enlaces** · **Cookies del navegador integrado** (sólo dos valores: Electron no deja cambiar la partición de un webview una vez ha navegado; se limpian **al arrancar**, porque los manejadores de salida son síncronos y el borrado no).
- **Interruptor maestro del control del ordenador**, guardado **fuera del archivo de proyecto**: \`tiancode.json\` lo puede reescribir el propio agente con la herramienta de edición.
- **Lista de ejecutables denegados**, persistente. Se compara por nombre de ejecutable — dos programas con el mismo nombre son indistinguibles y renombrarlo lo esquiva. El panel lo dice.

**Lo que me negué a poner:** un interruptor único para «dev servers + navegación + capturas» (las herramientas integradas no pasan por el filtro de permisos); un selector de «navegador preferido» con Chrome (nada aquí controla un navegador externo, y Chrome y Edge rechazan el puerto de depuración sobre el perfil por defecto); y «mostrar aplicaciones al terminar» (Tiancode nunca oculta una aplicación). **Y se borró \`browser.tsx\` entero**: sus tres interruptores estaban fijados en «activado» con un manejador que sólo mostraba un aviso.

### 📑 Vista de transcripción
**Normal / Pensando / Detallado** en Ajustes → Apariencia, con **anulación por sesión** desde el menú de la conversación. Sustituye a los tres interruptores sueltos: dejarlos al lado habría sido peor, porque escriben lo mismo y el último que tocaras dejaría al otro mostrando un valor falso.

### ✅ Calidad
Typecheck **27/27** · Lint **0 errores** · **927** tests de frontend · **150** de escritorio · **98** de session-ui.

### 🔄 Actualización 100% no destructiva
Todas tus claves de proveedores, configuraciones, sesiones, backups y servidores MCP se preservan intactos.
Desde la app: **Ayuda → Buscar actualizaciones**.

### 📦 Descargas Oficiales
| Archivo | Tipo | Descripción |
|---|---|---|
| [**Tiancode.exe**](https://github.com/Dreftian/Tiancode/releases/download/${tag}/Tiancode.exe) | Instalador Windows | Instalador oficial con actualizaciones automáticas no destructivas |
| [**Tiancode-portable.exe**](https://github.com/Dreftian/Tiancode/releases/download/${tag}/Tiancode-portable.exe) | Portable Windows | Ejecutable autónomo sin instalación ni permisos administrativos |
| [**latest.yml**](https://github.com/Dreftian/Tiancode/releases/download/${tag}/latest.yml) | Metadatos | Manifiesto criptográfico para el auto-updater |
`

  console.log(`[1/4] Verificando release ${tag} en GitHub...`)
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "User-Agent": "Tiancode-Release-Script",
  }

  let releaseData: any
  // Un borrador todavía no tiene tag, así que GET /releases/tags/<tag> nunca lo encuentra y
  // se acabaría creando una segunda release al lado. Se busca en el listado, que sí los incluye.
  const listRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/releases?per_page=100`, { headers })
  const existing = listRes.ok
    ? ((await listRes.json()) as any[]).find((r) => r.tag_name === tag)
    : undefined
  const getRes = existing
    ? { ok: true, json: async () => existing }
    : await fetch(`https://api.github.com/repos/${owner}/${repo}/releases/tags/${tag}`, { headers })
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

  // Saltarse un asset sólo por el tamaño no vale para los metadatos: `latest.yml` mide siempre
  // lo mismo (los campos son base64 de ancho fijo), así que una segunda compilación dejaba en la
  // release el sha512 del binario anterior y el auto-updater rechazaba la descarga. Para los
  // archivos pequeños se comparan los bytes; para un instalador de 380 MB el tamaño basta.
  const SIZE_ONLY_SKIP_BYTES = 2 * 1024 * 1024

  const sameAsPublished = async (asset: { browser_download_url?: string; size: number }, localPath: string) => {
    const local = readFileSync(localPath)
    if (asset.size !== local.length) return false
    if (local.length > SIZE_ONLY_SKIP_BYTES) return true
    if (!asset.browser_download_url) return false
    const res = await fetch(asset.browser_download_url).catch(() => undefined)
    if (!res?.ok) return false
    const published = Buffer.from(await res.arrayBuffer())
    return published.equals(local)
  }

  for (const file of filesToUpload) {
    console.log(`[Upload] Preparando ${file.name}...`)
    const existingAsset = releaseData.assets?.find((a: any) => a.name === file.name)
    if (existingAsset && (await sameAsPublished(existingAsset, file.path))) {
      console.log(`✓ ${file.name} ya está subido y es idéntico, se omite`)
      continue
    }
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
