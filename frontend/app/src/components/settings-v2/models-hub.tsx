import { Tag } from "@tiancode-ai/ui/v2/badge-v2"
import { ButtonV2 } from "@tiancode-ai/ui/v2/button-v2"
import { SelectV2 } from "@tiancode-ai/ui/v2/select-v2"
import { Switch } from "@tiancode-ai/ui/v2/switch-v2"
import { TextInputV2 } from "@tiancode-ai/ui/v2/text-input-v2"
import {
  type Component,
  createResource,
  For,
  Show,
  createSignal,
  createMemo,
  createEffect,
  on,
  onCleanup,
  onMount,
} from "solid-js"
import { createStore } from "solid-js/store"
import { compatibilityFor, type FitTier } from "@tiancode-ai/core/model-fit"
import { useLanguage } from "@/context/language"
import { reconcileForgottenFromConfig, type ConfigProviders } from "@/context/models-local"
import { useServerSDK } from "@/context/server-sdk"
import { useServerSync } from "@/context/server-sync"
import { authTokenFromCredentials } from "@/utils/server"
import { showToast } from "@/utils/toast"
import { Persist, persisted } from "@/utils/persist"
import { SoundEffects } from "@/utils/sound-effects"
import { SettingsPagerV2 } from "./parts/pager"
import { SettingsSectionTabs } from "./parts/section-tabs"
import { SettingsListV2 } from "./parts/list"
import { SettingsRowV2 } from "./parts/row"
import "./models-hub.css"

export type { FitTier } from "@tiancode-ai/core/model-fit"
export type DownloadStatus = "downloading" | "paused" | "completed" | "failed"

type Numish = number | "NaN" | "Infinity" | "-Infinity"

export type QuantFile = {
  file: string
  quant?: string
  size?: Numish
  sha256?: string
  fit?: { tier: FitTier; label: string }
  recommended?: boolean
}

export type Model = {
  id: string
  downloads?: Numish
  likes?: Numish
  pipeline_tag?: string
  quantFiles: QuantFile[]
  tags?: string[]
  description?: string
  author?: string
}

export type DownloadJob = {
  id: string
  model: string
  file: string
  status: DownloadStatus
  total: Numish
  received: Numish
  done: boolean
  error?: string
  speedBytesPerSec?: Numish
  percent?: Numish
  remainingBytes?: Numish
  etaSeconds?: Numish
}

export type RuntimeInfo = {
  id: string
  name: string
  available: boolean
  port?: number | string
  version?: string
  models?: string[]
}

export type LoadRecommendation = {
  contextSize: number
  gpuLayers: number
  threads: number
  batchSize: number
  flashAttention?: boolean
  kvCacheType: "f16" | "q8_0" | "q4_0"
  useMmap: boolean
  keepInMemory: boolean
  kvOffload: boolean
  parallel: number
  placement: "gpu" | "hybrid" | "cpu"
  layers: number
  trainContext?: number
  kvBytesPerToken: number
  estimatedBytes: number
  budgetBytes: number
  reasons: string[]
}

export type LocalModelFile = {
  path: string
  file: string
  name: string
  repo?: string
  root: string
  sizeBytes: number
  modifiedAt: number
  quant?: string
  fit?: { tier: FitTier; label: string }
  metadata?: {
    architecture?: string
    name?: string
    sizeLabel?: string
    contextLength?: number
    blockCount?: number
    quantization?: string
    parameterCount?: number
    hasChatTemplate: boolean
  }
  recommended?: LoadRecommendation
  error?: string
}

const asNumber = (value: Numish | undefined): number | undefined =>
  typeof value === "number" ? value : undefined

const formatBytes = (bytes: Numish | undefined) => {
  const n = asNumber(bytes)
  if (n === undefined || Number.isNaN(n) || n <= 0) return "0 B"
  const units = ["B", "KB", "MB", "GB", "TB"]
  const i = Math.min(units.length - 1, Math.floor(Math.log(n) / Math.log(1024)))
  const value = n / Math.pow(1024, i)
  return `${value.toFixed(value >= 10 || i === 0 ? 1 : 2)} ${units[i]}`
}

const formatNumber = (num: Numish | undefined) => {
  const n = asNumber(num)
  if (n === undefined) return "0"
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`
  return String(n)
}

const formatSpeed = (bytesPerSec: Numish | undefined) => {
  const n = asNumber(bytesPerSec)
  if (n === undefined || n <= 0) return undefined
  return `${formatBytes(n)}/s`
}

const formatEta = (seconds: Numish | undefined) => {
  const s = asNumber(seconds)
  if (s === undefined || s <= 0) return undefined
  if (s < 60) return `${s}s`
  const minutes = Math.floor(s / 60)
  const remaining = s % 60
  if (minutes < 60) return `${minutes}m ${remaining}s`
  const hours = Math.floor(minutes / 60)
  return `${hours}h ${minutes % 60}m`
}

// The author's real avatar from Hugging Face (organisation first, then user); the drawn marks
// below only appear when the network has nothing for that name.
function HubAvatar(props: { id: string; author?: string; class?: string }) {
  const [attempt, setAttempt] = createSignal(0)
  const author = () => props.author || (props.id.includes("/") ? props.id.split("/")[0] : "")
  const sources = () => [
    `https://huggingface.co/api/organizations/${encodeURIComponent(author())}/avatar?redirect=true`,
    `https://huggingface.co/api/users/${encodeURIComponent(author())}/avatar?redirect=true`,
  ]
  return (
    <Show when={author() && attempt() < 2} fallback={<BrandLogo id={props.id} author={props.author} class={props.class} />}>
      <div class={`lm-brand-badge lm-brand-hf-avatar ${props.class ?? ""}`} title={`${author()} en Hugging Face`}>
        <img
          src={sources()[attempt()]}
          alt={author()}
          class="w-full h-full object-cover rounded-xl"
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setAttempt((value) => value + 1)}
        />
      </div>
    </Show>
  )
}

function HubOrgAvatar(props: { org: string; fallback: string }) {
  const [failed, setFailed] = createSignal(false)
  return (
    <Show when={!failed()} fallback={<span>{props.fallback}</span>}>
      <img
        class="lm-quick-tag-avatar"
        src={`https://huggingface.co/api/organizations/${encodeURIComponent(props.org)}/avatar?redirect=true`}
        alt=""
        loading="lazy"
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
      />
    </Show>
  )
}

