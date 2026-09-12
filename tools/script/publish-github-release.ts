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
  const releaseName = `Tiancode v${version} — El agente usa el Sandbox, el modo 2x no piensa menos y nada se escribe en la raíz del disco`

  const body = `## 🚀 Tiancode v${version}

Versión centrada en tres cosas que rompían la confianza: el agente no podía comprobar lo que
construía, el modo ⚡ 2x rebajaba en silencio el razonamiento que habías elegido, y la app dejaba
archivos propios en la raíz del disco.

### 🤖 El agente ya puede usar la app del Sandbox
- Antes sólo podía arrancar el servidor y leer logs, así que terminaba diciendo "no pude abrir la ventana, sólo validé que compila".
- **\`preview_inspect\`**: lee la pantalla real — URL y título, texto visible, cada botón, enlace, campo y desplegable con una referencia \`e12\`, y los errores de la consola.
- **\`preview_interact\`**: \`click\`, \`fill\`, \`select\`, \`press\`, \`scroll\` y \`navigate\`, y devuelve la pantalla resultante. Recorre un flujo entero y lo verifica de verdad antes de darlo por terminado.
- Funciona tanto en el iframe del Sandbox como en la vista nativa: la acción se ejecuta en el frame real desde el proceso principal.

### 🔁 "Compilando dist…" que no paraba
- Windows anuncia el cambio de la carpeta de salida como \`dist\` a secas, sin barra, y el filtro sólo descartaba \`dist/\`: cada compilación se re-armaba con su propia salida y el proyecto se recompilaba en bucle.
- Los descartes se comparan ahora por segmento de ruta, a cualquier profundidad, y la etiqueta muestra el nombre del archivo en lugar de una ruta cortada a media palabra.

### 🗂️ Nada de \`.tiancode\` en la raíz del disco
- Una carpeta sin repositorio resolvía su proyecto a la raíz del disco, así que \`MEMORY.md\`, los plugins (con su \`node_modules\`) y las skills acababan en lo alto de la unidad.
- Una carpeta sin git es ahora su propio proyecto, y ninguna ruta puede escribir en una raíz de sistema.

### ⚡ El modo 2x respeta tu nivel de razonamiento
- Bajaba el modelo a su variante más barata: elegir "Max" y activar 2x te daba un modelo más superficial del que pediste. Ahora 2x sólo quita preámbulo y relleno.

### 🔌 Proveedores y modelos al instante
- Conectar cierra el diálogo y notifica en el mismo momento; desconectar quita la fila **y todos los modelos de ese proveedor** en el mismo fotograma.
- Tras actualizar, un catálogo vacío ya no se queda cacheado hasta reiniciar: se vuelve a pedir a los 0,8 s, 2 s y 5 s. Lo mismo en Skills, que es por lo que la ficha grande mostraba un resumen en vez del SKILL.md completo.
- Ollama y LM Studio salen de Proveedores: el camino real para modelos locales es el motor integrado (GGUF) en Modelos Locales.

### 📐 Responsivo de verdad
- Los paneles de Ajustes media-consultaban el ancho de la **ventana** aunque viven dentro del diálogo. Todos pasan a container queries del propio panel.
- El sondeo de la vista previa va con lo que ocurre (0,9 s / 2 s / 6 s) y los logs sólo se piden cuando hay algo que mirar.

### ✅ Calidad
- 34 tests nuevos. Frontend **899 tests, 0 fallos**. Typecheck 27/27.

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
