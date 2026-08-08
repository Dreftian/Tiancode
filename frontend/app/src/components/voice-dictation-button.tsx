import { createSignal, onCleanup } from "solid-js"
import { useLanguage } from "@/context/language"
import { showToast } from "@/utils/toast"
import { getSpeechRecognition, speechRecognitionLang, type SpeechRecognitionLike } from "@/utils/voices"
import { asrAPI, startLocalDictation } from "@/utils/asr"

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
  let recognition: SpeechRecognitionLike | undefined
  // Ref al último dictado local iniciado: parar siempre apunta al activo.
  let stopLocalRef: (() => void) | undefined
  // Arranque en curso (entre clics y la asignación de stopLocalRef): dos clics
  // rápidos no deben iniciar dos capturas de micrófono, porque el segundo
  // sobrescribiría el stop del primero y su stream quedaría grabando para
  // siempre (chunks intercalados en la misma grabación del proceso principal).
  let starting = false
  let disposed = false

  const stop = () => {
    recognition?.stop()
    recognition = undefined
    const stopLocal = stopLocalRef
    stopLocalRef = undefined
    if (stopLocal) void stopLocal()
    setListening(false)
  }

  // Si el compositor se desmonta con el dictado activo (o arrancando) hay que
  // detener la captura: si no, el indicador del micrófono del SO y el envío de
  // chunks por IPC seguirían activos sin dueño.
  onCleanup(() => {
    disposed = true
    stop()
  })

  const start = async () => {
    if (starting || listening()) return
    starting = true
    try {
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
            showToast({ variant: "error", title: language.t("chat.mic.error"), description: event.error })
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
      // Electron: dictado local con sherpa-onnx (proceso principal).
      const api = asrAPI()
      if (!api) {
        showToast({ variant: "error", title: language.t("chat.mic.error") })
        return
      }
      // El modelo Whisper (~100 MB) se descarga bajo demanda; hacerlo aquí da
      // feedback al usuario en vez de dejarle esperando en silencio al parar.
      const status = await api.status().catch(() => undefined)
      if (status && !status.ready && !status.downloading) {
        setPreparing(true)
        showToast({ variant: "default", title: language.t("chat.mic.downloading") })
        try {
          await api.ensure()
          showToast({ variant: "success", title: language.t("chat.mic.downloaded") })
        } catch {
          // El detalle técnico queda en el log del main; el toast explica cómo
          // resolverlo (la descarga del modelo necesita internet la primera vez).
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
        )
        if (disposed) {
          // El componente se desmontó mientras el dictado arrancaba: parar en
          // cuanto esté listo para no dejar el micrófono abierto.
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
    } finally {
      starting = false
    }
  }

  const toggle = () => {
    if (listening()) {
      stop()
      return
    }
    void start()
  }

  return (
    <button
      type="button"
      aria-label={listening() ? props.listeningLabel : preparing() ? language.t("chat.mic.downloading") : props.ariaLabel}
      title={listening() ? props.listeningLabel : preparing() ? language.t("chat.mic.downloading") : props.ariaLabel}
      disabled={preparing()}
      classList={{
        [props.class ?? ""]: !!props.class,
        [props.listeningClass ?? ""]: !!props.listeningClass && listening(),
      }}
      data-listening={listening() || undefined}
      onClick={toggle}
    >
      <MicIcon class="size-4" />
    </button>
  )
}
