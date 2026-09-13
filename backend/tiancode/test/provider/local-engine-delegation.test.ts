import { describe, expect, test } from "bun:test"
import { Effect } from "effect"
import { readFileSync } from "node:fs"
import path from "node:path"
import { Provider } from "../../src/provider/provider"

/**
 * Selecting a local GGUF model in the composer has to start the engine, and it has to start it
 * through `LocalEngine` — the one implementation that checks the binary's build number and passes
 * the flags llama.cpp needs for tool calling.
 *
 * Until 1.0.51 this file carried a second, independent copy of that bootstrap: ~180 lines that
 * took the first `llama-server.exe` found anywhere on disk with no version check. On a machine
 * with an old binary still in a sibling cache directory — the ordinary case after an upgrade —
 * that copy won, and every message came back "Cannot use tools with stream". The Models Hub
 * button drove the fixed path; chat drove the broken one.
 */
const PROVIDER_SOURCE = path.join(import.meta.dir, "..", "..", "src", "provider", "provider.ts")

function stubDep(overrides: Partial<Provider.CustomDep> = {}): {
  dep: Provider.CustomDep
  started: { model: string; file: string }[]
} {
  const started: { model: string; file: string }[] = []
  const dep: Provider.CustomDep = {
    auth: () => Effect.succeed(undefined),
    config: () => Effect.succeed({} as never),
    env: () => Effect.succeed({}),
    get: () => Effect.succeed(undefined),
    startLocalEngine: async (input) => {
      started.push(input)
      return undefined
    },
    ...overrides,
  }
  return { dep, started }
}

async function resolveLocalModel(dep: Provider.CustomDep, modelID: string) {
  const loader = Provider.custom(dep)["local"]!
  const result = await Effect.runPromise(loader({ id: "local" } as never))
  const sdk = { languageModel: (id: string) => ({ id }) }
  return result.getModel!(sdk, modelID)
}

describe("provider.local model loader", () => {
  test("starts the engine through LocalEngine when nothing is listening", async () => {
    const realFetch = globalThis.fetch
    globalThis.fetch = (async () => {
      throw new Error("ECONNREFUSED")
    }) as unknown as typeof fetch
    try {
      const { dep, started } = stubDep()
      const model = await resolveLocalModel(dep, "Llama-3.2-3B-Instruct-Q4_K_M")
      expect(started).toEqual([
        { model: "Llama-3.2-3B-Instruct-Q4_K_M", file: "Llama-3.2-3B-Instruct-Q4_K_M" },
      ])
      expect(model).toEqual({ id: "Llama-3.2-3B-Instruct-Q4_K_M" })
    } finally {
      globalThis.fetch = realFetch
    }
  })

  test("does not restart an engine that is already healthy", async () => {
    const realFetch = globalThis.fetch
    globalThis.fetch = (async () => new Response("ok", { status: 200 })) as unknown as typeof fetch
    try {
      const { dep, started } = stubDep()
      await resolveLocalModel(dep, "Llama-3.2-3B-Instruct-Q4_K_M")
      expect(started).toEqual([])
    } finally {
      globalThis.fetch = realFetch
    }
  })

  test("a failed start still resolves the model instead of throwing into the chat", async () => {
    const realFetch = globalThis.fetch
    globalThis.fetch = (async () => {
      throw new Error("ECONNREFUSED")
    }) as unknown as typeof fetch
    try {
      const { dep } = stubDep({
        startLocalEngine: async () => {
          throw new Error("no binary")
        },
      })
      // The user gets a connection error from the SDK, which names the port. Throwing here instead
      // would surface as an unhandled model-resolution failure with no provider context at all.
      expect(await resolveLocalModel(dep, "whatever")).toEqual({ id: "whatever" })
    } finally {
      globalThis.fetch = realFetch
    }
  })

  test("the provider can no longer spawn a server of its own", () => {
    // A guard, not a style check: the duplicate came back once already. If a future change needs a
    // process here, it belongs in LocalEngine, which is where the build check and `--jinja` live.
    const source = readFileSync(PROVIDER_SOURCE, "utf8")
    // Asserted on the import, not on a `spawn(` call site, so the message on failure is one line
    // instead of the whole 2,200-line file.
    expect(source.includes("node:child_process")).toBe(false)
    expect(/\bspawn\s*\(/.test(source)).toBe(false)
  })
})
