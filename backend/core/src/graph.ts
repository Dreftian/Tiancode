export * as CodeGraph from "./graph"

import { makeLocationNode } from "./effect/app-node"
import { Context, Effect, Layer } from "effect"
import { Location } from "./location"
import { FSUtil } from "./fs-util"
import path from "path"

export interface SymbolLocation {
  name: string
  kind: "function" | "class" | "interface" | "type" | "const" | "export"
  filePath: string
  line: number
}

export interface FileNode {
  filePath: string
  imports: string[]
  exports: SymbolLocation[]
}

export interface CodeGraphData {
  files: Map<string, FileNode>
  symbolIndex: Map<string, SymbolLocation[]>
}

export interface Interface {
  readonly analyzeFile: (filePath: string) => Effect.Effect<FileNode>
  readonly findSymbol: (name: string) => Effect.Effect<SymbolLocation[]>
  readonly findDependents: (filePath: string) => Effect.Effect<string[]>
  readonly findDependencies: (filePath: string) => Effect.Effect<string[]>
  readonly formatContext: (filePath: string) => Effect.Effect<string | undefined>
}

export class Service extends Context.Service<Service, Interface>()("@tiancode/CodeGraph") {}

const EXPORT_FN_REGEX = /export\s+(?:async\s+)?function\s+([a-zA-Z0-9_$]+)/g
const EXPORT_CONST_REGEX = /export\s+const\s+([a-zA-Z0-9_$]+)/g
const EXPORT_CLASS_REGEX = /export\s+class\s+([a-zA-Z0-9_$]+)/g
const EXPORT_TYPE_REGEX = /export\s+(?:type|interface)\s+([a-zA-Z0-9_$]+)/g
const IMPORT_REGEX = /import\s+(?:type\s+)?(?:{[^}]*}|[a-zA-Z0-9_$*,\s]+)\s+from\s+['"]([^'"]+)['"]/g

function parseSymbolsAndImports(content: string, filePath: string): FileNode {
  const exports: SymbolLocation[] = []
  const imports: string[] = []
  const lines = content.split("\n")

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    let match: RegExpExecArray | null

    // Parse exports
    while ((match = EXPORT_FN_REGEX.exec(line)) !== null) {
      exports.push({ name: match[1], kind: "function", filePath, line: i + 1 })
    }
    while ((match = EXPORT_CONST_REGEX.exec(line)) !== null) {
      exports.push({ name: match[1], kind: "const", filePath, line: i + 1 })
    }
    while ((match = EXPORT_CLASS_REGEX.exec(line)) !== null) {
      exports.push({ name: match[1], kind: "class", filePath, line: i + 1 })
    }
    while ((match = EXPORT_TYPE_REGEX.exec(line)) !== null) {
      exports.push({ name: match[1], kind: "type", filePath, line: i + 1 })
    }

    // Parse imports
    while ((match = IMPORT_REGEX.exec(line)) !== null) {
      imports.push(match[1])
    }
  }

  return { filePath, imports, exports }
}

const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const location = yield* Location.Service
    const fsys = yield* FSUtil.Service
    const cache = new Map<string, FileNode>()

    const analyzeFile = Effect.fn("CodeGraph.analyzeFile")(function* (filePath: string) {
      const cached = cache.get(filePath)
      if (cached) return cached

      const content = yield* fsys.readFileStringSafe(filePath).pipe(Effect.orDie)
      if (!content) {
        const empty: FileNode = { filePath, imports: [], exports: [] }
        return empty
      }

      const parsed = parseSymbolsAndImports(content, filePath)
      cache.set(filePath, parsed)
      return parsed
    })

    const findSymbol = Effect.fn("CodeGraph.findSymbol")(function* (name: string) {
      const results: SymbolLocation[] = []
      for (const node of cache.values()) {
        for (const sym of node.exports) {
          if (sym.name.toLowerCase().includes(name.toLowerCase())) {
            results.push(sym)
          }
        }
      }
      return results
    })

    const findDependencies = Effect.fn("CodeGraph.findDependencies")(function* (filePath: string) {
      const node = yield* analyzeFile(filePath)
      return node.imports
    })

    const findDependents = Effect.fn("CodeGraph.findDependents")(function* (filePath: string) {
      const dependents: string[] = []
      const baseName = path.basename(filePath, path.extname(filePath))

      for (const [fPath, node] of cache.entries()) {
        if (fPath === filePath) continue
        const hasImport = node.imports.some(
          (imp) => imp.includes(baseName) || imp.endsWith(path.relative(path.dirname(fPath), filePath)),
        )
        if (hasImport) dependents.push(fPath)
      }

      return dependents
    })

    const formatContext = Effect.fn("CodeGraph.formatContext")(function* (filePath: string) {
      const node = yield* analyzeFile(filePath)
      if (node.exports.length === 0 && node.imports.length === 0) return undefined

      const lines: string[] = [`<code_graph file="${filePath}">`]
      if (node.exports.length > 0) {
        lines.push("  <exports>")
        for (const exp of node.exports) {
          lines.push(`    <symbol kind="${exp.kind}" line="${exp.line}">${exp.name}</symbol>`)
        }
        lines.push("  </exports>")
      }
      if (node.imports.length > 0) {
        lines.push("  <imports>")
        for (const imp of node.imports) {
          lines.push(`    <import from="${imp}"/>`)
        }
        lines.push("  </imports>")
      }
      lines.push("</code_graph>")
      return lines.join("\n")
    })

    return Service.of({
      analyzeFile,
      findSymbol,
      findDependents,
      findDependencies,
      formatContext,
    })
  }),
)

export const node = makeLocationNode({
  service: Service,
  layer: layer,
  deps: [Location.node, FSUtil.node],
})
