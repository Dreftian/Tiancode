import { spawn } from "node:child_process"
import { readFileSync, statSync } from "node:fs"
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
  const version = desktopPkg.version || "1.0.2"
  const tag = `v${version}`
  const releaseName = `Tiancode v${version} - Activación Automática de Sub-agentes, UI Codex Desktop en Chat, Vista Previa Universal & Formas de Onda`
  const body = `## 🚀 Tiancode v${version} — Activación Automática de Sub-agentes, UI Codex Desktop, Vista Previa Universal & Telemetría Local

### 🤖 Activación Automática y Proactiva de Sub-Agentes Especializados
- **Orquestación Autónoma de Enjambres:** Mandato universal que obliga al agente principal a delegar tareas complejas, frontend, backend, arquitectura, testing y seguridad a sub-agentes especializados (\`ui-ux-master\`, \`fullstack-coder\`, \`software-architect\`, \`devsecops-auditor\`, \`qa-e2e-tester\`) sin necesidad de que el usuario lo solicite de forma manual.
- **Inyección en Todos los Proveedores:** Integración exhaustiva en prompts de sistema para Anthropic Claude, OpenAI GPT, Google Gemini, Ollama y DeepSeek.

### 💼 Interfaz de Sub-agentes Estilo Codex Desktop en el Chat
- **Tarjetas Ejecutivas de Especialistas:** Tarjetas rediseñadas con acentos cromáticos por especialidad, badges de rol (\`Frontend & Design\`, \`Fullstack & Core\`, \`Architecture\`, etc.) e indicador de pulso en vivo.
- **Visualización Limpia de Resultados:** Vista previa de directivas, botón directo "Abrir sesión ↗" y bandeja colapsable con renderizado Markdown optimizado y copiado en un clic.

### 🌐 Vista Previa Universal para Cualquier Website o App
- **Soporte Multi-Lenguaje y Multi-Framework:** Compatibilidad transparente con Node.js, Python (FastAPI/Django/Flask), Go, Rust, PHP, Astro, Ruby y Java.
- **Normalización HTTP/HTTPS Inteligente:** Corrección que fuerza \`http://\` en \`localhost\`, \`127.0.0.1\`, \`0.0.0.0\` y \`[::1]\`, erradicando los errores de protocolo SSL (\`ERR_SSL_PROTOCOL_ERROR\`).
- **Control Responsive & Puertos Rápidos:** Selector de viewport (\`Desktop\`, \`Tablet\` a 768px, \`Mobile\` a 375px), botones de puertos de desarrollo (\`:3000\`, \`:5173\`, \`:8000\`, \`:8080\`, \`:5000\`, \`:4321\`), overlay de recuperación de errores y fallback web.

### 🎙️ Dictado por Voz Modernizado & Telemetría de Modelos Locales
- **Formas de Onda Reactivas (Audio Waveform):** Canvas animado de ondas sonoras en tiempo real mientras el micrófono está activo.
- **Telemetría y Estado de Runtimes:** Insignias de estado en tiempo real (Online / Offline) para Ollama y LM Studio, con visualización de puertos y monitor de VRAM / GPU libre.

### 📦 Descargas
| Archivo | Tipo | Descripción |
|---|---|---|
| [**Tiancode.exe**](https://github.com/Dreftian/Tiancode/releases/download/${tag}/Tiancode.exe) | Instalador Windows | Instalador oficial con acceso directo y actualizador |
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

  const filesToUpload = [
    { name: "Tiancode.exe", path: "install/Tiancode.exe", contentType: "application/vnd.microsoft.portable-executable" },
    { name: "Tiancode-portable.exe", path: "install/Tiancode-portable.exe", contentType: "application/vnd.microsoft.portable-executable" },
    { name: "latest.yml", path: "install/latest.yml", contentType: "text/yaml" },
    { name: "Tiancode.exe.blockmap", path: "install/Tiancode.exe.blockmap", contentType: "application/octet-stream" },
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
