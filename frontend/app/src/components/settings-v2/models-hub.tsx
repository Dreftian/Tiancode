import { ButtonV2 } from "@tiancode-ai/ui/v2/button-v2"
import { Switch } from "@tiancode-ai/ui/v2/switch-v2"
import { TextInputV2 } from "@tiancode-ai/ui/v2/text-input-v2"
import { type Component, createResource, For, Show, createSignal, createMemo, createEffect, onCleanup, onMount } from "solid-js"
import { createStore } from "solid-js/store"
import { useLanguage } from "@/context/language"
import { useServerSDK } from "@/context/server-sdk"
import { showToast } from "@/utils/toast"
import { Persist, persisted } from "@/utils/persist"
import { SettingsListV2 } from "./parts/list"
import "./models-hub.css"

type FitTier = "full_gpu" | "partial_gpu" | "ram_only" | "no_fit"
type DownloadStatus = "downloading" | "paused" | "completed" | "failed"

const PAGE_SIZE = 6

// HuggingFace pipeline tags map to short readable labels; the id-based hints
// below complement them (e.g. "meta-llama/Llama-3.2-3B-Instruct" is both
// text generation and an instruct model).
const PipelineTagKeys: Record<string, string> = {
  "text-generation": "settings.modelsHub.desc.text-generation",
  "image-text-to-text": "settings.modelsHub.desc.image-text-to-text",
  "text-to-image": "settings.modelsHub.desc.text-to-image",
  "image-to-image": "settings.modelsHub.desc.image-to-image",
  "image-classification": "settings.modelsHub.desc.image-classification",
  "token-classification": "settings.modelsHub.desc.token-classification",
  "text-classification": "settings.modelsHub.desc.text-classification",
  "question-answering": "settings.modelsHub.desc.question-answering",
  summarization: "settings.modelsHub.desc.summarization",
  translation: "settings.modelsHub.desc.translation",
  "fill-mask": "settings.modelsHub.desc.fill-mask",
  "feature-extraction": "settings.modelsHub.desc.feature-extraction",
  "automatic-speech-recognition": "settings.modelsHub.desc.automatic-speech-recognition",
  "text-to-speech": "settings.modelsHub.desc.text-to-speech",
  "depth-estimation": "settings.modelsHub.desc.depth-estimation",
  "image-segmentation": "settings.modelsHub.desc.image-segmentation",
  "object-detection": "settings.modelsHub.desc.object-detection",
}

const ModelIdHints: [RegExp, string][] = [
  [/instruct/i, "settings.modelsHub.desc.hint.instruct"],
  [/\bchat\b/i, "settings.modelsHub.desc.hint.chat"],
  [/vision|vlm|llava/i, "settings.modelsHub.desc.hint.vision"],
  [/coder|code|starcoder/i, "settings.modelsHub.desc.hint.code"],
  [/reason/i, "settings.modelsHub.desc.hint.reasoning"],
  [/quant|q[2348]_/i, "settings.modelsHub.desc.hint.quantized"],
]

const largestSize = (files: QuantFile[]) =>
  files.reduce<number | undefined>((max, file) => {
    const size = asNumber(file.size)
    if (size === undefined) return max
    if (max === undefined || size > max) return size
    return max
  }, undefined)

