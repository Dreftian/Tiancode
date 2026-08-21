// Parser de errores de compilación del dev server (Vite/Rollup/esbuild/tsc):
// convierte líneas de stderr en errores estructurados para que el agente los
// lea y corrija (ciclo WRITE → BUILD → ERROR → FIX).

import type { PreviewError } from "./types"

// "C:\proyecto\src\App.jsx:12:5: SyntaxError: ..." (vite/rollup/esbuild)
const FILE_LINE_RE = /^(?:.*?\s)?([A-Za-z]:[\\/][^:]+|[\\/][^:]+):(\d+)(?::(\d+))?:\s*(.+)$/

// "SyntaxError: ..." / "TypeError: ..." / "error: ..."
const BARE_ERROR_RE = /^(SyntaxError|TypeError|ReferenceError|RangeError|Error|error):\s*(.+)$/i

// "error TS2304: Cannot find name ..." (tsc)
const TSC_RE = /^error\s+(TS\d+):\s*(.+)$/

// "ERROR in ./src/App.jsx:12:5" (webpack)
const WEBPACK_RE = /^ERROR in\s+(.+?)(?::(\d+)(?::(\d+))?)?\s*$/

export function parseBuildError(line: string): PreviewError | null {
  const trimmed = line.trim()
  if (!trimmed) return null

  const tsc = TSC_RE.exec(trimmed)
  if (tsc) return { file: null, line: null, message: `${tsc[1]}: ${tsc[2]}` }

  const located = FILE_LINE_RE.exec(trimmed)
  if (located) {
    return { file: located[1], line: Number(located[2]), message: located[4] }
  }

  const webpack = WEBPACK_RE.exec(trimmed)
  if (webpack) {
    return { file: webpack[1], line: webpack[2] ? Number(webpack[2]) : null, message: trimmed }
  }

  const bare = BARE_ERROR_RE.exec(trimmed)
  if (bare) return { file: null, line: null, message: `${bare[1]}: ${bare[2]}` }

  // Línea de continuación (indentada tras un error con archivo): se ignora
  // aquí; el manager acumula el bloque hasta el siguiente error.
  if (/^[>│]\s/.test(trimmed) || trimmed.startsWith("at ")) return null

  return null
}
