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
  const releaseName = `Tiancode v${version} — Modo 2x Real, Asistente de Bienvenida, Vista Previa en Vivo, Voces Reparadas & Panel Intelligence Conectado`

  const body = `## 🚀 Tiancode v${version}

Esta versión es el resultado de una auditoría funcional completa: se revisó una por una cada
característica añadida a Tiancode y se corrigió todo lo que no cumplía su función. Varias cosas
que parecían funcionar en realidad no hacían nada.

### ⚡ El modo 2x ahora acelera el modelo de verdad
- Antes sólo inyectaba una frase en el system prompt. Ahora se conecta al sistema de \`variants\` del modelo y baja el razonamiento a su nivel más barato **sólo para esa petición**.
- Tu variante guardada no se toca y vuelve sola al desactivarlo.
- Corregido \`resolveFastVariant\`: su respaldo elegía \`variants[0]\`, que en una lista descendente como \`["high","medium","low"]\` era la **más lenta**.

### 🧭 Asistente de Bienvenida completo
- Anunciaba "Paso 1 de 3" pero sólo existía un paso. Ahora están los tres: proveedor, espacio de trabajo y cierre.
- Botones Atrás/Omitir, navegación por teclado, los 7 idiomas y desplazamiento interno para que no se recorte en ventanas bajas.

### 👁️ Vista previa con estado "Compilando" en vivo
- El gestor ya recompilaba al guardar, pero el estado vivía en un campo privado que nunca se publicaba.
- Ahora verás **"Compilando src/App.tsx…"** con la duración de la última compilación, y el iframe se recarga al terminar bien.

### 🔊 Voces reparadas
- "Paloma" y "Tania" apuntaban a repositorios de HuggingFace que **no existen** (HTTP 401): su descarga fallaba siempre.
- Sustituidas por \`es_ES-miro-high\` y \`es_ES-glados-medium\`, verificadas.
- Nuevo \`verify-piper-voices\` en el pipeline de release: un repositorio muerto ya no puede volver a publicarse.

### 🧠 Panel Intelligence conectado al agente
- Los ajustes se guardaban sólo en \`localStorage\` y nunca llegaban al servidor, así que ninguno influía en el agente.
- Memoria de usuario/proyecto y guardrails viajan ahora por \`experimental.intelligence\` y gobiernan de verdad el system prompt y \`AgentShield\`.

### 🔒 Seguridad
- **Los guardados de Ajustes ya no escriben tus secretos en claro.** \`Config.update()\` fusionaba sobre la configuración *ya cargada*, que resuelve \`{env:...}\` y \`{file:...}\`, así que cada guardado reescribía tu archivo con las claves resueltas y borraba las claves que el esquema no reconocía.
- **Cloudflare AI Gateway ya no entrega tu token de Cloudflare a terceros.** Viajaba en \`Authorization\`, que la pasarela reenvía tal cual a OpenAI, Anthropic o Google.

### 🔌 Proveedores y modelos
- **Azure**: inicio de sesión con Microsoft Entra ID vía Azure CLI, además de clave de API.
- **Cerebras**: nuevo plugin que evita el truncado de respuestas por doble tope de tokens.
- **Codex**: se envía por fin la cabecera de residencia de cómputo (estaba rota por tres motivos a la vez) y los modelos con minor de dos dígitos dejan de descartarse.
- **OpenAI**: un cierre WebSocket 1009 cae de inmediato a HTTP en vez de gastar todos los reintentos con un cuerpo que nunca iba a caber.
- **Reintentos**: eran ilimitados y sin dispersión; ahora tope de 5 y jitter del 25%.

### 🎨 Interfaz y traducciones
- Tablas de sub-agentes y MCP reescritas mobile-first con container queries: se acabó el desplazamiento horizontal entre 360 y 1300 px.
- 53 claves de traducción que faltaban en los 7 idiomas (toda la pestaña *Intelligence* caía a español fijo para el resto de idiomas).
- Catálogo de skills: 16 skills muertas o duplicadas retiradas.

### ✅ Calidad
- Suite del frontend: **862 tests, 0 fallos**.
- \`backend/core/test/plugin\`: de 210/12 a **222/0**.
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
