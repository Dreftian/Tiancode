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
  const releaseName = `Tiancode v${version} — Security Suite: Agentes de Pruebas de Seguridad, Skills Curadas y MCPs`
  const body = `## 🚀 Tiancode v${version} — Security Suite: Agentes de Pruebas de Seguridad, Skills Curadas y MCPs

### 🕵️ Nuevos Sub-agentes nativos
- **\`pentest\`** — Especialista en auditoría de seguridad autorizada (web, red, APIs, AD): recon → validación con evidencia → calibración de severidad → reporte accionable. Incluye protocolo CLI anti-alucinación (verificar flags con \`--help\`, no asumir flags entre herramientas, quoting de payloads), reglas msfconsole (\`-x "…; exit"\`) y base de conocimiento de herramientas (nmap, ffuf, sqlmap, nuclei, hydra, impacket, radare2, searchsploit…).
- **\`llm-redteam\`** — Red teaming **defensivo** de tus propios agentes LLM: pruebas de prompt injection/jailbreak con jueces de scoring (1-10), escalado h4rm3l → TAP → PAIR, catálogo de riesgos OWASP-LLM y recomendaciones de hardening. Solo sistemas propios o con permiso escrito.

### 📚 Nueva biblioteca de skills de seguridad (30+ skills nativas)
- **Metodología:** \`pentest-scope-roe\` (regla de oro: alcance primero, siempre; parar si no está claro), \`web-pentest-runbook\` (plan completo de auditoría web), \`pentest-engagement-scope\` (plantilla de alcance/SoW), \`pentest-scan-modes\` (quick/standard/deep).
- **Recon y pruebas:** nmap, subdominios, fuzzing web, httpx, nuclei, sqlmap+SQLi, XSS, SSRF, RCE, IDOR, JWT, request smuggling, lógica de negocio, race conditions, path traversal/LFI, CSRF, XXE, SSTI, browser security, APIs, GraphQL, OAuth, Active Directory.
- **Defensa de IA:** LLM applications (OWASP LLM01-10), prompt injection, agentic system security, electron desktop apps, red team de agentes + plantillas de ataque.
- **Calidad de hallazgos:** calibración de severidad, counterevidence, verificación de fixes.

### 🔌 Nuevos presets en el catálogo Discover (MCP)
- **PenTest MCP** (\`npx -y pentest-mcp\`): nmap, sqlmap, hydra, hashcat, nuclei, ffuf… con contexto de alcance y mitigación de prompt injection.
- **Kali MCP (Docker)**: Kali Linux en Docker con ~50 herramientas (requiere el contenedor local en \`http://localhost:666/mcp\`).

### ⚖️ Uso responsable
Todas las capacidades de seguridad exigen alcance/autorización explícitas. Los agentes **nunca** prueban fuera de alcance y piden confirmación si el alcance no está claro. Material adaptado de proyectos open-source (MIT/Apache-2.0): usestrix/strix (skills), PentAGI (prompts), SploitAgent (scope-roe), AI4I HackAgent (red teaming), pentest-mcp y kali-mcp.

### 🔒 Actualización 100% No Destructiva
- Todas tus claves de API, sesiones, historial, MCPs y configuraciones se conservan intactas en tu equipo.

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
