/**
 * Pipeline de Optimización Contextual de Prompts y Corrección Ortográfica.
 * Normaliza ortografía, typos de teclado, acrónimos técnicos y estructura
 * la intención del usuario en directivas claras para el agente de IA.
 */

export const COMMON_SPELL_MAP: Record<string, string> = {
  // Español - Términos técnicos, hardware y ortografía común
  "codigo": "código",
  "codigos": "códigos",
  "codig": "código",
  "tambien": "también",
  "tamvien": "también",
  "tambn": "también",
  "tmb": "también",
  "queria": "quería",
  "kiero": "quiero",
  "qiero": "quiero",
  "esopacio": "espacio",
  "describrir": "descubrir",
  "descrubir": "descubrir",
  "corrigelos": "corrígelos",
  "corrijelos": "corrígelos",
  "corregi": "corrige",
  "corregir": "corregir",
  "corregime": "corrígeme",
  "arreglalo": "arréglalo",
  "arreglar": "arreglar",
  "arreglame": "arréglame",
  "modificacion": "modificación",
  "modificaciones": "modificaciones",
  "configuracion": "configuración",
  "configuraciones": "configuraciones",
  "solucion": "solución",
  "soluciones": "soluciones",
  "aplicacion": "aplicación",
  "aplicaciones": "aplicaciones",
  "funcion": "función",
  "funciones": "funciones",
  "funsion": "función",
  "funsiones": "funciones",
  "funsione": "funcione",
  "funsionen": "funcionen",
  "funcionene": "funcionen",
  "funcionan": "funcionan",
  "sesion": "sesión",
  "sesiones": "sesiones",
  "informacion": "información",
  "version": "versión",
  "versiones": "versiones",
  "peticion": "petición",
  "peticiones": "peticiones",
  "accion": "acción",
  "acciones": "acciones",
  "metodo": "método",
  "metodos": "métodos",
  "numero": "número",
  "numeros": "números",
  "parametros": "parámetros",
  "parametro": "parámetro",
  "caracter": "carácter",
  "caracteres": "caracteres",
  "mas": "más",
  "esta": "está",
  "estan": "están",
  "estos": "estos",
  "ahi": "ahí",
  "aqui": "aquí",
  "despues": "después",
  "dsps": "después",
  "ultimas": "últimas",
  "ultima": "última",
  "ultimo": "último",
  "ultimos": "últimos",
  "ademas": "además",
  "facil": "fácil",
  "dificil": "difícil",
  "linea": "línea",
  "lineas": "líneas",
  "icono": "ícono",
  "iconos": "íconos",
  "pagina": "página",
  "paginas": "páginas",
  "reposutorio": "repositorio",
  "reposutorios": "repositorios",
  "repositorio": "repositorio",
  "repositorios": "repositorios",
  "respositorio": "repositorio",
  "respositorios": "repositorios",
  "aparque": "abarque",
  "abarque": "abarque",
  "skroll": "scroll",
  "scrol": "scroll",
  "subagente": "sub-agente",
  "subagentes": "sub-agentes",
  "sub-agente": "sub-agente",
  "sub-agentes": "sub-agentes",
  "interfas": "interfaz",
  "conexion": "conexión",
  "conexiones": "conexiones",
  "coneccion": "conexión",
  "conecciones": "conexiones",
  "optimizacion": "optimización",
  "optimizaciones": "optimizaciones",
  "integracion": "integración",
  "integraciones": "integraciones",
  "sincronizacion": "sincronización",
  "validacion": "validación",
  "ejecucion": "ejecución",
  "reutilizacion": "reutilización",
  "autenticacion": "autenticación",
  "autorizacion": "autorización",
  "visualizacion": "visualización",
  "especificacion": "especificación",
  "especificaciones": "especificaciones",
  "diseño": "diseño",
  "pestaña": "pestaña",
  "pestañas": "pestañas",
  "parpadeo": "parpadeo",
  "parpadeos": "parpadeos",
  "vista": "vista",
  "previa": "previa",
  "mascota": "mascota",
  "mascotas": "mascotas",
  "voz": "voz",
  "voces": "voces",
  "femenina": "femenina",
  "femenino": "femenino",
  "masculino": "masculino",
  "microfono": "micrófono",
  "microfonos": "micrófonos",
  "micro": "micrófono",
  "mic": "micrófono",
  "audio": "audio",
  "auricular": "auricular",
  "auriculares": "auriculares",
  "dispositivo": "dispositivo",
  "dispositivos": "dispositivos",
  "hardware": "hardware",
  "detecta": "detecta",
  "detectar": "detectar",
  "detecte": "detecte",
  "velocidad": "velocidad",
  "rapido": "rápido",
  "rapidez": "rapidez",
  "preambulo": "preámbulo",
  "preambulos": "preámbulos",
  "directo": "directo",
  "directa": "directa",
  "actuar": "actuar",
  "inpurt": "input",
  "inpurts": "inputs",
  "propmt": "prompt",
  "propmts": "prompts",
  "promt": "prompt",
  "promts": "prompts",
  "axcrtualizar": "actualizar",
  "acrtualizar": "actualizar",
  "actulizar": "actualizar",
  "actualizas": "actualiza",
  "actualisacion": "actualización",
  "actualisaciones": "actualizaciones",
  "escribio": "escribió",
  "escrivio": "escribió",
  "escribi": "escribí",
  "agas": "hagas",
  "aser": "hacer",
  "acer": "hacer",
  "portavle": "portable",
  "portable": "portable",
  "instalador": "instalador",
  "intalador": "instalador",
  "instalacion": "instalación",
  "intalacion": "instalación",
  "compilar": "compilar",
  "compilacion": "compilación",
  "ejecutable": "ejecutable",
  "binario": "binario",
  "binarios": "binarios",
  "fichero": "archivo",
  "ficheros": "archivos",
  "archibo": "archivo",
  "archibos": "archivos",
  "pantaya": "pantalla",
  "pantayas": "pantallas",
  "ventana": "ventana",
  "ventanas": "ventanas",
  "comit": "commit",
  "comits": "commits",
  "pushear": "push",
  "pullear": "pull",
  "mergear": "merge",
  "branch": "rama",
  "branches": "ramas",
  "ai": "IA",
  "ia": "IA",
  // Acrónimos y frameworks universales
  "mcp": "MCP",
  "mcps": "MCPs",
  "cpu": "CPU",
  "gpu": "GPU",
  "vram": "VRAM",
  "ram": "RAM",
  "api": "API",
  "apis": "APIs",
  "ui": "UI",
  "ux": "UX",
  "url": "URL",
  "urls": "URLs",
  "html": "HTML",
  "css": "CSS",
  "json": "JSON",
  "js": "JS",
  "ts": "TS",
  "id": "ID",
  "ids": "IDs",
  "sse": "SSE",
  "rest": "REST",
  "http": "HTTP",
  "https": "HTTPS",
  "dom": "DOM",
  "ipc": "IPC",
  "cli": "CLI",
  "llm": "LLM",
  "tts": "TTS",
  "asr": "ASR",
  "solid": "Solid.js",
  "solidjs": "Solid.js",
  "react": "React",
  "electron": "Electron",
  "sqlite": "SQLite",
  "github": "GitHub",
  "git": "Git",
  "windows": "Windows",
  "linux": "Linux",
  "macos": "macOS",
}

