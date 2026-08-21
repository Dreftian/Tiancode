/**
 * Limpiador y normalizador de texto Markdown para síntesis de voz (TTS).
 * Transforma respuestas estructuradas (títulos, listas con viñetas, tablas,
 * código, negritas, enlaces) en texto conversacional fluido para que la
 * voz femenina (estilo "Sol" de ChatGPT / ef_dora) lo hable sin leer caracteres
 * sintácticos ni trabarse.
 */

export function cleanMarkdownForSpeech(text: string): string {
  if (!text) return ""

  let speech = text

  // 1. Eliminar bloques de código cercados (```lang ... ```)
  speech = speech.replace(/```[\s\S]*?```/g, "")

  // 2. Eliminar código inline (`código`)
  speech = speech.replace(/`([^`]+)`/g, "$1")

  // 3. Eliminar imágenes (![alt](url))
  speech = speech.replace(/!\[([^\]]*)\]\([^)]+\)/g, "")

  // 4. Transformar enlaces Markdown ([texto](url)) en solo el texto visible
  speech = speech.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")

  // 5. Eliminar líneas divisorias (---, ***, ___)
  speech = speech.replace(/^(\s*[-*_]\s*){3,}$/gm, "")

  // 6. Eliminar encabezados Markdown (# Encabezado -> Encabezado.)
  speech = speech.replace(/^\s*#{1,6}\s+(.+)$/gm, "$1. ")

  // 7. Eliminar blockquotes (> cita -> cita)
  speech = speech.replace(/^\s*>\s*/gm, "")

  // 8. Transformar viñetas de listas (*, -, +) en frases fluidas con pausa
  speech = speech.replace(/^\s*[-*+]\s+(.+)$/gm, "$1. ")

  // 9. Transformar listas numeradas (1. elemento -> elemento.)
  speech = speech.replace(/^\s*\d+\.\s+(.+)$/gm, "$1. ")

  // 10. Eliminar negritas, cursivas y tachados (**bold**, *italic*, ~~strikethrough~~)
  speech = speech.replace(/\*\*([^*]+)\*\*/g, "$1")
  speech = speech.replace(/__([^_]+)__/g, "$1")
  speech = speech.replace(/\*([^*]+)\*/g, "$1")
  speech = speech.replace(/_([^_]+)_/g, "$1")
  speech = speech.replace(/~~([^~]+)~~/g, "$1")

  // 11. Limpiar sintaxis de tablas Markdown (| col | col |)
  speech = speech.replace(/^\s*\|(.+)\|\s*$/gm, (_, content: string) => {
    // Si es una línea de separación |---|---|, la omitimos
    if (/^[\s:-|-]+$/.test(content)) return ""
    return content.split("|").map((cell) => cell.trim()).filter(Boolean).join(", ") + ". "
  })

  // 12. Limpiar emojis excesivos o repetitivos para mantener fluidez oral
  speech = speech.replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, "")

  // 13. Normalizar puntuación y espaciado
  speech = speech
    .replace(/\s+/g, " ")
    .replace(/\s+([.,!?;:])/g, "$1")
    .replace(/([.,!?;:])\1+/g, "$1")
    .replace(/\.\s*\./g, ".")
    .trim()

  return speech
}
