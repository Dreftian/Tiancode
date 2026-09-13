import { describe, expect, test } from "bun:test"
import {
  REDACTED,
  buildErrorLocation,
  failedBuildErrors,
  previewFailureCopy,
  previewStatusLabel,
  previewStatusTone,
  reactToBuild,
  redactPreviewLogLine,
  shortenBuildTrigger,
  type PreviewBuildInfo,
} from "./live-preview-build"

const build = (over: Partial<PreviewBuildInfo> = {}): PreviewBuildInfo => ({
  running: false,
  startedAt: null,
  durationMs: null,
  ok: null,
  trigger: null,
  sequence: 0,
  ...over,
})

describe("reactToBuild", () => {
  test("does nothing when the server reports no build info", () => {
    expect(reactToBuild({ build: undefined, lastSequence: 3 })).toEqual({ sequence: 3, reload: false })
  })

  test("does nothing while the sequence is unchanged", () => {
    const info = build({ sequence: 3, ok: true })
    expect(reactToBuild({ build: info, lastSequence: 3 })).toEqual({ sequence: 3, reload: false })
  })

  test("waits while a newly started build is still running", () => {
    const info = build({ sequence: 4, running: true })
    // The sequence is deliberately NOT advanced: otherwise the completion poll would look
    // unchanged and the reload would be skipped entirely.
    expect(reactToBuild({ build: info, lastSequence: 3 })).toEqual({ sequence: 3, reload: false })
  })

  test("reloads once a new build finishes successfully", () => {
    const info = build({ sequence: 4, ok: true, durationMs: 820 })
    expect(reactToBuild({ build: info, lastSequence: 3 })).toEqual({ sequence: 4, reload: true })
  })

  test("advances without reloading when the build failed", () => {
    const info = build({ sequence: 4, ok: false })
    expect(reactToBuild({ build: info, lastSequence: 3 })).toEqual({ sequence: 4, reload: false })
  })

  test("catches a build that started and finished between two polls", () => {
    // Never observed as running, yet the sequence jumped: still reloads.
    const info = build({ sequence: 7, ok: true })
    expect(reactToBuild({ build: info, lastSequence: 3 })).toEqual({ sequence: 7, reload: true })
  })

  test("does not reload twice for the same build", () => {
    const info = build({ sequence: 4, ok: true })
    const first = reactToBuild({ build: info, lastSequence: 3 })
    expect(first.reload).toBe(true)
    expect(reactToBuild({ build: info, lastSequence: first.sequence }).reload).toBe(false)
  })
})

describe("shortenBuildTrigger", () => {
  test("returns undefined for absent triggers", () => {
    expect(shortenBuildTrigger(null)).toBeUndefined()
    expect(shortenBuildTrigger(undefined)).toBeUndefined()
    expect(shortenBuildTrigger("")).toBeUndefined()
  })

  test("shows the file name, which is what fits in the header row", () => {
    expect(shortenBuildTrigger("App.tsx")).toBe("App.tsx")
    expect(shortenBuildTrigger("src/App.tsx")).toBe("App.tsx")
    expect(shortenBuildTrigger("packages/web/src/components/App.tsx")).toBe("App.tsx")
    expect(shortenBuildTrigger("src\\components\\Card.tsx")).toBe("Card.tsx")
  })

  test("a very long file name is elided rather than cut by the layout", () => {
    expect(shortenBuildTrigger("src/a-really-long-generated-chunk-name-here.js")).toBe(
      "a-really-long-generated-chu…",
    )
  })
})

describe("failedBuildErrors", () => {
  const errors = [
    { file: "C:\\proj\\src\\App.tsx", line: 12, message: "Unexpected token" },
    { file: null, line: null, message: "TS2304: Cannot find name 'foo'" },
  ]

  test("lists the errors of a build that failed", () => {
    expect(failedBuildErrors({ build: build({ sequence: 2, ok: false }), errors })).toEqual(errors)
  })

  test("says nothing about a build that succeeded, is pending, or never ran", () => {
    expect(failedBuildErrors({ build: build({ ok: true }), errors })).toEqual([])
    expect(failedBuildErrors({ build: build({ ok: null }), errors })).toEqual([])
    expect(failedBuildErrors({ build: undefined, errors })).toEqual([])
  })

  test("stays quiet while the next build is already running", () => {
    // The header chip is saying "Building…"; the previous failure is about code being re-read.
    expect(failedBuildErrors({ build: build({ ok: false, running: true }), errors })).toEqual([])
  })

  test("drops blank messages, which would render as empty rows", () => {
    const noisy = [{ file: null, line: null, message: "   " }, errors[0]]
    expect(failedBuildErrors({ build: build({ ok: false }), errors: noisy })).toEqual([errors[0]])
  })

  test("a failed build with no parsed error renders no list at all", () => {
    expect(failedBuildErrors({ build: build({ ok: false }), errors: [] })).toEqual([])
    expect(failedBuildErrors({ build: build({ ok: false }), errors: undefined })).toEqual([])
  })
})

