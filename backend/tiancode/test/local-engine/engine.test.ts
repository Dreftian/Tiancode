import { describe, expect, test } from "bun:test"
import {
  PINNED_LLAMA_BUILD,
  PINNED_LLAMA_RELEASE,
  HEALTH_CONNECT_BUDGET_MS,
  HEALTH_LOAD_BUDGET_MS,
  buildServerArgs,
  decideHealthWait,
  decideProvisioning,
  execOutput,
  interpretHealthResponse,
  llamaReleaseUrl,
  parseBuildMarker,
  parseLlamaBuild,
  pickRelevantStderr,
  pushStderrChunk,
  serializeBuildMarker,
} from "../../src/local-engine"

const baseArgs = {
  modelPath: "C:/models/Llama-3.2-3B-Instruct-Q4_K_M.gguf",
  port: 58282,
  gpuLayers: 99,
  contextSize: 8192,
  threads: 7,
}

describe("local-engine: argument construction", () => {
  // --jinja is belt-and-braces, NOT the repair for the reported bug. The pinned binary was run
  // directly: b10679 documents `--jinja, --no-jinja  whether to use jinja template engine for chat
  // (default: enabled)`, so tool calling already works on it without the flag. What broke local
  // chat was an old llama-server winning binary resolution; that is fixed by decideProvisioning /
  // resolveLlamaBinary. The flag stays so an older binary reaching us through the
  // TIANCODE_LLAMA_SERVER override or the PATH fallback still gets the right behaviour.
  test("passes --jinja so an older binary reached by the override or PATH still routes tools", () => {
    expect(buildServerArgs(baseArgs)).toContain("--jinja")
  })

  test("does not disable jinja", () => {
    expect(buildServerArgs(baseArgs)).not.toContain("--no-jinja")
  })

  test("keeps the model, port, gpu-layer, context and thread wiring intact", () => {
    const args = buildServerArgs(baseArgs)
    const valueAfter = (flag: string) => args[args.indexOf(flag) + 1]

    expect(valueAfter("-m")).toBe(baseArgs.modelPath)
    expect(valueAfter("--host")).toBe("127.0.0.1")
    expect(valueAfter("--port")).toBe("58282")
    expect(valueAfter("-ngl")).toBe("99")
    expect(valueAfter("-c")).toBe("8192")
    expect(valueAfter("-t")).toBe("7")
    expect(valueAfter("--parallel")).toBe("1")
  })

  test("every flag that takes a value actually has one", () => {
    const args = buildServerArgs(baseArgs)
    for (const flag of ["-m", "--host", "--port", "-ngl", "-c", "-t", "--parallel"]) {
      const index = args.indexOf(flag)
      expect(index).toBeGreaterThanOrEqual(0)
      expect(args[index + 1]).toBeDefined()
      expect(args[index + 1]?.startsWith("--")).toBe(false)
    }
  })
})

describe("local-engine: build identification", () => {
  // Captured verbatim from the binary the app pins and downloads (b10679).
  const PINNED_VERSION_OUTPUT = [
    "version: 0.3.0-dev (build 10679, commit 50f068fff)",
    "built with Clang 20.1.8 for Windows x86_64",
  ].join("\n")

  // Captured verbatim from the 2025-03-02 llama-server still sitting in the user's cache dir --
  // the one that answers "Cannot use tools with stream".
  const STALE_VERSION_OUTPUT = [
    "ggml_vulkan: Found 1 Vulkan devices:",
    "ggml_vulkan: 0 = NVIDIA GeForce RTX 3070 Ti (NVIDIA) | uma: 0 | fp16: 1 | warp size: 32",
    "version: 4800 (cc473cac)",
    "built with MSVC 19.43.34808.0 for x64",
  ].join("\n")

  test("reads the build number out of the current --version format", () => {
    expect(parseLlamaBuild(PINNED_VERSION_OUTPUT)).toBe(PINNED_LLAMA_BUILD)
  })

  test("reads the build number out of the legacy --version format", () => {
    expect(parseLlamaBuild(STALE_VERSION_OUTPUT)).toBe(4800)
  })

  test("the two real binaries are distinguishable", () => {
    expect(parseLlamaBuild(PINNED_VERSION_OUTPUT)).not.toBe(parseLlamaBuild(STALE_VERSION_OUTPUT))
  })

  test("returns undefined for output with no version line", () => {
    expect(parseLlamaBuild("ggml_vulkan: Found 1 Vulkan devices:")).toBeUndefined()
    expect(parseLlamaBuild("")).toBeUndefined()
    expect(parseLlamaBuild(undefined)).toBeUndefined()
  })

  test("the download URL tracks the pinned release", () => {
    expect(PINNED_LLAMA_RELEASE).toBe(`b${PINNED_LLAMA_BUILD}`)
    expect(llamaReleaseUrl()).toContain(PINNED_LLAMA_RELEASE)
    expect(llamaReleaseUrl()).toBe(
      `https://github.com/ggml-org/llama.cpp/releases/download/b10679/llama-b10679-bin-win-vulkan-x64.zip`,
    )
  })
})

