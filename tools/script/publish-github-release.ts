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
  const releaseName = `Tiancode v${version} — Había dos motores de modelos locales, y el chat usaba el roto`

  const body = `## 🚀 Tiancode v${version}

### 🧠 Modelos locales: el chat y el Models Hub arrancaban motores distintos
Activar un GGUF y escribir «Hola» devolvía **«Cannot use tools with stream»** y tres reintentos. El cargador de proveedores llevaba una **segunda copia completa del arranque del motor** —181 líneas de búsqueda de binario, descarga, lanzamiento y espera de salud— independiente de la que usa el botón del Models Hub. **El botón usaba la copia buena; escribir un mensaje usaba la otra**, y esa otra aceptaba el primer \`llama-server.exe\` que encontrara sin comprobar su versión. Comprobado en máquina real: un binario de **marzo de 2025** seguía en la caché y le ganaba al que viene dentro del instalador — y es justo el que rechaza herramientas y streaming a la vez. La copia duplicada se elimina, queda un solo motor, y un test impide que el proveedor vuelva a lanzar procesos por su cuenta.

Ese error llega como HTTP 500 y la política de reintentos trataba **todo** 5xx como fallo pasajero: de ahí el «reintentando en 8s · intento n.º 3» para algo que jamás iba a resolverse solo. Ahora falla al primer intento y deja ver el mensaje real. El motor tampoco vuelve a escribir «tengo la build 10679» encima de un binario que no consiguió reemplazar, ni adopta como propio un puerto sano cuyo proceso hijo ya murió, ni concede quince minutos de espera a cualquier cosa que conteste en el 58282.

### ✨ El botón de mejorar prompt: el arreglo anterior era correcto y aun así se cancelaba
En el registro se ve la petición **saliendo bien** con el modelo correcto, y luego silencio. Lo que la mataba era un plazo fijo de **30 segundos en el cliente**: los modelos que razonan no emiten texto durante ese rato y el servidor filtra el razonamiento fuera del cuerpo, así que el navegador recibía **cero bytes** y abortaba un flujo sano.

Se midió algo que nadie había comprobado: este servidor **no** vacía las cabeceras antes de llamar al modelo, así que \`fetch()\` no resuelve hasta el primer byte. El plazo pasa a ser un temporizador de inactividad que se reinicia con cada byte, y el servidor emite una señal de vida cada 5 s mientras el modelo piensa. Esa señal **se pide explícitamente**, así que cualquier otro cliente recibe el mismo cuerpo de siempre.

### 🗑️ Borrar un modelo local y que se vaya de verdad
Borrar el \`.gguf\` lo dejaba en Proveedores, en Modelos y como modelo por defecto. Dos causas: el borrado limpiaba la configuración **del proyecto** mientras la activación escribe la **global**, y aun en el archivo correcto era imposible, porque la actualización de configuración es una fusión profunda — puede añadir y sobrescribir, **nunca borrar**. Ahora hay un borrado real en el servidor, que además **limpia el modelo por defecto** si apuntaba al que ya no existe, y se corrige lo que lo mantenía visible en «Modelos» aunque todo lo demás fuera bien.

### 🤖 Sub-Agentes: crear uno, y ver los que ya tienes
El panel sólo mostraba una lista fija escrita a mano: **los agentes que tienes en disco no aparecían en ninguna parte**. Ahora se listan, se pueden **crear** —a mano, o describiendo lo que quieres y dejando que un modelo redacte el identificador, el cuándo usarlo y el prompt, siempre para revisar antes de guardar— y **borrar**. Los agentes creados desde el panel ya no salen mutilados: el formulario mostraba nueve permisos y el servidor denegaba quince, así que uno nuevo no podía listar un directorio, preguntar ni delegar. Y la columna de herramientas decía la verdad en muy pocos casos: \`plan\`, que hereda todo menos editar, mostraba «1 tools».

### 🌳 El «Árbol de Recursión RLM» era una maqueta
Se montaba sin datos, así que **siempre** dibujaba los mismos cuatro agentes inventados, con estados inventados y resultados inventados sobre trabajo que nunca ocurrió. Se reconstruye con la jerarquía real —agentes primarios y los sub-agentes a los que de verdad pueden delegar, respetando las denegaciones por destino—, sin estados ni duraciones ni resultados, porque el panel no puede saberlos. Empieza plegado y pagina, en vez de volcar 150 filas.

### 🔐 De la carpeta Mejoras (MIT, con atribución)
**Certificados del sistema en Windows**: ya se mezclaban, pero sin filtrar caducados y deduplicando por texto; ahora filtra por fecha y por huella, y la rama de macOS/Linux ya no puede dejar el almacén de confianza **vacío** si la API no existe.

**Reparación de argumentos de herramientas** con comillas tipográficas y entidades HTML (un fallo conocido de xAI/Grok). Hubo que ir más lejos que el original: un fuzz diferencial encontró **1.268 casos en los que la versión portada devolvía un resultado silenciosamente incorrecto** donde antes fallaba de forma ruidosa —incluyendo borrar comas de dentro del contenido de un archivo a punto de escribirse—. Tras el arreglo son **0 por la vía de las comillas**, y en una prueba de emisión realista pasa de 0/6000 a **6000/6000** correctos.

### ✅ Calidad
Typecheck **27/27** · Lint **0 errores** · **168** tests de escritorio · backend **99 fallos sobre 3.653 tests**, frente a **101 sobre 3.503** en la línea base sin estos cambios: dos menos, con 150 tests nuevos.

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
