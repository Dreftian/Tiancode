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
  const version = desktopPkg.version || "1.0.25"
  const tag = `v${version}`
  const releaseName = `Tiancode v${version} — Modernización de Skills, TTS en Worker y Reparación con IA en Vista Previa`
  const body = `## 🚀 Tiancode v${version} — Modernización de Skills, TTS en Worker y Reparación con IA en Vista Previa

### 🧠 Modernización del Ecosistema de Habilidades y Calidad de Agentes
- **Superpoderes de Agentes:** Nuevas habilidades para flujos avanzados y confiables:
  - \`subagent-driven-development\`: subagentes ejecutores aislados con doble filtro de calidad (especificación y código).
  - \`systematic-debugging\`: protocolo de investigación de causa raíz en 4 fases ("La Ley de Hierro: sin arreglos sin causa raíz").
  - \`constraint-driven-development\`: respeto estricto a restricciones de \`CONSTRAINTS.md\` sin rebajar estándares.
  - \`receiving-code-review\`: evaluación rigurosa y técnica del feedback recibido.
- **Mejores Prácticas y Proveedores Oficiales:**
  - \`supabase-postgres-best-practices\`, \`cloudflare-workers-best-practices\`, \`stripe-payments-integration\`, \`better-auth-patterns\` y \`sentry-observability-and-fixes\`.
- **Creadores de Artefactos y Documentación en Código Abierto Limpio:**
  - \`mcp-builder\`, \`web-artifacts-builder\`, \`docx-document-creation\` (docx-js) y \`xlsx-spreadsheet-builder\` (exceljs).
- **Corrección de Mapeo y Tokens Canónicos:**
  - Corregido el mapeo de \`to-spec\` en \`builtin/skills.ts\` y registrado el sistema de diseño canónico \`design-system-spec\` (Rico UI DESIGN.md).

### ⚡ Rendimiento de Voz: Offloading Neural Kokoro TTS a UtilityProcess
- Síntesis de voz ONNX migrada completamente fuera del hilo principal de Electron hacia un \`utilityProcess\` dedicado (\`voice-worker.ts\`).
- Eliminación total de congelamientos de 1-3 segundos en la interfaz y el bucle de eventos durante la locución de voz.

### 🛡️ Terminación Limpia de Procesos PTY Zombies en Windows
- Terminación en árbol con \`taskkill.exe /PID <pid> /T /F\` en sesiones de terminal de Windows, previniendo fugas de memoria o puertos ocupados.

### 🖥️ Vista Previa en Vivo: Auto-Reparación y Renderizado Libre de Glitches
- **Reparación con IA en 1 Clic (\`✨ Reparar con IA\`):** Botón directo en fallos de carga, compilación del Dev Server y sandbox Desktop que empaqueta el error y lo envía a solucionar automáticamente al agente.
- **Corrección de Pantalla Blanca en Iframe (\`nudgePreviewIframeGeometry\`):** Eliminación de glitches de rasterizado en Chromium/Electron al cargar iframes sandboxed escalados.
- **Bus Reactivo de Prompts (\`tiancode:insert-prompt\`):** Despacho e inyección fluida de instrucciones sin necesidad de copiar y pegar manualmente.

### 🔒 Actualización 100% No Destructiva
- Todas tus claves de API, sesiones, historial, MCPs y credenciales se preservan de forma intacta.

### 📦 Descargas
| Archivo | Tipo | Descripción |
|---|---|---|
| [**Tiancode.exe**](https://github.com/Dreftian/Tiancode/releases/download/${tag}/Tiancode.exe) | Instalador Windows | Instalador oficial con actualizaciones automáticas |
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