describe("local-engine: provisioning marker", () => {
  test("round-trips a marker", () => {
    const marker = { release: PINNED_LLAMA_RELEASE, build: PINNED_LLAMA_BUILD, source: "download" as const }
    expect(parseBuildMarker(serializeBuildMarker(marker))).toMatchObject(marker)
  })

  test("treats unreadable or shapeless markers as absent", () => {
    expect(parseBuildMarker(undefined)).toBeUndefined()
    expect(parseBuildMarker("")).toBeUndefined()
    expect(parseBuildMarker("not json at all")).toBeUndefined()
    expect(parseBuildMarker("[]")).toBeUndefined()
    expect(parseBuildMarker('{"build":10679}')).toBeUndefined()
    expect(parseBuildMarker('{"release":""}')).toBeUndefined()
  })

  test("drops a bogus source instead of trusting it", () => {
    expect(parseBuildMarker('{"release":"b10679","source":"wherever"}')).toMatchObject({
      release: "b10679",
      source: undefined,
    })
  })
})

describe("local-engine: staleness decision", () => {
  test("a matching marker is reused", () => {
    expect(decideProvisioning({ hasBinary: true, marker: { release: PINNED_LLAMA_RELEASE } })).toEqual({
      kind: "reuse",
    })
  })

  test("a stale marker forces re-provisioning", () => {
    expect(decideProvisioning({ hasBinary: true, marker: { release: "b4800" } })).toEqual({
      kind: "provision",
      reason: "stale-marker",
      foundBuild: undefined,
    })
  })

  test("a missing marker forces re-provisioning when the binary cannot be probed", () => {
    expect(decideProvisioning({ hasBinary: true, marker: undefined })).toEqual({
      kind: "provision",
      reason: "missing-marker",
      foundBuild: undefined,
    })
  })

  test("no binary at all forces provisioning", () => {
    expect(decideProvisioning({ hasBinary: false, marker: { release: PINNED_LLAMA_RELEASE } })).toEqual({
      kind: "provision",
      reason: "missing-binary",
    })
  })

  // This is the exact situation on the user's machine: a llama-server.exe from 2025-03-02 sitting
  // in a cache directory. It used to be returned as-is, with no version check whatsoever, and it
  // answers every tool-carrying request with "Cannot use tools with stream".
  test("the 2025 binary in the cache dir is rejected as stale", () => {
    expect(decideProvisioning({ hasBinary: true, marker: undefined, probedBuild: 4800 })).toEqual({
      kind: "provision",
      reason: "stale-build",
      foundBuild: 4800,
    })
  })

  test("a probe of the binary outranks a marker that claims otherwise", () => {
    // Marker says it is the pinned release, the binary says it is build 4800. The binary wins.
    expect(
      decideProvisioning({ hasBinary: true, marker: { release: PINNED_LLAMA_RELEASE }, probedBuild: 4800 }),
    ).toEqual({ kind: "provision", reason: "stale-build", foundBuild: 4800 })
  })

  test("the pinned build with no marker is adopted rather than re-downloaded", () => {
    expect(decideProvisioning({ hasBinary: true, marker: undefined, probedBuild: PINNED_LLAMA_BUILD })).toEqual({
      kind: "adopt",
      build: PINNED_LLAMA_BUILD,
    })
  })

  test("the pinned build with a matching marker is reused without ceremony", () => {
    expect(
      decideProvisioning({
        hasBinary: true,
        marker: { release: PINNED_LLAMA_RELEASE },
        probedBuild: PINNED_LLAMA_BUILD,
      }),
    ).toEqual({ kind: "reuse" })
  })

  // The marker used to be written as `bundledMarker?.build ?? PINNED_LLAMA_BUILD` -- asserted, never
  // measured. If the bundled runtime is not literally b10679, every start probes it, disagrees with
  // the marker, decides "stale-build" and re-copies ~100 MB (or re-downloads the release zip). The
  // marker now records what provisioning MEASURED, and a marker that agrees with the probe means
  // provisioning already converged: doing it again would produce the same number.
  test("a build provisioning already measured and recorded is accepted, not re-provisioned forever", () => {
    expect(
      decideProvisioning({
        hasBinary: true,
        marker: { release: PINNED_LLAMA_RELEASE, build: 10680, source: "bundled" },
        probedBuild: 10680,
      }),
    ).toEqual({ kind: "accept", build: 10680 })
  })

  test("a marker that disagrees with the probe still forces re-provisioning", () => {
    // Not converged: the recorded number is not what the binary reports, so provisioning never ran
    // to completion here (or something replaced the binary underneath it).
    expect(
      decideProvisioning({
        hasBinary: true,
        marker: { release: PINNED_LLAMA_RELEASE, build: PINNED_LLAMA_BUILD, source: "bundled" },
        probedBuild: 4800,
      }),
    ).toEqual({ kind: "provision", reason: "stale-build", foundBuild: 4800 })
  })

  test("the convergence stop needs the marker to AGREE with the probe, not merely to exist", () => {
    // Marker says 4800, the binary says b10679. The probe still wins outright -- the marker's build
    // field can never downgrade a directory, only stop a provable loop.
    expect(
      decideProvisioning({
        hasBinary: true,
        marker: { release: PINNED_LLAMA_RELEASE, build: 4800, source: "bundled" },
        probedBuild: PINNED_LLAMA_BUILD,
      }),
    ).toEqual({ kind: "reuse" })
  })

  // A directory Tiancode did not provision is not entitled to be believed. `.tiancode-llama-build
  // .json` is an ordinary file: a hand-written one, or one left by another install channel, used to
  // be enough to hand back whatever binary happened to sit next to it when the --version probe
  // failed.
  test("an unowned directory must prove its build by probe, not by a marker file beside it", () => {
    expect(
      decideProvisioning({
        hasBinary: true,
        marker: { release: PINNED_LLAMA_RELEASE, build: PINNED_LLAMA_BUILD, source: "bundled" },
        probedBuild: undefined,
        managed: false,
      }),
    ).toEqual({ kind: "provision", reason: "unprobed", foundBuild: undefined })
  })

  test("an unowned directory that probes as the pinned build is still usable", () => {
    expect(
      decideProvisioning({ hasBinary: true, marker: undefined, probedBuild: PINNED_LLAMA_BUILD, managed: false }),
    ).toEqual({ kind: "adopt", build: PINNED_LLAMA_BUILD })
  })

  test("an unowned directory cannot buy the convergence stop with its own marker", () => {
    expect(
      decideProvisioning({
        hasBinary: true,
        marker: { release: PINNED_LLAMA_RELEASE, build: 4800, source: "bundled" },
        probedBuild: 4800,
        managed: false,
      }),
    ).toEqual({ kind: "provision", reason: "stale-build", foundBuild: 4800 })
  })
})

