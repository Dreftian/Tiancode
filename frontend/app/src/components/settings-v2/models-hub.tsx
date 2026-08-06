import { ButtonV2 } from "@tiancode-ai/ui/v2/button-v2"
import { TextInputV2 } from "@tiancode-ai/ui/v2/text-input-v2"
import { type Component, createResource, For, Show, createSignal, createMemo, onCleanup } from "solid-js"
import { useLanguage } from "@/context/language"
import { useServerSDK } from "@/context/server-sdk"
import { SettingsListV2 } from "./parts/list"
import "./models-hub.css"

type Compatibility = "green" | "blue" | "red"

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
  const [downloading, setDownloading] = createSignal<Record<string, boolean>>({})
  const [downloads, setDownloads] = createSignal<Record<string, { received: number; total: number }>>({})

  const params = () => (props.directory ? { directory: props.directory } : undefined)

  const [system, { refetch: refetchSystem }] = createResource(
    () => serverSdk().client.modelhub.system(params()),
    (request) => request.then((x) => x.data),
    { initialValue: undefined as { ram: number; modelsDir: string } | undefined },
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

  const ram = createMemo(() => asNumber(system()?.ram) ?? 0)

  const compat = (sizeBytes: number | "NaN" | "Infinity" | "-Infinity" | undefined): Compatibility => {
    const size = asNumber(sizeBytes)
    if (size === undefined) return "blue"
    const total = ram()
    if (total === 0) return "blue"
    const ratio = size / total
    if (ratio <= 0.6) return "green"
    if (ratio <= 1) return "blue"
    return "red"
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
    setDownloading((prev) => ({ ...prev, [`${model}/${file}`]: true }))
    try {
      await serverSdk().client.modelhub.download({ ...params(), model, file })
      const poll = setInterval(async () => {
        try {
          const res = await serverSdk().client.modelhub.downloads(params())
          const states = res.data ?? []
          const entry = states.find((s) => s.model === model && s.file === file)
          if (entry) {
            setDownloads((prev) => ({
              ...prev,
              [`${model}/${file}`]: { received: asNumber(entry.received) ?? 0, total: asNumber(entry.total) ?? 0 },
            }))
            if (entry.done) {
              clearInterval(poll)
              setDownloading((prev) => ({ ...prev, [`${model}/${file}`]: false }))
            }
          }
        } catch {
          clearInterval(poll)
          setDownloading((prev) => ({ ...prev, [`${model}/${file}`]: false }))
        }
      }, 800)
      onCleanup(() => clearInterval(poll))
    } catch {
      setDownloading((prev) => ({ ...prev, [`${model}/${file}`]: false }))
    }
  }

  const formatBytes = (bytes: number | "NaN" | "Infinity" | "-Infinity" | undefined) => {
    const value = asNumber(bytes)
    if (value === undefined) return "—"
    const gb = value / 1e9
    return gb >= 1 ? `${gb.toFixed(2)} GB` : `${Math.round(value / 1e6)} MB`
  }

  const formatDownloads = (n: number | "NaN" | "Infinity" | "-Infinity" | undefined) => {
    const value = asNumber(n)
    if (value === undefined) return ""
    if (value >= 1e6) return `${(value / 1e6).toFixed(1)}M`
    if (value >= 1e3) return `${(value / 1e3).toFixed(1)}k`
    return String(value)
  }

  const compatibilityLabel = (c: Compatibility) => {
    switch (c) {
      case "green":
        return language.t("settings.modelsHub.compat.green")
      case "blue":
        return language.t("settings.modelsHub.compat.blue")
      case "red":
        return language.t("settings.modelsHub.compat.red")
    }
  }

  const downloadProgress = (model: string, file: string) => {
    const state = downloads()[`${model}/${file}`]
    if (!state) return undefined
    return state.total > 0 ? Math.min(100, Math.round((state.received / state.total) * 100)) : 0
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
        <div class="settings-v2-tab-search">
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
          <ButtonV2 type="button" variant="contrast" size="small" onClick={search} disabled={!query().trim()}>
            {language.t("settings.modelsHub.search.button")}
          </ButtonV2>
        </div>
      </div>

      <div class="settings-v2-tab-body settings-v2-models-hub">
        <Show when={system()}>
          <div class="settings-v2-models-hub-sysinfo">
            <span>
              {language.t("settings.modelsHub.system.ram")}: {(ram() / 1e9).toFixed(1)} GB
            </span>
            <span>
              {language.t("settings.modelsHub.system.dir")}: {system()!.modelsDir}
            </span>
          </div>
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
                            <span class="settings-v2-models-hub-item-badge" data-compat={c}>
                              {best?.quant ?? "GGUF"}
                            </span>
                            <span>{formatBytes(best?.size)}</span>
                            <span>
                              ↓ {formatDownloads(model.downloads)} · ♥ {formatDownloads(model.likes)}
                            </span>
                          </div>
                        </div>
                        <span class="settings-v2-models-hub-dot" data-compat={c} title={compatibilityLabel(c)} />
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
                      const progress = downloadProgress(selected()!, file.file)
                      return (
                        <div class="settings-v2-models-hub-file" data-compat={c}>
                          <div class="settings-v2-models-hub-file-copy">
                            <div class="settings-v2-models-hub-file-name">{file.file}</div>
                            <div class="settings-v2-models-hub-item-meta">
                              <span class="settings-v2-models-hub-item-badge" data-compat={c}>
                                {file.quant ?? "GGUF"}
                              </span>
                              <span>{formatBytes(file.size)}</span>
                            </div>
                          </div>
                          <Show
                            when={progress !== undefined}
                            fallback={
                              <ButtonV2
                                type="button"
                                variant={c === "red" ? "danger" : c === "green" ? "contrast" : "outline"}
                                size="small"
                                disabled={downloading()[key]}
                                onClick={() => void startDownload(selected()!, file.file)}
                              >
                                {language.t("settings.modelsHub.download")}
                              </ButtonV2>
                            }
                          >
                            <div class="settings-v2-models-hub-progress">
                              <div class="settings-v2-models-hub-progress-track">
                                <div class="settings-v2-models-hub-progress-fill" style={{ width: `${progress}%` }} />
                              </div>
                              <span class="settings-v2-models-hub-progress-label">{progress}%</span>
                            </div>
                          </Show>
                        </div>
                      )
                    }}
                  </For>
                </div>
                <div class="settings-v2-models-hub-legend">
                  <span class="settings-v2-models-hub-legend-item" data-compat="green">
                    {language.t("settings.modelsHub.compat.green")}
                  </span>
                  <span class="settings-v2-models-hub-legend-item" data-compat="blue">
                    {language.t("settings.modelsHub.compat.blue")}
                  </span>
                  <span class="settings-v2-models-hub-legend-item" data-compat="red">
                    {language.t("settings.modelsHub.compat.red")}
                  </span>
                </div>
              </div>
            </Show>
          </div>
        </Show>
      </div>
    </>
  )
}

type Model = {
  id: string
  downloads?: number | "NaN" | "Infinity" | "-Infinity"
  likes?: number | "NaN" | "Infinity" | "-Infinity"
  pipeline_tag?: string
  quantFiles: QuantFile[]
}

type QuantFile = {
  file: string
  quant?: string
  size?: number | "NaN" | "Infinity" | "-Infinity"
}

const asNumber = (value: number | "NaN" | "Infinity" | "-Infinity" | undefined): number | undefined =>
  typeof value === "number" ? value : undefined
