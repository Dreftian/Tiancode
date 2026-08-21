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

/**
 * Motor avanzado de Optimización de Prompt e Ingeniería de Instrucciones.
 * Transforma intenciones en lenguaje natural y borradores informales en directivas
 * técnicas con estructura de arquitectura, requerimientos claros y criterios de calidad.
 */
export function enhancePromptText(rawText: string, isSpanish: boolean): string {
  const text = rawText.trim()
  if (!text) return ""

  // Normalizar ortografía, tildes y terminología técnica
  const normalized = normalizeSpellingAndTerms(text)

  // Si el usuario ya estructuró un prompt completo con encabezados, respetamos su estructura
  if (normalized.includes("###") || normalized.includes("## Objetivo") || normalized.includes("## Directivas")) {
    return normalized
  }

  // Segmentar oraciones y directivas por puntuación y conectores lógicos
  const rawClauses = normalized
    .split(/(?:[.;\n]+\s*|\s*,\s*(?:y\s+(?:por\s+último\s+|también\s+)?|además\s+|también\s+|por\s+último\s+))/i)
    .map((c) => c.trim())
    .filter((c) => c.length > 2)

  if (rawClauses.length === 0) {
    return normalized
  }

  // Identificar requerimientos limpios
  const formattedRequirements = rawClauses.map((clause) => {
    let clean = clause
      .replace(/^(?:necesito\s+que\s+|quiero\s+que\s+|haz\s+que\s+|por\s+favor\s+|podrías\s+|cambia\s+que\s+|revisa\s+que\s+|en\s+|y\s+|de\s+|para\s+|que\s+)/i, "")
      .trim()
    clean = capitalizeFirst(clean)
    if (!clean.endsWith(".")) clean += "."
    return `- ${clean}`
  })

  // Detectar el dominio temático (UI, MCP, Modelos, Voz, Bugfix, etc.)
  const isUI = /diseño|estilo|columna|icono|scroll|parpadeo|interfaz|vista previa|preview|css|layout/i.test(normalized)
  const isMCP = /mcp|servidor|servidores|preset|conectar|herramienta/i.test(normalized)
  const isVoice = /voz|voces|femenina|mascota|hablar|tts|narrar|audio/i.test(normalized)
  const isLocalModels = /modelo|modelos|cpu|gpu|vram|ram|ollama|hardware/i.test(normalized)

  if (isSpanish) {
    const sections: string[] = []

    sections.push("### 🎯 Objetivo Principal")
    sections.push(
      rawClauses.length === 1
        ? `${capitalizeFirst(rawClauses[0])}.`
        : `Implementar las siguientes mejoras y correcciones técnicas de manera robusta y sin regresiones:`,
    )

    if (rawClauses.length > 1) {
      sections.push("\n### 📋 Especificaciones y Requerimientos")
      sections.push(formattedRequirements.join("\n"))
    }

    sections.push("\n### 🏗️ Directivas de Arquitectura y Calidad")
    const directives: string[] = [
      "- Mantener la integridad de los contratos de tipos TypeScript y la arquitectura existente.",
      "- Verificar que no existan errores de compilación (`typecheck`) ni advertencias de consola.",
    ]
    if (isUI) {
      directives.push("- Garantizar transiciones visuales fluidas, sin parpadeos de fondo ni desbordamientos de scroll.")
    }
    if (isMCP) {
      directives.push("- Asegurar que los comandos MCP sean válidos y que los fallidos se gestionen de forma limpia.")
    }
    if (isVoice) {
      directives.push("- Validar que la voz femenina predeterminada se active fluidamente en las narraciones de contexto.")
    }
    if (isLocalModels) {
      directives.push("- Respetar el orden estricto de telemetría de hardware (CPU → GPU → VRAM → RAM → Disco libre).")
    }

    sections.push(directives.join("\n"))

    return sections.join("\n")
  }

  // Versión en inglés
  const sections: string[] = []
  sections.push("### 🎯 Objective")
  sections.push(
    rawClauses.length === 1
      ? `${capitalizeFirst(rawClauses[0])}.`
      : `Implement the following technical enhancements cleanly with zero regressions:`,
  )

  if (rawClauses.length > 1) {
    sections.push("\n### 📋 Requirements & Specifications")
    sections.push(formattedRequirements.join("\n"))
  }

  sections.push("\n### 🏗️ Architectural & Quality Directives")
  sections.push(
    [
      "- Preserve TypeScript type safety and existing architecture conventions.",
      "- Ensure fluid UX with no visual flashing or broken layouts.",
      "- Verify all commands, state management, and edge cases.",
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
