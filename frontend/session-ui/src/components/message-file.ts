import { getFilename } from "@tiancode-ai/core/util/path"
import type { FilePart } from "@tiancode-ai/sdk/v2"

export function attached(part: FilePart) {
  return part.url.startsWith("data:") && !inline(part)
}

export function inline(part: FilePart) {
  return part.source?.text?.start !== undefined && part.source?.text?.end !== undefined
}

export function kind(part: FilePart) {
  return part.mime.startsWith("image/") ? "image" : "file"
}

// Mapa estático extensión → nombre de lenguaje. Antes se construía desde
// `shiki.bundledLanguagesInfo`, lo que arrastraba el índice de shiki y ~119
// grammars al bundle del hilo principal (~2.4MB). Solo hace falta la etiqueta.
const LANGUAGE_NAMES = new Map<string, string>([
  ["js", "JavaScript"], ["jsx", "JSX"], ["mjs", "JavaScript"], ["cjs", "JavaScript"],
  ["ts", "TypeScript"], ["tsx", "TSX"], ["mts", "TypeScript"], ["cts", "TypeScript"],
  ["py", "Python"], ["pyw", "Python"], ["rb", "Ruby"], ["rs", "Rust"],
  ["go", "Go"], ["java", "Java"], ["kt", "Kotlin"], ["kts", "Kotlin"],
  ["c", "C"], ["h", "C"], ["cpp", "C++"], ["cc", "C++"], ["cxx", "C++"], ["hpp", "C++"],
  ["cs", "C#"], ["fs", "F#"], ["swift", "Swift"], ["scala", "Scala"], ["zig", "Zig"],
  ["php", "PHP"], ["pl", "Perl"], ["pm", "Perl"], ["lua", "Lua"], ["r", "R"],
  ["dart", "Dart"], ["ex", "Elixir"], ["exs", "Elixir"], ["erl", "Erlang"], ["hrl", "Erlang"],
  ["clj", "Clojure"], ["cljs", "ClojureScript"], ["hs", "Haskell"], ["ml", "OCaml"],
  ["nim", "Nim"], ["v", "V"], ["sol", "Solidity"], ["gd", "GDScript"],
  ["html", "HTML"], ["htm", "HTML"], ["css", "CSS"], ["scss", "SCSS"], ["sass", "Sass"],
  ["less", "Less"], ["styl", "Stylus"], ["vue", "Vue"], ["svelte", "Svelte"], ["astro", "Astro"],
  ["json", "JSON"], ["jsonc", "JSONC"], ["json5", "JSON5"], ["yaml", "YAML"], ["yml", "YAML"],
  ["toml", "TOML"], ["xml", "XML"], ["svg", "SVG"], ["graphql", "GraphQL"], ["gql", "GraphQL"],
  ["proto", "Protocol Buffers"], ["prisma", "Prisma"], ["sql", "SQL"], ["pgsql", "PostgreSQL"],
  ["md", "Markdown"], ["mdx", "MDX"], ["rst", "reStructuredText"], ["txt", "Text"],
  ["sh", "Shell"], ["bash", "Shell"], ["zsh", "Shell"], ["fish", "Fish"], ["ps1", "PowerShell"],
  ["bat", "Batch"], ["cmd", "Batch"], ["dockerfile", "Dockerfile"], ["Dockerfile", "Dockerfile"],
  ["makefile", "Makefile"], ["mk", "Makefile"], ["cmake", "CMake"], ["ninja", "Ninja"],
  ["tf", "Terraform"], ["tfvars", "Terraform"], ["hcl", "HCL"], ["nix", "Nix"],
  ["ini", "INI"], ["cfg", "INI"], ["conf", "Conf"], ["env", "Env"], ["properties", "Properties"],
  ["editorconfig", "EditorConfig"], ["gitignore", "Gitignore"], ["gitattributes", "Gitattributes"],
  ["lock", "Lockfile"], ["diff", "Diff"], ["patch", "Diff"],
  ["log", "Log"], ["csv", "CSV"], ["tsv", "TSV"],
  ["wasm", "WebAssembly"], ["asm", "Assembly"], ["s", "Assembly"],
])

// attachments carry text/plain for all text files, so the label comes from the extension;
// filename may be an absolute path, so extract the basename before looking for one
export function typeLabel(filename: string, mime: string, fallback: string) {
  if (mime === "application/pdf") return "PDF"
  const base = getFilename(filename)
  // idx 0 is a dotfile like .gitignore, not an extension
  const idx = base.lastIndexOf(".")
  const suffix = idx <= 0 ? "" : base.slice(idx + 1).toLowerCase()
  if (!suffix) return fallback
  return LANGUAGE_NAMES.get(suffix) ?? suffix.toUpperCase()
}
