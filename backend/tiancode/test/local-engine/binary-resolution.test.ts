import { describe, expect, test } from "bun:test"
import { Effect } from "effect"
import path from "node:path"
import {
  LLAMA_BUILD_MARKER_FILE,
  PINNED_LLAMA_BUILD,
  PINNED_LLAMA_RELEASE,
  type BinaryPorts,
  type BinaryResolution,
  type CopyBundledResult,
  type LlamaBuildMarker,
  resolveLlamaBinary,
} from "../../src/local-engine"

/**
 * The ORDER `resolveLlamaBinary` tries things in is the entire slice.
 *
 * Everything else in this module -- the build parse, the staleness decision, the health budget --
 * is downstream of one question: which `llama-server.exe` do we hand back? The code this replaced
 * answered "the first one I find", so on any machine that had ever run an older build the 2025
 * binary in a sibling cache directory beat the runtime shipped in the installer, and every message
 * came back "Cannot use tools with stream".
 *
 * That ordering was untestable while the filesystem was hard-wired into `ensureBinary`: reordering
 * the steps back to first-found-wins left all 44 pure-helper tests green. Hence `BinaryPorts`, and
 * hence the `trace` these tests assert on.
 */

const BIN_DIR = path.join("C:", "tiancode", "bin", "llama-server")
const BUNDLED_DIR = path.join("C:", "app", "resources", "llama-server")
const SIBLING_DIR = path.join("C:", "old", "cache", "llama-server")
const EXE = "llama-server.exe"
const MANAGED_EXE = path.join(BIN_DIR, EXE)

interface World {
  /** Absolute paths that exist. */
  readonly files: Set<string>
  /** Build each executable path reports from `--version`; absent means the probe failed. */
  readonly builds: Map<string, number>
  readonly markers: Map<string, LlamaBuildMarker>
  readonly written: { dir: string; marker: LlamaBuildMarker }[]
  readonly trace: string[]
}

function world(init: Partial<Pick<World, "files" | "builds" | "markers">> = {}): World {
  return {
    files: init.files ?? new Set<string>(),
    builds: init.builds ?? new Map<string, number>(),
    markers: init.markers ?? new Map<string, LlamaBuildMarker>(),
    written: [],
    trace: [],
  }
}

function ports(w: World, overrides: Partial<BinaryPorts> = {}): BinaryPorts {
  return {
    binDir: BIN_DIR,
    binaryPath: MANAGED_EXE,
    binaryExecutable: EXE,
    exists: (candidate) => w.files.has(candidate),
    probeBuild: (exe) => Effect.succeed(w.builds.get(exe)),
    readMarker: (dir) => w.markers.get(dir),
    writeMarker: (dir, marker) => {
      w.written.push({ dir, marker })
      w.markers.set(dir, marker)
      w.files.add(path.join(dir, LLAMA_BUILD_MARKER_FILE))
    },
    findBundled: () => undefined,
    copyBundled: () => ({ copied: 0, executableCopied: false }),
    siblingDirs: () => [BIN_DIR, SIBLING_DIR],
    download: () => Effect.succeed(undefined),
    onPath: () => Effect.succeed(undefined),
    now: () => "2026-09-13T00:00:00.000Z",
    trace: (step) => w.trace.push(step),
    ...overrides,
  }
}

/** A bundled directory whose copy lands the executable and produces `build` in the managed dir. */
function workingBundle(w: World, build: number): Partial<BinaryPorts> {
  return {
    findBundled: () => BUNDLED_DIR,
    copyBundled: (dir): CopyBundledResult => {
      expect(dir).toBe(BUNDLED_DIR)
      w.files.add(MANAGED_EXE)
      w.builds.set(MANAGED_EXE, build)
      return { copied: 12, executableCopied: true }
    },
  }
}

const run = (p: BinaryPorts) => Effect.runPromise(resolveLlamaBinary(p)) as Promise<BinaryResolution | undefined>

