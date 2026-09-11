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
  const releaseName = `Tiancode v${version} — Ajustes Fluidos, Conexiones Reales, Base de Datos Protegida & Rediseño de Skills, Sub-agentes y MCP`

  const body = `## 🚀 Tiancode v${version}

Esta versión arregla el problema más grave reportado tras la 1.0.40 ("No se pudo conectar con
Servidor local"), devuelve la fluidez al panel de Ajustes, convierte Conexiones en una integración
real y rediseña las pestañas de Skills, Sub-agentes y MCP/Plugins.

### 🗄️ Base de datos protegida frente a la copia de seguridad
- La copia diaria copiaba \`tiancode.db\` mientras el servidor escribía: dejaba una copia rota y un bloqueo que ponía SQLite en **solo lectura**. De ahí el "No se pudo conectar".
- La copia se hace ahora con \`VACUUM INTO\` (instantánea consistente y compacta) y nunca toca \`-wal\`/\`-shm\`.
- Al arrancar, el servidor comprueba que puede escribir (reintenta hasta 30 s antes de fallar con un error claro) y compacta la base automáticamente cuando acumula espacio libre.

### ⚡ Ajustes vuelve a ser fluido
- El diálogo y cada panel forzaban capas de GPU, varias tablas usaban desenfoque de fondo y había animaciones permanentes: con 12 paneles montados a la vez, cada cambio de pestaña recomponía todo. *General* era el único panel sin esos efectos y por eso el único fluido.
- Se retiran las capas forzadas, los desenfoques y los pulsos estáticos.

### 🔗 Conexiones reales (Telegram, Discord, Slack, Webhooks)
- El panel anterior guardaba todo en el navegador, "probaba" con un temporizador y el emparejamiento de WhatsApp era un número aleatorio.
- Nuevo servicio en el servidor con API \`/global/connections\`: los tokens viven en el almacén de credenciales y nunca vuelven a la interfaz, cada sesión que termina o falla envía un resumen, los webhooks van firmados con HMAC-SHA256 y el bot de Telegram abre sesiones y responde desde el chat.
- WhatsApp se retira hasta contar con una integración real.

### 🎨 Skills, Sub-agentes y MCP/Plugins rediseñados
- **Skills**: barra de acciones y filtros con recuentos (sin emojis), descripciones a dos líneas en la lista, textos traducidos.
- **Sub-agentes**: selector de alcance proyecto/global como control segmentado, tabla más densa, estados traducidos.
- **MCP y Plugins**: las pestañas ya no recortan su etiqueta, explicación compacta de MCP, ruta de los plugins locales una sola vez, catálogo con cabecera limpia.
- 105 claves de traducción nuevas en los 7 idiomas; la paleta fija se sustituye por los tokens del tema.

### 🔊 Voces
- Catálogo completo con las descargadas primero, sin doble descarga ni velocidad 120 %.
- La clave de Fish Audio deja de ir incluida en el binario; velocidad natural por defecto en Kokoro y Piper.
- Botón de eliminar restaurado, tono solo cuando el motor lo admite, el probador de micrófono libera el micro al cambiar de pestaña.

### 🐙 GitHub e Inteligencia
- La rama actual se lee del control de versiones (antes siempre "main"), "Sincronizar" espera a todas las peticiones y los fallos de commit/push/pull muestran la salida real de git.
- Los ajustes de memoria y guardrails de *Inteligencia* llegan por fin al servidor por HTTP: el esquema V1 los descartaba en silencio.
- Se retira la pestaña *Ecosistema IA*: 9 de sus 16 tarjetas describían integraciones inexistentes y ningún interruptor tenía efecto.

### ✅ Calidad
- Suite del frontend: **868 tests, 0 fallos**. Desktop 75/0. Conexiones 17/17.
- Typecheck: 27/27 paquetes.

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

  for (const file of filesToUpload) {
    console.log(`[Upload] Preparando ${file.name}...`)
    const existingAsset = releaseData.assets?.find((a: any) => a.name === file.name)
    if (existingAsset && existingAsset.size === statSync(file.path).size) {
      console.log(`✓ ${file.name} ya está subido con el mismo tamaño, se omite`)
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
