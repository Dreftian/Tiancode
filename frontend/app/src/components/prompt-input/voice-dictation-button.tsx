import { createSignal, For, onCleanup, onMount, Show } from "solid-js"
import { createStore } from "solid-js/store"
import { useLanguage } from "@/context/language"
import { showToast } from "@/utils/toast"
import { getSpeechRecognition, speechRecognitionLang, type SpeechRecognitionLike } from "@/utils/voices"
import {
  asrAPI,
  asrLanguageForLocale,
  DictationError,
  getAudioInputDevices,
  getSelectedAudioDeviceId,
  onAudioDeviceChange,
  setSelectedAudioDeviceId,
  startLocalDictation,
  applyDictationDictionary,
  addRecentRecording,
  type AsrErrorCode,
} from "@/utils/asr"
import { MenuV2 } from "@tiancode-ai/ui/v2/menu-v2"
import { AudioWaveform } from "@/components/visualization/audio-waveform"

// Shared with the composer, which draws the Claude-style listening strip over the editor.
export const [dictationState, setDictationState] = createStore({ listening: false, transcribing: false, level: 0 })

export function DictationOverlay() {
  const language = useLanguage()
  return (
    <div class="dictation-overlay" data-transcribing={dictationState.transcribing || undefined} role="status" aria-live="polite">
      <span class="dictation-overlay-dot" aria-hidden="true" />
      <AudioWaveform
        active={dictationState.listening}
        level={dictationState.listening ? dictationState.level : undefined}
        barsCount={18}
        height={22}
        class="dictation-overlay-wave"
      />
      <span class="dictation-overlay-text">
        {dictationState.transcribing ? language.t("chat.mic.transcribing") : language.t("chat.mic.listening")}
      </span>
    </div>
  )
}

// Mic icon rendered inline; the icon set has no microphone.
export function MicIcon(props: { class?: string }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true" class={props.class}>
      <rect x="5.5" y="1.5" width="5" height="9" rx="2.5" stroke="currentColor" />
      <path
        d="M3.5 7.5C3.5 9.98528 5.51472 12 8 12C10.4853 12 12.5 9.98528 12.5 7.5M8 12V14.5M5.5 14.5H10.5"
        stroke="currentColor"
        stroke-linecap="square"
      />
    </svg>
  )
}

