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
  const releaseName = `Tiancode v${version} — Las imágenes llegan al modelo y los paneles dejan de mentir`

  const body = `## 🚀 Tiancode v${version}

Nueve áreas investigadas contra el código real y después implementadas. El hilo común: donde había un control que prometía algo que el código no hacía, o se ha cableado de verdad o se ha borrado.

### 🖼️ Las imágenes del chat: tres causas distintas, las tres corregidas
- **El renderer enviaba una URL que no era un data URL.** Dos respaldos rotos acababan mandando la \`blob:\` URL tal cual, o un \`data:image/png;base64,\` vacío. El backend respondía «Image URL must be a base64 data URL».
- **Un error de imagen tumbaba el prompt entero.** Ahora cada adjunto falla por su cuenta y el resto del mensaje sí se envía.
- **El redimensionador llevaba muerto en las builds empaquetadas**: el parche de photon lee \`__OPENCODE_PHOTON_WASM_PATH\` y el código escribía otro nombre, así que **ninguna imagen se redimensionaba nunca** y una captura 4K salía al proveedor a tamaño completo → 400 imposible de rastrear.
- **175 modelos que sí leen imágenes decían que no**, porque el filtro de capacidades ignoraba la bandera \`attachment\` del catálogo.

### 🔄 El error al actualizar con un proyecto abierto
- «UnsupportedContentType» era literalmente el nombre del enum: \`ClientError\` usa el motivo como mensaje. Ahora se traduce a prosa en los siete idiomas.
- \`retry()\` **no podía reintentar precisamente esos errores** — comparaba el mensaje contra una lista de textos y nunca miraba \`.cause\`.
- Nada reconectaba la parte REST. Ahora la app detecta que el servidor volvió y recarga sola; el aviso sólo sale si el fallo persiste.
- El instalador mataba el servidor **antes** de instalar: si \`quitAndInstall\` fallaba, quedaba una ventana viva apuntando a un puerto muerto para siempre.

### 🧠 «Inteligencia»: de 14 controles, 4 funcionaban
Ahora hay **9 y todos llegan al agente**. Se cablean de verdad el destilador de salida de \`bash\`, la reparación de tool-calls, el cortacircuitos de bucles, la extracción web limpia y la creación de skills. Se borran cuatro que no existían en ninguna forma — incluido **el selector de sandbox host/docker/e2b**, que prometía aislamiento en contenedor mientras \`bash\` siempre ejecuta en la máquina con los permisos del usuario.

### 💻 «Uso de la PC»: 11 de 15 controles eran decorado
Fuera «Zona Segura», que venía **activada** y decía bloquear clics en gestores de contraseñas, banca online y ventanas de Administrador: no hay nada en el repo capaz de hacer clic, así que no bloqueaba nada. A cambio el panel gana dos capacidades **reales**: herramienta \`screenshot\` y portapapeles, con permiso propio y el del portapapeles preguntando siempre.

### ✨ El botón de mejorar el prompt
- **Borraba las imágenes adjuntas** al reemplazar el prompt entero por texto plano.
- **Mentía sobre qué motor respondía**: ante cualquier fallo caía a un «optimizador local» de 1.017 líneas — 425 de ellas un diccionario de erratas que cambiaba tu vocabulario — con un tecleo falso hecho con \`setTimeout\`. Borrado: si el modelo no responde, tu texto se queda como lo escribiste y te lo decimos.
- Ahora se puede cancelar, el deshacer sobrevive a seguir escribiendo, y todo está en los siete idiomas.

### 🔊 Voces, 🐾 Mascotas y 📦 Modelos Locales
- **Voces: de 27 tarjetas a 6**, todas femeninas y en español. Se retiran una voz masculina con nombre femenino inventado, otra masculina con licencia **no comercial** pese a declararse CC BY 4.0, y una voz de personaje sin cadena de licencia. **~644 MB menos de descarga** por usuario.
- **Mascotas**: las 13 en una cuadrícula, con descripción y rasgo **completos** (antes se cortaban a mitad de frase), traducidos a los siete idiomas, y estado real de la mascota del escritorio.
- **Modelos Locales**: deja de verse oscuro sobre tema claro (de 4 tokens de tema frente a 99 hexadecimales, a 101 frente a 25). Fuera una insignia de «modelo verificado» que no verificaba nada.

### 📚 Skills
- **El panel no cargaba nada**: llamaba a un método del SDK que no existe. Ya usa el endpoint real.
- Se incorpora **\`i-have-adhd\`** (MIT, © 2026 Ayoub Ghriss) como skill **opcional**, invocable con \`/i-have-adhd\`. Nunca se autoselecciona.

### 🧹 Estructura
Frontend a \`frontend/\`, auditorías a \`tools/docs/\`, 11 módulos sin referencias borrados y un panel MCP de 1.661 líneas inalcanzable retirado —portando antes su OAuth al panel que sí se usa—. Neto: **−3.400 líneas**.

### ✅ Calidad
Typecheck **27/27**. Lint **0 errores**. Frontend **906 tests, 0 fallos**. Desktop **112 tests, 0 fallos**.

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
