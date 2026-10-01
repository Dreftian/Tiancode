import { ButtonV2 } from "@tiancode-ai/ui/v2/button-v2"
import { SegmentedControlItemV2, SegmentedControlV2 } from "@tiancode-ai/ui/v2/segmented-control-v2"
import { SelectV2 } from "@tiancode-ai/ui/v2/select-v2"
import { Switch } from "@tiancode-ai/ui/v2/switch-v2"
import { TextInputV2 } from "@tiancode-ai/ui/v2/text-input-v2"
import { useDialog } from "@tiancode-ai/ui/context/dialog"
import type { FitTier } from "@tiancode-ai/core/model-fit"
import { type Component, createEffect, createMemo, createResource, For, type JSX, on, onCleanup, Show } from "solid-js"
import { createStore, reconcile } from "solid-js/store"
import { useLanguage } from "@/context/language"
import { usePlatform } from "@/context/platform"
import { useServerSDK } from "@/context/server-sdk"
import { useServerSync } from "@/context/server-sync"
import type { dict } from "@/i18n/en"
import { showToast } from "@/utils/toast"
import { SettingsConfirmDialog } from "./parts/confirm-dialog"
import { SettingsHubHeader } from "./parts/hub-header"
import { SettingsListV2 } from "./parts/list"
import { SettingsRowV2 } from "./parts/row"
import "./models-hub.css"

export type { FitTier } from "@tiancode-ai/core/model-fit"

// The generated SDK spells numbers as `number | "NaN" | …`; only real numbers are shown.
type Numish = number | "NaN" | "Infinity" | "-Infinity"
const asNumber = (value: Numish | undefined): number | undefined => (typeof value === "number" ? value : undefined)

type HubTab = "explore" | "disk" | "engine" | "settings"
type Fit = { tier: FitTier; label: string }

type QuantFile = { file: string; quant?: string; size?: Numish; fit?: Fit; recommended?: boolean }
type HubModel = { id: string; downloads?: Numish; likes?: Numish; pipeline_tag?: string; quantFiles: QuantFile[] }
type DownloadJob = {
  id: string
  model: string
  file: string
  status: "downloading" | "paused" | "completed" | "failed"
  error?: string
  percent?: Numish
  speedBytesPerSec?: Numish
  etaSeconds?: Numish
  total?: Numish
  received?: Numish
}
type Recommendation = {
  contextSize: number
  gpuLayers: number
  threads: number
  kvCacheType?: string
  layers?: number
  estimatedBytes?: number
  placement: "gpu" | "hybrid" | "cpu"
  vramBytes?: number
  ramBytes?: number
  reasons: string[]
}
type LocalFile = {
  path: string
  file: string
  name: string
  repo?: string
  sizeBytes: number
  quant?: string
  fit?: Fit
  metadata?: {
    architecture?: string
    sizeLabel?: string
    contextLength?: number
    blockCount?: number
    hasChatTemplate: boolean
  }
  recommended?: Recommendation
  error?: string
}
type Estimate = { recommended?: Recommendation; error?: string }

// What the panel edits. Numbers are text so an empty field means "automatic" or "the model's own".
type Defaults = {
  auto: boolean
  vramBudget: number
  ramBudget: number
  cpuBudget: number
  placement: "auto" | "gpu" | "hybrid" | "cpu"
  idleUnloadMinutes: number
  lightweight: "auto" | "always" | "never"
  flashAttention: "auto" | "on" | "off"
  kvCacheType: "f16" | "q8_0" | "q4_0"
  keepInMemory: boolean
  useMmap: boolean
  kvOffload: boolean
  contextSize: string
  gpuLayers: string
  threads: string
  batchSize: string
  parallel: string
  ubatchSize: string
  threadsBatch: string
  nCpuMoe: string
  seed: string
  ropeFrequencyBase: string
  ropeFrequencyScale: string
  loadTimeoutMinutes: string
}

const NUMERIC = [
  "contextSize",
  "gpuLayers",
  "threads",
  "batchSize",
  "parallel",
  "ubatchSize",
  "threadsBatch",
  "nCpuMoe",
  "seed",
  "ropeFrequencyBase",
  "ropeFrequencyScale",
  "loadTimeoutMinutes",
] as const
type NumericKey = (typeof NUMERIC)[number]

const FACTORY: Defaults = {
  auto: true,
  vramBudget: 90,
  ramBudget: 60,
  cpuBudget: 75,
  placement: "auto",
  idleUnloadMinutes: 10,
  lightweight: "auto",
  flashAttention: "auto",
  kvCacheType: "f16",
  keepInMemory: false,
  useMmap: true,
  kvOffload: true,
  contextSize: "",
  gpuLayers: "",
  threads: "",
  batchSize: "",
  parallel: "",
  ubatchSize: "",
  threadsBatch: "",
  nCpuMoe: "",
  seed: "",
  ropeFrequencyBase: "",
  ropeFrequencyScale: "",
  loadTimeoutMinutes: "",
}

// Well-known GGUF repositories to start from; their files and sizes are read live from Hugging Face.
const PICKS = [
  { id: "Qwen/Qwen2.5-Coder-7B-Instruct-GGUF", note: "settings.modelsHub.pick.coder" },
  { id: "unsloth/Qwen3-8B-GGUF", note: "settings.modelsHub.pick.reasoning" },
  { id: "unsloth/gemma-3-4b-it-GGUF", note: "settings.modelsHub.pick.compact" },
  { id: "bartowski/Llama-3.2-3B-Instruct-GGUF", note: "settings.modelsHub.pick.fast" },
  { id: "bartowski/DeepSeek-R1-Distill-Qwen-7B-GGUF", note: "settings.modelsHub.pick.thinking" },
  { id: "unsloth/gpt-oss-20b-GGUF", note: "settings.modelsHub.pick.large" },
] as const

const BUDGETS = {
  vramBudget: [50, 60, 70, 80, 90, 100],
  ramBudget: [30, 40, 50, 60, 70, 80],
  cpuBudget: [25, 50, 75, 100],
} as const
const IDLE_MINUTES = [0, 5, 10, 30, 60]

const formatBytes = (bytes: Numish | undefined) => {
  const value = asNumber(bytes)
  if (value === undefined || !(value > 0)) return "—"
  const units = ["B", "KB", "MB", "GB", "TB"]
  const index = Math.min(units.length - 1, Math.floor(Math.log(value) / Math.log(1024)))
  const scaled = value / 1024 ** index
  return `${scaled.toFixed(scaled >= 10 || index === 0 ? 0 : 1)} ${units[index]}`
}