// Iconos de marca oficiales de Hugging Face, Labs y avatares reales
function BrandLogo(props: { id: string; author?: string; class?: string }) {
  const [imgError, setImgError] = createSignal(false)
  const author = () => {
    if (props.author) return props.author
    return props.id.includes("/") ? props.id.split("/")[0] : ""
  }
  const text = () => `${props.id} ${author()}`.toLowerCase()

  // 1. DeepSeek (Whale official emblem)
  if (text().includes("deepseek")) {
    return (
      <div class={`lm-brand-badge lm-brand-deepseek ${props.class ?? ""}`} title="DeepSeek Official">
        <svg viewBox="0 0 100 100" width="26" height="26" fill="none">
          <path
            d="M18 52C22 36 34 26 50 26C66 26 80 36 84 50C86 56 84 64 78 70C72 76 62 80 50 80C36 80 24 72 18 60L12 66C10 68 8 66 9 63L14 48C15 45 18 45 19 48L22 56"
            fill="#ffffff"
          />
          <circle cx="68" cy="46" r="4" fill="#1e40af" />
          <path d="M50 36C60 36 70 42 74 52" stroke="#38bdf8" stroke-width="3.5" stroke-linecap="round" />
        </svg>
      </div>
    )
  }

  // 2. Alibaba Qwen (Prism Diamond official emblem)
  if (text().includes("qwen")) {
    return (
      <div class={`lm-brand-badge lm-brand-qwen ${props.class ?? ""}`} title="Alibaba Qwen Official">
        <svg viewBox="0 0 100 100" width="26" height="26" fill="none">
          <polygon points="50,12 86,34 86,66 50,88 14,66 14,34" fill="#4f46e5" stroke="#a5b4fc" stroke-width="2" />
          <polygon points="50,12 86,34 50,56 14,34" fill="#818cf8" />
          <polygon points="14,34 50,56 50,88 14,66" fill="#6366f1" />
          <polygon points="86,34 50,56 50,88 86,66" fill="#4338ca" />
          <polygon points="50,28 72,42 50,56 28,42" fill="#c7d2fe" />
        </svg>
      </div>
    )
  }

  // 3. Meta Llama / CodeLlama (Official Meta Infinity Ribbon)
  if (text().includes("llama") || text().includes("meta")) {
    return (
      <div class={`lm-brand-badge lm-brand-meta ${props.class ?? ""}`} title="Meta Llama Official">
        <svg viewBox="0 0 100 100" width="26" height="26" fill="none">
          <path
            d="M28 35C18 35 10 42 10 52C10 62 18 69 28 69C38 69 46 60 50 52C54 60 62 69 72 69C82 69 90 62 90 52C90 42 82 35 72 35C62 35 54 44 50 52C46 44 38 35 28 35ZM28 43C34 43 40 48 44 52C40 56 34 61 28 61C22 61 18 57 18 52C18 47 22 43 28 43ZM72 43C78 43 82 47 82 52C82 57 78 61 72 61C66 61 60 56 56 52C60 48 66 43 72 43Z"
            fill="#ffffff"
          />
        </svg>
      </div>
    )
  }

  // 4. NVIDIA (Nemotron / Megatron official Eye logo)
  if (text().includes("nvidia") || text().includes("nemotron") || text().includes("megatron")) {
    return (
      <div class={`lm-brand-badge lm-brand-nvidia ${props.class ?? ""}`} title="NVIDIA Official">
        <svg viewBox="0 0 100 100" width="26" height="26" fill="none">
          <path
            d="M50 18C28 18 12 36 12 50C12 64 28 82 50 82C66 82 78 72 84 62C85 60 84 58 82 58L72 58C71 58 69 59 68 60C64 66 58 72 50 72C34 72 22 58 22 50C22 42 34 28 50 28C62 28 70 36 74 42C75 43 77 44 79 44L87 44C89 44 90 42 89 40C82 28 68 18 50 18Z"
            fill="#ffffff"
          />
          <path
            d="M50 36C40 36 32 44 32 50C32 56 40 64 50 64C56 64 62 60 64 54C65 52 64 50 62 50L52 50C51 50 50 51 49 52C48 53 46 54 44 54C42 54 40 52 40 50C40 48 42 46 44 46L63 46C65 46 66 44 65 42C62 38 56 36 50 36Z"
            fill="#ffffff"
          />
        </svg>
      </div>
    )
  }

  // 5. Google Gemma (Gemma / CodeGemma 4-Point Sparkling Star)
  if (text().includes("gemma") || text().includes("google") || text().includes("codegemma")) {
    return (
      <div class={`lm-brand-badge lm-brand-google ${props.class ?? ""}`} title="Google Gemma Official">
        <svg viewBox="0 0 100 100" width="26" height="26" fill="none">
          <defs>
            <linearGradient id="gemma-g1" x1="0" y1="0" x2="100" y2="100">
              <stop offset="0%" stop-color="#4285F4" />
              <stop offset="30%" stop-color="#9333EA" />
              <stop offset="70%" stop-color="#EC4899" />
              <stop offset="100%" stop-color="#FBBC05" />
            </linearGradient>
          </defs>
          <path d="M50 8C50 34 66 50 92 50C66 50 50 66 50 92C50 66 34 50 8 50C34 50 50 34 50 8Z" fill="url(#gemma-g1)" />
          <circle cx="50" cy="50" r="9" fill="#ffffff" opacity="0.95" />
        </svg>
      </div>
    )
  }

  // 6. Mistral AI (Codestral / Mixtral / Ministral official stepped M)
  if (text().includes("mistral") || text().includes("codestral") || text().includes("mixtral") || text().includes("ministral")) {
    return (
      <div class={`lm-brand-badge lm-brand-mistral ${props.class ?? ""}`} title="Mistral AI Official">
        <svg viewBox="0 0 100 100" width="26" height="26" fill="none">
          <rect x="14" y="16" width="16" height="16" fill="#ff7000" />
          <rect x="70" y="16" width="16" height="16" fill="#ff7000" />
          <rect x="14" y="36" width="16" height="16" fill="#ff8c00" />
          <rect x="42" y="36" width="16" height="16" fill="#ff7000" />
          <rect x="70" y="36" width="16" height="16" fill="#ff8c00" />
          <rect x="14" y="56" width="16" height="16" fill="#ffa500" />
          <rect x="28" y="56" width="16" height="16" fill="#ff7000" />
          <rect x="56" y="56" width="16" height="16" fill="#ff7000" />
          <rect x="70" y="56" width="16" height="16" fill="#ffa500" />
          <rect x="14" y="76" width="16" height="16" fill="#ffb700" />
          <rect x="70" y="76" width="16" height="16" fill="#ffb700" />
        </svg>
      </div>
    )
  }

  // 7. Microsoft Phi (Phi-3 / Phi-4 / Phi-2)
  if (text().includes("phi") || text().includes("microsoft")) {
    return (
      <div class={`lm-brand-badge lm-brand-microsoft ${props.class ?? ""}`} title="Microsoft Official">
        <svg viewBox="0 0 100 100" width="24" height="24" fill="none">
          <rect x="14" y="14" width="32" height="32" rx="4" fill="#f25022" />
          <rect x="54" y="14" width="32" height="32" rx="4" fill="#7fba00" />
          <rect x="14" y="54" width="32" height="32" rx="4" fill="#00a4ef" />
          <rect x="54" y="54" width="32" height="32" rx="4" fill="#ffb900" />
        </svg>
      </div>
    )
  }

  // 8. IBM Granite
  if (text().includes("granite") || text().includes("ibm")) {
    return (
      <div class={`lm-brand-badge lm-brand-ibm ${props.class ?? ""}`} title="IBM Granite Official">
        <svg viewBox="0 0 100 100" width="26" height="26" fill="none">
          <rect x="12" y="20" width="76" height="7" fill="#ffffff" />
          <rect x="12" y="30" width="76" height="7" fill="#ffffff" />
          <rect x="12" y="40" width="76" height="7" fill="#ffffff" />
          <rect x="12" y="50" width="76" height="7" fill="#ffffff" />
          <rect x="12" y="60" width="76" height="7" fill="#ffffff" />
          <rect x="12" y="70" width="76" height="7" fill="#ffffff" />
        </svg>
      </div>
    )
  }

  // 8b. Nous Research Hermes (Hermes-3 official winged emblem)
  if (text().includes("hermes") || text().includes("nous")) {
    return (
      <div class={`lm-brand-badge lm-brand-nous ${props.class ?? ""}`} title="Nous Research Hermes Official">
        <svg viewBox="0 0 100 100" width="26" height="26" fill="none">
          <circle cx="50" cy="50" r="40" fill="#18181b" stroke="#a855f7" stroke-width="2.5" />
          <path d="M30 42C38 32 62 32 70 42C74 47 72 56 65 62L50 75L35 62C28 56 26 47 30 42Z" fill="#c084fc" opacity="0.9" />
          <path d="M22 36C28 30 38 28 46 32L34 44C28 42 24 39 22 36Z" fill="#e9d5ff" />
          <path d="M78 36C72 30 62 28 54 32L66 44C72 42 76 39 78 36Z" fill="#e9d5ff" />
          <circle cx="50" cy="50" r="5" fill="#ffffff" />
        </svg>
      </div>
    )
  }

  // 9. Real Hugging Face Author / Org Avatar si está disponible
  const authName = author()
  if (authName && !imgError()) {
    return (
      <div class={`lm-brand-badge lm-brand-hf-avatar ${props.class ?? ""}`} title={`${authName} en Hugging Face`}>
        <img
          src={`https://huggingface.co/avatars/${encodeURIComponent(authName)}.png`}
          alt={authName}
          class="w-full h-full object-cover rounded-xl"
          onError={() => setImgError(true)}
          loading="lazy"
        />
      </div>
    )
  }

  // 10. Hugging Face / Default Fallback
  return (
    <div class={`lm-brand-badge lm-brand-hf ${props.class ?? ""}`} title="Hugging Face">
      <svg viewBox="0 0 100 100" width="28" height="28" fill="none">
        <circle cx="50" cy="50" r="38" fill="#ffd21e" />
        <ellipse cx="38" cy="46" rx="4" ry="5.5" fill="#1e1e1e" />
        <ellipse cx="62" cy="46" rx="4" ry="5.5" fill="#1e1e1e" />
        <path d="M36 60C40 68 60 68 64 60" stroke="#1e1e1e" stroke-width="4" stroke-linecap="round" fill="none" />
        <ellipse cx="28" cy="54" rx="4.5" ry="3" fill="#f87171" opacity="0.65" />
        <ellipse cx="72" cy="54" rx="4.5" ry="3" fill="#f87171" opacity="0.65" />
        <path d="M12 42C16 40 24 46 22 56C20 64 12 62 10 56C8 50 10 44 12 42Z" fill="#ffd21e" stroke="#1e1e1e" stroke-width="2.5" />
        <path d="M88 42C84 40 76 46 78 56C80 64 88 62 90 56C92 50 90 44 88 42Z" fill="#ffd21e" stroke="#1e1e1e" stroke-width="2.5" />
      </svg>
    </div>
  )
}

// Staff picks iniciales recomendados para la interfaz
const STAFF_PICKS: Model[] = [
  {
    id: "Qwen/Qwen2.5-Coder-7B-Instruct-GGUF",
    downloads: 1420500,
    likes: 3840,
    pipeline_tag: "text-generation",
    author: "Qwen",
    description: "State-of-the-art code reasoning, multi-language coding and long context generation.",
    tags: ["code", "reasoning", "instruct", "gguf"],
    quantFiles: [
      { file: "qwen2.5-coder-7b-instruct-q4_k_m.gguf", quant: "Q4_K_M", size: 4.68e9, recommended: true },
      { file: "qwen2.5-coder-7b-instruct-q5_k_m.gguf", quant: "Q5_K_M", size: 5.43e9 },
      { file: "qwen2.5-coder-7b-instruct-q8_0.gguf", quant: "Q8_0", size: 8.12e9 },
    ],
  },
  {
    id: "bartowski/Llama-3.2-3B-Instruct-GGUF",
    downloads: 890200,
    likes: 2150,
    pipeline_tag: "text-generation",
    author: "meta-llama",
    description: "Compact, ultrafast 3B multilingual model optimized for on-device reasoning and assistance.",
    tags: ["instruct", "reasoning", "gguf"],
    quantFiles: [
      { file: "Llama-3.2-3B-Instruct-Q4_K_M.gguf", quant: "Q4_K_M", size: 2.02e9, recommended: true },
      { file: "Llama-3.2-3B-Instruct-Q8_0.gguf", quant: "Q8_0", size: 3.42e9 },
    ],
  },
  {
    id: "bartowski/Nemotron-Mini-4B-Instruct-GGUF",
    downloads: 541110,
    likes: 1240,
    pipeline_tag: "text-generation",
    author: "nvidia",
    description: "NVIDIA Nemotron 4B optimized for precise tool calling, reasoning and edge inference.",
    tags: ["tools", "reasoning", "gguf"],
    quantFiles: [
      { file: "Nemotron-Mini-4B-Instruct-Q4_K_M.gguf", quant: "Q4_K_M", size: 2.84e9, recommended: true },
      { file: "Nemotron-Mini-4B-Instruct-Q5_K_M.gguf", quant: "Q5_K_M", size: 3.25e9 },
    ],
  },
  {
    id: "bartowski/gemma-2-9b-it-GGUF",
    downloads: 720300,
    likes: 1980,
    pipeline_tag: "text-generation",
    author: "google",
    description: "Google Gemma 2 9B instruction-tuned model with deep mathematical and coding capabilities.",
    tags: ["vision", "tools", "reasoning", "gguf"],
    quantFiles: [
      { file: "gemma-2-9b-it-Q4_K_M.gguf", quant: "Q4_K_M", size: 5.86e9, recommended: true },
      { file: "gemma-2-9b-it-Q5_K_M.gguf", quant: "Q5_K_M", size: 6.82e9 },
    ],
  },
  {
    id: "bartowski/DeepSeek-R1-Distill-Qwen-7B-GGUF",
    downloads: 2150000,
    likes: 8420,
    pipeline_tag: "text-generation",
    author: "deepseek-ai",
    description: "High-power chain-of-thought reasoning model distilled from DeepSeek-R1 with full thinking traces.",
    tags: ["reasoning", "code", "gguf"],
    quantFiles: [
      { file: "DeepSeek-R1-Distill-Qwen-7B-Q4_K_M.gguf", quant: "Q4_K_M", size: 4.68e9, recommended: true },
      { file: "DeepSeek-R1-Distill-Qwen-7B-Q8_0.gguf", quant: "Q8_0", size: 7.95e9 },
    ],
  },
  {
    id: "NousResearch/Hermes-3-Llama-3.1-8B-GGUF",
    downloads: 480200,
    likes: 2310,
    pipeline_tag: "text-generation",
    author: "NousResearch",
    description: "State-of-the-art agentic & reasoning model from Nous Research with advanced tool-calling and structured JSON output.",
    tags: ["agent", "reasoning", "tools", "gguf"],
    quantFiles: [
      { file: "Hermes-3-Llama-3.1-8B.Q4_K_M.gguf", quant: "Q4_K_M", size: 4.92e9, recommended: true },
      { file: "Hermes-3-Llama-3.1-8B.Q8_0.gguf", quant: "Q8_0", size: 8.54e9 },
    ],
  },
]

