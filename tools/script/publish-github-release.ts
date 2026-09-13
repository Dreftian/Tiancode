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
  const releaseName = `Tiancode v${version} — La vista previa te dice qué pasó, y la bienvenida cabe en la pantalla`

  const body = `## 🚀 Tiancode v${version}

### 🔎 Cuando algo falla, ahora se ve
Lo que hacía que la vista previa pareciera poco profesional no era el diseño: eran los momentos en que algo iba mal.
- **Una compilación fallida no mostraba absolutamente nada.** El servidor marcaba el fallo y guardaba hasta 20 errores con archivo y línea — y la interfaz no los leía nunca. Ahora salen en un panel como \`src/App.tsx:12 — mensaje\`, **y la ubicación es pulsable**: te lleva al archivo en la pestaña Código.
- **Y encima los etiquetaba mal:** un error de compilación se mostraba como «No se pudo cargar {url} — ¿está el servidor arrancado?», con el servidor perfectamente vivo.
- **«Starting…» era una palabra sola sobre un panel en blanco durante un minuto.** El log del servidor ya se descargaba y se tiraba, porque la consola sólo se dibujaba para proyectos de escritorio. **Con censura de secretos**: ese log lo imprime tu propio proyecto, así que se enmascaran valores \`*_TOKEN\`/\`*_SECRET\`/\`*_PASSWORD\`, cabeceras \`Bearer\`, URLs con contraseña y formatos conocidos (\`sk-…\`, \`ghp_…\`, JWT) — el valor, nunca la línea, y antes de mostrarlo, así que lo que copias ya va limpio.
- **El punto de estado se ponía verde sin nada corriendo**, etiquetado «Fit» (que es el control de zoom).

### 👁️ Ahora se puede leer
Los avisos de error estaban a **1,24:1 de contraste** en el tema claro que la app usa por defecto — el botón «Reparar con IA», el inspector, la franja de error. El mínimo accesible es 4,5:1. Se **midió** cada reemplazo en vez de confiar en los tokens: el par «warning» tampoco pasa (2,35:1), así que no se usó. Ahora van de 5,2:1 a 17:1.

### 📄 La pestaña Código
- **El resaltador estaba hecho a mano y se equivocaba:** un simple \`// don't\` dejaba las cuatro líneas siguientes en verde, ignoraba los comentarios \`#\` de Python y regeneraba 192 KB de HTML por tecla. Sustituido por el visor que este repo **ya traía** — shiki, tema por variables CSS, virtualización y modo diff. Las líneas para conectarlo llevaban tiempo ahí, sin usar.
- **«Renombrar» no renombraba.** El backend sólo sabe escribir, así que copiaba el contenido a la ruta nueva y dejaba el original. Ahora se llama «Guardar en otra ruta».
- El botón «Guardar» era decorativo: el autoguardado limpiaba el estado antes de que diera tiempo a pulsarlo.

### 👋 Asistente de bienvenida
Más bonito y **la mitad de alto** (de ~500 px a ~250 px). Importa: la app lo abre en una ventana de 600 px y **el primer paso no cabía**. De 3 pasos a 2.
- **Un fallo que llevaba ahí desde siempre:** para decidir claro u oscuro comparaba el ajuste \`"system"\` con \`"dark"\`, que nunca es cierto. En un equipo con tema oscuro **la primerísima pantalla se pintaba entera en claro sobre fondo negro** — y el fondo que la rodea tenía el mismo error al revés.
- Otro: escribía el modo de color en \`data-theme\`, que guarda el **identificador** del tema, desactivando los colores de sintaxis hasta el siguiente repintado.

### 🐙 GitHub
La tarjeta se salía por arriba. Un contenedor centrado que desborda **recorta por igual arriba y abajo**, así que al crecer con la sección de capacidades el logo y el título quedaban fuera de la zona visible, sin forma de subir hasta ellos. Ahora se centra sólo cuando cabe, con margen garantizado a cualquier tamaño de ventana.

### ✅ Calidad
Typecheck **27/27** · Lint **0 errores** · **927** tests de frontend (+21) · **144** de escritorio · **54** del puente.

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
