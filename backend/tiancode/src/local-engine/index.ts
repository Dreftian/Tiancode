import { LayerNode } from "@tiancode-ai/core/effect/layer-node"
import { makeGlobalNode } from "@tiancode-ai/core/effect/app-node"
import { FSUtil } from "@tiancode-ai/core/fs-util"
import { Global } from "@tiancode-ai/core/global"
import { httpClient } from "@tiancode-ai/core/effect/app-node-platform"
import { Context, Duration, Effect, Layer } from "effect"
import { type ChildProcess, execFile, spawn } from "node:child_process"
import { promisify } from "node:util"
import { existsSync, createWriteStream, readdirSync, readFileSync, writeFileSync, copyFileSync, statSync } from "node:fs"
import { rename, rm } from "node:fs/promises"
import { pipeline } from "node:stream/promises"
import { Readable, Transform } from "node:stream"
import path from "node:path"
import os from "node:os"

const execFileAsync = promisify(execFile)

export type EngineStatusType = "stopped" | "starting" | "running" | "error"

export interface LocalEngineStatus {
  readonly status: EngineStatusType
  readonly port: number
  readonly modelPath?: string
  readonly modelName?: string
  readonly binaryReady: boolean
  readonly binaryDownloading: boolean
  readonly downloadProgress?: number
  readonly error?: string
  readonly gpuLayers?: number
  readonly contextSize?: number
}

export interface StartEngineOptions {
  readonly model: string
  readonly file: string
  readonly gpuLayers?: number
  readonly contextSize?: number
  readonly port?: number
}

export interface Interface {
  readonly status: () => Effect.Effect<LocalEngineStatus>
  readonly ensureBinary: () => Effect.Effect<string>
  readonly start: (options: StartEngineOptions) => Effect.Effect<LocalEngineStatus>
  readonly stop: () => Effect.Effect<LocalEngineStatus>
}

export class Service extends Context.Service<Service, Interface>()("@tiancode/LocalEngine") {}

const DEFAULT_PORT = 58282
const DEFAULT_CTX_SIZE = 8192
const DEFAULT_GPU_LAYERS = 99

// ---------------------------------------------------------------------------
// Pinned llama.cpp release
// ---------------------------------------------------------------------------

/**
 * The llama.cpp release this app is built and tested against.
 *
 * `PINNED_LLAMA_BUILD` is the numeric build llama-server reports from `--version`; the `b` prefixed
 * tag is what GitHub names the release. They must stay in lockstep, so the tag is derived from the
 * number rather than written out twice.
 */
export const PINNED_LLAMA_BUILD = 10679
export const PINNED_LLAMA_RELEASE = `b${PINNED_LLAMA_BUILD}`

/** URL del binario precompilado de llama-server para Windows (Vulkan universal, x64). */
export function llamaReleaseUrl(release: string = PINNED_LLAMA_RELEASE) {
  return `https://github.com/ggml-org/llama.cpp/releases/download/${release}/llama-${release}-bin-win-vulkan-x64.zip`
}

// ---------------------------------------------------------------------------
// Argument construction (pure)
// ---------------------------------------------------------------------------

export interface ServerArgsInput {
  readonly modelPath: string
  readonly host?: string
  readonly port: number
  readonly gpuLayers: number
  readonly contextSize: number
  readonly threads: number
  readonly parallel?: number
}

/**
 * Build the llama-server command line.
 *
 * `--jinja` here is defensive, not the repair. On the pinned build it changes nothing: b10679
 * prints `--jinja, --no-jinja   whether to use jinja template engine for chat (default: enabled)`,
 * so tool calling already works without the flag. What actually broke local chat was an old
 * llama-server winning binary resolution -- one that predates that default and answers every
 * tool-carrying request with "Cannot use tools with stream". That is fixed by refusing stale
 * binaries (see `decideProvisioning` / `resolveLlamaBinary`), not here.
 *
 * The flag stays because it costs nothing and pins the behaviour for any older binary that still
 * slips through -- an explicit `TIANCODE_LLAMA_SERVER` override, or a PATH fallback.
 */
export function buildServerArgs(input: ServerArgsInput): string[] {
  return [
    "-m",
    input.modelPath,
    "--host",
    input.host ?? "127.0.0.1",
    "--port",
    String(input.port),
    "-ngl",
    String(input.gpuLayers),
    "-c",
    String(input.contextSize),
    "-t",
    String(input.threads),
    "--parallel",
    String(input.parallel ?? 1),
    "--jinja",
  ]
}

// ---------------------------------------------------------------------------
// Build identification + staleness (pure)
// ---------------------------------------------------------------------------

/** Marker file dropped next to the managed binary recording which release provisioned it. */
export const LLAMA_BUILD_MARKER_FILE = ".tiancode-llama-build.json"

export interface LlamaBuildMarker {
  readonly release: string
  readonly build?: number
  readonly provisionedAt?: string
  readonly source?: "bundled" | "download" | "adopted"
}

export function serializeBuildMarker(marker: LlamaBuildMarker) {
  return `${JSON.stringify(marker, null, 2)}\n`
}

/** Tolerant marker parse: anything unreadable or shapeless is treated as "no marker". */
export function parseBuildMarker(raw: string | undefined): LlamaBuildMarker | undefined {
  if (!raw) return undefined
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== "object") return undefined
    const release = (parsed as { release?: unknown }).release
    if (typeof release !== "string" || release.length === 0) return undefined
    const build = (parsed as { build?: unknown }).build
    const source = (parsed as { source?: unknown }).source
    const provisionedAt = (parsed as { provisionedAt?: unknown }).provisionedAt
    return {
      release,
      build: typeof build === "number" ? build : undefined,
      provisionedAt: typeof provisionedAt === "string" ? provisionedAt : undefined,
      source: source === "bundled" || source === "download" || source === "adopted" ? source : undefined,
    }
  } catch {
    return undefined
  }
}

