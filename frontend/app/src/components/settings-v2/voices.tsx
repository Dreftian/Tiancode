import { ButtonV2 } from "@tiancode-ai/ui/v2/button-v2"
import { SegmentedControlItemV2, SegmentedControlV2 } from "@tiancode-ai/ui/v2/segmented-control-v2"
import { SelectV2 } from "@tiancode-ai/ui/v2/select-v2"
import { Switch } from "@tiancode-ai/ui/v2/switch-v2"
import { TextInputV2 } from "@tiancode-ai/ui/v2/text-input-v2"
import { useDialog } from "@tiancode-ai/ui/context/dialog"
import { type Component, createMemo, createResource, For, onCleanup, onMount, Show } from "solid-js"
import { createStore, produce } from "solid-js/store"
import { useCommand } from "@/context/command"
import { useLanguage } from "@/context/language"
import { useSettings } from "@/context/settings"
import { stopAutoSpeak } from "@/utils/auto-speak"
import {
  addDictationDictionaryEntry,
  clearRecentRecordings,
  type DictationRecording,
  getAudioInputDevices,
  getDictationDictionary,
  getHoldToRecord,
  getRecentRecordings,
  getSelectedAudioDeviceId,
  onAudioDeviceChange,
  removeDictationDictionaryEntry,
  setHoldToRecord,
  setSelectedAudioDeviceId,
} from "@/utils/asr"
import { showToast } from "@/utils/toast"
import {
  CURATED_FISH_VOICES,
  getBargeInEnabled,
  getFishAudioKey,
  getFishAudioVoice,
  getVoiceEngineMode,
  getVoicePitch,
  getVoiceSpeed,
  getVoiceVolume,
  isVoiceSpeaking,
  setBargeInEnabled,
  setFishAudioKey,
  setFishAudioVoice,
  setVoiceEngineMode,
  setVoicePitch,
  setVoiceSpeed,
  setVoiceVolume,
  speakWithFishAudio,
  speakWithVoices,
  stopSpeaking,
  type VoiceEngineMode,
  type VoiceInfo,
  voicesAPI,
} from "@/utils/voices"
import { MicTester } from "./mic-tester"
import { SettingsConfirmDialog } from "./parts/confirm-dialog"
import { SettingsHubHeader } from "./parts/hub-header"
import { SettingsListV2 } from "./parts/list"
import { SettingsRowV2 } from "./parts/row"
import "./voices.css"

type VoicesSection = "microphone" | "speech" | "voices"

const SPEEDS = [0.75, 1, 1.25, 1.5, 2]
const VOLUMES = [0.5, 0.75, 1]
const PITCHES = [
  { value: 0.85, label: "settings.voices.pitch.low" },
  { value: 1, label: "settings.voices.pitch.natural" },
  { value: 1.15, label: "settings.voices.pitch.high" },
] as const
const ENGINES: VoiceEngineMode[] = ["auto", "system", "fish"]

const SAMPLE_KEY = "voice:sample"
const voiceKey = (id: string) => `voice:${id}`

const MicGlyph = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true">
    <rect x="5.5" y="1.75" width="5" height="8" rx="2.5" />
    <path d="M3 7.5a5 5 0 0 0 10 0M8 12.5v2" stroke-linecap="round" />
  </svg>
)

const SpeakerGlyph = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true">
    <path d="M7.33 3.33 4 6H1.75v4H4l3.33 2.67V3.33Z" stroke-linejoin="round" />
    <path d="M10 5.5c1.2 1.3 1.2 3.7 0 5M12.25 3.5c2.3 2.4 2.3 6.6 0 9" stroke-linecap="round" />
  </svg>
)

const WaveGlyph = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true">
    <path d="M2 8h1M4.5 5v6M7 2.5v11M9.5 5.5v5M12 4v8M14 7v2" stroke-linecap="round" />
  </svg>
)

