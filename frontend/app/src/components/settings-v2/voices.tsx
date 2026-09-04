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
import "./voices.css"

const PAGE_SIZE = 8
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
const canSelect = (voice: VoiceInfo) => voice.supported && voice.enabled !== false

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

  const selected = () => status()?.selected
  const selectedVoice = createMemo(() => sortedVoices().find((voice) => voice.id === selected()))

  const selectVoice = async (voice: VoiceInfo) => {
    const current = api
    if (!current || !canSelect(voice) || selected() === voice.id) return
    try {
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
              title="Monitor de Espectro de Audio"
              description="Visualizador de onda sonora reactivo durante la síntesis y dictado por micrófono."
            >
              <div class="w-48">
                <AudioWaveform active={(props.active ?? true) && (currentSpeakingKey() !== undefined || isVoiceSpeaking())} height={26} barsCount={24} />
              </div>
            </SettingsRowV2>
          </SettingsListV2>

          {/* Tarjeta de Configuración de Fish Audio S2.1 Pro */}
          <Show when={getVoiceEngineMode() === "fish" || getVoiceEngineMode() === "auto"}>
            <div class="settings-v2-section mt-4 rounded-xl border border-cyan-500/30 bg-gradient-to-b from-cyan-950/25 to-neutral-900/60 p-4 shadow-sm">
              <div class="flex items-center justify-between pb-3 border-b border-cyan-500/20">
                <div class="flex items-center gap-2.5">
                  <span class="text-2xl">🐟</span>
                  <div>
                    <div class="flex items-center gap-2">
                      <span class="text-13-medium text-text-base">Fish Audio S2.1 Pro (Free API)</span>
                      <span class="rounded-full bg-emerald-500/15 border border-emerald-500/30 px-2 py-0.5 text-[10px] font-semibold text-emerald-400">
                        Ultra-Fluida / 0% CPU Local
                      </span>
                    </div>
                    <p class="text-11-regular text-text-weak">
                      Voces hiper-realistas femeninas en español con entonación natural, pausas de respiración y dicción perfecta.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 text-[11px] font-medium hover:bg-cyan-500/30 transition-all cursor-pointer shadow-sm"
                  onClick={async () => {
                    const probeKey = "probe:fish"
                    if (isVoiceSpeaking(probeKey)) {
                      stopSpeaking()
                      return
                    }
                    showToast({
                      title: "Probando Fish Audio",
                      description: "Generando voz fluida femenina en español...",
                    })
                    const err = await speakWithFishAudio(probeKey, "¡Hola! Soy la voz hiper-realista femenina de Tiancode impulsada por Fish Audio S 2.1 Pro. ¿Qué programamos hoy?")
                    if (err) {
                      showToast({ variant: "error", title: "Error en Fish Audio", description: err })
                    }
                  }}
                >
                  <span>{isVoiceSpeaking("probe:fish") ? "■ Detener Muestra" : "▶ Probar Voz"}</span>
                </button>
              </div>

              {/* Selector de Voz de Fish Audio */}
              <div class="mt-3.5">
                <div class="text-[11px] font-medium text-text-weak mb-2">Selecciona una Voz Femenina de Alta Fidelidad:</div>
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <For each={CURATED_FISH_VOICES}>
                    {(voice) => (
                      <div
                        role="button"
                        tabIndex={0}
                        onClick={() => setFishAudioVoice(voice.id)}
                        class={`flex flex-col p-2.5 rounded-lg border transition-all cursor-pointer text-left ${
                          getFishAudioVoice() === voice.id
                            ? "border-cyan-400 bg-cyan-500/15 shadow-[0_0_10px_rgba(56,189,248,0.2)]"
                            : "border-neutral-800 bg-neutral-900/50 hover:border-neutral-700 hover:bg-neutral-800/40"
                        }`}
                      >
                        <div class="flex items-center justify-between">
                          <span class="text-12-medium text-text-base flex items-center gap-1.5">
                            <span class={`size-2 rounded-full ${getFishAudioVoice() === voice.id ? "bg-cyan-400 shadow-[0_0_6px_#38bdf8]" : "bg-neutral-600"}`} />
                            {voice.name}
                          </span>
                          <span class="text-[10px] text-cyan-400 font-mono">
                            {voice.id === DEFAULT_FISH_VOICE ? "★ Recomendada" : ""}
                          </span>
                        </div>
                        <span class="text-[11px] text-text-weak mt-1 line-clamp-2">
                          {voice.desc}
                        </span>
                      </div>
                    )}
                  </For>
                </div>
              </div>

              {/* Clave de API */}
              <div class="mt-3.5 pt-3 border-t border-cyan-500/15 flex flex-col gap-1.5">
                <div class="flex items-center justify-between text-[11px] text-text-weak">
                  <span>Clave de API de Fish Audio (S2.1 Pro Free):</span>
                  <button
                    type="button"
                    class="text-cyan-400 hover:underline cursor-pointer text-[11px]"
                    onClick={() => {
                      setFishAudioKey(DEFAULT_FISH_KEY)
                      showToast({ title: "Clave restablecida", description: "Se ha cargado la clave gratuita de Fish Audio." })
                    }}
                  >
                    Restablecer clave predeterminada
                  </button>
                </div>
                <div class="flex items-center gap-2">
                  <input
                    type="password"
                    value={getFishAudioKey()}
                    onInput={(e) => setFishAudioKey(e.currentTarget.value)}
                    placeholder="sk-fish-..."
                    class="flex-1 h-7 rounded-md border border-neutral-700 bg-black/60 px-2 text-11-regular font-mono text-text-base outline-none focus:border-cyan-400"
                  />
                </div>
              </div>
            </div>
          </Show>

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
                <SettingsListV2>
                  <Show
                    when={filteredVoices().length > 0}
                    fallback={
                      <For each={[1, 2, 3, 4]}>
                        {() => (
                          <div class="settings-v2-voices-row opacity-40 pointer-events-none">
                            <span class="settings-v2-voices-row-radio" />
                            <div class="settings-v2-voices-row-copy">
                              <span class="settings-v2-voices-row-name">Cargando catálogo de voces...</span>
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
                                <Show when={voice.engine === "piper" || voice.engine === "kokoro-es"}>
                                  <span class="settings-v2-voices-chip" data-variant="engine">
                                    {language.t(
                                      voice.engine === "kokoro-es"
                                        ? "settings.voices.voice.engine.kokoroEs"
                                        : "settings.voices.voice.engine.piper",
                                    )}
                                  </span>
                                </Show>
                                <Show when={voice.default === true}>
                                  <span class="settings-v2-voices-chip" data-variant="default">
                                    {language.t("settings.voices.voice.default")}
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
                              when={voice.engine === "piper" || voice.engine === "kokoro-es"}
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
                                      : voice.engine === "kokoro-es"
                                        ? "settings.voices.voice.engine.kokoroEs"
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
                  </Show>
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
        </div>
      </>
    )
  }
