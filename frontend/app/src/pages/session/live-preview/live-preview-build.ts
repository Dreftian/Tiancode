/**
 * Decides how the preview should react to incremental-rebuild progress reported by the
 * dev server manager.
 *
 * The preview status is polled on an interval, so `running` alone is not a reliable trigger:
 * a build that starts and finishes between two polls would never be observed as running, and
 * the iframe would keep showing stale output. The manager therefore bumps a monotonic
 * `sequence` every time a build starts, and we compare that instead.
 */
export type PreviewBuildInfo = {
  running: boolean
  startedAt: number | null
  durationMs: number | null
  ok: boolean | null
  trigger: string | null
  sequence: number
}

export type BuildReaction = {
  /** The sequence the caller should remember for the next poll. */
  sequence: number
  /** Whether the preview iframe should be reloaded now. */
  reload: boolean
}

export function reactToBuild(input: {
  build: PreviewBuildInfo | undefined
  lastSequence: number
}): BuildReaction {
  const build = input.build
  if (!build) return { sequence: input.lastSequence, reload: false }

  // Nothing new since the last poll.
  if (build.sequence <= input.lastSequence) return { sequence: input.lastSequence, reload: false }

  // A new build is still running: remember nothing yet, so we still reload when it lands.
  if (build.running) return { sequence: input.lastSequence, reload: false }

  // A new build finished. Only a successful one is worth reloading for — reloading after a
  // failed build would replace a working page with a broken one (or a blank screen).
  return { sequence: build.sequence, reload: build.ok === true }
}

/**
 * Shortens a workspace-relative path for display.
 *
 * The header is a single narrow row shared with the device picker and the zoom controls, so a
 * two-segment path was still wide enough to be cut mid-word ("Compilando dis…"). The file name
 * alone is what identifies the change; the full path stays in the element's title.
 */
export function shortenBuildTrigger(trigger: string | null | undefined): string | undefined {
  if (!trigger) return undefined
  const parts = trigger.split(/[/\\]/).filter(Boolean)
  const name = parts[parts.length - 1]
  if (!name) return undefined
  return name.length > 28 ? `${name.slice(0, 27)}…` : name
}

/** A compile error as the manager publishes it (backend `error-parser.ts`). */
export type PreviewCompileError = {
  file: string | null
  line: number | null
  message: string
}

/**
 * The compile errors that explain a failed build.
 *
 * A failed build never changes the server's `status`: it stays "ready" and keeps serving the last
 * output that did compile, so `ok === false` plus these errors is the only evidence that what is
 * on screen is stale and why. Nothing read it, which is why a broken build looked exactly like a
 * working one.
 */
export function failedBuildErrors(input: {
  build: PreviewBuildInfo | undefined
  errors: readonly PreviewCompileError[] | undefined
}): PreviewCompileError[] {
  const build = input.build
  if (!build || build.ok !== false) return []
  // A build that is running again supersedes the previous failure: its errors describe code the
  // compiler is already re-reading, and the header chip is saying so.
  if (build.running) return []
  return (input.errors ?? []).filter((error) => !!error && !!error.message && error.message.trim().length > 0)
}

/**
 * "src/App.tsx:12" for an error the compiler located.
 *
 * The manager reports whatever the compiler printed, which is usually an absolute path; the last
 * two segments are what identifies the file at a glance and the whole path stays in the title.
 */
export function buildErrorLocation(error: PreviewCompileError): string | undefined {
  if (!error.file) return undefined
  const parts = error.file.split(/[/\\]/).filter(Boolean)
  if (parts.length === 0) return undefined
  const name = parts.slice(-2).join("/")
  return typeof error.line === "number" && Number.isFinite(error.line) ? `${name}:${error.line}` : name
}

export type PreviewServerStatus = "idle" | "starting" | "ready" | "error" | "stopped"

export type PreviewStatusTone = "neutral" | "info" | "success" | "warning" | "danger"

export type PreviewStatusInput = {
  /** undefined when no managed dev server answered at all (no project, or the server is down). */
  status: PreviewServerStatus | undefined
  /** The panel is showing a load failure. */
  failed: boolean
  /** A navigation is in flight. */
  loading: boolean
}

/**
 * Colour of the status dot.
 *
 * "No dev server answered" used to fall through to success green, so an empty panel with nothing
 * running in it wore the same dot as a running app.
 */
export function previewStatusTone(input: PreviewStatusInput): PreviewStatusTone {
  switch (input.status) {
    case "ready":
      return "success"
    case "starting":
      return "warning"
    case "error":
      return "danger"
    case "idle":
    case "stopped":
      return "info"
    default:
      break
  }
  if (input.failed) return "danger"
  if (input.loading) return "warning"
  return "neutral"
}