describe("resolveLlamaBinary: order of preference", () => {
  test("the bundled runtime beats a sibling cache dir that holds the very same build", () => {
    const w = world({
      files: new Set([path.join(SIBLING_DIR, EXE)]),
      builds: new Map([[path.join(SIBLING_DIR, EXE), PINNED_LLAMA_BUILD]]),
    })

    return run(ports(w, workingBundle(w, PINNED_LLAMA_BUILD))).then((resolved) => {
      expect(resolved).toMatchObject({ path: MANAGED_EXE, source: "bundled" })
      // and it never even looked at the sibling
      expect(w.trace).toEqual(["managed", "bundled"])
    })
  })

  test("a sibling cache dir is tried before the download, and PATH only after it", async () => {
    const onPathExe = path.join("C:", "tools", EXE)
    const w = world({
      files: new Set([path.join(SIBLING_DIR, EXE), onPathExe]),
      // The 2025-03-02 binary from the user's machine.
      builds: new Map([[path.join(SIBLING_DIR, EXE), 4800]]),
    })

    const resolved = await run(
      ports(w, {
        download: () => Effect.succeed(undefined),
        onPath: () => Effect.succeed(onPathExe),
      }),
    )

    expect(w.trace).toEqual(["managed", `sibling:${SIBLING_DIR}`, "download", "path"])
    expect(resolved).toMatchObject({ path: onPathExe, source: "path" })
  })

  test("an unversioned PATH binary never wins over a download that succeeds", async () => {
    const onPathExe = path.join("C:", "tools", EXE)
    const w = world({ files: new Set([onPathExe]) })

    const resolved = await run(
      ports(w, {
        download: () => {
          w.files.add(MANAGED_EXE)
          w.builds.set(MANAGED_EXE, PINNED_LLAMA_BUILD)
          return Effect.succeed(MANAGED_EXE)
        },
        onPath: () => Effect.succeed(onPathExe),
      }),
    )

    expect(resolved).toMatchObject({ path: MANAGED_EXE, source: "download", build: PINNED_LLAMA_BUILD })
    expect(w.trace).toEqual(["managed", "download"])
    expect(w.trace).not.toContain("path")
  })

  test("an explicit TIANCODE_LLAMA_SERVER override short-circuits everything", async () => {
    const chosen = path.join("D:", "mine", EXE)
    const w = world({ files: new Set([chosen, MANAGED_EXE]) })
    w.builds.set(MANAGED_EXE, PINNED_LLAMA_BUILD)

    const resolved = await run(ports(w, { override: chosen, ...workingBundle(w, PINNED_LLAMA_BUILD) }))
    expect(resolved).toMatchObject({ path: chosen, source: "override" })
    expect(w.trace).toEqual(["override"])
  })

  test("a managed dir already holding the pinned build is reused without provisioning anything", async () => {
    const w = world({
      files: new Set([MANAGED_EXE]),
      builds: new Map([[MANAGED_EXE, PINNED_LLAMA_BUILD]]),
      markers: new Map([[BIN_DIR, { release: PINNED_LLAMA_RELEASE, build: PINNED_LLAMA_BUILD }]]),
    })

    const resolved = await run(ports(w, workingBundle(w, PINNED_LLAMA_BUILD)))
    expect(resolved).toMatchObject({ path: MANAGED_EXE, source: "managed" })
    expect(w.trace).toEqual(["managed"])
    expect(w.written).toEqual([])
  })

  test("nothing anywhere resolves to nothing rather than to a guess", async () => {
    const w = world()
    expect(await run(ports(w))).toBeUndefined()
    expect(w.trace).toEqual(["managed", "download", "path"])
  })
})

describe("resolveLlamaBinary: a sibling dir must prove its build", () => {
  test("a marker file next to an unprobeable binary is not proof", async () => {
    const siblingExe = path.join(SIBLING_DIR, EXE)
    const w = world({
      files: new Set([siblingExe, path.join(SIBLING_DIR, LLAMA_BUILD_MARKER_FILE)]),
      // No entry in `builds`: the --version probe failed, exactly as it does for a binary whose
      // DLLs are missing.
      markers: new Map([[SIBLING_DIR, { release: PINNED_LLAMA_RELEASE, build: PINNED_LLAMA_BUILD }]]),
    })

    const resolved = await run(ports(w))
    expect(resolved).toBeUndefined()
    expect(w.trace).toEqual(["managed", `sibling:${SIBLING_DIR}`, "download", "path"])
  })

  test("a sibling that probes as the pinned build is used", async () => {
    const siblingExe = path.join(SIBLING_DIR, EXE)
    const w = world({
      files: new Set([siblingExe]),
      builds: new Map([[siblingExe, PINNED_LLAMA_BUILD]]),
    })

    expect(await run(ports(w))).toMatchObject({ path: siblingExe, source: "sibling" })
  })
})

