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
  const releaseName = `Tiancode v${version} — Sub-Agentes Nativos Exclusivos, Corrección de AST CodeGraph, Dictado por Voz Nativo, Modo ⚡ 2x y Hugging Face Models Hub`
  const body = `## 🚀 Tiancode v${version} — Sub-Agentes Nativos, Dictado por Voz Robusto, Modo ⚡ 2x y Hub de Modelos Hugging Face

### 🔍 Corrección de Desborde en Buscador de AST CodeGraph
- **Ajuste Estricto de Ancho:** Se corrigió el desborde del campo de búsqueda en el visualizador AST CodeGraph mediante \`overflow-hidden\` y clase \`!w-full max-w-full min-w-0\` en \`TextInputV2\`, manteniéndolo perfectamente alineado dentro del límite de la tarjeta.

### 🛡️ Sub-Agentes Nativos Exclusivos y Depuración de Interfaz
- **Catálogo Exclusivo:** Se eliminó por completo la sección obsoleta de "Sub-agentes de usuario" y modales flotantes innecesarios, dejando únicamente los sub-agentes nativos de élite.
- **Tabla Unificada de 5 Columnas:** Sub-Agente, Rol y Especialidad, Modelo, Herramientas y Estado con interruptor instantáneo (0 ms).

### 🌳 Árbol de Recursión RLM (Swarm Hierarchy Tree) Mejorado
- **Topología de Orquestación Dinámica:** Representación jerárquica de la arquitectura de enjambre (Nivel 0: Tiancode Prime Orchestrator; Nivel 1: Especialistas de Software Architect, Fullstack, DevSecOps y QA).
- **Control Expandir/Colapsar:** Insignias de estado en tiempo real y flujo de descomposición recursiva de tareas.

### 🎙️ Dictado por Voz Nativo y Detección de Micrófonos sin Fallos
- **Corrección de Runtime en Sherpa-ONNX:** Solucionado el error \`Cannot use 'in' operator to search for 'transducer' in undefined\` en \`asr.ts\`, configurando adecuadamente \`featConfig\` y \`modelConfig.whisper\` y decodificando mediante \`OfflineStream\`.
- **Detección Confiable de Micrófonos de PC:** Enumeración de dispositivos conectados y dictado offline nativo sin interrupciones.

### ⚡ Modo 2x Velocidad Optimizado
- **Pensamiento y Respuesta Ultra-Rápidos:** Directivas específicas inyectadas para razonamiento acelerado sin sobrecarga de tokens y streaming fluido.

### 🤗 Hugging Face Local Models Hub con Motor Autónomo Tiancode
- **Branding Oficial Hugging Face:** Logo destacado (🤗) con indicador del motor nativo autónomo de Tiancode (\`llama-server.exe\` integrado), sin requerir LM Studio, Ollama ni dependencias externas.
- **Búsqueda en Vivo y Staff Picks:** Navegación directa por modelos GGUF recomendados, selector de cuantización y filtro para modelos en disco.

### 🔒 Actualización 100% No Destructiva
- Todas las claves de proveedores de IA, sesiones, historial, configuraciones y servidores MCP se preservan íntegramente.

### 📦 Descargas
| Archivo | Tipo | Descripción |
|---|---|---|
| [**Tiancode.exe**](https://github.com/Dreftian/Tiancode/releases/download/${tag}/Tiancode.exe) | Instalador Windows | Instalador oficial con tema Glass y actualizador automático |
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
