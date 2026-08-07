import { createSignal } from "solid-js"
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
  let recognition: SpeechRecognitionLike | undefined
  let stopLocal: (() => void) | undefined

  const stop = () => {
    recognition?.stop()
    recognition = undefined
    if (stopLocal) {
      void stopLocal()
      stopLocal = undefined
    }
    setListening(false)
  }

  const start = async () => {
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
    const status = await api.status().catch(() => undefined)
    if (status && !status.ready && !status.downloading) {
      showToast({ variant: "info", title: language.t("chat.mic.downloading") })
    }
    const locale = language.locale() === "es" ? "es" : "en"
    try {
      stopLocal = await startLocalDictation(
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
      setListening(true)
    } catch (error) {
      showToast({
        variant: "error",
        title: language.t("chat.mic.error"),
        description: error instanceof Error ? error.message : String(error),
      })
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
      aria-label={listening() ? props.listeningLabel : props.ariaLabel}
      title={listening() ? props.listeningLabel : props.ariaLabel}
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
