import { useServerSync } from "@/context/server-sync"
import { decode64 } from "@/utils/base64"
import { useParams } from "@solidjs/router"
import type { Provider } from "@tiancode-ai/sdk/v2"
import { Iterable, pipe } from "effect"
import { createEffect, createMemo, type Accessor } from "solid-js"
import { selectProviderCatalog } from "./provider-catalog"

export const popularProviders = [
  "tiancode",
  "tiancode-go",
  "local",
  "ollama",
  "lmstudio",
  "anthropic",
  "github-copilot",
  "openai",
  "google",
  "deepseek",
  "openrouter",
  "groq",
  "xai",
  "mistral",
  "vercel",
]
const popularProviderSet = new Set(popularProviders)

const DEFAULT_FALLBACK_PROVIDERS: Record<string, Provider> = {
  openai: {
    id: "openai",
    name: "OpenAI",
    source: "custom",
    env: ["OPENAI_API_KEY"],
    options: {},
    models: {},
  },
  anthropic: {
    id: "anthropic",
    name: "Anthropic",
    source: "custom",
    env: ["ANTHROPIC_API_KEY"],
    options: {},
    models: {},
  },
  google: {
    id: "google",
    name: "Google Gemini",
    source: "custom",
    env: ["GEMINI_API_KEY"],
    options: {},
    models: {},
  },
  deepseek: {
    id: "deepseek",
    name: "DeepSeek",
    source: "custom",
    env: ["DEEPSEEK_API_KEY"],
    options: {},
    models: {},
  },
  local: {
    id: "local",
    name: "Tiancode Native / GGUF",
    source: "custom",
    env: [],
    options: { baseURL: "http://localhost:58282/v1" },
    models: {},
  },
  ollama: {
    id: "ollama",
    name: "Ollama",
    source: "custom",
    env: [],
    options: { baseURL: "http://localhost:11434/v1" },
    models: {},
  },
  lmstudio: {
    id: "lmstudio",
    name: "LM Studio",
    source: "custom",
    env: [],
    options: { baseURL: "http://localhost:1234/v1" },
    models: {},
  },
  openrouter: {
    id: "openrouter",
    name: "OpenRouter",
    source: "custom",
    env: ["OPENROUTER_API_KEY"],
    options: {},
    models: {},
  },
  groq: {
    id: "groq",
    name: "Groq",
    source: "custom",
    env: ["GROQ_API_KEY"],
    options: {},
    models: {},
  },
  xai: {
    id: "xai",
    name: "xAI (Grok)",
    source: "custom",
    env: ["XAI_API_KEY"],
    options: {},
    models: {},
  },
  mistral: {
    id: "mistral",
    name: "Mistral AI",
    source: "custom",
    env: ["MISTRAL_API_KEY"],
    options: {},
    models: {},
  },
  "github-copilot": {
    id: "github-copilot",
    name: "GitHub Copilot",
    source: "custom",
    env: [],
    options: {},
    models: {},
  },
  vercel: {
    id: "vercel",
    name: "Vercel AI Gateway",
    source: "custom",
    env: [],
    options: {},
    models: {},
  },
}

export function useProviders(directory: Accessor<string | undefined>) {
  const serverSync = useServerSync()
  const params = useParams()
  const dir = () => (directory ? directory() : decode64(params.dir))
  const providers = () => {
    const value = dir()
    const projectStore = value ? serverSync().child(value)[0] : undefined
    return selectProviderCatalog({
      explicit: !!value,
      directory: value,
      catalog: projectStore && { ready: projectStore.provider_ready, providers: projectStore.provider },
      global: serverSync().data.provider,
    })
  }

  return {
    all: (): Map<string, Provider> => {
      const current = providers().all
      if (current && current.size > 0) return current
      const fallbackMap = new Map<string, Provider>()
      for (const [id, p] of Object.entries(DEFAULT_FALLBACK_PROVIDERS)) {
        fallbackMap.set(id, p)
      }
      return fallbackMap
    },
    default: () => providers().default,
    popular: (): Provider[] => {
      const allMap = providers().all ?? new Map()
      const list: Provider[] = []
      for (const id of popularProviders) {
        const found = allMap.get(id) ?? DEFAULT_FALLBACK_PROVIDERS[id]
        if (found) list.push(found)
      }
      return list
    },
    connected: (): Provider[] => {
      const allMap = providers().all ?? new Map()
      const connected = new Set(providers().connected ?? [])
      const list: Provider[] = []
      for (const [id, p] of allMap.entries()) {
        if (connected.has(id)) list.push(p)
      }
      return list
    },
    paid: () => {
      const connected = new Set(providers().connected)
      const paid = [
        ...Iterable.filter(
          providers().all,
          ([id]) =>
            connected.has(id) &&
            (id !== "tiancode" || Object.values(providers().all.get(id)?.models ?? {}).some((m) => m.cost?.input)),
        ),
      ]
      return paid
    },
  }
}
