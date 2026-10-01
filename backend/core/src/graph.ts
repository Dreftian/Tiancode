export * as CodeGraph from "./graph"

import { makeLocationNode } from "./effect/app-node"
import { Clock, Context, Effect, Layer } from "effect"
import { Location } from "./location"
import { FSUtil } from "./fs-util"
import { Ripgrep } from "./ripgrep"
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

export interface Interface {
  readonly analyzeFile: (filePath: string) => Effect.Effect<FileNode>
  readonly findSymbol: (name: string) => Effect.Effect<SymbolLocation[]>
  readonly findDependents: (filePath: string) => Effect.Effect<string[]>
  readonly findDependencies: (filePath: string) => Effect.Effect<string[]>
  readonly formatContext: (filePath: string) => Effect.Effect<string | undefined>
  /** Files in the project index, built on first use (honours .gitignore). */
  readonly indexed: () => Effect.Effect<number>
}

export class Service extends Context.Service<Service, Interface>()("@tiancode/CodeGraph") {}

const SOURCE_GLOB = "**/*.{ts,tsx,mts,cts,js,jsx,mjs,cjs}"
const RESOLVE_EXTENSIONS = [".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs"]
// Bounds keep a monorepo or a vendored folder from turning one query into a long scan.
const MAX_FILES = 6000
const MAX_FILE_CHARS = 400_000
// The index is rebuilt when a query arrives after this long, so edits the agent just made show up.
const INDEX_TTL_MS = 20_000
const MAX_SYMBOL_HITS = 60

const EXPORT_FN_REGEX = /export\s+(?:default\s+)?(?:async\s+)?function\*?\s+([a-zA-Z0-9_$]+)/g
const EXPORT_CONST_REGEX = /export\s+(?:const|let|var)\s+([a-zA-Z0-9_$]+)/g
const EXPORT_CLASS_REGEX = /export\s+(?:default\s+)?(?:abstract\s+)?class\s+([a-zA-Z0-9_$]+)/g
const EXPORT_TYPE_REGEX = /export\s+(?:declare\s+)?(?:type|interface|enum)\s+([a-zA-Z0-9_$]+)/g
const IMPORT_REGEX =
  /(?:import|export)\s+(?:type\s+)?(?:[\w$*{}\s,]+?\s+from\s+)?['"]([^'"]+)['"]|(?:import|require)\(\s*['"]([^'"]+)['"]\s*\)/g

function parseSymbolsAndImports(content: string, filePath: string): FileNode {
  const exports: SymbolLocation[] = []
  const imports = new Set<string>()
  const lines = content.split("\n")
  const collect = (regex: RegExp, line: string, index: number, kind: SymbolLocation["kind"]) => {
    for (const match of line.matchAll(regex)) exports.push({ name: match[1], kind, filePath, line: index + 1 })
  }
  lines.forEach((line, index) => {
    collect(EXPORT_FN_REGEX, line, index, "function")
    collect(EXPORT_CONST_REGEX, line, index, "const")
    collect(EXPORT_CLASS_REGEX, line, index, "class")
    collect(EXPORT_TYPE_REGEX, line, index, "type")
  })
  // Imports are matched on the whole text: a named import often spans several lines.
  for (const match of content.matchAll(IMPORT_REGEX)) {
    const target = match[1] ?? match[2]
    if (target) imports.add(target)
  }
  return { filePath, imports: [...imports], exports }
}

