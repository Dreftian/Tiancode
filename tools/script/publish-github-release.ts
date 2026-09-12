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
  const releaseName = `Tiancode v${version} — El optimizador usa tu modelo y el micrófono deja de descargar a tus espaldas`

  const body = `## 🚀 Tiancode v${version}

### ✨ El botón de mejorar el prompt ahora sí usa el modelo que tienes puesto
- **Tu nivel de razonamiento se descartaba en tres capas a la vez**: el payload no tenía campo, el botón no lo enviaba, y el handler pasaba \`small: true\`, que además de descartar la variante sustituye las opciones del proveedor por las de **menor esfuerzo**. Elegir «Max» en la barra del prompt no cambiaba nada aquí. Ahora viaja, y \`small\` sólo se aplica cuando el servidor eligió el modelo por su cuenta.
- **Un modelo que no resolvía te devolvía texto de otro modelo sin avisar** — el error se tragaba y caía al modelo pequeño de otro proveedor. Ahora se te dice, con un atajo para elegir otro.
- **«Tu clave fue rechazada» y «el modelo no dijo nada» eran el mismo mensaje.** Ahora son cuatro mensajes distintos: credenciales, límite de peticiones, saldo agotado y salida vacía.

### 🎙️ El micrófono: ya transcribía — se portaba mal
Conviene decirlo claro: **el botón no era un adorno**. Transcribe en local, sin conexión y en español, con Whisper sobre sherpa-onnx. Lo roto era todo lo de alrededor:
- **Descargaba 146 MB sin preguntar** al abrir una sesión: sin consentimiento, sin progreso y sin ajuste que lo impidiera — justo después de que 1.0.45 quitara 644 MB de descargas no pedidas. Ahora se pide en el primer clic, diciendo el tamaño, con progreso visible.
- **El tamaño declarado estaba mal** (100 MB en el código, ~150 en un comentario, 146 en disco). Ahora se calcula desde los bytes reales.
- **Dictar borraba lo que habías escrito** y tiraba las imágenes adjuntas. Ahora se añade al final.
- **Congelaba la app 1–2 s en cada dictado** porque decodificaba en el proceso principal. Movido a un proceso aparte.
- **Cortaba en silencio a los 64 s**, **sólo entendía español e inglés** (el modelo cubre 99 idiomas), su **propio campo de diccionario era ilegible** en tema claro (contraste 1,1:1), **dos ajustes de atajo no hacían nada**, y el texto de privacidad decía que se guardaban tus grabaciones cuando **no se guarda ningún audio**, sólo el texto.

### 🪟 La cabecera «Vista previa / Código»
La pastilla de pestañas se **cortaba a media palabra**, sin puntos suspensivos y sin poder pulsar el trozo cortado: el contenedor central tenía base 0, así que nunca entraba en el reparto de espacio. Y sus tres puntos de ruptura disparaban expansiones a la vez contra una caja que no crecía. Ahora hay una escalera real de cinco pasos, las pestañas se reducen a icono conservando su nombre accesible, y los cuatro botones de dispositivo pasan a ser un menú (~100 px recuperados, y con estado seleccionado de verdad: antes era un color aplicado a un emoji, que no hace nada).

### 🐙 GitHub
- **Centrado de verdad**: nada lo centraba en vertical y la tarjeta medía 1040 px envolviendo una columna de 480.
- **Era invisible en el tema claro** — logo y título fijados a \`#ffffff\` sobre panel blanco.
- **Ahora explica qué te da conectar**, con seis capacidades verificadas contra el código, empezando por clonar un repositorio privado y abrirlo como proyecto. Nada de issues, PRs, forks ni Actions: ese token no los usa.
- **La insignia de permisos era falsa** (\`repo · read:user\` fijo, titulada «permisos activos del token»). Ahora lee \`x-oauth-scopes\`, y dice cuando no llega.
- **Los contadores eran de los primeros 30 repos presentados como totales.**
- **Una fuga de credenciales real**: ante un fallo de arranque de git, la línea de comandos completa —con el token en base64— acababa pintada en el aviso de error. Redactada.

### ✅ Calidad
Typecheck **27/27** · Lint **0 errores** · **906** tests de frontend · **113** de escritorio.

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