describe("local-engine: health probe semantics", () => {
  test("200 means the model is loaded", () => {
    expect(interpretHealthResponse(200, '{"status":"ok"}')).toEqual({ kind: "ready" })
  })

  test("503 means the process is alive and still loading", () => {
    // Verbatim from the pinned build.
    const body = '{"error":{"code":503,"message":"Loading model","type":"unavailable_error"}}'
    expect(interpretHealthResponse(503, body)).toMatchObject({ kind: "loading" })
  })

  test("404 counts as up: an ancient build has no /health route but is still serving", () => {
    expect(interpretHealthResponse(404)).toEqual({ kind: "ready" })
  })

  // The bug: every non-2xx answer was read as "loading", which unlocks HEALTH_LOAD_BUDGET_MS
  // (15 minutes). Anything at all squatting on 58282 -- an auth proxy, a dev server, a stale
  // service -- therefore held POST /models/engine/start open for the full budget, and the frontend
  // awaits that call with no timeout and no cancel. Only a body that actually says the model is
  // loading may earn it.
  test("an auth proxy answering 401 is not a loading model", () => {
    expect(interpretHealthResponse(401, "Unauthorized")).toMatchObject({ kind: "foreign", status: 401 })
  })

  test("an unrelated 500 is not a loading model", () => {
    expect(interpretHealthResponse(500, "<html>Internal Server Error</html>")).toMatchObject({
      kind: "foreign",
      status: 500,
    })
  })

  test("a 503 from something that is not llama-server does not earn the loading budget either", () => {
    expect(interpretHealthResponse(503, "<html>503 Service Temporarily Unavailable</html>")).toMatchObject({
      kind: "foreign",
      status: 503,
    })
    expect(interpretHealthResponse(503)).toMatchObject({ kind: "foreign", status: 503 })
  })

  test("a foreign answer keeps the detail so the user can be told what replied", () => {
    expect(interpretHealthResponse(401, "Unauthorized")).toMatchObject({ detail: "Unauthorized" })
  })
})

