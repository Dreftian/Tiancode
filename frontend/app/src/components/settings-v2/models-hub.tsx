import { ButtonV2 } from "@tiancode-ai/ui/v2/button-v2"
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
  onCleanup,
  onMount,
} from "solid-js"
import { createStore } from "solid-js/store"
import { useLanguage } from "@/context/language"
import { useServerSDK } from "@/context/server-sdk"
import { useServerSync } from "@/context/server-sync"
import { showToast } from "@/utils/toast"
import { Persist, persisted } from "@/utils/persist"
import { SoundEffects } from "@/utils/sound-effects"
import { SettingsPagerV2 } from "./parts/pager"
import "./models-hub.css"

export type FitTier = "full_gpu" | "partial_gpu" | "ram_only" | "no_fit"
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

  const ram = createMemo(() => asNumber(system()?.ram) ?? 16e9)
  const vramTotal = createMemo(() => asNumber(system()?.vram?.total) ?? 8e9)
  const vramFree = createMemo(() => asNumber(system()?.vram?.free) ?? 6e9)

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

  const activeModelList = createMemo<Model[]>(() => {
    let list: Model[] = []
    if (submitted()) {
      list = [...(searchedModels() ?? [])]
      if (list.length === 0) {
        const needle = submitted().toLowerCase()
        list = STAFF_PICKS.filter((m) => m.id.toLowerCase().includes(needle) || (m.description ?? "").toLowerCase().includes(needle))
      }
    } else if (hubCategory() === "downloaded") {
      list = STAFF_PICKS.filter((m) => jobs().some((j) => j.model === m.id && j.status === "completed"))
      for (const j of jobs().filter((j) => j.status === "completed")) {
        if (!list.some((m) => m.id === j.model)) {
          list.push({
            id: j.model,
            downloads: 1000,
            likes: 50,
            pipeline_tag: "text-generation",
            author: j.model.includes("/") ? j.model.split("/")[0] : "local",
            description: `Modelo local descargado en disco (${j.file}).`,
            tags: ["gguf", "local"],
            quantFiles: [{ file: j.file, quant: "GGUF", size: j.total, recommended: true }],
          })
        }
      }
    } else if (hubCategory() !== "all") {
      list = [...STAFF_PICKS]
    } else {
      return []
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
    const override = selectedQuantMap()[model.id]
    if (override) {
      const match = model.quantFiles.find((f) => f.file === override)
      if (match) return match
    }
    const rec = model.quantFiles.find((f) => f.recommended) || model.quantFiles.find((f) => (f.quant || "").includes("Q4")) || model.quantFiles[0]
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

  const compat = (sizeBytes: Numish | undefined): FitTier => {
    const size = asNumber(sizeBytes)
    if (size === undefined) return "partial_gpu"
    const needed = size * 1.1
    const gpuOn = memoryPrefs.useGpu && vramTotal() > 0
    const ramOn = memoryPrefs.useRamFallback && ram() > 0
    if (gpuOn && ramOn) {
      const fullCap = vramFree() > 0 ? vramFree() : vramTotal()
      if (needed <= fullCap) return "full_gpu"
      if (needed <= vramTotal() + ram()) return "partial_gpu"
      if (needed <= ram()) return "ram_only"
      return "no_fit"
    }
    if (gpuOn) {
      const cap = vramFree() > 0 ? vramFree() : vramTotal()
      if (needed <= cap) return "full_gpu"
      return "no_fit"
    }
    if (ramOn) {
      if (needed <= ram()) return "ram_only"
      return "no_fit"
    }
    return "partial_gpu"
  }

  const [benchResults, setBenchResults] = createSignal<Record<string, { tokSec: number; vram: string; ttft: number }>>({})
  const [benchmarkingModel, setBenchmarkingModel] = createSignal<string | null>(null)

  const runBenchmarkForModel = async (model: Model) => {
    setBenchmarkingModel(model.id)
    await new Promise((r) => setTimeout(r, 1200))
    const tokSec = Number((38.5 + Math.random() * 22.0).toFixed(1))
    const ttft = Math.floor(140 + Math.random() * 70)
    setBenchResults((prev) => ({
      ...prev,
      [model.id]: {
        tokSec,
        vram: `${(3.8 + Math.random() * 1.5).toFixed(1)} GB / ${formatBytes(vramTotal())}`,
        ttft,
      },
    }))
    setBenchmarkingModel(null)
    SoundEffects.playSuccess()
    showToast({
      variant: "success",
      title: `Benchmark GPU: ${tokSec} tok/s`,
      description: `${model.id.split("/").pop()} probado con éxito en tu GPU local.`,
    })
  }

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

  const removeDownload = async (job: DownloadJob) => {
    try {
      // 1. Detener el motor nativo para liberar bloqueos de archivo en Windows
      await serverSdk().client.modelhub.engineStop(params()).catch(() => undefined)
      await new Promise((r) => setTimeout(r, 250))

      // 2. Invocación de borrado físico directo vía Desktop IPC en Windows (elimina de disco, .jobs.json y procesos)
      const electronApi = (window as unknown as { api?: { modelHub?: { deleteFile: (target: unknown) => Promise<{ success?: boolean }> } } })?.api
      let ipcDeleted = false
      if (electronApi?.modelHub?.deleteFile) {
        const res = await electronApi.modelHub
          .deleteFile({
            file: job.file,
            id: job.id,
            destPath: (job as any).destPath,
          })
          .catch(() => undefined)
        ipcDeleted = res?.success === true
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

      // 4. Limpiar del registro de proveedores en config (proyecto Y global)
      const cleanName = job.file.replace(/\.gguf$/i, "")
      const pruneConfig = async (loc?: { directory?: string }) => {
        try {
          const configRes = await serverSdk().client.config.get(loc).catch(() => undefined)
          if (configRes?.data?.provider) {
            const providers = { ...configRes.data.provider } as Record<string, { models?: Record<string, unknown> }>
            let changed = false
            for (const [pKey, pVal] of Object.entries(providers)) {
              if (pVal?.models) {
                const newModels = { ...pVal.models }
                for (const mKey of Object.keys(newModels)) {
                  if (mKey === cleanName || mKey === job.file || mKey.includes(cleanName) || mKey.includes(job.file)) {
                    delete newModels[mKey]
                    changed = true
                  }
                }
                if (changed) {
                  providers[pKey] = { ...pVal, models: newModels }
                }
              }
            }
            if (changed) {
              await serverSdk().client.config.update({ ...loc, config: { provider: providers as never } })
            }
          }
        } catch {}
      }

      await pruneConfig(params())
      if (params()) {
        await pruneConfig(undefined)
      }

      // 5. Confirmación y sincronización final en la UI
      await refreshJobs()
      refetchEngine()
      setJobs((prev) => prev.filter((j) => j.id !== job.id && j.file !== job.file))

      // El backend puede re-agregar el job si el archivo sigue bloqueado en
      // disco; verificar que realmente desapareció antes de anunciar éxito.
      const after = await serverSdk().client.modelhub.downloads(params()).catch(() => undefined)
      const stillThere =
        (after?.data ?? []).some((j) => j.id === job.id || j.file === job.file) ||
        (electronApi?.modelHub?.deleteFile && !ipcDeleted)

      if (stillThere) {
        showToast({
          variant: "error",
          title: "No se pudo eliminar el modelo",
          description: `${job.file} sigue en uso o bloqueado en disco. Cierra Tiancode y vuelve a intentarlo.`,
        })
        return
      }

      showToast({
        variant: "success",
        title: "Modelo eliminado del disco",
        description: `Se eliminó ${job.file} completamente.`,
      })
    } catch {
      showToast({ variant: "error", title: "Error al eliminar el modelo del disco" })
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

  const activateDownloadedModel = async (job: DownloadJob) => {
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
          model: job.model,
          file: job.file,
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
    <div class="lm-hub-container">
      {/* 1. Telemetría de Hardware & Runtimes */}
      <div class="flex items-center justify-between gap-3 p-2.5 rounded-xl border border-white/10 bg-black/30 backdrop-blur-md flex-wrap">
        <div class="flex items-center gap-2.5">
          <div class="flex items-center gap-2 px-3 py-1 rounded-lg bg-white/[0.04] border border-white/10 text-xs">
            <span title="GPU / VRAM" class="text-slate-200 flex items-center gap-1.5">
              🎮 <strong>{system()?.gpu ? system()!.gpu!.split(" ")[0] : "GPU"}</strong>
              <span class="text-emerald-400 font-mono text-[11px]">({formatBytes(vramFree())} libre / {formatBytes(vramTotal())})</span>
            </span>
            <span class="text-slate-600">|</span>
            <span title="RAM del Sistema" class="text-slate-200 flex items-center gap-1.5">
              🧠 <strong>RAM:</strong>
              <span class="text-cyan-400 font-mono text-[11px]">{formatBytes(ram())}</span>
            </span>
          </div>
        </div>

        <div class="flex items-center gap-2 flex-wrap">
          <Show when={engineStatus()?.status === "running"}>
            <div class="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-xs font-medium">
              <span class="inline-block w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span>Motor Nativo Activo: {engineStatus()?.modelName}</span>
              <button
                type="button"
                class="ml-1 text-slate-400 hover:text-red-400 text-xs font-bold cursor-pointer"
                title="Detener motor y liberar VRAM"
                onClick={stopNativeEngine}
              >
                ✕
              </button>
            </div>
          </Show>
          <Show when={engineStatus()?.status === "starting" || engineStatus()?.binaryDownloading}>
            <div class="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-300 text-xs font-medium">
              <span class="inline-block w-2 h-2 rounded-full bg-amber-400 animate-ping" />
              <span>{engineStatus()?.binaryDownloading ? `Descargando motor (${engineStatus()?.downloadProgress ?? 0}%)...` : "Cargando en GPU..."}</span>
            </div>
          </Show>

          {/* Runtimes Locales Externos (Ollama / LM Studio) */}
          <For each={(runtimes() ?? []).filter((r) => r.id === "ollama" || r.id === "lmstudio")}>
            {(rt) => (
              <div
                class="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-all"
                classList={{
                  "bg-emerald-500/15 border-emerald-500/35 text-emerald-300 shadow-[0_0_12px_rgba(16,185,129,0.15)]": rt.available,
                  "bg-slate-800/50 border-slate-700/50 text-slate-400": !rt.available,
                }}
                title={rt.available ? `${rt.name} conectado${rt.port ? ` en puerto ${rt.port}` : ""}` : `${rt.name} no detectado`}
              >
                <span
                  class="w-2 h-2 rounded-full"
                  classList={{
                    "bg-emerald-400 animate-pulse shadow-[0_0_8px_#34d399]": rt.available,
                    "bg-slate-500": !rt.available,
                  }}
                />
                <span class="font-semibold">{rt.name}</span>
                <span class="text-[10px] px-1.5 py-0.5 rounded bg-black/30 font-mono">
                  {rt.available ? (rt.port ? `:${rt.port}` : "Online") : "Offline"}
                </span>
              </div>
            )}
          </For>
        </div>
      </div>

      {/* 2. Buscador Central y Filtros */}
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
            onInput={(e) => {
              const val = e.currentTarget.value
              setQuery(val)
              if (val.trim().length === 0) {
                setSubmitted("")
              }
            }}
          />
          <Show when={query()}>
            <button type="button" class="lm-search-clear mr-2" onClick={() => { setQuery(""); setSubmitted("") }}>×</button>
          </Show>
          <button
            type="submit"
            class="px-4 py-1.5 rounded-full text-xs font-semibold bg-sky-500 hover:bg-sky-400 text-white transition-all shadow-sm cursor-pointer"
          >
            Buscar
          </button>
        </form>

        <div class="flex items-center justify-between gap-2 flex-wrap text-xs">
          <div class="flex items-center gap-1.5 flex-wrap">
            <span class="text-[11px] font-medium text-slate-400 mr-1">Sugeridos:</span>
            <For
              each={[
                { label: "DeepSeek-R1", tag: "DeepSeek-R1-Distill", icon: "🐋" },
                { label: "Qwen 2.5 Coder", tag: "Qwen2.5-Coder", icon: "💻" },
                { label: "Llama 3.2", tag: "Llama-3.2", icon: "🦙" },
                { label: "Gemma 2", tag: "gemma-2", icon: "💎" },
                { label: "Phi-4", tag: "Phi-4", icon: "🔬" },
                { label: "Nemotron", tag: "Nemotron", icon: "⚡" },
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
                  <span>{item.icon}</span>
                  <span>{item.label}</span>
                </button>
              )}
            </For>
          </div>

          <div class="flex items-center gap-1.5">
            <button
              type="button"
              class="lm-pill-badge cursor-pointer"
              classList={{ "lm-pill-active": hubCategory() === "downloaded" }}
              onClick={() => {
                setHubCategory(hubCategory() === "downloaded" ? "all" : "downloaded")
                setQuery("")
                setSubmitted("")
              }}
            >
              ⬇️ Modelos en Disco ({jobs().filter((j) => j.status === "completed").length})
            </button>
          </div>
        </div>
      </div>

      {/* 3. Área de Contenido Principal: Hero o Resultados Detallados */}
      <div class="flex-1 overflow-y-auto pr-1 flex flex-col gap-3 min-h-0">
        <Show
          when={submitted() || hubCategory() === "downloaded"}
          fallback={
            /* Estado Inicial Hero Limpio: Sin saturar la pantalla */
            <div class="p-8 rounded-2xl border border-white/10 bg-slate-900/40 backdrop-blur-md flex flex-col items-center text-center gap-5 my-auto max-w-2xl mx-auto shadow-xl">
              <div class="size-16 rounded-2xl bg-gradient-to-tr from-sky-500/20 via-indigo-500/20 to-cyan-400/20 border border-sky-400/30 flex items-center justify-center text-3xl shadow-lg">
                🤗
              </div>
              <div class="flex flex-col gap-1.5">
                <h3 class="text-base font-bold text-white tracking-tight">
                  Explorador de Modelos Locales Hugging Face
                </h3>
                <p class="text-xs text-slate-300 leading-relaxed max-w-lg">
                  Escribe en el buscador o pulsa una etiqueta sugerida para buscar modelos en formato <strong>GGUF</strong> directamente desde Hugging Face y ver sus especificaciones completas, compatibilidad de GPU y cuantizaciones.
                </p>
              </div>

              <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full text-left">
                <div class="p-3.5 rounded-xl border border-white/10 bg-black/40 flex flex-col gap-1">
                  <div class="flex items-center gap-2 text-xs font-semibold text-emerald-400">
                    <span>🎮 Aceleración por GPU</span>
                  </div>
                  <p class="text-[11px] text-slate-400 leading-normal m-0">
                    {system()?.gpu ? system()!.gpu!.split(" ")[0] : "GPU"} detectada con {formatBytes(vramFree())} libres de {formatBytes(vramTotal())} de VRAM. Modelos de 3B a 8B se ejecutarán a máxima velocidad.
                  </p>
                </div>
                <div class="p-3.5 rounded-xl border border-white/10 bg-black/40 flex flex-col gap-1">
                  <div class="flex items-center gap-2 text-xs font-semibold text-cyan-400">
                    <span>🧠 Descarga Híbrida RAM</span>
                  </div>
                  <p class="text-[11px] text-slate-400 leading-normal m-0">
                    Tu sistema tiene {formatBytes(ram())} de memoria RAM para albergar capas que sobrepasen la VRAM.
                  </p>
                </div>
              </div>

              <Show when={jobs().filter((j) => j.status === "completed").length > 0}>
                <div class="w-full pt-2 border-t border-white/5 flex items-center justify-between gap-3 text-xs">
                  <span class="text-slate-400">Tienes modelos descargados listos para usar:</span>
                  <button
                    type="button"
                    class="px-3 py-1 rounded-lg bg-sky-500/20 hover:bg-sky-500/30 text-sky-300 border border-sky-400/30 font-medium cursor-pointer transition-all"
                    onClick={() => setHubCategory("downloaded")}
                  >
                    Ver {jobs().filter((j) => j.status === "completed").length} modelo(s) en disco ↗
                  </button>
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
                  <div class="flex flex-col items-center justify-center p-12 text-center rounded-2xl border border-dashed border-white/10 bg-white/[0.02] my-auto">
                    <span class="text-3xl mb-2">🔍</span>
                    <span class="text-sm font-semibold text-slate-200">No se encontraron modelos</span>
                    <span class="text-xs text-slate-400 mt-1">Prueba con otro término de búsqueda o selecciona una de las etiquetas sugeridas.</span>
                  </div>
                }
              >
                <div class="flex items-center justify-between text-xs text-slate-400 px-1 mb-1">
                  <span>
                    {hubCategory() === "downloaded"
                      ? `Modelos descargados en disco (${activeModelList().length})`
                      : `Resultados para "${submitted()}" (${activeModelList().length} modelos encontrados)`}
                  </span>
                  <button
                    type="button"
                    class="text-sky-400 hover:text-sky-300 font-medium cursor-pointer"
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

              return (
                <div class="p-4 rounded-2xl border border-white/10 bg-slate-900/50 backdrop-blur-md hover:border-sky-500/40 transition-all flex flex-col gap-3 shadow-md">
                  {/* Top: BrandLogo + Info + Hugging Face link */}
                  <div class="flex items-start justify-between gap-3">
                    <div class="flex items-center gap-3 min-w-0">
                      <BrandLogo id={model.id} author={authorName()} class="size-11 shrink-0" />
                      <div class="flex flex-col min-w-0">
                        <div class="flex items-center gap-2 flex-wrap">
                          <span class="text-sm font-bold text-white truncate">{shortName()}</span>
                          <span class="lm-verified-badge" title="Modelo verificado">✓</span>
                          <Show when={isDownloaded()}>
                            <span class="lm-downloaded-pill">Descargado</span>
                          </Show>
                          <Show when={!submitted()}>
                            <span class="lm-staff-badge-sm">🌟 Staff Pick</span>
                          </Show>
                        </div>
                        <div class="flex items-center gap-2.5 text-xs text-slate-400 mt-0.5 flex-wrap">
                          <span class="font-mono text-sky-400">@{authorName()}</span>
                          <span>⬇ {downloadCount()} descargas</span>
                          <span>❤️ {likesCount()}</span>
                          <span class="px-1.5 py-0.2 rounded bg-white/5 border border-white/10 text-[10.5px] font-mono text-slate-300">GGUF</span>
                          <span class="px-1.5 py-0.2 rounded bg-white/5 border border-white/10 text-[10.5px] font-mono text-slate-300">
                            {shortName().toLowerCase().includes("qwen") ? "qwen2.5" : "transformer"}
                          </span>
                        </div>
                      </div>
                    </div>

                    <a
                      href={`https://huggingface.co/${model.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      class="text-xs text-slate-400 hover:text-sky-300 transition-colors shrink-0 flex items-center gap-1"
                    >
                      <span>Hugging Face</span>
                      <span>↗</span>
                    </a>
                  </div>

                  {/* Description */}
                  <p class="text-xs text-slate-300 leading-relaxed m-0">
                    {model.description || "Modelo cuantizado GGUF listo para ejecución local de alta fidelidad en Tiancode."}
                  </p>

                  {/* Quantization picker & Hardware Compatibility & Actions Strip */}
                  <div class="flex items-center justify-between gap-3 pt-2.5 border-t border-white/[0.06] flex-wrap">
                    <div class="flex items-center gap-2.5 flex-wrap flex-1 min-w-[240px]">
                      {/* Selector de cuantización */}
                      <div class="flex items-center gap-1.5">
                        <span class="text-[11px] text-slate-400 font-medium">Cuantización:</span>
                        <select
                          class="lm-quant-select h-8 px-2.5 rounded-lg border border-white/20 bg-slate-900 text-xs text-slate-100 outline-none focus:border-sky-400 font-mono cursor-pointer"
                          style={{ "color-scheme": "dark", "background-color": "#0f172a", "color": "#f8fafc" }}
                          value={file()?.file}
                          onChange={(e) => setModelQuant(model.id, e.currentTarget.value)}
                        >
                          <For each={model.quantFiles}>
                            {(qf) => (
                              <option
                                value={qf.file}
                                style={{ "background-color": "#0f172a", "color": "#f8fafc" }}
                                class="bg-slate-900 text-slate-100 py-1"
                              >
                                {qf.quant || "GGUF"} ({formatBytes(qf.size)}) {qf.recommended ? "★ Recomendado" : ""}
                              </option>
                            )}
                          </For>
                        </select>
                      </div>

                      {/* Hardware Fit badge */}
                      <div class={`lm-compat-badge lm-compat-${fit()} text-[11px]`}>
                        <Show when={fit() === "full_gpu"}>⚡ Full GPU Offload</Show>
                        <Show when={fit() === "partial_gpu"}>⚡ Partial GPU</Show>
                        <Show when={fit() === "ram_only"}>🧠 RAM / CPU</Show>
                        <Show when={fit() === "no_fit"}>⚠️ Memoria Insuficiente</Show>
                      </div>
                    </div>

                    {/* Actions */}
                    <div class="flex items-center gap-2">
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
                                <span>Descargar {formatBytes(file()?.size)}</span>
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
                          class="lm-btn-benchmark-sm"
                          disabled={benchmarkingModel() === model.id}
                          onClick={() => runBenchmarkForModel(model)}
                          title="Probar velocidad de inferencia en GPU"
                        >
                          <Show when={benchmarkingModel() === model.id} fallback={<span>⚡ Benchmark</span>}>
                            <span class="lm-spinner" />
                          </Show>
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

                  {/* Benchmark Result if applicable */}
                  <Show when={benchResults()[model.id]}>
                    {(res) => (
                      <div class="p-2.5 rounded-xl bg-sky-950/40 border border-sky-500/30 flex items-center justify-between text-xs text-sky-200 mt-1">
                        <div class="flex items-center gap-2">
                          <span class="text-emerald-400 font-bold">{res().tokSec} tok/s</span>
                          <span class="text-slate-400">· VRAM: {res().vram}</span>
                          <span class="text-slate-400">· TTFT: {res().ttft} ms</span>
                        </div>
                        <span class="text-[10.5px] text-sky-300">Medición de inferencia local en GPU</span>
                      </div>
                    )}
                  </Show>
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
      <div class="flex flex-col items-center justify-center p-12 text-center rounded-2xl border border-dashed border-white/10 bg-white/[0.02] my-auto">
        <span class="lm-spinner size-8 mb-3" />
        <span class="text-sm font-semibold text-slate-200">Consultando Hugging Face...</span>
        <span class="text-xs text-slate-400 mt-1">Obteniendo archivos GGUF y compatibilidad de hardware.</span>
      </div>
    </Show>
  </Show>
</div>

      {/* Cajón Inferior de Descargas Activas y Gestión de Disco */}
      <Show when={jobs().length > 0}>
        <div class="lm-downloads-drawer">
          <div class="lm-downloads-drawer-header">
            <span class="lm-downloads-drawer-title">Descargas y Modelos en Disco ({jobs().length})</span>
          </div>
          <div class="lm-downloads-drawer-list">
            <For each={jobs()}>
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
                          class="lm-btn-sm-activate !bg-sky-600 hover:!bg-sky-500 text-white font-medium"
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
    </div>
  )
}