export function normalizeSpellingAndTerms(text: string): string {
  let cleaned = text
    // Limpieza de espacios redundantes
    .replace(/[ \t]+/g, " ")
    // Puntuación: asegurar espacio tras comas, dos puntos, punto y coma, exclamaciones e interrogaciones
    .replace(/([,;:?!])(?=[^\s,;:?!])/g, "$1 ")
    // Reducción de repeticiones de caracteres exageradas (ej. "quee" -> "que", "buenn" -> "buen")
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

  // Reemplazo de palabras y términos técnicos respetando mayúsculas, pero sin alterar extensiones de archivo (ej. .ts, .js)
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

  return cleaned
}

export function capitalizeFirst(str: string): string {
  if (!str) return ""
  return str.charAt(0).toUpperCase() + str.slice(1)
}

export type PromptIntent = "debugging" | "scaffolding" | "refactoring" | "conceptual"

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
    /\b(refactor|refactoriza|refactorizar|optimiza|optimizar|limpia|limpiar|simplifica|simplificar|decouple|desacopla|desacoplar|rendimiento|performance|duplicad|modulariza|modularizar)\b/i.test(
      lower,
    )
  ) {
    return "refactoring"
  }
  if (
    /\b(cómo|como funciona|explica|explicar|qué es|que es|por qué|arquitectura|evalúa|evaluar|compara|comparar|alternativa|diferencia)\b/i.test(
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

  const fileMatches = text.match(/\b[\w./\\-]+\.(?:tsx|ts|jsx|js|py|json|css|html|md|rs|go)\b/gi)
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

/**
 * Pipeline de Optimización Contextual de Prompts.
 * Deduce la intención, corrige ortografía y construye directivas ejecutables para el modelo.
 */
export function enhancePromptText(rawText: string, isSpanish: boolean): string {
  const text = rawText.trim()
  if (!text) return ""

  // Normalizar ortografía y terminología técnica
  const normalized = normalizeSpellingAndTerms(text)

  // Si ya contiene encabezados estructurados, respetamos el formato
  if (normalized.includes("###") || normalized.includes("## Objetivo") || normalized.includes("## Directivas")) {
    return normalized
  }

  // Segmentar oraciones y directivas respetando nombres de archivo con punto
  const rawClauses = normalized
    .split(/(?:\.(?:\s+|$)|[;\n]+\s*|\s*,\s*(?:y\s+(?:por\s+último\s+|también\s+)?|además\s+|también\s+|por\s+último\s+))/i)
    .map((c) => c.trim())
    .filter((c) => c.length > 2)

  if (rawClauses.length === 0) {
    return normalized
  }

  const formattedRequirements = rawClauses.map((clause) => {
    let clean = clause
      .replace(/^(?:necesito\s+que\s+|quiero\s+que\s+|haz\s+que\s+|por\s+favor\s+|podrías\s+|cambia\s+que\s+|revisa\s+que\s+|en\s+|y\s+|de\s+|para\s+|que\s+)/i, "")
      .trim()
    clean = capitalizeFirst(clean)
    if (!clean.endsWith(".")) clean += "."
    return `- ${clean}`
  })

  const intent = detectIntent(normalized)
  const { files } = extractEntities(normalized)
  const mainGoal = capitalizeFirst(rawClauses[0])

  if (isSpanish) {
    const sections: string[] = []

    if (intent === "debugging") {
      sections.push("### 🐛 Diagnóstico y Corrección de Error")
      sections.push(`**Problema:** ${mainGoal}.`)
      if (formattedRequirements.length > 1) {
        sections.push("\n**Síntomas y Detalles Observados:**")
        sections.push(formattedRequirements.join("\n"))
      }
      if (files.length > 0) {
        sections.push(`\n**Archivos / Módulos en Observación:**\n${files.map((f) => `- \`${f}\``).join("\n")}`)
      }
      sections.push("\n### 🔍 Hipótesis de Causa Raíz & Puntos Críticos")
      sections.push(
        [
          "- Inspeccionar posibles desincronizaciones de estado reactivo, condiciones de carrera o referencias nulas.",
          "- Validar el ciclo de vida de componentes y liberación de recursos (procesos, locks o listeners).",
        ].join("\n"),
      )
      sections.push("\n### 🛠️ Directivas de Solución")
      sections.push(
        [
          "- Aplicar una solución quirúrgica y mínima que ataque la causa raíz sin efectos secundarios en otras áreas.",
          "- Asegurar compatibilidad de tipos TypeScript estricta y manejo explícito de errores.",
        ].join("\n"),
      )
      sections.push("\n### ✅ Criterios de Verificación")
      sections.push("- Confirmar la resolución del fallo con typecheck limpio y validación de escenarios de borde.")
      return sections.join("\n")
    }

    if (intent === "refactoring") {
      sections.push("### ♻️ Plan de Refactorización y Optimización")
      sections.push(`**Objetivo de Reestructuración:** ${mainGoal}.`)
      if (formattedRequirements.length > 1) {
        sections.push("\n**Puntos de Intervención:**")
        sections.push(formattedRequirements.join("\n"))
      }
      if (files.length > 0) {
        sections.push(`\n**Archivos Afectados:**\n${files.map((f) => `- \`${f}\``).join("\n")}`)
      }
      sections.push("\n### 📐 Directivas Arquitectónicas")
      sections.push(
        [
          "- **Invariante de Comportamiento:** Preservar intactas las firmas públicas y el comportamiento observable existente.",
          "- **Desacoplamiento:** Reducir complejidad ciclomática, eliminar duplicación de código y definir límites limpios.",
          "- **Rendimiento:** Optimizar consumo de recursos, memoria y evitar renders/cálculos innecesarios.",
        ].join("\n"),
      )
      sections.push("\n### 🧪 Verificación de No-Regresión")
      sections.push("- Validar compilación estricta con `typecheck` y asegurar que todas las suites de prueba sigan pasando.")
      return sections.join("\n")
    }

    if (intent === "conceptual") {
      sections.push("### 💡 Consulta Técnica y Análisis de Arquitectura")
      sections.push(`**Pregunta Principal:** ${mainGoal}.`)
      if (formattedRequirements.length > 1) {
        sections.push("\n**Aspectos Específicos a Evaluar:**")
        sections.push(formattedRequirements.join("\n"))
      }
      sections.push("\n### ⚖️ Dimensiones de Análisis Requeridas")
      sections.push(
        [
          "- **Trade-offs Técnicos:** Comparar viabilidad, rendimiento, complejidad de adopción y costo de mantenimiento.",
          "- **Patrones y Buenas Prácticas:** Evaluar estándares de la industria y alternativas recomendadas.",
          "- **Entregables:** Proporcionar explicaciones claras acompañadas de ejemplos de código idiomáticos y aplicables.",
        ].join("\n"),
      )
      return sections.join("\n")
    }

    // Por defecto: Especificación de Tarea & Requerimientos
    sections.push("### 🎯 Objetivo Principal")
    sections.push(`**Meta:** ${mainGoal}.`)
    if (formattedRequirements.length > 0) {
      sections.push("\n### 📋 Requerimientos y Directivas Clave")
      sections.push(formattedRequirements.join("\n"))
    }
    if (files.length > 0) {
      sections.push(`\n**Archivos / Módulos Involucrados:**\n${files.map((f) => `- \`${f}\``).join("\n")}`)
    }
    sections.push("\n### 🛠️ Directivas de Ejecución para el Agente")
    sections.push(
      [
        "- Implementar una solución quirúrgica, modular y sin efectos secundarios en el resto del proyecto.",
        "- Respetar contratos existentes, tipado TypeScript estricto y manejo defensivo de errores.",
        "- Validar compilación limpia (typecheck), ejecución de pruebas y verificación de no-regresión.",
      ].join("\n"),
    )
    return sections.join("\n")
  }

  // Versión en inglés (English)
  const sections: string[] = []

  if (intent === "debugging") {
    sections.push("### 🐛 Bug Diagnosis & Resolution")
    sections.push(`**Issue:** ${mainGoal}.`)
    if (formattedRequirements.length > 1) {
      sections.push("\n**Observed Symptoms:**")
      sections.push(formattedRequirements.join("\n"))
    }
    if (files.length > 0) {
      sections.push(`\n**Target Files:**\n${files.map((f) => `- \`${f}\``).join("\n")}`)
    }
    sections.push("\n### 🔍 Root Cause Hypotheses & Key Inspection Points")
    sections.push(
      [
        "- Inspect reactive state desynchronizations, race conditions, or unhandled null/undefined values.",
        "- Verify lifecycle cleanup of resources, background tasks, or active locks.",
      ].join("\n"),
    )
    sections.push("\n### 🛠️ Solution Directives")
    sections.push(
      [
        "- Apply a surgical, minimal fix addressing the root cause without touching unrelated modules.",
        "- Ensure strict TypeScript type safety and defensive error boundaries.",
      ].join("\n"),
    )
    sections.push("\n### ✅ Verification Criteria")
    sections.push("- Confirm bug resolution with clean typecheck and zero regression.")
    return sections.join("\n")
  }

  if (intent === "refactoring") {
    sections.push("### ♻️ Refactoring & Performance Plan")
    sections.push(`**Goal:** ${mainGoal}.`)
    if (formattedRequirements.length > 1) {
      sections.push("\n**Intervention Areas:**")
      sections.push(formattedRequirements.join("\n"))
    }
    if (files.length > 0) {
      sections.push(`\n**Target Files:**\n${files.map((f) => `- \`${f}\``).join("\n")}`)
    }
    sections.push("\n### 📐 Architectural Directives")
    sections.push(
      [
        "- **Behavioral Invariant:** Keep public API signatures and observable behavior strictly preserved.",
        "- **Decoupling:** Reduce cyclomatic complexity, remove duplication, and isolate boundaries.",
        "- **Efficiency:** Eliminate unnecessary re-renders or allocations.",
      ].join("\n"),
    )
    sections.push("\n### 🧪 Non-Regression Verification")
    sections.push("- Validate with strict typecheck and ensure all existing test suites pass.")
    return sections.join("\n")
  }

  if (intent === "conceptual") {
    sections.push("### 💡 Technical Architecture & Conceptual Analysis")
    sections.push(`**Core Inquiry:** ${mainGoal}.`)
    if (formattedRequirements.length > 1) {
      sections.push("\n**Specific Dimensions to Evaluate:**")
      sections.push(formattedRequirements.join("\n"))
    }
    sections.push("\n### ⚖️ Required Analysis")
    sections.push(
      [
        "- **Technical Trade-offs:** Compare feasibility, performance, adoption complexity, and maintenance overhead.",
        "- **Patterns & Best Practices:** Assess industry standards and clean design patterns.",
        "- **Deliverables:** Provide structured insights with idiomatic, actionable code snippets.",
      ].join("\n"),
    )
    return sections.join("\n")
  }

  // Default: Task Specification & Directives
  sections.push("### 🎯 Primary Objective")
  sections.push(`**Goal:** ${mainGoal}.`)
  if (formattedRequirements.length > 0) {
    sections.push("\n### 📋 Key Requirements & Directives")
    sections.push(formattedRequirements.join("\n"))
  }
  if (files.length > 0) {
    sections.push(`\n**Target Files / Modules:**\n${files.map((f) => `- \`${f}\``).join("\n")}`)
  }
  sections.push("\n### 🛠️ Agent Execution Directives")
  sections.push(
    [
      "- Apply a surgical, modular implementation without introducing regressions or side effects.",
      "- Ensure strict TypeScript type safety, clean contracts, and defensive error handling.",
      "- Verify with clean compilation (typecheck), test execution, and behavior verification.",
    ].join("\n"),
  )
  return sections.join("\n")
}
