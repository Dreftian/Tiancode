import { createSignal, For, onCleanup, onMount, Show } from "solid-js"
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
import { ContextMenu } from "@tiancode-ai/ui/context-menu"
import { AudioWaveform } from "@/components/visualization/audio-waveform"

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

  let recognition: SpeechRecognitionLike | undefined
  let stopLocalRef: (() => void) | undefined
  let starting = false
  let disposed = false

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

    onCleanup(() => {
      cleanupListener()
      window.removeEventListener("tiancode:voice-dictation-toggle", toggleListener)
      window.removeEventListener("tiancode:microphone-changed", micListener)
    })
  })

  const stop = () => {
    recognition?.stop()
    recognition = undefined
    const stopLocal = stopLocalRef
    stopLocalRef = undefined
    if (stopLocal) void stopLocal()
    setListening(false)
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

  const reportError = (code: AsrErrorCode) => {
    showToast({ variant: "error", title: language.t("chat.mic.error"), description: errorText(code) })
  }

  const start = async () => {
    if (starting || listening()) return
    starting = true
    try {
      // 0. Detectar dispositivos de audio en la PC
      await refreshDevices()
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
          if (disposed) return
        }
        try {
          stopLocalRef = await startLocalDictation({
            language: asrLanguageForLocale(language.locale()),
            deviceId: selectedDeviceId() || undefined,
            onResult: (text) => {
              props.onResult(text)
              stop()
            },
            onError: (code) => {
              reportError(code)
              stop()
            },
            onLimit: (seconds) => {
              showToast({
                variant: "default",
                title: language.t("chat.mic.limitReached", { seconds }),
              })
            },
          })
          if (disposed) {
            stop()
            return
          }
          setListening(true)
        } catch (error) {
          reportError(error instanceof DictationError ? error.code : "engine-failed")
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
            const desc =
              event.error === "network" ? language.t("chat.mic.error.unavailable") : event.error
            showToast({ variant: "error", title: language.t("chat.mic.error"), description: desc })
          }
          stop()
        }
        rec.onend = () => {
          recognition = undefined
          setListening(false)
        }
        setListening(true)
        rec.start()
        return
      }

      showToast({ variant: "error", title: language.t("chat.mic.error") })
    } finally {
      starting = false
    }
  }

  const toggle = (e: MouseEvent) => {
    // Si fue clic izquierdo (botón 0)
    if (e.button !== 0) return
    if (listening()) {
      stop()
      return
    }
    void start()
  }

  const tooltipTitle = () => {
    if (listening()) return props.listeningLabel
    if (preparing())
      return downloadPercent() > 0
        ? language.t("chat.mic.downloadingPercent", { percent: downloadPercent() })
        : language.t("chat.mic.downloading")
    const activeMic = selectedDeviceId() ? devices().find((d) => d.deviceId === selectedDeviceId())?.label : null
    const hint = language.t("chat.mic.hint.rightClick")
    return activeMic ? `${props.ariaLabel} [${activeMic}] ${hint}` : `${props.ariaLabel} ${hint}`
  }

  return (
    <ContextMenu onOpenChange={(open) => open && void refreshDevices()}>
      <ContextMenu.Trigger
        as="button"
        type="button"
        aria-label={tooltipTitle()}
        title={tooltipTitle()}
        disabled={preparing()}
        classList={{
          [props.class ?? ""]: !!props.class,
          [props.listeningClass ?? ""]: !!props.listeningClass && listening(),
        }}
        data-listening={listening() || undefined}
        onClick={toggle}
      >
        <Show
          when={listening()}
          fallback={
            <Show when={preparing()} fallback={<MicIcon class="size-4" />}>
              <span class="text-[10px] font-mono tabular-nums">{downloadPercent()}%</span>
            </Show>
          }
        >
          <div class="inline-flex items-center gap-1.5 px-1 py-0.5 rounded-md bg-red-500/10 border border-red-500/25">
            <span class="relative flex h-2 w-2">
              <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
              <span class="relative inline-flex rounded-full h-2 w-2 bg-red-500" />
            </span>
            <AudioWaveform active={true} barsCount={8} height={14} class="w-8 h-3.5" />
          </div>
        </Show>
      </ContextMenu.Trigger>
      <ContextMenu.Portal>
        <ContextMenu.Content class="min-w-[220px] max-w-[340px] text-xs">
          <div class="px-2 py-1 text-[11px] font-semibold text-v2-text-text-muted select-none">
            {language.t("chat.mic.devices") ?? "Micrófonos de la PC"} ({devices().length})
          </div>
          <ContextMenu.Separator />
          <ContextMenu.Item onSelect={() => handleSelectDevice(null)}>
            <span class="flex-1 truncate">
              {language.t("chat.mic.defaultDevice") ?? "Predeterminado del sistema"}
            </span>
            <Show when={selectedDeviceId() === null}>
              <span class="ml-2 font-bold text-v2-text-text-accent">✓</span>
            </Show>
          </ContextMenu.Item>
          <ContextMenu.Separator />
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
                  <ContextMenu.Item onSelect={() => handleSelectDevice(device.deviceId)}>
                    <span class="flex-1 truncate" title={label()}>
                      {label()}
                    </span>
                    <Show when={isCurrent()}>
                      <span class="ml-2 font-bold text-v2-text-text-accent">✓</span>
                    </Show>
                  </ContextMenu.Item>
                )
              }}
            </For>
          </Show>
        </ContextMenu.Content>
      </ContextMenu.Portal>
    </ContextMenu>
  )
}