describe("resolveLlamaBinary: provisioning has to actually happen", () => {
  /**
   * The reported defect. `copyBundled` swallows every per-file failure, and the success test was
   * `isBinaryPresent()` -- plain `existsSync` on the managed executable, which was ALREADY TRUE:
   * that binary is the stale one we just probed and rejected. On Windows, `copyFileSync` over a
   * running llama-server.exe fails with EBUSY/EPERM, so the DLLs land, the exe does not, and the
   * code wrote a marker claiming b10679 on top of the untouched 2025 binary and returned it.
   */
  test("a bundled copy that could not replace a locked executable is not reported as success", async () => {
    const w = world({
      files: new Set([MANAGED_EXE]),
      builds: new Map([[MANAGED_EXE, 4800]]),
    })

    const resolved = await run(
      ports(w, {
        findBundled: () => BUNDLED_DIR,
        copyBundled: () => ({
          copied: 11,
          executableCopied: false,
          failed: "EBUSY: resource busy or locked, copyfile 'llama-server.exe'",
        }),
      }),
    )

    // No marker was written, so the next start still sees a stale binary and tries again.
    expect(w.written).toEqual([])
    expect(w.markers.get(BIN_DIR)).toBeUndefined()
    // And the stale binary was not handed back as if it had been replaced.
    expect(resolved).toBeUndefined()
    expect(w.trace).toEqual(["managed", "bundled", "download", "path"])
  })

  test("a bundled copy that did land the executable stamps the build it MEASURED", async () => {
    const w = world({ files: new Set([MANAGED_EXE]), builds: new Map([[MANAGED_EXE, 4800]]) })

    const resolved = await run(ports(w, workingBundle(w, PINNED_LLAMA_BUILD)))

    expect(resolved).toMatchObject({ source: "bundled", build: PINNED_LLAMA_BUILD })
    expect(w.written).toEqual([
      {
        dir: BIN_DIR,
        marker: {
          release: PINNED_LLAMA_RELEASE,
          build: PINNED_LLAMA_BUILD,
          provisionedAt: "2026-09-13T00:00:00.000Z",
          source: "bundled",
        },
      },
    ])
  })

  /**
   * The loop. The marker used to be written as `bundledMarker?.build ?? PINNED_LLAMA_BUILD` --
   * asserted, never measured. If the bundle is not literally b10679, the next start probes it,
   * disagrees with the marker, decides "stale-build", and copies ~100 MB again. Every start,
   * forever. Two consecutive resolutions with the same world must provision at most once.
   */
  test("a bundle that is not the pinned build provisions once, then converges", async () => {
    const w = world({ files: new Set([MANAGED_EXE]), builds: new Map([[MANAGED_EXE, 4800]]) })
    let copies = 0
    const bundle: Partial<BinaryPorts> = {
      findBundled: () => BUNDLED_DIR,
      copyBundled: () => {
        copies++
        w.files.add(MANAGED_EXE)
        w.builds.set(MANAGED_EXE, 10681) // a hair newer than pinned, e.g. a hotfix bundle
        return { copied: 12, executableCopied: true }
      },
    }

    const first = await run(ports(w, bundle))
    expect(first).toMatchObject({ source: "bundled", build: 10681 })
    expect(copies).toBe(1)
    expect(w.markers.get(BIN_DIR)).toMatchObject({ release: PINNED_LLAMA_RELEASE, build: 10681 })

    const second = await run(ports(w, bundle))
    expect(second).toMatchObject({ source: "managed", build: 10681 })
    expect(copies).toBe(1)
    expect(w.trace.filter((step) => step === "bundled")).toHaveLength(1)
  })

  test("a download that does not report the pinned build also converges instead of looping", async () => {
    const w = world()
    let downloads = 0
    const download = () => {
      downloads++
      w.files.add(MANAGED_EXE)
      w.builds.set(MANAGED_EXE, 10681)
      return Effect.succeed(MANAGED_EXE)
    }

    expect(await run(ports(w, { download }))).toMatchObject({ source: "download", build: 10681 })
    expect(await run(ports(w, { download }))).toMatchObject({ source: "managed", build: 10681 })
    expect(downloads).toBe(1)
  })

  test("a directory that already converged is not re-copied on every single start", async () => {
    // Provisioning ran, landed the executable, and measured 4800 -- i.e. the bundle itself is that
    // old. Copying it again would produce the same bytes and the same number, so it is accepted
    // once with a warning instead of burning ~100 MB per engine start. The guard is deliberately
    // narrow: it needs a marker WE wrote after measuring, in the directory we own. A 4800 merely
    // found in a sibling cache dir or on PATH is still refused (see the ordering tests above).
    const w = world({
      files: new Set([MANAGED_EXE]),
      builds: new Map([[MANAGED_EXE, 4800]]),
      markers: new Map([[BIN_DIR, { release: PINNED_LLAMA_RELEASE, build: 4800, source: "bundled" }]]),
    })
    let copies = 0

    const resolved = await run(
      ports(w, {
        findBundled: () => BUNDLED_DIR,
        copyBundled: () => {
          copies++
          return { copied: 12, executableCopied: true }
        },
      }),
    )

    expect(resolved).toMatchObject({ source: "managed", build: 4800 })
    expect(copies).toBe(0)
    expect(w.trace).toEqual(["managed"])
  })

  test("a marker is only ever written into the directory Tiancode owns", async () => {
    const siblingExe = path.join(SIBLING_DIR, EXE)
    const w = world({ files: new Set([siblingExe]), builds: new Map([[siblingExe, PINNED_LLAMA_BUILD]]) })

    await run(ports(w))
    expect(w.written.map((entry) => entry.dir)).not.toContain(SIBLING_DIR)
  })
})
