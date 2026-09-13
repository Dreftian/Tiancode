import { test, expect } from "bun:test"
import { readFileSync, writeFileSync } from "node:fs"
import path from "node:path"
import { mergeDeep } from "remeda"
import { Effect, Layer } from "effect"
import { LayerNode } from "@tiancode-ai/core/effect/layer-node"
import { httpClient } from "@tiancode-ai/core/effect/app-node-platform"
import { HttpClient } from "effect/unstable/http"
import { FSUtil } from "@tiancode-ai/core/fs-util"
import { Npm } from "@tiancode-ai/core/npm"
import { CrossSpawnSpawner } from "@tiancode-ai/core/cross-spawn-spawner"
import { Config } from "@/config/config"
import { Auth } from "../../src/auth"
import { Account } from "../../src/account/account"
import { Env } from "../../src/env"
import { AuthTest } from "../fake/auth"
import { AccountTest } from "../fake/account"
import { NpmTest } from "../fake/npm"
import { provideTmpdirInstance, testInstanceStoreLayer } from "../fixture/fixture"

// Deleting Llama-3.2-3B-Instruct-Q4_K_M from disk left it in Proveedores and Modelos.
// The UI tried to prune it by sending config.update() a `models` object with the key
// left out — but update()/updateGlobal() are mergeDeep(base, patch), and a deep merge
// can add and overwrite, never delete. Omitting a key is a no-op by construction, so
// the prune "looked right" and did nothing. Removal needs its own path.

// The user's global config exactly as it was after they deleted the .gguf, with
// comments and an unknown key added to prove the surgery is text-level, not a reparse.
const USER_CONFIG = `{
  // Anclado a mano: no lo toques.
  "$schema": "https://opencode.ai/config.json",
  "disabled_providers": ["lmstudio", "google"],
  "provider": {
    "unorouter-free": {
      "name": "UnoRouter",
      "npm": "@ai-sdk/openai-compatible",
      "options": {
        "baseURL": "https://api.unorouter.com/v1",
        "apiKey": "{env:UNOROUTER_KEY}"
      },
      "models": {
        /* gratis mientras dure */
        "glm-5.3-flash-think-search:free": { "name": "GLM-5.3 Flash Think (Free)" }
      }
    },
    "local": {
      "npm": "@ai-sdk/openai-compatible",
      "options": {
        "baseURL": "http://127.0.0.1:58282/v1"
      },
      "models": {
        "Llama-3.2-3B-Instruct-Q4_K_M": { "name": "Llama-3.2-3B-Instruct-Q4_K_M" },
        "Llama-3.2-3B-Instruct-Q4_K_M.gguf": { "name": "Llama-3.2-3B-Instruct-Q4_K_M.gguf" }
      }
    }
  },
  "model": "local/Llama-3.2-3B-Instruct-Q4_K_M",
  "algunaClaveDeOtraHerramienta": { "conservar": true }
}
`

const GGUF = "Llama-3.2-3B-Instruct-Q4_K_M.gguf"

const parse = (text: string) => JSON.parse(text.replace(/^\s*\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, ""))

test("forgetModelInText removes both model keys the UI wrote, with and without .gguf", () => {
  const result = Config.forgetModelInText(USER_CONFIG, { file: GGUF })

  expect(result.changed).toBe(true)
  expect(result.models.sort()).toEqual([
    "local/Llama-3.2-3B-Instruct-Q4_K_M",
    "local/Llama-3.2-3B-Instruct-Q4_K_M.gguf",
  ])
  expect(result.text).not.toContain("Llama-3.2-3B-Instruct-Q4_K_M")

  const after = parse(result.text)
  expect(after.provider.local).toBeUndefined()
})

test("forgetModelInText drops the local engine provider once it has no models left", () => {
  const result = Config.forgetModelInText(USER_CONFIG, { file: GGUF })
  expect(result.providers).toEqual(["local"])
  expect(parse(result.text).provider).not.toHaveProperty("local")
})

