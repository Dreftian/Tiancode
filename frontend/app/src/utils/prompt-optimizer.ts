/**
 * Pipeline Avanzado de Optimización Contextual de Prompts y Corrección Ortográfica v2.
 * Inspirado en los mejores patrones de claude-opus-4.6, prompt-refine, trae-agent y prompt-optimizer:
 * - Preservación estricta de código, URLs, variables y rutas (Token Isolation)
 * - Diccionario técnico masivo (+350 términos, acrónimos y corrección ortográfica ES/EN)
 * - Clasificador de intención multinivel (debugging, scaffolding, refactoring, conceptual, scripting, review)
 * - Adaptación semántica según la familia del modelo activo (Claude XML, OpenAI Outcome, Gemini Direct, DeepSeek)
 * - Cláusula Anti-Sobreingeniería (mínimo alcance, YAGNI, respeto al código existente)
 * - Plan de Verificación estructurado (tests, linter, compilación o verificación manual)
 */

export type ModelFamily = "claude" | "openai" | "gemini" | "deepseek" | "generic"
export type EnhanceMode = "standard" | "rigorous" | "minimal"
export type PromptIntent =
  | "debugging"
  | "scaffolding"
  | "refactoring"
  | "conceptual"
  | "scripting"
  | "review"

export interface EnhanceOptions {
  modelFamily?: ModelFamily
  mode?: EnhanceMode
  projectStack?: string[]
}

