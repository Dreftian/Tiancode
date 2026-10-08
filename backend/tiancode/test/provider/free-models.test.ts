import { describe, expect, test } from "bun:test"
import { Effect } from "effect"
import { Provider } from "../../src/provider/provider"

// Ajustes › Proveedores › Modelos gratuitos: OpenCode Zen's free models without a key.

function zen() {
  const model = (id: string, input: number, output: number) => ({ id, cost: { input, output, cache: { read: 0, write: 0 } } })
  return {
    id: "opencode",
    name: "OpenCode Zen",
    env: ["OPENCODE_API_KEY"],
    models: {
      "big-pickle": model("big-pickle", 0, 0),
      "fledge-alpha-free": model("fledge-alpha-free", 0, 0),
      "claude-sonnet-5-5": model("claude-sonnet-5-5", 3, 15),
      "half-free": model("half-free", 0, 2),
    },
  } as unknown as Provider.Info
}

function load(input: { config?: object; env?: Record<string, string>; auth?: boolean }) {
  const dep: Provider.CustomDep = {
    auth: () => Effect.succeed(input.auth ? ({ type: "api", key: "sk-zen" } as never) : undefined),
    config: () => Effect.succeed((input.config ?? {}) as never),
    env: () => Effect.succeed(input.env ?? {}),
    get: () => Effect.succeed(undefined),
    startLocalEngine: async () => undefined,
  }
  const info = zen()
  return Effect.runPromise(Provider.custom(dep)["opencode"]!(info)).then((result) => ({ result, info }))
}

describe("provider.opencode free models", () => {
  test("stays off until the switch is on", async () => {
    const { result, info } = await load({})
    expect(result.autoload).toBe(false)
    expect(result.options).toBeUndefined()
    expect(Object.keys(info.models)).toHaveLength(4)
  })

  test("offers only the models that cost nothing, through the public key", async () => {
    const { result, info } = await load({ config: { free_models: true } })
    expect(result.autoload).toBe(true)
    expect(result.options).toEqual({ apiKey: "public" })
    expect(Object.keys(info.models).toSorted()).toEqual(["big-pickle", "fledge-alpha-free"])
    expect(info.name).toBe("OpenCode Free")
  })

  test("a connected key keeps every model and its own credentials", async () => {
    for (const keyed of [{ auth: true }, { env: { OPENCODE_API_KEY: "sk-env" } }]) {
      const { result, info } = await load({ ...keyed, config: { free_models: true } })
      expect(result.autoload).toBe(false)
      expect(result.options).toBeUndefined()
      expect(Object.keys(info.models)).toHaveLength(4)
      expect(info.name).toBe("OpenCode Zen")
    }
  })
})