test("forgetModelInText clears a default model pointing at the removed entry", () => {
  const result = Config.forgetModelInText(USER_CONFIG, { file: GGUF })

  expect(result.clearedDefaultModel).toBe(true)
  // Left behind, every new session defaults to a model that cannot load. Removing the
  // key lets the normal fallback choose instead.
  expect(parse(result.text)).not.toHaveProperty("model")
})

test("forgetModelInText clears small_model too when it pointed at the removed entry", () => {
  const withSmall = USER_CONFIG.replace(
    `"model": "local/Llama-3.2-3B-Instruct-Q4_K_M",`,
    `"model": "local/Llama-3.2-3B-Instruct-Q4_K_M",\n  "small_model": "local/Llama-3.2-3B-Instruct-Q4_K_M.gguf",`,
  )
  const result = Config.forgetModelInText(withSmall, { file: GGUF })

  expect(result.clearedSmallModel).toBe(true)
  expect(parse(result.text)).not.toHaveProperty("small_model")
})

test("forgetModelInText leaves every unrelated key, placeholder and comment as written", () => {
  const result = Config.forgetModelInText(USER_CONFIG, { file: GGUF })

  // Comments survive because the edit is applied to the file as written, not to a reparse.
  expect(result.text).toContain("// Anclado a mano: no lo toques.")
  expect(result.text).toContain("/* gratis mientras dure */")
  // A resolved secret must never be written back in place of its placeholder.
  expect(result.text).toContain("{env:UNOROUTER_KEY}")

  const after = parse(result.text)
  expect(after.$schema).toBe("https://opencode.ai/config.json")
  expect(after.disabled_providers).toEqual(["lmstudio", "google"])
  expect(after.algunaClaveDeOtraHerramienta).toEqual({ conservar: true })
  expect(after.provider["unorouter-free"].models).toEqual({
    "glm-5.3-flash-think-search:free": { name: "GLM-5.3 Flash Think (Free)" },
  })
})

test("a merge-based update could NOT have removed the key — this is why the old prune did nothing", () => {
  const base = parse(USER_CONFIG)
  // Exactly what the UI used to send: the same providers object with the model key
  // dropped from `provider.local.models`.
  const patch = {
    provider: {
      ...base.provider,
      local: { ...base.provider.local, models: {} },
    },
  }

  const merged = mergeDeep(base, patch) as typeof base
  // Both keys are still there: mergeDeep only adds and overwrites.
  expect(Object.keys(merged.provider.local.models).sort()).toEqual([
    "Llama-3.2-3B-Instruct-Q4_K_M",
    "Llama-3.2-3B-Instruct-Q4_K_M.gguf",
  ])
  expect(merged.model).toBe("local/Llama-3.2-3B-Instruct-Q4_K_M")

  // The removal path does what the merge cannot.
  const forgotten = parse(Config.forgetModelInText(USER_CONFIG, { file: GGUF }).text)
  expect(forgotten.provider).not.toHaveProperty("local")
  expect(forgotten).not.toHaveProperty("model")
})

test("forgetModelInText keeps a user-configured provider entry even when it ends up empty", () => {
  const text = JSON.stringify(
    {
      provider: {
        myrouter: {
          npm: "@ai-sdk/openai-compatible",
          options: { apiKey: "{env:MY_KEY}" },
          models: { "Llama-3.2-3B-Instruct-Q4_K_M": { name: "x" } },
        },
      },
    },
    null,
    2,
  )

  const result = Config.forgetModelInText(text, { file: GGUF })
  const after = JSON.parse(result.text)

  expect(result.models).toEqual(["myrouter/Llama-3.2-3B-Instruct-Q4_K_M"])
  expect(result.providers).toEqual([])
  // Only the disposable engine provider is dropped. A provider the user set up by hand
  // keeps its npm/options/apiKey so re-adding a model does not mean re-entering a key.
  expect(after.provider.myrouter.options).toEqual({ apiKey: "{env:MY_KEY}" })
})

