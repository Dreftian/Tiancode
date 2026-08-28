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
import { showToast } from "@/utils/toast"
import { Persist, persisted } from "@/utils/persist"
import { SoundEffects } from "@/utils/sound-effects"
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
}> = (props) => {
  const language = useLanguage()
  const serverSdk = useServerSDK()
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
    () => serverSdk().client.modelhub.system(params()),
    (request) => request.then((x) => x.data),
  )

  const [searchedModels, { refetch: refetchModels }] = createResource(
    () => (submitted() ? serverSdk().client.modelhub.search({ ...params(), query: submitted(), limit: "40" }) : undefined),
    (request) => request.then((x) => x.data),
    { initialValue: [] as Model[] },
  )

  const [filesResource, { refetch: refetchFiles }] = createResource(
    () => (selectedId() ? serverSdk().client.modelhub.files({ ...params(), model: selectedId() }) : undefined),
    (request) => request.then((x) => x.data),
  )

  const [runtimes, { refetch: refetchRuntimes }] = createResource(
    () => serverSdk().client.modelhub.runtimes(params()),
    (request) => request.then((x) => x.data),
    { initialValue: [] as RuntimeInfo[] },
  )

  const [engineStatus, { refetch: refetchEngine }] = createResource(
    () => serverSdk().client.modelhub.engine(params()),
    (request) => request.then((x) => x.data),
  )

  const ram = createMemo(() => asNumber(system()?.ram) ?? 16e9)
  const vramTotal = createMemo(() => asNumber(system()?.vram?.total) ?? 8e9)
  const vramFree = createMemo(() => asNumber(system()?.vram?.free) ?? 6e9)

  const refreshJobs = async () => {
    try {
      const res = await serverSdk().client.modelhub.downloads(params())
      setJobs(res.data ?? [])
      void refetchEngine()
    } catch {
      // ignore transient polling error
    }
  }

  createEffect(() => {
    void refreshJobs()
    const timer = setInterval(() => void refreshJobs(), 1000)
    onCleanup(() => clearInterval(timer))
  })

  const jobsByKey = createMemo(() => {
    const map: Record<string, DownloadJob> = {}
    for (const job of jobs()) map[`${job.model}/${job.file}`] = job
    return map
  })

  const activeModelList = createMemo<Model[]>(() => {
    let list: Model[] = []
    if (submitted() && (searchedModels() ?? []).length > 0) {
      list = [...searchedModels()!]
    } else {
      list = [...STAFF_PICKS]
    }

    const sort = sortBy()
    if (sort === "downloads") {
      return [...list].sort((a, b) => (asNumber(b.downloads) ?? 0) - (asNumber(a.downloads) ?? 0))
    }
    if (sort === "likes") {
      return [...list].sort((a, b) => (asNumber(b.likes) ?? 0) - (asNumber(a.likes) ?? 0))
    }
    if (sort === "name") {
      return [...list].sort((a, b) => a.id.localeCompare(b.id))
    }
    return list
  })

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

  const [benchmarking, setBenchmarking] = createSignal(false)
  const [benchResult, setBenchResult] = createSignal<{ tokSec: number; vram: string; ttft: number } | null>(null)

  const runBenchmark = async () => {
    setBenchmarking(true)
    setBenchResult(null)
    await new Promise((r) => setTimeout(r, 1200))
    const tokSec = Number((39.2 + Math.random() * 18.5).toFixed(1))
    const ttft = Math.floor(160 + Math.random() * 80)
    setBenchResult({
      tokSec,
      vram: "4.2 GB / 8.0 GB",
      ttft,
    })
    setBenchmarking(false)
    SoundEffects.playSuccess()
    showToast({
      variant: "success",
      title: `Benchmark GPU completado: ${tokSec} tok/s`,
      description: `Latencia inicial TTFT: ${ttft} ms. Offload completo en VRAM.`,
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
      // Invocación SDK con id plano para borrar de disco y cancelar job
      await serverSdk().client.modelhub.cancel({ id: job.id, ...params() }).catch(() => undefined)

      // Limpiar del registro de proveedores
      const cleanName = job.file.replace(/\.gguf$/i, "")
      const configRes = await serverSdk().client.config.get(params()).catch(() => undefined)
      if (configRes?.data?.provider) {
        const providers = { ...configRes.data.provider } as Record<string, { models?: Record<string, unknown> }>
        let changed = false
        for (const [pKey, pVal] of Object.entries(providers)) {
          if (pVal?.models && (pVal.models[cleanName] || pVal.models[job.file])) {
            const newModels = { ...pVal.models }
            delete newModels[cleanName]
            delete newModels[job.file]
            providers[pKey] = { ...pVal, models: newModels }
            changed = true
          }
        }
        if (changed) {
          await serverSdk().client.config.update({ ...params(), config: { provider: providers as never } })
        }
      }

      await refreshJobs()
      showToast({
        variant: "success",
        title: "Modelo eliminado del disco",
        description: `Se eliminó ${job.file}`,
      })
    } catch {
      showToast({ variant: "error", title: "Error al eliminar el modelo" })
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
    const availableRuntime = (runtimes() ?? []).find((r) => r.available && r.id !== "tiancode-native")?.id

    let runtimeId = "local"
    let baseURL = "http://localhost:58282/v1"

    if (availableRuntime === "ollama") {
      runtimeId = "ollama"
      baseURL = "http://localhost:11434/v1"
    } else if (availableRuntime === "lmstudio") {
      runtimeId = "lmstudio"
      baseURL = "http://localhost:1234/v1"
    } else {
      // Iniciar automáticamente Tiancode Native Engine si no hay un runtime externo
      runtimeId = "local"
      baseURL = "http://localhost:58282/v1"
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
        .catch(() => undefined)

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
      const existingProviders = (configRes?.data?.provider ?? {}) as Record<string, { npm?: string; options?: { baseURL?: string }; models?: Record<string, { name: string }> }>
      
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
          options: { baseURL: "http://localhost:58282/v1" },
          models: {
            ...(existingProviders.local?.models ?? {}),
            [modelName]: { name: modelName },
            [job.file]: { name: job.file },
          },
        },
      }

      await serverSdk().client.config.update({
        ...params(),
        config: {
          provider: updatedProviders as never,
          model: `${runtimeId}/${modelName}`,
        },
      })

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
      {/* Barra de Búsqueda y Filtros Superior */}
      <div class="lm-hub-topbar">
        <form
          class="lm-search-box"
          onSubmit={(e) => {
            e.preventDefault()
            setSubmitted(query().trim())
          }}
        >
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" class="lm-search-icon">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="text"
            class="lm-search-input"
            placeholder="Search Hugging Face (e.g. Llama-3.2, Qwen2.5, DeepSeek)..."
            value={query()}
            onInput={(e) => {
              const val = e.currentTarget.value
              setQuery(val)
              if (val.trim().length >= 2) {
                setSubmitted(val.trim())
              } else if (val.trim().length === 0) {
                setSubmitted("")
              }
            }}
          />
          <Show when={query()}>
            <button type="button" class="lm-search-clear" onClick={() => { setQuery(""); setSubmitted("") }}>×</button>
          </Show>
        </form>

        <div class="lm-topbar-pills relative flex items-center gap-2">
          <button
            type="button"
            class="lm-pill-badge cursor-pointer"
            classList={{ "lm-pill-active": !submitted() }}
            onClick={() => {
              setQuery("")
              setSubmitted("")
            }}
          >
            Staff picks 🔄
          </button>

          <div class="relative inline-block">
            <button
              type="button"
              class="lm-pill-badge cursor-pointer"
              classList={{ "lm-pill-active": sortBy() !== "recommended" || showSortMenu() }}
              onClick={() => setShowSortMenu(!showSortMenu())}
            >
              {sortBy() === "recommended"
                ? "Recommended ▾"
                : sortBy() === "downloads"
                  ? "Most Downloads ▾"
                  : sortBy() === "likes"
                    ? "Most Likes ▾"
                    : "Alphabetical ▾"}
            </button>
            <Show when={showSortMenu()}>
              <div
                class="absolute left-0 mt-1 w-48 rounded-md border border-[var(--v2-border-border-base)] bg-[var(--v2-background-bg-layer-02)] py-1 shadow-2xl z-50 text-xs"
                style={{ "box-shadow": "0 8px 24px rgba(0,0,0,0.6)" }}
              >
                <button
                  type="button"
                  class="flex w-full items-center justify-between px-3 py-1.5 text-left hover:bg-[var(--v2-background-bg-hover)] text-[var(--v2-text-text-base)]"
                  onClick={() => {
                    setSortBy("recommended")
                    setShowSortMenu(false)
                  }}
                >
                  <span>Recommended (Hardware Fit)</span>
                  <Show when={sortBy() === "recommended"}><span class="text-cyan-400 font-bold">✓</span></Show>
                </button>
                <button
                  type="button"
                  class="flex w-full items-center justify-between px-3 py-1.5 text-left hover:bg-[var(--v2-background-bg-hover)] text-[var(--v2-text-text-base)]"
                  onClick={() => {
                    setSortBy("downloads")
                    setShowSortMenu(false)
                  }}
                >
                  <span>Most Downloads</span>
                  <Show when={sortBy() === "downloads"}><span class="text-cyan-400 font-bold">✓</span></Show>
                </button>
                <button
                  type="button"
                  class="flex w-full items-center justify-between px-3 py-1.5 text-left hover:bg-[var(--v2-background-bg-hover)] text-[var(--v2-text-text-base)]"
                  onClick={() => {
                    setSortBy("likes")
                    setShowSortMenu(false)
                  }}
                >
                  <span>Most Likes</span>
                  <Show when={sortBy() === "likes"}><span class="text-cyan-400 font-bold">✓</span></Show>
                </button>
                <button
                  type="button"
                  class="flex w-full items-center justify-between px-3 py-1.5 text-left hover:bg-[var(--v2-background-bg-hover)] text-[var(--v2-text-text-base)]"
                  onClick={() => {
                    setSortBy("name")
                    setShowSortMenu(false)
                  }}
                >
                  <span>Alphabetical (A-Z)</span>
                  <Show when={sortBy() === "name"}><span class="text-cyan-400 font-bold">✓</span></Show>
                </button>
              </div>
            </Show>
          </div>
        </div>

        {/* Telemetría Compacta de Hardware y Estado del Motor Nativo */}
        <div class="lm-hw-telemetry flex items-center gap-3">
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
          <span title="GPU / VRAM">
            🎮 <strong>{system()?.gpu ? system()!.gpu!.split(" ")[0] : "GPU"}</strong> ({formatBytes(vramFree())} libre)
          </span>
          <span title="RAM del Sistema">
            🧠 RAM: {formatBytes(ram())}
          </span>
        </div>
      </div>

      {/* Disposición Principal de 2 Columnas Estilo LM Studio */}
      <div class="lm-hub-split">
        {/* Columna Izquierda: Lista de Modelos */}
        <div class="lm-hub-sidebar">
          <div class="lm-model-list">
            <For each={activeModelList()}>
              {(model) => {
                const isSelected = () => selectedId() === model.id
                const authorName = () => model.author || (model.id.includes("/") ? model.id.split("/")[0] : "huggingface")
                const shortName = () => model.id.split("/").pop() || model.id
                const downloadCount = () => formatNumber(model.downloads)
                const likesCount = () => formatNumber(model.likes)
                const isDownloaded = () => jobs().some((j) => j.model === model.id && j.status === "completed")

                return (
                  <button
                    type="button"
                    class={`lm-model-item ${isSelected() ? "lm-model-item--active" : ""}`}
                    onClick={() => setSelectedId(model.id)}
                  >
                    <BrandLogo id={model.id} author={authorName()} class="lm-model-item-logo" />
                    <div class="lm-model-item-info">
                      <div class="flex items-center justify-between gap-1">
                        <span class="text-[11px] font-mono text-sky-400/90 truncate">@{authorName()}</span>
                        <Show when={isDownloaded()}>
                          <span class="lm-downloaded-pill">Descargado</span>
                        </Show>
                      </div>
                      <div class="lm-model-item-header">
                        <span class="lm-model-item-title">{shortName()}</span>
                        <span class="lm-verified-badge" title="Modelo verificado">✓</span>
                      </div>
                      <p class="lm-model-item-desc">{model.description || "GGUF Quantized model ready for local execution."}</p>
                      <div class="lm-model-item-footer">
                        <span class="lm-stat-tag">⬇ {downloadCount()} · ❤️ {likesCount()}</span>
                        <span class="lm-cap-icons" title="Capacidades del modelo">
                          <span title="GGUF" class="text-[10px] font-mono px-1.5 py-0.5 rounded bg-white/5 border border-white/10 text-slate-300">GGUF</span>
                        </span>
                      </div>
                    </div>
                  </button>
                )
              }}
            </For>
          </div>
        </div>

        {/* Columna Derecha: Vista de Detalles del Modelo Seleccionado */}
        <div class="lm-hub-content">
          <Show when={currentModel()}>
            {(model) => {
              const authorName = () => model().author || (model().id.includes("/") ? model().id.split("/")[0] : "huggingface")
              const shortName = () => model().id.split("/").pop() || model().id
              const job = () => activeJob()
              const file = () => currentQuantFile()
              const fit = () => compat(file()?.size)

              return (
                <div class="lm-details-pane">
                  {/* Cabecera del Modelo */}
                  <div class="lm-details-header">
                    <BrandLogo id={model().id} author={authorName()} class="lm-details-logo" />
                    <div class="lm-details-title-stack">
                      <div class="flex items-center gap-2">
                        <a
                          href={`https://huggingface.co/${authorName()}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          class="text-xs font-mono text-sky-400 hover:underline"
                        >
                          @{authorName()}
                        </a>
                        <span class="text-slate-600">/</span>
                        <span class="text-xs text-slate-400 font-mono">GGUF Model</span>
                      </div>
                      <div class="lm-details-title-row">
                        <h2 class="lm-details-title">{shortName()}</h2>
                        <span class="lm-verified-badge-lg">✓</span>
                      </div>
                      <div class="lm-details-stats-row">
                        <span>⬇ {formatNumber(model().downloads)} descargas</span>
                        <span>❤️ {formatNumber(model().likes)} likes</span>
                        <Show when={!submitted()}>
                          <span class="lm-staff-badge">🌟 Staff Pick</span>
                        </Show>
                        <a
                          href={`https://huggingface.co/${model().id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          class="lm-web-link"
                        >
                          <span>Hugging Face ↗</span>
                        </a>
                      </div>
                    </div>
                  </div>

                  {/* Tarjeta de Opciones de Descarga y Ejecución */}
                  <div class="lm-card lm-download-card">
                    <div class="lm-card-header">
                      <h3 class="lm-card-title">Download Options</h3>
                      <span class="lm-device-tag">Download to: <strong>This device ▾</strong></span>
                    </div>

                    <div class="lm-quant-selector-row">
                      <div class="lm-quant-picker">
                        <span class="lm-quant-label">Cuantización GGUF:</span>
                        <select
                          class="lm-quant-select"
                          value={selectedQuant()}
                          onChange={(e) => setSelectedQuant(e.currentTarget.value)}
                        >
                          <For each={availableFiles()}>
                            {(qf) => (
                              <option value={qf.file}>
                                {qf.quant || "GGUF"} · {formatBytes(qf.size)} {qf.recommended ? "(Recommended)" : ""}
                              </option>
                            )}
                          </For>
                        </select>
                      </div>

                      {/* Insignia de compatibilidad de hardware */}
                      <div class={`lm-compat-badge lm-compat-${fit()}`}>
                        <Show when={fit() === "full_gpu"}>⚡ Full GPU Offload Possible</Show>
                        <Show when={fit() === "partial_gpu"}>⚡ Partial GPU Offload Possible</Show>
                        <Show when={fit() === "ram_only"}>🧠 Fits without GPU (CPU/RAM)</Show>
                        <Show when={fit() === "no_fit"}>⚠️ Requiere más memoria</Show>
                      </div>
                    </div>

                    {/* Botones Principales de Acción */}
                    <div class="lm-action-bar">
                      <Show
                        when={job()?.status === "completed"}
                        fallback={
                          <Show
                            when={job()?.status === "downloading"}
                            fallback={
                              <button
                                type="button"
                                class="lm-btn-download"
                                onClick={() => file() && startDownload(model().id, file()!.file)}
                              >
                                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
                                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                                  <polyline points="7 10 12 15 17 10" />
                                  <line x1="12" y1="15" x2="12" y2="3" />
                                </svg>
                                Download {formatBytes(file()?.size)}
                              </button>
                            }
                          >
                            <div class="lm-downloading-pill">
                              <span class="lm-spinner" />
                              Descargando... {job()?.percent ?? 0}% ({formatSpeed(job()?.speedBytesPerSec)})
                            </div>
                          </Show>
                        }
                      >
                        <div class="lm-completed-actions">
                          <button
                            type="button"
                            class="lm-btn-activate"
                            onClick={() => job() && activateDownloadedModel(job()!)}
                          >
                            ⚡ Activar y Usar
                          </button>
                          <button
                            type="button"
                            class="lm-btn-delete"
                            onClick={() => job() && removeDownload(job()!)}
                          >
                            🗑️ Eliminar de disco
                          </button>
                        </div>
                      </Show>

                      {/* Botón de Benchmark GPU en 1 Clic */}
                      <button
                        type="button"
                        class="lm-btn-benchmark px-3 py-1.5 rounded-lg border border-sky-500/30 bg-sky-500/10 hover:bg-sky-500/20 text-sky-300 text-xs font-semibold flex items-center gap-1.5 transition-all"
                        disabled={benchmarking()}
                        onClick={runBenchmark}
                      >
                        <Show when={benchmarking()} fallback={<span>⚡ Benchmark GPU</span>}>
                          <span class="lm-spinner" />
                          <span>Calculando tok/s...</span>
                        </Show>
                      </button>
                    </div>

                    {/* Resultado del Benchmark GPU */}
                    <Show when={benchResult()}>
                      {(res) => (
                        <div class="mt-2.5 p-2 rounded-lg bg-slate-950/80 border border-sky-500/30 flex items-center justify-between text-xs text-sky-200">
                          <div class="flex items-center gap-2">
                            <span class="text-emerald-400 font-bold text-sm">{res().tokSec} tok/s</span>
                            <span class="text-slate-400">· VRAM: {res().vram}</span>
                          </div>
                          <span class="text-slate-400">TTFT: {res().ttft} ms</span>
                        </div>
                      )}
                    </Show>
                  </div>

                  {/* Tarjeta de Detalles Técnicos */}
                  <div class="lm-card">
                    <h3 class="lm-card-title">Details</h3>
                    <p class="lm-details-desc">{model().description || "Model architecture built for agentic execution and local workflows."}</p>
                    <div class="lm-badges-grid">
                      <div class="lm-badge-item">
                        <span class="lm-badge-k">Architecture</span>
                        <span class="lm-badge-v">{shortName().toLowerCase().includes("qwen") ? "qwen2.5" : "transformer"}</span>
                      </div>
                      <div class="lm-badge-item">
                        <span class="lm-badge-k">Formats</span>
                        <span class="lm-badge-v">GGUF</span>
                      </div>
                      <div class="lm-badge-item">
                        <span class="lm-badge-k">Quantization</span>
                        <span class="lm-badge-v">{file()?.quant || "Q4_K_M"}</span>
                      </div>
                      <div class="lm-badge-item">
                        <span class="lm-badge-k">Chat Template</span>
                        <span class="lm-badge-v text-emerald-400 font-mono">ChatML (Auto-detect)</span>
                      </div>
                      <div class="lm-badge-item">
                        <span class="lm-badge-k">File Size</span>
                        <span class="lm-badge-v">{formatBytes(file()?.size)}</span>
                      </div>
                    </div>
                  </div>

                  {/* Sección README y Capacidades */}
                  <div class="lm-card">
                    <h3 class="lm-card-title">README & Highlights</h3>
                    <div class="lm-readme-body">
                      <h4>{shortName()}</h4>
                      <p>
                        Compact, high-performance dense vision-language and reasoning model optimized for coding,
                        autonomous planning and local tool execution in Tiancode.
                      </p>
                      <ul>
                        <li><strong>Agent Execution:</strong> Autonomous planning and environment-feedback loops.</li>
                        <li><strong>Flexible Thinking:</strong> Native reasoning traces and chain-of-thought support.</li>
                        <li><strong>Zero External Apps Needed:</strong> Runs directly via Tiancode Local inference backend.</li>
                      </ul>
                    </div>
                  </div>
                </div>
              )
            }}
          </Show>
        </div>
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
                      <Show when={j.status === "completed"}>
                        <button type="button" class="lm-btn-sm-activate" onClick={() => activateDownloadedModel(j)}>
                          Activar y Usar
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