export const COMMON_SPELL_MAP: Record<string, string> = {
  "abarque": "abarque",
  "abrir": "abrir",
  "accion": "acción",
  "acciones": "acciones",
  "acer": "hacer",
  "acrtualizar": "actualizar",
  "actualisacion": "actualización",
  "actualisaciones": "actualizaciones",
  "actualisar": "actualizar",
  "actualizacion": "actualización",
  "actualizaciones": "actualizaciones",
  "actualizas": "actualiza",
  "actuar": "actuar",
  "actulizar": "actualizar",
  "acutalizar": "actualizar",
  "ademas": "además",
  "administracion": "administración",
  "agas": "hagas",
  "ahi": "ahí",
  "ai": "AI",
  "analisis": "análisis",
  "angular": "Angular",
  "aparque": "abarque",
  "api": "API",
  "apis": "APIs",
  "aplicacion": "aplicación",
  "aplicaciones": "aplicaciones",
  "aprte": "parte",
  "aqui": "aquí",
  "archibo": "archivo",
  "archibos": "archivos",
  "archvo": "archivo",
  "archvos": "archivos",
  "arquitectura": "arquitectura",
  "arreglalo": "arréglalo",
  "arreglame": "arréglame",
  "arreglar": "arreglar",
  "aser": "hacer",
  "asincrona": "asíncrona",
  "asincrono": "asíncrono",
  "asr": "ASR",
  "astro": "Astro",
  "atajo": "atajo",
  "atajos": "atajos",
  "audio": "audio",
  "auricular": "auricular",
  "auriculares": "auriculares",
  "autenticacion": "autenticación",
  "autorizacion": "autorización",
  "axcrtualizar": "actualizar",
  "binario": "binario",
  "binarios": "binarios",
  "borrar": "borrar",
  "branch": "rama",
  "branches": "ramas",
  "bun": "Bun",
  "cancela": "cancela",
  "cancelar": "cancelar",
  "captura": "captura",
  "capturar": "capturar",
  "caracter": "carácter",
  "caracteres": "caracteres",
  "cargado": "cargado",
  "cargar": "cargar",
  "cd": "CD",
  "cerrar": "cerrar",
  "cfarpeta": "carpeta",
  "ci": "CI",
  "cli": "CLI",
  "codig": "código",
  "codigo": "código",
  "codigos": "códigos",
  "comfig": "config",
  "comit": "commit",
  "comits": "commits",
  "compilacion": "compilación",
  "compilaciones": "compilaciones",
  "compilar": "compilar",
  "coneccion": "conexión",
  "conecciones": "conexiones",
  "conexion": "conexión",
  "conexiones": "conexiones",
  "configuracion": "configuración",
  "configuraciones": "configuraciones",
  "configuracionn": "configuración",
  "confirmar": "confirmar",
  "controlador": "controlador",
  "controladores": "controladores",
  "corregi": "corrige",
  "corregime": "corrígeme",
  "corregir": "corregir",
  "corrigelos": "corrígelos",
  "corrijelos": "corrígelos",
  "cors": "CORS",
  "cpu": "CPU",
  "crud": "CRUD",
  "css": "CSS",
  "csv": "CSV",
  "dependencia": "dependencia",
  "dependencias": "dependencias",
  "depuracion": "depuración",
  "descangando": "descargando",
  "describrir": "descubrir",
  "descrubir": "descubrir",
  "desincronizacion": "desincronización",
  "desplegar": "desplegar",
  "despliegue": "despliegue",
  "despues": "después",
  "detecta": "detecta",
  "detectar": "detectar",
  "detecte": "detecte",
  "dialogo": "diálogo",
  "dialogos": "diálogos",
  "dificil": "difícil",
  "directa": "directa",
  "directo": "directo",
  "diseño": "diseño",
  "dispositivo": "dispositivo",
  "dispositivos": "dispositivos",
  "dns": "DNS",
  "docker": "Docker",
  "docu": "documentación",
  "documentacion": "documentación",
  "dom": "DOM",
  "drizzle": "Drizzle",
  "dsps": "después",
  "ejecucion": "ejecución",
  "ejecutable": "ejecutable",
  "ejecutables": "ejecutables",
  "ejecutar": "ejecutar",
  "electron": "Electron",
  "eliminar": "eliminar",
  "empaquetado": "empaquetado",
  "empaquetar": "empaquetar",
  "enrutador": "enrutador",
  "enrutadores": "enrutadores",
  "escribi": "escribí",
  "escribio": "escribió",
  "escrivio": "escribió",
  "esopacio": "espacio",
  "especificacion": "especificación",
  "especificaciones": "especificaciones",
  "esta": "está",
  "estan": "están",
  "estandar": "estándar",
  "estandares": "estándares",
  "estos": "estos",
  "excepcion": "excepción",
  "excepciones": "excepciones",
  "facil": "fácil",
  "femenina": "femenina",
  "femenino": "femenino",
  "fichero": "archivo",
  "ficheros": "archivos",
  "fles": "files",
  "funcion": "función",
  "funcionan": "funcionan",
  "funcionene": "funcionen",
  "funciones": "funciones",
  "funsion": "función",
  "funsione": "funcione",
  "funsionen": "funcionen",
  "funsiones": "funciones",
  "git": "Git",
  "github": "GitHub",
  "gitlab": "GitLab",
  "golang": "Go",
  "gpu": "GPU",
  "grabacion": "grabación",
  "gravar": "grabar",
  "guardado": "guardado",
  "guardar": "guardar",
  "gui": "GUI",
  "hardware": "hardware",
  "html": "HTML",
  "http": "HTTP",
  "https": "HTTPS",
  "ia": "IA",
  "icono": "ícono",
  "iconos": "íconos",
  "id": "ID",
  "ids": "IDs",
  "igualq": "igual que",
  "informacion": "información",
  "inout": "input",
  "inpt": "input",
  "inpu": "input",
  "inpurt": "input",
  "inpurts": "inputs",
  "instalacion": "instalación",
  "instalaciones": "instalaciones",
  "instalador": "instalador",
  "instaladorr": "instalador",
  "instaladr": "instalador",
  "instaldor": "instalador",
  "intalacion": "instalación",
  "intalador": "instalador",
  "integracion": "integración",
  "integraciones": "integraciones",
  "interfas": "interfaz",
  "interrupcion": "interrupción",
  "interrupciones": "interrupciones",
  "ip": "IP",
  "ipc": "IPC",
  "javascript": "JavaScript",
  "jpeg": "JPEG",
  "jpg": "JPG",
  "js": "JS",
  "json": "JSON",
  "jwt": "JWT",
  "k8s": "Kubernetes",
  "kiero": "quiero",
  "kubernetes": "Kubernetes",
  "lanzar": "lanzar",
  "libreria": "librería",
  "librerias": "librerías",
  "limpiar": "limpiar",
  "limpieza": "limpieza",
  "linea": "línea",
  "lineas": "líneas",
  "linux": "Linux",
  "llm": "LLM",
  "llms": "LLMs",
  "macos": "macOS",
  "mas": "más",
  "mascota": "mascota",
  "mascotas": "mascotas",
  "masculino": "masculino",
  "mcp": "MCP",
  "mcps": "MCPs",
  "mergear": "merge",
  "metodo": "método",
  "metodos": "métodos",
  "mic": "micrófono",
  "micro": "micrófono",
  "microfono": "micrófono",
  "microfonos": "micrófonos",
  "migracion": "migración",
  "migraciones": "migraciones",
  "modificacion": "modificación",
  "modificaciones": "modificaciones",
  "modulo": "módulo",
  "modulos": "módulos",
  "mysql": "MySQL",
  "navegacion": "navegación",
  "nextjs": "Next.js",
  "node": "Node.js",
  "nodejs": "Node.js",
  "nosql": "NoSQL",
  "notificacion": "notificación",
  "notificaciones": "notificaciones",
  "npm": "npm",
  "numero": "número",
  "numeros": "números",
  "nuxt": "Nuxt",
  "oauth": "OAuth",
  "optimizacion": "optimización",
  "optimizaciones": "optimizaciones",
  "orm": "ORM",
  "os": "OS",
  "outpt": "output",
  "outpurt": "output",
  "pagina": "página",
  "paginas": "páginas",
  "pantalla": "pantalla",
  "pantallas": "pantallas",
  "pantaya": "pantalla",
  "pantayas": "pantallas",
  "paquete": "paquete",
  "paquetes": "paquetes",
  "parametro": "parámetro",
  "parametros": "parámetros",
  "parpadeo": "parpadeo",
  "parpadeos": "parpadeos",
  "pdf": "PDF",
  "pestaña": "pestaña",
  "pestañas": "pestañas",
  "peticion": "petición",
  "peticiones": "peticiones",
  "plguins": "plugins",
  "plusgin": "plugin",
  "plusgins": "plugins",
  "pluyins": "plugins",
  "png": "PNG",
  "pnpm": "pnpm",
  "pormpt": "prompt",
  "portable": "portable",
  "portavle": "portable",
  "portble": "portable",
  "postgres": "PostgreSQL",
  "postgresql": "PostgreSQL",
  "pr": "PR",
  "preambulo": "preámbulo",
  "preambulos": "preámbulos",
  "previa": "previa",
  "prisma": "Prisma",
  "probar": "probar",
  "promt": "prompt",
  "promts": "prompts",
  "pront": "prompt",
  "propmt": "prompt",
  "propmts": "prompts",
  "protocolo": "protocolo",
  "protocolos": "protocolos",
  "prs": "PRs",
  "prueba": "prueba",
  "pruebas": "pruebas",
  "publicacion": "publicación",
  "publicar": "publicar",
  "pullear": "pull",
  "pushear": "push",
  "python": "Python",
  "qiero": "quiero",
  "queria": "quería",
  "ram": "RAM",
  "rapidez": "rapidez",
  "rapido": "rápido",
  "react": "React",
  "reactjs": "React",
  "redireccion": "redirección",
  "redis": "Redis",
  "refrescar": "refrescar",
  "reiniciar": "reiniciar",
  "reintentar": "reintentar",
  "reintento": "reintento",
  "reintentos": "reintentos",
  "rendimiento": "rendimiento",
  "repositorio": "repositorio",
  "repositorios": "repositorios",
  "reposutorio": "repositorio",
  "reposutorios": "repositorios",
  "reproductor": "reproductor",
  "respositorio": "repositorio",
  "respositorios": "repositorios",
  "rest": "REST",
  "reutilizacion": "reutilización",
  "rpc": "RPC",
  "rust": "Rust",
  "scrol": "scroll",
  "sdk": "SDK",
  "seguridad": "seguridad",
  "sesion": "sesión",
  "sesiones": "sesiones",
  "sincrona": "síncrona",
  "sincronizacion": "sincronización",
  "sincrono": "síncrono",
  "skroll": "scroll",
  "solid": "Solid.js",
  "solidjs": "Solid.js",
  "solucion": "solución",
  "soluciones": "soluciones",
  "sonido": "sonido",
  "sonidos": "sonidos",
  "sql": "SQL",
  "sqlite": "SQLite",
  "sqlite3": "SQLite3",
  "ssd": "SSD",
  "sse": "SSE",
  "ssh": "SSH",
  "ssl": "SSL",
  "sub-agente": "sub-agente",
  "sub-agentes": "sub-agentes",
  "subagente": "sub-agente",
  "subagentes": "sub-agentes",
  "svelte": "Svelte",
  "svg": "SVG",
  "tailwind": "Tailwind CSS",
  "tailwindcss": "Tailwind CSS",
  "tambien": "también",
  "tambn": "también",
  "tamnbien": "también",
  "tamnbién": "también",
  "tamvien": "también",
  "tauri": "Tauri",
  "tcp": "TCP",
  "tdd": "TDD",
  "teclado": "teclado",
  "teclados": "teclados",
  "tls": "TLS",
  "tmb": "también",
  "ts": "TS",
  "tts": "TTS",
  "typescript": "TypeScript",
  "udp": "UDP",
  "ui": "UI",
  "ultima": "última",
  "ultimas": "últimas",
  "ultimo": "último",
  "ultimos": "últimos",
  "uri": "URI",
  "url": "URL",
  "urls": "URLs",
  "uuid": "UUID",
  "ux": "UX",
  "validacion": "validación",
  "velocidad": "velocidad",
  "ventana": "ventana",
  "ventanas": "ventanas",
  "verifcar": "verificar",
  "verifcarse": "verificarse",
  "verificacion": "verificación",
  "verificaciones": "verificaciones",
  "verifivar": "verificar",
  "version": "versión",
  "versiones": "versiones",
  "vista": "vista",
  "visualizacion": "visualización",
  "vite": "Vite",
  "voces": "voces",
  "volumen": "volumen",
  "voz": "voz",
  "vram": "VRAM",
  "vue": "Vue",
  "vuejs": "Vue",
  "webp": "WebP",
  "webpack": "Webpack",
  "webrtc": "WebRTC",
  "websocket": "WebSocket",
  "websockets": "WebSockets",
  "windows": "Windows",
  "xml": "XML",
  "yaml": "YAML",
  "yarn": "Yarn",
}

