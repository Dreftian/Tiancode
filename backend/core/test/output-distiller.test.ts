import { describe, expect, test } from "bun:test"
import { OutputDistiller } from "@tiancode-ai/core/tool/output-distiller"

describe("OutputDistiller", () => {
  test("strips ANSI color and styling codes", () => {
    const raw = "\u001b[31m\u001b[1mError:\u001b[22m\u001b[39m file not found"
    expect(OutputDistiller.stripAnsi(raw)).toBe("Error: file not found")
  })

  test("cleans interactive carriage-return progress bars", () => {
    const raw = "Downloading...\r[===>    ] 30%\r[======> ] 70%\r[========] 100%\nComplete."
    const cleaned = OutputDistiller.cleanProgressBars(raw)
    expect(cleaned).toContain("[========] 100%")
    expect(cleaned).toContain("Complete.")
    expect(cleaned).not.toContain("[===>    ] 30%")
  })

  test("deduplicates repetitive consecutive lines", () => {
    const lines = [
      "Starting worker",
      "WARN: deprecated API call",
      "WARN: deprecated API call",
      "WARN: deprecated API call",
      "Finished worker",
    ]
    const deduped = OutputDistiller.deduplicateLines(lines)
    expect(deduped).toEqual([
      "Starting worker",
      "WARN: deprecated API call (×3)",
      "Finished worker",
    ])
  })

  test("distills verbose git status into concise summary", () => {
    const raw = `On branch dev
Your branch is up to date with 'origin/dev'.

Changes not staged for commit:
  (use "git add <file>..." to update what will be committed)
  (use "git restore <file>..." to discard changes in working directory)
	modified:   src/app.ts
	modified:   src/utils.ts

Untracked files:
  (use "git add <file>..." to include in what will be committed)
	temp.log

no changes added to commit (use "git add" to track)`

    const result = OutputDistiller.distill({
      command: "git status",
      output: raw,
      exitCode: 0,
    })

    expect(result.distilled).toBe(true)
    expect(result.savedTokens).toBeGreaterThan(0)
    expect(result.output).toContain("On branch dev")
    expect(result.output).toContain("modified:   src/app.ts")
    expect(result.output).toContain("temp.log")
    expect(result.output).not.toContain('(use "git add <file>..." to update what will be committed)')
    expect(result.output).not.toContain('no changes added to commit (use "git add" to track)')
  })

  test("collapses passing test runner output to summary line", () => {
    const passingTests = Array.from({ length: 50 }, (_, i) => `✓ test/feature_${i}.test.ts (12ms)`).join("\n")
    const raw = `${passingTests}\n\nTest Suites: 50 passed, 50 total\nTests: 250 passed, 250 total\nTime: 2.34s`

    const result = OutputDistiller.distill({
      command: "npm test",
      output: raw,
      exitCode: 0,
    })

    expect(result.distilled).toBe(true)
    expect(result.savedTokens).toBeGreaterThan(50)
    expect(result.output).toContain("✓ Tests passed:")
    expect(result.output).toContain("50 passed")
    expect(result.output).not.toContain("test/feature_0.test.ts")
  })

  test("isolates failures and filters node_modules on test runner failure", () => {
    const raw = `✓ test/auth.test.ts > login (10ms)
✓ test/auth.test.ts > logout (5ms)
(fail) test/order.test.ts > create order
  AssertionError: expected 201 to be 400
    at /project/node_modules/vitest/dist/runner.js:120:15
    at /project/node_modules/@vitest/runner/dist/index.js:45:9
    at processTicksAndRejections (node:internal/process/task_queues:95:5)
    at test/order.test.ts:34:10
Test Suites: 1 failed, 1 passed, 2 total`

    const result = OutputDistiller.distill({
      command: "vitest run",
      output: raw,
      exitCode: 1,
    })

    expect(result.distilled).toBe(true)
    expect(result.output).toContain("AssertionError: expected 201 to be 400")
    expect(result.output).toContain("test/order.test.ts:34:10")
    expect(result.output).not.toContain("node_modules/vitest")
    expect(result.output).not.toContain("processTicksAndRejections")
  })

  test("maintains fail-safe: never empties non-zero exit outputs for unknown commands", () => {
    const unknownError = "fatal: something completely custom and strange happened in internal C binary"
    const result = OutputDistiller.distill({
      command: "./custom-binary --run",
      output: unknownError,
      exitCode: 2,
    })

    expect(result.output).toBe(unknownError)
    expect(result.output.length).toBeGreaterThan(0)
  })
})