describe("local-engine: health wait budget", () => {
  const waiting = { sawServer: true, processExited: false, last: { kind: "loading" } as const }

  // The old loop was 60 attempts x 500ms = 30s flat, so a large model on a cold GPU was reported as
  // "El motor de inferencia no respondió" while it was still loading perfectly normally.
  test("a model still loading at 30s keeps waiting instead of failing", () => {
    expect(decideHealthWait({ ...waiting, elapsedMs: 30_000 })).toEqual({ kind: "wait" })
  })

  test("a model still loading well past the old ceiling keeps waiting", () => {
    expect(decideHealthWait({ ...waiting, elapsedMs: 120_000 })).toEqual({ kind: "wait" })
  })

  test("a load that never finishes eventually times out", () => {
    expect(decideHealthWait({ ...waiting, elapsedMs: HEALTH_LOAD_BUDGET_MS })).toEqual({
      kind: "fail",
      reason: "load-timeout",
    })
  })

  test("ready wins immediately", () => {
    expect(decideHealthWait({ ...waiting, elapsedMs: 10, last: { kind: "ready" } })).toEqual({ kind: "ready" })
  })

  // A dead process must not hold the UI hostage for the whole extended loading budget.
  test("a process that exited fails fast rather than burning the loading budget", () => {
    expect(
      decideHealthWait({ elapsedMs: 1_000, sawServer: true, processExited: true, last: { kind: "loading" } }),
    ).toEqual({ kind: "fail", reason: "process-exited" })
  })

  test("a process that exited before ever answering also fails fast", () => {
    expect(
      decideHealthWait({ elapsedMs: 600, sawServer: false, processExited: true, last: { kind: "unreachable" } }),
    ).toEqual({ kind: "fail", reason: "process-exited" })
  })

  // THE ORDERING. `ready` used to be tested before `processExited`, and the pair is reachable
  // together: a leftover llama-server squatting on 58282 keeps answering 200 while OUR child exits
  // with "address already in use". Answering "ready" there adopted that stranger as our engine --
  // status went "running" with currentProcess already cleared by the exit handler, so stop() was a
  // no-op and every chat went to the stale server, which is the exact binary this module exists to
  // refuse. A healthy port whose child died is not our engine.
  test("a healthy port whose child already died is somebody else's server, not ours", () => {
    expect(
      decideHealthWait({ elapsedMs: 700, sawServer: false, processExited: true, last: { kind: "ready" } }),
    ).toEqual({ kind: "fail", reason: "port-taken" })
  })

  test("the exit check outranks readiness at every elapsed time and budget", () => {
    for (const elapsedMs of [0, 500, 30_000, HEALTH_CONNECT_BUDGET_MS, HEALTH_LOAD_BUDGET_MS]) {
      for (const sawServer of [false, true]) {
        expect(
          decideHealthWait({ elapsedMs, sawServer, processExited: true, last: { kind: "ready" } }),
        ).toEqual({ kind: "fail", reason: "port-taken" })
      }
    }
  })

  test("a live child answering 200 is still ready", () => {
    expect(
      decideHealthWait({ elapsedMs: 700, sawServer: false, processExited: false, last: { kind: "ready" } }),
    ).toEqual({ kind: "ready" })
  })

  // A foreign responder never sets sawServer in the caller, so it lands here on the SHORT budget.
  test("a foreign responder is held to the connect budget, not the loading budget", () => {
    const foreign = { sawServer: false, processExited: false, last: { kind: "foreign", status: 401 } as const }
    expect(decideHealthWait({ ...foreign, elapsedMs: HEALTH_CONNECT_BUDGET_MS - 1 })).toEqual({ kind: "wait" })
    expect(decideHealthWait({ ...foreign, elapsedMs: HEALTH_CONNECT_BUDGET_MS })).toEqual({
      kind: "fail",
      reason: "never-answered",
    })
    // and it gives up long before the 15-minute loading budget the old code handed it
    expect(HEALTH_CONNECT_BUDGET_MS).toBeLessThan(HEALTH_LOAD_BUDGET_MS)
  })

  test("a server that never answers fails on the shorter connect budget", () => {
    const silent = { sawServer: false, processExited: false, last: { kind: "unreachable" } as const }
    expect(decideHealthWait({ ...silent, elapsedMs: HEALTH_CONNECT_BUDGET_MS - 1 })).toEqual({ kind: "wait" })
    expect(decideHealthWait({ ...silent, elapsedMs: HEALTH_CONNECT_BUDGET_MS })).toEqual({
      kind: "fail",
      reason: "never-answered",
    })
  })

  test("the loading budget is more generous than the connect budget", () => {
    expect(HEALTH_LOAD_BUDGET_MS).toBeGreaterThan(HEALTH_CONNECT_BUDGET_MS)
    // and both are meaningfully longer than the 30s the old probe allowed
    expect(HEALTH_CONNECT_BUDGET_MS).toBeGreaterThan(30_000)
  })
})