export const SettingsVoicesV2: Component<{ active?: boolean }> = (props) => {
  const language = useLanguage()
  const settings = useSettings()
  const command = useCommand()
  const dialog = useDialog()
  const api = voicesAPI()

  const [ui, setUi] = createStore({
    section: "microphone" as VoicesSection,
    devices: [] as MediaDeviceInfo[],
    mic: getSelectedAudioDeviceId(),
    hold: getHoldToRecord(),
    words: getDictationDictionary(),
    word: "",
    adding: false,
    recordings: getRecentRecordings(),
    showRecordings: false,
    // Per-voice download progress; an entry vanishes when the file lands.
    progress: {} as Record<string, number>,
    deleting: "",
    revealKey: false,
  })

  const clearProgress = (id: string) =>
    setUi(
      "progress",
      produce((progress) => {
        delete progress[id]
      }),
    )

  const [status, { refetch }] = createResource(async () => (api ? await api.status().catch(() => undefined) : undefined))

  const refreshDevices = async () => setUi("devices", await getAudioInputDevices().catch(() => []))

  onMount(() => {
    void refreshDevices()
    const stopDevices = onAudioDeviceChange(() => void refreshDevices())
    const onMic = (event: Event) =>
      setUi("mic", (event as CustomEvent<{ deviceId: string | null }>).detail?.deviceId ?? getSelectedAudioDeviceId())
    const onRecordings = (event: Event) =>
      setUi(
        "recordings",
        (event as CustomEvent<{ recordings: DictationRecording[] }>).detail?.recordings ?? getRecentRecordings(),
      )
    const onHold = () => setUi("hold", getHoldToRecord())
    window.addEventListener("tiancode:microphone-changed", onMic)
    window.addEventListener("tiancode:recent-recordings-changed", onRecordings)
    window.addEventListener("tiancode:hold-to-record-changed", onHold)
    const stopProgress = api?.onPiperProgress((event) => {
      if (event.done) {
        clearProgress(event.voiceId)
        void refetch()
        return
      }
      setUi("progress", event.voiceId, event.progress)
    })
    onCleanup(() => {
      stopDevices()
      stopProgress?.()
      window.removeEventListener("tiancode:microphone-changed", onMic)
      window.removeEventListener("tiancode:recent-recordings-changed", onRecordings)
      window.removeEventListener("tiancode:hold-to-record-changed", onHold)
    })
  })

  // ------------------------------------------------------------------ microphone

  const micOptions = createMemo(() => [
    { id: "default", label: language.t("chat.mic.defaultDevice") },
    ...ui.devices.map((device, index) => ({
      id: device.deviceId,
      label: device.label || language.t("chat.mic.device.fallback", { index: index + 1 }),
    })),
  ])
  const currentMic = () => micOptions().find((option) => option.id === (ui.mic ?? "default")) ?? micOptions()[0]

  const selectMic = (id: string) => {
    const next = id === "default" ? null : id
    setSelectedAudioDeviceId(next)
    setUi("mic", next)
  }

  const addWord = () => {
    const word = ui.word.trim()
    if (!word) return
    addDictationDictionaryEntry(word)
    setUi({ words: getDictationDictionary(), word: "", adding: false })
  }

  const removeWord = (word: string) => {
    removeDictationDictionaryEntry(word)
    setUi("words", getDictationDictionary())
  }

  const copyRecording = (text: string) =>
    void navigator.clipboard
      .writeText(text)
      .then(() => showToast({ variant: "success", title: language.t("settings.voices.dictation.recordings.copied") }))
      .catch(() => undefined)

  // ------------------------------------------------------------------ speech

  const engineHint = (mode: VoiceEngineMode) => {
    if (mode === "system") return language.t("settings.voices.engine.system.description")
    if (mode === "fish") return language.t("settings.voices.engine.fish.description")
    return language.t("settings.voices.engine.auto.description")
  }

  const toggleAutoSpeak = (value: boolean) => {
    settings.general.setAutoSpeak(value)
    if (value) return
    stopSpeaking()
    stopAutoSpeak()
  }

  const playSample = async () => {
    if (isVoiceSpeaking(SAMPLE_KEY)) {
      stopSpeaking()
      return
    }
    const error = await speakWithVoices(SAMPLE_KEY, language.t("settings.voices.sample.text"))
    if (error) showToast({ variant: "error", title: language.t("settings.voices.voice.probe.failed"), description: error })
  }

  const probeFish = async () => {
    const key = "voice:fish-sample"
    if (isVoiceSpeaking(key)) {
      stopSpeaking()
      return
    }
    const error = await speakWithFishAudio(key, language.t("settings.voices.sample.text"))
    if (error) showToast({ variant: "error", title: language.t("settings.voices.fish.failed"), description: error })
  }

  // ------------------------------------------------------------------ local voices

  const voices = createMemo<VoiceInfo[]>(() =>
    [...(status()?.voices ?? [])].sort((a, b) => Number(b.downloaded === true) - Number(a.downloaded === true)),
  )
  const downloadedCount = () => voices().filter((voice) => voice.downloaded).length
  const chosen = () => status()?.selected
  const downloading = (voice: VoiceInfo) => ui.progress[voice.id] !== undefined

  const selectVoice = async (voice: VoiceInfo) => {
    if (!api || !voice.supported || chosen() === voice.id) return
    // Local voices speak in the automatic mode; picking one is choosing that mode.
    setVoiceEngineMode("auto")
    // Main starts the download of a voice that is not on disk and keeps the choice meanwhile.
    await api.select(voice.id).catch(() => false)
    void refetch()
  }

  const downloadVoice = async (voice: VoiceInfo) => {
    if (!api) return
    setUi("progress", voice.id, 0)
    await api
      .downloadVoice(voice.id)
      .then(() => showToast({ variant: "success", title: language.t("settings.voices.voice.download.success") }))
      .catch((error: unknown) =>
        showToast({
          variant: "error",
          title: language.t("settings.voices.voice.download.failed"),
          description: error instanceof Error ? error.message : undefined,
        }),
      )
    clearProgress(voice.id)
    void refetch()
  }

  const deleteVoice = (voice: VoiceInfo) =>
    void dialog.push(() => (
      <SettingsConfirmDialog
        title={language.t("settings.voices.voice.delete.confirm", { name: voice.name })}
        description={language.t("settings.voices.voice.delete.description")}
        confirm={language.t("settings.voices.voice.delete")}
        onClose={() => dialog.close()}
        onConfirm={async () => {
          if (!api) return
          setUi("deleting", voice.id)
          await api
            .deleteVoice(voice.id)
            .then(() => showToast({ variant: "success", title: language.t("settings.voices.voice.delete.success") }))
            .catch(() => showToast({ variant: "error", title: language.t("settings.voices.voice.delete.failed") }))
          setUi("deleting", "")
          void refetch()
        }}
      />
    ))

  const probe = async (voice: VoiceInfo) => {
    if (isVoiceSpeaking(voiceKey(voice.id))) {
      stopSpeaking()
      return
    }
    // This voice and no other: a failure is reported instead of silently playing the system voice.
    const error = await speakWithVoices(voiceKey(voice.id), language.t("settings.voices.sample.text"), voice.id, {
      engine: "local",
    })
    if (error) showToast({ variant: "error", title: language.t("settings.voices.voice.probe.failed"), description: error })
  }

  const engineLabel = (voice: VoiceInfo) =>
    voice.engine === "kokoro-es"
      ? language.t("settings.voices.voice.engine.kokoroEs")
      : voice.engine === "piper"
        ? language.t("settings.voices.voice.engine.piper")
        : voice.engine

  const speechHint = () =>
    settings.general.autoSpeak()
      ? language.t("settings.voices.hint.speech.on", { engine: language.t(`settings.voices.engine.${getVoiceEngineMode()}`) })
      : language.t("settings.voices.hint.speech.off")

  return (
    <>
      <SettingsHubHeader
        icon="speech-bubble"
        glyph={<SpeakerGlyph />}
        title={language.t("settings.voices.title")}
        description={language.t("settings.voices.description")}
        value={ui.section}
        onChange={(section) => setUi("section", section)}
        sections={[
          {
            id: "microphone",
            label: language.t("settings.voices.section.microphone"),
            hint: currentMic()?.label ?? "",
            icon: "speech-bubble",
            glyph: <MicGlyph />,
          },
          {
            id: "speech",
            label: language.t("settings.voices.section.speech"),
            hint: speechHint(),
            icon: "speech-bubble",
            glyph: <SpeakerGlyph />,
          },
          {
            id: "voices",
            label: language.t("settings.voices.section.voices"),
            hint: api
              ? language.t("settings.voices.hint.voices", { count: downloadedCount(), total: voices().length })
              : language.t("settings.voices.hint.desktop"),
            icon: "speech-bubble",
            glyph: <WaveGlyph />,
          },
        ]}
      />

      <div class="settings-v2-tab-body settings-v2-voices">
        <Show when={ui.section === "microphone"}>
          <div class="settings-v2-section">
            <h3 class="settings-v2-section-title">{language.t("settings.voices.mic.title")}</h3>
            <SettingsListV2>
              <SettingsRowV2 title={language.t("settings.voices.mic.device")} description={language.t("settings.voices.mic.description")}>
                <div class="settings-v2-voices-inline">
                  <SelectV2
                    appearance="inline"
                    options={micOptions()}
                    current={currentMic()}
                    value={(option) => option.id}
                    label={(option) => option.label}
                    placement="bottom-end"
                    gutter={6}
                    onSelect={(option) => option && selectMic(option.id)}
                  />
                  <ButtonV2 variant="ghost" size="small" onClick={() => void refreshDevices()}>
                    {language.t("settings.voices.mic.refresh")}
                  </ButtonV2>
                </div>
              </SettingsRowV2>
            </SettingsListV2>
            <MicTester selectedDeviceId={ui.mic} active={props.active} />
          </div>

          <div class="settings-v2-section">
            <h3 class="settings-v2-section-title">{language.t("settings.voices.section.dictation")}</h3>
            <SettingsListV2>
              <SettingsRowV2
                title={language.t("chat.mic.holdToRecord")}
                description={language.t("settings.voices.dictation.hold.description")}
              >
                <Switch
                  checked={ui.hold}
                  onChange={(value) => {
                    setHoldToRecord(value)
                    setUi("hold", value)
                  }}
                  hideLabel
                >
                  {language.t("chat.mic.holdToRecord")}
                </Switch>
              </SettingsRowV2>
              <SettingsRowV2
                title={language.t("settings.voices.dictation.shortcut.title")}
                description={language.t("settings.voices.dictation.shortcut.description")}
              >
                <kbd class="settings-v2-voices-kbd">{command.keybind("voice.dictation") || "—"}</kbd>
              </SettingsRowV2>
              <SettingsRowV2
                title={language.t("settings.voices.dictation.dictionary.title")}
                description={language.t("settings.voices.dictation.dictionary.hint")}
              >
                <ButtonV2 variant="outline" size="small" icon="plus" onClick={() => setUi("adding", true)}>
                  {language.t("settings.voices.dictation.dictionary.add")}
                </ButtonV2>
              </SettingsRowV2>
              <Show when={ui.adding || ui.words.length > 0}>
                <div class="settings-v2-voices-words">
                  <For each={ui.words}>
                    {(word) => (
                      <span class="settings-v2-voices-word">
                        {word}
                        <button
                          type="button"
                          class="settings-v2-voices-word-remove"
                          aria-label={`${language.t("settings.voices.dictation.dictionary.remove")}: ${word}`}
                          onClick={() => removeWord(word)}
                        >
                          ×
                        </button>
                      </span>
                    )}
                  </For>
                  <Show when={ui.adding}>
                    <form
                      class="settings-v2-voices-word-form"
                      onSubmit={(event) => {
                        event.preventDefault()
                        addWord()
                      }}
                    >
                      <TextInputV2
                        autofocus
                        appearance="base"
                        value={ui.word}
                        placeholder={language.t("settings.voices.dictation.dictionary.placeholder")}
                        onInput={(event) => setUi("word", event.currentTarget.value)}
                        onKeyDown={(event) => {
                          if (event.key !== "Escape") return
                          event.stopPropagation()
                          setUi({ adding: false, word: "" })
                        }}
                      />
                      <ButtonV2 type="submit" variant="contrast" size="small">
                        {language.t("settings.voices.dictation.dictionary.save")}
                      </ButtonV2>
                      <ButtonV2 type="button" variant="ghost" size="small" onClick={() => setUi({ adding: false, word: "" })}>
                        {language.t("settings.voices.dictation.dictionary.cancel")}
                      </ButtonV2>
                    </form>
                  </Show>
                </div>
              </Show>
              <SettingsRowV2
                title={language.t("settings.voices.dictation.recordings.title")}
                description={language.t("settings.voices.dictation.recordings.description")}
              >
                <div class="settings-v2-voices-inline">
                  <span class="settings-v2-voices-count">
                    {language.t(
                      ui.recordings.length === 1
                        ? "settings.voices.dictation.recordings.count.one"
                        : "settings.voices.dictation.recordings.count.other",
                      { count: ui.recordings.length },
                    )}
                  </span>
                  <ButtonV2 variant="ghost" size="small" onClick={() => setUi("showRecordings", (value) => !value)}>
                    {language.t(
                      ui.showRecordings ? "settings.voices.dictation.recordings.hide" : "settings.voices.dictation.recordings.show",
                    )}
                  </ButtonV2>
                  <Show when={ui.recordings.length > 0}>
                    <ButtonV2
                      variant="ghost"
                      size="small"
                      onClick={() => {
                        clearRecentRecordings()
                        setUi("recordings", [])
                        showToast({ title: language.t("settings.voices.dictation.recordings.cleared.title") })
                      }}
                    >
                      {language.t("settings.voices.dictation.recordings.clear")}
                    </ButtonV2>
                  </Show>
                </div>
              </SettingsRowV2>
              <Show when={ui.showRecordings}>
                <ul class="settings-v2-voices-recordings">
                  <For
                    each={ui.recordings}
                    fallback={<li class="settings-v2-voices-empty">{language.t("settings.voices.dictation.recordings.empty")}</li>}
                  >
                    {(recording) => (
                      <li class="settings-v2-voices-recording">
                        <span class="settings-v2-voices-recording-text" title={recording.text}>
                          {recording.text}
                        </span>
                        <span class="settings-v2-voices-recording-meta">
                          {recording.durationSeconds ? `${recording.durationSeconds} s · ` : ""}
                          {new Date(recording.timestamp).toLocaleTimeString(language.intl(), { hour: "2-digit", minute: "2-digit" })}
                        </span>
                        <ButtonV2 variant="ghost" size="small" onClick={() => copyRecording(recording.text)}>
                          {language.t("settings.voices.dictation.recordings.copy")}
                        </ButtonV2>
                      </li>
                    )}
                  </For>
                </ul>
              </Show>
            </SettingsListV2>
          </div>
        </Show>

        <Show when={ui.section === "speech"}>
          <div class="settings-v2-voices-hero" data-active={settings.general.autoSpeak() ? "" : undefined}>
            <span class="settings-v2-voices-hero-icon" aria-hidden="true">
              <SpeakerGlyph />
            </span>
            <div class="settings-v2-voices-hero-copy">
              <span class="settings-v2-voices-hero-title">{language.t("settings.voices.autoSpeak.title")}</span>
              <span class="settings-v2-voices-hero-description">{language.t("settings.voices.autoSpeak.description")}</span>
            </div>
            <Switch checked={settings.general.autoSpeak()} onChange={toggleAutoSpeak} hideLabel>
              {language.t("settings.voices.autoSpeak.title")}
            </Switch>
          </div>

          <div class="settings-v2-section">
            <h3 class="settings-v2-section-title">{language.t("settings.voices.engine.title")}</h3>
            <SettingsListV2>
              <div class="settings-v2-voices-engine">
                <SegmentedControlV2
                  class="settings-v2-voices-segmented"
                  value={getVoiceEngineMode()}
                  onChange={(value) => {
                    const mode = ENGINES.find((engine) => engine === value)
                    if (mode) setVoiceEngineMode(mode)
                  }}
                  aria-label={language.t("settings.voices.engine.title")}
                >
                  <For each={ENGINES}>
                    {(engine) => (
                      <SegmentedControlItemV2 value={engine}>{language.t(`settings.voices.engine.${engine}`)}</SegmentedControlItemV2>
                    )}
                  </For>
                </SegmentedControlV2>
                <p class="settings-v2-voices-engine-hint">{engineHint(getVoiceEngineMode())}</p>
              </div>
              <SettingsRowV2 title={language.t("settings.voices.speed.title")} description={language.t("settings.voices.speed.description")}>
                <SegmentedControlV2
                  class="settings-v2-voices-segmented"
                  value={String(getVoiceSpeed())}
                  onChange={(value) => value && setVoiceSpeed(Number(value))}
                  aria-label={language.t("settings.voices.speed.title")}
                >
                  <For each={SPEEDS}>{(speed) => <SegmentedControlItemV2 value={String(speed)}>{speed}×</SegmentedControlItemV2>}</For>
                </SegmentedControlV2>
              </SettingsRowV2>
              <SettingsRowV2 title={language.t("settings.voices.volume.title")} description={language.t("settings.voices.volume.description")}>
                <SegmentedControlV2
                  class="settings-v2-voices-segmented"
                  value={String(getVoiceVolume())}
                  onChange={(value) => value && setVoiceVolume(Number(value))}
                  aria-label={language.t("settings.voices.volume.title")}
                >
                  <For each={VOLUMES}>
                    {(volume) => <SegmentedControlItemV2 value={String(volume)}>{Math.round(volume * 100)} %</SegmentedControlItemV2>}
                  </For>
                </SegmentedControlV2>
              </SettingsRowV2>
              <Show when={getVoiceEngineMode() === "system"}>
                <SettingsRowV2 title={language.t("settings.voices.pitch.title")} description={language.t("settings.voices.pitch.description")}>
                  <SegmentedControlV2
                    class="settings-v2-voices-segmented"
                    value={String(getVoicePitch())}
                    onChange={(value) => value && setVoicePitch(Number(value))}
                    aria-label={language.t("settings.voices.pitch.title")}
                  >
                    <For each={PITCHES}>
                      {(pitch) => <SegmentedControlItemV2 value={String(pitch.value)}>{language.t(pitch.label)}</SegmentedControlItemV2>}
                    </For>
                  </SegmentedControlV2>
                </SettingsRowV2>
              </Show>
              <SettingsRowV2 title={language.t("settings.voices.bargeIn.title")} description={language.t("settings.voices.bargeIn.description")}>
                <Switch checked={getBargeInEnabled()} onChange={setBargeInEnabled} hideLabel>
                  {language.t("settings.voices.bargeIn.title")}
                </Switch>
              </SettingsRowV2>
              <SettingsRowV2 title={language.t("settings.voices.sample.title")} description={language.t("settings.voices.sample.description")}>
                <ButtonV2 variant={isVoiceSpeaking(SAMPLE_KEY) ? "contrast" : "outline"} size="small" onClick={() => void playSample()}>
                  {language.t(isVoiceSpeaking(SAMPLE_KEY) ? "settings.voices.voice.speaking" : "settings.voices.sample.play")}
                </ButtonV2>
              </SettingsRowV2>
            </SettingsListV2>
          </div>

          <Show when={getVoiceEngineMode() !== "system"}>
            <div class="settings-v2-section">
              <h3 class="settings-v2-section-title">Fish Audio</h3>
              <SettingsListV2>
                <SettingsRowV2 title={language.t("settings.voices.fish.key.title")} description={language.t("settings.voices.fish.key.description")}>
                  <div class="settings-v2-voices-inline settings-v2-voices-key">
                    <TextInputV2
                      appearance="base"
                      type={ui.revealKey ? "text" : "password"}
                      value={getFishAudioKey()}
                      placeholder={language.t("settings.voices.fish.key.placeholder")}
                      onInput={(event) => setFishAudioKey(event.currentTarget.value)}
                      spellcheck={false}
                      autocomplete="off"
                      aria-label={language.t("settings.voices.fish.key.title")}
                    />
                    <ButtonV2 variant="ghost" size="small" onClick={() => setUi("revealKey", (value) => !value)}>
                      {language.t(ui.revealKey ? "settings.voices.fish.key.hide" : "settings.voices.fish.key.show")}
                    </ButtonV2>
                  </div>
                </SettingsRowV2>
                <SettingsRowV2 title={language.t("settings.voices.fish.voice.title")} description={language.t("settings.voices.fish.voice.description")}>
                  <div class="settings-v2-voices-inline">
                    <SelectV2
                      appearance="inline"
                      options={CURATED_FISH_VOICES}
                      current={CURATED_FISH_VOICES.find((voice) => voice.id === getFishAudioVoice()) ?? CURATED_FISH_VOICES[0]}
                      value={(voice) => voice.id}
                      label={(voice) => voice.name}
                      placement="bottom-end"
                      gutter={6}
                      onSelect={(voice) => voice && setFishAudioVoice(voice.id)}
                    />
                    <ButtonV2 variant="outline" size="small" disabled={!getFishAudioKey()} onClick={() => void probeFish()}>
                      {language.t(isVoiceSpeaking("voice:fish-sample") ? "settings.voices.voice.speaking" : "settings.voices.voice.probe")}
                    </ButtonV2>
                  </div>
                </SettingsRowV2>
              </SettingsListV2>
            </div>
          </Show>
        </Show>

        <Show when={ui.section === "voices"}>
          <Show when={api} fallback={<p class="settings-v2-voices-note">{language.t("settings.voices.desktopOnly")}</p>}>
            <Show when={getVoiceEngineMode() !== "auto"}>
              <div class="settings-v2-voices-note" data-tone="info">
                <span>{language.t("settings.voices.voices.modeNote")}</span>
                <ButtonV2 variant="outline" size="small" onClick={() => setVoiceEngineMode("auto")}>
                  {language.t("settings.voices.voices.useLocal")}
                </ButtonV2>
              </div>
            </Show>
            <Show when={status()?.error}>
              {(error) => <p class="settings-v2-voices-note" data-tone="error">{error()}</p>}
            </Show>
            <Show
              when={voices().length > 0}
              fallback={
                <p class="settings-v2-voices-note">
                  {language.t(status.loading ? "settings.voices.loading" : "settings.voices.voices.empty")}
                </p>
              }
            >
              <ul class="settings-v2-voices-grid">
                <For each={voices()}>
                  {(voice) => (
                    <li
                      class="settings-v2-voices-card"
                      data-selected={chosen() === voice.id ? "" : undefined}
                      data-unavailable={voice.supported ? undefined : ""}
                    >
                      <button
                        type="button"
                        class="settings-v2-voices-card-main"
                        role="radio"
                        aria-checked={chosen() === voice.id}
                        disabled={!voice.supported}
                        onClick={() => void selectVoice(voice)}
                      >
                        <span class="settings-v2-voices-radio" aria-hidden="true" />
                        <span class="settings-v2-voices-card-copy">
                          <span class="settings-v2-voices-card-name">{voice.name}</span>
                          <span class="settings-v2-voices-card-meta">
                            {[
                              language.t(voice.gender === "female" ? "settings.voices.gender.female" : "settings.voices.gender.male"),
                              voice.language.toUpperCase(),
                              engineLabel(voice),
                              ...(voice.sizeMb ? [language.t("settings.voices.voice.size", { size: voice.sizeMb })] : []),
                            ].join(" · ")}
                          </span>
                        </span>
                        <Show when={chosen() === voice.id}>
                          <span class="settings-v2-voices-pill" data-tone="accent">
                            {language.t(voice.downloaded ? "settings.voices.voice.inUse" : "settings.voices.voice.whenReady")}
                          </span>
                        </Show>
                      </button>
                      <div class="settings-v2-voices-card-foot">
                        <Show
                          when={!downloading(voice)}
                          fallback={
                            <div class="settings-v2-voices-progress" aria-label={language.t("settings.voices.voice.downloading")}>
                              <div class="settings-v2-voices-progress-track">
                                <div class="settings-v2-voices-progress-fill" style={{ width: `${ui.progress[voice.id] ?? 0}%` }} />
                              </div>
                              <span>{Math.round(ui.progress[voice.id] ?? 0)} %</span>
                            </div>
                          }
                        >
                          <Show
                            when={voice.downloaded}
                            fallback={
                              <ButtonV2 variant="outline" size="small" disabled={!voice.supported} onClick={() => void downloadVoice(voice)}>
                                {language.t("settings.voices.voice.download")}
                              </ButtonV2>
                            }
                          >
                            <span class="settings-v2-voices-installed">{language.t("settings.voices.voice.installed")}</span>
                            <Show when={voice.engine === "piper" || voice.engine === "kokoro-es"}>
                              <ButtonV2
                                variant="ghost"
                                size="small"
                                disabled={ui.deleting === voice.id}
                                onClick={() => deleteVoice(voice)}
                              >
                                {language.t("settings.voices.voice.delete")}
                              </ButtonV2>
                            </Show>
                          </Show>
                        </Show>
                        <ButtonV2
                          class="ml-auto"
                          variant={isVoiceSpeaking(voiceKey(voice.id)) ? "contrast" : "outline"}
                          size="small"
                          disabled={!voice.downloaded || ui.deleting === voice.id}
                          title={voice.downloaded ? undefined : language.t("settings.voices.voice.downloadFirst")}
                          onClick={() => void probe(voice)}
                        >
                          {language.t(isVoiceSpeaking(voiceKey(voice.id)) ? "settings.voices.voice.speaking" : "settings.voices.voice.probe")}
                        </ButtonV2>
                      </div>
                    </li>
                  )}
                </For>
              </ul>
            </Show>
          </Show>
        </Show>
      </div>
    </>
  )
}
