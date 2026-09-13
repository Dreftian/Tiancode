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
  const releaseName = `Tiancode v${version} — El botón de mejorar prompt fallaba el 100 % de las veces, y ya sabemos por qué`

  const body = `## 🚀 Tiancode v${version}

### ✨ El optimizador nunca funcionó
No era tu modelo, ni la variante «Max», ni el 2x. **Fallaba siempre.** La respuesta se entrega como un flujo perezoso y el servidor sólo tira de él *después* de que el handler haya retornado — cuando ya se cerró el ámbito que le inyecta el contexto. Moría con «InstanceRef not provided» antes de que un solo byte llegara al proveedor, y el capturador de errores lo disfrazaba de fallo del modelo.

Lo interesante es **por qué nadie lo detectó**: ese contexto es una referencia con valor por defecto, así que su tipo dice \`never\` y el comprobador de tipos no ve nada que falte. Compilaba perfecto y fallaba siempre. Ahora el flujo lleva su propio contexto, sigue llegando palabra a palabra, **y va con un test HTTP contra la ruta real** que reproducía el fallo exacto antes del arreglo. No existía ninguno.

### 🎛️ Los iconos del chat que se pisaban
Medido: el grupo izquierdo ocupa **315 px rígidos a cualquier ancho** y ninguna etiqueta se recorta **nunca**, así que a partir de 505 px invade el grupo derecho. Tres cerrojos en serie — y el primero es el mismo bug que las filas de ajustes de esta versión: **ancho sobrescrito, \`flex\` no**. Ahora hay escalera por ancho del compositor (no de la ventana), recorte real con puntos suspensivos, y el botón de enviar sobrevive a cualquier tamaño.

### ⚙️ Ajustes de General que no hacían nada
El peor era **«Crear respaldo»**: llamaba a un método que el preload nunca expuso, así que la llamada se tragaba en silencio y te decía **«no hay datos que respaldar»** — una mentira sobre tus propios datos. Ya respalda de verdad. Se borran dos interruptores muertos (Terminal, Navegador interno) cuyos únicos lectores viven en una rama inalcanzable, y dos descripciones pasan a decir la verdad.

### 📐 Desbordes y la tarjeta de GitHub
El botón «Vetar» se salía de la ventana porque el campo lleva \`flex: none\` y sólo se le sobrescribe el ancho. Medido: **63 px fuera en «Vetar», 78,6 en «Permitir» y 210,9 en una fila de Conexiones que nadie había reportado**. La tarjeta de GitHub medía 757 px en un hueco de 608: ahora se parte en dos columnas, sin scroll y con margen a cualquier tamaño.

### 🗑️ Borrado: hacer todo lo posible
Cuando le das permiso y Windows se niega, ahora **escala**: reintenta, quita el sólo-lectura, **identifica qué proceso retiene el archivo** vía Restart Manager (sin administrador ni herramientas externas) y te da nombre y PID, programa el borrado para el próximo arranque, y sólo si se lo pides ofrece cerrar el proceso. Un borrado parcial ya no aborta al primer archivo bloqueado.

**Corrección a la premisa:** Tiancode no bloqueaba nada. Comprobado en máquina real: con permisos totales Windows **sigue** rechazando, porque es un bloqueo obligatorio del sistema — y lo sostenía la propia app lanzada desde \`release\\win-unpacked\`. Por eso no hay interruptor de «sin restricciones»: sería un control conectado a nada.

### 🔊 Voces
Se buscó de nuevo **midiendo**: descargué las muestras y calculé su frecuencia fundamental en vez de fiarme del nombre. Las seis etiquetas de sexo del catálogo eran correctas y los rechazos anteriores también. Piper para español está agotado (nueve voces, todas evaluadas), pero fuera de piper apareció una mejor: la más floja (16 kHz, «low», afinada desde una voz inglesa) se sustituye por **Karen Savage (es-MX)**, 22 kHz, sexo verificado y licencia comercial. Daniela (Argentina) se mantiene.

**Lo que no se puede:** DeepSeek nunca ha publicado un modelo de voz. Qwen sí, Apache-2.0, pero **sin ninguna voz en español** (sus timbres femeninos son chino, chino, japonés y coreano) y su motor no es ejecutable aquí sin añadir un runtime de +600 MB para sonar peor.

### ✅ Calidad
Typecheck **27/27** · Lint **0 errores** · **927** tests de frontend · **153** de escritorio · **83** de backend.

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
