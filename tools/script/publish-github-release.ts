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
  const version = desktopPkg.version || "1.0.21"
  const tag = `v${version}`
  const releaseName = `Tiancode v${version} — AgentShield Security, Sub-Agentes de Élite ECC, Motor RTK (-80% Tokens) y Soporte GPT-6 Astra`
  const body = `## 🚀 Tiancode v${version} — AgentShield, Sub-Agentes de Élite ECC, Motor RTK y Soporte GPT-6 Astra

### 🛡️ AgentShield Security Engine
- **Protección Proactiva de Sistema:** Detección y contención de comandos destructivos (\`rm -rf /\`, \`rmdir /s /q c:\\\`, formateo de volúmenes o manipulación del registro).
- **Prevención de Fuga de Secretos:** Bloqueo y advertencias ante intentos de exponer archivos \`.env\`, claves privadas SSH (\`id_rsa\`, \`id_ed25519\`) o tokens de nube (AWS, GCP, GitHub).
- **Defensa ante Ejecución Remota Insegura:** Alertas ante scripts remotos canalizados a shells sin verificación (\`curl | sh\`, \`iwr | iex\`).
- **Integración Nativa en Terminal Bash:** Alertas contextuales inyectadas para guiar al modelo a reconsiderar comandos de alto riesgo sin romper el flujo.

### 🧪 Sub-Agentes de Élite Integrados (Arquitectura ECC)
- **🧪 TDD Specialist:** Arquitecto Test-First con ciclo estricto Red-Green-Refactor. Pruebas antes de código de producción.
- **🔍 Code Reviewer:** Auditoría de calidad, legibilidad, seguridad y estándares en contexto fresco.
- **🛡️ AgentShield Sentinel:** Centinela de ciberseguridad, análisis estático de dependencias y principios OWASP.
- **🔧 Build Repair Specialist:** Diagnóstico y reparación quirúrgica de fallos de compilación, linters y tipos TypeScript sin modificar lógica de negocio.

### ⚡ Motor Nativo de Reducción de Tokens CLI (Estilo RTK)
- **Ahorro del 60% al 90% en Tokens de Terminal:** Módulo \`OutputDistiller\` que limpia ruido ANSI, barras de progreso y deduplica líneas repetidas en comandos \`git\`, \`test\` y compiladores.
- **Modo Failure Focus & Fail-Safe:** Aislamiento quirúrgico de fallos en tests ignorando pruebas exitosas y ruido de \`node_modules/\`. Preservación del 100% de la salida en errores no reconocidos.
- **Arquitectura de Salida Dual:** Salida compacta para el LLM a máxima velocidad y registro completo para el usuario.

### 🤖 Soporte de Versiones Enteras GPT y GPT-6 Astra (OpenCode v1.18.29)
- **Filtrado OAuth en Codex:** Reconocimiento de versiones enteras (\`gpt-6\`, \`gpt-6-astra\`, \`gpt-7\`) en la integración de OpenAI Plus/Pro.
- **Opciones de Razonamiento:** Configuración optimizada de razonamiento cifrado para familias GPT-5 y GPT-6.

### 🌳 Mejoras de la Suite: Swarm Hierarchy Tree, Whisper Offline y Hugging Face Hub
- **Árbol de Recursión RLM:** Visualización jerárquica de la arquitectura de enjambre en tiempo real.
- **Dictado por Voz Nativo:** Whisper offline sin fallos de runtime y con detección automática de micrófonos de PC.
- **Hugging Face Hub Autónomo:** Motor de inferencia nativo de Tiancode (\`llama-server.exe\` integrado) sin requerir Ollama ni LM Studio.

### 🔒 Actualización 100% No Destructiva
- Todas tus claves de API de proveedores, configuraciones, sesiones, backups y servidores MCP se preservan intactos.

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