export type PreviewStatusLabel = "starting" | "ready" | "stopped" | "serverError" | "loadFailed" | "idle"

/**
 * Which word goes next to the dot. The fallback used to be "Fit" — the label of the zoom control
 * one row down — which read as a state the panel was in.
 */
export function previewStatusLabel(input: PreviewStatusInput): PreviewStatusLabel {
  switch (input.status) {
    case "starting":
      return "starting"
    case "ready":
      return "ready"
    case "stopped":
      return "stopped"
    case "error":
      return "serverError"
    case "idle":
      return "idle"
    default:
      break
  }
  // Without a managed dev server a failure is this panel's own navigation failing, not a dev
  // server error: saying "Dev server error" would name a process that does not exist.
  if (input.failed) return "loadFailed"
  if (input.loading) return "starting"
  return "idle"
}

export type PreviewFailureCopy = "compile" | "unreachable"

/**
 * How to word a load failure.
 *
 * "Could not load {url} — is the dev server running?" is the wrong question whenever the server
 * itself answered: a compile error leaves it up and serving, and `status: "error"` carries the
 * compiler's own message. Asking the user to check a process they can see running, instead of
 * showing them the error, is what made a syntax error look like a dead port.
 */
export function previewFailureCopy(input: {
  status: PreviewServerStatus | undefined
  compileErrors: number
}): PreviewFailureCopy {
  if (input.compileErrors > 0) return "compile"
  if (input.status === "error") return "compile"
  return "unreachable"
}

/** What replaces a secret in a log line. */
export const REDACTED = "••••••"

// Env-style assignment: only ALL-CAPS names, so "Unexpected token =>" from a compiler is left
// alone while `API_KEY=...` is not.
const ENV_SECRET = /\b([A-Z][A-Z0-9_]*(?:SECRET|TOKEN|PASSWORD|PASSWD|KEY|CREDENTIAL|AUTH)[A-Z0-9_]*)(\s*[:=]\s*)(["']?)([^\s"';,]{4,})\3/g
// JSON/object style ("apiKey": "…"). The value must be quoted, which keeps prose out.
const JSON_SECRET =
  /(["'])([A-Za-z0-9_-]*(?:secret|token|password|passwd|apikey|api_key|accesskey|credential|auth)[A-Za-z0-9_-]*)\1(\s*:\s*)(["'])([^"']{4,})\4/gi
const AUTH_HEADER = /\b(Bearer|Basic)\s+([A-Za-z0-9._~+/=-]{12,})/g
// postgres://user:password@host — a connection string printed at boot is the most common leak of
// all. The user name stays, so the line still identifies the database.
const URL_CREDENTIALS = /\b([a-z][a-z0-9+.-]*:\/\/)([^\s:@/]+):([^\s@/]+)@/gi
// Shapes that are a credential wherever they appear, with no key next to them.
const SECRET_LITERAL =
  /\b(?:sk-[A-Za-z0-9_-]{12,}|gh[pousr]_[A-Za-z0-9]{16,}|xox[baprs]-[A-Za-z0-9-]{10,}|AIza[0-9A-Za-z_-]{20,}|eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{6,})/g

/**
 * Masks obvious credentials in a dev-server log line before the panel shows it.
 *
 * The tail is the project's own raw stdout/stderr — the manager keeps the last 500 lines verbatim
 * — and `scrubEnv()` only cleans the environment handed to the child process, not what the child
 * prints. A dev server that echoes its own config (Next.js env summaries, docker-compose style
 * banners, a stray console.log) puts live keys on a panel that is one screenshot away from
 * leaving the machine. Only the value is masked, so the line still reads as the same line and
 * still says which variable it was about.
 */
export function redactPreviewLogLine(line: string): string {
  return line
    .replace(ENV_SECRET, (_match, key: string, separator: string, quote: string) => `${key}${separator}${quote}${REDACTED}${quote}`)
    .replace(
      JSON_SECRET,
      (_match, keyQuote: string, key: string, separator: string, valueQuote: string) =>
        `${keyQuote}${key}${keyQuote}${separator}${valueQuote}${REDACTED}${valueQuote}`,
    )
    .replace(AUTH_HEADER, (_match, scheme: string) => `${scheme} ${REDACTED}`)
    .replace(URL_CREDENTIALS, (_match, scheme: string, user: string) => `${scheme}${user}:${REDACTED}@`)
    .replace(SECRET_LITERAL, REDACTED)
}
