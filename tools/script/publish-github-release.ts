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
  const releaseName = `Tiancode v${version} — Conexiones Gateway, Resiliencia OpenClaw, Memoria Hermes, OpenDesign UI y Sandbox Keep-Alive`
  const body = `## 🚀 Tiancode v${version}

### 🌐 Apartado "Conexiones" en Configuración (Integraciones Externas)
- **WhatsApp Gateway:** Emparejamiento interactivo mediante código temporal \`TIAN-XXXX-WAPP\` y notificaciones de compilación/pruebas.
- **Telegram Bot:** Vinculación directa con token de bot, Chat ID, interruptor de enlace y botón de prueba ("Ping Test").
- **Discord & Slack:** Soporte para Webhooks y bots entrantes para alertas de tareas en segundo plano.
- **API Gateway & Webhooks Personalizados:** Disparo de eventos HTTP con firma criptográfica HMAC-SHA256 (\`session.completed\`, \`build.failed\`, \`task.interrupted\`).

### 🛡️ Motor de Resiliencia (Inspirado en OpenClaw)
- **Auto-reparación de Tool Calls:** Corrección sintáctica automática de JSON malformado emitido por LLMs (comillas faltantes, corchetes desbalanceados, comas finales y bloques markdown \`\`\`json).
- **Detector de Bucles Infinitos SHA-256 & Circuit Breaker:** Monitoreo con hashes SHA-256 de herramientas y argumentos para detectar repeticiones exactas (\`generic_repeat\`), micro-variaciones erráticas (\`argument_churn\`), oscilaciones (\`ping_pong\`) y límite de seguridad de 25 llamadas a herramientas (\`circuit_breaker\`).

### 🧠 Inteligencia y Memoria Continua (Inspirado en Hermes Agent)
- **Búsqueda Histórica Profunda (\`session_search\`):** Herramienta nativa para buscar en el historial SQLite soluciones, comandos y discusiones pasadas.
- **Compactación con Protección Head & Tail:** Preserva el objetivo original del usuario (Turno 0) y los turnos recientes, podando salidas voluminosas de herramientas (>1,000 chars) antes de resumir.
- **Streaming Scrubber para Modelos de Razonamiento:** Aislamiento y extracción limpia de bloques \`<think>...</think>\` (DeepSeek R1, Qwen QwQ) sin saturar el historial visible del usuario.
- **Estándares de Autoría para Skills:** Metodología estricta de auto-aprendizaje continuo para creación de habilidades.

### 🎨 Motor de Diseño OpenDesign & Claude Design
- **Anti-AI-Slop Rules:** Prohibición del índigo genérico de Tailwind (\`#6366f1\`), eliminación de degradados de dos paradas en encabezados y reemplazo de emojis por SVGs monolineales limpios.
- **Calibración de Gusto con 3 Diales:** \`DESIGN_VARIANCE\`, \`MOTION_INTENSITY\` y \`VISUAL_DENSITY\`, junto con "Design Read" previo al código.
- **Física de Micro-interacciones (Emil Kowalski):** Respuesta táctil con \`transform: scale(0.97)\` en \`:active\`, entradas naturales desde \`scale(0.95)\` y transiciones modernas con \`@starting-style\`.
- **4 Presets de Diseño Canónicos:** Linear Dark, Claude Editorial, Vercel Precision y Stripe Modern.

### 🖥️ Sandbox Keep-Alive & Inspector DOM Visual
- **Iframe Keep-Alive Pool (Cero Recargas):** Alternancia no destructiva entre Código y Vista Previa mediante CSS; el estado de React/Vue, inputs de formularios, scroll y dev servers se mantienen 100% intactos.
- **Inspector DOM en Tiempo Real (\`Ctrl+Alt+I\`):** Resaltado interactivo con borde cian de 2px, etiquetas semánticas, clases y cotas de dimensiones y márgenes.
- **Detector de Pantalla Blanca & Auto-Fix:** Detección de fallos de renderizado en blanco (>4s con 0 elementos) con botón de 1-click **"Reparar con Tiancode"**.

### 🔒 Actualización 100% No Destructiva
- Todas tus claves de proveedores (Anthropic, OpenAI, OpenRouter, Google, Groq, etc.), configuraciones, sesiones, backups y servidores MCP se preservan intactos en tu equipo.

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