const formatCount = (value: Numish | undefined) => {
  const n = asNumber(value)
  if (n === undefined) return undefined
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`
  return String(n)
}

const formatTokens = (tokens: number) => (tokens >= 1024 ? `${Math.round(tokens / 1024)}k` : String(tokens))

const formatEta = (seconds: Numish | undefined) => {
  const s = asNumber(seconds)
  if (s === undefined || s <= 0) return undefined
  if (s < 60) return `${Math.round(s)} s`
  const minutes = Math.floor(s / 60)
  if (minutes < 60) return `${minutes} min`
  return `${Math.floor(minutes / 60)} h ${minutes % 60} min`
}

const modelKey = (file: string) => file.replace(/\.gguf$/i, "")

// "C:/x/models/llama.gguf" and "c:\\x\\models\\llama.gguf" are the same file on Windows.
const samePath = (a: string | undefined, b: string | undefined) =>
  Boolean(a && b) && a!.replaceAll("\\", "/").toLowerCase() === b!.replaceAll("\\", "/").toLowerCase()

/** Settings › Modelos locales: find GGUF models, run them with the built-in llama.cpp engine. */
export const SettingsModelsHubV2: Component<{ directory?: string; active?: boolean }> = (props) => {
  const language = useLanguage()
  const platform = usePlatform()
  const serverSdk = useServerSDK()
  const serverSync = useServerSync()
  const dialog = useDialog()
  const params = () => (props.directory ? { directory: props.directory } : undefined)
  const hub = () => serverSdk().client.modelhub
  const t = (key: string, vars?: Record<string, string | number>) => language.t(key as keyof typeof dict, vars)

  const [ui, setUi] = createStore({
    tab: "explore" as HubTab,
    query: "",
    submitted: "",
    selected: PICKS[0].id as string,
    quant: {} as Record<string, string>,
    files: {} as Record<string, QuantFile[] | "loading">,
    estimates: {} as Record<string, Estimate | "loading">,
    jobs: [] as DownloadJob[],
    local: [] as LocalFile[],
    localLoading: false,
    busy: "",
    logs: undefined as string[] | undefined,
    dirInput: "",
  })
  const [form, setForm] = createStore<Defaults>({ ...FACTORY })
  const [loaded, setLoaded] = createStore({ defaults: false })

  // ------------------------------------------------------------------ server state

  const [system, { refetch: refetchSystem }] = createResource(async () =>
    hub()
      .system(params())
      .then((res) => res.data)
      .catch(() => undefined),
  )
  const [engine, { refetch: refetchEngine }] = createResource(async () =>
    hub()
      .engine(params())
      .then((res) => res.data)
      .catch(() => undefined),
  )
  const [runtimes] = createResource(async () =>
    hub()
      .runtimes(params())
      .then((res) => (res.data ?? []).filter((runtime) => runtime.id !== "local"))
      .catch(() => []),
  )
  const [results] = createResource(
    () => ui.submitted,
    async (query) =>
      query
        ? hub()
            .search({ ...params(), query, limit: "30" })
            .then((res) => (res.data ?? []) as HubModel[])
            .catch(() => [] as HubModel[])
        : [],
    { initialValue: [] as HubModel[] },
  )

  const refreshJobs = () =>
    hub()
      .downloads(params())
      // Keyed, so polling updates the rows in place instead of recreating them (and their buttons).
      .then((res) => setUi("jobs", reconcile((res.data ?? []) as DownloadJob[], { key: "id" })))
      .catch(() => undefined)

  const refreshLocal = async () => {
    setUi("localLoading", true)
    await hub()
      .local(params())
      .then((res) => setUi("local", reconcile((res.data ?? []) as LocalFile[], { key: "path" })))
      .catch(() => undefined)
    setUi("localLoading", false)
  }

  // Downloads and the engine are polled only while this panel is open; faster while something moves.
  createEffect(() => {
    if (props.active === false) return
    void refreshJobs()
    void refreshLocal()
    const busy = () =>
      ui.jobs.some((job) => job.status === "downloading") ||
      engine()?.status === "starting" ||
      engine()?.binaryDownloading === true ||
      ui.tab === "engine"
    let timer: ReturnType<typeof setTimeout> | undefined
    const tick = () => {
      void refreshJobs()
      void refetchEngine()
      timer = setTimeout(tick, busy() ? 2000 : 8000)
    }
    timer = setTimeout(tick, 2000)
    onCleanup(() => clearTimeout(timer))
  })

  // A finished download shows up on disk without a manual rescan.
  createEffect(
    on(
      () => ui.jobs.filter((job) => job.status === "completed").length,
      () => void refreshLocal(),
      { defer: true },
    ),
  )

  // ------------------------------------------------------------------ defaults (server is the truth)

  const fromServer = (data: Record<string, unknown>): Defaults => {
    const next: Defaults = { ...FACTORY }
    const pick = <K extends keyof Defaults>(key: K, allowed: readonly Defaults[K][]) => {
      const value = data[key] as Defaults[K]
      if (allowed.includes(value)) next[key] = value
    }
    next.auto = data.auto !== false
    for (const key of ["vramBudget", "ramBudget", "cpuBudget", "idleUnloadMinutes"] as const) {
      if (typeof data[key] === "number") next[key] = data[key] as number
    }
    pick("placement", ["auto", "gpu", "hybrid", "cpu"])
    pick("lightweight", ["auto", "always", "never"])
    pick("kvCacheType", ["f16", "q8_0", "q4_0"])
    next.flashAttention = data.flashAttention === true ? "on" : data.flashAttention === false ? "off" : "auto"
    next.keepInMemory = data.keepInMemory === true
    next.useMmap = data.useMmap !== false
    next.kvOffload = data.kvOffload !== false
    for (const key of NUMERIC) {
      if (typeof data[key] === "number") next[key] = String(data[key])
    }
    return next
  }

  const numberValue = (key: NumericKey) => {
    const text = form[key].trim()
    if (!text) return undefined
    const value = Number(text)
    // gpuLayers 0 (CPU only) and seed 0 are real choices; everything else must be positive.
    if (!Number.isFinite(value) || value < 0 || (value === 0 && key !== "gpuLayers" && key !== "seed")) return undefined
    return value
  }
  const invalid = (key: NumericKey) => form[key].trim() !== "" && numberValue(key) === undefined

  const toServer = () => ({
    auto: form.auto,
    vramBudget: form.vramBudget,
    ramBudget: form.ramBudget,
    cpuBudget: form.cpuBudget,
    placement: form.placement,
    idleUnloadMinutes: form.idleUnloadMinutes,
    lightweight: form.lightweight,
    kvCacheType: form.kvCacheType,
    flashAttention: form.flashAttention === "auto" ? undefined : form.flashAttention === "on",
    keepInMemory: form.keepInMemory || undefined,
    useMmap: form.useMmap ? undefined : false,
    kvOffload: form.kvOffload ? undefined : false,
    ...Object.fromEntries(NUMERIC.map((key) => [key, numberValue(key)]).filter(([, value]) => value !== undefined)),
  })

  void hub()
    .engineDefaults(params())
    .then((res) => {
      if (res.data) setForm(fromServer(res.data as unknown as Record<string, unknown>))
    })
    .catch(() => undefined)
    .finally(() => setLoaded("defaults", true))

  // Saved shortly after the last change, so typing a number is one save, not one per key.
  let saveTimer: ReturnType<typeof setTimeout> | undefined
  createEffect(
    on(
      () => JSON.stringify(toServer()),
      (body) => {
        if (!loaded.defaults) return
        if (saveTimer) clearTimeout(saveTimer)
        saveTimer = setTimeout(() => {
          void hub()
            .engineDefaultsSet({ ...params(), ...JSON.parse(body) })
            .catch(() => showToast({ variant: "error", title: t("settings.modelsHub.settings.saveFailed") }))
        }, 700)
      },
      { defer: true },
    ),
  )
  onCleanup(() => saveTimer && clearTimeout(saveTimer))

  // ------------------------------------------------------------------ explore

  let searchTimer: ReturnType<typeof setTimeout> | undefined
  const search = (value: string) => {
    setUi("query", value)
    if (searchTimer) clearTimeout(searchTimer)
    searchTimer = setTimeout(() => setUi("submitted", value.trim()), 400)
  }
  onCleanup(() => searchTimer && clearTimeout(searchTimer))

  const models = createMemo<HubModel[]>(() =>
    ui.submitted ? results() : PICKS.map((pick) => ({ id: pick.id, quantFiles: [] })),
  )
  const pickNote = (id: string) => PICKS.find((pick) => pick.id === id)?.note
  const selectedModel = createMemo(() => models().find((model) => model.id === ui.selected) ?? models()[0])

  // The full file list (exact sizes, sub-folders) is read once per repository, when it is opened.
  const ensureFiles = async (id: string) => {
    if (ui.files[id]) return
    setUi("files", id, "loading")
    const files = await hub()
      .files({ ...params(), model: id })
      .then((res) => (res.data ?? []) as QuantFile[])
      .catch(() => [] as QuantFile[])
    setUi("files", id, files)
  }
  createEffect(() => {
    const model = selectedModel()
    if (model) void ensureFiles(model.id)
  })

  const filesOf = (model: HubModel) => {
    const cached = ui.files[model.id]
    return Array.isArray(cached) && cached.length > 0 ? cached : model.quantFiles
  }
  const quantOf = (model: HubModel) => {
    const files = filesOf(model)
    return files.find((file) => file.file === ui.quant[model.id]) ?? files.find((file) => file.recommended) ?? files[0]
  }

  // The requirements of one quantisation come from its remote GGUF header: read only for the one
  // the user is looking at, never for every card (that was megabytes per result).
  const ensureEstimate = async (model: string, file: string) => {
    const key = `${model}/${file}`
    if (ui.estimates[key]) return
    setUi("estimates", key, "loading")
    const estimate = await hub()
      .estimate({ ...params(), model, file })
      .then((res) => (res.data ?? { error: "unavailable" }) as Estimate)
      .catch(() => ({ error: "unavailable" }) as Estimate)
    setUi("estimates", key, estimate)
  }
  createEffect(() => {
    const model = selectedModel()
    const quant = model && quantOf(model)
    if (model && quant) void ensureEstimate(model.id, quant.file)
  })
  const estimateOf = (model: string, file: string) => {
    const entry = ui.estimates[`${model}/${file}`]
    return entry === "loading" ? "loading" : entry
  }

  const jobFor = (model: string, file: string) => ui.jobs.find((job) => job.model === model && job.file === file)
  const onDisk = (file: string) => ui.local.some((local) => local.file === file.split("/").at(-1))

  const startDownload = async (model: string, file: string) => {
    const job = await hub()
      .download({ ...params(), model, file })
      .then((res) => res.data as DownloadJob | undefined)
      .catch(() => undefined)
    if (!job || job.status === "failed") {
      showToast({ variant: "error", title: t("settings.modelsHub.toast.downloadFailed"), description: job?.error })
      return
    }
    showToast({ variant: "success", title: t("settings.modelsHub.toast.downloadStarted"), description: file.split("/").at(-1) })
    void refreshJobs()
  }

  const cancelJob = async (job: DownloadJob) => {
    await hub()
      .cancel({ ...params(), id: job.id })
      .catch(() => undefined)
    void refreshJobs()
  }

  // ------------------------------------------------------------------ disk & engine actions

  const running = (file: LocalFile) => engine()?.status === "running" && samePath(engine()?.modelPath, file.path)

  const load = async (file: LocalFile) => {
    setUi("busy", file.path)
    const status = await hub()
      .engineStart({ ...params(), model: file.repo ?? file.name, file: file.path })
      .then((res) => res.data)
      .catch((error: unknown) => ({ status: "error" as const, error: error instanceof Error ? error.message : String(error) }))
    setUi("busy", "")
    void refetchEngine()
    if (status?.status === "error") {
      showToast({ variant: "error", title: t("settings.modelsHub.toast.loadFailed"), description: status.error })
      return
    }
    showToast({ variant: "success", title: t("settings.modelsHub.toast.loaded", { name: modelKey(file.file) }) })
  }

  const stop = async () => {
    await hub()
      .engineStop(params())
      .catch(() => undefined)
    void refetchEngine()
  }

  // The chat model, in this project's config (the global one without a project). The provider
  // already lists every .gguf on disk as local/<name>; nothing else is written.
  const useInChat = async (file: LocalFile) => {
    const model = `local/${modelKey(file.file)}`
    const disabled = (serverSync().data.config.disabled_providers ?? []) as string[]
    const config = {
      model,
      ...(disabled.includes("local") ? { disabled_providers: disabled.filter((id) => id !== "local") } : {}),
    }
    const saved = await (props.directory
      ? serverSdk().client.config.update({ ...params(), config }, { throwOnError: true })
      : serverSdk().client.global.config.update({ config }, { throwOnError: true })
    )
      .then(() => true)
      .catch(() => false)
    if (!saved) {
      showToast({ variant: "error", title: t("settings.modelsHub.toast.useFailed") })
      return
    }
    void serverSync().refreshProviders().catch(() => undefined)
    showToast({ variant: "success", title: t("settings.modelsHub.toast.used", { name: modelKey(file.file) }) })
  }

  const remove = (file: LocalFile) =>
    void dialog.push(() => (
      <SettingsConfirmDialog
        title={t("settings.modelsHub.remove.confirm", { name: file.file })}
        description={t("settings.modelsHub.remove.description")}
        confirm={t("settings.modelsHub.disk.delete")}
        onClose={() => dialog.close()}
        onConfirm={async () => {
          setUi("busy", file.path)
          const result = await hub()
            .deleteLocal({ ...params(), path: file.path })
            .then((res) => res.data)
            .catch(() => undefined)
          if (!result?.deleted) {
            setUi("busy", "")
            showToast({ variant: "error", title: t("settings.modelsHub.remove.failed.title") })
            return
          }
          // The provider entries and a default that pointed at it go too.
          const forgot = await hub()
            .forget({ ...params(), file: file.file, model: file.repo })
            .then((res) => res.data)
            .catch(() => undefined)
          setUi("busy", "")
          void refreshLocal()
          void refreshJobs()
          void refetchEngine()
          void serverSync().refreshProviders().catch(() => undefined)
          showToast({
            variant: "success",
            title: t("settings.modelsHub.remove.success.title"),
            description: [
              t("settings.modelsHub.remove.success.description", { file: file.file }),
              forgot?.clearedDefaultModel ? t("settings.modelsHub.remove.success.defaultCleared") : "",
            ]
              .filter(Boolean)
              .join(" "),
          })
        }}
      />
    ))

  const toggleLogs = async () => {
    if (ui.logs) {
      setUi("logs", undefined)
      return
    }
    const lines = await hub()
      .engineLogs(params())
      .then((res) => res.data?.lines ?? [])
      .catch(() => [])
    setUi("logs", [...lines])
  }

  // ------------------------------------------------------------------ models folder

  const localModels = () => window.api?.localModels
  const pickDir = async () => {
    const dir = await localModels()
      ?.pickDir(t("settings.modelsHub.dir.picker"))
      .catch(() => null)
    if (dir) await applyDir(dir)
  }
  const applyDir = async (dir: string | null) => {
    if (dir === null) await localModels()?.setDir(null).catch(() => undefined)
    const ok = await hub()
      // The API takes null for "back to the default folder"; the generated type only lists strings.
      .setDir({ ...params(), dir: dir as string })
      .then(() => true)
      .catch(() => false)
    void refetchSystem()
    void refreshLocal()
    if (ok && dir) showToast({ variant: "success", title: t("settings.modelsHub.dir.title"), description: dir })
  }

  // ------------------------------------------------------------------ labels

  const fitLabel = (tier: FitTier | undefined) =>
    tier === "full_gpu"
      ? t("settings.modelsHub.fit.fullGpu")
      : tier === "ram_only"
        ? t("settings.modelsHub.fit.ramOnly")
        : tier === "no_fit"
          ? t("settings.modelsHub.fit.noFit")
          : t("settings.modelsHub.fit.partialGpu")

  const recommendationParts = (rec: Recommendation) =>
    [
      t("settings.modelsHub.spec.context", { value: formatTokens(rec.contextSize) }),
      t("settings.modelsHub.spec.gpu", {
        value: rec.gpuLayers >= 99 || (rec.layers && rec.gpuLayers >= rec.layers) ? "100%" : rec.layers ? `${rec.gpuLayers}/${rec.layers}` : String(rec.gpuLayers),
      }),
      t("settings.modelsHub.spec.threads", { value: rec.threads }),
      `KV ${rec.kvCacheType ?? "f16"}`,
    ]

  const splitLine = (rec: Recommendation) =>
    [
      rec.placement !== "cpu" ? `VRAM ≈ ${formatBytes(rec.vramBytes ?? 0)}` : "",
      (rec.ramBytes ?? 0) > 0 || rec.placement === "cpu" ? `RAM ≈ ${formatBytes(rec.ramBytes ?? 0)}` : "",
    ]
      .filter(Boolean)
      .join(" · ")

  const engineState = () => engine()?.status ?? "stopped"
  const diskSize = () => ui.local.reduce((sum, file) => sum + file.sizeBytes, 0)
  const activeJobs = () => ui.jobs.filter((job) => job.status !== "completed")

  const engineHint = () => {
    const status = engine()
    if (status?.status === "running") return t("settings.modelsHub.hint.engine.running", { name: status.modelName ?? "" })
    if (status?.status === "starting") return t("settings.modelsHub.hint.engine.starting")
    if (status?.status === "error") return t("settings.modelsHub.hint.engine.error")
    return t("settings.modelsHub.hint.engine.stopped")
  }

  const idleCountdown = () => {
    const status = engine()
    const minutes = asNumber(status?.idleUnloadMinutes)
    const last = asNumber(status?.lastActivityAt)
    if (status?.status !== "running" || !minutes || !last) return undefined
    const left = Math.max(0, Math.round((last + minutes * 60_000 - Date.now()) / 60_000))
    return t("settings.modelsHub.engine.idleIn", { minutes: left })
  }

  const numberField = (key: NumericKey, placeholder: string) => (
    <TextInputV2
      appearance="base"
      class="settings-v2-mh-number"
      inputMode="decimal"
      value={form[key]}
      invalid={invalid(key)}
      placeholder={placeholder}
      onInput={(event) => setForm(key, event.currentTarget.value)}
      aria-label={t(`settings.modelsHub.load.${key}.title`)}
    />
  )

  const choice = <T extends string | number>(props2: {
    value: T
    options: readonly T[]
    label: (value: T) => string
    onChange: (value: T) => void
  }) => (
    <SelectV2
      appearance="inline"
      options={[...props2.options]}
      current={props2.value}
      value={(option) => String(option)}
      label={props2.label}
      placement="bottom-end"
      gutter={6}
      onSelect={(option) => option !== null && option !== undefined && props2.onChange(option)}
    />
  )

  const section = (title: string, description: string | undefined, children: JSX.Element) => (
    <div class="settings-v2-section">
      <h3 class="settings-v2-section-title">{title}</h3>
      <Show when={description}>
        <p class="settings-v2-mh-section-hint">{description}</p>
      </Show>
      <SettingsListV2>{children}</SettingsListV2>
    </div>
  )

  return (
    <>
      <SettingsHubHeader
        icon="models"
        title={t("settings.modelsHub.title")}
        description={t("settings.modelsHub.description")}
        value={ui.tab}
        onChange={(tab) => setUi("tab", tab)}
        sections={[
          { id: "explore", label: t("settings.modelsHub.tab.explore"), hint: t("settings.modelsHub.hint.explore"), icon: "magnifying-glass" },
          {
            id: "disk",
            label: t("settings.modelsHub.tab.disk"),
            hint: t("settings.modelsHub.hint.disk", { count: ui.local.length, size: formatBytes(diskSize()) }),
            icon: "folder",
          },
          { id: "engine", label: t("settings.modelsHub.tab.engine"), hint: engineHint(), icon: "console" },
          {
            id: "settings",
            label: t("settings.modelsHub.tab.settings"),
            hint: t(form.auto ? "settings.modelsHub.hint.settings.auto" : "settings.modelsHub.hint.settings.manual"),
            icon: "sliders",
          },
        ]}
      />

      <div class="settings-v2-tab-body settings-v2-mh" data-tab={ui.tab}>
        <Show when={activeJobs().length > 0 && ui.tab !== "disk"}>
          <button type="button" class="settings-v2-mh-strip" onClick={() => setUi("tab", "disk")}>
            <span class="settings-v2-mh-strip-dot" aria-hidden="true" />
            {t("settings.modelsHub.downloads.strip", { count: activeJobs().length })}
          </button>
        </Show>

        {/* ------------------------------------------------------------ Explorar */}
        <Show when={ui.tab === "explore"}>
          <TextInputV2
            type="search"
            appearance="base"
            class="settings-v2-mh-search"
            value={ui.query}
            placeholder={t("settings.modelsHub.search.placeholder")}
            aria-label={t("settings.modelsHub.search.placeholder")}
            onInput={(event) => search(event.currentTarget.value)}
            spellcheck={false}
            autocomplete="off"
          />
          <div class="settings-v2-mh-layout">
            <div class="settings-v2-mh-list">
              <Show when={!ui.submitted}>
                <p class="settings-v2-mh-list-title">{t("settings.modelsHub.picks.title")}</p>
              </Show>
              <Show when={ui.submitted && !results.loading && models().length === 0}>
                <p class="settings-v2-mh-empty">{t("settings.modelsHub.empty")}</p>
              </Show>
              <Show when={results.loading}>
                <p class="settings-v2-mh-empty">{t("settings.modelsHub.searching")}</p>
              </Show>
              <For each={models()}>
                {(model) => (
                  <button
                    type="button"
                    class="settings-v2-mh-row"
                    aria-current={selectedModel()?.id === model.id ? "true" : undefined}
                    onClick={() => setUi("selected", model.id)}
                  >
                    <HubAvatar id={model.id} />
                    <span class="settings-v2-mh-row-copy">
                      <span class="settings-v2-mh-row-title">{model.id.split("/").at(-1)}</span>
                      <span class="settings-v2-mh-row-meta">
                        {[
                          model.id.split("/")[0],
                          formatCount(model.downloads) ? `↓ ${formatCount(model.downloads)}` : "",
                          formatCount(model.likes) ? `♥ ${formatCount(model.likes)}` : "",
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                      <Show when={pickNote(model.id)}>
                        {(note) => <span class="settings-v2-mh-row-note">{t(note())}</span>}
                      </Show>
                    </span>
                  </button>
                )}
              </For>
            </div>

            <Show when={selectedModel()} fallback={<div class="settings-v2-mh-detail" />}>
              {(model) => (
                <div class="settings-v2-mh-detail">
                  <div class="settings-v2-mh-detail-head">
                    <HubAvatar id={model().id} large />
                    <div class="settings-v2-mh-detail-identity">
                      <h3 class="settings-v2-mh-detail-title">{model().id.split("/").at(-1)}</h3>
                      <button
                        type="button"
                        class="settings-v2-mh-link"
                        onClick={() => platform.openExternal(`https://huggingface.co/${model().id}`)}
                      >
                        {model().id} ↗
                      </button>
                    </div>
                  </div>
                  <Show when={pickNote(model().id)}>{(note) => <p class="settings-v2-mh-detail-note">{t(note())}</p>}</Show>

                  <h4 class="settings-v2-mh-subtitle">{t("settings.modelsHub.detail.files")}</h4>
                  <Show
                    when={ui.files[model().id] !== "loading"}
                    fallback={<p class="settings-v2-mh-empty">{t("settings.modelsHub.size.unknown")}</p>}
                  >
                    <Show when={filesOf(model()).length > 0} fallback={<p class="settings-v2-mh-empty">{t("settings.modelsHub.files.none")}</p>}>
                      <ul class="settings-v2-mh-quants" role="radiogroup">
                        <For each={filesOf(model())}>
                          {(file) => {
                            const job = () => jobFor(model().id, file.file)
                            return (
                              <li
                                class="settings-v2-mh-quant"
                                data-selected={quantOf(model())?.file === file.file ? "" : undefined}
                              >
                                <button
                                  type="button"
                                  role="radio"
                                  aria-checked={quantOf(model())?.file === file.file}
                                  class="settings-v2-mh-quant-main"
                                  onClick={() => setUi("quant", model().id, file.file)}
                                >
                                  <span class="settings-v2-mh-quant-label">{file.quant ?? file.file.split("/").at(-1)}</span>
                                  <Show when={file.recommended}>
                                    <span class="settings-v2-mh-tag" data-tone="accent">{t("settings.modelsHub.recommended")}</span>
                                  </Show>
                                  <span class="settings-v2-mh-quant-size">{formatBytes(file.size)}</span>
                                  <Show when={file.fit}>
                                    {(fit) => (
                                      <span class="settings-v2-mh-fit" data-tier={fit().tier}>
                                        {fitLabel(fit().tier)}
                                      </span>
                                    )}
                                  </Show>
                                </button>
                                <Show
                                  when={job() && job()!.status !== "completed"}
                                  fallback={
                                    <Show
                                      when={onDisk(file.file) || job()?.status === "completed"}
                                      fallback={
                                        <ButtonV2 size="small" variant="outline" onClick={() => void startDownload(model().id, file.file)}>
                                          {t("settings.modelsHub.download")}
                                        </ButtonV2>
                                      }
                                    >
                                      <ButtonV2 size="small" variant="ghost" onClick={() => setUi("tab", "disk")}>
                                        {t("settings.modelsHub.onDisk")}
                                      </ButtonV2>
                                    </Show>
                                  }
                                >
                                  <span class="settings-v2-mh-quant-progress">
                                    {t(`settings.modelsHub.download.${job()!.status}`)} · {Math.round(asNumber(job()!.percent) ?? 0)} %
                                  </span>
                                </Show>
                              </li>
                            )
                          }}
                        </For>
                      </ul>
                    </Show>
                  </Show>

                  <Show when={quantOf(model())}>
                    {(quant) => (
                      <div class="settings-v2-mh-estimate">
                        <h4 class="settings-v2-mh-subtitle">{t("settings.modelsHub.estimate.title", { quant: quant().quant ?? "" })}</h4>
                        <Show
                          when={estimateOf(model().id, quant().file) !== "loading"}
                          fallback={<p class="settings-v2-mh-empty">{t("settings.modelsHub.estimate.loading")}</p>}
                        >
                          <Show
                            when={(estimateOf(model().id, quant().file) as Estimate | undefined)?.recommended}
                            fallback={<p class="settings-v2-mh-empty">{t("settings.modelsHub.estimate.unavailable")}</p>}
                          >
                            {(rec) => (
                              <>
                                <div class="settings-v2-mh-chips">
                                  <span class="settings-v2-mh-tag" data-tone="accent">{t(`settings.modelsHub.placement.${rec().placement}`)}</span>
                                  <For each={recommendationParts(rec())}>{(part) => <span class="settings-v2-mh-tag">{part}</span>}</For>
                                </div>
                                <p class="settings-v2-mh-detail-note">{splitLine(rec())}</p>
                                <For each={rec().reasons}>
                                  {(reason) => <p class="settings-v2-mh-reason">{t(`settings.modelsHub.reason.${reason}`)}</p>}
                                </For>
                              </>
                            )}
                          </Show>
                        </Show>
                      </div>
                    )}
                  </Show>
                </div>
              )}
            </Show>
          </div>
        </Show>

        {/* ------------------------------------------------------------ En disco */}
        <Show when={ui.tab === "disk"}>
          <Show when={activeJobs().length > 0}>
            <div class="settings-v2-section">
              <h3 class="settings-v2-section-title">{t("settings.modelsHub.downloads.title")}</h3>
              <ul class="settings-v2-mh-jobs">
                <For each={activeJobs()}>
                  {(job) => (
                    <li class="settings-v2-mh-job" data-status={job.status}>
                      <div class="settings-v2-mh-job-head">
                        <span class="settings-v2-mh-row-title">{job.file.split("/").at(-1)}</span>
                        <span class="settings-v2-mh-job-status">{t(`settings.modelsHub.download.${job.status}`)}</span>
                      </div>
                      <div class="settings-v2-mh-progress">
                        <div class="settings-v2-mh-progress-fill" style={{ width: `${asNumber(job.percent) ?? 0}%` }} />
                      </div>
                      <div class="settings-v2-mh-job-foot">
                        <span class="settings-v2-mh-row-meta">
                          {[
                            `${Math.round(asNumber(job.percent) ?? 0)} %`,
                            `${formatBytes(job.received)} / ${formatBytes(job.total)}`,
                            job.status === "downloading" && asNumber(job.speedBytesPerSec) ? `${formatBytes(job.speedBytesPerSec)}/s` : "",
                            job.status === "downloading" ? (formatEta(job.etaSeconds) ?? "") : "",
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </span>
                        <div class="settings-v2-mh-actions">
                          <Show when={job.status !== "downloading"}>
                            <ButtonV2 size="small" variant="outline" onClick={() => void startDownload(job.model, job.file)}>
                              {t("settings.modelsHub.download.resume")}
                            </ButtonV2>
                          </Show>
                          <ButtonV2 size="small" variant="ghost" onClick={() => void cancelJob(job)}>
                            {t("settings.modelsHub.download.cancel")}
                          </ButtonV2>
                        </div>
                      </div>
                      <Show when={job.status === "failed" && job.error}>
                        <p class="settings-v2-mh-error">{job.error}</p>
                      </Show>
                    </li>
                  )}
                </For>
              </ul>
            </div>
          </Show>

          <div class="settings-v2-section">
            <div class="settings-v2-mh-section-head">
              <h3 class="settings-v2-section-title">{t("settings.modelsHub.disk.title")}</h3>
              <ButtonV2 size="small" variant="ghost" disabled={ui.localLoading} onClick={() => void refreshLocal()}>
                {t("settings.modelsHub.disk.rescan")}
              </ButtonV2>
            </div>
            <Show when={ui.local.length > 0} fallback={<p class="settings-v2-mh-empty">{t("settings.modelsHub.disk.empty")}</p>}>
              <ul class="settings-v2-mh-files">
                <For each={ui.local}>
                  {(file) => (
                    <li class="settings-v2-mh-file" data-running={running(file) ? "" : undefined}>
                      <div class="settings-v2-mh-file-head">
                        <HubAvatar id={file.repo ?? file.name} />
                        <div class="settings-v2-mh-row-copy">
                          <span class="settings-v2-mh-row-title" title={file.path}>
                            {modelKey(file.file)}
                          </span>
                          <span class="settings-v2-mh-row-meta">
                            {[
                              formatBytes(file.sizeBytes),
                              file.quant ?? "",
                              file.metadata?.architecture ?? "",
                              file.metadata?.sizeLabel ?? "",
                              file.metadata?.contextLength ? t("settings.modelsHub.spec.trained", { value: formatTokens(file.metadata.contextLength) }) : "",
                            ]
                              .filter(Boolean)
                              .join(" · ")}
                          </span>
                        </div>
                        <Show when={running(file)}>
                          <span class="settings-v2-mh-tag" data-tone="success">{t("settings.modelsHub.disk.active")}</span>
                        </Show>
                        <Show when={file.fit}>
                          {(fit) => (
                            <span class="settings-v2-mh-fit" data-tier={fit().tier}>
                              {fitLabel(fit().tier)}
                            </span>
                          )}
                        </Show>
                      </div>
                      <Show when={file.recommended}>
                        {(rec) => (
                          <div class="settings-v2-mh-chips">
                            <span class="settings-v2-mh-tag" data-tone="accent">{t(`settings.modelsHub.placement.${rec().placement}`)}</span>
                            <For each={recommendationParts(rec())}>{(part) => <span class="settings-v2-mh-tag">{part}</span>}</For>
                          </div>
                        )}
                      </Show>
                      <Show when={file.metadata && !file.metadata.hasChatTemplate}>
                        <p class="settings-v2-mh-warning">{t("settings.modelsHub.disk.noTemplate")}</p>
                      </Show>
                      <Show when={file.error}>
                        <p class="settings-v2-mh-error">{file.error}</p>
                      </Show>
                      <div class="settings-v2-mh-actions">
                        <Show
                          when={running(file)}
                          fallback={
                            <ButtonV2 size="small" variant="contrast" disabled={Boolean(ui.busy)} onClick={() => void load(file)}>
                              {ui.busy === file.path ? t("settings.modelsHub.disk.loading") : t("settings.modelsHub.disk.load")}
                            </ButtonV2>
                          }
                        >
                          <ButtonV2 size="small" variant="outline" onClick={() => void stop()}>
                            {t("settings.modelsHub.disk.unload")}
                          </ButtonV2>
                        </Show>
                        <ButtonV2 size="small" variant="outline" onClick={() => void useInChat(file)}>
                          {t("settings.modelsHub.disk.use")}
                        </ButtonV2>
                        <Show when={platform.revealPath}>
                          <ButtonV2 size="small" variant="ghost" onClick={() => void platform.revealPath?.(file.path)}>
                            {t("settings.modelsHub.disk.reveal")}
                          </ButtonV2>
                        </Show>
                        <ButtonV2 size="small" variant="ghost" class="ml-auto" disabled={ui.busy === file.path} onClick={() => remove(file)}>
                          {t("settings.modelsHub.disk.delete")}
                        </ButtonV2>
                      </div>
                    </li>
                  )}
                </For>
              </ul>
            </Show>
          </div>
        </Show>

        {/* ------------------------------------------------------------ Motor */}
        <Show when={ui.tab === "engine"}>
          <section class="settings-v2-mh-engine" data-state={engineState()}>
            <div class="settings-v2-mh-engine-head">
              <span class="settings-v2-mh-status" data-state={engineState()}>
                {t(`settings.modelsHub.engine.state.${engineState()}`)}
              </span>
              <h3 class="settings-v2-mh-engine-model">
                {engine()?.modelName ?? t("settings.modelsHub.engine.noModel")}
              </h3>
              <Show when={idleCountdown()}>{(text) => <span class="settings-v2-mh-row-meta">{text()}</span>}</Show>
            </div>
            <Show when={engine()?.binaryDownloading}>
              <div class="settings-v2-mh-progress">
                <div class="settings-v2-mh-progress-fill" style={{ width: `${asNumber(engine()?.downloadProgress) ?? 0}%` }} />
              </div>
              <p class="settings-v2-mh-row-meta">{t("settings.modelsHub.engine.binaryDownloading")}</p>
            </Show>
            <Show when={engine()?.applied}>
              {(applied) => (
                <div class="settings-v2-mh-chips">
                  <span class="settings-v2-mh-tag" data-tone="accent">
                    {t(engine()?.auto ? "settings.modelsHub.hint.settings.auto" : "settings.modelsHub.hint.settings.manual")}
                  </span>
                  <span class="settings-v2-mh-tag">{t("settings.modelsHub.spec.context", { value: formatTokens(asNumber(applied().contextSize) ?? 0) })}</span>
                  <span class="settings-v2-mh-tag">{t("settings.modelsHub.spec.gpu", { value: asNumber(applied().gpuLayers) ?? 0 })}</span>
                  <span class="settings-v2-mh-tag">{t("settings.modelsHub.spec.threads", { value: asNumber(applied().threads) ?? 0 })}</span>
                  <Show when={asNumber(applied().batchSize)}>{(value) => <span class="settings-v2-mh-tag">batch {value()}</span>}</Show>
                  <Show when={asNumber(applied().ubatchSize)}>{(value) => <span class="settings-v2-mh-tag">ubatch {value()}</span>}</Show>
                  <Show when={applied().kvCacheType}>{(value) => <span class="settings-v2-mh-tag">KV {value()}</span>}</Show>
                  <Show when={applied().flashAttention !== undefined}>
                    <span class="settings-v2-mh-tag">FA {applied().flashAttention ? "on" : "off"}</span>
                  </Show>
                  <Show when={asNumber(applied().nCpuMoe)}>{(value) => <span class="settings-v2-mh-tag">MoE CPU {value()}</span>}</Show>
                </div>
              )}
            </Show>
            <Show when={engineState() === "error" && engine()?.error}>
              <p class="settings-v2-mh-error">{engine()?.error}</p>
            </Show>
            <div class="settings-v2-mh-actions">
              <Show when={engineState() === "running" || engineState() === "starting"}>
                <ButtonV2 size="small" variant="outline" onClick={() => void stop()}>
                  {t("settings.modelsHub.engine.stop")}
                </ButtonV2>
              </Show>
              <Show when={engineState() === "running" && engine()?.modelPath}>
                {(path) => (
                  <ButtonV2
                    size="small"
                    variant="outline"
                    onClick={async () => {
                      const file = ui.local.find((candidate) => samePath(candidate.path, path()))
                      await stop()
                      if (file) void load(file)
                    }}
                  >
                    {t("settings.modelsHub.engine.reload")}
                  </ButtonV2>
                )}
              </Show>
              <ButtonV2 size="small" variant="ghost" onClick={() => void toggleLogs()}>
                {t(ui.logs ? "settings.modelsHub.engine.hideLog" : "settings.modelsHub.engine.showLog")}
              </ButtonV2>
              <span class="settings-v2-mh-row-meta ml-auto">
                {t("settings.modelsHub.engine.port", { port: asNumber(engine()?.port) ?? 58282 })}
              </span>
            </div>
            <Show when={ui.logs}>
              {(lines) => (
                <pre class="settings-v2-mh-log">{lines().length ? lines().join("\n") : t("settings.modelsHub.engine.logEmpty")}</pre>
              )}
            </Show>
          </section>

          {section(
            t("settings.modelsHub.hardware.title"),
            undefined,
            <>
              <SettingsRowV2 title={t("settings.modelsHub.system.gpu")} description={system()?.gpu ?? "—"}>
                <span class="settings-v2-mh-value">
                  {asNumber(system()?.vram?.total)
                    ? `${formatBytes(system()?.vram?.free)} ${t("settings.modelsHub.hardware.free")} / ${formatBytes(system()?.vram?.total)}`
                    : "—"}
                </span>
              </SettingsRowV2>
              <SettingsRowV2 title={t("settings.modelsHub.system.ram")} description={system()?.cpu ?? "—"}>
                <span class="settings-v2-mh-value">
                  {formatBytes(system()?.ram)}
                  {asNumber(system()?.cpuCores) ? ` · ${t("settings.modelsHub.hardware.cores", { count: asNumber(system()?.cpuCores)! })}` : ""}
                </span>
              </SettingsRowV2>
              <SettingsRowV2 title={t("settings.modelsHub.system.disk")} description={system()?.modelsDir ?? "—"}>
                <span class="settings-v2-mh-value">{formatBytes(system()?.diskFree)}</span>
              </SettingsRowV2>
            </>,
          )}

          <Show when={(runtimes() ?? []).length > 0}>
            {section(
              t("settings.modelsHub.runtime.title"),
              t("settings.modelsHub.runtime.description"),
              <For each={runtimes()}>
                {(runtime) => (
                  <SettingsRowV2
                    title={runtime.name}
                    description={
                      runtime.available && runtime.models?.length
                        ? t("settings.modelsHub.runtime.models", { count: runtime.models.length })
                        : t(runtime.available ? "settings.modelsHub.runtime.available" : "settings.modelsHub.runtime.notDetected")
                    }
                  >
                    <span class="settings-v2-mh-status" data-state={runtime.available ? "running" : "stopped"}>
                      {t(runtime.available ? "settings.modelsHub.runtime.available" : "settings.modelsHub.runtime.notDetected")}
                    </span>
                  </SettingsRowV2>
                )}
              </For>,
            )}
          </Show>
        </Show>

        {/* ------------------------------------------------------------ Ajustes */}
        <Show when={ui.tab === "settings"}>
          {section(
            t("settings.modelsHub.settings.load.title"),
            undefined,
            <>
              <SettingsRowV2 title={t("settings.modelsHub.auto.title")} description={t("settings.modelsHub.auto.description")}>
                <Switch checked={form.auto} onChange={(checked) => setForm("auto", checked)} hideLabel>
                  {t("settings.modelsHub.auto.title")}
                </Switch>
              </SettingsRowV2>
              <Show
                when={form.auto}
                fallback={
                  <>
                    <SettingsRowV2 title={t("settings.modelsHub.load.contextSize.title")} description={t("settings.modelsHub.load.contextSize.hint")}>
                      {numberField("contextSize", "8192")}
                    </SettingsRowV2>
                    <SettingsRowV2 title={t("settings.modelsHub.load.gpuLayers.title")} description={t("settings.modelsHub.load.gpuLayers.hint")}>
                      {numberField("gpuLayers", "99")}
                    </SettingsRowV2>
                    <SettingsRowV2 title={t("settings.modelsHub.load.threads.title")} description={t("settings.modelsHub.load.threads.description")}>
                      {numberField("threads", t("settings.modelsHub.settings.auto"))}
                    </SettingsRowV2>
                    <SettingsRowV2 title={t("settings.modelsHub.load.batchSize.title")} description={t("settings.modelsHub.load.batchSize.description")}>
                      {numberField("batchSize", "2048")}
                    </SettingsRowV2>
                    <SettingsRowV2 title={t("settings.modelsHub.load.flashAttention.title")} description={t("settings.modelsHub.load.flashAttention.description")}>
                      {choice({
                        value: form.flashAttention,
                        options: ["auto", "on", "off"] as const,
                        label: (value) => t(`settings.modelsHub.load.choice.${value}`),
                        onChange: (value) => setForm("flashAttention", value),
                      })}
                    </SettingsRowV2>
                    <SettingsRowV2 title={t("settings.modelsHub.load.kvCacheType.title")} description={t("settings.modelsHub.load.kvCacheType.hint")}>
                      {choice({
                        value: form.kvCacheType,
                        options: ["f16", "q8_0", "q4_0"] as const,
                        label: (value) => t(`settings.modelsHub.kv.${value}`),
                        onChange: (value) => setForm("kvCacheType", value),
                      })}
                    </SettingsRowV2>
                    <SettingsRowV2 title={t("settings.modelsHub.load.parallel.title")} description={t("settings.modelsHub.load.parallel.description")}>
                      {numberField("parallel", "1")}
                    </SettingsRowV2>
                  </>
                }
              >
                <SettingsRowV2 title={t("settings.modelsHub.auto.placement.title")} description={t("settings.modelsHub.auto.placement.description")}>
                  {choice({
                    value: form.placement,
                    options: ["auto", "gpu", "hybrid", "cpu"] as const,
                    label: (value) => t(`settings.modelsHub.placement.${value}`),
                    onChange: (value) => setForm("placement", value),
                  })}
                </SettingsRowV2>
                <For each={["vramBudget", "ramBudget", "cpuBudget"] as const}>
                  {(key) => (
                    <SettingsRowV2
                      title={t(`settings.modelsHub.auto.${key.replace("Budget", "")}.title`)}
                      description={t(`settings.modelsHub.auto.${key.replace("Budget", "")}.description`)}
                    >
                      {choice({
                        value: form[key],
                        options: BUDGETS[key],
                        label: (value) => `${value} %`,
                        onChange: (value) => setForm(key, value),
                      })}
                    </SettingsRowV2>
                  )}
                </For>
              </Show>
            </>,
          )}

          {section(
            t("settings.modelsHub.settings.memory.title"),
            undefined,
            <>
              <SettingsRowV2 title={t("settings.modelsHub.auto.idle.title")} description={t("settings.modelsHub.auto.idle.description")}>
                {choice({
                  value: form.idleUnloadMinutes,
                  options: IDLE_MINUTES,
                  label: (value) => (value === 0 ? t("settings.modelsHub.auto.idle.never") : t("settings.modelsHub.auto.idle.minutes", { n: value })),
                  onChange: (value) => setForm("idleUnloadMinutes", value),
                })}
              </SettingsRowV2>
              <SettingsRowV2 title={t("settings.modelsHub.load.keepInMemory.title")} description={t("settings.modelsHub.load.keepInMemory.description")}>
                <Switch checked={form.keepInMemory} onChange={(checked) => setForm("keepInMemory", checked)} hideLabel>
                  {t("settings.modelsHub.load.keepInMemory.title")}
                </Switch>
              </SettingsRowV2>
              <SettingsRowV2 title={t("settings.modelsHub.load.useMmap.title")} description={t("settings.modelsHub.load.useMmap.description")}>
                <Switch checked={form.useMmap} onChange={(checked) => setForm("useMmap", checked)} hideLabel>
                  {t("settings.modelsHub.load.useMmap.title")}
                </Switch>
              </SettingsRowV2>
              <SettingsRowV2 title={t("settings.modelsHub.load.kvOffload.title")} description={t("settings.modelsHub.load.kvOffload.description")}>
                <Switch checked={form.kvOffload} onChange={(checked) => setForm("kvOffload", checked)} hideLabel>
                  {t("settings.modelsHub.load.kvOffload.title")}
                </Switch>
              </SettingsRowV2>
            </>,
          )}

          {section(
            t("settings.modelsHub.settings.advanced.title"),
            t("settings.modelsHub.settings.advanced.description"),
            <>
              <SettingsRowV2 title={t("settings.modelsHub.load.nCpuMoe.title")} description={t("settings.modelsHub.load.nCpuMoe.description")}>
                {numberField("nCpuMoe", "0")}
              </SettingsRowV2>
              <SettingsRowV2 title={t("settings.modelsHub.load.ubatchSize.title")} description={t("settings.modelsHub.load.ubatchSize.description")}>
                {numberField("ubatchSize", "512")}
              </SettingsRowV2>
              <SettingsRowV2 title={t("settings.modelsHub.load.threadsBatch.title")} description={t("settings.modelsHub.load.threadsBatch.description")}>
                {numberField("threadsBatch", t("settings.modelsHub.settings.auto"))}
              </SettingsRowV2>
              <SettingsRowV2 title={t("settings.modelsHub.load.loadTimeoutMinutes.title")} description={t("settings.modelsHub.load.loadTimeoutMinutes.description")}>
                {numberField("loadTimeoutMinutes", "15")}
              </SettingsRowV2>
              <SettingsRowV2 title={t("settings.modelsHub.load.seed.title")} description={t("settings.modelsHub.load.seed.hint")}>
                {numberField("seed", t("settings.modelsHub.settings.random"))}
              </SettingsRowV2>
              <SettingsRowV2 title={t("settings.modelsHub.load.ropeFrequencyBase.title")} description={t("settings.modelsHub.load.ropeFrequencyBase.hint")}>
                {numberField("ropeFrequencyBase", t("settings.modelsHub.settings.modelValue"))}
              </SettingsRowV2>
              <SettingsRowV2 title={t("settings.modelsHub.load.ropeFrequencyScale.title")} description={t("settings.modelsHub.load.ropeFrequencyScale.hint")}>
                {numberField("ropeFrequencyScale", t("settings.modelsHub.settings.modelValue"))}
              </SettingsRowV2>
            </>,
          )}

          {section(
            t("settings.modelsHub.settings.chat.title"),
            undefined,
            <SettingsRowV2 title={t("settings.modelsHub.lightweight.title")} description={t("settings.modelsHub.lightweight.description")}>
              <SegmentedControlV2
                class="settings-v2-mh-segmented"
                value={form.lightweight}
                onChange={(value) => {
                  if (value === "auto" || value === "always" || value === "never") setForm("lightweight", value)
                }}
                aria-label={t("settings.modelsHub.lightweight.title")}
              >
                <For each={["auto", "always", "never"] as const}>
                  {(value) => <SegmentedControlItemV2 value={value}>{t(`settings.modelsHub.lightweight.${value}`)}</SegmentedControlItemV2>}
                </For>
              </SegmentedControlV2>
            </SettingsRowV2>,
          )}

          {section(
            t("settings.modelsHub.dir.title"),
            t("settings.modelsHub.dir.restart"),
            <SettingsRowV2
              title={system()?.modelsDir ?? "—"}
              description={t(system()?.modelsDirCustom ? "settings.modelsHub.dir.custom" : "settings.modelsHub.dir.default")}
            >
              <div class="settings-v2-mh-actions">
                <Show
                  when={localModels()}
                  fallback={
                    <form
                      class="settings-v2-mh-dir-form"
                      onSubmit={(event) => {
                        event.preventDefault()
                        if (ui.dirInput.trim()) void applyDir(ui.dirInput.trim())
                      }}
                    >
                      <TextInputV2
                        appearance="base"
                        value={ui.dirInput}
                        placeholder={t("settings.modelsHub.dir.placeholder")}
                        onInput={(event) => setUi("dirInput", event.currentTarget.value)}
                        spellcheck={false}
                      />
                      <ButtonV2 type="submit" size="small" variant="outline">
                        {t("settings.modelsHub.dir.apply")}
                      </ButtonV2>
                    </form>
                  }
                >
                  <ButtonV2 size="small" variant="outline" onClick={() => void pickDir()}>
                    {t("settings.modelsHub.dir.change")}
                  </ButtonV2>
                </Show>
                <Show when={system()?.modelsDirCustom}>
                  <ButtonV2 size="small" variant="ghost" onClick={() => void applyDir(null)}>
                    {t("settings.modelsHub.dir.reset")}
                  </ButtonV2>
                </Show>
              </div>
            </SettingsRowV2>,
          )}

          <div class="settings-v2-mh-reset">
            <ButtonV2 size="small" variant="ghost" onClick={() => setForm({ ...FACTORY })}>
              {t("settings.modelsHub.settings.reset")}
            </ButtonV2>
          </div>
        </Show>
      </div>
    </>
  )
}

// The author's avatar from Hugging Face (organisation, then user), and its initial otherwise.
function HubAvatar(props: { id: string; large?: boolean }) {
  const [state, setState] = createStore({ attempt: 0 })
  const author = () => (props.id.includes("/") ? props.id.split("/")[0]! : "")
  const sources = () => [
    `https://huggingface.co/api/organizations/${encodeURIComponent(author())}/avatar?redirect=true`,
    `https://huggingface.co/api/users/${encodeURIComponent(author())}/avatar?redirect=true`,
  ]
  return (
    <span class="settings-v2-mh-avatar" data-size={props.large ? "large" : undefined} aria-hidden="true">
      <Show when={author() && state.attempt < 2} fallback={<span>{(props.id.split("/").at(-1) ?? "?").charAt(0).toUpperCase()}</span>}>
        <img
          src={sources()[state.attempt]}
          alt=""
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setState("attempt", (value) => value + 1)}
        />
      </Show>
    </span>
  )
}