// Microphone button for the chat composer. On the desktop it streams the mic
// to the local sherpa-onnx recognizer (a utilityProcess, see asr-worker.ts);
// the Web Speech API branch below only runs on the web build, where the
// preload does not define window.api.asr. It never submits automatically so
// the user can review the transcript before sending.
// Right-click opens the PC microphone selector to choose between detected audio inputs.
export function VoiceDictationButton(props: {
  class?: string
  listeningClass?: string
  ariaLabel: string
  listeningLabel: string
  onResult: (text: string) => void
}) {
  const language = useLanguage()
  const [listening, setListening] = createSignal(false)
  const [preparing, setPreparing] = createSignal(false)
  const [downloadPercent, setDownloadPercent] = createSignal(0)
  const [devices, setDevices] = createSignal<MediaDeviceInfo[]>([])
  const [selectedDeviceId, setSelectedDeviceIdState] = createSignal<string | null>(getSelectedAudioDeviceId())
  const [recording, setRecording] = createStore({
    hold: localStorage.getItem("tiancode.audio.hold_to_record") === "true",
    pressed: false,
    menuOpen: false,
    initializing: false,
    transcribing: false,
    level: 0,
  })

  let recognition: SpeechRecognitionLike | undefined
  let stopLocalRef: (() => void) | undefined
  let starting = false
  let disposed = false
  let generation = 0

  const refreshDevices = async () => {
    try {
      const mics = await getAudioInputDevices()
      setDevices(mics)
    } catch {
      setDevices([])
    }
  }

  // El modelo NO se descarga al montar. Abrir una sesión traía 146 MB de pesos
  // de Whisper sin avisar; ahora start() los pide en el primer clic, con
  // consentimiento y progreso.
  onMount(() => {
    void refreshDevices()
    const cleanupListener = onAudioDeviceChange(() => {
      void refreshDevices()
    })

    const toggleListener = () => {
      if (listening()) {
        stop()
      } else {
        void start()
      }
    }
    window.addEventListener("tiancode:voice-dictation-toggle", toggleListener)

    const micListener = (event: Event) => {
      const customEvent = event as CustomEvent<{ deviceId: string | null }>
      setSelectedDeviceIdState(customEvent.detail?.deviceId ?? getSelectedAudioDeviceId())
    }
    window.addEventListener("tiancode:microphone-changed", micListener)
    const releaseHold = () => {
      if (recording.pressed) stop()
    }
    window.addEventListener("pointerup", releaseHold)
    window.addEventListener("pointercancel", releaseHold)
    window.addEventListener("blur", releaseHold)

    onCleanup(() => {
      cleanupListener()
      window.removeEventListener("tiancode:voice-dictation-toggle", toggleListener)
      window.removeEventListener("tiancode:microphone-changed", micListener)
      window.removeEventListener("pointerup", releaseHold)
      window.removeEventListener("pointercancel", releaseHold)
      window.removeEventListener("blur", releaseHold)
    })
  })

  const stop = () => {
    generation++
    setRecording("pressed", false)
    recognition?.stop()
    recognition = undefined
    const stopLocal = stopLocalRef
    stopLocalRef = undefined
    if (stopLocal) void stopLocal()
    setListening(false)
    setDictationState({ listening: false, level: 0 })
  }

  onCleanup(() => {
    disposed = true
    stop()
  })

  const handleSelectDevice = (deviceId: string | null) => {
    setSelectedAudioDeviceId(deviceId)
    setSelectedDeviceIdState(deviceId)
    showToast({
      variant: "default",
      title: language.t("chat.mic.selectDevice") ?? "Micrófono seleccionado",
      description: deviceId
        ? devices().find((d) => d.deviceId === deviceId)?.label || language.t("chat.mic.devices")
        : (language.t("chat.mic.defaultDevice") ?? "Predeterminado del sistema"),
    })
  }

  const errorText = (code: AsrErrorCode) => {
    switch (code) {
      case "no-devices":
        return language.t("chat.mic.noDevices")
      case "no-speech":
        return language.t("chat.mic.error.noSpeech")
      case "not-recording":
        return language.t("chat.mic.error.notRecording")
      default:
        return language.t("chat.mic.error.engine")
    }
  }

  const reportError = (code: AsrErrorCode, detail?: string) => {
    if (detail) console.warn("[dictation]", code, detail)
    showToast({
      variant: "error",
      title: language.t("chat.mic.error"),
      description: detail ? `${errorText(code)} (${detail})` : errorText(code),
    })
  }

  const start = async () => {
    if (starting || listening() || recording.transcribing) return
    starting = true
    setRecording("initializing", true)
    const request = ++generation
    const cancelled = () => disposed || request !== generation
    try {
      // 0. Detectar dispositivos de audio en la PC
      await refreshDevices()
      if (cancelled()) return
      if (devices().length === 0) {
        showToast({
          variant: "error",
          title: language.t("chat.mic.error"),
          description: language.t("chat.mic.noDevices") ?? "No se detectó ningún micrófono conectado a la PC.",
        })
        return
      }

      // 1. Electron Desktop: dictado local offline con sherpa-onnx / Whisper
      const api = asrAPI()
      if (api) {
        const status = await api.status().catch(() => undefined)
        if (cancelled()) return
        if (!status) {
          reportError("engine-failed")
          return
        }
        if (!status.ready && !status.downloading) {
          // La primera vez hay que bajarse el modelo entero: se pide permiso
          // antes de gastar los megas y se enseña el progreso, si no el botón
          // parece colgado durante toda la descarga.
          if (!window.confirm(language.t("chat.mic.confirmDownload", { size: status.sizeMb }))) return
          setPreparing(true)
          setDownloadPercent(0)
          const unsubscribe = api.onProgress((event) => setDownloadPercent(event.progress))
          try {
            await api.ensure(asrLanguageForLocale(language.locale()))
            showToast({ variant: "default", title: language.t("chat.mic.downloaded") })
          } catch {
            showToast({
              variant: "error",
              title: language.t("chat.mic.error"),
              description: language.t("chat.mic.downloadFailed"),
            })
            return
          } finally {
            unsubscribe()
            setPreparing(false)
            setDownloadPercent(0)
          }
          if (cancelled()) return
        }
        try {
          stopLocalRef = await startLocalDictation({
            language: asrLanguageForLocale(language.locale()),
            deviceId: selectedDeviceId() || undefined,
            onResult: (text) => {
              if (disposed) return
              setRecording("transcribing", false)
              setDictationState("transcribing", false)
              props.onResult(text)
              stop()
            },
            onError: (code, detail) => {
              if (disposed) return
              setRecording("transcribing", false)
              setDictationState("transcribing", false)
              reportError(code, detail)
              stop()
            },
            onLevel: (level) => {
              if (disposed) return
              setRecording("level", level)
              setDictationState("level", level)
            },
            onTranscribing: () => {
              if (disposed) return
              setListening(false)
              setRecording("transcribing", true)
              setDictationState({ listening: false, transcribing: true })
            },
            onLimit: (seconds) => {
              showToast({
                variant: "default",
                title: language.t("chat.mic.limitReached", { seconds }),
              })
            },
          })
          if (cancelled()) {
            stop()
            return
          }
          setListening(true)
          setDictationState({ listening: true, transcribing: false, level: 0 })
        } catch (error) {
          reportError(
            error instanceof DictationError ? error.code : "engine-failed",
            error instanceof DictationError ? undefined : error instanceof Error ? error.message : String(error),
          )
        }
        return
      }

      // 2. Web Browser: Web Speech API
      const Ctor = getSpeechRecognition()
      if (Ctor) {
        const rec = new Ctor()
        recognition = rec
        rec.lang = speechRecognitionLang(language.locale())
        rec.continuous = false
        rec.interimResults = false
        rec.onresult = (event) => {
          if (disposed) return
          const transcript = event.results[0]?.[0]?.transcript
          if (transcript) {
            const processed = applyDictationDictionary(transcript.trim())
            addRecentRecording({ text: processed })
            props.onResult(processed)
          }
          stop()
        }
        rec.onerror = (event) => {
          if (event.error !== "aborted" && event.error !== "no-speech") {
            const desc = event.error === "network" ? language.t("chat.mic.error.unavailable") : event.error
            showToast({ variant: "error", title: language.t("chat.mic.error"), description: desc })
          }
          stop()
        }
        rec.onend = () => {
          recognition = undefined
          setListening(false)
        }
        setListening(true)
        setDictationState({ listening: true, transcribing: false, level: 0 })
        rec.start()
        return
      }

      showToast({ variant: "error", title: language.t("chat.mic.error") })
    } finally {
      starting = false
      setRecording("initializing", false)
    }
  }

  const toggle = (e: MouseEvent) => {
    // Si fue clic izquierdo (botón 0)
    if (e.button !== 0) return
    if (recording.hold) return
    if (listening()) {
      stop()
      return
    }
    void start()
  }

  const tooltipTitle = () => {
    if (recording.transcribing) return language.t("chat.mic.transcribing")
    if (listening()) return props.listeningLabel
    if (preparing())
      return downloadPercent() > 0
        ? language.t("chat.mic.downloadingPercent", { percent: downloadPercent() })
        : language.t("chat.mic.downloading")
    if (recording.initializing) return language.t("chat.mic.preparing")
    const activeMic = selectedDeviceId() ? devices().find((d) => d.deviceId === selectedDeviceId())?.label : null
    const hint = recording.hold ? language.t("chat.mic.holdToRecord") : language.t("chat.mic.devices")
    return activeMic ? `${props.ariaLabel} [${activeMic}] ${hint}` : `${props.ariaLabel} ${hint}`
  }

  return (
    <div class="inline-flex items-center gap-0.5">
      <button
        type="button"
        aria-label={tooltipTitle()}
        title={tooltipTitle()}
        disabled={preparing() || recording.transcribing}
        classList={{
          [props.class ?? ""]: !!props.class,
          [props.listeningClass ?? ""]: !!props.listeningClass && listening(),
        }}
        data-listening={listening() || undefined}
        aria-busy={recording.initializing || preparing()}
        onClick={toggle}
        aria-pressed={listening()}
        onContextMenu={(event) => {
          event.preventDefault()
          setRecording("menuOpen", true)
        }}
        onPointerDown={(event) => {
          if (!recording.hold || event.button !== 0) return
          event.preventDefault()
          event.currentTarget.setPointerCapture(event.pointerId)
          setRecording("pressed", true)
          void start()
        }}
        onPointerUp={() => recording.pressed && stop()}
        onPointerCancel={() => recording.pressed && stop()}
        onLostPointerCapture={() => recording.pressed && stop()}
        onKeyDown={(event) => {
          if (!recording.hold || ![" ", "Enter"].includes(event.key)) return
          event.preventDefault()
          if (event.repeat) return
          setRecording("pressed", true)
          void start()
        }}
        onKeyUp={(event) => {
          if (!recording.hold || ![" ", "Enter"].includes(event.key)) return
          event.preventDefault()
          stop()
        }}
        onBlur={() => recording.pressed && stop()}
      >
        <Show
          when={listening()}
          fallback={
            <Show when={preparing()} fallback={<MicIcon class={`size-4 ${recording.transcribing ? "animate-pulse" : ""}`} />}>
              <span class="text-[10px] font-mono tabular-nums">{downloadPercent()}%</span>
            </Show>
          }
        >
          <div class="inline-flex items-center gap-1.5 px-1 py-0.5 rounded-md bg-red-500/10 border border-red-500/25">
            <span class="relative flex h-2 w-2">
              <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
              <span class="relative inline-flex rounded-full h-2 w-2 bg-red-500" />
            </span>
            <AudioWaveform active={true} level={asrAPI() ? recording.level : undefined} barsCount={8} height={14} class="w-8 h-3.5" />
          </div>
        </Show>
      </button>
      <MenuV2
        open={recording.menuOpen}
        onOpenChange={(open) => {
          setRecording("menuOpen", open)
          if (open) void refreshDevices()
        }}
      >
        <MenuV2.Trigger
          class="flex h-7 w-3 items-center justify-center rounded text-v2-icon-icon-muted hover:bg-v2-overlay-simple-overlay-hover"
          aria-label={language.t("chat.mic.devices")}
        >
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
            <path d="m2 4 3 3 3-3" stroke="currentColor" />
          </svg>
        </MenuV2.Trigger>
        <MenuV2.Portal>
          <MenuV2.Content class="min-w-[220px] max-w-[340px] text-xs">
            <div class="px-2 py-1 text-[11px] font-semibold text-v2-text-text-muted select-none">
              {language.t("chat.mic.devices") ?? "Micrófonos de la PC"} ({devices().length})
            </div>
            <MenuV2.Separator />
            <MenuV2.Item disabled={!asrAPI()} onSelect={() => handleSelectDevice(null)}>
              <span class="flex-1 truncate">
                {language.t("chat.mic.defaultDevice") ?? "Predeterminado del sistema"}
              </span>
              <Show when={selectedDeviceId() === null}>
                <span class="ml-2 font-bold text-v2-text-text-accent">✓</span>
              </Show>
            </MenuV2.Item>
            <MenuV2.Separator />
            <Show
              when={devices().length > 0}
              fallback={
                <div class="px-2 py-1.5 text-[11px] text-v2-text-text-muted italic">
                  {language.t("chat.mic.noDevices") ?? "No se detectaron micrófonos"}
                </div>
              }
            >
              <For each={devices()}>
                {(device, index) => {
                  const label = () => device.label || language.t("chat.mic.device.fallback", { index: index() + 1 })
                  const isCurrent = () => selectedDeviceId() === device.deviceId
                  return (
                    <MenuV2.Item disabled={!asrAPI()} onSelect={() => handleSelectDevice(device.deviceId)}>
                      <span class="flex-1 truncate" title={label()}>
                        {label()}
                      </span>
                      <Show when={isCurrent()}>
                        <span class="ml-2 font-bold text-v2-text-text-accent">✓</span>
                      </Show>
                    </MenuV2.Item>
                  )
                }}
              </For>
            </Show>
            <Show when={!asrAPI()}>
              <p class="px-2 py-1 text-v2-text-text-muted">{language.t("chat.mic.browserDevice")}</p>
            </Show>
            <MenuV2.Separator />
            <MenuV2.CheckboxItem
              checked={recording.hold}
              onChange={(value) => {
                stop()
                setRecording("hold", value)
                localStorage.setItem("tiancode.audio.hold_to_record", String(value))
              }}
            >
              {language.t("chat.mic.holdToRecord")}
            </MenuV2.CheckboxItem>
          </MenuV2.Content>
        </MenuV2.Portal>
      </MenuV2>
    </div>
  )
}
