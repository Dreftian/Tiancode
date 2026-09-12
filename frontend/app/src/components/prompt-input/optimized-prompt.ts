import type { PromptInputV2Attachment, PromptInputV2Prompt } from "@tiancode-ai/session-ui/v2/prompt-input/types"

/**
 * Construye el prompt que reemplaza al actual cuando el optimizador devuelve texto.
 *
 * Las imágenes se conservan porque el modelo nunca las ve: reescribe el texto y las
 * adjuntas se perderían en el reemplazo. Las menciones (`file` y `agent`) sí se
 * descartan: su contenido ya viajó al optimizador dentro del texto y volvería
 * duplicado junto a la reescritura.
 */
export function promptWithOptimizedText(parts: PromptInputV2Prompt, text: string): PromptInputV2Prompt {
  const images = parts.filter((part): part is PromptInputV2Attachment => part.type === "image")
  return [{ type: "text", content: text, start: 0, end: text.length }, ...images]
}
