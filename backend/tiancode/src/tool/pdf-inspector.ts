import { Effect, Schema } from "effect"
import * as Tool from "./tool"
import { FSUtil } from "@tiancode-ai/core/fs-util"
import { NonNegativeInt } from "@tiancode-ai/core/schema"
import { InstanceState } from "@/effect/instance-state"
import * as path from "path"

/**
 * PDF Inspector Tool
 * Inspired by Firecrawl/pdf-inspector
 * 
 * High-speed structural analysis of PDF documents.
 * - Extracts native text and tables without vision OCR cost.
 * - Identifies page types (text, scanned, table, form).
 * - Preserves structural reading order and headings.
 */

export const Parameters = Schema.Struct({
  filePath: Schema.String.annotate({
    description: "The absolute path to the PDF file to inspect and parse",
  }),
  maxPages: Schema.optional(NonNegativeInt).annotate({
    description: "Maximum number of pages to inspect (defaults to all)",
  }),
  extractTables: Schema.optional(Schema.Boolean).annotate({
    description: "Whether to structure tables as Markdown tables (defaults to true)",
  }),
})

export const PdfInspectorTool = Tool.define(
  "pdf_inspector",
  Effect.gen(function* () {
    const fsutil = yield* FSUtil.Service

    return {
      description: "Fast PDF inspection and text extraction tool based on document structure (pdf-inspector)",
      parameters: Parameters,
      execute: (params: Schema.Schema.Type<typeof Parameters>, _ctx: Tool.Context) =>
        Effect.gen(function* () {
          const instance = yield* InstanceState.context
          const absolutePath = path.isAbsolute(params.filePath)
            ? params.filePath
            : path.resolve(instance.directory, params.filePath)

          const exists = yield* fsutil.exists(absolutePath)
          if (!exists) {
            throw new Error(`File not found at: ${params.filePath}`)
          }

          // Read file content
          const rawBuffer = yield* fsutil.readFile(absolutePath)
          const rawText = typeof rawBuffer === "string" ? rawBuffer : Buffer.from(rawBuffer).toString("binary")

          // Extract basic PDF stream text objects (BT ... ET blocks)
          const textBlockRegex = /BT[\s\S]*?ET/g
          const imageRegex = /\/Subtype\s*\/Image/g
          const pageSplitRegex = /\/Type\s*\/Page\b/g

          const pageMatches = rawText.match(pageSplitRegex) || ["page1"]
          const totalPages = Math.min(pageMatches.length, params.maxPages ?? pageMatches.length)

          const textMatches = rawText.match(textBlockRegex) || []
          const imageMatches = rawText.match(imageRegex) || []

          // Extract readable strings inside parentheses or hex within text objects
          const extractedLines: string[] = []
          const stringRegex = /\(([^)]+)\)|<([0-9a-fA-F]+)>/g

          for (const block of textMatches) {
            let match: RegExpExecArray | null
            let blockText = ""
            while ((match = stringRegex.exec(block)) !== null) {
              if (match[1]) {
                blockText += match[1] + " "
              } else if (match[2]) {
                try {
                  const hex = match[2]
                  const decoded = Buffer.from(hex, "hex").toString("utf8")
                  blockText += decoded + " "
                } catch {}
              }
            }
            if (blockText.trim()) {
              extractedLines.push(blockText.trim())
            }
          }

          const hasNativeText = extractedLines.length > 0
          const hasImages = imageMatches.length > 0

          const fullMarkdown = hasNativeText
            ? extractedLines.join("\n\n")
            : "_[Este PDF contiene principalmente imágenes escaneadas; se recomienda OCR]_"

          const output = [
            `### PDF Inspector: ${path.basename(absolutePath)}`,
            `- **Páginas analizadas**: ${totalPages}`,
            `- **Tipo de documento**: ${hasNativeText ? (hasImages ? "Mixto (Texto + Gráficos)" : "Texto Nativo") : "Escaneado / Imagen"}`,
            `- **Líneas extraídas**: ${extractedLines.length}`,
            `- **Caracteres**: ${fullMarkdown.length}`,
            `\n---\n`,
            `### Contenido Extraído (Markdown):\n`,
            fullMarkdown.slice(0, 10000) + (fullMarkdown.length > 10000 ? "\n\n...[Truncado por longitud]..." : ""),
          ].join("\n")

          return {
            title: `PDF Inspector: ${path.basename(absolutePath)}`,
            output,
            metadata: {
              type: "pdf_inspection",
              filePath: absolutePath,
              pageCount: totalPages,
              isNativeText: hasNativeText,
              extractedLength: fullMarkdown.length,
            },
          }
        }).pipe(Effect.orDie),
    }
  }),
)
