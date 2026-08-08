import { ButtonV2 } from "@tiancode-ai/ui/v2/button-v2"
import { Switch } from "@tiancode-ai/ui/v2/switch-v2"
import { Icon as IconV2 } from "@tiancode-ai/ui/v2/icon"
import { IconButtonV2 } from "@tiancode-ai/ui/v2/icon-button-v2"
import { Icon } from "@tiancode-ai/ui/icon"
import { type Component, createMemo, createResource, createSignal, For, onCleanup, onMount, Show } from "solid-js"
import { useLanguage } from "@/context/language"
import { useSettings } from "@/context/settings"
import { showToast } from "@/utils/toast"
import { isVoiceSpeaking, speakWithVoices, voicesAPI, type VoiceInfo } from "@/utils/voices"
import { SettingsListV2 } from "./parts/list"
import { SettingsRowV2 } from "./parts/row"
import "./voices.css"

const PAGE_SIZE = 8
const PROBE_TEXT_EN = "Hello! This is Tiancode speaking."
const PROBE_TEXT_ES = "Hola, soy la voz de Tiancode en español."
const voiceProbeKey = (voiceID: string) => `voice:${voiceID}`

type VoiceFilter = "all" | "female" | "male" | "spanish"

const FILTERS: { id: VoiceFilter; key: string }[] = [
  { id: "all", key: "settings.voices.filter.all" },
  { id: "female", key: "settings.voices.filter.female" },
  { id: "male", key: "settings.voices.filter.male" },
  { id: "spanish", key: "settings.voices.filter.spanish" },
]

// Short map of the voice languages shipped with the bundled kokoro model and
// the piper voices; unknown codes fall back to the raw ISO code.
const LANGUAGE_LABELS: Record<string, string> = {
  en: "English",
  "en-us": "English (US)",
  "en-gb": "English (UK)",
  es: "Spanish",
  "es-es": "Spanish",
  "es-ar": "Spanish (Argentina)",
  fr: "French",
  "fr-fr": "French",
  hi: "Hindi",
  it: "Italian",
  ja: "Japanese",
  pt: "Portuguese",
  "pt-br": "Portuguese (Brazil)",
  zh: "Chinese",
  "zh-cn": "Chinese (China)",
}

const languageLabel = (code: string) => LANGUAGE_LABELS[code.toLowerCase()] ?? code

// A voice can be selected only when it is supported, enabled and (for piper)
// already downloaded; everything else stays visible for management.
const canSelect = (voice: VoiceInfo) =>
  voice.supported && voice.enabled !== false && (voice.engine === "kokoro" || voice.downloaded === true)

