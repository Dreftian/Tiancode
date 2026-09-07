import { ButtonV2 } from "@tiancode-ai/ui/v2/button-v2"
import { Switch } from "@tiancode-ai/ui/v2/switch-v2"
import { Icon as IconV2 } from "@tiancode-ai/ui/v2/icon"
import { IconButtonV2 } from "@tiancode-ai/ui/v2/icon-button-v2"
import { Icon } from "@tiancode-ai/ui/icon"
import { type Component, createMemo, createResource, createSignal, For, onCleanup, onMount, Show } from "solid-js"
import { useLanguage } from "@/context/language"
import { useSettings } from "@/context/settings"
import { showToast } from "@/utils/toast"
import {
  isVoiceSpeaking,
  speakWithVoices,
  voicesAPI,
  type VoiceInfo,
  getVoiceSpeed,
  setVoiceSpeed,
  getVoicePitch,
  setVoicePitch,
  getVoiceVolume,
  setVoiceVolume,
  getBargeInEnabled,
  setBargeInEnabled,
  enableBargeInListener,
  currentSpeakingKey,
  getVoiceEngineMode,
  setVoiceEngineMode,
  stopSpeaking,
  type VoiceEngineMode,
  getFishAudioKey,
  setFishAudioKey,
  DEFAULT_FISH_KEY,
  getFishAudioVoice,
  setFishAudioVoice,
  DEFAULT_FISH_VOICE,
  CURATED_FISH_VOICES,
  speakWithFishAudio,
} from "@/utils/voices"
import { stopAutoSpeak } from "@/utils/auto-speak"
import { AudioWaveform } from "@/components/audio-waveform"
import { SettingsListV2 } from "./parts/list"
import { SettingsRowV2 } from "./parts/row"
import { SettingsPagerV2 } from "./parts/pager"
import { SelectV2 } from "@tiancode-ai/ui/v2/select-v2"
import { MicTester } from "./mic-tester"
import {
  getAudioInputDevices,
  getSelectedAudioDeviceId,
  setSelectedAudioDeviceId,
  onAudioDeviceChange,
  getDictationDictionary,
  addDictationDictionaryEntry,
  removeDictationDictionaryEntry,
  getRecentRecordings,
  clearRecentRecordings,
  type DictationRecording,
  getHoldDictationShortcut,
  getToggleDictationShortcut,
} from "@/utils/asr"
import "./voices.css"

const PAGE_SIZE = 24
const PROBE_TEXT_EN = "Hello! This is Tiancode speaking."
const PROBE_TEXT_ES = "Hola, soy la voz de Tiancode en español."
const voiceProbeKey = (voiceID: string) => `voice:${voiceID}`

type VoiceFilter = "all" | "spanish" | "english"