export const SettingsModelsHubV2: Component<{
  directory?: string
  active?: boolean
}> = (props) => {
  const language = useLanguage()
  const serverSdk = useServerSDK()
  const serverSync = useServerSync()
  const [query, setQuery] = createSignal("")
  const [submitted, setSubmitted] = createSignal("")
  let searchDebounceTimer: ReturnType<typeof setTimeout> | undefined
  const handleSearchInput = (val: string) => {
    setQuery(val)
    if (searchDebounceTimer) clearTimeout(searchDebounceTimer)
    const trimmed = val.trim()
    if (!trimmed) {
      setSubmitted("")
      return
    }
    searchDebounceTimer = setTimeout(() => {
      setSubmitted(trimmed)
    }, 450)
  }
  onCleanup(() => {
    if (searchDebounceTimer) clearTimeout(searchDebounceTimer)
  })
  const [selectedId, setSelectedId] = createSignal<string>(STAFF_PICKS[0].id)
  const [selectedQuant, setSelectedQuant] = createSignal<string>("")
  const [jobs, setJobs] = createSignal<DownloadJob[]>([])
  const [sortBy, setSortBy] = createSignal<"recommended" | "downloads" | "likes" | "name">("recommended")
  const [showSortMenu, setShowSortMenu] = createSignal(false)

  const [memoryPrefs, setMemoryPrefs] = persisted(
    Persist.global("settings-v2.models-hub.memory"),
    createStore({ useGpu: true, useRamFallback: true }),
  )

  const params = () => (props.directory ? { directory: props.directory } : undefined)

  // Load parameters for the native engine, named after LM Studio's per-model load settings
  // (context length, GPU offload, thread pool, eval batch, flash attention, K/V cache quant,
  // keep in memory, mmap, KV offload, seed, RoPE, parallel slots). 0 or -1 means "automatic".
  type EngineLoad = {
    contextSize: number
    gpuLayers: number
    threads: number
    batchSize: number
    flashAttention: "auto" | "on" | "off"
    kvCacheType: "f16" | "q8_0" | "q4_0"
    keepInMemory: boolean
    useMmap: boolean
    kvOffload: boolean
    seed: number
    ropeFrequencyBase: number
    ropeFrequencyScale: number
    parallel: number
    /** Derive context, GPU layers, threads, batch and KV cache from the GGUF header + hardware. */
    auto: boolean
  }
  const defaultLoad: EngineLoad = {
    auto: true,
    contextSize: 8192,
    gpuLayers: 99,
    threads: 0,
    batchSize: 0,
    flashAttention: "auto",
    kvCacheType: "f16",
    keepInMemory: false,
    useMmap: true,
    kvOffload: true,
    seed: -1,
    ropeFrequencyBase: 0,
    ropeFrequencyScale: 0,
    parallel: 1,
  }
  const [load, setLoad] = persisted("settings-v2.models-hub.load", createStore<EngineLoad>({ ...defaultLoad }))
  const resetLoad = () => setLoad({ ...defaultLoad })
  // Stores written before the switch existed have no `auto`: automatic is the default.
  const autoLoad = () => load.auto !== false
  const numberOf = (raw: string, fallback: number) => {
    const value = Number(raw)
    return Number.isFinite(value) ? value : fallback
  }
  const enginePayload = () => ({
    auto: autoLoad(),
    contextSize: load.contextSize > 0 ? Math.floor(load.contextSize) : undefined,
    gpuLayers: load.gpuLayers >= 0 ? Math.floor(load.gpuLayers) : undefined,
    threads: load.threads > 0 ? Math.floor(load.threads) : undefined,
    batchSize: load.batchSize > 0 ? Math.floor(load.batchSize) : undefined,
    flashAttention: load.flashAttention === "auto" ? undefined : load.flashAttention === "on",
    kvCacheType: load.kvCacheType,
    keepInMemory: load.keepInMemory || undefined,
    useMmap: load.useMmap ? undefined : false,
    kvOffload: load.kvOffload ? undefined : false,
    seed: load.seed >= 0 ? Math.floor(load.seed) : undefined,
    ropeFrequencyBase: load.ropeFrequencyBase > 0 ? load.ropeFrequencyBase : undefined,
    ropeFrequencyScale: load.ropeFrequencyScale > 0 ? load.ropeFrequencyScale : undefined,
    parallel: load.parallel > 1 ? Math.floor(load.parallel) : undefined,
  })
  const flashOptions = ["auto", "on", "off"] as const
  const kvOptions = ["f16", "q8_0", "q4_0"] as const
  const loadNumber = (
    key: "contextSize" | "gpuLayers" | "threads" | "batchSize" | "seed" | "ropeFrequencyBase" | "ropeFrequencyScale" | "parallel",
    attrs: { min?: number; max?: number; step?: number } = {},
  ) => (
    <input
      type="number"
      class="lm-load-input"
      value={load[key]}
      min={attrs.min}
      max={attrs.max}
      step={attrs.step ?? 1}
      disabled={autoLoad()}
      onChange={(event) => setLoad(key, numberOf(event.currentTarget.value, defaultLoad[key]))}
    />
  )

  const [system, { refetch: refetchSystem }] = createResource(
    async () => {
      try {
        const res = await serverSdk().client.modelhub.system(params())
        return res?.data
      } catch {
        return undefined
      }
    },
  )

  const [searchedModels, { refetch: refetchModels }] = createResource(
    () => submitted(),
    async (query) => {
      if (!query) return []
      try {
        const res = await serverSdk().client.modelhub.search({ ...params(), query, limit: "40" })
        return (res?.data ?? []) as Model[]
      } catch {
        return []
      }
    },
    { initialValue: [] as Model[] },
  )

  const [filesResource, { refetch: refetchFiles }] = createResource(
    () => selectedId(),
    async (model) => {
      if (!model) return undefined
      try {
        const res = await serverSdk().client.modelhub.files({ ...params(), model })
        return res?.data
      } catch {
        return undefined
      }
    },
  )

  const [runtimes, { refetch: refetchRuntimes }] = createResource(
    async () => {
      try {
        const res = await serverSdk().client.modelhub.runtimes(params())
        return (res?.data ?? []) as RuntimeInfo[]
      } catch {
        return []
      }
    },
    { initialValue: [] as RuntimeInfo[] },
  )

  const [engineStatus, { refetch: refetchEngine }] = createResource(
    async () => {
      try {
        const res = await serverSdk().client.modelhub.engine(params())
        return res?.data
      } catch {
        return undefined
      }
    },
  )

  // Sin lectura del sistema devolvemos undefined, no una cifra inventada: estos tres valores
  // alimentan la insignia de compatibilidad, así que un 8 GB de VRAM supuesto hacía que el panel
  // afirmara con seguridad que un modelo cabe en una GPU que nunca llegó a consultar.
  const ram = createMemo(() => asNumber(system()?.ram))
  const vramTotal = createMemo(() => asNumber(system()?.vram?.total))
  const vramFree = createMemo(() => asNumber(system()?.vram?.free))

  const syncedJobSet = new Set<string>()

  const syncCompletedModels = async (jobList: DownloadJob[]) => {
    const completed = jobList.filter((j) => j.status === "completed")
    const newCompleted = completed.filter((j) => !syncedJobSet.has(j.id))
    if (!newCompleted.length) return
    for (const j of newCompleted) {
      syncedJobSet.add(j.id)
    }
    try {
      const configRes = await serverSdk().client.config.get(params()).catch(() => undefined)
      const existingProviders = ((configRes?.data as any)?.provider ?? {}) as Record<string, any>
      const localProvider = existingProviders.local ?? {
        npm: "@ai-sdk/openai-compatible",
        options: { baseURL: "http://localhost:58282/v1" },
        models: {},
      }
      const existingModels = { ...(localProvider.models ?? {}) }
      let changed = false
      for (const j of newCompleted) {
        const cleanName = j.file.replace(/\.gguf$/i, "")
        if (!existingModels[cleanName]) {
          existingModels[cleanName] = { name: cleanName }
          changed = true
        }
      }
      if (changed) {
        const updatedProviders = {
          ...existingProviders,
          local: {
            npm: "@ai-sdk/openai-compatible",
            options: { baseURL: "http://localhost:58282/v1" },
            models: existingModels,
          },
        }
        await serverSdk().client.global.config.update({
          config: {
            provider: updatedProviders as never,
          },
        }).catch(() => undefined)

        await serverSdk().client.config.update({
          ...params(),
          config: {
            provider: updatedProviders as never,
          },
        }).catch(() => undefined)
      }
    } catch {
      // ignore
    }
  }

  let isRefreshing = false
  const refreshJobs = async () => {
    if (isRefreshing) return
    isRefreshing = true
    try {
      const res = await serverSdk().client.modelhub.downloads(params())
      const list = res.data ?? []
      setJobs(list)
      void syncCompletedModels(list)
    } catch {
      // ignore transient polling error
    } finally {
      isRefreshing = false
    }
  }

  // Controlled polling: runs ONLY when this tab is active (props.active === true)
  // and does NOT track jobs() to avoid reactive runaway loops.
  createEffect(() => {
    const isActive = props.active ?? true
    if (!isActive) return

    void refreshJobs()
    const timer = setInterval(() => {
      void refreshJobs()
    }, 4000)
    onCleanup(() => clearInterval(timer))
  })

  const jobsByKey = createMemo(() => {
    const map: Record<string, DownloadJob> = {}
    for (const job of jobs()) map[`${job.model}/${job.file}`] = job
    return map
  })

  const [hubCategory, setHubCategory] = createSignal<"all" | "coding" | "reasoning" | "lightweight" | "downloaded">("all")
  // Top bar: explore Hugging Face, what is on disk, the local engines, and where models are kept.
  const [hubTab, setHubTab] = createSignal<"explore" | "disk" | "engines" | "settings">("explore")
  createEffect(
    on(hubTab, (tab) => {
      if (tab === "disk") setHubCategory("downloaded")
      if (tab === "explore" && hubCategory() === "downloaded") setHubCategory("all")
    }),
  )
  const localModelsApi = () => window.api?.localModels
  const [modelsDir, setModelsDir] = createSignal<string | null>(null)
  onMount(() => {
    void localModelsApi()?.getDir().then((dir) => setModelsDir(dir)).catch(() => {})
  })
  const pickModelsDir = async () => {
    const api = localModelsApi()
    if (!api) return
    const dir = await api.pickDir(language.t("settings.modelsHub.dir.picker")).catch(() => null)
    if (!dir) return
    setModelsDir(dir)
    // The server switches folders right away: downloads, the engine and the disk scan follow.
    await postToServer("/models/dir", { dir }).catch(() => undefined)
    void refetchSystem()
    void refreshLocal()
    showToast({
      variant: "success",
      title: language.t("settings.modelsHub.dir.title"),
      description: `${dir} · ${language.t("settings.modelsHub.dir.applied")}`,
    })
  }
  const resetModelsDir = async () => {
    const api = localModelsApi()
    if (!api) return
    await api.setDir(null).catch(() => {})
    setModelsDir(null)
    await postToServer("/models/dir", { dir: null }).catch(() => undefined)
    void refetchSystem()
    void refreshLocal()
  }

  // ---- sizes for search results ---------------------------------------------------------------
  // Hugging Face's search lists file names without sizes; the exact sizes come from the repo tree.
  // The server fills the first page, the rest is fetched here the first time a card renders.
  const [fileCache, setFileCache] = createSignal<Record<string, QuantFile[]>>({})
  const inflightFiles = new Set<string>()
  const ensureFiles = async (modelId: string) => {
    if (fileCache()[modelId] || inflightFiles.has(modelId)) return
    inflightFiles.add(modelId)
    try {
      const res = await serverSdk().client.modelhub.files({ ...params(), model: modelId })
      const list = (res?.data ?? []) as QuantFile[]
      if (list.length > 0) setFileCache((prev) => ({ ...prev, [modelId]: list }))
    } catch {
      // the card keeps its unsized list; the download resolves the size server-side
    } finally {
      inflightFiles.delete(modelId)
    }
  }
  const filesFor = (model: Model): QuantFile[] => fileCache()[model.id] ?? model.quantFiles
  const sizeLabel = (size: Numish | undefined) =>
    asNumber(size) === undefined ? language.t("settings.modelsHub.size.unknown") : formatBytes(size)
  const formatTokens = (tokens: number) => (tokens >= 1024 ? `${Math.round(tokens / 1024)}k` : String(tokens))
  const fitLabel = (tier: FitTier | undefined) =>
    tier === "full_gpu"
      ? language.t("settings.modelsHub.fit.fullGpu")
      : tier === "ram_only"
        ? language.t("settings.modelsHub.fit.ramOnly")
        : tier === "no_fit"
          ? language.t("settings.modelsHub.fit.noFit")
          : language.t("settings.modelsHub.fit.partialGpu")
  const placementLabel = (placement: LoadRecommendation["placement"]) =>
    language.t(`settings.modelsHub.placement.${placement}`)
  const recommendationLine = (rec: {
    contextSize: number
    gpuLayers: number
    threads: number
    kvCacheType?: string
    layers?: number
    estimatedBytes?: number
  }) => {
    const gpu = rec.gpuLayers >= 99 ? "100%" : rec.layers ? `${rec.gpuLayers}/${rec.layers}` : String(rec.gpuLayers)
    const parts = [
      `ctx ${formatTokens(rec.contextSize)}`,
      `GPU ${gpu}`,
      `${language.t("settings.modelsHub.load.threads.title")} ${rec.threads}`,
      `KV ${rec.kvCacheType ?? "f16"}`,
    ]
    if (rec.estimatedBytes) parts.push(`~${formatBytes(rec.estimatedBytes)}`)
    return parts.join(" · ")
  }

  // ---- what is really on disk ----------------------------------------------------------------
  const [localFiles, setLocalFiles] = createSignal<LocalModelFile[]>([])
  const [localLoading, setLocalLoading] = createSignal(false)
  const refreshLocal = async () => {
    setLocalLoading(true)
    try {
      const list = await getFromServer<LocalModelFile[]>("/models/local")
      if (list) setLocalFiles(list)
    } finally {
      setLocalLoading(false)
    }
  }
  // The generated SDK types predate `auto`/`applied` on the engine status; the server sends them.
  type AppliedLoad = { contextSize: number; gpuLayers: number; threads: number; batchSize?: number; kvCacheType?: string }
  const engineExtras = () => engineStatus() as { auto?: boolean; applied?: AppliedLoad } | undefined
  createEffect(() => {
    const tab = hubTab()
    if (tab === "disk" || tab === "settings" || tab === "explore") void refreshLocal()
  })
  createEffect(
    on(
      () => jobs().filter((j) => j.status === "completed").length,
      () => void refreshLocal(),
      { defer: true },
    ),
  )

  const activeModelList = createMemo<Model[]>(() => {
    let list: Model[] = []
    const liveQuery = query().trim().toLowerCase()
    const isSubmitted = submitted().trim().toLowerCase()

    if (isSubmitted && searchedModels() && searchedModels()!.length > 0) {
      list = [...searchedModels()!]
      if (liveQuery && liveQuery !== isSubmitted) {
        list = list.filter((m) => {
          const t = `${m.id} ${m.author ?? ""} ${m.tags?.join(" ") ?? ""} ${m.description ?? ""}`.toLowerCase()
          return t.includes(liveQuery)
        })
      }
    } else if (liveQuery) {
      // Instant exact search: filters matching models immediately as user types
      list = STAFF_PICKS.filter((m) => {
        const t = `${m.id} ${m.author ?? ""} ${m.tags?.join(" ") ?? ""} ${m.description ?? ""}`.toLowerCase()
        return t.includes(liveQuery)
      })
      for (const j of jobs().filter((j) => j.status === "completed")) {
        const t = `${j.model} ${j.file}`.toLowerCase()
        if (t.includes(liveQuery) && !list.some((m) => m.id === j.model)) {
          list.push({
            id: j.model,
            pipeline_tag: "text-generation",
            author: j.model.includes("/") ? j.model.split("/")[0] : "local",
            description: `Modelo local descargado en disco (${j.file}).`,
            tags: ["gguf", "local"],
            quantFiles: [{ file: j.file, quant: "GGUF", size: j.total, recommended: true }],
          })
        }
      }
    } else if (hubCategory() === "downloaded") {
      list = STAFF_PICKS.filter((m) => jobs().some((j) => j.model === m.id && j.status === "completed"))
      for (const j of jobs().filter((j) => j.status === "completed")) {
        if (!list.some((m) => m.id === j.model)) {
          list.push({
            id: j.model,
            pipeline_tag: "text-generation",
            author: j.model.includes("/") ? j.model.split("/")[0] : "local",
            description: `Modelo local descargado en disco (${j.file}).`,
            tags: ["gguf", "local"],
            quantFiles: [{ file: j.file, quant: "GGUF", size: j.total, recommended: true }],
          })
        }
      }
    } else {
      list = [...STAFF_PICKS]
    }

    const sort = sortBy()
    if (sort === "downloads") {
      list = [...list].sort((a, b) => (asNumber(b.downloads) ?? 0) - (asNumber(a.downloads) ?? 0))
    } else if (sort === "likes") {
      list = [...list].sort((a, b) => (asNumber(b.likes) ?? 0) - (asNumber(a.likes) ?? 0))
    } else if (sort === "name") {
      list = [...list].sort((a, b) => a.id.localeCompare(b.id))
    }

    const cat = hubCategory()
    if (cat === "coding") {
      list = list.filter((m) => {
        const t = `${m.id} ${m.description ?? ""}`.toLowerCase()
        return t.includes("coder") || t.includes("code") || t.includes("program")
      })
    } else if (cat === "reasoning") {
      list = list.filter((m) => {
        const t = `${m.id} ${m.description ?? ""}`.toLowerCase()
        return t.includes("r1") || t.includes("reason") || t.includes("qwq") || t.includes("deepseek")
      })
    } else if (cat === "lightweight") {
      list = list.filter((m) => {
        return m.quantFiles.some((qf) => {
          const s = asNumber(qf.size)
          return s !== undefined && s <= 4.2 * 1024 * 1024 * 1024
        })
      })
    } else if (cat === "downloaded") {
      list = list.filter((m) => jobs().some((j) => j.model === m.id && j.status === "completed"))
    }

    return list
  })

  // Pagination 10x10 for Models Hub
  const HUB_PAGE_SIZE = 10
  const [hubPage, setHubPage] = createSignal(1)
  const hubTotal = () => Math.max(1, Math.ceil(activeModelList().length / HUB_PAGE_SIZE))
  const pageModelList = createMemo(() => {
    const page = Math.min(hubPage(), hubTotal())
    const start = (page - 1) * HUB_PAGE_SIZE
    return activeModelList().slice(start, start + HUB_PAGE_SIZE)
  })

  createEffect(() => {
    query()
    submitted()
    hubCategory()
    setHubPage(1)
  })

  createEffect(() => {
    if (hubPage() > hubTotal()) setHubPage(hubTotal())
  })

  const [selectedQuantMap, setSelectedQuantMap] = createSignal<Record<string, string>>({})
  const getSelectedFile = (model: Model): QuantFile => {
    const list = filesFor(model)
    const override = selectedQuantMap()[model.id]
    if (override) {
      const match = list.find((f) => f.file === override)
      if (match) return match
    }
    const rec = list.find((f) => f.recommended) || list.find((f) => (f.quant || "").includes("Q4")) || list[0]
    return rec || { file: "model.gguf", quant: "Q4_K_M" }
  }
  const setModelQuant = (modelId: string, file: string) => {
    setSelectedQuantMap((prev) => ({ ...prev, [modelId]: file }))
  }

  const getJobForModel = (model: Model) => {
    const file = getSelectedFile(model)
    return jobsByKey()[`${model.id}/${file.file}`] || jobs().find((j) => j.model === model.id)
  }

  const currentModel = createMemo<Model>(() => {
    const id = selectedId()
    const found = activeModelList().find((m) => m.id === id) || STAFF_PICKS.find((m) => m.id === id)
    return found || activeModelList()[0] || STAFF_PICKS[0]
  })

  const availableFiles = createMemo<QuantFile[]>(() => {
    const fetched = filesResource()
    if (fetched && fetched.length > 0) return fetched
    return currentModel()?.quantFiles ?? []
  })

  // Auto-seleccionar la cuantización recomendada
  createEffect(() => {
    const list = availableFiles()
    if (list.length > 0) {
      const current = selectedQuant()
      if (!current || !list.some((f) => f.file === current)) {
        const rec = list.find((f) => f.recommended) || list.find((f) => (f.quant || "").includes("Q4")) || list[0]
        setSelectedQuant(rec.file)
      }
    }
  })

  const currentQuantFile = createMemo<QuantFile | undefined>(() => {
    const f = selectedQuant()
    return availableFiles().find((item) => item.file === f) || availableFiles()[0]
  })

  // Shared with the server so the badge can never disagree with the server's own answer.
  const compat = (sizeBytes: Numish | undefined): FitTier =>
    compatibilityFor({
      sizeBytes: asNumber(sizeBytes),
      // Sin lectura del sistema van en 0 / undefined, y compatibilityFor responde "partial_gpu":
      // su respuesta neutra documentada, que no promete descarga completa ni descarta el modelo.
      ramBytes: ram() ?? 0,
      vram: (vramTotal() ?? 0) > 0 ? { total: vramTotal()!, free: vramFree() ?? 0 } : undefined,
      useGpu: memoryPrefs.useGpu,
      useRamFallback: memoryPrefs.useRamFallback,
    })



  const handleSearch = (e?: Event) => {
    e?.preventDefault()
    const val = query().trim()
    if (!val) {
      setSubmitted("")
      return
    }
    setSubmitted(val)
  }

  const startDownload = async (model: string, file: string) => {
    const key = `${model}/${file}`
    const job = jobsByKey()[key]
    if (job?.status === "downloading") return
    try {
      await serverSdk().client.modelhub.download({ ...params(), model, file })
      showToast({ variant: "success", title: "Descarga iniciada", description: file })
      await refreshJobs()
    } catch {
      showToast({ variant: "error", title: "Error al iniciar descarga" })
    }
  }

  // Lo que devuelve POST /models/forget: qué se quitó de verdad, para que el toast
  // pueda decirlo en vez de adivinarlo.
  type ForgetResult = {
    models: string[]
    providers: string[]
    files: string[]
    directories: string[]
    clearedDefaultModel: boolean
    clearedSmallModel: boolean
  }

  // El SDK generado no tiene binding para esta ruta, así que se llama a mano con la
  // URL del servidor + Basic auth, igual que en prompt-input/prompt-optimizer-button.tsx.
  // Único punto de este componente que habla HTTP directo: si hace falta otra ruta
  // sin binding, va por aquí.
  const postToServer = async <T,>(route: string, body: unknown): Promise<T | undefined> => {
    const serverHttp = serverSdk()?.server?.http
    if (!serverHttp?.url) return undefined
    const headers: Record<string, string> = { "Content-Type": "application/json" }
    if (serverHttp.password) {
      headers["Authorization"] = `Basic ${authTokenFromCredentials({
        username: serverHttp.username,
        password: serverHttp.password,
      })}`
    }
    // Sin directory el enrutado de workspace resuelve al proyecto por defecto del
    // servidor, no al que el usuario tiene abierto.
    const query = props.directory ? `?directory=${encodeURIComponent(props.directory)}` : ""
    const response = await fetch(`${serverHttp.url.replace(/\/+$/, "")}${route}${query}`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    })
    if (!response.ok) return undefined
    return (await response.json()) as T
  }

  const getFromServer = async <T,>(route: string): Promise<T | undefined> => {
    const serverHttp = serverSdk()?.server?.http
    if (!serverHttp?.url) return undefined
    const headers: Record<string, string> = {}
    if (serverHttp.password) {
      headers["Authorization"] = `Basic ${authTokenFromCredentials({
        username: serverHttp.username,
        password: serverHttp.password,
      })}`
    }
    const query = props.directory ? `?directory=${encodeURIComponent(props.directory)}` : ""
    const response = await fetch(`${serverHttp.url.replace(/\/+$/, "")}${route}${query}`, { headers }).catch(() => undefined)
    if (!response?.ok) return undefined
    return (await response.json()) as T
  }

  const removeDownload = async (job: DownloadJob) => {
    try {
      // 1. Detener el motor nativo para liberar bloqueos de archivo en Windows
      await serverSdk().client.modelhub.engineStop(params()).catch(() => undefined)
      await new Promise((r) => setTimeout(r, 250))

      // 2. Invocación de borrado físico directo vía Desktop IPC en Windows (elimina de disco, .jobs.json y procesos)
      const electronApi = (window as unknown as { api?: { modelHub?: { deleteFile: (target: unknown) => Promise<{ success?: boolean }> } } })?.api
      if (electronApi?.modelHub?.deleteFile) {
        await electronApi.modelHub
          .deleteFile({
            file: job.file,
            id: job.id,
            destPath: (job as any).destPath,
          })
          .catch(() => undefined)
      }

      // 3. Eliminar archivo de disco y cancelar job en backend con múltiples formatos de clave
      const safeFile = encodeURIComponent(job.file)
      const safeId = encodeURIComponent(job.id)
      await Promise.all([
        serverSdk().client.modelhub.cancel({ id: safeFile, ...params() }).catch(() => undefined),
        serverSdk().client.modelhub.cancel({ id: job.file, ...params() }).catch(() => undefined),
        serverSdk().client.modelhub.cancel({ id: safeId, ...params() }).catch(() => undefined),
        serverSdk().client.modelhub.cancel({ id: job.id, ...params() }).catch(() => undefined),
      ])

      // 4. Olvidar el modelo en la config (proyecto Y global) desde el servidor.
      //    Esto NO se puede hacer con config.update: update/updateGlobal hacen
      //    mergeDeep(base, patch), y un merge profundo sólo añade y sobrescribe —
      //    nunca borra. Mandar el mapa de modelos sin la clave era un no-op por
      //    construcción, y además sólo tocaba la config de proyecto, mientras que
      //    la entrada vive en la global. /models/forget borra en ambos archivos,
      //    quita el proveedor local si se queda sin modelos, y limpia `model`
      //    cuando apuntaba al modelo eliminado.
      const forgotten = await postToServer<ForgetResult>("/models/forget", {
        model: job.model,
        file: job.file,
      }).catch(() => undefined)

      // 5. Confirmación y sincronización final en la UI
      await refreshJobs()
      refetchEngine()
      setJobs((prev) => prev.filter((j) => j.id !== job.id && j.file !== job.file))

      // El backend puede re-agregar el job si el archivo sigue bloqueado en
      // disco; verificar que realmente desapareció antes de anunciar éxito.
      const after = await serverSdk().client.modelhub.downloads(params()).catch(() => undefined)
      // A failed IPC attempt may be followed by a successful backend deletion.
      // Verify final inventory; an unavailable response must never mean empty.
      if (!after?.data) throw new Error("Model inventory verification failed")
      const stillThere = after.data.some((j) => j.id === job.id || j.file === job.file)

      if (stillThere) {
        showToast({
          variant: "error",
          title: language.t("settings.modelsHub.remove.locked.title"),
          description: language.t("settings.modelsHub.remove.locked.description", { file: job.file }),
        })
        return
      }

      // Podar la config cacheada: es la contraparte del
      // serverSync().set("config", "provider", …) que hace activateDownloadedModel.
      // /models/forget reescribe los ficheros del servidor, pero nada vuelve a
      // pedir la query de config — refreshProviders() sólo refresca las queries
      // con queryKey[2] === "providers", y nadie publica "config.updated" — así que
      // sin esto el documento cacheado conserva el proveedor borrado durante
      // el resto de la sesión, aunque el archivo ya no exista.
      if (forgotten) {
        const pruned = reconcileForgottenFromConfig({
          providers: serverSync().data.config.provider as ConfigProviders | undefined,
          forgotten,
          file: job.file,
        })
        // Solid store setters merge objects; reconciliation removes absent keys.
        serverSync().set("config", "provider", pruned as never)
        // El servidor borra también estas referencias cuando apuntaban al modelo.
        if (forgotten.clearedDefaultModel) serverSync().set("config", "model", undefined as never)
        if (forgotten.clearedSmallModel) serverSync().set("config", "small_model", undefined as never)
      }

      // Proveedores y Modelos leen la config cacheada del servidor: sin refrescar,
      // el modelo recién olvidado sigue ofreciéndose hasta reiniciar la app.
      await serverSdk().client.global.dispose().catch(() => undefined)
      await serverSync().refreshProviders().catch(() => undefined)

      // El toast dice lo que realmente pasó, no lo que se intentó.
      const details = [language.t("settings.modelsHub.remove.success.description", { file: job.file })]
      if (!forgotten) details.push(language.t("settings.modelsHub.remove.configFailed"))
      else {
        if (forgotten.models.length) details.push(language.t("settings.modelsHub.remove.success.fromProviders"))
        if (forgotten.clearedDefaultModel) details.push(language.t("settings.modelsHub.remove.success.defaultCleared"))
      }

      showToast({
        variant: forgotten ? "success" : "default",
        title: language.t("settings.modelsHub.remove.success.title"),
        description: details.join(" "),
      })
    } catch {
      showToast({ variant: "error", title: language.t("settings.modelsHub.remove.failed.title") })
      await refreshJobs()
    }
  }

  const stopNativeEngine = async () => {
    try {
      await serverSdk().client.modelhub.engineStop(params())
      refetchEngine()
      refetchRuntimes()
      showToast({
        variant: "success",
        title: "Motor Nativo detenido",
        description: "Se ha liberado la memoria VRAM y los recursos de la GPU.",
      })
    } catch {
      showToast({ variant: "error", title: "Error al detener el motor nativo" })
    }
  }

  const activateDownloadedModel = async (job: { model: string; file: string; path?: string }) => {
    const modelName = job.file.replace(/\.gguf$/i, "")
    const availableRuntime = (runtimes() ?? []).find(
      (r) => r.available && r.id !== "tiancode-native" && r.id !== "local",
    )?.id

    let runtimeId = "local"
    let baseURL = "http://127.0.0.1:58282/v1"

    if (availableRuntime === "ollama") {
      runtimeId = "ollama"
      baseURL = "http://localhost:11434/v1"
    } else if (availableRuntime === "lmstudio") {
      runtimeId = "lmstudio"
      baseURL = "http://localhost:1234/v1"
    } else {
      // Iniciar automáticamente Tiancode Native Engine si no hay un runtime externo
      runtimeId = "local"
      baseURL = "http://127.0.0.1:58282/v1"
      showToast({
        title: "Iniciando Tiancode Native Engine...",
        description: `Cargando ${modelName} en GPU/VRAM...`,
      })
      const engRes = await serverSdk()
        .client.modelhub.engineStart({
          ...params(),
          ...enginePayload(),
          model: job.model,
          // The absolute path wins when the file was found by the disk scan (custom folders, legacy roots).
          file: job.path ?? job.file,
        })
        .catch((err) => ({ data: { status: "error", error: String(err) } }))

      if (engRes?.data?.status === "error") {
        showToast({
          variant: "error",
          title: "Error al iniciar el motor nativo",
          description: engRes.data.error || "No se pudo iniciar el proceso de inferencia.",
        })
        return
      }
      refetchEngine()
      refetchRuntimes()
    }

    try {
      const configRes = await serverSdk().client.config.get(params()).catch(() => undefined)
      const existingProviders = (configRes?.data?.provider ?? {}) as Record<
        string,
        { npm?: string; options?: { baseURL?: string }; models?: Record<string, { name: string }> }
      >

      const existingRuntimeModels = (existingProviders[runtimeId]?.models ?? {}) as Record<string, { name: string }>
      const updatedModels: Record<string, { name: string }> = {
        ...existingRuntimeModels,
        [modelName]: { name: modelName },
        [job.file]: { name: job.file },
      }

      const updatedProviders = {
        ...existingProviders,
        [runtimeId]: {
          npm: "@ai-sdk/openai-compatible",
          options: { baseURL },
          models: updatedModels,
        },
        local: {
          npm: "@ai-sdk/openai-compatible",
          options: { baseURL: "http://127.0.0.1:58282/v1" },
          models: {
            ...(existingProviders.local?.models ?? {}),
            [modelName]: { name: modelName },
            [job.file]: { name: job.file },
          },
        },
      }

      // IMPORTANTE: Asegurar que ni runtimeId ni local queden en disabled_providers
      const currentDisabled = ((configRes?.data?.disabled_providers ?? serverSync().data.config.disabled_providers ?? []) as string[])
      const nextDisabled = currentDisabled.filter((id) => id !== runtimeId && id !== "local")

      await serverSdk()
        .client.global.config.update({
          config: {
            provider: updatedProviders as never,
            disabled_providers: nextDisabled,
            model: `${runtimeId}/${modelName}`,
          },
        })
        .catch(() => undefined)

      await serverSdk()
        .client.config.update({
          ...params(),
          config: {
            provider: updatedProviders as never,
            disabled_providers: nextDisabled,
            model: `${runtimeId}/${modelName}`,
          },
        })
        .catch(() => undefined)

      serverSync().set("config", "provider", updatedProviders)
      serverSync().set("config", "disabled_providers", nextDisabled)
      serverSync().set("config", "model", `${runtimeId}/${modelName}`)

      await serverSdk().client.global.dispose().catch(() => undefined)
      await serverSync().refreshProviders().catch(() => undefined)

      showToast({
        variant: "success",
        title: `Modelo activado: ${modelName}`,
        description: "El modelo local está activo y listo para ser seleccionado en cualquier sesión de Tiancode.",
      })
    } catch {
      showToast({ variant: "error", title: "No se pudo activar el modelo local" })
    }
  }

  const activeJob = createMemo(() => {
    const m = currentModel()
    const f = currentQuantFile()
    if (!m || !f) return undefined
    return jobsByKey()[`${m.id}/${f.file}`]
  })

  return (
    <>
      <div class="settings-v2-tab-header settings-v2-tab-header--stacked">
        <div class="settings-v2-tab-header-row">
          <h2 class="settings-v2-tab-title">{language.t("settings.modelsHub.title")}</h2>
        </div>
        <p class="settings-v2-tab-description">{language.t("settings.modelsHub.description")}</p>
        <SettingsSectionTabs
          value={hubTab()}
          onChange={setHubTab}
          options={[
            { id: "explore", label: language.t("settings.modelsHub.tab.explore") },
            { id: "disk", label: language.t("settings.modelsHub.tab.disk") },
            { id: "engines", label: language.t("settings.modelsHub.tab.engines") },
            { id: "settings", label: language.t("settings.modelsHub.tab.settings") },
          ]}
        />
      </div>

      <div class="lm-hub-container">
        <Show when={hubTab() === "settings"}>
          <div class="settings-v2-section">
            <h3 class="settings-v2-section-title">{language.t("settings.modelsHub.tab.settings")}</h3>
            <SettingsListV2>
              <SettingsRowV2
                title={language.t("settings.modelsHub.dir.title")}
                description={modelsDir() ?? language.t("settings.modelsHub.dir.default")}
              >
                <div class="flex flex-wrap items-center justify-end gap-2">
                  <ButtonV2 type="button" variant="outline" size="small" disabled={!localModelsApi()} onClick={() => void pickModelsDir()}>
                    {language.t("settings.modelsHub.dir.change")}
                  </ButtonV2>
                  <Show when={modelsDir()}>
                    <ButtonV2 type="button" variant="ghost" size="small" onClick={() => void resetModelsDir()}>
                      {language.t("settings.modelsHub.dir.reset")}
                    </ButtonV2>
                  </Show>
                </div>
              </SettingsRowV2>
            </SettingsListV2>
            <p class="settings-v2-note">{language.t("settings.modelsHub.dir.restart")}</p>
          </div>

          <div class="settings-v2-section">
            <div class="lm-load-head">
              <div>
                <h3 class="settings-v2-section-title">{language.t("settings.modelsHub.load.title")}</h3>
                <p class="settings-v2-note lm-load-note">{language.t("settings.modelsHub.load.description")}</p>
              </div>
              <ButtonV2 type="button" variant="ghost" size="small" onClick={resetLoad}>
                {language.t("settings.modelsHub.load.reset")}
              </ButtonV2>
            </div>
            <SettingsListV2>
              <SettingsRowV2
                title={language.t("settings.modelsHub.auto.title")}
                description={language.t("settings.modelsHub.auto.description")}
              >
                <Switch checked={autoLoad()} onChange={(checked) => setLoad("auto", checked)} />
              </SettingsRowV2>
            </SettingsListV2>
            <Show when={autoLoad()}>
              <div class="lm-auto-summary">
                <Show
                  when={engineExtras()?.auto ? engineExtras()?.applied : undefined}
                  fallback={<span>{language.t("settings.modelsHub.auto.idle")}</span>}
                >
                  {(applied) => (
                    <span>
                      <b>{language.t("settings.modelsHub.auto.applied")}</b> · {engineStatus()?.modelName}:{" "}
                      {recommendationLine(applied())}
                    </span>
                  )}
                </Show>
                <span class="lm-auto-summary-note">{language.t("settings.modelsHub.auto.manualDisabled")}</span>
              </div>
            </Show>
            <div class="lm-load-manual" classList={{ "is-disabled": autoLoad() }}>
            <SettingsListV2>
              <SettingsRowV2
                title={language.t("settings.modelsHub.load.contextSize.title")}
                description={language.t("settings.modelsHub.load.contextSize.description")}
              >
                {loadNumber("contextSize", { min: 512, max: 262144, step: 512 })}
              </SettingsRowV2>
              <SettingsRowV2
                title={language.t("settings.modelsHub.load.gpuLayers.title")}
                description={language.t("settings.modelsHub.load.gpuLayers.description")}
              >
                {loadNumber("gpuLayers", { min: 0, max: 999 })}
              </SettingsRowV2>
              <SettingsRowV2
                title={language.t("settings.modelsHub.load.threads.title")}
                description={language.t("settings.modelsHub.load.threads.description")}
              >
                {loadNumber("threads", { min: 0, max: 256 })}
              </SettingsRowV2>
              <SettingsRowV2
                title={language.t("settings.modelsHub.load.batchSize.title")}
                description={language.t("settings.modelsHub.load.batchSize.description")}
              >
                {loadNumber("batchSize", { min: 0, max: 8192, step: 64 })}
              </SettingsRowV2>
              <SettingsRowV2
                title={language.t("settings.modelsHub.load.flashAttention.title")}
                description={language.t("settings.modelsHub.load.flashAttention.description")}
              >
                <SelectV2
                  appearance="inline"
                  options={[...flashOptions]}
                  current={load.flashAttention}
                  placement="bottom-end"
                  gutter={6}
                  label={(option) => language.t(`settings.modelsHub.load.choice.${option}` as Parameters<typeof language.t>[0])}
                  onSelect={(option) => option && setLoad("flashAttention", option)}
                />
              </SettingsRowV2>
              <SettingsRowV2
                title={language.t("settings.modelsHub.load.kvCacheType.title")}
                description={language.t("settings.modelsHub.load.kvCacheType.description")}
              >
                <SelectV2
                  appearance="inline"
                  options={[...kvOptions]}
                  current={load.kvCacheType}
                  placement="bottom-end"
                  gutter={6}
                  label={(option) => option}
                  onSelect={(option) => option && setLoad("kvCacheType", option)}
                />
              </SettingsRowV2>
              <SettingsRowV2
                title={language.t("settings.modelsHub.load.keepInMemory.title")}
                description={language.t("settings.modelsHub.load.keepInMemory.description")}
              >
                <Switch checked={load.keepInMemory} onChange={(checked) => setLoad("keepInMemory", checked)} />
              </SettingsRowV2>
              <SettingsRowV2
                title={language.t("settings.modelsHub.load.useMmap.title")}
                description={language.t("settings.modelsHub.load.useMmap.description")}
              >
                <Switch checked={load.useMmap} onChange={(checked) => setLoad("useMmap", checked)} />
              </SettingsRowV2>
              <SettingsRowV2
                title={language.t("settings.modelsHub.load.kvOffload.title")}
                description={language.t("settings.modelsHub.load.kvOffload.description")}
              >
                <Switch checked={load.kvOffload} onChange={(checked) => setLoad("kvOffload", checked)} />
              </SettingsRowV2>
              <SettingsRowV2
                title={language.t("settings.modelsHub.load.seed.title")}
                description={language.t("settings.modelsHub.load.seed.description")}
              >
                {loadNumber("seed", { min: -1 })}
              </SettingsRowV2>
              <SettingsRowV2
                title={language.t("settings.modelsHub.load.ropeFrequencyBase.title")}
                description={language.t("settings.modelsHub.load.ropeFrequencyBase.description")}
              >
                {loadNumber("ropeFrequencyBase", { min: 0, step: 1000 })}
              </SettingsRowV2>
              <SettingsRowV2
                title={language.t("settings.modelsHub.load.ropeFrequencyScale.title")}
                description={language.t("settings.modelsHub.load.ropeFrequencyScale.description")}
              >
                {loadNumber("ropeFrequencyScale", { min: 0, max: 8, step: 0.05 })}
              </SettingsRowV2>
              <SettingsRowV2
                title={language.t("settings.modelsHub.load.parallel.title")}
                description={language.t("settings.modelsHub.load.parallel.description")}
              >
                {loadNumber("parallel", { min: 1, max: 16 })}
              </SettingsRowV2>
            </SettingsListV2>
            </div>
            <p class="settings-v2-note">{language.t("settings.modelsHub.load.hint")}</p>
          </div>
        </Show>

        {/* 1. Telemetría de Hardware & Runtimes */}
        <Show when={hubTab() === "engines"}>
        <div class="lm-hub-telemetry">
          <div class="lm-hub-stat" data-state="info" title="GPU detectada">
            <span class="lm-hub-dot" />
            <span class="lm-hub-stat-k">{system()?.gpu ? system()!.gpu!.split(" ")[0] : "GPU"}</span>
            <span class="lm-hub-stat-v" title={`${formatBytes(vramFree())} libres de ${formatBytes(vramTotal())}`}>
              <Show when={vramTotal() !== undefined} fallback="—">
                {formatBytes(vramFree())} / {formatBytes(vramTotal())}
              </Show>
            </span>
          </div>

          <div class="lm-hub-stat" data-state="info" title="RAM del sistema">
            <span class="lm-hub-dot" />
            <span class="lm-hub-stat-k">RAM</span>
            <span class="lm-hub-stat-v">
              <Show when={ram() !== undefined} fallback="—">
                {formatBytes(ram())}
              </Show>
            </span>
          </div>

          <Show when={engineStatus()?.status === "running"}>
            <div class="lm-hub-stat" data-state="on" title="Motor Nativo activo">
              <span class="lm-hub-dot" />
              <span class="lm-hub-stat-k">Motor Nativo</span>
              <span class="lm-hub-stat-v">{engineStatus()?.modelName}</span>
              <button
                type="button"
                class="lm-hub-stat-stop"
                title="Detener motor y liberar VRAM"
                onClick={stopNativeEngine}
              >
                ✕
              </button>
            </div>
          </Show>

          <Show when={engineStatus()?.status === "starting" || engineStatus()?.binaryDownloading}>
            <div class="lm-hub-stat" data-state="pending">
              <span class="lm-hub-dot" />
              <span class="lm-hub-stat-k">Motor Nativo</span>
              <span class="lm-hub-stat-v">
                {engineStatus()?.binaryDownloading
                  ? `Descargando ${engineStatus()?.downloadProgress ?? 0}%`
                  : "Cargando en GPU"}
              </span>
            </div>
          </Show>

          {/* Runtimes Locales Externos (Ollama / LM Studio) */}
          <For each={(runtimes() ?? []).filter((r) => r.id === "ollama" || r.id === "lmstudio")}>
            {(rt) => (
              <div
                class="lm-hub-stat"
                data-state={rt.available ? "on" : "off"}
                title={rt.available ? `${rt.name} conectado${rt.port ? ` en puerto ${rt.port}` : ""}` : `${rt.name} no detectado`}
              >
                <span class="lm-hub-dot" />
                <span class="lm-hub-stat-k">{rt.name}</span>
                <span class="lm-hub-stat-v">{rt.available ? (rt.port ? `:${rt.port}` : "Online") : "Offline"}</span>
              </div>
            )}
          </For>
        </div>
        </Show>

        {/* 2. Buscador Central y Filtros */}
        <Show when={hubTab() === "explore"}>
        <div class="flex flex-col gap-2.5">
          <form
            class="lm-search-box w-full"
            onSubmit={(e) => {
              e.preventDefault()
              const val = query().trim()
              if (val) setSubmitted(val)
            }}
          >
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" class="lm-search-icon">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              type="text"
              class="lm-search-input py-2 text-sm"
              placeholder="Buscar modelos GGUF en Hugging Face (ej. DeepSeek-R1, Qwen2.5-Coder, Llama-3.2, Gemma-2)..."
              value={query()}
              onInput={(e) => handleSearchInput(e.currentTarget.value)}
            />
            <Show when={query()}>
              <button type="button" class="lm-search-clear mr-2 cursor-pointer" onClick={() => { setQuery(""); setSubmitted("") }}>×</button>
            </Show>
            <ButtonV2 type="submit" variant="contrast" size="small">
              {language.t("settings.modelsHub.search.button")}
            </ButtonV2>
          </form>

          <div class="flex items-center justify-between gap-2 flex-wrap text-xs">
            <div class="flex items-center gap-1.5 flex-wrap">
              <span class="lm-hub-filter-label">Sugeridos:</span>
              <For
                each={[
                  { label: "DeepSeek-R1", tag: "DeepSeek-R1-Distill", icon: "🐋", org: "deepseek-ai" },
                  { label: "Qwen 2.5 Coder", tag: "Qwen2.5-Coder", icon: "💻", org: "Qwen" },
                  { label: "Hermes 3", tag: "Hermes-3", icon: "🏛️", org: "NousResearch" },
                  { label: "Llama 3.2", tag: "Llama-3.2", icon: "🦙", org: "meta-llama" },
                  { label: "Gemma 2", tag: "gemma-2", icon: "💎", org: "google" },
                  { label: "Phi-4", tag: "Phi-4", icon: "🔬", org: "microsoft" },
                  { label: "Nemotron", tag: "Nemotron", icon: "⚡", org: "nvidia" },
                ]}
              >
                {(item) => (
                  <button
                    type="button"
                    class="lm-quick-tag"
                    onClick={() => {
                      setQuery(item.tag)
                      setSubmitted(item.tag)
                      setHubCategory("all")
                    }}
                  >
                    <HubOrgAvatar org={item.org} fallback={item.icon} />
                    <span>{item.label}</span>
                  </button>
                )}
              </For>
            </div>

            <div class="flex items-center gap-1.5">
              <button
                type="button"
                class="lm-pill-badge"
                classList={{ "lm-pill-active": hubCategory() === "downloaded" }}
                onClick={() => {
                  setHubCategory(hubCategory() === "downloaded" ? "all" : "downloaded")
                  setQuery("")
                  setSubmitted("")
                }}
              >
                ⬇️ Modelos en Disco ({localFiles().length || jobs().filter((j) => j.status === "completed").length})
              </button>
            </div>
          </div>
        </div>

        </Show>

        {/* 3. Área de Contenido Principal: Hero o Resultados Detallados */}
        <Show when={hubTab() === "explore"}>
        <div class="lm-hub-results">
          <Show
            when={submitted() || hubCategory() !== "all" || pageModelList().length > 0}
            fallback={
              /* Estado Inicial Hero Limpio: Sin saturar la pantalla */
              <div class="lm-hub-empty">
                <span class="lm-hub-empty-icon">🤗</span>
                <h3 class="lm-hub-empty-title">Explorador de Modelos Locales Hugging Face</h3>
                <p class="lm-hub-empty-body">
                  Escribe en el buscador o pulsa una etiqueta sugerida para buscar modelos en formato <strong>GGUF</strong> directamente desde Hugging Face y ver sus especificaciones completas, compatibilidad de GPU y cuantizaciones.
                </p>

                <div class="lm-hub-empty-grid">
                  <div class="lm-hub-empty-card">
                    <span class="lm-hub-empty-card-title">🎮 Aceleración por GPU</span>
                    <p class="lm-hub-empty-card-body">
                      <Show
                        when={vramTotal() !== undefined}
                        fallback="No hemos podido leer la GPU de este equipo, así que la insignia de compatibilidad de cada modelo se queda en «parcial» en vez de afirmar algo que no sabemos."
                      >
                        {system()?.gpu ? system()!.gpu!.split(" ")[0] : "GPU"} detectada con {formatBytes(vramFree())}{" "}
                        libres de {formatBytes(vramTotal())} de VRAM.
                      </Show>
                    </p>
                  </div>
                  <div class="lm-hub-empty-card">
                    <span class="lm-hub-empty-card-title">🧠 Descarga Híbrida RAM</span>
                    <p class="lm-hub-empty-card-body">
                      <Show when={ram() !== undefined} fallback="Memoria del sistema no disponible.">
                        Tu sistema tiene {formatBytes(ram())} de memoria RAM para albergar capas que sobrepasen la VRAM.
                      </Show>
                    </p>
                  </div>
                </div>

                <Show when={jobs().filter((j) => j.status === "completed").length > 0}>
                  <div class="lm-hub-empty-footer">
                    <span>Tienes modelos descargados listos para usar:</span>
                    <ButtonV2 variant="outline" size="small" onClick={() => setHubCategory("downloaded")}>
                      Ver {jobs().filter((j) => j.status === "completed").length} modelo(s) en disco ↗
                    </ButtonV2>
                  </div>
                </Show>
              </div>
            }
          >
            {/* Resultados de Búsqueda o Modelos Descargados */}
            <Show
              when={searchedModels.loading}
              fallback={
                <Show
                  when={pageModelList().length > 0}
                  fallback={
                    <Show
                      when={hubTab() === "disk"}
                      fallback={
                        <div class="lm-hub-empty">
                          <span class="lm-hub-empty-icon">🔍</span>
                          <span class="lm-hub-empty-title">No se encontraron modelos</span>
                          <p class="lm-hub-empty-body">Prueba con otro término de búsqueda o selecciona una de las etiquetas sugeridas.</p>
                        </div>
                      }
                    >
                      {/* The disk tab has nothing to search: it only lists what has been downloaded */}
                      <div class="lm-hub-empty">
                        <span class="lm-hub-empty-icon">💾</span>
                        <span class="lm-hub-empty-title">Todavía no hay modelos en disco</span>
                        <p class="lm-hub-empty-body">
                          Descarga uno desde Explorar y aparecerá aquí con su tamaño, cuantización y el botón para cargarlo o borrarlo.
                        </p>
                        <button type="button" class="lm-results-clear" onClick={() => setHubTab("explore")}>
                          Ir a Explorar
                        </button>
                      </div>
                    </Show>
                  }
                >
                  <div class="lm-results-bar">
                    <span>
                      {hubCategory() === "downloaded"
                        ? `Modelos descargados en disco (${activeModelList().length})`
                        : submitted()
                          ? `Resultados para "${submitted()}" (${activeModelList().length} modelos encontrados)`
                          : `Modelos destacados (${activeModelList().length})`}
                    </span>
                    <button
                      type="button"
                      class="lm-results-clear"
                      onClick={() => {
                        setSubmitted("")
                        setQuery("")
                        setHubCategory("all")
                      }}
                    >
                      ✕ Limpiar búsqueda
                    </button>
                  </div>

                  <For each={pageModelList()}>
                    {(model) => {
                      const authorName = () => model.author || (model.id.includes("/") ? model.id.split("/")[0] : "huggingface")
                      const shortName = () => model.id.split("/").pop() || model.id
                      const downloadCount = () => formatNumber(model.downloads)
                      const likesCount = () => formatNumber(model.likes)
                      const currentJob = () => getJobForModel(model)
                      const file = () => getSelectedFile(model)
                      const fit = () => compat(file()?.size)
                      const isDownloaded = () => currentJob()?.status === "completed"
                      // El badge sólo es cierto para los modelos de la lista curada, no para
                      // cualquier modelo que aparezca sin búsqueda activa (p.ej. los del disco).
                      const isStaffPick = () => STAFF_PICKS.some((pick) => pick.id === model.id)
                      if (model.quantFiles.some((qf) => asNumber(qf.size) === undefined)) void ensureFiles(model.id)

                      return (
                        <div class="lm-result-card">
                          {/* Top: BrandLogo + Info + Hugging Face link */}
                          <div class="lm-result-card-head">
                            <div class="lm-result-card-identity">
                              <HubAvatar id={model.id} author={authorName()} />
                              <div class="lm-result-card-titles">
                                <div class="lm-result-card-name-row">
                                  <span class="lm-result-card-name">{shortName()}</span>
                                  <Show when={isDownloaded()}>
                                    <span class="lm-downloaded-pill">Descargado</span>
                                  </Show>
                                  <Show when={isStaffPick()}>
                                    <span class="lm-staff-badge-sm">🌟 Staff Pick</span>
                                  </Show>
                                </div>
                                <div class="lm-result-card-meta">
                                  <span class="lm-result-card-author">@{authorName()}</span>
                                  <span>⬇ {downloadCount()} descargas</span>
                                  <span>❤️ {likesCount()}</span>
                                  <Tag>GGUF</Tag>
                                  <Show when={model.pipeline_tag}>
                                    <Tag>{model.pipeline_tag}</Tag>
                                  </Show>
                                </div>
                              </div>
                            </div>

                            <a
                              href={`https://huggingface.co/${model.id}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              class="lm-result-card-link"
                            >
                              <span>Hugging Face</span>
                              <span>↗</span>
                            </a>
                          </div>

                          {/* Description */}
                          <p class="lm-result-card-description">
                            {model.description || "Modelo cuantizado GGUF listo para ejecución local de alta fidelidad en Tiancode."}
                          </p>

                          {/* Quantization picker & Hardware Compatibility & Actions Strip */}
                          <div class="lm-result-card-footer">
                            <div class="lm-result-card-picker">
                              {/* Selector de cuantización */}
                              <span class="lm-result-card-quant-label">Cuantización:</span>
                              <Show
                                when={filesFor(model).length > 0}
                                fallback={<Tag>GGUF</Tag>}
                              >
                                <SelectV2
                                  appearance="inline"
                                  options={filesFor(model)}
                                  current={file()}
                                  value={(qf) => qf.file}
                                  label={(qf) => `${qf.quant || "GGUF"} (${sizeLabel(qf.size)})${qf.recommended ? " ★" : ""}`}
                                  onSelect={(qf) => qf && setModelQuant(model.id, qf.file)}
                                  placement="bottom-start"
                                  gutter={4}
                                />
                              </Show>

                              {/* Hardware Fit badge */}
                              <div class={`lm-compat-badge lm-compat-${fit()}`}>
                                <Show when={fit() === "full_gpu"}>⚡ {language.t("settings.modelsHub.fit.fullGpu")}</Show>
                                <Show when={fit() === "partial_gpu"}>⚡ {language.t("settings.modelsHub.fit.partialGpu")}</Show>
                                <Show when={fit() === "ram_only"}>🧠 {language.t("settings.modelsHub.fit.ramOnly")}</Show>
                                <Show when={fit() === "no_fit"}>⚠️ {language.t("settings.modelsHub.fit.noFit")}</Show>
                              </div>
                            </div>

                            {/* Actions */}
                            <div class="lm-result-card-actions">
                              <Show
                                when={isDownloaded()}
                                fallback={
                                  <Show
                                    when={currentJob()?.status === "downloading"}
                                    fallback={
                                      <button
                                        type="button"
                                        class="lm-btn-download-sm"
                                        onClick={() => startDownload(model.id, file().file)}
                                      >
                                        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
                                          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                                          <polyline points="7 10 12 15 17 10" />
                                          <line x1="12" y1="15" x2="12" y2="3" />
                                        </svg>
                                        <span>Descargar {sizeLabel(file()?.size)}</span>
                                      </button>
                                    }
                                  >
                                    <div class="lm-downloading-pill-sm">
                                      <span class="lm-spinner" />
                                      <span>{currentJob()?.percent ?? 0}% ({formatSpeed(currentJob()?.speedBytesPerSec)})</span>
                                    </div>
                                  </Show>
                                }
                              >
                                <button
                                  type="button"
                                  class="lm-btn-activate-sm"
                                  onClick={() => currentJob() && activateDownloadedModel(currentJob()!)}
                                >
                                  ⚡ Activar y Usar
                                </button>
                                <button
                                  type="button"
                                  class="lm-btn-delete-sm"
                                  onClick={() => currentJob() && removeDownload(currentJob()!)}
                                  title="Eliminar de disco"
                                >
                                  🗑️
                                </button>
                              </Show>
                            </div>
                          </div>
                        </div>
                      )
                    }}
                  </For>

                  <Show when={hubTotal() > 1}>
                    <div class="mt-2 mb-4">
                      <SettingsPagerV2
                        page={hubPage()}
                        totalPages={hubTotal()}
                        onPage={setHubPage}
                      />
                    </div>
                  </Show>
                </Show>
              }
            >
              <div class="lm-hub-empty">
                <span class="lm-spinner lm-hub-empty-spinner" />
                <span class="lm-hub-empty-title">Consultando Hugging Face...</span>
                <p class="lm-hub-empty-body">Obteniendo archivos GGUF y compatibilidad de hardware.</p>
              </div>
            </Show>
          </Show>
        </div>

        {/* Cajón Inferior de Descargas Activas y Gestión de Disco */}
        </Show>

        <Show when={hubTab() === "disk"}>
          <div class="lm-disk">
            <div class="lm-disk-head">
              <div>
                <h3 class="settings-v2-section-title">{language.t("settings.modelsHub.disk.title")}</h3>
                <p class="settings-v2-note lm-load-note">{language.t("settings.modelsHub.disk.description")}</p>
              </div>
              <ButtonV2 type="button" variant="outline" size="small" disabled={localLoading()} onClick={() => void refreshLocal()}>
                {language.t("settings.modelsHub.disk.rescan")}
              </ButtonV2>
            </div>
          <Show when={jobs().some((j) => j.status !== "completed")}>
          <div class="lm-downloads-drawer">
            <div class="lm-downloads-drawer-header">
              <span class="lm-downloads-drawer-title">Descargas en curso ({jobs().filter((j) => j.status !== "completed").length})</span>
            </div>
            <div class="lm-downloads-drawer-list">
              <For each={jobs().filter((j) => j.status !== "completed")}>
                {(j) => {
                  const percent = () => asNumber(j.percent) ?? (j.status === "completed" ? 100 : 0)
                  const speed = () => formatSpeed(j.speedBytesPerSec)
                  const eta = () => formatEta(j.etaSeconds)

                  return (
                    <div class="lm-drawer-item" data-status={j.status}>
                      <div class="lm-drawer-item-info">
                        <span class="lm-drawer-item-name">{j.file}</span>
                        <span class="lm-drawer-item-sub">
                          {j.status === "completed" ? "✓ Completado" : `${j.status} · ${percent()}%`}
                          {speed() ? ` · ⚡ ${speed()}` : ""}
                          {eta() ? ` · ⏱️ ${eta()}` : ""}
                        </span>
                      </div>

                      <Show when={j.status === "downloading" || j.status === "paused"}>
                        <div class="lm-drawer-progress-bar">
                          <div class="lm-drawer-progress-fill" style={{ width: `${percent()}%` }} />
                        </div>
                      </Show>

                      <div class="lm-drawer-item-actions">
                        <Show when={j.status === "paused" || j.status === "failed"}>
                          <button
                            type="button"
                            class="lm-btn-sm-activate"
                            data-variant="resume"
                            onClick={() => startDownload(j.model, j.file)}
                          >
                            ▶ Reanudar
                          </button>
                        </Show>
                        <Show when={j.status === "completed"}>
                          <button type="button" class="lm-btn-sm-activate" onClick={() => activateDownloadedModel(j)}>
                            ⚡ Activar y Usar
                          </button>
                        </Show>
                        <button type="button" class="lm-btn-sm-delete" onClick={() => removeDownload(j)}>
                          Eliminar de disco
                        </button>
                      </div>
                    </div>
                  )
                }}
              </For>
            </div>
          </div>
          </Show>

            <Show
              when={localFiles().length > 0}
              fallback={
                <div class="lm-hub-empty">
                  <span class="lm-hub-empty-icon">💾</span>
                  <span class="lm-hub-empty-title">{language.t("settings.modelsHub.disk.empty")}</span>
                  <button type="button" class="lm-results-clear" onClick={() => setHubTab("explore")}>
                    Ir a Explorar
                  </button>
                </div>
              }
            >
              <div class="lm-disk-list">
                <For each={localFiles()}>
                  {(entry) => {
                    const job = () => jobs().find((j) => j.status === "completed" && j.file === entry.file)
                    const loaded = () =>
                      engineStatus()?.status === "running" &&
                      (engineStatus()?.modelPath ?? "").toLowerCase() === entry.path.toLowerCase()
                    const author = () => entry.repo?.split("/")[0] ?? "local"
                    return (
                      <div class="lm-disk-card" data-loaded={loaded()}>
                        <div class="lm-disk-card-head">
                          <HubAvatar id={entry.repo ?? entry.name} author={author()} />
                          <div class="lm-result-card-titles">
                            <div class="lm-result-card-name-row">
                              <span class="lm-result-card-name">{entry.name}</span>
                              <Show when={loaded()}>
                                <span class="lm-downloaded-pill">{language.t("settings.modelsHub.disk.active")}</span>
                              </Show>
                            </div>
                            <div class="lm-result-card-meta">
                              <Show when={entry.repo}>
                                <span class="lm-result-card-author">@{entry.repo}</span>
                              </Show>
                              <span>{formatBytes(entry.sizeBytes)}</span>
                              <Tag>{entry.quant ?? "GGUF"}</Tag>
                              <Show when={entry.metadata?.architecture}>
                                <Tag>{entry.metadata!.architecture}</Tag>
                              </Show>
                              <Show when={entry.metadata?.sizeLabel}>
                                <Tag>{entry.metadata!.sizeLabel}</Tag>
                              </Show>
                            </div>
                          </div>
                          <div class={`lm-compat-badge lm-compat-${entry.fit?.tier ?? "partial_gpu"}`}>{fitLabel(entry.fit?.tier)}</div>
                        </div>
                        <div class="lm-disk-card-facts">
                          <span>
                            <b>{language.t("settings.modelsHub.disk.folder")}</b> {entry.root}
                          </span>
                          <Show when={entry.metadata?.contextLength}>
                            <span>
                              <b>{language.t("settings.modelsHub.disk.trainContext")}</b> {formatTokens(entry.metadata!.contextLength!)}
                            </span>
                          </Show>
                          <Show when={entry.metadata?.blockCount}>
                            <span>
                              <b>{language.t("settings.modelsHub.disk.layers")}</b> {entry.metadata!.blockCount}
                            </span>
                          </Show>
                        </div>
                        <Show when={entry.recommended}>
                          {(rec) => (
                            <div class="lm-disk-card-rec">
                              <span class="lm-disk-card-rec-title">
                                {language.t("settings.modelsHub.disk.recommended")} · {placementLabel(rec().placement)}
                              </span>
                              <span class="lm-disk-card-rec-values">{recommendationLine(rec())}</span>
                              <span class="lm-disk-card-rec-why">
                                {rec()
                                  .reasons.map((code) => language.t(`settings.modelsHub.reason.${code}`))
                                  .join(" ")}
                              </span>
                            </div>
                          )}
                        </Show>
                        <div class="lm-disk-card-actions">
                          <button
                            type="button"
                            class="lm-btn-activate-sm"
                            onClick={() =>
                              void activateDownloadedModel({ model: entry.repo ?? "local", file: entry.file, path: entry.path })
                            }
                          >
                            ⚡ {language.t("settings.modelsHub.disk.activate")}
                          </button>
                          <Show when={job()}>
                            {(j) => (
                              <button type="button" class="lm-btn-delete-sm" onClick={() => void removeDownload(j())}>
                                {language.t("settings.modelsHub.disk.delete")}
                              </button>
                            )}
                          </Show>
                        </div>
                      </div>
                    )
                  }}
                </For>
              </div>
            </Show>
            <p class="settings-v2-note lm-disk-note">{language.t("settings.modelsHub.disk.smallModelNote")}</p>
          </div>
        </Show>
      </div>
    </>
  )
}