describe("local-engine: stderr capture", () => {
  test("splits chunks into trimmed lines and drops blanks", () => {
    expect(pushStderrChunk([], "one\r\n\n  two  \n")).toEqual(["one", "two"])
  })

  test("keeps the ring bounded, dropping the oldest lines", () => {
    let ring: string[] = []
    for (let i = 0; i < 200; i++) ring = pushStderrChunk(ring, `line ${i}`, 10)
    expect(ring).toHaveLength(10)
    expect(ring[0]).toBe("line 190")
    expect(ring.at(-1)).toBe("line 199")
  })

  test("does not mutate the ring it is given", () => {
    const ring = ["first"]
    const next = pushStderrChunk(ring, "second")
    expect(ring).toEqual(["first"])
    expect(next).toEqual(["first", "second"])
  })

  // The bug: lastError was overwritten by ANY line containing "error" or "failed", so the message
  // the user finally saw was whichever noisy line happened to arrive last.
  test("prefers the named cause over later generic noise", () => {
    let ring: string[] = []
    ring = pushStderrChunk(ring, "llama_model_load: error loading model: unable to allocate backend buffer")
    ring = pushStderrChunk(ring, "srv  log_server_r: request: GET /health 127.0.0.1 503")
    ring = pushStderrChunk(ring, "common_init_from_params: failed to create context with model")

    expect(pickRelevantStderr(ring)).toBe(
      "llama_model_load: error loading model: unable to allocate backend buffer",
    )
  })

  test("falls back to a generic error line when nothing names a cause", () => {
    const ring = pushStderrChunk(pushStderrChunk([], "loading model"), "something failed somewhere")
    expect(pickRelevantStderr(ring)).toBe("something failed somewhere")
  })

  test("returns undefined when stderr carries no failure at all", () => {
    let ring: string[] = []
    ring = pushStderrChunk(ring, "ggml_vulkan: Found 1 Vulkan devices:")
    ring = pushStderrChunk(ring, "llama_model_loader: loaded meta data with 30 key-value pairs")
    expect(pickRelevantStderr(ring)).toBeUndefined()
  })

  // Real stderr, captured verbatim from the pinned b10679 binary started against a missing model.
  test("picks a specific, actionable line out of real llama-server output", () => {
    const captured = [
      "0.00.131.471 E gguf_init_from_file: failed to open GGUF file 'C:/models/llama.gguf' (No such file or directory)",
      "0.00.134.694 E llama_model_load: error loading model: llama_model_loader: failed to load model",
      "0.00.136.918 E common_fit_params: encountered an error while trying to fit params to free device memory",
      "0.00.137.044 E cmn  common_init_: failed to load model 'C:/models/llama.gguf'",
    ].join("\n")

    const picked = pickRelevantStderr(pushStderrChunk([], captured))
    expect(picked).toBeDefined()
    // Not the vague "encountered an error" middle line -- something naming the actual model file.
    expect(picked).toContain("C:/models/llama.gguf")
  })

  test("surfaces a port clash over unrelated chatter", () => {
    let ring: string[] = []
    ring = pushStderrChunk(ring, "main: server is listening")
    ring = pushStderrChunk(ring, "error: failed to bind: address already in use")
    ring = pushStderrChunk(ring, "srv    operator(): operator() failed")
    expect(pickRelevantStderr(ring)).toBe("error: failed to bind: address already in use")
  })
})

