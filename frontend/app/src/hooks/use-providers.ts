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

function makeFallbackModel(providerID: string, id: string, name: string) {
  return {
    id,
    providerID,
    name,
    api: { id, npm: "@ai-sdk/openai-compatible", url: "" },
    status: "active" as const,
    capabilities: {
      temperature: true,
      reasoning: false,
      attachment: true,
      toolcall: true,
      input: { text: true, audio: false, image: true, video: false, pdf: true },
      output: { text: true, audio: false, image: false, video: false, pdf: false },
      interleaved: false,
    },
    cost: { input: 0, output: 0, cache: { read: 0, write: 0 } },
    options: {},
    limit: { context: 128000, output: 8192 },
    headers: {},
    family: providerID,
    release_date: new Date().toISOString(),
    variants: {},
  }
}

const DEFAULT_FALLBACK_PROVIDERS: Record<string, Provider> = {
  openai: {
    id: "openai",
    name: "OpenAI",
    source: "custom",
    env: ["OPENAI_API_KEY"],
    options: {},
    models: {
      "gpt-4o": makeFallbackModel("openai", "gpt-4o", "GPT-4o"),
      "gpt-4o-mini": makeFallbackModel("openai", "gpt-4o-mini", "GPT-4o Mini"),
      "o1": makeFallbackModel("openai", "o1", "o1"),
      "o3-mini": makeFallbackModel("openai", "o3-mini", "o3-mini"),
    },
  },
  anthropic: {
    id: "anthropic",
    name: "Anthropic",
    source: "custom",
    env: ["ANTHROPIC_API_KEY"],
    options: {},
    models: {
      "claude-3-7-sonnet-latest": makeFallbackModel("anthropic", "claude-3-7-sonnet-latest", "Claude 3.7 Sonnet"),
      "claude-3-5-sonnet-latest": makeFallbackModel("anthropic", "claude-3-5-sonnet-latest", "Claude 3.5 Sonnet"),
      "claude-3-5-haiku-latest": makeFallbackModel("anthropic", "claude-3-5-haiku-latest", "Claude 3.5 Haiku"),
    },
  },
  google: {
    id: "google",
    name: "Google Gemini",
    source: "custom",
    env: ["GEMINI_API_KEY"],
    options: {},
    models: {
      "gemini-2.5-pro": makeFallbackModel("google", "gemini-2.5-pro", "Gemini 2.5 Pro"),
      "gemini-2.5-flash": makeFallbackModel("google", "gemini-2.5-flash", "Gemini 2.5 Flash"),
      "gemini-2.0-flash": makeFallbackModel("google", "gemini-2.0-flash", "Gemini 2.0 Flash"),
    },
  },
  deepseek: {
    id: "deepseek",
    name: "DeepSeek",
    source: "custom",
    env: ["DEEPSEEK_API_KEY"],
    options: {},
    models: {
      "deepseek-chat": makeFallbackModel("deepseek", "deepseek-chat", "DeepSeek V3 (Chat)"),
      "deepseek-reasoner": makeFallbackModel("deepseek", "deepseek-reasoner", "DeepSeek R1 (Reasoner)"),
    },
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
    models: {
      "anthropic/claude-3.7-sonnet": makeFallbackModel("openrouter", "anthropic/claude-3.7-sonnet", "Claude 3.7 Sonnet (OpenRouter)"),
      "openai/gpt-4o": makeFallbackModel("openrouter", "openai/gpt-4o", "GPT-4o (OpenRouter)"),
      "deepseek/deepseek-r1": makeFallbackModel("openrouter", "deepseek/deepseek-r1", "DeepSeek R1 (OpenRouter)"),
    },
  },
  groq: {
    id: "groq",
    name: "Groq",
    source: "custom",
    env: ["GROQ_API_KEY"],
    options: {},
    models: {
      "llama-3.3-70b-versatile": makeFallbackModel("groq", "llama-3.3-70b-versatile", "Llama 3.3 70B (Groq)"),
      "deepseek-r1-distill-llama-70b": makeFallbackModel("groq", "deepseek-r1-distill-llama-70b", "DeepSeek R1 Distill 70B (Groq)"),
    },
  },
  xai: {
    id: "xai",
    name: "xAI (Grok)",
    source: "custom",
    env: ["XAI_API_KEY"],
    options: {},
    models: {
      "grok-2-latest": makeFallbackModel("xai", "grok-2-latest", "Grok 2"),
      "grok-beta": makeFallbackModel("xai", "grok-beta", "Grok Beta"),
    },
  },
  mistral: {
    id: "mistral",
    name: "Mistral AI",
    source: "custom",
    env: ["MISTRAL_API_KEY"],
    options: {},
    models: {
      "mistral-large-latest": makeFallbackModel("mistral", "mistral-large-latest", "Mistral Large"),
      "codestral-latest": makeFallbackModel("mistral", "codestral-latest", "Codestral"),
    },
  },
  "github-copilot": {
    id: "github-copilot",
    name: "GitHub Copilot",
    source: "custom",
    env: [],
    options: {},
    models: {
      "claude-3.5-sonnet": makeFallbackModel("github-copilot", "claude-3.5-sonnet", "Claude 3.5 Sonnet (Copilot)"),
      "gpt-4o": makeFallbackModel("github-copilot", "gpt-4o", "GPT-4o (Copilot)"),
    },
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