const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const location = yield* Location.Service
    const fsys = yield* FSUtil.Service
    const ripgrep = yield* Ripgrep.Service
    const root = location.directory
    const absolute = (file: string) => path.normalize(path.isAbsolute(file) ? file : path.join(root, file))
    const display = (file: string) => path.relative(root, file).replaceAll("\\", "/") || file
    const state = {
      builtAt: 0,
      files: new Map<string, FileNode>(),
      // Relative imports resolved to indexed absolute paths, per importing file.
      edges: new Map<string, string[]>(),
    }

    const read = Effect.fnUntraced(function* (file: string) {
      const content = yield* fsys.readFileStringSafe(file).pipe(Effect.orElseSucceed(() => undefined))
      if (!content || content.length > MAX_FILE_CHARS) return { filePath: file, imports: [], exports: [] } as FileNode
      return parseSymbolsAndImports(content, file)
    })

    const resolveImport = (from: string, specifier: string, known: Map<string, FileNode>) => {
      if (!specifier.startsWith(".")) return undefined
      const base = path.normalize(path.join(path.dirname(from), specifier))
      // TypeScript lets `./x.js` name `./x.ts`, so the written extension is tried last.
      const stem = base.replace(/\.(?:[mc]?js|jsx)$/u, "")
      const candidates = [
        base,
        ...RESOLVE_EXTENSIONS.map((ext) => stem + ext),
        ...RESOLVE_EXTENSIONS.map((ext) => path.join(base, "index" + ext)),
      ]
      return candidates.find((candidate) => known.has(candidate))
    }

    const index = Effect.fnUntraced(function* () {
      const now = yield* Clock.currentTimeMillis
      if (now - state.builtAt < INDEX_TTL_MS && state.files.size > 0) return state
      const entries = yield* ripgrep
        .glob({ cwd: root, pattern: SOURCE_GLOB, limit: MAX_FILES })
        .pipe(Effect.orElseSucceed(() => []))
      const nodes = yield* Effect.forEach(entries, (entry) => read(absolute(entry.path)), { concurrency: 16 })
      const files = new Map(nodes.map((node) => [node.filePath, node]))
      state.files = files
      state.edges = new Map(
        nodes.map((node) => [
          node.filePath,
          node.imports.flatMap((spec) => {
            const resolved = resolveImport(node.filePath, spec, files)
            return resolved ? [resolved] : []
          }),
        ]),
      )
      state.builtAt = now
      return state
    })

    const analyzeFile = Effect.fn("CodeGraph.analyzeFile")(function* (filePath: string) {
      const file = absolute(filePath)
      const node = yield* read(file)
      return { ...node, filePath: display(file), exports: node.exports.map((e) => ({ ...e, filePath: display(file) })) }
    })

    const findSymbol = Effect.fn("CodeGraph.findSymbol")(function* (name: string) {
      const graph = yield* index()
      const needle = name.toLowerCase()
      const all = [...graph.files.values()].flatMap((node) => node.exports)
      const exact = all.filter((symbol) => symbol.name === name)
      const partial = all.filter((symbol) => symbol.name !== name && symbol.name.toLowerCase().includes(needle))
      return [...exact, ...partial]
        .slice(0, MAX_SYMBOL_HITS)
        .map((symbol) => ({ ...symbol, filePath: display(symbol.filePath) }))
    })

    const findDependencies = Effect.fn("CodeGraph.findDependencies")(function* (filePath: string) {
      const graph = yield* index()
      const file = absolute(filePath)
      const node = graph.files.get(file) ?? (yield* read(file))
      const local = graph.edges.get(file) ?? []
      const packages = node.imports.filter((spec) => !spec.startsWith("."))
      return [...local.map(display), ...packages]
    })

    const findDependents = Effect.fn("CodeGraph.findDependents")(function* (filePath: string) {
      const graph = yield* index()
      const file = absolute(filePath)
      return [...graph.edges.entries()].filter(([, targets]) => targets.includes(file)).map(([from]) => display(from))
    })

    const formatContext = Effect.fn("CodeGraph.formatContext")(function* (filePath: string) {
      const node = yield* analyzeFile(filePath)
      if (node.exports.length === 0 && node.imports.length === 0) return undefined
      return [
        `<code_graph file="${node.filePath}">`,
        ...(node.exports.length > 0
          ? [
              "  <exports>",
              ...node.exports.map((exp) => `    <symbol kind="${exp.kind}" line="${exp.line}">${exp.name}</symbol>`),
              "  </exports>",
            ]
          : []),
        ...(node.imports.length > 0
          ? ["  <imports>", ...node.imports.map((imp) => `    <import from="${imp}"/>`), "  </imports>"]
          : []),
        "</code_graph>",
      ].join("\n")
    })

    const indexed = Effect.fn("CodeGraph.indexed")(function* () {
      return (yield* index()).files.size
    })

    return Service.of({ analyzeFile, findSymbol, findDependents, findDependencies, formatContext, indexed })
  }),
)

export const node = makeLocationNode({
  service: Service,
  layer: layer,
  deps: [Location.node, FSUtil.node, Ripgrep.node],
})