export const SettingsModelsHubV2: Component<{
  directory?: string
}> = (props) => {
  const language = useLanguage()
  const serverSdk = useServerSDK()
  const [query, setQuery] = createSignal("")
  const [submitted, setSubmitted] = createSignal("")
  const [selected, setSelected] = createSignal<string | undefined>(undefined)
  const [page, setPage] = createSignal(0)
  // Persisted download jobs (survive restarts), polled from the registry.
  const [jobs, setJobs] = createSignal<DownloadJob[]>([])

  // Memory mode: the GPU VRAM is the preferred memory for local models and
  // system RAM backs it up only when the model overflows the GPU. Both toggles
  // persist so the compatibility indicator reflects the user's choice.
  const [memoryPrefs, setMemoryPrefs] = persisted(
    Persist.global("settings-v2.models-hub.memory"),
    createStore({ useGpu: true, useRamFallback: true }),
  )

  const params = () => (props.directory ? { directory: props.directory } : undefined)

  const [system, { refetch: refetchSystem }] = createResource(
    () => serverSdk().client.modelhub.system(params()),
    (request) => request.then((x) => x.data),
    {
      initialValue: undefined as
        | {
            ram: Numish
            diskFree: Numish
            cpu?: string
            gpu?: string
            vram?: { total: Numish; free: Numish }
            modelsDir: string
          }
        | undefined,
    },
  )

  const [models, { refetch: refetchModels }] = createResource(
    () => (submitted() ? serverSdk().client.modelhub.search({ ...params(), query: submitted(), limit: "20" }) : undefined),
    (request) => request.then((x) => x.data),
    { initialValue: [] as Model[] },
  )

  const [files, { refetch: refetchFiles }] = createResource(
    () =>
      selected()
        ? serverSdk().client.modelhub.files({ ...params(), model: selected()! })
        : undefined,
    (request) => request.then((x) => x.data),
    { initialValue: [] as QuantFile[] },
  )

  // Local runtimes (Ollama / LM Studio) detected on this machine.
  const [runtimes, { refetch: refetchRuntimes }] = createResource(
    () => serverSdk().client.modelhub.runtimes(params()),
    (request) => request.then((x) => x.data),
    { initialValue: [] as RuntimeInfo[] },
  )

  // Instalación local de runtimes (solo escritorio): el instalador oficial se
  // descarga dentro de las carpetas de Tiancode y se instala en silencio.
  type RuntimeInstallState = { status: "idle" | "downloading" | "installing" | "error"; progress?: number; error?: string }
  type RuntimeAPI = {
    install: (kind: "ollama" | "lmstudio") => Promise<{ ok: boolean; error?: string }>
    onState: (cb: (state: RuntimeInstallState) => void) => () => void
  }
  const runtimeAPI = (): RuntimeAPI | undefined => (window as { api?: { runtime?: RuntimeAPI } }).api?.runtime
  const [runtimeInstall, setRuntimeInstall] = createSignal<RuntimeInstallState>({ status: "idle" })
  const [activeRuntime, setActiveRuntime] = createSignal<string>()
  onMount(() => {
    const api = runtimeAPI()
    if (!api) return
    const unsub = api.onState((state) => {
      if (state.status !== "idle") setRuntimeInstall(state)
    })
    onCleanup(unsub)
  })
  const installRuntime = async (kind: string) => {
    const api = runtimeAPI()
    if (!api || activeRuntime()) return
    setActiveRuntime(kind)
    setRuntimeInstall({ status: "installing" })
    const result = await api.install(kind as "ollama" | "lmstudio")
    if (!result.ok) {
      showToast({
        variant: "error",
        title: language.t("settings.modelsHub.runtime.install.failed"),
        description: result.error,
      })
    } else {
      showToast({
        variant: "success",
        title: language.t("settings.modelsHub.runtime.install.success", {
          name: kind === "ollama" ? "Ollama" : "LM Studio",
        }),
      })
      // Provider local automático con el modelo recomendado para la GPU.
      const recommended = recommendedModel()
      if (recommended) {
        await setupLocalProvider(kind, defaultRuntimeModel(kind, recommended.label))
      }
    }
    setActiveRuntime(undefined)
    setRuntimeInstall({ status: "idle" })
    void refetchRuntimes()
  }
  const installLabel = (kind: string) => {
    if (activeRuntime() !== kind) return language.t("settings.modelsHub.runtime.install")
    const state = runtimeInstall()
    if (state.status === "downloading")
      return `${language.t("settings.modelsHub.runtime.install.downloading")} ${state.progress ?? 0}%`
    if (state.status === "installing") return language.t("settings.modelsHub.runtime.install.installing")
    return language.t("settings.modelsHub.runtime.install")
  }

  // Modelo GGUF recomendado según la VRAM detectada. Solo archivos de una
  // pieza para que la descarga integrada del Model Hub funcione directamente.
  const RECOMMENDED_GGUF = [
    { minVram: 0, model: "Qwen/Qwen2.5-3B-Instruct-GGUF", file: "qwen2.5-3b-instruct-q4_k_m.gguf", label: "Qwen 2.5 3B", size: 2.1e9 },
    { minVram: 8e9, model: "bartowski/Qwen2.5-7B-Instruct-GGUF", file: "Qwen2.5-7B-Instruct-Q4_K_M.gguf", label: "Qwen 2.5 7B", size: 4.7e9 },
  ]
  const recommendedModel = createMemo(() => {
    const total = vramTotal()
    if (total <= 0) return undefined
    return RECOMMENDED_GGUF.filter((entry) => total >= entry.minVram).at(-1)
  })

  // Nombre de modelo por defecto para el runtime: Ollama usa ids "modelo:tag",
  // LM Studio usa el nombre del archivo GGUF.
  const defaultRuntimeModel = (runtimeId: string, fallback: string) =>
    runtimeId === "ollama" ? `qwen2.5:${fallback.includes("7B") ? "7b" : "3b"}` : fallback

  // Crea un provider local apuntando al runtime (Ollama / LM Studio) con el
  // modelo recomendado como nombre por defecto; el usuario lo ajusta al
  // modelo que realmente tenga instalado en el runtime.
  const setupLocalProvider = async (runtimeId: string, modelName: string) => {
    const baseURL = runtimeId === "ollama" ? "http://localhost:11434/v1" : "http://localhost:1234/v1"
    try {
      await serverSdk().client.config.update({
        ...params(),
        config: {
          provider: {
            [runtimeId]: {
              npm: "@ai-sdk/openai-compatible",
              options: { baseURL },
              models: { [modelName]: { name: modelName } },
            },
          },
        },
      })
      showToast({ variant: "success", title: language.t("settings.modelsHub.provider.ready", { name: modelName }) })
    } catch {
      showToast({ variant: "error", title: language.t("settings.modelsHub.provider.failed") })
    }
  }

  const refreshJobs = async () => {
    try {
      const res = await serverSdk().client.modelhub.downloads(params())
      setJobs(res.data ?? [])
    } catch {
      // transient failure; keep the last known registry state
    }
  }

  // Poll the persisted download registry while the tab is mounted so status
  // transitions (paused/completed/failed) and progress stay fresh.
  createEffect(() => {
    void refreshJobs()
    const timer = setInterval(() => void refreshJobs(), 2000)
    onCleanup(() => clearInterval(timer))
  })

  const jobsByKey = createMemo(() => {
    const byKey: Record<string, DownloadJob> = {}
    for (const job of jobs()) byKey[`${job.model}/${job.file}`] = job
    return byKey
  })

  const ram = createMemo(() => asNumber(system()?.ram) ?? 0)
  const vramTotal = createMemo(() => asNumber(system()?.vram?.total) ?? 0)
  const vramFree = createMemo(() => asNumber(system()?.vram?.free) ?? 0)

  // LM Studio-style fit: VRAM is the primary memory, RAM backs it up when the
  // model overflows the GPU. ~10% overhead for KV cache and runtime buffers.
  // The memory-mode toggles let the user choose: GPU-first (default), or
  // RAM-only when they prefer not to use the GPU. Mirrors the backend
  // `compatibilityFor` tiers (full_gpu / partial_gpu / ram_only / no_fit).
  const compat = (sizeBytes: Numish | undefined): FitTier => {
    const size = asNumber(sizeBytes)
    if (size === undefined) return "partial_gpu"
    const needed = size * 1.1
    const gpuOn = memoryPrefs.useGpu && vramTotal() > 0
    const ramOn = memoryPrefs.useRamFallback && ram() > 0
    if (gpuOn && ramOn) {
      // Prefer free VRAM for the full-offload tier; fall back to total when
      // the free value is unknown.
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

  const pages = createMemo(() => Math.max(1, Math.ceil((models() ?? []).length / PAGE_SIZE)))
  const pageModels = createMemo(() => (models() ?? []).slice(page() * PAGE_SIZE, (page() + 1) * PAGE_SIZE))

  const search = () => {
    const value = query().trim()
    if (!value) return
    setSubmitted(value)
    setPage(0)
  }

  const selectModel = (id: string) => {
    setSelected(id)
    setPage(0)
  }

  const startDownload = async (model: string, file: string) => {
    const job = jobsByKey()[`${model}/${file}`]
    if (job?.status === "downloading") return
    try {
      await serverSdk().client.modelhub.download({ ...params(), model, file })
      await refreshJobs()
    } catch {
      // the downloads section surfaces the failed/paused state
    }
  }

  const removeDownload = async (job: DownloadJob) => {
    try {
      await serverSdk().client.modelhub.cancel({ ...params(), id: job.id })
      await refreshJobs()
    } catch {
      // keep the job listed if the request fails
    }
  }

  const formatBytes = (bytes: Numish | undefined) => {
    const value = asNumber(bytes)
    if (value === undefined) return "—"
    const gb = value / 1e9
    return gb >= 1 ? `${gb.toFixed(2)} GB` : `${Math.round(value / 1e6)} MB`
  }

  const formatDownloads = (n: Numish | undefined) => {
    const value = asNumber(n)
    if (value === undefined) return ""
    if (value >= 1e6) return `${(value / 1e6).toFixed(1)}M`
    if (value >= 1e3) return `${(value / 1e3).toFixed(1)}k`
    return String(value)
  }

  const fitLabel = (tier: FitTier) => {
    switch (tier) {
      case "full_gpu":
        return language.t("settings.modelsHub.fit.fullGpu")
      case "partial_gpu":
        return language.t("settings.modelsHub.fit.partialGpu")
      case "ram_only":
        return language.t("settings.modelsHub.fit.ramOnly")
      case "no_fit":
        return language.t("settings.modelsHub.fit.noFit")
    }
  }

  const downloadStatusLabel = (status: DownloadStatus) => {
    switch (status) {
      case "downloading":
        return language.t("settings.modelsHub.download.downloading")
      case "paused":
        return language.t("settings.modelsHub.download.paused")
      case "completed":
        return language.t("settings.modelsHub.download.completed")
      case "failed":
        return language.t("settings.modelsHub.download.failed")
    }
  }

  const downloadProgress = (job: DownloadJob | undefined) => {
    if (!job) return undefined
    const received = asNumber(job.received) ?? 0
    const total = asNumber(job.total) ?? 0
    if (total <= 0) return 0
    return Math.min(100, Math.round((received / total) * 100))
  }

  // Compact, human-readable description for a model row: pipeline tag plus
  // hints derived from the id (e.g. "Text generation · Instruct").
  const modelDescription = (id: string, pipelineTag: string | undefined) => {
    const parts: string[] = []
    const tagKey = pipelineTag ? PipelineTagKeys[pipelineTag] : undefined
    if (tagKey) parts.push(language.t(tagKey))
    for (const [pattern, key] of ModelIdHints) {
      if (pattern.test(id)) parts.push(language.t(key))
    }
    return parts.join(" · ")
  }

  const prevPage = () => setPage((page() + pages() - 1) % pages())
  const nextPage = () => setPage((page() + 1) % pages())

  return (
    <>
      <div class="settings-v2-tab-header settings-v2-tab-header--stacked">
        <h2 class="settings-v2-tab-title">{language.t("settings.modelsHub.title")}</h2>
        <p class="settings-v2-tab-description">{language.t("settings.modelsHub.description")}</p>
        <div class="settings-v2-models-hub-search">
          <TextInputV2
            type="search"
            appearance="base"
            value={query()}
            onInput={(event) => setQuery(event.currentTarget.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") search()
            }}
            placeholder={language.t("settings.modelsHub.search.placeholder")}
            spellcheck={false}
            autocomplete="off"
            aria-label={language.t("settings.modelsHub.search.placeholder")}
          />
          <div class="settings-v2-models-hub-search-actions">
            <ButtonV2 type="button" variant="contrast" size="small" onClick={search} disabled={!query().trim()}>
              {language.t("settings.modelsHub.search.button")}
            </ButtonV2>
          </div>
        </div>
      </div>

      <div class="settings-v2-tab-body settings-v2-models-hub">
        <div class="settings-v2-models-hub-memory">
          <span class="settings-v2-models-hub-memory-title">
            {language.t("settings.modelsHub.memory.title")}
          </span>
          <div class="settings-v2-models-hub-memory-toggle">
            <span class="settings-v2-models-hub-memory-label">
              {language.t("settings.modelsHub.memory.gpu")}
            </span>
            <Switch
              checked={memoryPrefs.useGpu}
              onChange={(checked) => setMemoryPrefs("useGpu", checked)}
              hideLabel
            >
              {language.t("settings.modelsHub.memory.gpu")}
            </Switch>
          </div>
          <div class="settings-v2-models-hub-memory-toggle">
            <span class="settings-v2-models-hub-memory-label">
              {language.t("settings.modelsHub.memory.ram")}
            </span>
            <Switch
              checked={memoryPrefs.useRamFallback}
              onChange={(checked) => setMemoryPrefs("useRamFallback", checked)}
              hideLabel
            >
              {language.t("settings.modelsHub.memory.ram")}
            </Switch>
          </div>
        </div>

        <Show when={system()}>
          <div class="settings-v2-models-hub-sysinfo">
            <div class="settings-v2-models-hub-sysinfo-item">
              <span class="settings-v2-models-hub-sysinfo-label">
                {language.t("settings.modelsHub.system.ram")}
              </span>
              <span class="settings-v2-models-hub-sysinfo-value">
                {(asNumber(system()!.ram) ?? 0) / 1e9 >= 1
                  ? `${((asNumber(system()!.ram) ?? 0) / 1e9).toFixed(1)} GB`
                  : `${Math.round((asNumber(system()!.ram) ?? 0) / 1e6)} MB`}
              </span>
            </div>
            <Show when={vramTotal() > 0}>
              <div class="settings-v2-models-hub-sysinfo-item">
                <span class="settings-v2-models-hub-sysinfo-label">
                  {language.t("settings.modelsHub.system.vram")}
                </span>
                <span class="settings-v2-models-hub-sysinfo-value">
                  {`${(vramTotal() / 1e9).toFixed(1)} GB`}
                  <Show when={vramFree() > 0}>
                    <span class="settings-v2-models-hub-sysinfo-sub">
                      {language.t("settings.modelsHub.system.vramFree")} {(vramFree() / 1e9).toFixed(1)} GB
                    </span>
                  </Show>
                </span>
              </div>
            </Show>
            <div class="settings-v2-models-hub-sysinfo-item">
              <span class="settings-v2-models-hub-sysinfo-label">
                {language.t("settings.modelsHub.system.disk")}
              </span>
              <span class="settings-v2-models-hub-sysinfo-value">
                {formatBytes(asNumber(system()!.diskFree) ?? 0)}
              </span>
            </div>
            <Show when={system()!.gpu}>
              <div class="settings-v2-models-hub-sysinfo-item">
                <span class="settings-v2-models-hub-sysinfo-label">
                  {language.t("settings.modelsHub.system.gpu")}
                </span>
                <span class="settings-v2-models-hub-sysinfo-value">{system()!.gpu}</span>
              </div>
            </Show>
            <Show when={system()!.cpu}>
              <div class="settings-v2-models-hub-sysinfo-item">
                <span class="settings-v2-models-hub-sysinfo-label">
                  {language.t("settings.modelsHub.system.cpu")}
                </span>
                <span class="settings-v2-models-hub-sysinfo-value">{system()!.cpu}</span>
              </div>
            </Show>
          </div>
        </Show>

        <div class="settings-v2-models-hub-runtime">
          <div class="settings-v2-models-hub-runtime-header">
            <span class="settings-v2-models-hub-runtime-title">
              {language.t("settings.modelsHub.runtime.title")}
            </span>
            <span class="settings-v2-models-hub-runtime-description">
              {language.t("settings.modelsHub.runtime.description")}
            </span>
          </div>
          <div class="settings-v2-models-hub-runtime-chips">
            <For each={runtimes()}>
              {(runtime) => (
                <span class="settings-v2-models-hub-runtime-chip" data-available={runtime.available ? "" : undefined}>
                  <span class="settings-v2-models-hub-runtime-chip-name">{runtime.name}</span>
                  <span class="settings-v2-models-hub-runtime-chip-state">
                    {runtime.available
                      ? `${language.t("settings.modelsHub.runtime.available")}${runtime.version ? ` · v${runtime.version}` : ""}`
                      : language.t("settings.modelsHub.runtime.notDetected")}
                  </span>
                  <Show when={runtime.available}>
                    <button
                      type="button"
                      class="settings-v2-models-hub-runtime-install"
                      onClick={() => {
                        const recommended = recommendedModel()
                        void setupLocalProvider(
                          runtime.id,
                          defaultRuntimeModel(runtime.id, recommended?.label ?? "Qwen 2.5 7B"),
                        )
                      }}
                    >
                      {language.t("settings.modelsHub.provider.setup")}
                    </button>
                  </Show>
                  <Show when={!runtime.available && runtimeAPI()}>
                    <button
                      type="button"
                      class="settings-v2-models-hub-runtime-install"
                      onClick={() => void installRuntime(runtime.id)}
                      disabled={activeRuntime() !== undefined}
                    >
                      {installLabel(runtime.id)}
                    </button>
                  </Show>
                </span>
              )}
            </For>
          </div>
          <p class="settings-v2-models-hub-runtime-hint">{language.t("settings.modelsHub.runtime.hint")}</p>
        </div>

        <Show when={recommendedModel()}>
          {(recommended) => {
            const job = jobsByKey()[`${recommended().model}/${recommended().file}`]
            const downloading = job?.status === "downloading"
            const completed = job?.status === "completed"
            return (
              <div class="settings-v2-section">
                <h3 class="settings-v2-section-title">{language.t("settings.modelsHub.recommended.title")}</h3>
                <SettingsListV2>
                  <div class="settings-v2-models-hub-recommended">
                    <div class="settings-v2-models-hub-recommended-copy">
                      <div class="settings-v2-models-hub-recommended-name">{recommended().label}</div>
                      <div class="settings-v2-models-hub-recommended-meta">
                        {formatBytes(recommended().size)} · {language.t("settings.modelsHub.recommended.forYourGpu")}
                      </div>
                    </div>
                    <ButtonV2
                      type="button"
                      variant="contrast"
                      size="small"
                      disabled={downloading || completed}
                      onClick={() => void startDownload(recommended().model, recommended().file)}
                    >
                      {completed
                        ? language.t("settings.modelsHub.download.completed")
                        : downloading
                          ? language.t("settings.modelsHub.download.downloading")
                          : language.t("settings.modelsHub.recommended.download")}
                    </ButtonV2>
                  </div>
                </SettingsListV2>
              </div>
            )
          }}
        </Show>

        <Show when={submitted() && (models() ?? []).length === 0} fallback={<></>}>
          <div class="settings-v2-skills-status">{language.t("settings.modelsHub.empty")}</div>
        </Show>

        <Show when={(models() ?? []).length > 0}>
          <div class="settings-v2-models-hub-layout">
            <div class="settings-v2-models-hub-list">
              <SettingsListV2>
                <For each={pageModels()}>
                  {(model) => {
                    const best = model.quantFiles[0]
                    const c = compat(best?.size)
                    const largest = largestSize(model.quantFiles)
                    const sizeNote =
                      largest !== undefined && largest !== asNumber(best?.size) ? formatBytes(largest) : undefined
                    const description = modelDescription(model.id, model.pipeline_tag)
                    const descriptionLine = [description, sizeNote].filter(Boolean).join(" · ")
                    return (
                      <div
                        class="settings-v2-models-hub-item"
                        data-selected={selected() === model.id ? "" : undefined}
                        onClick={() => selectModel(model.id)}
                      >
                        <div class="settings-v2-models-hub-item-copy">
                          <div class="settings-v2-models-hub-item-name">{model.id}</div>
                          <Show when={descriptionLine}>
                            <div class="settings-v2-models-hub-item-description">{descriptionLine}</div>
                          </Show>
                          <div class="settings-v2-models-hub-item-meta">
                            <span class="settings-v2-models-hub-item-badge" data-compat={c} title={fitLabel(c)}>
                              {best?.quant ?? "GGUF"}
                            </span>
                            <span>{formatBytes(best?.size)}</span>
                            <span>
                              ↓ {formatDownloads(model.downloads)} · ♥ {formatDownloads(model.likes)}
                            </span>
                          </div>
                        </div>
                        <span class="settings-v2-models-hub-dot" data-compat={c} title={fitLabel(c)} />
                      </div>
                    )
                  }}
                </For>
              </SettingsListV2>
              <Show when={pages() > 1}>
                <div class="settings-v2-skills-pagination">
                  <ButtonV2 type="button" variant="ghost" size="small" onClick={prevPage}>
                    ←
                  </ButtonV2>
                  <span class="settings-v2-skills-pagination-label">
                    {page() + 1} / {pages()}
                  </span>
                  <ButtonV2 type="button" variant="ghost" size="small" onClick={nextPage}>
                    →
                  </ButtonV2>
                </div>
              </Show>
            </div>

            <Show when={selected()} fallback={<div class="settings-v2-skills-detail-empty" />}>
              <div class="settings-v2-models-hub-detail">
                <div class="settings-v2-models-hub-detail-header">
                  <div class="settings-v2-models-hub-item-copy">
                    <div class="settings-v2-models-hub-item-name">{selected()}</div>
                    <div class="settings-v2-models-hub-item-meta">
                      <span>
                        {language.t("settings.modelsHub.detail.files")}: {(files() ?? []).length}
                      </span>
                    </div>
                  </div>
                </div>
                <div class="settings-v2-models-hub-files">
                  <For each={files()}>
                    {(file) => {
                      const c = compat(file.size)
                      const key = `${selected()}/${file.file}`
                      const job = jobsByKey()[key]
                      const progress = downloadProgress(job)
                      return (
                        <div class="settings-v2-models-hub-file" data-compat={c}>
                          <div class="settings-v2-models-hub-file-copy">
                            <div class="settings-v2-models-hub-file-name">
                              {file.file}
                              <Show when={file.recommended}>
                                <span class="settings-v2-models-hub-recommended">
                                  {language.t("settings.modelsHub.recommended")}
                                </span>
                              </Show>
                            </div>
                            <div class="settings-v2-models-hub-item-meta">
                              <span class="settings-v2-models-hub-item-badge" data-compat={c} title={fitLabel(c)}>
                                {file.quant ?? "GGUF"}
                              </span>
                              <span>{formatBytes(file.size)}</span>
                            </div>
                          </div>
                          <Show
                            when={job && (job.status === "downloading" || job.status === "paused")}
                            fallback={
                              <Show
                                when={job?.status === "failed"}
                                fallback={
                                  <Show
                                    when={job?.status === "completed"}
                                    fallback={
                                      <ButtonV2
                                        type="button"
                                        variant={c === "no_fit" ? "danger" : c === "full_gpu" || c === "ram_only" ? "contrast" : "outline"}
                                        size="small"
                                        onClick={() => void startDownload(selected()!, file.file)}
                                      >
                                        {language.t("settings.modelsHub.download")}
                                      </ButtonV2>
                                    }
                                  >
                                    <span class="settings-v2-models-hub-status" data-status="completed">
                                      {language.t("settings.modelsHub.download.completed")}
                                    </span>
                                  </Show>
                                }
                              >
                                <div class="settings-v2-models-hub-file-actions">
                                  <span class="settings-v2-models-hub-status" data-status="failed">
                                    {language.t("settings.modelsHub.download.failed")}
                                  </span>
                                  <ButtonV2 type="button" variant="outline" size="small" onClick={() => void startDownload(selected()!, file.file)}>
                                    {language.t("settings.modelsHub.download.resume")}
                                  </ButtonV2>
                                </div>
                              </Show>
                            }
                          >
                            <div class="settings-v2-models-hub-file-actions">
                              <div class="settings-v2-models-hub-progress">
                                <div class="settings-v2-models-hub-progress-track">
                                  <div class="settings-v2-models-hub-progress-fill" style={{ width: `${progress}%` }} />
                                </div>
                                <span class="settings-v2-models-hub-progress-label">{progress}%</span>
                              </div>
                              <Show when={job!.status === "paused"}>
                                <ButtonV2 type="button" variant="outline" size="small" onClick={() => void startDownload(selected()!, file.file)}>
                                  {language.t("settings.modelsHub.download.resume")}
                                </ButtonV2>
                              </Show>
                            </div>
                          </Show>
                        </div>
                      )
                    }}
                  </For>
                </div>
                <div class="settings-v2-models-hub-legend">
                  <span class="settings-v2-models-hub-legend-item" data-compat="full_gpu">
                    {language.t("settings.modelsHub.fit.fullGpu")}
                  </span>
                  <span class="settings-v2-models-hub-legend-item" data-compat="partial_gpu">
                    {language.t("settings.modelsHub.fit.partialGpu")}
                  </span>
                  <span class="settings-v2-models-hub-legend-item" data-compat="ram_only">
                    {language.t("settings.modelsHub.fit.ramOnly")}
                  </span>
                  <span class="settings-v2-models-hub-legend-item" data-compat="no_fit">
                    {language.t("settings.modelsHub.fit.noFit")}
                  </span>
                </div>
              </div>
            </Show>
          </div>
        </Show>

        <Show when={(jobs() ?? []).length > 0}>
          <div class="settings-v2-models-hub-downloads">
            <div class="settings-v2-models-hub-downloads-title">
              {language.t("settings.modelsHub.downloads.title")}
            </div>
            <For each={jobs()}>
              {(job) => {
                const progress = downloadProgress(job)
                return (
                  <div class="settings-v2-models-hub-download" data-status={job.status}>
                    <div class="settings-v2-models-hub-download-copy">
                      <div class="settings-v2-models-hub-download-name">
                        {`${job.model} · ${job.file}`}
                        <Show when={job.error}>
                          <span class="settings-v2-models-hub-download-error">{job.error}</span>
                        </Show>
                      </div>
                      <div class="settings-v2-models-hub-item-meta">
                        <span class="settings-v2-models-hub-status" data-status={job.status}>
                          {downloadStatusLabel(job.status)}
                        </span>
                        <span>
                          {formatBytes(job.received)}
                          {job.status === "downloading" || job.status === "paused" ? ` / ${formatBytes(job.total)}` : ""}
                        </span>
                      </div>
                    </div>
                    <Show when={job.status === "downloading" || job.status === "paused"}>
                      <div class="settings-v2-models-hub-progress">
                        <div class="settings-v2-models-hub-progress-track">
                          <div class="settings-v2-models-hub-progress-fill" style={{ width: `${progress}%` }} />
                        </div>
                        <span class="settings-v2-models-hub-progress-label">{progress}%</span>
                      </div>
                    </Show>
                    <div class="settings-v2-models-hub-download-actions">
                      <Show when={job.status === "paused" || job.status === "failed"}>
                        <ButtonV2 type="button" variant="outline" size="small" onClick={() => void startDownload(job.model, job.file)}>
                          {language.t("settings.modelsHub.download.resume")}
                        </ButtonV2>
                      </Show>
                      <ButtonV2 type="button" variant="ghost" size="small" onClick={() => void removeDownload(job)}>
                        {language.t("settings.modelsHub.download.delete")}
                      </ButtonV2>
                    </div>
                  </div>
                )
              }}
            </For>
          </div>
        </Show>
      </div>
    </>
  )
}

type Numish = number | "NaN" | "Infinity" | "-Infinity"

type Model = {
  id: string
  downloads?: Numish
  likes?: Numish
  pipeline_tag?: string
  quantFiles: QuantFile[]
}

type QuantFile = {
  file: string
  quant?: string
  size?: Numish
  sha256?: string
  fit?: { tier: FitTier; label: string }
  recommended?: boolean
}

type DownloadJob = {
  id: string
  model: string
  file: string
  status: DownloadStatus
  total: Numish
  received: Numish
  done: boolean
  error?: string
}

type RuntimeInfo = {
  id: string
  name: string
  available: boolean
  version?: string
}

const asNumber = (value: Numish | undefined): number | undefined =>
  typeof value === "number" ? value : undefined