describe("buildErrorLocation", () => {
  test("shows the two last path segments and the line", () => {
    expect(buildErrorLocation({ file: "C:\\proj\\src\\App.tsx", line: 12, message: "x" })).toBe("src/App.tsx:12")
    expect(buildErrorLocation({ file: "/home/me/app/src/main.ts", line: 3, message: "x" })).toBe("src/main.ts:3")
  })

  test("omits the line when the compiler did not report one", () => {
    expect(buildErrorLocation({ file: "src/App.tsx", line: null, message: "x" })).toBe("src/App.tsx")
  })

  test("returns nothing for an error the compiler could not locate", () => {
    expect(buildErrorLocation({ file: null, line: 4, message: "x" })).toBeUndefined()
  })
})

describe("previewStatusTone", () => {
  const base = { status: undefined, failed: false, loading: false } as const

  test("follows the dev server while there is one", () => {
    expect(previewStatusTone({ ...base, status: "ready" })).toBe("success")
    expect(previewStatusTone({ ...base, status: "starting" })).toBe("warning")
    expect(previewStatusTone({ ...base, status: "error" })).toBe("danger")
    expect(previewStatusTone({ ...base, status: "idle" })).toBe("info")
    expect(previewStatusTone({ ...base, status: "stopped" })).toBe("info")
  })

  test("is never green when nothing answered", () => {
    // Green plus the word "Fit" read as "your app is running" on an empty panel.
    expect(previewStatusTone(base)).toBe("neutral")
  })

  test("still reports this panel's own load failure and navigation", () => {
    expect(previewStatusTone({ ...base, failed: true })).toBe("danger")
    expect(previewStatusTone({ ...base, loading: true })).toBe("warning")
  })
})

describe("previewStatusLabel", () => {
  const base = { status: undefined, failed: false, loading: false } as const

  test("names the dev server state", () => {
    expect(previewStatusLabel({ ...base, status: "starting" })).toBe("starting")
    expect(previewStatusLabel({ ...base, status: "ready" })).toBe("ready")
    expect(previewStatusLabel({ ...base, status: "stopped" })).toBe("stopped")
    expect(previewStatusLabel({ ...base, status: "error" })).toBe("serverError")
    expect(previewStatusLabel({ ...base, status: "idle" })).toBe("idle")
  })

  test("does not blame a dev server that does not exist", () => {
    expect(previewStatusLabel({ ...base, failed: true })).toBe("loadFailed")
  })

  test("falls back to idle, not to the zoom control's label", () => {
    expect(previewStatusLabel(base)).toBe("idle")
    expect(previewStatusLabel({ ...base, loading: true })).toBe("starting")
  })
})

describe("previewFailureCopy", () => {
  test("a compile error is never 'is the dev server running?'", () => {
    expect(previewFailureCopy({ status: "ready", compileErrors: 2 })).toBe("compile")
    // status stays "ready" through a failed build, so the error count is the only signal.
    expect(previewFailureCopy({ status: "error", compileErrors: 0 })).toBe("compile")
  })

  test("keeps the dead-server wording for an actual unreachable target", () => {
    expect(previewFailureCopy({ status: "ready", compileErrors: 0 })).toBe("unreachable")
    expect(previewFailureCopy({ status: undefined, compileErrors: 0 })).toBe("unreachable")
    expect(previewFailureCopy({ status: "stopped", compileErrors: 0 })).toBe("unreachable")
  })
})

describe("redactPreviewLogLine", () => {
  test("masks the value of an env-style secret but keeps the line readable", () => {
    expect(redactPreviewLogLine("STRIPE_SECRET_KEY=sk_live_abcdefghijklmno")).toBe(`STRIPE_SECRET_KEY=${REDACTED}`)
    expect(redactPreviewLogLine("  DATABASE_PASSWORD: hunter2000")).toBe(`  DATABASE_PASSWORD: ${REDACTED}`)
    expect(redactPreviewLogLine('API_TOKEN="abcd1234efgh"')).toBe(`API_TOKEN="${REDACTED}"`)
  })

  test("masks quoted config keys and auth headers", () => {
    expect(redactPreviewLogLine('{ "apiKey": "abcd1234efgh" }')).toBe(`{ "apiKey": "${REDACTED}" }`)
    expect(redactPreviewLogLine("authorization: Bearer abcdefghijklmnop")).toBe(`authorization: Bearer ${REDACTED}`)
  })

  test("masks credentials that are recognisable on their own", () => {
    expect(redactPreviewLogLine("using ghp_abcdefghijklmnopqrstuvwxyz012345 for git")).toBe(`using ${REDACTED} for git`)
  })

  test("masks the password of a connection string, keeping the rest readable", () => {
    expect(redactPreviewLogLine("db: postgres://admin:hunter2000@localhost:5432/app")).toBe(
      `db: postgres://admin:${REDACTED}@localhost:5432/app`,
    )
    // A plain URL has nothing to hide.
    const url = "  ➜  Local:   http://localhost:5173/"
    expect(redactPreviewLogLine(url)).toBe(url)
  })

  test("leaves compiler output alone", () => {
    // The reason the env pattern is case-sensitive: this line is not a secret.
    const line = "src/App.tsx:12:5: SyntaxError: Unexpected token => in default export"
    expect(redactPreviewLogLine(line)).toBe(line)
    const plain = "[tiancode-engine] Compilación completada con éxito."
    expect(redactPreviewLogLine(plain)).toBe(plain)
  })
})