test("forgetModelInText leaves a default model that points somewhere else alone", () => {
  const text = USER_CONFIG.replace(
    `"model": "local/Llama-3.2-3B-Instruct-Q4_K_M",`,
    `"model": "unorouter-free/glm-5.3-flash-think-search:free",`,
  )
  const result = Config.forgetModelInText(text, { file: GGUF })

  expect(result.clearedDefaultModel).toBe(false)
  expect(parse(result.text).model).toBe("unorouter-free/glm-5.3-flash-think-search:free")
})

test("forgetModelInText is a no-op on a config that does not mention the model", () => {
  const text = `{ "model": "anthropic/claude", "provider": { "local": { "models": { "other": {} } } } }`
  const result = Config.forgetModelInText(text, { file: GGUF })

  expect(result.changed).toBe(false)
  expect(result.text).toBe(text)
})

test("forgetModelInText refuses to rewrite a config it cannot parse", () => {
  const broken = `{ "provider": { "local": { "models": {`
  const result = Config.forgetModelInText(broken, { file: GGUF })

  expect(result.changed).toBe(false)
  expect(result.text).toBe(broken)
})

// --- service level -----------------------------------------------------------

const layer = LayerNode.compile(LayerNode.group([Config.node, FSUtil.node, Env.node, CrossSpawnSpawner.node]), [
  [Auth.node, AuthTest.empty],
  [Account.node, AccountTest.empty],
  [Npm.node, NpmTest.noop],
  [httpClient, Layer.succeed(HttpClient.HttpClient, HttpClient.make(() => Effect.die("no http in this test")))],
])

const run = <A, E>(self: (dir: string) => Effect.Effect<A, E, Config.Service>) =>
  provideTmpdirInstance((dir) => Config.Service.use(() => self(dir)), { git: true }).pipe(
    Effect.scoped,
    Effect.provide(Layer.mergeAll(layer, testInstanceStoreLayer)),
    Effect.runPromise,
  )

// forgetProviderModel() also visits the real global config file. A model name nothing
// else can match keeps this test from touching the developer's own config: a document
// with no match is never rewritten.
const UNIQUE = "tiancode-test-forget-4f1c9a2e"

test("forgetProviderModel removes the entry from the project config file on disk", async () => {
  await run((dir) =>
    Effect.gen(function* () {
      const file = path.join(dir, "tiancode.jsonc")
      writeFileSync(
        file,
        `{
  // no me borres
  "username": "keep",
  "provider": {
    "local": {
      "npm": "@ai-sdk/openai-compatible",
      "models": {
        "${UNIQUE}": { "name": "${UNIQUE}" },
        "${UNIQUE}.gguf": { "name": "${UNIQUE}.gguf" }
      }
    }
  },
  "model": "local/${UNIQUE}"
}
`,
      )

      const svc = yield* Config.Service
      const result = yield* svc.forgetProviderModel({ file: `${UNIQUE}.gguf` })

      const after = readFileSync(file, "utf8")
      expect(after).not.toContain(UNIQUE)
      expect(after).toContain("// no me borres")
      expect(JSON.parse(after.replace(/^\s*\/\/.*$/gm, "")).username).toBe("keep")

      expect(result.files).toContain(file)
      expect(result.models.sort()).toEqual([`local/${UNIQUE}`, `local/${UNIQUE}.gguf`])
      expect(result.providers).toEqual(["local"])
      expect(result.clearedDefaultModel).toBe(true)
    }),
  )
})

test("forgetProviderModel reports nothing and writes nothing when there is no match", async () => {
  await run((dir) =>
    Effect.gen(function* () {
      const file = path.join(dir, "tiancode.json")
      const before = JSON.stringify({ username: "keep", provider: { local: { models: { other: {} } } } }, null, 2)
      writeFileSync(file, before)

      const svc = yield* Config.Service
      const result = yield* svc.forgetProviderModel({ file: `${UNIQUE}.gguf` })

      expect(readFileSync(file, "utf8")).toBe(before)
      expect(result.files).toEqual([])
      expect(result.models).toEqual([])
    }),
  )
})
