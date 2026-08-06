import { ButtonV2 } from "@tiancode-ai/ui/v2/button-v2"
import { Icon } from "@tiancode-ai/ui/icon"
import { type Component, createMemo, createResource, createSignal, For, onCleanup, onMount, Show } from "solid-js"
import { useLanguage } from "@/context/language"
import { showToast } from "@/utils/toast"
import { isVoiceSpeaking, speakWithVoices, voicesAPI, type VoiceInfo } from "@/utils/voices"
import { SettingsListV2 } from "./parts/list"
import "./voices.css"

const PROBE_TEXT = "Hello! This is Tiancode speaking."

// Short map of the voice languages shipped with the bundled kokoro model;
// unknown codes fall back to the raw ISO code.
const LANGUAGE_LABELS: Record<string, string> = {
  en: "English",
  "en-us": "English (US)",
  "en-gb": "English (UK)",
  es: "Spanish",
  "es-es": "Spanish",
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

const voiceProbeKey = (voiceID: string) => `voice:${voiceID}`

export const SettingsVoicesV2: Component = () => {
  const language = useLanguage()
  const api = voicesAPI()

  const [status, { refetch }] = createResource(async () => api?.status())
  const [progress, setProgress] = createSignal(0)
  const [file, setFile] = createSignal<string | undefined>(undefined)
  const [downloading, setDownloading] = createSignal(false)

  let unsubscribe: (() => void) | undefined
  onMount(() => {
    const current = api
    if (!current) return
    unsubscribe = current.onProgress((event) => {
      setProgress(event.progress)
      if (event.file) setFile(event.file)
    })
  })
  onCleanup(() => {
    unsubscribe?.()
    unsubscribe = undefined
  })

  const modelDownloading = () => downloading() || status()?.downloading === true
  const progressPercent = createMemo(() => Math.max(0, Math.min(100, Math.round((status()?.progress ?? progress()) * 100))))

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
  const selected = () => status()?.selected
  const selectedVoice = createMemo(() => sortedVoices().find((voice) => voice.id === selected()))

  const selectVoice = async (voice: VoiceInfo) => {
    const current = api
    if (!current || selected() === voice.id) return
    try {
      await current.select(voice.id)
      void refetch()
    } catch {
      // Selection is advisory; the status refetch shows the persisted value.
    }
  }

  const probe = async (voice: VoiceInfo) => {
    const error = await speakWithVoices(voiceProbeKey(voice.id), PROBE_TEXT, voice.id)
    if (error) {
      showToast({ variant: "error", title: language.t("settings.voices.voice.probe.failed"), description: error })
    }
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

            <div class="settings-v2-section">
              <h3 class="settings-v2-section-title">{language.t("settings.voices.ready.title")}</h3>
              <Show
                when={sortedVoices().length > 0}
                fallback={<div class="settings-v2-skills-status">{language.t("settings.voices.voices.empty")}</div>}
              >
                <SettingsListV2>
                  <For each={sortedVoices()}>
                    {(voice) => (
                      <div
                        role="button"
                        tabIndex={0}
                        class="settings-v2-voices-row"
                        data-selected={selected() === voice.id || undefined}
                        onClick={() => void selectVoice(voice)}
                        onKeyDown={(event) => {
                          if (event.key !== "Enter" && event.key !== " ") return
                          event.preventDefault()
                          void selectVoice(voice)
                        }}
                      >
                        <span class="settings-v2-voices-row-radio" data-checked={selected() === voice.id || undefined}>
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
                          </div>
                          <div class="settings-v2-voices-row-meta">
                            <span>{languageLabel(voice.language)}</span>
                            <Show when={!voice.supported}>
                              <span class="settings-v2-voices-unsupported">
                                {language.t("settings.voices.voice.unsupported")}
                              </span>
                            </Show>
                          </div>
                        </div>
                        <ButtonV2
                          type="button"
                          variant="outline"
                          size="small"
                          disabled={!voice.supported}
                          onClick={(event: MouseEvent) => {
                            event.stopPropagation()
                            void probe(voice)
                          }}
                        >
                          {isVoiceSpeaking(voiceProbeKey(voice.id))
                            ? language.t("settings.voices.voice.speaking")
                            : language.t("settings.voices.voice.probe")}
                        </ButtonV2>
                      </div>
                    )}
                  </For>
                </SettingsListV2>
              </Show>
            </div>
          </Show>
        </Show>
      </div>
    </>
  )
}
