import { describe, expect, test } from "bun:test"
import { createStore } from "solid-js/store"
import {
  availableModelProviders,
  forgetModelKeyVariants,
  pruneForgottenFromConfig,
  reconcileForgottenFromConfig,
  type ConfigProviders,
} from "./models-local"

describe("pruneForgottenFromConfig", () => {
  const providers = {
    local: {
      npm: "@ai-sdk/openai-compatible",
      options: { baseURL: "http://127.0.0.1:58282/v1" },
      models: {
        "qwen2.5-coder-7b": { name: "qwen2.5-coder-7b" },
        "qwen2.5-coder-7b.gguf": { name: "qwen2.5-coder-7b.gguf" },
        "llama-3.2-1b": { name: "llama-3.2-1b" },
      },
    },
    anthropic: { models: { "claude-sonnet-4": { name: "Claude Sonnet 4" } } },
  }

  test("drops every key the forget removed and leaves the survivors alone", () => {
    // This is the defect: without it the cached config kept the deleted model and
    // provider settings kept it after the toast said it was gone.
    const next = pruneForgottenFromConfig({
      providers,
      forgotten: {
        models: ["local/qwen2.5-coder-7b", "local/qwen2.5-coder-7b.gguf"],
        providers: [],
      },
      file: "qwen2.5-coder-7b.gguf",
    })

    expect(Object.keys(next["local"]?.models ?? {})).toEqual(["llama-3.2-1b"])
    expect(next["anthropic"]).toBe(providers.anthropic)
  })

  test("drops the local engine provider once its last model is gone", () => {
    const next = pruneForgottenFromConfig({
      providers: { local: { models: { "only-one": {} } } },
      forgotten: { models: ["local/only-one"], providers: [] },
      file: "only-one.gguf",
    })

    expect(next["local"]).toBeUndefined()
  })

  test("keeps a hand-configured provider that the removal emptied", () => {
    // Same rule the server applies: only the engine provider is disposable, the
    // rest keep their npm/options/apiKey even with no models left.
    const next = pruneForgottenFromConfig({
      providers: { ollama: { options: { baseURL: "http://localhost:11434/v1" }, models: { "only-one": {} } } },
      forgotten: { models: ["ollama/only-one"], providers: [] },
      file: "only-one.gguf",
    })

    expect(next["ollama"]).toEqual({ options: { baseURL: "http://localhost:11434/v1" }, models: {} })
  })

  test("honours a provider the server reported as removed outright", () => {
    const next = pruneForgottenFromConfig({
      providers,
      forgotten: { models: [], providers: ["local"] },
      file: "whatever.gguf",
    })

    expect(next["local"]).toBeUndefined()
    expect(next["anthropic"]).toBe(providers.anthropic)
  })

  test("splits a model reference on the first slash, so repo sub-paths survive it", () => {
    const next = pruneForgottenFromConfig({
      providers: { local: { models: { "sub/dir/model": {}, keep: {} } } },
      forgotten: { models: ["local/sub/dir/model"], providers: [] },
    })

    expect(Object.keys(next["local"]?.models ?? {})).toEqual(["keep"])
  })

  test("leaves an untouched config untouched", () => {
    const next = pruneForgottenFromConfig({
      providers,
      forgotten: { models: [], providers: [] },
      file: "not-installed.gguf",
    })

    expect(next).toEqual(providers)
  })
})

describe("forgetModelKeyVariants", () => {
  test("covers both keys activateDownloadedModel writes", () => {
    expect(forgetModelKeyVariants("model-q8_0.gguf").sort()).toEqual(["model-q8_0", "model-q8_0.gguf"].sort())
    expect(forgetModelKeyVariants("model-q8_0").sort()).toEqual(["model-q8_0", "model-q8_0.gguf"].sort())
  })
})

describe("validated model inventory", () => {
  test("does not resurrect a removed local file from an empty fallback provider", () => {
    expect(availableModelProviders([{ id: "local", models: {} }], [])).toEqual([])
    expect(availableModelProviders([{ id: "local", models: {} }], [{ id: "local", models: { removed: {} } }])).toEqual(
      [],
    )
  })

  test("shows validated GGUF files before the local engine is started", () => {
    const local = { id: "local", models: { "qwen.gguf": { name: "Qwen" } } }
    expect(availableModelProviders([local], [])).toEqual([local])
  })

  test("uses the refreshed local inventory and excludes disconnected engines", () => {
    const stale = { id: "local", models: { removed: {} } }
    const live = { id: "local", models: { survivor: {} } }
    expect(availableModelProviders([live, { id: "ollama", models: { offline: {} } }], [stale])).toEqual([live])
  })
})

describe("Solid store deletion regression", () => {
  test("removes the last provider instead of shallow-merging it back", () => {
    const [store, setStore] = createStore<{ provider: ConfigProviders }>({
      provider: {
        local: { models: { removed: {} } },
        anthropic: { options: { apiKey: "keep-existing-key" }, models: { claude: {} } },
      },
    })
    setStore(
      "provider",
      reconcileForgottenFromConfig({
        providers: store.provider,
        forgotten: { providers: ["local"], models: ["local/removed"] },
        file: "removed.gguf",
      }),
    )
    expect(Object.keys(store.provider)).toEqual(["anthropic"])
    expect(store.provider.anthropic?.options).toEqual({ apiKey: "keep-existing-key" })
  })

  test("removes one model while preserving the provider and unrelated settings", () => {
    const [store, setStore] = createStore<{ provider: ConfigProviders }>({
      provider: {
        local: { options: { baseURL: "http://127.0.0.1:58282/v1" }, models: { removed: {}, survivor: {} } },
      },
    })
    setStore(
      "provider",
      reconcileForgottenFromConfig({
        providers: store.provider,
        forgotten: { providers: [], models: ["local/removed"] },
        file: "removed.gguf",
      }),
    )
    expect(Object.keys(store.provider.local?.models ?? {})).toEqual(["survivor"])
    expect(store.provider.local?.options).toEqual({ baseURL: "http://127.0.0.1:58282/v1" })
  })
})