describe("local-engine: output of a failed subprocess", () => {
  // The version banner llama.cpp prints before exiting non-zero. `probeBuild`'s recovery path
  // depends entirely on getting it back out of the rejection.
  const banner = "version: 4800 (cc473cac)\nbuilt with MSVC 19.43.34808.0 for x64"

  test("reads stdout/stderr straight off a Node execFile rejection", () => {
    const err = Object.assign(new Error("Command failed"), { stdout: "", stderr: banner })
    expect(parseLlamaBuild(execOutput(err))).toBe(4800)
  })

  // The bug: `Effect.tryPromise` with a bare thunk does NOT hand the catch handler the Node error.
  // It wraps it in `Cause.UnknownError`, whose only own fields are `message` and `cause`. Reading
  // `err.stdout` off that wrapper always found `undefined`, so the whole non-zero-exit recovery was
  // dead code that its comment described as working.
  test("reaches through the Effect.tryPromise wrapper to the original rejection", () => {
    const node = Object.assign(new Error("Command failed"), { stdout: "", stderr: banner })
    const wrapped = Object.assign(new Error("An error occurred in Effect.tryPromise"), { cause: node })

    // What the old code did, spelled out: the wrapper has no stdout/stderr of its own.
    expect((wrapped as { stdout?: string }).stdout).toBeUndefined()
    expect((wrapped as { stderr?: string }).stderr).toBeUndefined()

    expect(parseLlamaBuild(execOutput(wrapped))).toBe(4800)
  })

  test("returns empty rather than throwing on anything unrecognisable", () => {
    expect(execOutput(undefined)).toBe("")
    expect(execOutput(null)).toBe("")
    expect(execOutput("just a string")).toBe("")
    expect(execOutput(new Error("no output attached"))).toBe("")
  })

  test("survives a cause cycle instead of spinning", () => {
    const a: { cause?: unknown } = {}
    const b: { cause?: unknown } = { cause: a }
    a.cause = b
    expect(execOutput(a)).toBe("")
  })
})
