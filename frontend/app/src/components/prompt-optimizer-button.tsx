import { createSignal, Show, type JSX } from "solid-js"
import { TooltipV2 } from "@tiancode-ai/ui/v2/tooltip-v2"
import { useLanguage } from "@/context/language"
import { useServerSDK } from "@/context/server-sdk"

export function IconSparkles(props: JSX.SvgSVGAttributes<SVGSVGElement>) {
  return (
    <svg {...props} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        shape-rendering="geometricPrecision"
        d="M9.8132 15.9038L9 18.75L8.1868 15.9038C7.75968 14.4089 6.59112 13.2403 5.09619 12.8132L2.25 12L5.09619 11.1868C6.59113 10.7597 7.75968 9.59112 8.1868 8.09619L9 5.25L9.8132 8.09619C10.2403 9.59113 11.4089 10.7597 12.9038 11.1868L15.75 12L12.9038 12.8132C11.4089 13.2403 10.2403 14.4089 9.8132 15.9038Z"
        stroke="currentColor"
        stroke-width="1.5"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
      <path
        d="M18.2589 8.71454L18 9.75L17.7411 8.71454C17.4388 7.50533 16.4947 6.56117 15.2855 6.25887L14.25 6L15.2855 5.74113C16.4947 5.43883 17.4388 4.49467 17.7411 3.28546L18 2.25L18.2589 3.28546C18.5612 4.49467 19.5053 5.43883 20.7145 5.74113L21.75 6L20.7145 6.25887C19.5053 6.56117 18.5612 7.50533 18.2589 8.71454Z"
        stroke="currentColor"
        stroke-width="1.5"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
      <path
        d="M16.8942 20.5673L16.5 21.75L16.1058 20.5673C15.8818 19.8954 15.3546 19.3682 14.6827 19.1442L13.5 18.75L14.6827 18.3558C15.3546 18.1318 15.8818 17.6046 16.1058 16.9327L16.5 15.75L16.8942 16.9327C17.1182 17.6046 17.6454 18.1318 18.3173 18.3558L19.5 18.75L18.3173 19.1442C17.6454 19.3682 17.1182 19.8954 16.8942 20.5673Z"
        stroke="currentColor"
        stroke-width="1.5"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    </svg>
  )
}

/**
 * Diccionario ampliado de correcciones ortográficas, tildes, términos técnicos y arquitectura.
 */
const COMMON_SPELL_MAP: Record<string, string> = {
  // Español - Términos técnicos y ortografía común
  "codigo": "código",
  "codigos": "códigos",
  "tambien": "también",
  "queria": "quería",
  "esopacio": "espacio",
  "describrir": "descubrir",
  "descrubir": "descubrir",
  "corrigelos": "corrígelos",
  "corrijelos": "corrígelos",
  "corregir": "corregir",
  "modificacion": "modificación",
  "modificaciones": "modificaciones",
  "configuracion": "configuración",
  "solucion": "solución",
  "soluciones": "soluciones",
  "aplicacion": "aplicación",
  "aplicaciones": "aplicaciones",
  "funcion": "función",
  "funciones": "funciones",
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
  "ultimas": "últimas",
  "ultima": "última",
  "ultimo": "último",
  "ultimos": "últimos",
  "ademas": "además",
  "facil": "fácil",
  "dificil": "difícil",
  "linea": "línea",
  "lineas": "líneas",
  "icono": "icono",
  "iconos": "iconos",
  "pagina": "página",
  "paginas": "páginas",
  "reposutorio": "repositorio",
  "reposutorios": "repositorios",
  "repositorio": "repositorio",
  "repositorios": "repositorios",
  "aparque": "abarque",
  "abarque": "abarque",
  "skroll": "scroll",
  "scrol": "scroll",
  "subagente": "sub-agente",
  "subagentes": "sub-agentes",
  "sub-agente": "sub-agente",
  "sub-agentes": "sub-agentes",
  "nos ea": "no sea",
  "interfas": "interfaz",
  "conexion": "conexión",
  "conexiones": "conexiones",
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
  "solid": "Solid.js",
  "solidjs": "Solid.js",
  "react": "React",
  "electron": "Electron",
  "sqlite": "SQLite",
  "github": "GitHub",
}