/**
 * Extract the llama.cpp build number from `llama-server --version` output.
 *
 * Two formats are in the wild and both must be recognised, because telling them apart is the whole
 * point of the check:
 *   - current:  `version: 0.3.0-dev (build 10679, commit 50f068fff)`
 *   - pre-2025: `version: 4800 (cc473cac)`
 * llama.cpp prints this on stderr, so callers should pass stdout and stderr concatenated.
 */
export function parseLlamaBuild(output: string | undefined): number | undefined {
  if (!output) return undefined
  const modern = output.match(/\(\s*build\s+(\d+)/i)
  if (modern?.[1]) return Number(modern[1])
  const legacy = output.match(/^\s*version:\s*(\d+)\s*\(/im)
  if (legacy?.[1]) return Number(legacy[1])
  return undefined
}

export type ProvisionReason = "missing-binary" | "missing-marker" | "stale-marker" | "stale-build" | "unprobed"

export type ProvisionDecision =
  | { readonly kind: "reuse" }
  /** The binary is fine, but nothing recorded which release it came from -- adopt it. */
  | { readonly kind: "adopt"; readonly build: number }
  /**
   * The build is not the pinned one, but provisioning already ran for the pinned release and
   * measured exactly this number. Running it again would copy the same bytes and measure the same
   * number, so this is a convergence stop, not an endorsement -- the caller should warn.
   */
  | { readonly kind: "accept"; readonly build: number }
  | { readonly kind: "provision"; readonly reason: ProvisionReason; readonly foundBuild?: number }

export interface ProvisionInput {
  readonly hasBinary: boolean
  readonly marker: LlamaBuildMarker | undefined
  /** Build number read back from the binary itself, when a `--version` probe was possible. */
  readonly probedBuild?: number
  /**
   * True only for the directory Tiancode provisions and owns (`Global.Path.bin/llama-server`).
   *
   * A marker file is a claim, and only in our own directory did we write it. Anywhere else --- a
   * sibling cache dir, a leftover from another channel, anything a user dropped on disk --- a
   * `.tiancode-llama-build.json` next to a binary proves nothing about that binary, so an
   * unprobed foreign directory is never reusable. Defaults to true so the pure decision keeps its
   * original meaning for the managed dir.
   */
  readonly managed?: boolean
  readonly pinnedRelease?: string
  readonly pinnedBuild?: number
}

/**
 * Decide whether a llama-server directory can be reused as-is.
 *
 * Before this existed, `ensureBinary` returned the first `llama-server.exe` it happened to find with
 * no version check at all, so an 18-month-old binary left in a cache directory beat the one shipped
 * with the app -- and that old binary answers every tool-carrying request with "Cannot use tools
 * with stream".
 */
export function decideProvisioning(input: ProvisionInput): ProvisionDecision {
  const pinnedRelease = input.pinnedRelease ?? PINNED_LLAMA_RELEASE
  const pinnedBuild = input.pinnedBuild ?? PINNED_LLAMA_BUILD
  const managed = input.managed ?? true

  if (!input.hasBinary) return { kind: "provision", reason: "missing-binary" }

  // A probe of the binary itself outranks the marker: the marker can be stale or hand-edited, the
  // binary cannot lie about its own build.
  if (input.probedBuild !== undefined) {
    if (input.probedBuild === pinnedBuild) {
      if (input.marker?.release === pinnedRelease) return { kind: "reuse" }
      return { kind: "adopt", build: input.probedBuild }
    }
    // Convergence stop. The marker is only written *after* provisioning measures what landed, so a
    // marker that names the pinned release and agrees with the probe means: we already copied the
    // pinned runtime into this directory and this is the build it actually reports. Re-provisioning
    // would reproduce it byte for byte, re-decide "stale-build", and re-copy ~100 MB on every
    // single engine start, forever. Only in our own directory -- a foreign marker cannot buy this.
    if (managed && input.marker?.release === pinnedRelease && input.marker.build === input.probedBuild)
      return { kind: "accept", build: input.probedBuild }
    return { kind: "provision", reason: "stale-build", foundBuild: input.probedBuild }
  }

  // No probe was possible. A directory we do not own has to prove its build by probe; a file
  // sitting next to the binary is not proof.
  if (!managed) return { kind: "provision", reason: "unprobed" }
  if (!input.marker) return { kind: "provision", reason: "missing-marker" }
  if (input.marker.release !== pinnedRelease) return { kind: "provision", reason: "stale-marker" }
  return { kind: "reuse" }
}

// ---------------------------------------------------------------------------
// Health probe semantics (pure)
// ---------------------------------------------------------------------------

/**
 * llama-server's `/health` contract, as implemented by the pinned build:
 *   - 200 `{"status":"ok"}`                                     -> model loaded, ready to serve
 *   - 503 `{"error":{...,"message":"Loading model",...}}`       -> process alive, still loading
 *   - connection refused                                        -> not listening (yet, or ever)
 * Ancient builds have no `/health` route at all and answer 404; a server that routes at all is up,
 * so 404 counts as ready rather than blocking startup forever.
 */
export type HealthProbe =
  | { readonly kind: "ready" }
  | { readonly kind: "loading"; readonly detail?: string }
  /** Something answered, but it did not answer like llama-server. Not ours, not worth waiting on. */
  | { readonly kind: "foreign"; readonly status: number; readonly detail?: string }
  | { readonly kind: "unreachable" }

/**
 * The body llama-server sends while the weights are still being read, verbatim from b10679:
 * `{"error":{"code":503,"message":"Loading model","type":"unavailable_error"}}`. Matching the
 * message, and the error type it is paired with, keeps the check tolerant of wording drift between
 * builds without accepting arbitrary text.
 */
const HEALTH_LOADING_BODY = /loading model|"type"\s*:\s*"unavailable_error"/i

/**
 * Classify one `/health` answer.
 *
 * Everything that answered used to be read as "loading", which handed any socket on 58282 the
 * fifteen-minute load budget: a stray dev server, an auth proxy answering 401, anything at all held
 * `POST /models/engine/start` open for the full budget while the frontend awaited it with no
 * timeout and no cancel. Only a response that actually says the model is loading earns that; every
 * other answer is somebody else's and falls back to the short connect budget.
 */
export function interpretHealthResponse(status: number, body?: string): HealthProbe {
  if (status >= 200 && status < 300) return { kind: "ready" }
  if (status === 404) return { kind: "ready" }
  if (status === 503 && body && HEALTH_LOADING_BODY.test(body)) return { kind: "loading", detail: body.slice(0, 400) }
  return { kind: "foreign", status, detail: body?.slice(0, 400) }
}

/** Time allowed for llama-server to bind its port and answer anything at all. */
export const HEALTH_CONNECT_BUDGET_MS = 90_000
/** Time allowed for a model to finish loading once the server has started answering 503s. */
export const HEALTH_LOAD_BUDGET_MS = 900_000
export const HEALTH_POLL_INTERVAL_MS = 500

export interface HealthWaitState {
  readonly elapsedMs: number
  /** True once `/health` has answered as llama-server loading a model. */
  readonly sawServer: boolean
  readonly processExited: boolean
  readonly last: HealthProbe
}

export type HealthWaitDecision =
  | { readonly kind: "ready" }
  | { readonly kind: "wait" }
  | {
      readonly kind: "fail"
      readonly reason: "process-exited" | "never-answered" | "load-timeout" | "port-taken"
    }

export interface HealthBudgets {
  readonly connectMs?: number
  readonly loadMs?: number
}

/**
 * Decide whether to keep waiting for llama-server to come up.
 *
 * The old loop was 60 attempts x 500ms = 30s flat, which a large model on a cold GPU cannot meet --
 * the user just got "El motor de inferencia no respondió". Waiting longer alone is not enough
 * either: a process that died on startup would then hang the UI for the whole extended budget. So a
 * server that is answering 503 ("Loading model") gets a generous budget, a process that has exited
 * fails immediately, and a server that never answers at all fails on the shorter connect budget.
 *
 * The `processExited` test comes FIRST, and the ordering is the whole point. A healthy port whose
 * child is dead is not our engine: when a leftover llama-server is already squatting on 58282 our
 * child exits with "address already in use" while the probe keeps answering 200. Checking `ready`
 * first adopted that stranger --- status went "running" with `currentProcess` already cleared by the
 * exit handler, so `stop()` became a no-op and every chat went to the stale server, which is
 * exactly the binary this module exists to refuse.
 */
export function decideHealthWait(state: HealthWaitState, budgets: HealthBudgets = {}): HealthWaitDecision {
  const connectMs = budgets.connectMs ?? HEALTH_CONNECT_BUDGET_MS
  const loadMs = budgets.loadMs ?? HEALTH_LOAD_BUDGET_MS

  // A dead process can never become ready, however patient the budget is -- and a port that is
  // healthy anyway belongs to somebody else.
  if (state.processExited)
    return { kind: "fail", reason: state.last.kind === "ready" ? "port-taken" : "process-exited" }
  if (state.last.kind === "ready") return { kind: "ready" }
  if (state.sawServer) {
    if (state.elapsedMs >= loadMs) return { kind: "fail", reason: "load-timeout" }
    return { kind: "wait" }
  }
  if (state.elapsedMs >= connectMs) return { kind: "fail", reason: "never-answered" }
  return { kind: "wait" }
}

// ---------------------------------------------------------------------------
// stderr capture (pure)
// ---------------------------------------------------------------------------

export const STDERR_RING_LIMIT = 80

/** Append a raw stderr chunk to a bounded ring of trimmed lines. Returns a new array. */
export function pushStderrChunk(ring: readonly string[], chunk: string, limit = STDERR_RING_LIMIT): string[] {
  const lines = chunk
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
  if (lines.length === 0) return [...ring]
  const next = [...ring, ...lines]
  return next.length > limit ? next.slice(next.length - limit) : next
}

/** Failures that name a concrete cause, worth surfacing over any generic "error" line. */
const STDERR_FATAL_PATTERNS = [
  /failed to load model|error loading model|unable to load model|llama_model_load\w*:\s*(error|failed)/i,
  /unknown model architecture|unsupported model|invalid magic|wrong number of tensors|corrupted|not a valid gguf/i,
  /out of memory|\boom\b|device lost|failed to allocate|insufficient memory/i,
  /address already in use|failed to bind|eaddrinuse|access is denied|permission denied|no such file or directory/i,
  /cannot use tools with stream|tools param requires --jinja|only commonly used templates are accepted/i,
]

const STDERR_GENERIC_PATTERN = /\b(error|failed|fatal|panic|abort|assertion)\b/i

export function scoreStderrLine(line: string): number {
  if (STDERR_FATAL_PATTERNS.some((pattern) => pattern.test(line))) return 2
  if (STDERR_GENERIC_PATTERN.test(line)) return 1
  return 0
}

/**
 * Pick the line worth showing the user.
 *
 * The previous code assigned `lastError = text` for any chunk containing "error" or "failed", so the
 * message that survived was simply whichever noisy line arrived last -- typically unrelated to the
 * actual failure. Scoring the whole ring and preferring a named cause fixes that; ties go to the
 * most recent line, which is the one closest to the exit.
 */
export function pickRelevantStderr(ring: readonly string[]): string | undefined {
  let best: string | undefined
  let bestScore = 0
  for (const line of ring) {
    const score = scoreStderrLine(line)
    if (score >= bestScore && score > 0) {
      best = line
      bestScore = score
    }
  }
  return best
}

// ---------------------------------------------------------------------------
// Failed-subprocess output (pure)
// ---------------------------------------------------------------------------

/**
 * Recover the `stdout`/`stderr` a rejected `execFile` already produced.
 *
 * `Effect.tryPromise` with a bare thunk does not hand the catch handler the Node error: it wraps
 * every rejection in `Cause.UnknownError`, whose own properties are `message` and `cause`. Reading
 * `err.stdout` off that wrapper --- which is what `probeBuild` used to do --- always found
 * `undefined`, so llama.cpp's version banner was thrown away on any non-zero exit and the entire
 * recovery path was dead code that a comment described as working. Walking `.cause` finds the real
 * rejection; the loop tolerates one more layer of wrapping and a cause cycle.
 */
export function execOutput(err: unknown): string {
  const seen = new Set<unknown>()
  let node: unknown = err
  for (let depth = 0; depth < 5 && node !== null && typeof node === "object" && !seen.has(node); depth++) {
    seen.add(node)
    const record = node as { stdout?: unknown; stderr?: unknown; cause?: unknown }
    const stdout = typeof record.stdout === "string" ? record.stdout : undefined
    const stderr = typeof record.stderr === "string" ? record.stderr : undefined
    if (stdout !== undefined || stderr !== undefined) return `${stdout ?? ""}\n${stderr ?? ""}`
    node = record.cause
  }
  return ""
}

// ---------------------------------------------------------------------------
// Binary resolution order (with the filesystem injected)
// ---------------------------------------------------------------------------

export type BinarySource = "override" | "managed" | "bundled" | "sibling" | "download" | "path"

export interface BinaryResolution {
  readonly path: string
  readonly source: BinarySource
  /** What the binary reported after provisioning, when a `--version` probe was possible. */
  readonly build?: number
}

export interface CopyBundledResult {
  readonly copied: number
  /**
   * Whether the executable itself landed. Everything else in the directory is DLLs and licences;
   * only this file decides whether provisioning actually happened.
   */
  readonly executableCopied: boolean
  readonly failed?: string
}

/** Everything `resolveLlamaBinary` touches outside itself, so the order can be tested. */
export interface BinaryPorts {
  readonly binDir: string
  readonly binaryPath: string
  readonly binaryExecutable: string
  /** `TIANCODE_LLAMA_SERVER`, already read. */
  readonly override?: string
  readonly exists: (candidate: string) => boolean
  /** Must not fail: an unprobeable binary is reported as `undefined`, not as an error. */
  readonly probeBuild: (exe: string) => Effect.Effect<number | undefined>
  readonly readMarker: (dir: string) => LlamaBuildMarker | undefined
  readonly writeMarker: (dir: string, marker: LlamaBuildMarker) => void
  readonly findBundled: () => string | undefined
  readonly copyBundled: (bundledDir: string) => CopyBundledResult
  readonly siblingDirs: () => readonly string[]
  readonly download: () => Effect.Effect<string | undefined>
  readonly onPath: () => Effect.Effect<string | undefined>
  readonly now?: () => string
  /** Each step actually attempted, in order. Exists so the ordering itself can be asserted. */
  readonly trace?: (step: string) => void
}

/**
 * Find a llama-server worth running, in a fixed order of preference.
 *
 *   managed dir (if it already holds the pinned build) -> bundled runtime -> a sibling cache dir
 *   that can prove its build -> download the pinned release -> an unversioned PATH binary.
 *
 * The order is the fix. The code this replaced returned the first `llama-server.exe` it found
 * anywhere, which on any machine that had ever run an older build meant an 18-month-old binary beat
 * the one shipped in the installer. PATH sits last, after the download, for the same reason: it is
 * a degradation, never a winner.
 *
 * The ports exist because none of that is observable otherwise -- with the filesystem hard-wired,
 * reordering these steps back to first-found-wins leaves every test green.
 */
export const resolveLlamaBinary = (ports: BinaryPorts): Effect.Effect<BinaryResolution | undefined> =>
  Effect.gen(function* () {
    const step = (name: string) => ports.trace?.(name)
    const timestamp = ports.now ?? (() => new Date().toISOString())

    /**
     * Record what provisioning MEASURED, never what it intended.
     *
     * Stamping `PINNED_LLAMA_BUILD` unconditionally is an assertion, and when it is wrong -- a
     * bundle that is not literally b10679 -- the next start probes the binary, disagrees with the
     * marker, decides "stale-build" and copies ~100 MB again. Every start. Writing the measured
     * number instead lets `decideProvisioning` recognise a converged directory and stop.
     */
    const stamp = (build: number | undefined, source: LlamaBuildMarker["source"]) =>
      ports.writeMarker(ports.binDir, {
        release: PINNED_LLAMA_RELEASE,
        build,
        provisionedAt: timestamp(),
        source,
      })

    // 0. Escape hatch: an explicit path from the user is always honoured, staleness is their call.
    if (ports.override && ports.exists(ports.override)) {
      step("override")
      return { path: ports.override, source: "override" }
    }

    // 1. Is the managed directory already holding the pinned build?
    step("managed")
    const hasManaged = ports.exists(ports.binaryPath)
    const managedBuild = hasManaged ? yield* ports.probeBuild(ports.binaryPath) : undefined
    const decision = decideProvisioning({
      hasBinary: hasManaged,
      marker: ports.readMarker(ports.binDir),
      probedBuild: managedBuild,
      managed: true,
    })

    if (decision.kind === "reuse") return { path: ports.binaryPath, source: "managed", build: managedBuild }
    if (decision.kind === "accept") {
      yield* Effect.logWarning("llama-server no reporta la build fijada, pero reaprovisionar no lo cambiaría", {
        found: decision.build,
        pinned: PINNED_LLAMA_BUILD,
      })
      return { path: ports.binaryPath, source: "managed", build: decision.build }
    }
    if (decision.kind === "adopt") {
      // Right build, no marker: stamp it so the next start skips the --version probe.
      stamp(decision.build, "adopted")
      return { path: ports.binaryPath, source: "managed", build: decision.build }
    }

    yield* Effect.logInfo("Reaprovisionando llama-server", {
      reason: decision.reason,
      foundBuild: decision.foundBuild,
      pinned: PINNED_LLAMA_RELEASE,
    })

    // 2. Prefer the runtime bundled with the installer over anything already on disk.
    const bundledDir = ports.findBundled()
    if (bundledDir) {
      step("bundled")
      const result = ports.copyBundled(bundledDir)
      // `isBinaryPresent()` used to stand in for success here, and it was already true -- that is
      // why the binary was probed and judged stale in the first place. On Windows `copyFileSync`
      // over a running llama-server.exe fails with EBUSY/EPERM, the per-file failure was swallowed,
      // and a marker claiming b10679 was written on top of the untouched stale binary.
      if (result.executableCopied) {
        const measured = yield* ports.probeBuild(ports.binaryPath)
        if (measured !== undefined && measured !== PINNED_LLAMA_BUILD) {
          yield* Effect.logWarning("El runtime llama-server incluido no es la build fijada; se acepta una vez", {
            bundledDir,
            measured,
            pinned: PINNED_LLAMA_BUILD,
          })
        }
        stamp(measured, "bundled")
        return { path: ports.binaryPath, source: "bundled", build: measured }
      }
      yield* Effect.logWarning("No se pudo copiar el ejecutable llama-server incluido en la aplicación", {
        bundledDir,
        copied: result.copied,
        error: result.failed,
      })
    }

    // 3. A sibling cache directory only counts if it can prove which build it is, by probe. This is
    //    the step that used to hand back an 18-month-old binary with no check whatsoever -- and
    //    then, briefly, on the strength of a marker file anyone could have written next to it.
    for (const dir of ports.siblingDirs()) {
      if (path.resolve(dir) === path.resolve(ports.binDir)) continue
      const exe = path.join(dir, ports.binaryExecutable)
      if (!ports.exists(exe)) continue
      step(`sibling:${dir}`)
      const siblingBuild = yield* ports.probeBuild(exe)
      const verdict = decideProvisioning({
        hasBinary: true,
        marker: ports.readMarker(dir),
        probedBuild: siblingBuild,
        managed: false,
      })
      if (verdict.kind === "reuse" || verdict.kind === "adopt" || verdict.kind === "accept")
        return { path: exe, source: "sibling", build: siblingBuild }
      yield* Effect.logInfo("Ignorando llama-server no verificado en caché", {
        dir,
        build: siblingBuild,
        reason: verdict.kind === "provision" ? verdict.reason : undefined,
      })
    }

    // 4. Download the pinned release into the managed directory.
    step("download")
    const downloaded = yield* ports.download()
    if (downloaded) {
      const measured = yield* ports.probeBuild(downloaded)
      if (measured !== undefined && measured !== PINNED_LLAMA_BUILD) {
        yield* Effect.logWarning("La release descargada no reporta la build fijada; se acepta una vez", {
          measured,
          pinned: PINNED_LLAMA_BUILD,
        })
      }
      stamp(measured, "download")
      return { path: downloaded, source: "download", build: measured }
    }

    // 5. Last resort only: an unversioned llama-server on PATH. Degrading to it beats failing
    //    outright, but it must never win over the pinned build, so it lives after the download.
    step("path")
    const onPath = yield* ports.onPath()
    if (onPath && ports.exists(onPath)) {
      yield* Effect.logWarning("Usando un llama-server del PATH sin verificar; puede no soportar herramientas", {
        path: onPath,
      })
      return { path: onPath, source: "path" }
    }

    return undefined
  })

// ---------------------------------------------------------------------------
// Layer
// ---------------------------------------------------------------------------

const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const fs = yield* FSUtil.Service

    const binDir = path.join(Global.Path.bin, "llama-server")
    const modelsDir = path.join(Global.Path.data, "models")
    const binaryExecutable = process.platform === "win32" ? "llama-server.exe" : "llama-server"
    const binaryPath = path.join(binDir, binaryExecutable)
    const markerPath = path.join(binDir, LLAMA_BUILD_MARKER_FILE)

    let currentProcess: ChildProcess | undefined
    let currentStatus: EngineStatusType = "stopped"
    let currentModelPath: string | undefined
    let currentModelName: string | undefined
    let currentPort = DEFAULT_PORT
    let currentGpuLayers = DEFAULT_GPU_LAYERS
    let currentContextSize = DEFAULT_CTX_SIZE
    let lastError: string | undefined
    let binaryDownloading = false
    let downloadProgress = 0
    let stderrRing: string[] = []

    const isBinaryPresent = () => existsSync(binaryPath)

    const getStatus = (): LocalEngineStatus => ({
      status: currentStatus,
      port: currentPort,
      modelPath: currentModelPath,
      modelName: currentModelName,
      binaryReady: isBinaryPresent(),
      binaryDownloading,
      downloadProgress: binaryDownloading ? downloadProgress : undefined,
      error: lastError,
      gpuLayers: currentGpuLayers,
      contextSize: currentContextSize,
    })

    const readMarker = (dir: string): LlamaBuildMarker | undefined => {
      const file = path.join(dir, LLAMA_BUILD_MARKER_FILE)
      try {
        if (!existsSync(file)) return undefined
        return parseBuildMarker(readFileSync(file, "utf8"))
      } catch {
        return undefined
      }
    }

    const writeMarker = (dir: string, marker: LlamaBuildMarker) => {
      try {
        writeFileSync(path.join(dir, LLAMA_BUILD_MARKER_FILE), serializeBuildMarker(marker))
        return true
      } catch {
        return false
      }
    }

    /** Ask a binary which build it is. Safe: `--version` prints and exits without loading a model. */
    const probeBuild = (exe: string) =>
      Effect.tryPromise(() =>
        execFileAsync(exe, ["--version"], { cwd: path.dirname(exe), timeout: 20_000, windowsHide: true }),
      ).pipe(
        Effect.map((res) => parseLlamaBuild(`${res.stdout ?? ""}\n${res.stderr ?? ""}`)),
        // execFile rejects on a non-zero exit, but llama.cpp still printed the version first. The
        // rejection is wrapped by `Effect.tryPromise`, so its output hangs off `.cause` -- see
        // `execOutput`, which is the only reason this recovery is not dead code.
        Effect.catch((err) => Effect.succeed(parseLlamaBuild(execOutput(err)))),
      )

    const downloadAndExtractBinary = Effect.fn("LocalEngine.downloadBinary")(function* () {
      binaryDownloading = true
      downloadProgress = 0

      yield* fs.ensureDir(binDir).pipe(Effect.orDie)
      const zipPath = path.join(binDir, "llama-server.zip")
      const url = llamaReleaseUrl()

      try {
        yield* Effect.tryPromise(async () => {
          const res = await fetch(url, { redirect: "follow" })
          if (!res.ok || !res.body) {
            throw new Error(`HTTP ${res.status} al descargar llama-server desde GitHub`)
          }

          const part = `${zipPath}.part`
          await rm(part, { force: true }).catch(() => {})
          const total = Number(res.headers.get("content-length") ?? 0)
          let loaded = 0

          const progress = new Transform({
            transform(chunk, _encoding, callback) {
              loaded += chunk.byteLength
              if (total > 0) {
                downloadProgress = Math.round((loaded / total) * 100)
              }
              callback(null, chunk)
            },
          })

          await pipeline(Readable.fromWeb(res.body as never), progress, createWriteStream(part))
          await rename(part, zipPath)

          // Extraer el zip en binDir usando PowerShell Expand-Archive o unzip.
          // -Force / -o sobrescriben los binarios obsoletos que ya estuvieran en el directorio.
          if (process.platform === "win32") {
            await execFileAsync("powershell", [
              "-NoProfile",
              "-Command",
              `Expand-Archive -LiteralPath "${zipPath}" -DestinationPath "${binDir}" -Force`,
            ])
          } else {
            await execFileAsync("unzip", ["-o", zipPath, "-d", binDir])
          }

          await rm(zipPath, { force: true }).catch(() => {})
        })
      } catch (err) {
        lastError = err instanceof Error ? err.message : String(err)
        yield* Effect.logError("Error al descargar e instalar llama-server", { error: lastError })
        throw err
      } finally {
        binaryDownloading = false
      }

      if (!isBinaryPresent()) {
        throw new Error("El ejecutable llama-server no se encontró tras descomprimir el paquete.")
      }

      // No marker here: `resolveLlamaBinary` stamps one after probing what actually landed, so the
      // recorded build is measured rather than asserted.
      return binaryPath
    })

    const findBundledDirectory = (): string | undefined => {
      const resourcesPath = (process as any).resourcesPath as string | undefined
      const candidates = [
        resourcesPath ? path.join(resourcesPath, "llama-server") : undefined,
        path.resolve(process.cwd(), "frontend", "desktop", "resources", "llama-server"),
        path.resolve(process.cwd(), "resources", "llama-server"),
        path.resolve(process.cwd(), "backend", "tiancode", "llama-bin"),
        path.resolve(__dirname, "..", "..", "..", "frontend", "desktop", "resources", "llama-server"),
        path.resolve(__dirname, "..", "llama-bin"),
      ].filter(Boolean) as string[]

      for (const dir of candidates) {
        const exe = path.join(dir, binaryExecutable)
        if (existsSync(exe)) return dir
      }
      return undefined
    }

    const getCandidateBinDirs = (): string[] => [
      binDir,
      path.join(Global.Path.bin, "llama-server"),
      path.join(Global.Path.cache, "bin", "llama-server"),
      path.join(
        process.env.APPDATA ?? path.join(os.homedir(), "AppData", "Roaming"),
        "ai.tiancode.desktop",
        "xdg",
        "cache",
        "tiancode",
        "bin",
        "llama-server",
      ),
      path.join(
        process.env.APPDATA ?? path.join(os.homedir(), "AppData", "Roaming"),
        "ai.tiancode.desktop.codex",
        "xdg",
        "cache",
        "tiancode",
        "bin",
        "llama-server",
      ),
    ]

    const getCandidateModelsDirs = (): string[] => [
      modelsDir,
      path.join(Global.Path.data, "models"),
      path.join(os.homedir(), ".local", "share", "tiancode", "models"),
      path.join(
        process.env.APPDATA ?? path.join(os.homedir(), "AppData", "Roaming"),
        "ai.tiancode.desktop",
        "xdg",
        "data",
        "tiancode",
        "models",
      ),
      path.join(
        process.env.APPDATA ?? path.join(os.homedir(), "AppData", "Roaming"),
        "ai.tiancode.desktop.codex",
        "xdg",
        "data",
        "tiancode",
        "models",
      ),
    ]

    /**
     * Copy the bundled runtime into the managed cache directory, overwriting what is there.
     *
     * Only `binDir` is ever written to -- it is provisioned and owned by Tiancode. Sibling cache
     * directories and anything the user installed themselves are read-only to us.
     */
    const copyBundled = (bundledDir: string): CopyBundledResult => {
      let copied = 0
      let executableCopied = false
      let failed: string | undefined
      for (const name of readdirSync(bundledDir)) {
        const src = path.join(bundledDir, name)
        try {
          if (statSync(src).isDirectory()) continue
          copyFileSync(src, path.join(binDir, name))
          copied++
          // Tracked separately: the caller cannot tell provisioning happened from a file count.
          // On Windows, copying over a llama-server.exe that is still running throws EBUSY/EPERM
          // while every DLL beside it copies fine.
          if (name.toLowerCase() === binaryExecutable.toLowerCase()) executableCopied = true
        } catch (err) {
          failed = err instanceof Error ? err.message : String(err)
        }
      }
      return { copied, executableCopied, failed }
    }

    /** The real filesystem, wired into the resolution order defined by `resolveLlamaBinary`. */
    const binaryPorts = (): BinaryPorts => ({
      binDir,
      binaryPath,
      binaryExecutable,
      override: process.env.TIANCODE_LLAMA_SERVER,
      exists: existsSync,
      probeBuild: (exe) => probeBuild(exe).pipe(Effect.catchCause(() => Effect.succeed(undefined))),
      readMarker,
      writeMarker: (dir, marker) => {
        writeMarker(dir, marker)
      },
      findBundled: findBundledDirectory,
      copyBundled,
      siblingDirs: getCandidateBinDirs,
      download: () => downloadAndExtractBinary().pipe(Effect.catchCause(() => Effect.succeed(undefined))),
      onPath: () =>
        Effect.tryPromise(() =>
          execFileAsync(process.platform === "win32" ? "where" : "which", ["llama-server"]),
        ).pipe(
          Effect.map((res) => res.stdout.split("\n")[0]?.trim()),
          Effect.catch(() => Effect.succeed(undefined)),
        ),
    })

    const ensureBinary = Effect.fn("LocalEngine.ensureBinary")(function* () {
      yield* fs.ensureDir(binDir).pipe(Effect.orDie)
      const resolved = yield* resolveLlamaBinary(binaryPorts())
      if (!resolved) return yield* Effect.die(new Error("No se pudo preparar el binario llama-server."))
      return resolved.path
    })

    const stopEngine = Effect.fn("LocalEngine.stop")(function* () {
      if (currentProcess) {
        try {
          if (process.platform === "win32" && currentProcess.pid) {
            // En Windows, matar el árbol de procesos para liberar inmediatamente la VRAM
            yield* Effect.tryPromise(() =>
              execFileAsync("taskkill", ["/PID", String(currentProcess!.pid), "/T", "/F"]),
            ).pipe(Effect.catch(() => Effect.void))
          } else {
            currentProcess.kill("SIGTERM")
          }
        } catch {
          // ignore
        }
        currentProcess = undefined
      }
      currentStatus = "stopped"
      currentModelPath = undefined
      currentModelName = undefined
      lastError = undefined
      return getStatus()
    })

    const probeHealth = async (port: number): Promise<HealthProbe> => {
      try {
        const res = await fetch(`http://127.0.0.1:${port}/health`, { signal: AbortSignal.timeout(2000) })
        let body: string | undefined
        if (!res.ok) {
          body = await res.text().catch(() => undefined)
        }
        return interpretHealthResponse(res.status, body)
      } catch {
        return { kind: "unreachable" }
      }
    }

    const startEngine = Effect.fn("LocalEngine.start")(function* (options: StartEngineOptions) {
      // 1. Detener instancia previa si existe
      yield* stopEngine()

      currentStatus = "starting"
      currentPort = options.port ?? DEFAULT_PORT
      currentGpuLayers = options.gpuLayers ?? DEFAULT_GPU_LAYERS
      currentContextSize = options.contextSize ?? DEFAULT_CTX_SIZE
      lastError = undefined
      stderrRing = []

      let resolvedModelFile: string | undefined
      const targetName = (options.file || options.model || "").replace(/\.gguf$/i, "").toLowerCase()

      const findGgufInDir = (dir: string): string | undefined => {
        if (!existsSync(dir)) return undefined
        try {
          const entries = readdirSync(dir, { withFileTypes: true })
          for (const entry of entries) {
            const full = path.join(dir, entry.name)
            if (entry.isDirectory()) {
              const found = findGgufInDir(full)
              if (found) return found
            } else if (entry.name.endsWith(".gguf") && !entry.name.endsWith(".part")) {
              const clean = entry.name.replace(/\.gguf$/i, "").toLowerCase()
              if (clean === targetName || clean.includes(targetName) || targetName.includes(clean)) {
                return full
              }
            }
          }
        } catch {
          // ignore
        }
        return undefined
      }

      // Buscar en todos los directorios candidatos de modelos
      for (const candDir of getCandidateModelsDirs()) {
        const byModelSubdir = path.resolve(candDir, options.model ?? "", options.file ?? "")
        if (existsSync(byModelSubdir)) {
          resolvedModelFile = byModelSubdir
          break
        }
        const byDirectFile = path.resolve(candDir, options.file ?? options.model ?? "")
        if (existsSync(byDirectFile)) {
          resolvedModelFile = byDirectFile
          break
        }
        const found = findGgufInDir(candDir)
        if (found) {
          resolvedModelFile = found
          break
        }
      }

      if (!resolvedModelFile || !existsSync(resolvedModelFile)) {
        currentStatus = "error"
        lastError = `El archivo del modelo no existe en disco: ${options.file || options.model}. Descárgalo primero desde el Models Hub.`
        return getStatus()
      }

      currentModelPath = resolvedModelFile
      currentModelName = path.basename(resolvedModelFile).replace(/\.gguf$/i, "")

      // 2. Asegurar binario (del build fijado, no el primero que aparezca en disco).
      //    catchCause, no catch: ensureBinary señala "no hay binario" como defecto, y Effect.catch
      //    sólo intercepta el canal de error -- dejaría caer todo el arranque.
      const execPath = yield* ensureBinary().pipe(Effect.catchCause(() => Effect.succeed(undefined)))
      if (!execPath) {
        currentStatus = "error"
        lastError = lastError || "No se pudo preparar el binario llama-server."
        return getStatus()
      }

      // 3. Argumentos optimizados para llama-server con auto-tuning según CPU/GPU
      const cpuThreads = Math.max(1, os.cpus().length - 1)
      const args = buildServerArgs({
        modelPath: resolvedModelFile,
        port: currentPort,
        gpuLayers: currentGpuLayers,
        contextSize: currentContextSize,
        threads: cpuThreads,
      })

      yield* Effect.logInfo("Iniciando Tiancode Local Engine (llama-server)", {
        executable: execPath,
        model: resolvedModelFile,
        port: currentPort,
        gpuLayers: currentGpuLayers,
      })

      const child = spawn(execPath, args, {
        cwd: path.dirname(execPath),
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true,
        detached: false,
      })

      currentProcess = child

      let exited = false
      let exitCode: number | null = null

      child.stderr?.on("data", (data) => {
        stderrRing = pushStderrChunk(stderrRing, String(data))
      })

      child.once("error", (err) => {
        exited = true
        stderrRing = pushStderrChunk(stderrRing, `spawn error: ${err.message}`)
      })

      child.once("exit", (code) => {
        exited = true
        exitCode = code
        if (currentStatus === "running" || currentStatus === "starting") {
          currentStatus = "stopped"
          currentProcess = undefined
        }
      })

      // 4. Sondeo de salud: esperar con paciencia mientras el modelo carga (503 "Loading model"),
      //    pero fallar de inmediato si el proceso muere.
      const startedAt = Date.now()
      let sawServer = false
      let foreignStatus: number | undefined
      let outcome: HealthWaitDecision = { kind: "wait" }

      while (outcome.kind === "wait") {
        yield* Effect.sleep(Duration.millis(HEALTH_POLL_INTERVAL_MS))
        const probe = yield* Effect.tryPromise(() => probeHealth(currentPort)).pipe(
          Effect.catch(() => Effect.succeed({ kind: "unreachable" } as HealthProbe)),
        )
        // Only llama-server saying "Loading model" buys the long budget. Anything else answering on
        // this port is somebody else's server and must not hold the start request open for 15min.
        if (probe.kind === "loading") sawServer = true
        if (probe.kind === "foreign") foreignStatus = probe.status
        outcome = decideHealthWait({
          elapsedMs: Date.now() - startedAt,
          sawServer,
          processExited: exited,
          last: probe,
        })
      }

      if (outcome.kind !== "ready") {
        currentStatus = "error"
        const detail = pickRelevantStderr(stderrRing)
        const elapsedSeconds = Math.round((Date.now() - startedAt) / 1000)
        const base =
          outcome.reason === "process-exited"
            ? `El proceso llama-server terminó durante el arranque (código ${exitCode ?? "desconocido"}).`
            : outcome.reason === "port-taken"
              ? `Otro proceso ya está escuchando en el puerto ${currentPort}: el motor de Tiancode terminó durante el arranque (código ${exitCode ?? "desconocido"}) y el servidor que responde no es suyo. Ciérralo o usa otro puerto.`
              : outcome.reason === "load-timeout"
                ? `El modelo sigue cargando tras ${elapsedSeconds}s y se agotó el tiempo de espera.`
                : foreignStatus !== undefined
                  ? `Algo responde en el puerto ${currentPort} con HTTP ${foreignStatus} pero no es llama-server; el motor no arrancó tras ${elapsedSeconds}s.`
                  : `El motor de inferencia no respondió en el puerto ${currentPort} tras ${elapsedSeconds}s.`
        const message = detail ? `${base} ${detail}` : base
        yield* Effect.logError("Tiancode Local Engine no pudo arrancar", {
          reason: outcome.reason,
          exitCode,
          stderr: stderrRing.slice(-10),
        })
        // stopEngine() clears lastError and currentStatus, so the diagnosis has to be reinstated
        // afterwards -- otherwise the caller gets an "error" with no error in it.
        yield* stopEngine()
        currentStatus = "error"
        lastError = message
        return getStatus()
      }

      currentStatus = "running"
      yield* Effect.logInfo("Tiancode Local Engine listo y en ejecución", { port: currentPort, model: currentModelName })
      return getStatus()
    })

    return Service.of({
      status: () => Effect.sync(getStatus),
      ensureBinary,
      start: startEngine,
      stop: stopEngine,
    })
  }),
)

export const node = makeGlobalNode({
  service: Service,
  layer,
  deps: [FSUtil.node, Global.node, httpClient],
})

export * as LocalEngine from "."
