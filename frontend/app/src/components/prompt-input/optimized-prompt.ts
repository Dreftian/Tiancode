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

export function promptWithDictation(parts: PromptInputV2Prompt, transcript: string): PromptInputV2Prompt {
  const length = parts.reduce((total, part) => total + ("content" in part ? part.content.length : 0), 0)
  const previous = parts.filter((part) => "content" in part).at(-1)
  const content = previous && "content" in previous && !/\s$/.test(previous.content) ? ` ${transcript}` : transcript
  return [...parts, { type: "text", content, start: length, end: length + content.length }]
}

// "Add folder" from the + menu: a directory mention the backend expands into a listing, so the
// agent can work across that folder as well as the project.
export function promptWithFolder(parts: PromptInputV2Prompt, path: string): PromptInputV2Prompt {
  const name = path.replace(/[\\/]+$/, "").split(/[\\/]/).pop() || path
  const length = parts.reduce((total, part) => total + ("content" in part ? part.content.length : 0), 0)
  const previous = parts.filter((part) => "content" in part).at(-1)
  const gap = previous && "content" in previous && !/\s$/.test(previous.content) ? " " : ""
  const content = `@${name}`
  const start = length + gap.length
  return [
    ...parts,
    ...(gap ? [{ type: "text" as const, content: gap, start: length, end: start }] : []),
    { type: "file" as const, path, content, start, end: start + content.length, mime: "application/x-directory", filename: name },
    { type: "text" as const, content: " ", start: start + content.length, end: start + content.length + 1 },
  ]
}
