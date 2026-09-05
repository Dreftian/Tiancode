export * as OutputDistiller from "./output-distiller"

const ANSI_REGEX =
  /[\u001B\u009B][[\]()#;?]*(?:(?:(?:[a-zA-Z\d]*(?:;[-a-zA-Z\d\/#&.:=?%@~_]*)*)?\u0007)|(?:(?:\d{1,4}(?:;\d{0,4})*)?[\dA-PR-TZcf-ntqry=><~]))/g

export interface DistillOptions {
  readonly command: string
  readonly output: string
  readonly exitCode?: number
}

export interface DistillResult {
  readonly output: string
  readonly distilled: boolean
  readonly rawBytes: number
  readonly distilledBytes: number
  readonly savedTokens: number
}

export function stripAnsi(text: string): string {
  return text.replace(ANSI_REGEX, "")
}

export function cleanProgressBars(text: string): string {
  const lines = text.split("\n")
  return lines
    .map((line) => {
      if (!line.includes("\r")) return line
      const parts = line.split("\r").filter((part) => part.trim().length > 0)
      return parts.length > 0 ? parts[parts.length - 1]! : ""
    })
    .join("\n")
}

export function deduplicateLines(lines: ReadonlyArray<string>): string[] {
  const result: string[] = []
  let previous = ""
  let count = 0

  const flush = () => {
    if (count === 0) return
    if (count === 1) {
      result.push(previous)
      return
    }
    result.push(`${previous} (×${count})`)
  }

  for (const line of lines) {
    if (line === previous) {
      count++
      continue
    }
    flush()
    previous = line
    count = 1
  }
  flush()
  return result
}

function distillGitStatus(text: string): string {
  const ignoredPatterns = [
    /^\s*\(use "git [^"]+".*\)/,
    /^\s*\(commit or discard the untracked or modified content in submodules\)/,
    /^\s*\(all conflicts fixed: run "git commit"\)/,
    /^\s*no changes added to commit/,
    /^\s*nothing added to commit/,
  ]

  const lines = text.split("\n")
  const filtered = lines.filter((line) => !ignoredPatterns.some((pattern) => pattern.test(line)))
  return filtered.join("\n").replace(/\n{3,}/g, "\n\n").trim()
}

function distillGitDiff(text: string): string {
  const lines = text.split("\n")
  if (lines.length < 35) return text

  const filtered = lines.filter((line) => {
    if (line.startsWith("index ")) return false
    if (line.startsWith("old mode ")) return false
    if (line.startsWith("new mode ")) return false
    return true
  })
  return filtered.join("\n")
}

function distillTestOutput(text: string, exitCode?: number): string | undefined {
  const lines = text.split("\n")
  const isSuccess = exitCode === 0

  if (isSuccess) {
    const summaryLines = lines.filter((line) => {
      const lower = line.toLowerCase()
      return (
        lower.includes("pass") ||
        lower.includes("passed") ||
        lower.includes("test suites:") ||
        lower.includes("tests:") ||
        lower.includes("ran ") ||
        lower.includes("ok")
      )
    })
    if (summaryLines.length > 0) {
      return `✓ Tests passed:\n${summaryLines.join("\n").trim()}`
    }
    return `✓ All tests passed.`
  }

  // Failure focus: isolate failures, assertions, and trim internal stack traces
  const relevantLines: string[] = []
  let capturing = true

  for (const line of lines) {
    if (
      line.includes("node_modules/") ||
      line.includes("node:internal/") ||
      line.includes("bun:test") ||
      line.includes("at processTicksAndRejections")
    ) {
      continue
    }

    if (line.startsWith("(pass)") || line.includes(" ✓ ") || line.includes(" PASS ")) {
      capturing = false
      continue
    }

    if (
      line.startsWith("(fail)") ||
      line.includes(" ✕ ") ||
      line.includes(" FAIL ") ||
      line.includes("Error:") ||
      line.includes("AssertionError") ||
      line.includes("expected")
    ) {
      capturing = true
    }

    if (capturing || line.trim().length === 0) {
      relevantLines.push(line)
    }
  }

  const result = relevantLines.join("\n").replace(/\n{3,}/g, "\n\n").trim()
  return result.length > 0 ? result : undefined
}

function distillTypeScriptOrLinter(text: string): string {
  const lines = text.split("\n")
  if (lines.length < 15) return text

  // Remove empty repetitive lines
  const cleaned = lines.filter((line) => line.trim().length > 0)
  return deduplicateLines(cleaned).join("\n")
}

export function distill(options: DistillOptions): DistillResult {
  const rawBytes = Buffer.byteLength(options.output, "utf-8")
  if (rawBytes === 0) {
    return {
      output: options.output,
      distilled: false,
      rawBytes: 0,
      distilledBytes: 0,
      savedTokens: 0,
    }
  }

  const cleaned = cleanProgressBars(stripAnsi(options.output))
  const cmd = options.command.trim().toLowerCase()
  let distilledText = cleaned

  if (cmd.startsWith("git status")) {
    distilledText = distillGitStatus(cleaned)
  } else if (cmd.startsWith("git diff")) {
    distilledText = distillGitDiff(cleaned)
  } else if (
    cmd.includes("test") ||
    cmd.includes("jest") ||
    cmd.includes("vitest") ||
    cmd.includes("pytest") ||
    cmd.includes("cargo test") ||
    cmd.includes("go test")
  ) {
    const testDistilled = distillTestOutput(cleaned, options.exitCode)
    if (testDistilled) {
      distilledText = testDistilled
    }
  } else if (cmd.includes("tsc") || cmd.includes("eslint") || cmd.includes("biome") || cmd.includes("ruff")) {
    distilledText = distillTypeScriptOrLinter(cleaned)
  } else {
    // Generic deduplication
    const lines = cleaned.split("\n")
    if (lines.length > 20) {
      distilledText = deduplicateLines(lines).join("\n")
    }
  }

  // Fail-safe: if exit code indicates failure but distillation emptied the output, restore cleaned
  if (options.exitCode !== undefined && options.exitCode !== 0 && distilledText.trim().length === 0) {
    distilledText = cleaned
  }

  const distilledBytes = Buffer.byteLength(distilledText, "utf-8")
  const savedBytes = Math.max(0, rawBytes - distilledBytes)
  const savedTokens = Math.round(savedBytes / 4)

  return {
    output: distilledText,
    distilled: distilledBytes < rawBytes,
    rawBytes,
    distilledBytes,
    savedTokens,
  }
}
