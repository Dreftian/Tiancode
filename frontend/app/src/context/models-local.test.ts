import { describe, expect, test } from "bun:test"
import { forgetModelKeyVariants, mergeConfigLocalModels, pruneForgottenFromConfig } from "./models-local"

const localProvider = (models: Record<string, unknown>) => ({
  id: "local",
  name: "Tiancode Native / GGUF",
  source: "custom" as const,
  env: [] as string[],
  options: { baseURL: "http://127.0.0.1:58282/v1" },
  models,
})

const fallback = localProvider({})

describe("mergeConfigLocalModels", () => {
  test("shows a freshly activated model before the provider catalogue has it", () => {
    // The window this merge exists for: activate wrote the config, the provider
    // refetch has not landed, and the catalogue has no local provider at all.
    const merged = mergeConfigLocalModels(undefined, { "qwen2.5-coder-7b": { name: "qwen2.5-coder-7b" } }, fallback)

    expect(merged?.models).toEqual({
      "qwen2.5-coder-7b": { id: "qwen2.5-coder-7b", name: "qwen2.5-coder-7b", status: "active" },
    })
  })

  test("keeps the catalogue entry for a model both sides know", () => {
    const catalogue = localProvider({ "qwen2.5-coder-7b": { id: "qwen2.5-coder-7b", name: "Qwen 2.5 Coder 7B" } })

    const merged = mergeConfigLocalModels(catalogue, { "qwen2.5-coder-7b": { name: "qwen2.5-coder-7b" } }, fallback)

    // The catalogue checked the file is on disk and carries the real metadata.
    expect(merged?.models).toEqual({ "qwen2.5-coder-7b": { id: "qwen2.5-coder-7b", name: "Qwen 2.5 Coder 7B" } })
  })

  test("does not list the same file twice when the two sides disagree about .gguf", () => {
    const catalogue = localProvider({ "qwen2.5-coder-7b.gguf": { id: "qwen2.5-coder-7b", name: "Qwen" } })

    const merged = mergeConfigLocalModels(catalogue, { "qwen2.5-coder-7b": { name: "qwen2.5-coder-7b" } }, fallback)

    expect(Object.keys(merged?.models ?? {})).toEqual(["qwen2.5-coder-7b.gguf"])
  })

  test("invents no local provider when the config declares no local models", () => {
    expect(mergeConfigLocalModels(undefined, {}, fallback)).toBeUndefined()
    expect(mergeConfigLocalModels(undefined, undefined, fallback)).toBeUndefined()
  })
})

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
    // mergeConfigLocalModels put it straight back into "Modelos" for the rest of
    // the session, while the toast said it was gone from Providers and Models.
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
