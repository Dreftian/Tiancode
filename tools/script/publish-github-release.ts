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
  const releaseName = `Tiancode v${version} — Sub-Agentes Profesionales por Lenguaje, Tablas y Chips Uniformes, Asistente de Bienvenida Rediseñado y Soporte Claro/Oscuro`
  const body = `## 🚀 Tiancode v${version} — Sub-Agentes Profesionales, Alineación Uniforme de Tablas y Nuevo Asistente de Bienvenida

### 🤖 9 Nuevos Sub-Agentes Especializados de Nivel Profesional
- **Cobertura Integral de Lenguajes y Ecosistemas:** Se integraron 9 sub-agentes nativos de ingeniería avanzada con herramientas especializadas, directivas de orquestación swarm y visibilidad completa en Configuración:
  1. 🐍 **Python Data & AI Engineer** (\`python-data-engineer\`): Especialista en Python 3.12+, FastAPI, PyTorch, Pandas, NumPy, Scikit-learn, LangChain, pipelines ETL y procesamiento de datos.
  2. 🦀 **Rust Systems Engineer** (\`rust-systems-engineer\`): Experto en Rust 2024, Tokio, Axum, seguridad de memoria, concurrencia de alto rendimiento y WebAssembly.
  3. 🐹 **Go Backend Developer** (\`go-backend-dev\`): Microservicios nativos en la nube, Goroutines, Channels, gRPC, Gin y Fiber.
  4. 📱 **Mobile App Developer** (\`mobile-app-developer\`): Desarrollo multiplataforma con Flutter, React Native/Expo, Swift/SwiftUI (iOS) y Kotlin/Compose (Android).
  5. ☁️ **Cloud & DevOps Engineer** (\`cloud-devops-engineer\`): Docker multi-stage, Kubernetes, Helm, Terraform, CI/CD GitHub Actions y orquestación multi-cloud (AWS, GCP, Azure).
  6. ⚡ **C++ Systems Expert** (\`cpp-systems-expert\`): C++20/C++23 moderno, CMake, bajo nivel, optimizaciones de memoria y sistemas embebidos.
  7. ☕ **Java Enterprise Architect** (\`java-enterprise-architect\`): Java 21 LTS, Spring Boot 3, Hibernate/JPA, arquitectura limpia y microservicios escalables.
  8. 🔷 **.NET Core Expert** (\`dotnet-core-expert\`): C# 12, .NET 8/9, ASP.NET Core, Entity Framework Core y arquitecturas CQRS.
  9. 🐘 **PHP & Laravel Expert** (\`php-laravel-expert\`): PHP 8.3+, Laravel 11, Eloquent ORM, Livewire, Inertia.js y APIs RESTful seguras.

### 📐 Tablas y Chips de Plugins & MCP Uniformes y Ordenados
- **Alineación Perfecta en una Sola Línea:** Se amplió la columna de "CATEGORÍA & TIPO" en las tablas de Plugins y MCP a \`minmax(210px, 1.8fr)\`, eliminando saltos de línea desordenados.
- **Dimensiones Uniformes en Chips y Catálogo:** Todos los chips de categorías (\`min-width: 96px\`) y tipos (\`min-width: 68px\`) cuentan con anchos estandarizados y textos centrados en todas las tablas y tarjetas del catálogo Discover.
- **Traducciones y Acentuación Pulida:** Nombres de categoría con acentos correctos en español ("Diseño", "Documentación", "IA & ML", "Base de Datos", "Ciencia Datos", "Ventas & CRM").

### 🎨 Asistente de Bienvenida Rediseñado, Compacto y con Temas Claro / Oscuro
- **Diseño Fiel a la Referencia:** Dimensiones compactas (\`max-w-[510px]\`), eliminando pasos redundantes y enfocándose directamente en la personalización inicial (Idioma y Modo de Color).
- **Soporte Dinámico de Modo Claro y Oscuro:** Tanto la ventana flotante como el fondo del asistente responden de inmediato al cambio de tema seleccionado con tarjetas, bordes, brillos y tipografía de alto contraste.
- **Transición Fluida:** Al presionar "Siguiente", la configuración se guarda al instante y el usuario pasa directamente al entorno de trabajo sin demoras.

### 🔒 Actualización 100% No Destructiva
- Todas las claves de proveedores de IA, sesiones, historial, proyectos, personalizaciones y servidores MCP se preservan íntegramente.

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