export const SettingsVoicesV2: Component = () => {
  const language = useLanguage()
  const settings = useSettings()
  const api = voicesAPI()

  const [status, { refetch }] = createResource(async () => api?.status())
  const [progress, setProgress] = createSignal(0)
  const [file, setFile] = createSignal<string | undefined>(undefined)
  const [downloading, setDownloading] = createSignal(false)
  const [filter, setFilter] = createSignal<VoiceFilter>("all")
  const [page, setPage] = createSignal(0)
  const [infoVoice, setInfoVoice] = createSignal<string | undefined>(undefined)
  // Per-voice piper download progress; entries vanish when the file lands.
  const [piperProgress, setPiperProgress] = createSignal<Record<string, number>>({})
  const [deleting, setDeleting] = createSignal<Record<string, boolean>>({})

  let unsubscribe: (() => void) | undefined
  let piperUnsubscribe: (() => void) | undefined
  onMount(() => {
    const current = api
    if (!current) return
    unsubscribe = current.onProgress((event) => {
      setProgress(event.progress)
      if (event.file) setFile(event.file)
    })
    piperUnsubscribe = current.onPiperProgress((event) => {
      if (event.done) {
        setPiperProgress((prev) => {
          const next = { ...prev }
          delete next[event.voiceId]
          return next
        })
        void refetch()
        return
      }
      setPiperProgress((prev) => ({ ...prev, [event.voiceId]: event.progress }))
    })
  })
  onCleanup(() => {
    unsubscribe?.()
    unsubscribe = undefined
    piperUnsubscribe?.()
    piperUnsubscribe = undefined
  })

  const modelDownloading = () => downloading() || status()?.downloading === true
  // Main reports progress in 0-100 already; status().progress stays 0 until
  // ready, so the live event value is the one that moves during downloads.
  const progressPercent = createMemo(() => Math.max(0, Math.min(100, Math.round(progress()))))

  const downloadModel = async () => {
    const current = api
    if (!current || modelDownloading()) return
    setDownloading(true)
    try {
      await current.download()
      void refetch()
    } catch (error) {
      showToast({
        variant: "error",
        title: language.t("settings.voices.download.failed"),
        description: error instanceof Error ? error.message : undefined,
      })
    } finally {
      setDownloading(false)
    }
  }

  // Feminine voices first, keeping the model's original order within a gender.
  const sortedVoices = createMemo<VoiceInfo[]>(() => {
    const voices = status()?.voices ?? []
    return [...voices.filter((voice) => voice.gender === "female"), ...voices.filter((voice) => voice.gender !== "female")]
  })

  const filteredVoices = createMemo(() => {
    const current = filter()
    return sortedVoices().filter((voice) => {
      if (current === "all") return true
      if (current === "female") return voice.gender === "female"
      if (current === "male") return voice.gender !== "female"
      return voice.language.toLowerCase().startsWith("es")
    })
  })

  const pages = createMemo(() => Math.max(1, Math.ceil(filteredVoices().length / PAGE_SIZE)))
  const currentPage = createMemo(() => Math.min(page(), pages() - 1))
  const pageVoices = createMemo(() =>
    filteredVoices().slice(currentPage() * PAGE_SIZE, (currentPage() + 1) * PAGE_SIZE),
  )

  const selected = () => status()?.selected
  const selectedVoice = createMemo(() => sortedVoices().find((voice) => voice.id === selected()))

  const selectVoice = async (voice: VoiceInfo) => {
    const current = api
    if (!current || !canSelect(voice) || selected() === voice.id) return
    try {
      await current.select(voice.id)
      void refetch()
    } catch {
      // Selection is advisory; the status refetch shows the persisted value.
    }
  }

  const toggleEnabled = async (voice: VoiceInfo, enabled: boolean) => {
    const current = api
    if (!current) return
    try {
      await current.setEnabled(voice.id, enabled)
      void refetch()
    } catch {
      // The status refetch shows the persisted value.
    }
  }

  const downloadVoice = async (voice: VoiceInfo) => {
    const current = api
    if (!current) return
    try {
      await current.downloadVoice(voice.id)
      void refetch()
      showToast({ variant: "success", title: language.t("settings.voices.voice.download.success") })
    } catch (error) {
      showToast({
        variant: "error",
        title: language.t("settings.voices.voice.download.failed"),
        description: error instanceof Error ? error.message : undefined,
      })
    }
  }

  const deleteVoice = async (voice: VoiceInfo) => {
    if (!window.confirm(language.t("settings.voices.voice.delete.confirm", { name: voice.name }))) return
    const current = api
    if (!current) return
    setDeleting((prev) => ({ ...prev, [voice.id]: true }))
    try {
      await current.deleteVoice(voice.id)
      void refetch()
      showToast({ variant: "success", title: language.t("settings.voices.voice.delete.success") })
    } catch (error) {
      showToast({
        variant: "error",
        title: language.t("settings.voices.voice.delete.failed"),
        description: error instanceof Error ? error.message : undefined,
      })
    } finally {
      setDeleting((prev) => {
        const next = { ...prev }
        delete next[voice.id]
        return next
      })
    }
  }

  const probe = async (voice: VoiceInfo) => {
    const text = voice.engine === "piper" ? PROBE_TEXT_ES : PROBE_TEXT_EN
    const error = await speakWithVoices(voiceProbeKey(voice.id), text, voice.id)
    if (error) {
      showToast({ variant: "error", title: language.t("settings.voices.voice.probe.failed"), description: error })
    }
  }

  const probeLabel = (voice: VoiceInfo) => {
    if (piperProgress()[voice.id] !== undefined) return language.t("settings.voices.voice.downloading")
    if (isVoiceSpeaking(voiceProbeKey(voice.id))) return language.t("settings.voices.voice.speaking")
    return language.t("settings.voices.voice.probe")
  }

  return (
    <>
      <div class="settings-v2-tab-header">
        <h2 class="settings-v2-tab-title">{language.t("settings.voices.title")}</h2>
        <p class="settings-v2-tab-description">{language.t("settings.voices.description")}</p>
      </div>

      <div class="settings-v2-tab-body settings-v2-voices">
        <Show when={!api}>
          <div class="settings-v2-skills-message">{language.t("settings.voices.desktopOnly")}</div>
        </Show>

        <Show when={api}>
          <Show when={status()?.error}>
            <div class="settings-v2-skills-message" data-variant="error">
              {status()!.error}
            </div>
          </Show>

          <Show when={status.loading} fallback={null}>
            <div class="settings-v2-skills-status">{language.t("settings.voices.loading")}</div>
          </Show>

          <Show when={!status.loading && status() && !status()!.ready}>
            <div class="settings-v2-section">
              <h3 class="settings-v2-section-title">{language.t("settings.voices.download.title")}</h3>
              <p class="settings-v2-voices-description">{language.t("settings.voices.download.description")}</p>
              <Show
                when={modelDownloading()}
                fallback={
                  <div class="settings-v2-voices-actions">
                    <ButtonV2 type="button" variant="contrast" size="small" onClick={() => void downloadModel()}>
                      {language.t("settings.voices.download.button")}
                    </ButtonV2>
                  </div>
                }
              >
                <div class="settings-v2-voices-progress">
                  <div class="settings-v2-voices-progress-track">
                    <div class="settings-v2-voices-progress-fill" style={{ width: `${progressPercent()}%` }} />
                  </div>
                  <div class="settings-v2-voices-progress-label">
                    <span>
                      {file()
                        ? language.t("settings.voices.download.progress", { file: file()! })
                        : language.t("settings.voices.download.downloading")}
                    </span>
                    <span>{progressPercent()}%</span>
                  </div>
                </div>
              </Show>
            </div>
          </Show>

          <Show when={!status.loading && status()?.ready}>
            <Show when={selectedVoice()}>
              <div class="settings-v2-voices-selected">
                <Icon name="circle-check" size="small" />
                <span class="settings-v2-voices-selected-label">{language.t("settings.voices.select.title")}</span>
                <span class="settings-v2-voices-selected-name">{selectedVoice()!.name}</span>
              </div>
            </Show>

            <SettingsListV2>
              <SettingsRowV2
                title={language.t("settings.voices.autoSpeak.title")}
                description={language.t("settings.voices.autoSpeak.description")}
              >
                <Switch
                  checked={settings.general.autoSpeak()}
                  onChange={(value) => settings.general.setAutoSpeak(value)}
                />
              </SettingsRowV2>
            </SettingsListV2>

            <div class="settings-v2-section">
              <h3 class="settings-v2-section-title">{language.t("settings.voices.ready.title")}</h3>

              <div class="settings-v2-voices-filters">
                <For each={FILTERS}>
                  {(item) => (
                    <ButtonV2
                      type="button"
                      variant={filter() === item.id ? "contrast" : "ghost"}
                      size="small"
                      onClick={() => {
                        setFilter(item.id)
                        setPage(0)
                      }}
                    >
                      {language.t(item.key)}
                    </ButtonV2>
                  )}
                </For>
              </div>

              <Show
                when={filteredVoices().length > 0}
                fallback={<div class="settings-v2-skills-status">{language.t("settings.voices.voices.empty")}</div>}
              >
                <SettingsListV2>
                  <For each={pageVoices()}>
                    {(voice) => {
                      const selectable = canSelect(voice)
                      const downloadProgress = piperProgress()[voice.id]
                      return (
                        <>
                          <div
                            role="button"
                            tabIndex={selectable ? 0 : -1}
                            aria-disabled={!selectable || undefined}
                            class="settings-v2-voices-row"
                            data-selected={selected() === voice.id || undefined}
                            data-disabled={!selectable || undefined}
                            onClick={() => {
                              if (selectable) void selectVoice(voice)
                            }}
                            onKeyDown={(event) => {
                              if (!selectable || (event.key !== "Enter" && event.key !== " ")) return
                              event.preventDefault()
                              void selectVoice(voice)
                            }}
                          >
                            <span
                              class="settings-v2-voices-row-radio"
                              data-checked={selected() === voice.id || undefined}
                            >
                              <Show when={selected() === voice.id}>
                                <Icon name="check-small" size="small" />
                              </Show>
                            </span>
                            <div class="settings-v2-voices-row-copy">
                              <div class="settings-v2-voices-row-name-row">
                                <span class="settings-v2-voices-row-name">{voice.name}</span>
                                <span class="settings-v2-voices-chip" data-variant={voice.gender}>
                                  {language.t(
                                    voice.gender === "female"
                                      ? "settings.voices.gender.female"
                                      : "settings.voices.gender.male",
                                  )}
                                </span>
                                <Show when={voice.engine === "piper"}>
                                  <span class="settings-v2-voices-chip" data-variant="engine">
                                    {language.t("settings.voices.voice.engine.piper")}
                                  </span>
                                </Show>
                                <Show when={voice.engine === "kokoro" && !voice.supported}>
                                  <span class="settings-v2-voices-unsupported">
                                    {language.t("settings.voices.voice.unsupported")}
                                  </span>
                                </Show>
                              </div>
                              <div class="settings-v2-voices-row-meta">
                                <span>{languageLabel(voice.language)}</span>
                                <Show when={voice.sizeMb}>
                                  <span>{language.t("settings.voices.voice.size", { size: voice.sizeMb! })}</span>
                                </Show>
                              </div>
                            </div>
                            <IconButtonV2
                              size="small"
                              variant="ghost-muted"
                              aria-label={language.t("settings.voices.voice.info")}
                              icon={<IconV2 name="help" size="small" />}
                              onClick={(event: MouseEvent) => {
                                event.stopPropagation()
                                setInfoVoice(infoVoice() === voice.id ? undefined : voice.id)
                              }}
                            />
                            <div class="settings-v2-voices-row-toggle">
                              <Switch
                                checked={voice.enabled !== false}
                                onChange={(enabled) => void toggleEnabled(voice, enabled)}
                                hideLabel
                              >
                                {language.t("settings.voices.voice.enabled")}
                              </Switch>
                            </div>
                            <Show
                              when={voice.engine === "piper"}
                              fallback={
                                <span class="settings-v2-voices-chip" data-variant="builtin">
                                  {language.t("settings.voices.voice.builtin")}
                                </span>
                              }
                            >
                              <Show
                                when={downloadProgress !== undefined}
                                fallback={
                                  <Show
                                    when={voice.downloaded === true}
                                    fallback={
                                      <ButtonV2
                                        type="button"
                                        variant="outline"
                                        size="small"
                                        onClick={(event: MouseEvent) => {
                                          event.stopPropagation()
                                          void downloadVoice(voice)
                                        }}
                                      >
                                        {language.t("settings.voices.voice.download")}
                                      </ButtonV2>
                                    }
                                  >
                                    <ButtonV2
                                      type="button"
                                      variant="danger"
                                      size="small"
                                      disabled={deleting()[voice.id] === true}
                                      onClick={(event: MouseEvent) => {
                                        event.stopPropagation()
                                        void deleteVoice(voice)
                                      }}
                                    >
                                      {language.t("settings.voices.voice.delete")}
                                    </ButtonV2>
                                  </Show>
                                }
                              >
                                <div class="settings-v2-voices-row-progress">
                                  <div class="settings-v2-voices-progress-track">
                                    <div
                                      class="settings-v2-voices-progress-fill"
                                      style={{ width: `${Math.max(0, Math.min(100, downloadProgress))}%` }}
                                    />
                                  </div>
                                  <span class="settings-v2-voices-row-progress-label">
                                    {Math.max(0, Math.min(100, downloadProgress))}%
                                  </span>
                                </div>
                              </Show>
                            </Show>
                            <ButtonV2
                              type="button"
                              variant="outline"
                              size="small"
                              disabled={!voice.supported || deleting()[voice.id] === true}
                              onClick={(event: MouseEvent) => {
                                event.stopPropagation()
                                void probe(voice)
                              }}
                            >
                              {probeLabel(voice)}
                            </ButtonV2>
                          </div>
                          <Show when={infoVoice() === voice.id}>
                            <div class="settings-v2-voices-info">
                              <div class="settings-v2-voices-info-title">{voice.name}</div>
                              <div class="settings-v2-voices-info-grid">
                                <span class="settings-v2-voices-info-caption">
                                  {language.t(
                                    voice.engine === "piper"
                                      ? "settings.voices.voice.engine.piper"
                                      : "settings.voices.voice.engine.kokoro",
                                  )}
                                </span>
                                <span class="settings-v2-voices-info-value">{languageLabel(voice.language)}</span>
                                <span class="settings-v2-voices-info-caption">
                                  {language.t(
                                    voice.gender === "female"
                                      ? "settings.voices.gender.female"
                                      : "settings.voices.gender.male",
                                  )}
                                </span>
                                <span class="settings-v2-voices-info-value">
                                  {voice.sizeMb
                                    ? language.t("settings.voices.voice.size", { size: voice.sizeMb })
                                    : "—"}
                                </span>
                                <span class="settings-v2-voices-info-caption">
                                  {language.t("settings.voices.voice.license")}
                                </span>
                                <span class="settings-v2-voices-info-value">{voice.license ?? "—"}</span>
                                <Show when={selected() === voice.id}>
                                  <span class="settings-v2-voices-chip" data-variant="builtin">
                                    {language.t("settings.voices.select.title")}
                                  </span>
                                </Show>
                              </div>
                            </div>
                          </Show>
                        </>
                      )
                    }}
                  </For>
                </SettingsListV2>
                <Show when={pages() > 1}>
                  <div class="settings-v2-voices-pagination">
                    <ButtonV2
                      type="button"
                      variant="ghost"
                      size="small"
                      disabled={currentPage() <= 0}
                      onClick={() => setPage((value) => Math.max(0, value - 1))}
                    >
                      {language.t("settings.voices.pagination.prev")}
                    </ButtonV2>
                    <span class="settings-v2-voices-pagination-label">
                      {language.t("settings.voices.pagination.page", { current: currentPage() + 1, total: pages() })}
                    </span>
                    <ButtonV2
                      type="button"
                      variant="ghost"
                      size="small"
                      disabled={currentPage() >= pages() - 1}
                      onClick={() => setPage((value) => Math.min(pages() - 1, value + 1))}
                    >
                      {language.t("settings.voices.pagination.next")}
                    </ButtonV2>
                  </div>
                </Show>
              </Show>
            </div>
          </Show>
        </Show>
      </div>
    </>
  )
}