/**
 * Aísla elementos que no deben ser transformados ni modificados por expresiones regulares:
 * URLs, rutas de archivo, bloques de código, variables entre corchetes o backticks.
 */
export function isolateProtectedTokens(text: string): {
  maskedText: string
  restore: (processedText: string) => string
} {
  const tokens: string[] = []

  // 1. Bloques de código con triple backtick
  let masked = text.replace(/```[\s\S]*?```/g, (match) => {
    const idx = tokens.length
    tokens.push(match)
    return `__TIAN_TOKEN_${idx}__`
  })

  // 2. Fragmentos de código inline entre backticks
  masked = masked.replace(/`[^`]+`/g, (match) => {
    const idx = tokens.length
    tokens.push(match)
    return `__TIAN_TOKEN_${idx}__`
  })

  // 3. URLs
  masked = masked.replace(/https?:\/\/[^\s)]+/g, (match) => {
    const idx = tokens.length
    tokens.push(match)
    return `__TIAN_TOKEN_${idx}__`
  })

  // 4. Variables tipo {{...}} o ${...}
  masked = masked.replace(/(\{\{[^{}]+\}\}|\$\{[^{}]+\})/g, (match) => {
    const idx = tokens.length
    tokens.push(match)
    return `__TIAN_TOKEN_${idx}__`
  })

  // 5. Rutas de archivo absolutas o relativas con barra o contrabarra
  masked = masked.replace(/(?:[a-zA-Z]:[\\/]|(?:\.\.?[\\/])|(?:@\/|[a-zA-Z0-9_-]+[\\/]))[a-zA-Z0-9._\\/-]+/g, (match) => {
    const idx = tokens.length
    tokens.push(match)
    return `__TIAN_TOKEN_${idx}__`
  })

  const restore = (processedText: string): string => {
    return processedText.replace(/__TIAN_TOKEN_(\d+)__/g, (_, idx) => {
      const i = parseInt(idx, 10)
      return tokens[i] ?? `__TIAN_TOKEN_${idx}__`
    })
  }

  return { maskedText: masked, restore }
}

export function normalizeSpellingAndTerms(text: string): string {
  const { maskedText, restore } = isolateProtectedTokens(text)

  let cleaned = maskedText
    // Limpieza de espacios redundantes
    .replace(/[ \t]+/g, " ")
    // Puntuación: asegurar espacio tras comas, dos puntos, punto y coma, exclamaciones e interrogaciones
    .replace(/([,;:?!])(?=[^\s,;:?!])/g, "$1 ")
    // Reducción de repeticiones exageradas de caracteres (ej. "quee" -> "que", "buenn" -> "buen")
    .replace(/([a-zA-Z])\1{2,}/g, "$1")
    // Locuciones y expresiones comunes
    .replace(/\b(nos ea)\b/gi, "no sea")
    .replace(/\b(porfavor|xfa|x favor)\b/gi, "por favor")
    .replace(/\b(hacer|acer|aser)\b/gi, "hacer")
    .replace(/\b(aver|a ver)\b/gi, "a ver")
    .replace(/\b(ke|q)\b/gi, "que")
    .replace(/\b(pa)\b/gi, "para")
    .replace(/\b(tb|tmb)\b/gi, "también")
    .trim()

  // Reemplazo de términos técnicos y ortografía respetando mayúsculas iniciales
  cleaned = cleaned.replace(/(?<!\.)\b[A-Za-zÁÉÍÓÚáéíóúñÑüÜ0-9-]+\b/g, (word) => {
    const lower = word.toLowerCase()
    if (COMMON_SPELL_MAP[lower]) {
      const match = COMMON_SPELL_MAP[lower]
      if (word[0] === word[0].toUpperCase() && match.toUpperCase() !== match) {
        return match.charAt(0).toUpperCase() + match.slice(1)
      }
      return match
    }
    return word
  })

  return restore(cleaned)
}

export function capitalizeFirst(str: string): string {
  if (!str) return ""
  return str.charAt(0).toUpperCase() + str.slice(1)
}

export function detectIntent(text: string): PromptIntent {
  const lower = text.toLowerCase()
  if (
    /\b(bug|error|falla|fallo|roto|rompe|no funciona|crash|exception|warning|issue|flicker|parpadeo|desync|lock|problema|corrige|corregir|arregla|arreglar|fix|soluciona|solucionar)\b/i.test(
      lower,
    )
  ) {
    return "debugging"
  }
  if (
    /\b(refactor|refactoriza|refactorizar|optimiza|optimizar|limpia|limpiar|simplifica|simplificar|decouple|desacopla|desacoplar|rendimiento|performance|duplicad|modulariza|modularizar|fuga de memoria|memory leak)\b/i.test(
      lower,
    )
  ) {
    return "refactoring"
  }
  if (
    /\b(review|revisar|auditoría|audita|seguridad|standards|estándares|code smell|inspecciona|revisión)\b/i.test(
      lower,
    )
  ) {
    return "review"
  }
  if (
    /\b(script|bash|powershell|sh|deploy|despliegue|ci\/cd|pipeline|dockerfile|compila|empaqueta|release|build script|automatiza|automatización)\b/i.test(
      lower,
    )
  ) {
    return "scripting"
  }
  if (
    /\b(cómo|como funciona|explica|explicar|qué es|que es|por qué|arquitectura|evalúa|evaluar|compara|comparar|alternativa|diferencia|pros y contras)\b/i.test(
      lower,
    )
  ) {
    return "conceptual"
  }
  return "scaffolding"
}

export function extractEntities(text: string): { files: string[]; symbols: string[] } {
  const files: string[] = []
  const symbols: string[] = []

  const fileMatches = text.match(
    /\b[\w./\\-]+\.(?:tsx|ts|jsx|js|py|json|css|html|md|rs|go|java|c|cpp|h|hpp|cs|vue|svelte|sql|sh|bash|ps1|yml|yaml|toml|env|xml)\b/gi,
  )
  if (fileMatches) {
    for (const f of fileMatches) {
      if (!files.includes(f)) files.push(f)
    }
  }

  const symbolMatches = text.match(/`([^`]+)`/g)
  if (symbolMatches) {
    for (const s of symbolMatches) {
      const clean = s.replace(/`/g, "")
      if (!symbols.includes(clean)) symbols.push(clean)
    }
  }

  return { files, symbols }
}

export function resolveModelFamily(nameOrProvider?: string): ModelFamily {
  if (!nameOrProvider) return "generic"
  const val = nameOrProvider.toLowerCase()
  if (val.includes("claude") || val.includes("anthropic")) return "claude"
  if (val.includes("gpt") || val.includes("openai") || val.includes("o1") || val.includes("o3") || val.includes("codex")) return "openai"
  if (val.includes("gemini") || val.includes("google")) return "gemini"
  if (val.includes("deepseek")) return "deepseek"
  return "generic"
}

/**
 * Pipeline de Optimización Contextual de Prompts v2.
 * Deduce la intención, corrige ortografía y construye directivas estructuradas
 * adaptadas a la familia de modelo objetivo con cláusulas anti-sobreingeniería.
 */
export function enhancePromptText(
  rawText: string,
  isSpanish: boolean,
  options?: EnhanceOptions,
): string {
  const text = rawText.trim()
  if (!text) return ""

  // Si ya contiene encabezados estructurados o etiquetas XML nativas, respetamos el formato
  if (
    text.includes("###") ||
    text.includes("## Objetivo") ||
    text.includes("## Directivas") ||
    text.includes("<role>") ||
    text.includes("<context>") ||
    text.includes("<task>")
  ) {
    return text
  }

  // Normalizar ortografía y terminología técnica protegiendo código
  const normalized = normalizeSpellingAndTerms(text)

  // Tokenizar cláusulas protegiendo tokens especiales
  const { maskedText, restore } = isolateProtectedTokens(normalized)

  const rawClauses = maskedText
    .split(
      /(?:\.(?:\s+|$)|[;\n]+\s*|\s*,\s*(?:y\s+(?:por\s+último\s+|también\s+)?|además\s+|también\s+|por\s+último\s+))/i,
    )
    .map((c) => c.trim())
    .filter((c) => c.length > 2)

  if (rawClauses.length === 0) {
    return normalized
  }

  const formattedRequirements = rawClauses.map((clause) => {
    let clean = clause
      .replace(
        /^(?:necesito\s+que\s+|quiero\s+que\s+|haz\s+que\s+|por\s+favor\s+|podrías\s+|cambia\s+que\s+|revisa\s+que\s+|y\s+|de\s+|que\s+)/i,
        "",
      )
      .trim()
    clean = capitalizeFirst(clean)
    if (!clean.endsWith(".")) clean += "."
    return restore(`- ${clean}`)
  })

  const intent = detectIntent(normalized)
  const { files } = extractEntities(normalized)
  const mainGoal = restore(capitalizeFirst(rawClauses[0]))
  const modelFamily = options?.modelFamily ?? "generic"

  // 1. ESTRATEGIA ANTHROPIC CLAUDE (Estructura XML, Contexto Primero, Restricciones Estrictas)
  if (modelFamily === "claude") {
    return formatClaudePrompt({
      isSpanish,
      intent,
      mainGoal,
      requirements: formattedRequirements,
      files,
    })
  }

  // 2. ESTRATEGIA OPENAI (Outcome-driven, Acceptance Criteria, Verificación)
  if (modelFamily === "openai") {
    return formatOpenAIPrompt({
      isSpanish,
      intent,
      mainGoal,
      requirements: formattedRequirements,
      files,
    })
  }

  // 3. ESTRATEGIA GEMINI (Directa, Concisa, Markdown puro, Solicitud de Profundidad)
  if (modelFamily === "gemini") {
    return formatGeminiPrompt({
      isSpanish,
      intent,
      mainGoal,
      requirements: formattedRequirements,
      files,
    })
  }

  // 4. ESTRATEGIA DEEPSEEK (Directa, Cero-Shot, Rigor Técnico)
  if (modelFamily === "deepseek") {
    return formatDeepSeekPrompt({
      isSpanish,
      intent,
      mainGoal,
      requirements: formattedRequirements,
      files,
    })
  }

  // 5. ESTRATEGIA GENÉRICA / UNIVERSAL (Compatible con implementaciones previas y máxima claridad)
  return formatGenericPrompt({
    isSpanish,
    intent,
    mainGoal,
    requirements: formattedRequirements,
    files,
  })
}

interface PromptContext {
  isSpanish: boolean
  intent: PromptIntent
  mainGoal: string
  requirements: string[]
  files: string[]
}

function formatGenericPrompt(ctx: PromptContext): string {
  const { isSpanish, intent, mainGoal, requirements, files } = ctx

  if (isSpanish) {
    const sections: string[] = []

    if (intent === "debugging") {
      sections.push("### 🐛 Diagnóstico y Corrección de Error")
      sections.push(`**Problema:** ${mainGoal}.`)
      if (requirements.length > 1) {
        sections.push("\n**Síntomas y Detalles Observados:**")
        sections.push(requirements.join("\n"))
      }
      if (files.length > 0) {
        sections.push(`\n**Archivos / Módulos en Observación:**\n${files.map((f) => `- \`${f}\``).join("\n")}`)
      }
      sections.push("\n**Restricciones & Alcance:**\n- Modificar únicamente los archivos necesarios sin refactorizaciones colaterales.\n- Proteger la compatibilidad retroactiva y tipos estrictos.")
      sections.push("\n**Plan de Verificación:**\n- Comprobar la solución reproduciendo el escenario y ejecutando tests o linter.")
      return sections.join("\n")
    }

    if (intent === "refactoring") {
      sections.push("### ♻️ Plan de Refactorización y Optimización")
      sections.push(`**Objetivo de Reestructuración:** ${mainGoal}.`)
      if (requirements.length > 1) {
        sections.push("\n**Puntos de Intervención:**")
        sections.push(requirements.join("\n"))
      }
      if (files.length > 0) {
        sections.push(`\n**Archivos Afectados:**\n${files.map((f) => `- \`${f}\``).join("\n")}`)
      }
      sections.push("\n**Invariantes:**\n- Mantener intacto el comportamiento externo y contratos públicos.\n- Evitar dependencias innecesarias o sobreingeniería.")
      sections.push("\n**Plan de Verificación:**\n- Ejecutar suite de pruebas unitarias para confirmar cero regresiones.")
      return sections.join("\n")
    }

    if (intent === "conceptual") {
      sections.push("### 💡 Consulta Técnica y Análisis de Arquitectura")
      sections.push(`**Pregunta Principal:** ${mainGoal}.`)
      if (requirements.length > 1) {
        sections.push("\n**Aspectos Específicos a Evaluar:**")
        sections.push(requirements.join("\n"))
      }
      sections.push("\n**Criterios de Análisis:**\n- Comparar pros, contras, rendimiento e impacto arquitectónico con ejemplos concretos.")
      return sections.join("\n")
    }

    if (intent === "scripting") {
      sections.push("### ⚙️ Automatización y Scripting")
      sections.push(`**Meta:** ${mainGoal}.`)
      if (requirements.length > 0) {
        sections.push("\n**Pasos de Ejecución:**")
        sections.push(requirements.join("\n"))
      }
      if (files.length > 0) {
        sections.push(`\n**Archivos Involucrados:**\n${files.map((f) => `- \`${f}\``).join("\n")}`)
      }
      sections.push("\n**Restricciones:**\n- Código idempotente, manejo explícito de errores y compatibilidad de entorno.")
      return sections.join("\n")
    }

    if (intent === "review") {
      sections.push("### 🔍 Revisión de Código y Auditoría")
      sections.push(`**Objetivo de Revisión:** ${mainGoal}.`)
      if (requirements.length > 1) {
        sections.push("\n**Focos de Atención:**")
        sections.push(requirements.join("\n"))
      }
      if (files.length > 0) {
        sections.push(`\n**Archivos a Auditar:**\n${files.map((f) => `- \`${f}\``).join("\n")}`)
      }
      sections.push("\n**Dimensiones:**\n- Corrección técnica, seguridad, rendimiento y adherencia a convenciones del proyecto.")
      return sections.join("\n")
    }

    // Por defecto: Scaffolding / Feature
    sections.push("### 🎯 Objetivo Principal")
    sections.push(`**Meta:** ${mainGoal}.`)
    if (requirements.length > 0) {
      sections.push("\n### 📋 Requerimientos y Directivas Clave")
      sections.push(requirements.join("\n"))
    }
    if (files.length > 0) {
      sections.push(`\n**Archivos / Módulos Involucrados:**\n${files.map((f) => `- \`${f}\``).join("\n")}`)
    }
    sections.push("\n**Restricciones & Buenas Prácticas:**\n- Implementación completa sin placeholders tipo TODO.\n- Seguir las convenciones y dependencias actuales del proyecto.")
    sections.push("\n**Verificación:**\n- Validar el resultado mediante compilación o ejecución de tests.")
    return sections.join("\n")
  }

  // Versión en inglés (English)
  const sections: string[] = []

  if (intent === "debugging") {
    sections.push("### 🐛 Bug Diagnosis & Resolution")
    sections.push(`**Issue:** ${mainGoal}.`)
    if (requirements.length > 1) {
      sections.push("\n**Observed Symptoms:**")
      sections.push(requirements.join("\n"))
    }
    if (files.length > 0) {
      sections.push(`\n**Target Files:**\n${files.map((f) => `- \`${f}\``).join("\n")}`)
    }
    sections.push("\n**Constraints:**\n- Limit modifications strictly to affected logic; no unsolicited refactors.\n- Preserve existing API contracts and strict typing.")
    sections.push("\n**Verification:**\n- Verify bug fix through automated tests or reproduction steps.")
    return sections.join("\n")
  }

  if (intent === "refactoring") {
    sections.push("### ♻️ Refactoring & Performance Plan")
    sections.push(`**Goal:** ${mainGoal}.`)
    if (requirements.length > 1) {
      sections.push("\n**Intervention Areas:**")
      sections.push(requirements.join("\n"))
    }
    if (files.length > 0) {
      sections.push(`\n**Target Files:**\n${files.map((f) => `- \`${f}\``).join("\n")}`)
    }
    sections.push("\n**Invariants:**\n- Ensure functional parity with zero regression in external behavior.")
    sections.push("\n**Verification:**\n- Run test suite to validate regression-free refactoring.")
    return sections.join("\n")
  }

  if (intent === "conceptual") {
    sections.push("### 💡 Technical Architecture & Conceptual Analysis")
    sections.push(`**Core Inquiry:** ${mainGoal}.`)
    if (requirements.length > 1) {
      sections.push("\n**Specific Dimensions to Evaluate:**")
      sections.push(requirements.join("\n"))
    }
    sections.push("\n**Evaluation Criteria:**\n- Provide concrete trade-offs, performance impact, and architecture recommendations.")
    return sections.join("\n")
  }

  // Default: Scaffolding / Feature
  sections.push("### 🎯 Primary Objective")
  sections.push(`**Goal:** ${mainGoal}.`)
  if (requirements.length > 0) {
    sections.push("\n### 📋 Key Requirements & Directives")
    sections.push(requirements.join("\n"))
  }
  if (files.length > 0) {
    sections.push(`\n**Target Files / Modules:**\n${files.map((f) => `- \`${f}\``).join("\n")}`)
  }
  sections.push("\n**Constraints & Invariants:**\n- Minimal surgical changes without scope creep or placeholder code.\n- Follow existing project standards and idioms.")
  sections.push("\n**Verification:**\n- Verify changes via build, typecheck, or tests.")
  return sections.join("\n")
}

function formatClaudePrompt(ctx: PromptContext): string {
  const { isSpanish, mainGoal, requirements, files } = ctx
  const lines: string[] = []

  if (isSpanish) {
    lines.push("<context>")
    lines.push(`Objetivo contextual: ${mainGoal}.`)
    if (files.length > 0) {
      lines.push(`Archivos relevantes:\n${files.map((f) => `- ${f}`).join("\n")}`)
    }
    lines.push("</context>")
    lines.push("\n<instructions>")
    lines.push(requirements.length > 0 ? requirements.join("\n") : `- Implementar ${mainGoal}.`)
    lines.push("</instructions>")
    lines.push("\n<constraints>")
    lines.push("- Alcance mínimo: Modificar únicamente los archivos estrictamente necesarios.")
    lines.push("- Respetar convenciones existentes, patrones de arquitectura y tipado estricto.")
    lines.push("- Cero placeholders o código simulado; entregar código listo para producción.")
    lines.push("</constraints>")
    lines.push("\n<verification>")
    lines.push("- Verificar la solución mediante compilación (`typecheck`), tests o comprobación directa.")
    lines.push("</verification>")
  } else {
    lines.push("<context>")
    lines.push(`Contextual objective: ${mainGoal}.`)
    if (files.length > 0) {
      lines.push(`Relevant files:\n${files.map((f) => `- ${f}`).join("\n")}`)
    }
    lines.push("</context>")
    lines.push("\n<instructions>")
    lines.push(requirements.length > 0 ? requirements.join("\n") : `- Implement ${mainGoal}.`)
    lines.push("</instructions>")
    lines.push("\n<constraints>")
    lines.push("- Minimal scope: Edit only files required for this task. No unsolicited refactors.")
    lines.push("- Follow existing conventions, architectural patterns, and strict typing.")
    lines.push("- Complete implementation: no TODOs or dummy stubs.")
    lines.push("</constraints>")
    lines.push("\n<verification>")
    lines.push("- Verify via build, typecheck, and relevant unit tests.")
    lines.push("</verification>")
  }

  return lines.join("\n")
}

function formatOpenAIPrompt(ctx: PromptContext): string {
  const { isSpanish, mainGoal, requirements, files } = ctx
  const lines: string[] = []

  if (isSpanish) {
    lines.push(`## 🎯 Meta Principal\n${mainGoal}.`)
    if (files.length > 0) {
      lines.push(`\n## 📁 Módulos Afectados\n${files.map((f) => `- \`${f}\``).join("\n")}`)
    }
    lines.push("\n## 📋 Criterios de Aceptación")
    lines.push(requirements.length > 0 ? requirements.join("\n") : `- Completar ${mainGoal}.`)
    lines.push("\n## 🛡️ Restricciones e Invariantes\n- Cambios quirúrgicos y mínimos, sin modificar arquitectura no relacionada.\n- Respetar estilos existentes y tipos estrictos.")
    lines.push("\n## 🧪 Verificación Obligatoria\n- Validar con ejecución de pruebas unitarias o comprobación de compilación.")
  } else {
    lines.push(`## 🎯 Primary Goal\n${mainGoal}.`)
    if (files.length > 0) {
      lines.push(`\n## 📁 Target Files\n${files.map((f) => `- \`${f}\``).join("\n")}`)
    }
    lines.push("\n## 📋 Acceptance Criteria")
    lines.push(requirements.length > 0 ? requirements.join("\n") : `- Complete ${mainGoal}.`)
    lines.push("\n## 🛡️ Invariants & Constraints\n- Surgical and minimal scope. No unsolicited refactoring.\n- Respect existing idioms, dependencies, and strict types.")
    lines.push("\n## 🧪 Verification Bar\n- Validate with build, typecheck, or test suite execution.")
  }

  return lines.join("\n")
}

function formatGeminiPrompt(ctx: PromptContext): string {
  const { isSpanish, mainGoal, requirements, files } = ctx
  const lines: string[] = []

  if (isSpanish) {
    lines.push(`### 🎯 Objetivo\n${mainGoal}.`)
    if (files.length > 0) {
      lines.push(`\n### 📁 Archivos\n${files.map((f) => `- \`${f}\``).join("\n")}`)
    }
    lines.push("\n### 📋 Directivas de Implementación")
    lines.push(requirements.length > 0 ? requirements.join("\n") : `- Ejecutar ${mainGoal}.`)
    lines.push("\n### 🛡️ Restricciones\n- Producir implementación completa, robusta y limpia sin código simulado.")
    lines.push("\n### 🧪 Verificación\n- Confirmar correcto funcionamiento con tests o verificación de sintaxis.")
  } else {
    lines.push(`### 🎯 Objective\n${mainGoal}.`)
    if (files.length > 0) {
      lines.push(`\n### 📁 Files\n${files.map((f) => `- \`${f}\``).join("\n")}`)
    }
    lines.push("\n### 📋 Implementation Directives")
    lines.push(requirements.length > 0 ? requirements.join("\n") : `- Execute ${mainGoal}.`)
    lines.push("\n### 🛡️ Constraints\n- Provide full, robust, and clean implementation with no placeholders.")
    lines.push("\n### 🧪 Verification\n- Verify functionality via tests or build validation.")
  }

  return lines.join("\n")
}

function formatDeepSeekPrompt(ctx: PromptContext): string {
  const { isSpanish, mainGoal, requirements, files } = ctx
  const lines: string[] = []

  if (isSpanish) {
    lines.push(`**Tarea:** ${mainGoal}.`)
    if (files.length > 0) {
      lines.push(`**Archivos:** ${files.join(", ")}`)
    }
    lines.push("\n**Especificaciones Técnicas:**")
    lines.push(requirements.length > 0 ? requirements.join("\n") : `- Resolver ${mainGoal}.`)
    lines.push("\n**Restricciones:** Alcance acotado, rigor tipado y sin alterar contratos públicos.")
  } else {
    lines.push(`**Task:** ${mainGoal}.`)
    if (files.length > 0) {
      lines.push(`**Files:** ${files.join(", ")}`)
    }
    lines.push("\n**Technical Specifications:**")
    lines.push(requirements.length > 0 ? requirements.join("\n") : `- Resolve ${mainGoal}.`)
    lines.push("\n**Constraints:** Bounded scope, strict typing, no breaking changes to public contracts.")
  }

  return lines.join("\n")
}
