import { useServerSync } from "@/context/server-sync"
import { decode64 } from "@/utils/base64"
import { useParams } from "@solidjs/router"
import type { Provider } from "@tiancode-ai/sdk/v2"
import { Iterable, pipe } from "effect"
import { createEffect, createMemo, createSignal, type Accessor } from "solid-js"
import { selectProviderCatalog } from "./provider-catalog"

// Ollama and LM Studio are deliberately absent: connecting them here only pointed at a local
// HTTP endpoint the user still had to run themselves, and the local-model path people actually
// use is the built-in engine ("local", Tiancode Native / GGUF) in Modelos Locales.
export const popularProviders = [
  "tiancode",
  "tiancode-go",
  "local",
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

/**
 * Providers the user just connected or disconnected, before the server catalogue catches up.
 *
 * Connecting or disconnecting means writing config, disposing the provider runtime and
 * refetching the catalogue — a second or two during which the panel still showed the old
 * answer and the model picker still offered models from a provider you had just removed.
 * Every consumer of `useProviders` reads through this overlay, so the row, the toast and the
 * model list all change in the same frame; the overlay clears itself once the real catalogue
 * agrees (or after a few seconds, if the refresh never lands).
 */
type PendingState = "connected" | "disconnected"
const [pendingProviders, setPendingProviders] = createSignal<Record<string, PendingState>>({})
const pendingTimers = new Map<string, ReturnType<typeof setTimeout>>()

/** Longest we keep lying to the user if the refresh never comes back. */
const PENDING_TTL_MS = 8_000

export function markProviderPending(providerID: string, state: PendingState) {
  setPendingProviders((current) => ({ ...current, [providerID]: state }))
  const existing = pendingTimers.get(providerID)
  if (existing) clearTimeout(existing)
  pendingTimers.set(
    providerID,
    setTimeout(() => clearProviderPending(providerID), PENDING_TTL_MS),
  )
}

export function clearProviderPending(providerID: string) {
  const timer = pendingTimers.get(providerID)
  if (timer) clearTimeout(timer)
  pendingTimers.delete(providerID)
  setPendingProviders((current) => {
    if (!(providerID in current)) return current
    const next = { ...current }
    delete next[providerID]
    return next
  })
}

/** Only for the tests: no overlay left over between cases. */
export function resetProviderPending() {
  for (const timer of pendingTimers.values()) clearTimeout(timer)
  pendingTimers.clear()
  setPendingProviders({})
}

/** The connected set the UI should show right now: the server's answer plus what just changed. */
export function applyPendingConnections(connected: Iterable<string>, pending: Record<string, PendingState>) {
  const result = new Set(connected)
  for (const [id, state] of Object.entries(pending)) {
    if (state === "connected") result.add(id)
    else result.delete(id)
  }
  return result
}

export function useProviders(directory: Accessor<string | undefined>) {
  const serverSync = useServerSync()
  const params = useParams()
  const dir = () => (directory ? directory() : decode64(params.dir))
  const providers = () => {
    const value = dir()
    const projectStore = value ? serverSync().child(value)[0] : undefined
    return selectProviderCatalog({
      directory: value,
      catalog: projectStore && { ready: projectStore.provider_ready, providers: projectStore.provider },
      global: serverSync().data.provider,
    })
  }

  return {
    all: (): Map<string, Provider> => {
      const current = providers().all
      const map = new Map<string, Provider>()
      for (const [id, p] of Object.entries(DEFAULT_FALLBACK_PROVIDERS)) {
        map.set(id, p)
      }
      if (current) {
        for (const [id, p] of current.entries()) {
          map.set(id, p)
        }
      }
      return map
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
      const catalog = providers().all ?? new Map()
      const allMap = new Map<string, Provider>(catalog)
      for (const [id, p] of Object.entries(DEFAULT_FALLBACK_PROVIDERS)) if (!allMap.has(id)) allMap.set(id, p)
      const connected = applyPendingConnections(providers().connected ?? [], pendingProviders())
      const list: Provider[] = []
      for (const [id, p] of allMap.entries()) {
        if (connected.has(id)) list.push(p)
      }
      return list
    },
    paid: () => {
      const connected = applyPendingConnections(providers().connected ?? [], pendingProviders())
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