const FILTERS: { id: VoiceFilter; label: string }[] = [
  { id: "all", label: "Todas (Femeninas ES / EN)" },
  { id: "spanish", label: "🇪🇸 Español Neural" },
  { id: "english", label: "🇺🇸 Inglés Neural" },
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

// A voice can be selected when it is supported and enabled.
const canSelect = (voice: VoiceInfo) => voice.engine === ("fish" as any) || (voice.supported && voice.enabled !== false)

export const SettingsVoicesV2: Component<{ active?: boolean }> = (props) => {
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

  const [audioDevices, setAudioDevices] = createSignal<MediaDeviceInfo[]>([])
  const [selectedMicId, setSelectedMicId] = createSignal<string | null>(getSelectedAudioDeviceId())
  const [dictWords, setDictWords] = createSignal<string[]>(getDictationDictionary())
  const [newDictWord, setNewDictWord] = createSignal("")
  const [isAddingWord, setIsAddingWord] = createSignal(false)
  const [recentRecordings, setRecentRecordings] = createSignal<DictationRecording[]>(getRecentRecordings())
  const [showRecentRecordings, setShowRecentRecordings] = createSignal(false)

  const refreshAudioDevices = async () => {
    try {
      const list = await getAudioInputDevices()
      setAudioDevices(list)
    } catch {
      setAudioDevices([])
    }
  }

  const micOptions = createMemo<{ id: string; label: string }[]>(() => {
    const defaultLabel = language.t("chat.mic.defaultDevice") ?? "Predeterminado del sistema"
    const list = [{ id: "default", label: defaultLabel }]
    audioDevices().forEach((dev, index) => {
      list.push({
        id: dev.deviceId,
        label: dev.label || `Micrófono ${index + 1}`,
      })
    })
    return list
  })

  const currentMic = createMemo(() => {
    const id = selectedMicId() ?? "default"
    return micOptions().find((opt) => opt.id === id) ?? micOptions()[0]
  })

  const handleSelectMic = (id: string) => {
    const finalId = id === "default" ? null : id
    setSelectedAudioDeviceId(finalId)
    setSelectedMicId(finalId)
    showToast({
      title: language.t("chat.mic.selectDevice") ?? "Micrófono seleccionado",
      description: finalId
        ? audioDevices().find((d) => d.deviceId === finalId)?.label || "Micrófono"
        : (language.t("chat.mic.defaultDevice") ?? "Predeterminado del sistema"),
    })
  }

  const handleAddWord = () => {
    const val = newDictWord().trim()
    if (!val) return
    addDictationDictionaryEntry(val)
    setDictWords(getDictationDictionary())
    setNewDictWord("")
    setIsAddingWord(false)
    showToast({
      title: "Entrada añadida",
      description: `"${val}" se priorizará en el dictado de voz.`,
    })
  }

  const handleRemoveWord = (word: string) => {
    removeDictationDictionaryEntry(word)
    setDictWords(getDictationDictionary())
  }

  let unsubscribe: (() => void) | undefined
  let piperUnsubscribe: (() => void) | undefined
  let devCleanup: (() => void) | undefined
  let onMicChange: ((event: Event) => void) | undefined
  let onRecsChange: ((event: Event) => void) | undefined

  onMount(() => {
    void refreshAudioDevices()
    devCleanup = onAudioDeviceChange(() => {
      void refreshAudioDevices()
    })
    onMicChange = (event: Event) => {
      const custom = event as CustomEvent<{ deviceId: string | null }>
      setSelectedMicId(custom.detail?.deviceId ?? getSelectedAudioDeviceId())
    }
    window.addEventListener("tiancode:microphone-changed", onMicChange)
    onRecsChange = (event: Event) => {
      const custom = event as CustomEvent<{ recordings: DictationRecording[] }>
      setRecentRecordings(custom.detail?.recordings ?? getRecentRecordings())
    }
    window.addEventListener("tiancode:recent-recordings-changed", onRecsChange)

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
    devCleanup?.()
    devCleanup = undefined
    if (onMicChange) {
      window.removeEventListener("tiancode:microphone-changed", onMicChange)
      onMicChange = undefined
    }
    if (onRecsChange) {
      window.removeEventListener("tiancode:recent-recordings-changed", onRecsChange)
      onRecsChange = undefined
    }
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

  const PROMINENT_FEMALE_PATTERNS = [
    // Spanish
    "dora", "daniela", "sharvard", "sofia",
    // English
    "heart", "bella", "nova", "alloy", "sarah", "sky", "isabella", "emma"
  ]

  const fishVoicesList = createMemo<VoiceInfo[]>(() => {
    return CURATED_FISH_VOICES.map((fv) => ({
      id: fv.id,
      name: fv.name,
      language: "es-ES",
      gender: "female",
      supported: true,
      engine: "fish" as any,
      downloaded: true,
      enabled: true,
      default: fv.id === DEFAULT_FISH_VOICE,
      license: "Fish Audio S2.1 Pro",
      description: fv.desc,
    }))
  })

  // Exclusively prominent female voices (Fish Audio S2.1 + prominent local Spanish & English)
  const sortedVoices = createMemo<VoiceInfo[]>(() => {
    const rawVoices = status()?.voices ?? []
    const prominentDesktop = rawVoices.filter((voice) => {
      if (voice.gender !== "female") return false
      const lower = `${voice.id} ${voice.name}`.toLowerCase()
      return PROMINENT_FEMALE_PATTERNS.some((pattern) => lower.includes(pattern))
    })

    return [...fishVoicesList(), ...prominentDesktop]
  })

  const filteredVoices = createMemo(() => {
    const current = filter()
    return sortedVoices().filter((voice) => {
      if (current === "all") return true
      if (current === "spanish") return voice.language.toLowerCase().startsWith("es")
      if (current === "english") return voice.language.toLowerCase().startsWith("en")
      return true
    })
  })

  const pages = createMemo(() => Math.max(1, Math.ceil(filteredVoices().length / PAGE_SIZE)))
  const currentPage = createMemo(() => Math.min(page(), pages() - 1))
  const pageVoices = createMemo(() =>
    filteredVoices().slice(currentPage() * PAGE_SIZE, (currentPage() + 1) * PAGE_SIZE),
  )

  const selected = () => {
    if (getVoiceEngineMode() === "fish") {
      return getFishAudioVoice()
    }
    return status()?.selected
  }
  const selectedVoice = createMemo(() => sortedVoices().find((voice) => voice.id === selected()))

  const selectVoice = async (voice: VoiceInfo) => {
    if (voice.engine === ("fish" as any)) {
      setFishAudioVoice(voice.id)
      setVoiceEngineMode("fish")
      settings.general.setVoiceEngine("fish")
      showToast({ variant: "success", title: "Voz seleccionada", description: `${voice.name} (Fish Audio S2.1 Pro)` })
      return
    }

    const current = api
    if (!current || !canSelect(voice) || selected() === voice.id) return
    try {
      setVoiceEngineMode(voice.engine === "kokoro" ? "neural" : "auto")
      settings.general.setVoiceEngine(voice.engine === "kokoro" ? "neural" : "auto")
      await current.select(voice.id)
      if ((voice.engine === "piper" || voice.engine === "kokoro-es") && voice.downloaded !== true) {
        void downloadVoice(voice)
      }
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
    if (voice.engine === ("fish" as any) || CURATED_FISH_VOICES.some((v) => v.id === voice.id)) {
      const probeKey = voiceProbeKey(voice.id)
      if (isVoiceSpeaking(probeKey)) {
        stopSpeaking()
        return
      }
      showToast({
        title: `Probando ${voice.name}`,
        description: "Generando voz fluida con Fish Audio S2.1 Pro...",
      })
      const err = await speakWithFishAudio(
        probeKey,
        "¡Hola! Soy la voz hiper-realista femenina de Tiancode impulsada por Fish Audio S 2.1 Pro. ¿Qué programamos hoy?",
        voice.id,
      )
      if (err) {
        showToast({ variant: "error", title: "Error en Fish Audio", description: err })
      }
      return
    }

    const isEs = voice.language.toLowerCase().startsWith("es")
    const text = isEs ? PROBE_TEXT_ES : PROBE_TEXT_EN

    // 1. Try local engine synthesis
    const error = await speakWithVoices(voiceProbeKey(voice.id), text, voice.id)
    if (error) {
      // 2. Immediate audio preview sample or Web Speech API fallback for testing before install
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel()
        const utterance = new SpeechSynthesisUtterance(text)
        utterance.lang = voice.language
        const availableVoices = window.speechSynthesis.getVoices()
        const match = availableVoices.find(
          (v) =>
            v.lang.toLowerCase().startsWith(voice.language.slice(0, 2).toLowerCase()) &&
            (voice.gender === "female" ? /female|mujer|monica|helena|sabina|lucia|zira/i.test(v.name) : true),
        )
        if (match) utterance.voice = match
        window.speechSynthesis.speak(utterance)
        showToast({
          variant: "default",
          title: `Probando voz: ${voice.name}`,
          description: "Reproduciendo muestra de voz previa.",
        })
        return
      }
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

          <Show when={getVoiceEngineMode() === "neural" && !status.loading && status() && !status()!.ready}>
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

          {/* ================================================================= */}
          {/* 1. SECCIÓN GENERAL (Micrófono y Prueba de audio)                  */}
          {/* ================================================================= */}
          <div class="settings-v2-section">
            <h3 class="settings-v2-section-title">{language.t("settings.voices.section.general") ?? "General"}</h3>
            <SettingsListV2>
              <SettingsRowV2
                title={language.t("settings.voices.mic.title") ?? "Micrófono"}
                description={language.t("settings.voices.mic.description") ?? "Se usa para chat de voz y dictado"}
              >
                <div class="flex items-center gap-2">
                  <SelectV2
                    appearance="inline"
                    options={micOptions()}
                    current={currentMic()}
                    value={(item) => item.id}
                    label={(item) => item.label}
                    placement="bottom-end"
                    gutter={6}
                    onSelect={(option) => option && handleSelectMic(option.id)}
                  />
                  <IconButtonV2
                    size="small"
                    variant="ghost-muted"
                    aria-label="Actualizar micrófonos"
                    title="Buscar nuevos dispositivos de audio"
                    icon={
                      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
                        <path d="M13.5 8A5.5 5.5 0 1 1 11.6 4.1L13.5 6M13.5 2v4h-4" />
                      </svg>
                    }
                    onClick={() => void refreshAudioDevices()}
                  />
                </div>
              </SettingsRowV2>
            </SettingsListV2>

            {/* Comprobación de funcionamiento del micrófono en tiempo real */}
            <MicTester selectedDeviceId={selectedMicId()} />
          </div>

          {/* ================================================================= */}
          {/* 2. SECCIÓN DICTADO (Atajos, Diccionario, Grabaciones)             */}
          {/* ================================================================= */}
          <div class="settings-v2-section">
            <h3 class="settings-v2-section-title">{language.t("settings.voices.section.dictation") ?? "Dictado"}</h3>
            <SettingsListV2>
              <SettingsRowV2
                title={language.t("settings.voices.dictation.hold.title") ?? "Atajo para dictado al mantener presionado"}
                description={
                  language.t("settings.voices.dictation.hold.description") ??
                  "Mantén presionado en cualquier parte del escritorio para dictar donde esté el cursor"
                }
              >
                <div class="flex items-center gap-2">
                  <span class="settings-v2-shortcut-badge">
                    {getHoldDictationShortcut()}
                  </span>
                  <IconButtonV2
                    size="small"
                    variant="ghost-muted"
                    aria-label="Configurar atajo"
                    icon={
                      <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3">
                        <path d="M11.5 2.5l2 2L5 13H3v-2L11.5 2.5z" />
                      </svg>
                    }
                    onClick={() => {
                      showToast({
                        title: "Atajo para mantener presionado",
                        description: "Próximamente personalizable con cualquier combinación de teclas global.",
                      })
                    }}
                  />
                </div>
              </SettingsRowV2>

              <SettingsRowV2
                title={language.t("settings.voices.dictation.toggle.title") ?? "Alternar tecla rápida de dictado"}
                description={
                  language.t("settings.voices.dictation.toggle.description") ??
                  "Presiona una vez en cualquier parte del escritorio para dictar y vuelve a presionar para detener"
                }
              >
                <div class="flex items-center gap-2">
                  <span class="settings-v2-shortcut-badge text-sky-400 border-sky-500/30 bg-sky-500/10">
                    {getToggleDictationShortcut()}
                  </span>
                  <IconButtonV2
                    size="small"
                    variant="ghost-muted"
                    aria-label="Editar tecla rápida"
                    icon={
                      <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3">
                        <path d="M11.5 2.5l2 2L5 13H3v-2L11.5 2.5z" />
                      </svg>
                    }
                    onClick={() => {
                      showToast({
                        title: "Tecla rápida de dictado activa",
                        description: "Usa Ctrl+Shift+M en cualquier ventana para activar o pausar el micrófono de inmediato.",
                      })
                    }}
                  />
                </div>
              </SettingsRowV2>

              <SettingsRowV2
                title={language.t("settings.voices.dictation.dictionary.title") ?? "Diccionario de dictado"}
                description={
                  language.t("settings.voices.dictation.dictionary.description") ??
                  "Palabras o frases que el dictado debe reconocer"
                }
              >
                <ButtonV2
                  type="button"
                  variant="outline"
                  size="small"
                  onClick={() => setIsAddingWord(true)}
                >
                  <span class="flex items-center gap-1.5">
                    <span>+</span>
                    <span>Agregar entrada</span>
                  </span>
                </ButtonV2>
              </SettingsRowV2>

              {/* Formulario para añadir nueva palabra */}
              <Show when={isAddingWord()}>
                <div class="settings-v2-dictation-add-row p-2.5 rounded-lg bg-white/5 border border-white/10 flex items-center gap-2">
                  <input
                    type="text"
                    placeholder="Palabra o frase (ej. Jane Doe, TypeScript)..."
                    value={newDictWord()}
                    onInput={(e) => setNewDictWord(e.currentTarget.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleAddWord()
                      if (e.key === "Escape") setIsAddingWord(false)
                    }}
                    class="flex-1 h-8 rounded-md border border-neutral-700 bg-black/60 px-3 text-12-regular text-text-base outline-none focus:border-cyan-400"
                    autofocus
                  />
                  <ButtonV2 type="button" variant="contrast" size="small" onClick={handleAddWord}>
                    Guardar
                  </ButtonV2>
                  <ButtonV2 type="button" variant="ghost" size="small" onClick={() => setIsAddingWord(false)}>
                    Cancelar
                  </ButtonV2>
                </div>
              </Show>

              {/* Lista de palabras en el diccionario */}
              <Show when={dictWords().length > 0}>
                <div class="settings-v2-dictation-dict-list">
                  <For each={dictWords()}>
                    {(word) => (
                      <div class="settings-v2-dictation-dict-item">
                        <span class="font-medium text-text-base">{word}</span>
                        <IconButtonV2
                          size="small"
                          variant="ghost-muted"
                          aria-label="Eliminar entrada"
                          icon={
                            <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3">
                              <path d="M3 4h10M6 4V2.5h4V4M4.5 4l.8 9.5a1.5 1.5 0 0 0 1.5 1.4h2.4a1.5 1.5 0 0 0 1.5-1.4l.8-9.5" />
                            </svg>
                          }
                          onClick={() => handleRemoveWord(word)}
                        />
                      </div>
                    )}
                  </For>
                </div>
              </Show>

              <SettingsRowV2
                title={language.t("settings.voices.dictation.recordings.title") ?? "Grabaciones recientes"}
                description={
                  language.t("settings.voices.dictation.recordings.description") ??
                  "Tus últimas 20 grabaciones se guardan en este dispositivo"
                }
              >
                <div class="flex items-center gap-2">
                  <span class="text-[12px] text-text-weaker font-mono">
                    {recentRecordings().length} guardada{recentRecordings().length === 1 ? "" : "s"}
                  </span>
                  <ButtonV2
                    type="button"
                    variant="ghost"
                    size="small"
                    onClick={() => setShowRecentRecordings(!showRecentRecordings())}
                  >
                    {showRecentRecordings() ? "Ocultar" : "Ver grabaciones"}
                  </ButtonV2>
                  <Show when={recentRecordings().length > 0}>
                    <ButtonV2
                      type="button"
                      variant="ghost"
                      size="small"
                      onClick={() => {
                        clearRecentRecordings()
                        setRecentRecordings([])
                        showToast({ title: "Historial borrado", description: "Se han eliminado las grabaciones recientes." })
                      }}
                    >
                      Limpiar
                    </ButtonV2>
                  </Show>
                </div>
              </SettingsRowV2>

              {/* Historial desplegable de grabaciones recientes */}
              <Show when={showRecentRecordings()}>
                <div class="settings-v2-dictation-recordings-list">
                  <Show
                    when={recentRecordings().length > 0}
                    fallback={
                      <div class="p-3 text-[12px] text-text-weaker italic text-center">
                        No hay grabaciones recientes aún. Las transcripciones que hagas en el chat aparecerán aquí.
                      </div>
                    }
                  >
                    <For each={recentRecordings()}>
                      {(rec) => (
                        <div class="settings-v2-dictation-recording-item">
                          <span class="settings-v2-dictation-recording-text" title={rec.text}>
                            "{rec.text}"
                          </span>
                          <span class="settings-v2-dictation-recording-meta">
                            {rec.durationSeconds ? `${rec.durationSeconds}s • ` : ""}
                            {new Date(rec.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                          </span>
                        </div>
                      )}
                    </For>
                  </Show>
                </div>
              </Show>
            </SettingsListV2>
          </div>

          <div class="settings-v2-section">
            <h3 class="settings-v2-section-title">{language.t("settings.voices.section.speech") ?? "Síntesis y Reproducción de Voz"}</h3>
          </div>

          {/* Tarjeta de Control Maestro de Voz */}
          <div class="settings-v2-voices-master-card" data-active={settings.general.autoSpeak()}>
            <div class="settings-v2-voices-master-info">
              <div class="settings-v2-voices-master-icon">
                <Show
                  when={settings.general.autoSpeak()}
                  fallback={
                    <svg width="22" height="22" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3">
                      <path d="M7.33 3.33L4 6H1.33v4H4l3.33 2.67V3.33z" stroke-linecap="square" />
                      <path d="M10.5 6l3.5 4M14 6l-3.5 4" stroke-linecap="square" />
                    </svg>
                  }
                >
                  <svg width="22" height="22" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3">
                    <path d="M7.33 3.33L4 6H1.33v4H4l3.33 2.67V3.33z" stroke-linecap="square" />
                    <path d="M10 5.33c1.33 1.34 1.33 4 0 5.34M12.5 3.33c2 2 2 7.34 0 9.34" stroke-linecap="round" />
                  </svg>
                </Show>
              </div>
              <div class="settings-v2-voices-master-text">
                <div class="settings-v2-voices-master-title">
                  {settings.general.autoSpeak() ? "Voz Automática Activada" : "Voz Automática Desactivada (Silenciada)"}
                </div>
                <div class="settings-v2-voices-master-desc">
                  {settings.general.autoSpeak()
                    ? "La IA hablará en voz alta cuando termine de responder. Si notas lentitud en tu equipo, puedes desactivarla aquí o en la barra superior."
                    : "Modo silencioso ultra rápido (0% de uso de CPU). La IA responderá de inmediato sin procesar audio."}
                </div>
              </div>
            </div>
            <Switch
              checked={settings.general.autoSpeak()}
              onChange={(value) => {
                settings.general.setAutoSpeak(value)
                if (!value) {
                  stopSpeaking()
                  stopAutoSpeak()
                }
              }}
            />
          </div>

          <Show when={settings.general.autoSpeak()}>
            <div class="settings-v2-voices-waveform-card">
              <div class="flex items-center justify-between">
                <div class="flex items-center gap-2 text-[12px] font-medium text-text-weak">
                  <span class={`size-2 rounded-full ${isVoiceSpeaking() ? "bg-emerald-400 animate-pulse shadow-[0_0_8px_#34d399]" : "bg-text-weaker"}`} />
                  <span>{isVoiceSpeaking() ? "Reproduciendo audio en tiempo real" : "Canal de voz listo (ondas reactivas)"}</span>
                </div>
                <Show when={selectedVoice()}>
                  <span class="text-[11px] text-emerald-400 font-semibold">{selectedVoice()!.name}</span>
                </Show>
              </div>
              <AudioWaveform active={(props.active ?? true) && isVoiceSpeaking()} height={26} barsCount={36} />
            </div>
          </Show>

          <Show when={selectedVoice()}>
            <div class="settings-v2-voices-selected">
              <Icon name="circle-check" size="small" />
              <span class="settings-v2-voices-selected-label">{language.t("settings.voices.select.title")}</span>
              <span class="settings-v2-voices-selected-name">{selectedVoice()!.name}</span>
            </div>
          </Show>

          <SettingsListV2>
            <SettingsRowV2
              title="Motor de Síntesis de Voz"
              description="Elige entre Fish Audio S2.1 Pro para voces humanas ultra-fluidas (0% CPU local), voz nativa de Windows (Microsoft Sabina) o el modelo neuronal local."
            >
              <div class="flex items-center flex-wrap gap-1.5">
                <ButtonV2
                  type="button"
                  variant={getVoiceEngineMode() === "fish" ? "contrast" : "ghost"}
                  size="small"
                  onClick={() => {
                    setVoiceEngineMode("fish")
                    settings.general.setVoiceEngine("fish")
                  }}
                >
                  🐟 Fish Audio S2.1 Pro (Ultra-Fluida / Free)
                </ButtonV2>
                <ButtonV2
                  type="button"
                  variant={getVoiceEngineMode() === "system" ? "contrast" : "ghost"}
                  size="small"
                  onClick={() => {
                    setVoiceEngineMode("system")
                    settings.general.setVoiceEngine("system")
                  }}
                >
                  ⚡ Voz Nativa Windows (0% CPU)
                </ButtonV2>
                <ButtonV2
                  type="button"
                  variant={getVoiceEngineMode() === "auto" ? "contrast" : "ghost"}
                  size="small"
                  onClick={() => {
                    setVoiceEngineMode("auto")
                    settings.general.setVoiceEngine("auto")
                  }}
                >
                  🔄 Automático
                </ButtonV2>
                <ButtonV2
                  type="button"
                  variant={getVoiceEngineMode() === "neural" ? "contrast" : "ghost"}
                  size="small"
                  onClick={() => {
                    setVoiceEngineMode("neural")
                    settings.general.setVoiceEngine("neural")
                  }}
                >
                  🧠 Neural Kokoro
                </ButtonV2>
              </div>
            </SettingsRowV2>

            <SettingsRowV2
              title={language.t("settings.voices.autoSpeak.title")}
              description={language.t("settings.voices.autoSpeak.description")}
            >
              <Switch
                checked={settings.general.autoSpeak()}
                onChange={(value) => {
                  settings.general.setAutoSpeak(value)
                  if (!value) {
                    stopSpeaking()
                    stopAutoSpeak()
                  }
                }}
              />
            </SettingsRowV2>

            <SettingsRowV2
              title={language.t("settings.voices.speakReasoning.title") ?? "Leer pensamientos y plan en vivo"}
              description={language.t("settings.voices.speakReasoning.description") ?? "Narra con la voz predeterminada femenina el razonamiento y pasos que la IA planifica hacer antes de ejecutarlos."}
            >
              <Switch
                checked={settings.general.speakReasoning()}
                onChange={(value) => settings.general.setSpeakReasoning(value)}
              />
            </SettingsRowV2>

            <SettingsRowV2
              title="Velocidad de Reproducción (Rate)"
              description="Ajusta la velocidad de narración para una reproducción más rápida o pausada."
            >
              <div class="flex items-center gap-1">
                <For each={[0.75, 1.0, 1.25, 1.5, 2.0]}>
                  {(rate) => (
                    <ButtonV2
                      type="button"
                      variant={getVoiceSpeed() === rate ? "contrast" : "ghost"}
                      size="small"
                      onClick={() => setVoiceSpeed(rate)}
                    >
                      {rate}x
                    </ButtonV2>
                  )}
                </For>
              </div>
            </SettingsRowV2>

            <SettingsRowV2
              title="Tono de Voz (Pitch Studio)"
              description="Modula la frecuencia fundamental para una voz más grave, natural o aguda."
            >
              <div class="flex items-center gap-1">
                <For each={[
                  { val: 0.85, label: "Grave (0.85x)" },
                  { val: 1.0, label: "Natural (1.0x)" },
                  { val: 1.15, label: "Agudo (1.15x)" },
                ]}>
                  {(item) => (
                    <ButtonV2
                      type="button"
                      variant={getVoicePitch() === item.val ? "contrast" : "ghost"}
                      size="small"
                      onClick={() => setVoicePitch(item.val)}
                    >
                      {item.label}
                    </ButtonV2>
                  )}
                </For>
              </div>
            </SettingsRowV2>

            <SettingsRowV2
              title="Volumen de Síntesis (Gain)"
              description="Nivel de ganancia sonora y amplificación de las respuestas narradas."
            >
              <div class="flex items-center gap-1">
                <For each={[
                  { val: 0.5, label: "50%" },
                  { val: 0.75, label: "75%" },
                  { val: 1.0, label: "100%" },
                  { val: 1.2, label: "120%" },
                ]}>
                  {(item) => (
                    <ButtonV2
                      type="button"
                      variant={getVoiceVolume() === item.val ? "contrast" : "ghost"}
                      size="small"
                      onClick={() => setVoiceVolume(item.val)}
                    >
                      {item.label}
                    </ButtonV2>
                  )}
                </For>
              </div>
            </SettingsRowV2>

            <SettingsRowV2
              title="Interrupción por Voz (Barge-In / Dúplex)"
              description="Corta automáticamente la voz de la IA cuando comienzas a hablar por el micrófono."
            >
              <Switch
                checked={getBargeInEnabled()}
                onChange={(val) => {
                  setBargeInEnabled(val)
                  if (val) void enableBargeInListener()
                }}
              />
            </SettingsRowV2>

            <SettingsRowV2
              title="Clave de API Fish Audio (S2.1 Pro)"
              description="Clave para voces ultra-fluidas en la nube (0% CPU local). Incluye clave gratuita predeterminada lista para usar."
            >
              <div class="flex items-center gap-2 w-full max-w-[340px] min-w-0">
                <input
                  type="password"
                  value={getFishAudioKey()}
                  onInput={(e) => setFishAudioKey(e.currentTarget.value)}
                  placeholder="sk-fish-..."
                  class="flex-1 min-w-0 h-8 rounded-md border border-neutral-700 bg-black/60 px-2.5 text-12-regular font-mono text-text-base outline-none focus:border-cyan-400"
                />
                <ButtonV2
                  type="button"
                  variant="ghost"
                  size="small"
                  class="shrink-0"
                  onClick={() => {
                    setFishAudioKey(DEFAULT_FISH_KEY)
                    showToast({ title: "Clave restablecida", description: "Se ha cargado la clave gratuita de Fish Audio." })
                  }}
                >
                  Restablecer
                </ButtonV2>
              </div>
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
                      {item.label}
                    </ButtonV2>
                  )}
                </For>
              </div>

              <Show
                when={filteredVoices().length > 0 || status.loading}
                fallback={<div class="settings-v2-skills-status">{language.t("settings.voices.voices.empty")}</div>}
              >
                <div class="settings-v2-voices-grid">
                  <Show
                    when={filteredVoices().length > 0}
                    fallback={
                      <For each={[1, 2, 3, 4, 5, 6, 7, 8]}>
                        {() => (
                          <div class="settings-v2-voices-card opacity-40 pointer-events-none">
                            <div class="settings-v2-voices-card-header">
                              <div class="settings-v2-voices-card-lead">
                                <span class="settings-v2-voices-card-radio" />
                                <span class="settings-v2-voices-card-name">Cargando catálogo...</span>
                              </div>
                            </div>
                          </div>
                        )}
                      </For>
                    }
                  >
                    <For each={pageVoices()}>
                      {(voice) => {
                        const selectable = canSelect(voice)
                        const downloadProgress = piperProgress()[voice.id]
                        const isSelected = () => selected() === voice.id

                        return (
                          <div
                            role="button"
                            tabIndex={selectable ? 0 : -1}
                            aria-disabled={!selectable || undefined}
                            class="settings-v2-voices-card"
                            data-selected={isSelected() || undefined}
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
                            {/* 1. Cabecera: Radio + Nombre + Help + Switch */}
                            <div class="settings-v2-voices-card-header">
                              <div class="settings-v2-voices-card-lead">
                                <span
                                  class="settings-v2-voices-card-radio"
                                  data-checked={isSelected() || undefined}
                                >
                                  <Show when={isSelected()}>
                                    <Icon name="check-small" size="small" />
                                  </Show>
                                </span>
                                <span class="settings-v2-voices-card-name" title={voice.name}>
                                  {voice.name}
                                </span>
                              </div>

                              <div class="settings-v2-voices-card-actions-top">
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
                                <div class="settings-v2-voices-card-toggle" onClick={(e: MouseEvent) => e.stopPropagation()}>
                                  <Switch
                                    checked={voice.enabled !== false}
                                    onChange={(enabled) => void toggleEnabled(voice, enabled)}
                                    hideLabel
                                  >
                                    {language.t("settings.voices.voice.enabled")}
                                  </Switch>
                                </div>
                              </div>
                            </div>

                            {/* 2. Cuerpo: Meta y Descripción detallada + Chips */}
                            <div class="settings-v2-voices-card-body">
                              <p class="settings-v2-voices-card-desc">
                                {(voice as any).description ||
                                  (voice.language.toLowerCase().startsWith("es")
                                    ? "Voz femenina neural en español con pronunciación y entonación limpia."
                                    : "Natural English female neural voice with expressive clear prosody.")}
                              </p>

                              <div class="settings-v2-voices-card-chips">
                                <Show
                                  when={voice.engine === ("fish" as any)}
                                  fallback={
                                    <span class="settings-v2-voices-chip" data-variant="engine">
                                      {voice.engine === "kokoro-es"
                                        ? "Kokoro ES"
                                        : voice.engine === "piper"
                                          ? "Piper"
                                          : "Kokoro"}
                                    </span>
                                  }
                                >
                                  <span class="settings-v2-voices-chip" data-variant="fish">
                                    🐟 Fish Audio S2.1
                                  </span>
                                </Show>

                                <span class="settings-v2-voices-chip" data-variant="female">
                                  ♀ Femenina
                                </span>

                                <span class="settings-v2-voices-chip" data-variant="lang">
                                  {voice.language.toLowerCase().startsWith("es") ? "🇪🇸 ES" : "🇺🇸 EN"}
                                </span>

                                <Show when={voice.sizeMb}>
                                  <span class="settings-v2-voices-chip">{voice.sizeMb} MB</span>
                                </Show>
                                <Show when={voice.engine === ("fish" as any)}>
                                  <span class="settings-v2-voices-chip text-cyan-400">0% CPU</span>
                                </Show>
                              </div>
                            </div>

                            {/* Detalle informativo compacto si se activa info */}
                            <Show when={infoVoice() === voice.id}>
                              <div
                                class="settings-v2-voices-card-info"
                                onClick={(e: MouseEvent) => e.stopPropagation()}
                              >
                                <div class="flex items-center justify-between text-[11px] font-semibold text-text-base border-b border-white/10 pb-1 mb-1">
                                  <span>{voice.name}</span>
                                  <button
                                    type="button"
                                    class="text-text-weaker hover:text-text-base text-[11px] p-0.5 leading-none cursor-pointer"
                                    onClick={() => setInfoVoice(undefined)}
                                  >
                                    ✕
                                  </button>
                                </div>
                                <div class="settings-v2-voices-info-grid">
                                  <span class="settings-v2-voices-info-caption">Motor</span>
                                  <span class="settings-v2-voices-info-value">{voice.engine === ("fish" as any) ? "Fish Audio S2.1 Pro" : voice.engine}</span>
                                  <span class="settings-v2-voices-info-caption">Licencia</span>
                                  <span class="settings-v2-voices-info-value">{voice.license ?? "Open"}</span>
                                </div>
                              </div>
                            </Show>

                            {/* 3. Pie: Estado / Descarga / Eliminar + Botón Probar */}
                            <div class="settings-v2-voices-card-footer">
                              <div class="settings-v2-voices-card-status">
                                <Show
                                  when={voice.engine === "piper" || voice.engine === "kokoro-es"}
                                  fallback={
                                    <span class={`text-[11px] font-medium ${isSelected() ? "text-emerald-400 font-semibold" : "text-text-weaker"}`}>
                                      {isSelected() ? "✓ Activa" : "Disponible"}
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
                                        <span class={`text-[11px] font-medium ${isSelected() ? "text-emerald-400 font-semibold" : "text-text-weaker"}`}>
                                          {isSelected() ? "✓ Activa" : "Instalada"}
                                        </span>
                                      </Show>
                                    }
                                  >
                                    <div class="settings-v2-voices-card-progress">
                                      <div class="settings-v2-voices-progress-track">
                                        <div
                                          class="settings-v2-voices-progress-fill"
                                          style={{ width: `${Math.max(0, Math.min(100, downloadProgress))}%` }}
                                        />
                                      </div>
                                      <span class="settings-v2-voices-card-progress-label">
                                        {Math.max(0, Math.min(100, downloadProgress))}%
                                      </span>
                                    </div>
                                  </Show>
                                </Show>
                              </div>

                              <ButtonV2
                                type="button"
                                variant={isVoiceSpeaking(voiceProbeKey(voice.id)) ? "contrast" : "outline"}
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
                          </div>
                        )
                      }}
                    </For>
                  </Show>
                </div>
                <Show when={pages() > 1}>
                  <div class="mt-3">
                    <SettingsPagerV2
                      page={currentPage() + 1}
                      totalPages={pages()}
                      onPage={(p) => setPage(p - 1)}
                    />
                  </div>
                </Show>
              </Show>
            </div>
          </Show>
        </div>
      </>
    )
  }