function normalizeSpellingAndTerms(text: string): string {
  let cleaned = text
    .replace(/\s+/g, " ")
    .replace(/\s*([,.:;?!])\s*/g, "$1 ")
    .replace(/\s*\(\s*/g, " (")
    .replace(/\s*\)\s*/g, ") ")
    .replace(/\b(nos ea|no sea)\b/gi, "no sea")
    .replace(/\b(porfavor|por favor)\b/gi, "por favor")
    .replace(/\b(hacer|acer)\b/gi, "hacer")
    .replace(/\b(aver|a ver)\b/gi, "a ver")
    .trim()

  // Reemplazo de palabras y términos técnicos respetando mayúsculas
  cleaned = cleaned.replace(/\b[A-Za-zÁÉÍÓÚáéíóúñÑüÜ-]+\b/g, (word) => {
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

function capitalizeFirst(str: string): string {
  if (!str) return ""
  return str.charAt(0).toUpperCase() + str.slice(1)
}

export type PromptIntent = "debugging" | "scaffolding" | "refactoring" | "conceptual"

function detectIntent(text: string): PromptIntent {
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

function extractEntities(text: string): { files: string[]; symbols: string[] } {
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
 * Pipeline de Optimización Contextual de Prompts (Estilo Trae.ai / Cursor).
 * Clasifica la intención del usuario (Debugging, Scaffolding, Refactor, Conceptual),
 * extrae entidades técnicas y genera especificaciones estructuradas sin redundancia.
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

  // Segmentar oraciones y directivas
  const rawClauses = normalized
    .split(/(?:[.;\n]+\s*|\s*,\s*(?:y\s+(?:por\s+último\s+|también\s+)?|además\s+|también\s+|por\s+último\s+))/i)
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

    // Por defecto: Scaffolding / Nueva Característica
    sections.push("### 🚀 Especificación de Feature & Scaffolding")
    sections.push(`**Objetivo Funcional:** ${mainGoal}.`)
    if (formattedRequirements.length > 1) {
      sections.push("\n### 📋 Requerimientos y Casos de Uso")
      sections.push(formattedRequirements.join("\n"))
    }
    if (files.length > 0) {
      sections.push(`\n**Archivos Involucrados:**\n${files.map((f) => `- \`${f}\``).join("\n")}`)
    }
    sections.push("\n### 🏗️ Fases de Implementación")
    sections.push(
      [
        "1. **Modelado & Tipos:** Diseñar contratos, interfaces o esquemas de datos fuertemente tipados sin `any`.",
        "2. **Capa Lógica & Estado:** Implementar el manejo reactivo de estado y la comunicación con servicios/APIs.",
        "3. **Capa Visual & UX:** Construir la UI considerando estados `loading`, `empty`, `error` y transiciones fluidas.",
      ].join("\n"),
    )
    sections.push("\n### 🛡️ Criterios de Calidad")
    sections.push(
      [
        "- Cero regresiones en la base de código existente.",
        "- Código modular, desacoplado y con observabilidad limpia de errores.",
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

  // Default: Scaffolding / Feature
  sections.push("### 🚀 Feature Specification & Scaffolding")
  sections.push(`**Objective:** ${mainGoal}.`)
  if (formattedRequirements.length > 1) {
    sections.push("\n### 📋 Requirements & Specifications")
    sections.push(formattedRequirements.join("\n"))
  }
  if (files.length > 0) {
    sections.push(`\n**Target Files:**\n${files.map((f) => `- \`${f}\``).join("\n")}`)
  }
  sections.push("\n### 🏗️ Implementation Phases")
  sections.push(
    [
      "1. **Contracts & Types:** Define strict TypeScript interfaces/schemas with zero `any`.",
      "2. **Logic & State:** Implement robust reactive state management and API communication.",
      "3. **UI & UX:** Build the interface supporting `loading`, `empty`, and `error` states gracefully.",
    ].join("\n"),
  )
  sections.push("\n### 🛡️ Quality Criteria")
  sections.push(
    [
      "- Zero regressions across the existing codebase.",
      "- Clean modular design adhering to repository conventions.",
    ].join("\n"),
  )
  return sections.join("\n")
}

export function PromptOptimizerButton(props: {
  input: () => string
  onOptimized: (text: string) => void
  disabled?: boolean
  class?: string
}) {
  const language = useLanguage()
  const serverSdk = useServerSDK()
  const [optimizing, setOptimizing] = createSignal(false)
  const [justOptimized, setJustOptimized] = createSignal(false)

  const isSpanish = () => language.intl().toLowerCase().startsWith("es")
  const hasText = () => props.input().trim().length > 0

  const tooltipText = () => {
    if (justOptimized()) {
      return isSpanish() ? "¡Prompt optimizado!" : "Prompt enhanced!"
    }
    if (!hasText()) {
      return language.t("prompt.optimize.empty")
    }
    if (optimizing()) {
      return language.t("prompt.optimize.optimizing")
    }
    return language.t("prompt.optimize.label")
  }

  const handleOptimize = async (e: MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const current = props.input().trim()
    if (!current || optimizing()) return

    setOptimizing(true)
    window.dispatchEvent(new CustomEvent("tiancode:prompt-optimizing", { detail: { active: true } }))
    try {
      await new Promise((r) => setTimeout(r, 180))
      const optimized = enhancePromptText(current, isSpanish())
      
      // Efecto progresivo de escritura y reemplazo en el textarea (estilo Trae.ai)
      const tokens = optimized.split(/(\s+|\n)/)
      let accumulated = ""
      const stepDelay = Math.max(6, Math.min(18, Math.floor(450 / Math.max(tokens.length, 1))))
      
      for (let i = 0; i < tokens.length; i++) {
        accumulated += tokens[i]
        props.onOptimized(accumulated)
        if (i % 2 === 0) {
          await new Promise((r) => setTimeout(r, stepDelay))
        }
      }
      props.onOptimized(optimized)
      setJustOptimized(true)
      window.dispatchEvent(new CustomEvent("tiancode:prompt-optimizing", { detail: { active: false, done: true } }))
      setTimeout(() => setJustOptimized(false), 1600)
    } finally {
      setOptimizing(false)
      window.dispatchEvent(new CustomEvent("tiancode:prompt-optimizing", { detail: { active: false } }))
    }
  }

  return (
    <>
      <style>{`
        @keyframes trae-shimmer {
          0% { background-position: -200% 0; }
          100% { background-position: 200% 0; }
        }
        @keyframes trae-spin-pulse {
          0% { transform: rotate(0deg) scale(0.9); opacity: 0.8; }
          50% { transform: rotate(180deg) scale(1.2); opacity: 1; filter: drop-shadow(0 0 6px #38bdf8); }
          100% { transform: rotate(360deg) scale(1); opacity: 0.9; }
        }
        .trae-optimizer-btn {
          position: relative;
          overflow: hidden;
          transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
        }
        .trae-optimizer-btn:hover:not(:disabled) {
          background: linear-gradient(135deg, rgba(56, 189, 248, 0.15), rgba(168, 85, 247, 0.15));
          box-shadow: 0 0 10px rgba(56, 189, 248, 0.25);
          color: #38bdf8;
        }
        .trae-optimizer-btn.is-optimizing {
          background: linear-gradient(90deg, rgba(56, 189, 248, 0.2) 0%, rgba(168, 85, 247, 0.35) 50%, rgba(56, 189, 248, 0.2) 100%);
          background-size: 200% 100%;
          animation: trae-shimmer 1.2s infinite linear;
        }
        .trae-optimizer-btn.is-optimizing .trae-sparkles {
          animation: trae-spin-pulse 0.9s cubic-bezier(0.4, 0, 0.2, 1) infinite;
          color: #38bdf8;
        }
      `}</style>
      <TooltipV2 value={tooltipText()} placement="top">
        <button
          type="button"
          disabled={!hasText() || optimizing() || props.disabled}
          onClick={handleOptimize}
          aria-label={tooltipText()}
          class={`
            trae-optimizer-btn relative flex size-7 shrink-0 items-center justify-center rounded-md
            ${
              hasText()
                ? "cursor-pointer text-v2-icon-icon-muted hover:text-v2-text-text-base active:scale-95"
                : "cursor-not-allowed text-v2-icon-icon-muted opacity-40"
            }
            ${optimizing() ? "is-optimizing" : ""}
            ${justOptimized() ? "text-emerald-400 font-bold scale-105" : ""}
            ${props.class ?? ""}
          `}
        >
          <Show
            when={!justOptimized()}
            fallback={<span class="text-xs">✓</span>}
          >
            <IconSparkles class="trae-sparkles size-4 transition-transform duration-200" />
          </Show>
        </button>
      </TooltipV2>
    </>
  )
}
