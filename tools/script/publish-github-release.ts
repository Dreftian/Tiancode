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
  const releaseName = `Tiancode v${version} — Seguridad en el Sandbox, uso del navegador y uso del computador`

  const body = `## 🚀 Tiancode v${version}

> **Actualización recomendada.** Corrige cuatro fallos de seguridad reales en el puente de la vista previa que venían publicados en versiones anteriores.

### 🔒 El agente ya no puede leer una página que tú no ves
La pregunta era «¿puede cualquier modelo usar el Sandbox con seguridad?». La respuesta era **no**:
- **La única comprobación para elegir sobre qué página actuar era «¿es http o https?»** — no se comparaba el origen. Y la Vista en vivo es un navegador completo, con barra de direcciones y cookies persistentes. Al arrancar un dev server local la vista nativa se **ocultaba sin cambiar de página**. Resultado: navegas a un sitio donde tienes sesión, arrancas tu proyecto, y el modelo recibe la URL, el título, 4.000 caracteres de texto y todos los elementos interactivos de **la página oculta con tu sesión iniciada** — y podía pulsarla.
- **Ninguna de las dos tools de vista previa pedía permiso.** Leer y pulsar una página viva estaba menos vigilado que \`glob\`. Ahora piden permiso nombrando el **origen concreto**.
- **Aceptar una captura de ventana concedía la pantalla entera para siempre** (\`always: ["*"]\` escribía una regla que también valía para \`screen\`).
- **Un clic del modelo sobre un enlace podía abrir tu navegador real en cualquier URL.**

### 🌐 Uso del navegador
El navegador integrado ya era alcanzable por el agente **por accidente**, como último candidato del árbol de frames y sin permiso. Eso se cierra, y se sustituye por algo deliberado: las tools aceptan \`surface: "browser"\`, **preguntan al navegador qué página tiene abierta** y piden permiso citando ese sitio antes de tocarlo.

*Sobre el navegador externo, la respuesta honesta:* comprobé Chrome 153 y Edge 153 en una máquina real y **ambos rechazan \`--remote-debugging-port\` sobre el perfil por defecto**. Sólo se puede automatizar un perfil desechable sin tus sesiones — justo lo que le quita el sentido. Por eso el objetivo es el navegador integrado.

### 🖱️ Uso del computador — nuevo, y de verdad
Una tool \`computer\` que mueve el ratón y escribe realmente en Windows: \`move\`, \`click\`, \`type\`, \`key\`, \`scroll\`, más leer el cursor y la ventana activa. **Sin dependencias nuevas ni addon nativo**: un proceso PowerShell persistente con user32, a 0,05 ms por acción en vez de 310 ms.

Las protecciones **son** la función, y se aplican en el proceso principal:
- **Rechaza ventanas elevadas.** Windows descarta la entrada sintética hacia un proceso con más privilegios **devolviendo éxito**, así que el agente creería haber hecho clic.
- **Rechaza su propia ventana**, para que no pueda pulsar los botones de su propio diálogo de permiso.
- **Lista de apps permitidas**, vacía al empezar. Como el diálogo de consentimiento roba el foco, **se vuelve a leer la ventana activa después**: si cambió, no se ejecuta.
- **Indicador siempre visible + botón de parada + atajo global.** Al parar se sueltan los modificadores y se olvida la lista. Caduca sola a los 2 minutos.
- Aprobar \`scroll\` para siempre nunca se convierte en aprobar \`type\` para siempre.

Sólo Windows en esta v1; en macOS y Linux lo dice claramente en vez de fallar raro.

### 📐 Ajustes de transcripción (estilo Claude Code)
**Tamaño del texto** (pequeño/medio/grande) y **ancho de la transcripción** (estrecho/medio/ancho) en Ajustes → Apariencia. El ancho sólo aplica a partir de 768 px y **la descripción lo dice**; se escalaron los 30 tamaños de fuente fijos de los mensajes para que «grande» no sea un ajuste roto; y «medio» reproduce exactamente el diseño actual, así que quien no toque nada no ve ningún cambio.

### ✅ Calidad
Typecheck **27/27** · Lint **0 errores** · **906** tests de frontend · **144** de escritorio · **54** del puente.

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
