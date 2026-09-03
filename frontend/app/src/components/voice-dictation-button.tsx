import { createSignal, For, onCleanup, onMount, Show } from "solid-js"
import { useLanguage } from "@/context/language"
import { showToast } from "@/utils/toast"
import { getSpeechRecognition, speechRecognitionLang, type SpeechRecognitionLike } from "@/utils/voices"
import {
  asrAPI,
  getAudioInputDevices,
  getSelectedAudioDeviceId,
  onAudioDeviceChange,
  setSelectedAudioDeviceId,
  startLocalDictation,
} from "@/utils/asr"
import { ContextMenu } from "@tiancode-ai/ui/context-menu"

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

// Microphone button for the chat composer. Uses the Web Speech API when the
// platform exposes it (browser), otherwise streams the mic to the local
// sherpa-onnx recognizer in the desktop main process. It never submits
// automatically so the user can review the transcript before sending.
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

  onMount(() => {
    void refreshDevices()
    const cleanupListener = onAudioDeviceChange(() => {
      void refreshDevices()
    })
    onCleanup(cleanupListener)
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

      // 1. Electron Desktop: dictado local offline con sherpa-onnx / Whisper (proceso principal)
      const api = asrAPI()
      if (api) {
        const status = await api.status().catch(() => undefined)
        if (status && !status.ready && !status.downloading) {
          setPreparing(true)
          showToast({ variant: "default", title: language.t("chat.mic.downloading") })
          try {
            await api.ensure()
            showToast({ variant: "success", title: language.t("chat.mic.downloaded") })
          } catch {
            showToast({
              variant: "error",
              title: language.t("chat.mic.error"),
              description: language.t("chat.mic.downloadFailed"),
            })
            setPreparing(false)
            return
          }
          setPreparing(false)
        }
        const locale = language.locale() === "es" ? "es" : "en"
        try {
          stopLocalRef = await startLocalDictation(
            locale,
            (text) => {
              props.onResult(text)
              stop()
            },
            (message) => {
              showToast({ variant: "error", title: language.t("chat.mic.error"), description: message })
              stop()
            },
            selectedDeviceId() || undefined,
          )
          if (disposed) {
            stop()
            return
          }
          setListening(true)
        } catch (error) {
          showToast({
            variant: "error",
            title: language.t("chat.mic.error"),
            description: error instanceof Error ? error.message : String(error),
          })
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
          if (transcript) props.onResult(transcript.trim())
          stop()
        }
        rec.onerror = (event) => {
          if (event.error !== "aborted" && event.error !== "no-speech") {
            const desc = event.error === "network" ? "Servicio de voz no disponible o sin conexión" : event.error
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
    if (preparing()) return language.t("chat.mic.downloading")
    const activeMic = selectedDeviceId() ? devices().find((d) => d.deviceId === selectedDeviceId())?.label : null
    const hint = language.locale() === "es" ? "(Clic derecho: elegir micrófono PC)" : "(Right-click: select PC mic)"
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
        <MicIcon class="size-4" />
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
              <span class="ml-2 font-bold text-sky-400">✓</span>
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
                const label = () => device.label || `Micrófono ${index() + 1}`
                const isCurrent = () => selectedDeviceId() === device.deviceId
                return (
                  <ContextMenu.Item onSelect={() => handleSelectDevice(device.deviceId)}>
                    <span class="flex-1 truncate" title={label()}>
                      {label()}
                    </span>
                    <Show when={isCurrent()}>
                      <span class="ml-2 font-bold text-sky-400">✓</span>
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

